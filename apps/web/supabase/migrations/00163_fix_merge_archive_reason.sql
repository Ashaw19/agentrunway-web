-- Migration 00163 — Fix fn_merge_clients archive_reason constraint violation
--
-- BUG: migration 00162 set archive_reason = 'merged' when archiving a
-- duplicate after a merge. clients_archive_reason_check (migration 00037)
-- only allows 'deceased' | 'moved_away' | 'do_not_contact' | 'other' — every
-- real merge attempt in production has failed with:
--   new row for relation "clients" violates check constraint
--   "clients_archive_reason_check"
--
-- FIX: don't overload archive_reason with a new value at all.
-- merged_into_client_id (added in 00162) is already the authoritative,
-- purpose-built signal that a client was archived via merge — it's more
-- specific than a reason string (it names the exact primary record) and
-- every reader that cares can join on it. Leaving archive_reason untouched
-- (NULL, same as before the merge) avoids widening a small, deliberate enum
-- that Settings/AI-tool code elsewhere assumes is user-chosen from a fixed
-- list. lib/ai/tools.ts's archived-client listing already renders
-- archive_reason via a truthy-check ternary, so NULL displays cleanly with
-- no "reason:" suffix.
--
-- Only the final archive UPDATE changes; every other clause is identical to
-- 00162 (CREATE OR REPLACE, same signature, same ownership/grant).

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
      AND tc.table_name <> 'clients'
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

  DELETE FROM client_relationships
  WHERE user_id = v_user_id AND client_id_a = client_id_b;

  DELETE FROM referral_opportunities
  WHERE user_id = v_user_id AND client_id IS NOT NULL AND client_id = referrer_client_id;

  -- Archive the duplicates (never hard-delete). archive_reason is left
  -- untouched — merged_into_client_id is the authoritative "why archived"
  -- signal for merge-driven archives; see header note above.
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
