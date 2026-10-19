-- ============================================================================
-- Migration 00183: CASL consent ledger (express consent, inquiries, texts,
-- withdrawals the agent records)
--
-- Andrew (2026-10-18, top-5 item 3): every past client whose last deal closed
-- more than two years ago was call-only forever, even with permission,
-- because Agent Runway had nowhere to record express consent. This makes
-- client_email_consents (00173, the website's consents) the one consent
-- ledger, per client and per channel.
--
-- CASL (S.C. 2010, c. 23): s.6(1) no commercial message without express or
-- implied consent; s.10(10)(a)/(e) implied consent lasts 2 years from a
-- purchase, 6 months from an inquiry; s.11(3) an unsubscribe is honoured;
-- s.13 the sender has the onus of proving consent, hence the method, date
-- and wording on every record. The status itself is computed in
-- packages/core/engines/casl-consent-engine.ts (consentStatus), never here.
--
-- client_email_consents gains (all additive; existing website rows keep
-- their meaning through the defaults: channel 'email', basis 'express'):
--   channel           'email' | 'sms'
--   basis             'express' | 'implied_inquiry'
--   method            how it was given (required on agent records)
--   evidence_note     where the proof is (a saved email, a signed form)
--   recorded_via      web | mobile | flight_crew | mcp | website
--   withdrawn_method / withdrawn_note
--   Agent records: source = 'agent', kind = 'other'. consent_text holds the
--   wording ('' when only a note was given). A record is never edited or
--   deleted: the only change allowed is withdrawing it (guard trigger), and
--   a client's id when fn_merge_clients moves it.
--
-- clients gains sms_opt_out_at/_source (texts) and, for both channels, the
-- method and note of a withdrawal the agent records. An email opt-out no
-- longer stands for texts by itself, so existing opt-outs are copied to
-- texts (the text drafter treated any email opt-out as "no texts" until
-- now), and the website's "unsubscribe from all" sets both from here on.
--
-- fn_merge_clients: the LATEST opt-out on any merged record survives, per
-- channel. client_email_consents still has one client FK, so the generic
-- loop moves it; the guard trigger allows that client_id change only inside
-- the merge (a transaction-local setting the merge turns on).
-- fn_delete_clients: a client who unsubscribed from texts is archived, not
-- deleted, like an email opt-out.
-- ============================================================================

-- ── client_email_consents: one ledger, per channel ──────────────────────────

ALTER TABLE public.client_email_consents
  ADD COLUMN IF NOT EXISTS channel          text NOT NULL DEFAULT 'email',
  ADD COLUMN IF NOT EXISTS basis            text NOT NULL DEFAULT 'express',
  ADD COLUMN IF NOT EXISTS method           text,
  ADD COLUMN IF NOT EXISTS evidence_note    text,
  ADD COLUMN IF NOT EXISTS recorded_via     text,
  ADD COLUMN IF NOT EXISTS withdrawn_method text,
  ADD COLUMN IF NOT EXISTS withdrawn_note   text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'client_email_consents_channel_check') THEN
    ALTER TABLE public.client_email_consents
      ADD CONSTRAINT client_email_consents_channel_check CHECK (channel IN ('email', 'sms'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'client_email_consents_basis_check') THEN
    ALTER TABLE public.client_email_consents
      ADD CONSTRAINT client_email_consents_basis_check CHECK (basis IN ('express', 'implied_inquiry'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'client_email_consents_method_check') THEN
    ALTER TABLE public.client_email_consents
      ADD CONSTRAINT client_email_consents_method_check CHECK (
        method IS NULL OR method IN ('in_person', 'verbal', 'written', 'email_reply', 'text_reply', 'web_form'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'client_email_consents_withdrawn_method_check') THEN
    ALTER TABLE public.client_email_consents
      ADD CONSTRAINT client_email_consents_withdrawn_method_check CHECK (
        withdrawn_method IS NULL OR withdrawn_method IN ('in_person', 'verbal', 'written', 'email_reply', 'text_reply', 'web_form'));
  END IF;
  -- An agent record carries how it was given, and wording or a note (s.13).
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'client_email_consents_agent_evidence_check') THEN
    ALTER TABLE public.client_email_consents
      ADD CONSTRAINT client_email_consents_agent_evidence_check CHECK (
        source <> 'agent'
        OR (method IS NOT NULL
            AND (length(btrim(consent_text)) > 0 OR length(btrim(coalesce(evidence_note, ''))) > 0)));
  END IF;
  -- An agent record's withdrawal says how it was withdrawn.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'client_email_consents_agent_withdrawal_check') THEN
    ALTER TABLE public.client_email_consents
      ADD CONSTRAINT client_email_consents_agent_withdrawal_check CHECK (
        source <> 'agent' OR withdrawn_at IS NULL OR withdrawn_method IS NOT NULL);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS client_email_consents_client_channel_idx
  ON public.client_email_consents (user_id, client_id, channel);

COMMENT ON TABLE public.client_email_consents IS
  'CASL consent ledger (00173, generalized 00183): one row per consent given, per client and channel. Website sign-ups (source website) and records the agent makes (source agent). Never edited; withdrawn_at ends it. Status = consentStatus() in packages/core/engines/casl-consent-engine.ts.';
COMMENT ON COLUMN public.client_email_consents.basis IS
  'express (CASL s.10(1)) | implied_inquiry (s.10(10)(e), 6 months). Implied consent from a purchase is not stored: it comes from the closed deal.';

-- The agent records consent and withdrawals from the web, the phone, Flight
-- Crew (after approval) and the MCP server, all as the signed-in user.
DROP POLICY IF EXISTS "Users record own consents" ON public.client_email_consents;
CREATE POLICY "Users record own consents" ON public.client_email_consents
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND source = 'agent'
    AND EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.user_id = auth.uid())
  );
DROP POLICY IF EXISTS "Users withdraw own consents" ON public.client_email_consents;
CREATE POLICY "Users withdraw own consents" ON public.client_email_consents
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.user_id = auth.uid())
  );
-- No DELETE policy: a consent record is evidence and is never deleted.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_email_consents TO authenticated, service_role;

-- A record is evidence (s.13): after it is written, only a withdrawal (once)
-- and fn_merge_clients moving it to the surviving client may change it.
-- A client_id change outside a merge is refused, so a user can't move an
-- express consent onto another client (or point a row at another account's
-- client, which would stop that account deleting it). A move needs both the
-- role fn_merge_clients runs as (postgres, its owner) and the
-- transaction-local agent_runway.merging_clients it sets for its FK loop.
CREATE OR REPLACE FUNCTION public.fn_client_consents_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.client_id IS DISTINCT FROM OLD.client_id THEN
    -- Only fn_merge_clients (SECURITY DEFINER, owned by postgres) moves a
    -- record: its role AND its transaction-local setting, so a helper
    -- exposed later that sets the flag can't reopen this.
    IF current_user <> 'postgres'
       OR coalesce(current_setting('agent_runway.merging_clients', true), '') <> 'on' THEN
      RAISE EXCEPTION 'A consent record stays with its client. Record consent on the other client instead.'
        USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.clients c WHERE c.id = NEW.client_id AND c.user_id = NEW.user_id) THEN
      RAISE EXCEPTION 'A consent record can only move to a client of the same account.'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  IF NEW.user_id         IS DISTINCT FROM OLD.user_id
  OR NEW.kind            IS DISTINCT FROM OLD.kind
  OR NEW.source          IS DISTINCT FROM OLD.source
  OR NEW.consent_text    IS DISTINCT FROM OLD.consent_text
  OR NEW.consented_at    IS DISTINCT FROM OLD.consented_at
  OR NEW.consent_ip      IS DISTINCT FROM OLD.consent_ip
  OR NEW.source_event_id IS DISTINCT FROM OLD.source_event_id
  OR NEW.created_at      IS DISTINCT FROM OLD.created_at
  OR NEW.channel         IS DISTINCT FROM OLD.channel
  OR NEW.basis           IS DISTINCT FROM OLD.basis
  OR NEW.method          IS DISTINCT FROM OLD.method
  OR NEW.evidence_note   IS DISTINCT FROM OLD.evidence_note
  OR NEW.recorded_via    IS DISTINCT FROM OLD.recorded_via THEN
    RAISE EXCEPTION 'A consent record cannot be edited. Record a new one, or withdraw it.'
      USING ERRCODE = '42501';
  END IF;
  IF OLD.withdrawn_at IS NOT NULL AND (
       NEW.withdrawn_at     IS DISTINCT FROM OLD.withdrawn_at
    OR NEW.withdrawn_method IS DISTINCT FROM OLD.withdrawn_method
    OR NEW.withdrawn_note   IS DISTINCT FROM OLD.withdrawn_note) THEN
    RAISE EXCEPTION 'This consent was already withdrawn. Record new consent instead.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_client_consents_guard ON public.client_email_consents;
CREATE TRIGGER trg_client_consents_guard
  BEFORE UPDATE ON public.client_email_consents
  FOR EACH ROW EXECUTE FUNCTION public.fn_client_consents_guard();

-- ── user_settings: mailing address for consent requests ─────────────────────
-- SOR/2012-36 s.2 and s.4: a commercial message, and a request for consent,
-- carry the sender's mailing address plus a phone, email or web address. The
-- free-form email signature may hold it; when it doesn't (no postal code),
-- this is what a consent request uses, and with neither Agent Runway won't
-- draft the ask.
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS mailing_address text;
COMMENT ON COLUMN public.user_settings.mailing_address IS
  'Business mailing address for consent requests (CASL, SOR/2012-36 s.2, 00183). Set in Flight Control, Signature.';

-- ── clients: per-channel opt-outs ───────────────────────────────────────────

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS sms_opt_out_at       timestamptz,
  ADD COLUMN IF NOT EXISTS sms_opt_out_source   text,
  ADD COLUMN IF NOT EXISTS sms_opt_out_method   text,
  ADD COLUMN IF NOT EXISTS sms_opt_out_note     text,
  ADD COLUMN IF NOT EXISTS email_opt_out_method text,
  ADD COLUMN IF NOT EXISTS email_opt_out_note   text;

COMMENT ON COLUMN public.clients.sms_opt_out_at IS
  'Unsubscribed from texts (00183): the website''s "unsubscribe from all", or a withdrawal the agent recorded. Every text drafter treats the client as call-only while set, unless express text consent was given after it.';
COMMENT ON COLUMN public.clients.email_opt_out_at IS
  'Unsubscribed from email (00173): every email drafter treats the client as call-only while set, unless express email consent was given after it (00183).';

-- Until now the text drafter read an email opt-out as "no texts" too. Keep
-- that for every opt-out already on file (only opted-out clients change).
UPDATE public.clients
   SET sms_opt_out_at     = email_opt_out_at,
       sms_opt_out_source = coalesce(email_opt_out_source, 'website')
 WHERE email_opt_out_at IS NOT NULL
   AND sms_opt_out_at IS NULL;

-- ── fn_merge_clients: opt-outs survive a merge, on both channels ────────────
-- Body as in 00173, with the latest opt-out per channel in the first UPDATE
-- and the merging_clients setting around the generic FK loop.

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
  v_email_at     timestamptz;
  v_email_src    text;
  v_email_method text;
  v_email_note   text;
  v_sms_at       timestamptz;
  v_sms_src      text;
  v_sms_method   text;
  v_sms_note     text;
  v_agent_method text;
  v_agent_note   text;
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

  -- The LATEST opt-out on any of the merged records wins, per channel, with
  -- its own source, method and note (00173, texts 00183), unless any record's
  -- opt-out was the agent's (below). Latest, because express consent given
  -- after an opt-out lifts it: keeping an earlier one could let a consent
  -- that predates the later opt-out lift it.
  SELECT c.email_opt_out_at, c.email_opt_out_source, c.email_opt_out_method, c.email_opt_out_note
    INTO v_email_at, v_email_src, v_email_method, v_email_note
    FROM clients c
   WHERE (c.id = p_primary_id OR c.id = ANY(p_duplicate_ids)) AND c.email_opt_out_at IS NOT NULL
   ORDER BY c.email_opt_out_at DESC
   LIMIT 1;
  SELECT c.sms_opt_out_at, c.sms_opt_out_source, c.sms_opt_out_method, c.sms_opt_out_note
    INTO v_sms_at, v_sms_src, v_sms_method, v_sms_note
    FROM clients c
   WHERE (c.id = p_primary_id OR c.id = ANY(p_duplicate_ids)) AND c.sms_opt_out_at IS NOT NULL
   ORDER BY c.sms_opt_out_at DESC
   LIMIT 1;

  -- An opt-out the agent recorded on ANY merged record stays the agent's,
  -- with that record's method and note, at the latest date: a later
  -- website sign-up lifts only a website opt-out (planWebsiteEvent), so a
  -- merge must not turn the agent's withdrawal into a website one.
  SELECT c.email_opt_out_method, c.email_opt_out_note
    INTO v_agent_method, v_agent_note
    FROM clients c
   WHERE (c.id = p_primary_id OR c.id = ANY(p_duplicate_ids))
     AND c.email_opt_out_at IS NOT NULL AND c.email_opt_out_source = 'agent'
   ORDER BY c.email_opt_out_at DESC
   LIMIT 1;
  IF FOUND THEN
    v_email_src := 'agent';
    v_email_method := v_agent_method;
    v_email_note := v_agent_note;
  END IF;
  SELECT c.sms_opt_out_method, c.sms_opt_out_note
    INTO v_agent_method, v_agent_note
    FROM clients c
   WHERE (c.id = p_primary_id OR c.id = ANY(p_duplicate_ids))
     AND c.sms_opt_out_at IS NOT NULL AND c.sms_opt_out_source = 'agent'
   ORDER BY c.sms_opt_out_at DESC
   LIMIT 1;
  IF FOUND THEN
    v_sms_src := 'agent';
    v_sms_method := v_agent_method;
    v_sms_note := v_agent_note;
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
      email_opt_out_at     = v_email_at,
      email_opt_out_source = v_email_src,
      email_opt_out_method = v_email_method,
      email_opt_out_note   = v_email_note,
      sms_opt_out_at       = v_sms_at,
      sms_opt_out_source   = v_sms_src,
      sms_opt_out_method   = v_sms_method,
      sms_opt_out_note     = v_sms_note
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
  -- time without tripping a CHECK. client_email_consents (one FK) moves here;
  -- its guard trigger allows the client_id change only while this setting is
  -- on (transaction-local, cleared after the loop).
  PERFORM set_config('agent_runway.merging_clients', 'on', true);
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

  PERFORM set_config('agent_runway.merging_clients', '', true);

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
REVOKE EXECUTE ON FUNCTION fn_merge_clients(uuid, uuid[]) FROM PUBLIC, anon;

-- ── fn_delete_clients: a text opt-out is kept too ───────────────────────────
-- Body as in 00181, plus sms_opt_out_at in the keep test and archive reason.

CREATE OR REPLACE FUNCTION public.fn_delete_clients(
  p_client_ids uuid[],
  p_dry_run    boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_owned   uuid[];
  v_keep    uuid[];
  v_delete  uuid[];
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_client_ids IS NULL OR cardinality(p_client_ids) = 0 THEN
    RETURN jsonb_build_object('deleted', '[]'::jsonb, 'archived', '[]'::jsonb);
  END IF;
  IF cardinality(p_client_ids) > 5000 THEN
    RAISE EXCEPTION 'too many clients at once (max 5000)' USING ERRCODE = '22023';
  END IF;

  -- Only the caller's own clients; anything else is ignored.
  SELECT coalesce(array_agg(c.id), '{}') INTO v_owned
  FROM clients c
  WHERE c.user_id = v_uid AND c.id = ANY (p_client_ids);

  SELECT coalesce(array_agg(c.id), '{}') INTO v_keep
  FROM clients c
  WHERE c.id = ANY (v_owned)
    AND (
      c.email_opt_out_at IS NOT NULL
      OR c.sms_opt_out_at IS NOT NULL
      OR EXISTS (SELECT 1 FROM consent_records x WHERE x.client_id = c.id)
      OR EXISTS (SELECT 1 FROM client_email_consents x WHERE x.client_id = c.id)
      OR EXISTS (SELECT 1 FROM client_records x WHERE x.client_id = c.id)
      OR EXISTS (SELECT 1 FROM pipeline_deals x WHERE x.client_id = c.id)
      OR EXISTS (SELECT 1 FROM client_record_co_parties x WHERE x.co_client_id = c.id)
    );

  SELECT coalesce(array_agg(id), '{}') INTO v_delete
  FROM unnest(v_owned) AS id
  WHERE NOT (id = ANY (v_keep));

  IF NOT p_dry_run THEN
    UPDATE clients
       SET archived_at    = coalesce(archived_at, now()),
           archive_reason = coalesce(archive_reason,
                              CASE WHEN email_opt_out_at IS NOT NULL OR sms_opt_out_at IS NOT NULL
                                   THEN 'do_not_contact' ELSE 'other' END),
           updated_at     = now()
     WHERE user_id = v_uid AND id = ANY (v_keep);

    DELETE FROM contact_tasks
     WHERE user_id = v_uid AND client_id = ANY (v_delete);

    DELETE FROM clients
     WHERE user_id = v_uid AND id = ANY (v_delete);
  END IF;

  RETURN jsonb_build_object('deleted', to_jsonb(v_delete), 'archived', to_jsonb(v_keep));
END;
$$;

REVOKE ALL ON FUNCTION public.fn_delete_clients(uuid[], boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_delete_clients(uuid[], boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_delete_clients(uuid[], boolean) TO authenticated;

COMMENT ON FUNCTION public.fn_delete_clients(uuid[], boolean) IS
  'Deletes the caller''s clients; archives instead any with a deal, an email or text unsubscribe, or consent records (CASL). p_dry_run returns the split only.';

NOTIFY pgrst, 'reload schema';
