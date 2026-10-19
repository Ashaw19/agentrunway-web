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

  -- 00182: AI undo asks fn_ai_row_references what points at a row before it
  -- deletes one the AI created. Its SQL is dynamic, which plpgsql_check
  -- can't see, so run it here over the whole schema: it must find the three
  -- activities above, and none once they are excluded (same tool call).
  IF coalesce((SELECT refs FROM fn_ai_row_references('clients', v_client)
               WHERE child_table = 'contact_activities' AND child_column = 'client_id'), 0) <> 3 THEN
    RAISE EXCEPTION 'behaviour check: fn_ai_row_references did not count the client''s 3 activities';
  END IF;
  IF EXISTS (
    SELECT 1 FROM fn_ai_row_references(
      'clients', v_client,
      (SELECT array_agg(id) FROM contact_activities WHERE client_id = v_client))
    WHERE child_table = 'contact_activities'
  ) THEN
    RAISE EXCEPTION 'behaviour check: fn_ai_row_references ignored p_exclude_ids';
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

-- 00182: fn_ai_undo_apply runs a whole AI undo as one transaction. Its SQL is
-- dynamic, so exercise it here: a record that changed since rolls everything
-- back; otherwise deleting a logged call and putting back what its trigger
-- did to the client (last contact, first contact, Cruising → Boarding) land
-- together, and the ledger row is marked undone.
DO $$
DECLARE
  v_user   uuid := '00000000-0000-0000-0000-000000000132';
  v_client uuid;
  v_act    uuid;
  v_later  uuid;
  v_vehicle uuid;
  v_write  uuid;
  v_before jsonb;
  v_after  jsonb;
  v_n      integer;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_user::text, true);

  INSERT INTO clients (user_id, name, name_search, status)
  VALUES (v_user, 'CI Undo Check', 'ci undo check', 'cruising')
  RETURNING id INTO v_client;
  SELECT to_jsonb(c) INTO v_before FROM clients c WHERE c.id = v_client;

  -- Undo never touches CASL evidence (00183) or an opt-out, whatever steps
  -- it is handed.
  BEGIN
    PERFORM fn_ai_undo_apply(
      jsonb_build_array(jsonb_build_object('op', 'delete', 'table', 'client_email_consents', 'pk', 'id', 'row_id', gen_random_uuid()::text)),
      ARRAY[]::uuid[]);
    RAISE EXCEPTION 'behaviour check: fn_ai_undo_apply accepted a step on a consent record';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'ai_undo_bad_step: client_email_consents is never changed by undo%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM fn_ai_undo_apply(
      jsonb_build_array(jsonb_build_object('op', 'update', 'table', 'clients', 'pk', 'id', 'row_id', v_client::text,
                                           'set', jsonb_build_object('email_opt_out_at', NULL))),
      ARRAY[]::uuid[]);
    RAISE EXCEPTION 'behaviour check: fn_ai_undo_apply accepted clearing an opt-out';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'ai_undo_bad_step: undo never changes an opt-out%' THEN RAISE; END IF;
  END;

  -- The AI's call, an hour ago (created_at is set explicitly: now() is fixed
  -- for the whole DO block).
  INSERT INTO contact_activities (user_id, client_id, type, description, activity_date, created_at)
  VALUES (v_user, v_client, 'call', 'ci undo check', now() - interval '1 hour', now() - interval '1 hour')
  RETURNING id INTO v_act;
  SELECT to_jsonb(c) INTO v_after FROM clients c WHERE c.id = v_client;
  IF v_after ->> 'last_contact_at' IS NULL THEN
    RAISE EXCEPTION 'behaviour check: the call did not set last_contact_at, so the undo check proves nothing';
  END IF;

  INSERT INTO ai_run_writes (user_id, tool_call_id, tool_name, source, table_name, row_id, action, after_image)
  VALUES (v_user, 'ci-undo', 'logContactActivity', 'approval', 'contact_activities', v_act::text, 'insert', '{}'::jsonb)
  RETURNING id INTO v_write;

  -- A record that changed since: nothing happens.
  BEGIN
    PERFORM fn_ai_undo_apply(
      jsonb_build_array(jsonb_build_object(
        'op', 'delete', 'table', 'contact_activities', 'pk', 'id', 'row_id', v_act::text,
        'expect', jsonb_build_object('description', 'not what is there'))),
      ARRAY[v_write]);
    RAISE EXCEPTION 'behaviour check: fn_ai_undo_apply ignored a record that changed';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'ai_undo_changed%' THEN RAISE; END IF;
  END;
  IF NOT EXISTS (SELECT 1 FROM contact_activities WHERE id = v_act)
     OR (SELECT undone_at FROM ai_run_writes WHERE id = v_write) IS NOT NULL THEN
    RAISE EXCEPTION 'behaviour check: a refused AI undo changed something';
  END IF;

  -- A call logged since, dated earlier: the trigger leaves the client as it
  -- was (last_contact_at only moves forward), so only no_later can tell.
  INSERT INTO contact_activities (user_id, client_id, type, description, activity_date, created_at)
  VALUES (v_user, v_client, 'call', 'logged later, dated earlier', now() - interval '2 days', now())
  RETURNING id INTO v_later;
  IF (SELECT to_jsonb(c) FROM clients c WHERE c.id = v_client) IS DISTINCT FROM v_after THEN
    RAISE EXCEPTION 'behaviour check: the earlier-dated call changed the client, so the no_later check proves nothing';
  END IF;
  BEGIN
    PERFORM fn_ai_undo_apply(
      jsonb_build_array(
        jsonb_build_object('op', 'update', 'table', 'clients', 'pk', 'id', 'row_id', v_client::text,
                           'expect', v_after,
                           'set', jsonb_build_object('last_contact_at', v_before -> 'last_contact_at'),
                           'no_later', jsonb_build_object(
                             'table', 'contact_activities', 'column', 'client_id', 'value', v_client::text,
                             'after', (now() - interval '1 hour')::text, 'exclude_ids', jsonb_build_array(v_act::text),
                             'skip_column', 'type', 'skip_value', 'note'))),
      ARRAY[v_write]);
    RAISE EXCEPTION 'behaviour check: fn_ai_undo_apply rolled a client back past a call logged since';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'ai_undo_later%' THEN RAISE; END IF;
  END;
  -- A note logged since doesn't count (a note isn't contact, 00171).
  UPDATE contact_activities SET type = 'note' WHERE id = v_later;

  -- The real undo: both steps, one transaction.
  v_n := fn_ai_undo_apply(
    jsonb_build_array(
      jsonb_build_object('op', 'delete', 'table', 'contact_activities', 'pk', 'id', 'row_id', v_act::text,
                         'expect', jsonb_build_object('type', 'call', 'client_id', v_client)),
      jsonb_build_object('op', 'update', 'table', 'clients', 'pk', 'id', 'row_id', v_client::text,
                         'expect', v_after,
                         'set', jsonb_build_object(
                           'status', v_before -> 'status',
                           'last_contact_at', v_before -> 'last_contact_at',
                           'first_contacted_at', v_before -> 'first_contacted_at'),
                         'no_later', jsonb_build_object(
                           'table', 'contact_activities', 'column', 'client_id', 'value', v_client::text,
                           'after', (now() - interval '1 hour')::text, 'exclude_ids', jsonb_build_array(v_act::text),
                           'skip_column', 'type', 'skip_value', 'note'))),
    ARRAY[v_write]);
  IF v_n <> 2
     OR EXISTS (SELECT 1 FROM contact_activities WHERE id = v_act)
     OR (SELECT status FROM clients WHERE id = v_client) <> 'cruising'
     OR (SELECT last_contact_at FROM clients WHERE id = v_client) IS NOT NULL
     OR (SELECT undone_at FROM ai_run_writes WHERE id = v_write) IS NULL THEN
    RAISE EXCEPTION 'behaviour check: fn_ai_undo_apply did not undo the call and its trigger effects together (n=%)', v_n;
  END IF;

  -- Composite foreign keys count (00184: (user_id, vehicle_id) → vehicles
  -- (user_id, id)), so undoing "created a vehicle" can't cascade away a
  -- logbook period logged against it since.
  INSERT INTO vehicles (user_id, name) VALUES (v_user, 'CI Undo Car') RETURNING id INTO v_vehicle;
  INSERT INTO vehicle_logbook_periods (user_id, vehicle_id, kind, start_date, end_date)
  VALUES (v_user, v_vehicle, 'base', '2026-01-01', '2026-12-31');
  IF coalesce((SELECT refs FROM fn_ai_row_references('vehicles', v_vehicle)
               WHERE child_table = 'vehicle_logbook_periods' AND child_column = 'vehicle_id'), 0) <> 1 THEN
    RAISE EXCEPTION 'behaviour check: fn_ai_row_references missed a composite foreign key';
  END IF;

  RAISE NOTICE 'behaviour checks: AI undo passed';
END $$;
