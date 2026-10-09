-- ============================================================================
-- Migration 00173: website leads into Agent Runway (inbound key, events,
-- email consents, email opt-out)
--
-- Andrew (2026-10-09): leads from his own website (andrew.agentrunway.ca) go
-- straight into his CRM instead of a CSV he downloads and imports by hand.
-- The site POSTs each sign-up, contact message and unsubscribe to
-- /api/inbound/website with a per-user key.
--
-- inbound_keys          one row per key. Only the sha256 is stored; the key
--                       itself is shown once, in Settings, when it is made.
-- inbound_events        one row per event received. (user_id,
--                       source_event_id) is unique, so a retried POST is a
--                       no-op.
-- client_email_consents express consent the website recorded: exact wording,
--                       time, IP. withdrawn_at is set when they stop that
--                       kind.
-- clients.email_opt_out_at
--                       set when they unsubscribe from ALL website email.
--                       Every email drafter treats it as call-only. A later
--                       website sign-up (a fresh opt-in) clears it, which is
--                       the website's own rule.
--
-- fn_merge_clients: an opt-out on any merged record survives the merge. The
-- new tables each have one client FK, so the generic FK loop moves them.
-- Also revokes the anon/PUBLIC EXECUTE that QA flagged on 07-17.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.inbound_keys (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label        text        NOT NULL DEFAULT 'Website',
  key_prefix   text        NOT NULL,          -- first characters, for display
  key_hash     text        NOT NULL UNIQUE,   -- sha256 hex of the full key
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at   timestamptz
);
CREATE INDEX IF NOT EXISTS inbound_keys_user_idx ON public.inbound_keys (user_id);
ALTER TABLE public.inbound_keys ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users read own inbound keys" ON public.inbound_keys;
CREATE POLICY "Users read own inbound keys" ON public.inbound_keys
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users create own inbound keys" ON public.inbound_keys;
CREATE POLICY "Users create own inbound keys" ON public.inbound_keys
  FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users revoke own inbound keys" ON public.inbound_keys;
CREATE POLICY "Users revoke own inbound keys" ON public.inbound_keys
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.inbound_events (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key_id          uuid        REFERENCES public.inbound_keys(id) ON DELETE SET NULL,
  source_event_id text        NOT NULL,
  kind            text        NOT NULL,      -- lead | unsubscribe
  source          text,                      -- contact, valuation, open_house, alerts, ...
  client_id       uuid        REFERENCES public.clients(id) ON DELETE SET NULL,
  outcome         text        NOT NULL,      -- created | matched | no_client | ignored
  received_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, source_event_id)
);
CREATE INDEX IF NOT EXISTS inbound_events_user_received_idx ON public.inbound_events (user_id, received_at DESC);
ALTER TABLE public.inbound_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users read own inbound events" ON public.inbound_events;
CREATE POLICY "Users read own inbound events" ON public.inbound_events
  FOR SELECT USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.client_email_consents (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id       uuid        NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  kind            text        NOT NULL CHECK (kind IN ('alerts', 'market_letter', 'home_report', 'open_house', 'guide', 'other')),
  source          text        NOT NULL DEFAULT 'website',
  consent_text    text        NOT NULL,
  consented_at    timestamptz NOT NULL,
  consent_ip      text,
  withdrawn_at    timestamptz,
  source_event_id text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS client_email_consents_client_idx ON public.client_email_consents (user_id, client_id);
ALTER TABLE public.client_email_consents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users read own email consents" ON public.client_email_consents;
CREATE POLICY "Users read own email consents" ON public.client_email_consents
  FOR SELECT USING (auth.uid() = user_id);

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS email_opt_out_at     timestamptz,
  ADD COLUMN IF NOT EXISTS email_opt_out_source text;
COMMENT ON COLUMN public.clients.email_opt_out_at IS
  'Unsubscribed from all email (00173). Every email drafter treats the client as call-only while set.';

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
      )),
      -- An email opt-out on ANY of the merged records survives the merge
      -- (00173): emailing someone who unsubscribed is the CASL risk.
      email_opt_out_at = COALESCE(clients.email_opt_out_at, (
        SELECT min(email_opt_out_at) FROM clients c2
        WHERE c2.id = ANY(p_duplicate_ids)
      )),
      email_opt_out_source = COALESCE(clients.email_opt_out_source, (
        SELECT email_opt_out_source FROM clients c2
        WHERE c2.id = ANY(p_duplicate_ids) AND c2.email_opt_out_at IS NOT NULL
        ORDER BY c2.email_opt_out_at
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
-- Signed-in users only. The body already refuses anyone whose auth.uid()
-- doesn't own the clients, but anon and PUBLIC had EXECUTE (QA 07-17..07-29).
REVOKE EXECUTE ON FUNCTION fn_merge_clients(uuid, uuid[]) FROM PUBLIC, anon;

NOTIFY pgrst, 'reload schema';
