-- Migration 00165 — fix fn_merge_clients for client_relationships' coupled FK columns
--
-- WHY: fn_merge_clients (00162) discovers every FK column pointing at
-- clients(id) via information_schema, then updates them ONE COLUMN AT A TIME,
-- row by row, catching only unique_violation. That generic strategy is correct
-- for the 16 other tables, which each have a single, independent client FK.
-- client_relationships is the exception: it has THREE such columns —
-- client_id_a, client_id_b, and (as of 00164) primary_client_id — coupled by
-- two CHECK constraints:
--     client_relationships_ordered            CHECK (client_id_a < client_id_b)
--     client_relationships_primary_is_a_or_b  CHECK (primary_client_id IS NULL
--                                                    OR primary_client_id IN (client_id_a, client_id_b))
-- Updating any ONE of them transits an intermediate state that can violate a
-- CHECK. check_violation is not unique_violation, so 00162's handler does not
-- catch it: the exception propagates and aborts the ENTIRE merge.
--
-- Verified, not theorized: a temp-table repro of the exact one-column UPDATE
-- against the 00164 CHECK raises check_violation deterministically. The
-- `ordered` CHECK has the same exposure and PREDATES 00164 — merging a client
-- whose relationship row would re-sort a/b fails roughly half the time by UUID
-- ordering. That latent bug has never fired only because no spouse/partner
-- rows existed in production yet; the household-attribution feature is what
-- starts creating them, which is why this is fixed here rather than deferred.
--
-- FIX: exclude client_relationships from the generic loop and repoint all
-- three columns in ONE statement per row, normalizing a/b with LEAST/GREATEST
-- so `ordered` holds by construction. Rows that would collapse into a
-- self-relationship are deleted first; a row that would collide with an
-- existing pair falls back to delete-the-duplicate, matching the generic
-- loop's own unique_violation strategy.
--
-- Everything else is byte-identical to 00163's version of this function.

CREATE OR REPLACE FUNCTION fn_merge_clients(p_primary_id uuid, p_duplicate_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id    uuid;
  v_dup_id     uuid;
  v_fk         RECORD;
  v_row        RECORD;
  v_moved      integer := 0;
BEGIN
  IF p_duplicate_ids IS NULL OR array_length(p_duplicate_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'No duplicate clients supplied';
  END IF;
  IF p_primary_id = ANY(p_duplicate_ids) THEN
    RAISE EXCEPTION 'Primary client cannot also be listed as a duplicate';
  END IF;

  SELECT user_id INTO v_user_id
  FROM clients
  WHERE id = p_primary_id AND archived_at IS NULL;
  IF v_user_id IS NULL OR v_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Primary client not found or not owned by caller';
  END IF;

  IF EXISTS (
    SELECT 1 FROM unnest(p_duplicate_ids) AS d(id)
    WHERE NOT EXISTS (
      SELECT 1 FROM clients c
      WHERE c.id = d.id AND c.user_id = v_user_id AND c.archived_at IS NULL
    )
  ) THEN
    RAISE EXCEPTION 'One or more duplicate clients not found or not owned by caller';
  END IF;

  UPDATE clients
  SET email = COALESCE(clients.email, (
        SELECT email FROM clients c2
        WHERE c2.id = ANY(p_duplicate_ids) AND c2.email IS NOT NULL
        LIMIT 1
      )),
      phone = COALESCE(clients.phone, (
        SELECT phone FROM clients c2
        WHERE c2.id = ANY(p_duplicate_ids) AND c2.phone IS NOT NULL
        LIMIT 1
      ))
  WHERE id = p_primary_id;

  -- ── client_relationships: all three FK columns repointed together ────────
  -- Must run BEFORE the generic loop, which explicitly skips this table.

  -- A row with BOTH sides merging into the primary would become a
  -- self-relationship (violating client_relationships_no_self). Drop it.
  DELETE FROM client_relationships
  WHERE user_id = v_user_id
    AND (client_id_a = ANY(p_duplicate_ids) OR client_id_b = ANY(p_duplicate_ids))
    AND (CASE WHEN client_id_a = ANY(p_duplicate_ids) THEN p_primary_id ELSE client_id_a END)
      = (CASE WHEN client_id_b = ANY(p_duplicate_ids) THEN p_primary_id ELSE client_id_b END);

  -- Repoint the survivors. LEAST/GREATEST keeps client_id_a < client_id_b
  -- satisfied at every point, and primary_client_id is repointed in the SAME
  -- statement so it is never transiently outside (client_id_a, client_id_b).
  FOR v_row IN
    SELECT id,
      LEAST(
        CASE WHEN client_id_a = ANY(p_duplicate_ids) THEN p_primary_id ELSE client_id_a END,
        CASE WHEN client_id_b = ANY(p_duplicate_ids) THEN p_primary_id ELSE client_id_b END
      ) AS new_a,
      GREATEST(
        CASE WHEN client_id_a = ANY(p_duplicate_ids) THEN p_primary_id ELSE client_id_a END,
        CASE WHEN client_id_b = ANY(p_duplicate_ids) THEN p_primary_id ELSE client_id_b END
      ) AS new_b,
      CASE WHEN primary_client_id = ANY(p_duplicate_ids) THEN p_primary_id ELSE primary_client_id END AS new_primary
    FROM client_relationships
    WHERE user_id = v_user_id
      AND (client_id_a = ANY(p_duplicate_ids)
        OR client_id_b = ANY(p_duplicate_ids)
        OR primary_client_id = ANY(p_duplicate_ids))
  LOOP
    BEGIN
      UPDATE client_relationships
      SET client_id_a       = v_row.new_a,
          client_id_b       = v_row.new_b,
          primary_client_id = v_row.new_primary
      WHERE id = v_row.id;
      v_moved := v_moved + 1;
    EXCEPTION WHEN unique_violation THEN
      -- The primary already has an equivalent link to this same other party —
      -- the duplicate's row is redundant. Same strategy as the generic loop.
      DELETE FROM client_relationships WHERE id = v_row.id;
    END;
  END LOOP;

  -- ── Generic FK reassignment for every OTHER table ────────────────────────
  -- Discovered via information_schema so a future table with a client FK is
  -- picked up with zero changes here. client_relationships is excluded: its
  -- three coupled columns are handled above and CANNOT be updated one at a
  -- time without tripping a CHECK.
  FOR v_fk IN
    SELECT tc.table_name, kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
      AND ccu.table_name = 'clients'
      AND ccu.column_name = 'id'
      AND tc.table_name NOT IN ('clients', 'client_relationships')
  LOOP
    FOREACH v_dup_id IN ARRAY p_duplicate_ids LOOP
      FOR v_row IN EXECUTE format(
        'SELECT id FROM %I WHERE %I = $1 AND user_id = $2', v_fk.table_name, v_fk.column_name
      ) USING v_dup_id, v_user_id
      LOOP
        BEGIN
          EXECUTE format('UPDATE %I SET %I = $1 WHERE id = $2', v_fk.table_name, v_fk.column_name)
            USING p_primary_id, v_row.id;
          v_moved := v_moved + 1;
        EXCEPTION WHEN unique_violation THEN
          EXECUTE format('DELETE FROM %I WHERE id = $1', v_fk.table_name) USING v_row.id;
        END;
      END LOOP;
    END LOOP;
  END LOOP;

  -- Backstop: any self-relationship the generic path could still produce.
  DELETE FROM client_relationships
  WHERE user_id = v_user_id AND client_id_a = client_id_b;

  DELETE FROM referral_opportunities
  WHERE user_id = v_user_id AND client_id IS NOT NULL AND client_id = referrer_client_id;

  -- A co-party row can be repointed onto the very deal its client now holds
  -- (merging a co-party into that deal's primary). That row would make the
  -- deal render in both Deal History and Household Activity on one card.
  DELETE FROM client_record_co_parties cp
  USING client_records cr
  WHERE cp.user_id = v_user_id
    AND cr.id = cp.client_record_id
    AND cr.client_id = cp.co_client_id;

  -- Archive the duplicates (never hard-delete). archive_reason is left
  -- untouched — merged_into_client_id is the authoritative "why archived"
  -- signal for merge-driven archives.
  UPDATE clients
  SET archived_at = now(),
      merged_into_client_id = p_primary_id
  WHERE id = ANY(p_duplicate_ids) AND user_id = v_user_id;

  RETURN jsonb_build_object(
    'primary_id', p_primary_id,
    'merged_count', array_length(p_duplicate_ids, 1),
    'records_moved', v_moved
  );
END;
$$;

ALTER FUNCTION fn_merge_clients(uuid, uuid[]) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION fn_merge_clients(uuid, uuid[]) TO authenticated;

NOTIFY pgrst, 'reload schema';
