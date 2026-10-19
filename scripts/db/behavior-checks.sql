-- Behaviour checks, run by check-functions.sh after every migration has been
-- replayed into the throwaway database. Each check raises on failure, which
-- fails the db-functions CI job. Nothing here ever touches prod.
--
-- Uses the placeholder auth user from ci-bootstrap.sql.

DO $$
DECLARE
  v_user   uuid := '00000000-0000-0000-0000-000000000132';
  v_client uuid;
  v_last   timestamptz;
  v_first  timestamptz;
BEGIN
  INSERT INTO clients (user_id, name, name_search)
  VALUES (v_user, 'CI Behaviour Check', 'ci behaviour check')
  RETURNING id INTO v_client;

  -- 00166: logging an activity must work at all (every insert failed
  -- 2026-04-12 → 2026-10-06). The inserts below raise if it doesn't.

  -- 00171: a Note is not contact.
  INSERT INTO contact_activities (user_id, client_id, type, description, activity_date)
  VALUES (v_user, v_client, 'note', 'internal memo', now());
  SELECT last_contact_at, first_contacted_at INTO v_last, v_first FROM clients WHERE id = v_client;
  IF v_last IS NOT NULL OR v_first IS NOT NULL THEN
    RAISE EXCEPTION 'behaviour check: a note moved last/first contacted (last=%, first=%)', v_last, v_first;
  END IF;

  -- A call is contact: both dates are set.
  INSERT INTO contact_activities (user_id, client_id, type, description, activity_date)
  VALUES (v_user, v_client, 'call', 'spoke with them', now());
  SELECT last_contact_at, first_contacted_at INTO v_last, v_first FROM clients WHERE id = v_client;
  IF v_last IS NULL OR v_first IS NULL THEN
    RAISE EXCEPTION 'behaviour check: a call did not set last/first contacted (last=%, first=%)', v_last, v_first;
  END IF;

  -- A later note leaves the call's date alone.
  INSERT INTO contact_activities (user_id, client_id, type, description, activity_date)
  VALUES (v_user, v_client, 'note', 'follow-up memo', now() + interval '1 minute');
  IF (SELECT last_contact_at FROM clients WHERE id = v_client) <> v_last THEN
    RAISE EXCEPTION 'behaviour check: a later note moved last_contact_at';
  END IF;

  RAISE NOTICE 'behaviour checks: all passed';
END $$;

-- 00183: the CASL consent ledger. A record is evidence: an agent record
-- needs a method, it can't be edited, it can be withdrawn once; an opt-out
-- from texts survives a merge and keeps a client from being deleted.
DO $$
DECLARE
  v_user   uuid := '00000000-0000-0000-0000-000000000132';
  v_a      uuid;
  v_b      uuid;
  v_c      uuid;
  v_row    uuid;
  v_result jsonb;
BEGIN
  -- fn_merge_clients / fn_delete_clients check auth.uid().
  PERFORM set_config('request.jwt.claim.sub', v_user::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user)::text, true);

  INSERT INTO clients (user_id, name, name_search)
  VALUES (v_user, 'CI Consent A', 'ci consent a') RETURNING id INTO v_a;

  INSERT INTO client_email_consents (user_id, client_id, kind, source, channel, basis, method, consent_text, consented_at, recorded_via)
  VALUES (v_user, v_a, 'other', 'agent', 'email', 'express', 'verbal', 'Yes, keep in touch', now(), 'web')
  RETURNING id INTO v_row;

  BEGIN
    INSERT INTO client_email_consents (user_id, client_id, kind, source, consent_text, consented_at)
    VALUES (v_user, v_a, 'other', 'agent', 'yes', now());
    RAISE EXCEPTION 'behaviour check: an agent consent record with no method was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    UPDATE client_email_consents SET consent_text = 'edited' WHERE id = v_row;
    RAISE EXCEPTION 'behaviour check: a consent record was edited';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    UPDATE client_email_consents SET withdrawn_at = now() WHERE id = v_row;
    RAISE EXCEPTION 'behaviour check: an agent record was withdrawn with no method';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  UPDATE client_email_consents SET withdrawn_at = now(), withdrawn_method = 'verbal' WHERE id = v_row;
  BEGIN
    UPDATE client_email_consents SET withdrawn_at = now() + interval '1 day' WHERE id = v_row;
    RAISE EXCEPTION 'behaviour check: a withdrawn consent record was changed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- A record stays with its client: a client_id change outside
  -- fn_merge_clients is refused, and even inside it the new client has to
  -- belong to the same account.
  INSERT INTO clients (user_id, name, name_search)
  VALUES (v_user, 'CI Consent B', 'ci consent b') RETURNING id INTO v_b;
  INSERT INTO client_email_consents (user_id, client_id, kind, source, channel, basis, method, consent_text, consented_at)
  VALUES (v_user, v_b, 'other', 'agent', 'sms', 'express', 'text_reply', 'YES', now())
  RETURNING id INTO v_row;
  BEGIN
    UPDATE client_email_consents SET client_id = v_a WHERE id = v_row;
    RAISE EXCEPTION 'behaviour check: a consent record was moved to another client outside a merge';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  -- The setting alone is not enough: the move also needs the role
  -- fn_merge_clients runs as (postgres). This block runs as supabase_admin.
  PERFORM set_config('agent_runway.merging_clients', 'on', true);
  BEGIN
    UPDATE client_email_consents SET client_id = v_a WHERE id = v_row;
    RAISE EXCEPTION 'behaviour check: the merging setting alone let a consent record move';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  -- What fn_merge_clients' FK loop does: as postgres, with its setting on.
  -- (The loop itself can't be run end to end here: this replay made
  -- supabase_admin own every table, so information_schema shows postgres
  -- no FKs and the loop moves nothing, for any table. In prod postgres owns
  -- the tables.)
  EXECUTE 'SET LOCAL ROLE postgres';
  BEGIN
    UPDATE client_email_consents SET client_id = gen_random_uuid() WHERE id = v_row;
    RAISE EXCEPTION 'behaviour check: a consent record was moved to a client of no account';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  UPDATE client_email_consents SET client_id = v_a WHERE id = v_row;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('agent_runway.merging_clients', '', true);
  IF (SELECT client_id FROM client_email_consents WHERE id = v_row) <> v_a THEN
    RAISE EXCEPTION 'behaviour check: fn_merge_clients'' role and setting did not let a consent record move';
  END IF;

  -- Merge: the LATEST opt-out date survives, per channel; when any merged
  -- record's opt-out was the agent's, it stays the agent's with that
  -- record's method and note (a later website sign-up must not lift it).
  -- A: the agent's withdrawal, 30 days ago. B: a website unsubscribe, yesterday.
  UPDATE clients SET email_opt_out_at = now() - interval '30 days', email_opt_out_source = 'agent',
                     email_opt_out_method = 'verbal', email_opt_out_note = 'Asked me to stop'
   WHERE id = v_a;
  UPDATE clients SET email_opt_out_at = now() - interval '1 day', email_opt_out_source = 'website',
                     email_opt_out_method = NULL, email_opt_out_note = NULL,
                     sms_opt_out_at = now() - interval '2 days', sms_opt_out_source = 'website'
   WHERE id = v_b;
  PERFORM fn_merge_clients(v_a, ARRAY[v_b]);
  IF (SELECT email_opt_out_at FROM clients WHERE id = v_a) < now() - interval '2 days' THEN
    RAISE EXCEPTION 'behaviour check: fn_merge_clients did not keep the latest email opt-out date';
  END IF;
  IF (SELECT email_opt_out_source FROM clients WHERE id = v_a) IS DISTINCT FROM 'agent'
     OR (SELECT email_opt_out_method FROM clients WHERE id = v_a) IS DISTINCT FROM 'verbal' THEN
    RAISE EXCEPTION 'behaviour check: fn_merge_clients turned the agent''s withdrawal into a website opt-out';
  END IF;
  IF (SELECT sms_opt_out_at FROM clients WHERE id = v_a) IS NULL
     OR (SELECT sms_opt_out_source FROM clients WHERE id = v_a) IS DISTINCT FROM 'website' THEN
    RAISE EXCEPTION 'behaviour check: a text opt-out did not survive fn_merge_clients';
  END IF;
  IF coalesce(current_setting('agent_runway.merging_clients', true), '') = 'on' THEN
    RAISE EXCEPTION 'behaviour check: fn_merge_clients left the merging setting on';
  END IF;

  -- Delete: a client with only a text opt-out is archived, not deleted.
  INSERT INTO clients (user_id, name, name_search, sms_opt_out_at, sms_opt_out_source)
  VALUES (v_user, 'CI Consent C', 'ci consent c', now(), 'agent') RETURNING id INTO v_c;
  v_result := fn_delete_clients(ARRAY[v_c]);
  IF NOT (v_result -> 'archived') ? v_c::text THEN
    RAISE EXCEPTION 'behaviour check: fn_delete_clients deleted a client who unsubscribed from texts (%)', v_result;
  END IF;

  RAISE NOTICE 'behaviour checks (consent ledger): all passed';
END $$;
