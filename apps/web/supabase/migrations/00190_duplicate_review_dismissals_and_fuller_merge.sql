-- ============================================================================
-- Migration 00190: "Not the same person" is remembered, and a merge keeps
-- the other record's details
--
-- Andrew (2026-10-27) imported 103 contacts from his iPhone and asked for
-- email-only clients to be consolidated with the phone-number cards of the
-- same people. The CRM's Possible Duplicates review only matched an exact
-- name, email or phone, so a client with just an email ("Bob Smith") and
-- the same person's phone card ("Robert Smith") never met. The review now
-- also suggests near-matches (lib/crm/duplicate-detection.ts), and near
-- matches include family members, so a "Not the same person" answer has to
-- stick.
--
-- 1. client_duplicate_dismissals: one row per pair the agent said are
--    different people. No FK to clients on purpose: fn_merge_clients
--    repoints every client FK one column at a time, and a table with two
--    client columns coupled by a CHECK can't be repointed that way (00165).
--    A row whose client was merged away or deleted is simply never matched.
--
-- 2. fn_merge_clients(): the 00183 body, plus a second UPDATE after the
--    email/phone fill. The record kept also gets, where it has none:
--    a second email and a second phone (a duplicate's address or number
--    that differs from its own), phone type with a filled phone, birthday,
--    first/last name, lead source, the address as one block (never parts
--    of two addresses), the earliest first contact and the latest last
--    contact. The NOT NULL columns (phone types) keep the kept record's own
--    value when there is nothing to copy. A duplicate's notes are added below the kept
--    record's own. Tags and the name are left as they are (the review
--    suggests keeping the record with a real name).
-- ============================================================================

-- ── 1. Pairs the agent said are not the same person ──────────────────────────

CREATE TABLE IF NOT EXISTS public.client_duplicate_dismissals (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_a    uuid        NOT NULL,
  client_b    uuid        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT client_duplicate_dismissals_ordered CHECK (client_a < client_b),
  CONSTRAINT client_duplicate_dismissals_pair UNIQUE (user_id, client_a, client_b)
);

COMMENT ON TABLE public.client_duplicate_dismissals IS
  'Client pairs the agent marked "Not the same person" in Possible Duplicates (00190). '
  'No FK to clients on purpose (fn_merge_clients repoints client FKs one column at a time).';

ALTER TABLE public.client_duplicate_dismissals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "client_duplicate_dismissals_select_own"
  ON public.client_duplicate_dismissals FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY "client_duplicate_dismissals_insert_own"
  ON public.client_duplicate_dismissals FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (select auth.uid())
    AND EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_a AND c.user_id = (select auth.uid()))
    AND EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_b AND c.user_id = (select auth.uid()))
  );

CREATE POLICY "client_duplicate_dismissals_delete_own"
  ON public.client_duplicate_dismissals FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));

GRANT SELECT, INSERT, DELETE ON public.client_duplicate_dismissals TO authenticated, service_role;
REVOKE ALL ON public.client_duplicate_dismissals FROM anon;

-- ── 2. A merge keeps the other record's details ─────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_merge_clients(p_primary_id uuid, p_duplicate_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_primary      clients%ROWTYPE;
  v_has_addr     boolean := false;
  v_street       text;
  v_unit         text;
  v_city         text;
  v_province     text;
  v_postal       text;
  v_dup_notes    text;
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

  -- Before the fill below: whether the kept record had a phone of its own
  -- (its phone type only comes across with a phone it didn't have).
  SELECT * INTO v_primary FROM clients WHERE id = p_primary_id;

  UPDATE clients
  SET email = COALESCE(clients.email, (
        SELECT email FROM clients c2
        WHERE c2.id = ANY(p_duplicate_ids) AND c2.email IS NOT NULL
        ORDER BY c2.created_at, c2.id
        LIMIT 1
      )),
      phone = COALESCE(clients.phone, (
        SELECT phone FROM clients c2
        WHERE c2.id = ANY(p_duplicate_ids) AND c2.phone IS NOT NULL
        ORDER BY c2.created_at, c2.id
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

  -- The rest of the duplicates' details, where the kept record has none
  -- (00190). Reads the email and phone just filled above, so a second
  -- email or number is never the same as the first.
  -- (Separate fields and FOUND: a whole-record IS NOT NULL is false as soon
  -- as any one field is null.)
  SELECT c2.street_address, c2.unit_number, c2.city, c2.province_region, c2.postal_code
    INTO v_street, v_unit, v_city, v_province, v_postal
    FROM clients c2
   WHERE c2.id = ANY(p_duplicate_ids)
     AND (c2.street_address IS NOT NULL OR c2.city IS NOT NULL)
   ORDER BY c2.created_at, c2.id
   LIMIT 1;
  v_has_addr := FOUND;

  SELECT string_agg(btrim(c2.notes), E'\n\n' ORDER BY c2.created_at, c2.id)
    INTO v_dup_notes
    FROM clients c2
   WHERE c2.id = ANY(p_duplicate_ids)
     AND btrim(coalesce(c2.notes, '')) <> ''
     AND btrim(c2.notes) <> btrim(coalesce(v_primary.notes, ''));

  UPDATE clients p
  SET secondary_email = COALESCE(p.secondary_email, (
        SELECT e FROM (
          SELECT c2.email AS e, c2.created_at, c2.id, 0 AS k FROM clients c2 WHERE c2.id = ANY(p_duplicate_ids)
          UNION ALL
          SELECT c2.secondary_email, c2.created_at, c2.id, 1 FROM clients c2 WHERE c2.id = ANY(p_duplicate_ids)
        ) x
        WHERE btrim(coalesce(e, '')) <> ''
          AND lower(btrim(e)) <> lower(btrim(coalesce(p.email, '')))
        ORDER BY k, created_at, id
        LIMIT 1
      )),
      secondary_phone = CASE WHEN p.secondary_phone IS NOT NULL THEN p.secondary_phone ELSE (
        SELECT ph FROM (
          SELECT c2.phone AS ph, c2.phone_type AS t, c2.created_at, c2.id, 0 AS k FROM clients c2 WHERE c2.id = ANY(p_duplicate_ids)
          UNION ALL
          SELECT c2.secondary_phone, c2.secondary_phone_type, c2.created_at, c2.id, 1 FROM clients c2 WHERE c2.id = ANY(p_duplicate_ids)
        ) x
        WHERE right(regexp_replace(coalesce(ph, ''), '\D', '', 'g'), 10) <> ''
          AND right(regexp_replace(coalesce(ph, ''), '\D', '', 'g'), 10)
              <> right(regexp_replace(coalesce(p.phone, ''), '\D', '', 'g'), 10)
        ORDER BY k, created_at, id
        LIMIT 1
      ) END,
      secondary_phone_type = CASE WHEN p.secondary_phone IS NOT NULL THEN p.secondary_phone_type ELSE COALESCE((
        SELECT t FROM (
          SELECT c2.phone AS ph, c2.phone_type AS t, c2.created_at, c2.id, 0 AS k FROM clients c2 WHERE c2.id = ANY(p_duplicate_ids)
          UNION ALL
          SELECT c2.secondary_phone, c2.secondary_phone_type, c2.created_at, c2.id, 1 FROM clients c2 WHERE c2.id = ANY(p_duplicate_ids)
        ) x
        WHERE right(regexp_replace(coalesce(ph, ''), '\D', '', 'g'), 10) <> ''
          AND right(regexp_replace(coalesce(ph, ''), '\D', '', 'g'), 10)
              <> right(regexp_replace(coalesce(p.phone, ''), '\D', '', 'g'), 10)
        ORDER BY k, created_at, id
        LIMIT 1
      ), p.secondary_phone_type) END,
      phone_type = CASE WHEN v_primary.phone IS NULL AND p.phone IS NOT NULL THEN COALESCE((
        SELECT c2.phone_type FROM clients c2
        WHERE c2.id = ANY(p_duplicate_ids) AND c2.phone = p.phone
        ORDER BY c2.created_at, c2.id
        LIMIT 1
      ), p.phone_type) ELSE p.phone_type END,
      birthdate = COALESCE(p.birthdate, (
        SELECT c2.birthdate FROM clients c2
        WHERE c2.id = ANY(p_duplicate_ids) AND c2.birthdate IS NOT NULL
        ORDER BY c2.created_at, c2.id LIMIT 1
      )),
      first_name = COALESCE(NULLIF(btrim(p.first_name), ''), (
        SELECT c2.first_name FROM clients c2
        WHERE c2.id = ANY(p_duplicate_ids) AND btrim(coalesce(c2.first_name, '')) <> ''
        ORDER BY c2.created_at, c2.id LIMIT 1
      ), p.first_name),
      last_name = COALESCE(NULLIF(btrim(p.last_name), ''), (
        SELECT c2.last_name FROM clients c2
        WHERE c2.id = ANY(p_duplicate_ids) AND btrim(coalesce(c2.last_name, '')) <> ''
        ORDER BY c2.created_at, c2.id LIMIT 1
      ), p.last_name),
      lead_source = COALESCE(p.lead_source, (
        SELECT c2.lead_source FROM clients c2
        WHERE c2.id = ANY(p_duplicate_ids) AND c2.lead_source IS NOT NULL
        ORDER BY c2.created_at, c2.id LIMIT 1
      )),
      -- The address moves as one block, and only onto a record with none.
      street_address  = CASE WHEN p.street_address IS NULL AND p.city IS NULL AND v_has_addr THEN v_street   ELSE p.street_address  END,
      unit_number     = CASE WHEN p.street_address IS NULL AND p.city IS NULL AND v_has_addr THEN v_unit     ELSE p.unit_number     END,
      city            = CASE WHEN p.street_address IS NULL AND p.city IS NULL AND v_has_addr THEN v_city     ELSE p.city            END,
      province_region = CASE WHEN p.street_address IS NULL AND p.city IS NULL AND v_has_addr THEN v_province ELSE p.province_region END,
      postal_code     = CASE WHEN p.street_address IS NULL AND p.city IS NULL AND v_has_addr THEN v_postal   ELSE p.postal_code     END,
      first_contacted_at = LEAST(p.first_contacted_at, (
        SELECT min(c2.first_contacted_at) FROM clients c2 WHERE c2.id = ANY(p_duplicate_ids)
      )),
      last_contact_at = GREATEST(p.last_contact_at, (
        SELECT max(c2.last_contact_at) FROM clients c2 WHERE c2.id = ANY(p_duplicate_ids)
      )),
      notes = CASE
        WHEN v_dup_notes IS NULL THEN p.notes
        WHEN btrim(coalesce(p.notes, '')) = '' THEN v_dup_notes
        ELSE p.notes || E'\n\n' || v_dup_notes
      END
  WHERE p.id = p_primary_id;

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
$function$;
