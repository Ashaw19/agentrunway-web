-- Migration 00162 — Duplicate client merge
--
-- WHY: The CSV/contact importer's duplicate check only matches on
-- name_search (a normalized name) — nothing on email or phone, and no
-- review step. Genuinely-duplicate clients that are typed slightly
-- differently (nickname, middle initial, formatting) both get inserted as
-- separate client rows, silently, with no chance to merge or delete. This
-- surfaced concretely during Ellis onboarding: a Follow Up Boss CSV export
-- of ~1,849 contacts produced multiple duplicate client records.
--
-- This migration adds the server-side merge primitive: fn_merge_clients().
-- Detection/clustering is client-side (apps/web/lib/crm/duplicate-detection.ts)
-- since the Clients page already loads every client into local state; this
-- function is the atomic, safe execution of a chosen merge.
--
-- DESIGN — generic FK reassignment, not a hardcoded table list:
-- There are 17 tables / 19 columns across the schema with a foreign key to
-- clients(id) as of this migration (client_records, contact_activities,
-- contact_tasks, client_relationships [dual: client_id_a/client_id_b],
-- outreach_queue, property_showings, property_analyses,
-- listing_appointments, client_memory_profiles, client_notes,
-- pipeline_deals, consent_records, nurture_sequences, inbound_emails,
-- workflow_drafts, client_communication_log, referral_opportunities [dual:
-- client_id/referrer_client_id]). Hand-listing all of them is exactly the
-- kind of enumeration that rots the next time a table is added — instead,
-- fn_merge_clients() discovers every FK column pointing at clients(id) via
-- information_schema at call time, so a future table with a client_id
-- column is picked up automatically with zero code change here.
--
-- Reassignment is done ROW BY ROW (not one bulk UPDATE per table), because
-- three of these tables carry a real UNIQUE constraint that can genuinely
-- collide during a merge (client_memory_profiles: one profile per client;
-- outreach_queue: one queued item per client+type+date; consent_records:
-- one record per client+consent_type). A bulk UPDATE would abort entirely
-- on any single conflicting row; per-row execution lets a conflict fall
-- back to deleting just that one duplicate row (the primary already has an
-- equivalent one) while every non-conflicting row still reassigns.
--
-- Convention follows fn_promote_referral / fn_mark_opportunity_lost
-- (migration 00157): SECURITY DEFINER with an explicit auth.uid() ownership
-- guard + SET search_path = public. DEFINER bypasses RLS, so every dynamic
-- statement is explicitly scoped to user_id = v_user_id (verified caller).
--
-- SAFETY: duplicates are ARCHIVED (archived_at + archive_reason='merged' +
-- merged_into_client_id), never hard-deleted, after their linked history is
-- reassigned to the primary. This preserves an audit trail. Field-level
-- enrichment only fills the primary's NULL email/phone from a duplicate —
-- it never overwrites a populated primary field, and name is left as the
-- user's chosen primary's name.

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS merged_into_client_id uuid REFERENCES clients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_clients_merged_into
  ON clients (merged_into_client_id) WHERE merged_into_client_id IS NOT NULL;

COMMENT ON COLUMN clients.merged_into_client_id IS
  'Set when this client was merged as a duplicate into another client (fn_merge_clients). The row is archived, not deleted, so linked history can be traced back.';

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

  -- Ownership guard — SECURITY DEFINER bypasses RLS, so this check is the
  -- entire safety boundary (not a redundant belt-and-suspenders layer).
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

  -- ── Field-level enrichment: fill primary's blank email/phone only ────────
  -- Never overwrites a populated primary field; name is left as-is (the
  -- user already chose which record is primary).
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

  -- ── Generic FK reassignment: every column across the schema that ────────
  -- references clients(id), discovered via information_schema so a future
  -- table is picked up automatically. Excludes the clients table itself
  -- (merged_into_client_id is a self-FK, not a child record to move).
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
      -- Row-by-row: a unique-constraint conflict on one row must not abort
      -- reassignment of every other row this duplicate has in the table.
      FOR v_row IN EXECUTE format(
        'SELECT id FROM %I WHERE %I = $1 AND user_id = $2', v_fk.table_name, v_fk.column_name
      ) USING v_dup_id, v_user_id
      LOOP
        BEGIN
          EXECUTE format('UPDATE %I SET %I = $1 WHERE id = $2', v_fk.table_name, v_fk.column_name)
            USING p_primary_id, v_row.id;
          v_moved := v_moved + 1;
        EXCEPTION WHEN unique_violation THEN
          -- Primary already has an equivalent row under that table's unique
          -- constraint (e.g. one client_memory_profiles row per client) —
          -- the duplicate's copy is redundant, so drop it instead of
          -- aborting the merge.
          EXECUTE format('DELETE FROM %I WHERE id = $1', v_fk.table_name) USING v_row.id;
        END;
      END LOOP;
    END LOOP;
  END LOOP;

  -- ── Dual-column relationship tables: after reassignment above, a row can ─
  -- end up referencing the SAME client on both sides (e.g. client A and
  -- client B were both merged into primary, and a client_relationships row
  -- linked A↔B) — that's a self-relationship, not meaningful. Drop it.
  DELETE FROM client_relationships
  WHERE user_id = v_user_id AND client_id_a = client_id_b;

  DELETE FROM referral_opportunities
  WHERE user_id = v_user_id AND client_id IS NOT NULL AND client_id = referrer_client_id;

  -- ── Archive the duplicates (never hard-delete) ───────────────────────────
  UPDATE clients
  SET archived_at = now(),
      archive_reason = 'merged',
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
