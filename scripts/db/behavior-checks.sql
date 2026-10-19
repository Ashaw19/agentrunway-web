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

-- 00185: statement import. Run as the signed-in agent (role authenticated,
-- row level security on), the way the web, Flight Crew and the MCP server
-- call these functions. A charge counts once: a line for a charge already on
-- file is linked, never added; a held line is refused; any other line is
-- added once with GST/HST empty; a deleted expense sends its line back; a
-- receipt saved, or corrected, after its charge was confirmed replaces the
-- statement copy, and one that only comes close flags the line;
-- a recurring expense that changes sends its lines back; another agent's
-- lines can't be seen or confirmed. And 5,000 lines stay inside the
-- statement timeout.
DO $$
DECLARE
  v_user      uuid := '00000000-0000-0000-0000-000000000132';
  v_other     uuid := '00000000-0000-0000-0000-000000000185';
  v_cat       uuid;
  v_stmt      uuid;
  v_stmt2     uuid;
  v_theirs    uuid;
  v_new       uuid;
  v_dup       uuid;
  v_rec_line  uuid;
  v_held      uuid;
  v_twin      uuid;
  v_their_line uuid;
  v_receipt   uuid;
  v_late      uuid;
  v_recurring uuid;
  v_result    jsonb;
  v_copy      uuid;
  v_n         integer;
  v_status    text;
  v_hold      text;
  v_t0        timestamptz;
  v_ms        numeric;
  v_big       uuid;
  v_flags     jsonb;
  v_ids       jsonb;
  v_ocr_line  uuid;
  v_ocr       uuid;
  v_date_line uuid;
  v_dated     uuid;
  v_keg_line  uuid;
  v_keg       uuid;
  v_gas_line  uuid;
  v_book      uuid;
BEGIN
  -- ── Set-up, as the database owner ────────────────────────────────────────
  INSERT INTO auth.users (id, email) VALUES (v_other, 'someone-else@example.test') ON CONFLICT (id) DO NOTHING;
  -- A throwaway database: make sure the signed-in role can reach the tables
  -- the functions touch (production grants these already).
  GRANT SELECT, INSERT, UPDATE, DELETE ON receipt_expenses, recurring_expenses, expense_items, expense_categories TO authenticated;

  INSERT INTO expense_categories (user_id, key, title, sort_order)
  VALUES (v_user, 'vehicle', 'Vehicle', 0)
  ON CONFLICT (user_id, key) DO NOTHING;
  SELECT id INTO v_cat FROM expense_categories WHERE user_id = v_user AND key = 'vehicle';
  INSERT INTO expense_items (user_id, category_id, key, title, sort_order)
  VALUES (v_user, v_cat, 'vehicle_fuel', 'Fuel', 0)
  ON CONFLICT (user_id, key) DO NOTHING;

  INSERT INTO receipt_expenses (user_id, vendor, expense_date, total_amount, tax_amount, category_key)
  VALUES (v_user, 'CI Shell', '2026-09-10', 54.20, 7.07, 'vehicle_fuel')
  RETURNING id INTO v_receipt;
  INSERT INTO recurring_expenses (user_id, name, amount, category_key, day_of_month, start_date)
  VALUES (v_user, 'CI lease', 575, 'vehicle_payment', 15, '2026-01-01')
  RETURNING id INTO v_recurring;

  INSERT INTO imported_statements (user_id, kind, source_format, account_label, file_hash, period_start, period_end)
  VALUES (v_user, 'credit_card', 'csv:generic', 'CI card', repeat('a', 64), '2026-09-01', '2026-09-30')
  RETURNING id INTO v_stmt;
  INSERT INTO imported_statements (user_id, kind, source_format, account_label, file_hash, period_start, period_end, verification)
  VALUES (v_user, 'credit_card', 'pdf', 'CI card', repeat('b', 64), '2026-09-01', '2026-09-30', 'unverified')
  RETURNING id INTO v_stmt2;
  INSERT INTO imported_statements (user_id, kind, source_format, account_label, file_hash, period_start, period_end)
  VALUES (v_other, 'bank', 'csv:generic', 'Not mine', repeat('c', 64), '2026-09-01', '2026-09-30')
  RETURNING id INTO v_theirs;

  -- Lines as the upload stages them, with the duplicate check's columns.
  INSERT INTO statement_lines (user_id, statement_id, line_date, description, amount, direction, fingerprint, suggested_category_key)
  VALUES (v_user, v_stmt, '2026-09-12', 'CI PETRO', 40.00, 'out', repeat('1', 64), 'vehicle_fuel')
  RETURNING id INTO v_new;
  INSERT INTO statement_lines (user_id, statement_id, line_date, description, amount, direction, fingerprint, match_receipt_id, match_method, duplicate_candidate_count)
  VALUES (v_user, v_stmt, '2026-09-10', 'CI SHELL', 54.20, 'out', repeat('2', 64), v_receipt, 'exact', 1)
  RETURNING id INTO v_dup;
  INSERT INTO statement_lines (user_id, statement_id, line_date, description, amount, direction, fingerprint, recurring_expense_id, recurring_charge_date, duplicate_candidate_count)
  VALUES (v_user, v_stmt, '2026-09-15', 'CI LEASE', 575, 'out', repeat('3', 64), v_recurring, '2026-09-15', 1)
  RETURNING id INTO v_rec_line;
  INSERT INTO statement_lines (user_id, statement_id, line_date, description, amount, direction, fingerprint, suggested_category_key)
  VALUES (v_user, v_stmt, '2026-09-20', 'CI HELD', 30, 'out', repeat('4', 64), 'vehicle_fuel')
  RETURNING id INTO v_held;
  -- The PDF of the same month: its copy of the 40.00 charge.
  INSERT INTO statement_lines (user_id, statement_id, line_date, description, amount, direction, fingerprint, suggested_category_key)
  VALUES (v_user, v_stmt2, '2026-09-12', 'CI PETRO CANADA', 40.00, 'out', repeat('5', 64), 'vehicle_fuel')
  RETURNING id INTO v_twin;
  INSERT INTO statement_lines (user_id, statement_id, line_date, description, amount, direction, fingerprint, suggested_category_key)
  VALUES (v_other, v_theirs, '2026-09-12', 'NOT MINE', 9.99, 'out', repeat('6', 64), 'vehicle_fuel')
  RETURNING id INTO v_their_line;

  IF (SELECT line_count FROM imported_statements WHERE id = v_stmt) <> 4
     OR (SELECT pending_count FROM imported_statements WHERE id = v_stmt) <> 4 THEN
    RAISE EXCEPTION 'behaviour check: statement counts were not kept by the statement-level trigger';
  END IF;

  -- ── As the signed-in agent ──────────────────────────────────────────────
  -- auth.uid(): older definitions read request.jwt.claim.sub, newer ones
  -- request.jwt.claims. Set both.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_user::text, true);
  SET LOCAL ROLE authenticated;
  IF auth.uid() IS DISTINCT FROM v_user THEN
    RAISE EXCEPTION 'behaviour check setup: auth.uid() is %, expected the CI user', auth.uid();
  END IF;

  -- Row level security: another agent's lines can't be seen, flagged or confirmed.
  IF EXISTS (SELECT 1 FROM statement_lines WHERE id = v_their_line) OR EXISTS (SELECT 1 FROM imported_statements WHERE id = v_theirs) THEN
    RAISE EXCEPTION 'behaviour check: an agent can read another agent''s statement lines';
  END IF;
  IF fn_set_statement_line_flags(jsonb_build_array(jsonb_build_object('id', v_their_line, 'hold_reason', 'several'))) <> 0 THEN
    RAISE EXCEPTION 'behaviour check: fn_set_statement_line_flags changed another agent''s line';
  END IF;
  v_result := fn_confirm_statement_lines(jsonb_build_array(jsonb_build_object('id', v_their_line)));
  IF (v_result->'refused'->0->>'reason') IS DISTINCT FROM 'not_found' THEN
    RAISE EXCEPTION 'behaviour check: another agent''s line was confirmable: %', v_result;
  END IF;

  -- The duplicate check's results, in one statement: the held line, and the
  -- other import's copy of the 40.00 charge.
  v_n := fn_set_statement_line_flags(jsonb_build_array(
    jsonb_build_object('id', v_held, 'hold_reason', 'near_match', 'duplicate_candidate_count', 1, 'related_receipt_id', v_receipt),
    jsonb_build_object('id', v_twin, 'hold_reason', 'other_import', 'duplicate_candidate_count', 1, 'related_line_id', v_new)));
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'behaviour check: fn_set_statement_line_flags wrote % lines, expected 2', v_n;
  END IF;

  v_result := fn_confirm_statement_lines(jsonb_build_array(
    jsonb_build_object('id', v_new), jsonb_build_object('id', v_dup),
    jsonb_build_object('id', v_rec_line), jsonb_build_object('id', v_held), jsonb_build_object('id', v_twin)));

  IF jsonb_array_length(v_result->'created') <> 1 OR jsonb_array_length(v_result->'linked') <> 1
     OR jsonb_array_length(v_result->'recurring') <> 1 OR jsonb_array_length(v_result->'refused') <> 2 THEN
    RAISE EXCEPTION 'behaviour check: fn_confirm_statement_lines outcome %', v_result;
  END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(v_result->'refused') r WHERE r->>'reason' = 'needs_decision') <> 2 THEN
    RAISE EXCEPTION 'behaviour check: held lines (near match, other import) were not refused: %', v_result;
  END IF;

  SELECT count(*) INTO v_n FROM receipt_expenses WHERE user_id = v_user AND source = 'statement_import';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'behaviour check: confirming added % expenses, expected 1 (duplicates are linked or held, not added)', v_n;
  END IF;
  SELECT id INTO v_copy FROM receipt_expenses WHERE statement_line_id = v_new AND tax_amount IS NULL AND total_amount = 40.00;
  IF v_copy IS NULL THEN
    RAISE EXCEPTION 'behaviour check: the added expense is not the line as paid with GST/HST empty';
  END IF;
  IF (SELECT statement_line_id FROM receipt_expenses WHERE id = v_receipt) IS DISTINCT FROM v_dup THEN
    RAISE EXCEPTION 'behaviour check: the duplicate line was not linked to its receipt';
  END IF;
  IF (SELECT confirmed_count FROM imported_statements WHERE id = v_stmt) <> 3
     OR (SELECT pending_count FROM imported_statements WHERE id = v_stmt) <> 1 THEN
    RAISE EXCEPTION 'behaviour check: counts after confirm are wrong';
  END IF;

  -- An item key that isn't one: refused, whatever expense_items holds.
  v_result := fn_confirm_statement_lines(jsonb_build_array(jsonb_build_object('id', v_held, 'category_key', 'travel_meals')));
  IF (v_result->'refused'->0->>'reason') NOT IN ('needs_decision', 'unknown_category') THEN
    RAISE EXCEPTION 'behaviour check: unexpected outcome for a bad key %', v_result;
  END IF;

  -- Confirming again changes nothing.
  v_result := fn_confirm_statement_lines(jsonb_build_array(jsonb_build_object('id', v_new)));
  IF (SELECT count(*) FROM receipt_expenses WHERE statement_line_id = v_new) <> 1 THEN
    RAISE EXCEPTION 'behaviour check: confirming twice added a second expense';
  END IF;

  -- Deleting the added expense sends the line back, marked so bulk confirm leaves it out.
  DELETE FROM receipt_expenses WHERE id = v_copy;
  SELECT status INTO v_status FROM statement_lines WHERE id = v_new;
  IF v_status <> 'pending' OR (SELECT expense_deleted_at FROM statement_lines WHERE id = v_new) IS NULL THEN
    RAISE EXCEPTION 'behaviour check: a line whose expense was deleted is % and unmarked', v_status;
  END IF;

  -- Confirmed again, then a receipt for the same charge saved later (any
  -- screen): it replaces the statement copy, keeps its printed tax, takes the category.
  v_result := fn_confirm_statement_lines(jsonb_build_array(jsonb_build_object('id', v_new)));
  INSERT INTO receipt_expenses (user_id, vendor, expense_date, total_amount, tax_amount, receipt_path)
  VALUES (v_user, 'CI Petro', '2026-09-12', 40.00, 5.22, 'ci/receipt.jpg')
  RETURNING id INTO v_late;
  IF (SELECT count(*) FROM receipt_expenses WHERE user_id = v_user AND expense_date = '2026-09-12') <> 1 THEN
    RAISE EXCEPTION 'behaviour check: a receipt saved after its charge was confirmed doubled the expense';
  END IF;
  IF (SELECT statement_line_id FROM receipt_expenses WHERE id = v_late) IS DISTINCT FROM v_new
     OR (SELECT tax_amount FROM receipt_expenses WHERE id = v_late) <> 5.22
     OR (SELECT category_key FROM receipt_expenses WHERE id = v_late) IS DISTINCT FROM 'vehicle_fuel'
     OR (SELECT status FROM statement_lines WHERE id = v_new) <> 'confirmed' THEN
    RAISE EXCEPTION 'behaviour check: the later receipt did not take over the line';
  END IF;

  -- A receipt two days off is only flagged for the agent.
  v_result := fn_reopen_statement_lines(ARRAY[v_new]);
  UPDATE statement_lines SET match_receipt_id = NULL, match_method = NULL, duplicate_candidate_count = 0, duplicate_dismissed = true WHERE id = v_new;
  DELETE FROM receipt_expenses WHERE id = v_late;
  v_result := fn_confirm_statement_lines(jsonb_build_array(jsonb_build_object('id', v_new)));
  INSERT INTO receipt_expenses (user_id, vendor, expense_date, total_amount, tax_amount)
  VALUES (v_user, 'CI Petro', '2026-09-14', 40.00, 5.22)
  RETURNING id INTO v_late;
  SELECT hold_reason INTO v_hold FROM statement_lines WHERE id = v_new;
  IF v_hold IS DISTINCT FROM 'later_receipt' OR (SELECT related_receipt_id FROM statement_lines WHERE id = v_new) IS DISTINCT FROM v_late THEN
    RAISE EXCEPTION 'behaviour check: a receipt two days off was not flagged (hold %)', v_hold;
  END IF;

  -- Matching it by hand replaces the statement copy.
  v_result := fn_match_statement_line(v_new, v_late);
  IF NOT (v_result->>'ok')::boolean OR (v_result->>'replaced_receipt_id') IS NULL THEN
    RAISE EXCEPTION 'behaviour check: fn_match_statement_line %', v_result;
  END IF;
  IF (SELECT count(*) FROM receipt_expenses WHERE user_id = v_user AND total_amount = 40.00) <> 1 THEN
    RAISE EXCEPTION 'behaviour check: after matching, the charge is recorded more than once';
  END IF;

  -- Back to review keeps the receipt and unlinks it.
  v_result := fn_reopen_statement_lines(ARRAY[v_new]);
  IF (v_result->>'reopened')::int <> 1 OR (SELECT statement_line_id FROM receipt_expenses WHERE id = v_late) IS NOT NULL THEN
    RAISE EXCEPTION 'behaviour check: fn_reopen_statement_lines %', v_result;
  END IF;

  -- A receipt saved with nothing read (OCR failed), then corrected by hand:
  -- the correction is an UPDATE, and it replaces the statement copy too.
  INSERT INTO statement_lines (user_id, statement_id, line_date, description, amount, direction, fingerprint, suggested_category_key)
  VALUES (v_user, v_stmt, '2026-09-22', 'CI ESSO 1234', 60.00, 'out', repeat('7', 64), 'vehicle_fuel')
  RETURNING id INTO v_ocr_line;
  v_result := fn_confirm_statement_lines(jsonb_build_array(jsonb_build_object('id', v_ocr_line)));
  INSERT INTO receipt_expenses (user_id, vendor, expense_date, total_amount, tax_amount, receipt_path)
  VALUES (v_user, NULL, NULL, NULL, NULL, 'ci/ocr-failed.jpg')
  RETURNING id INTO v_ocr;
  IF (SELECT statement_line_id FROM receipt_expenses WHERE id = v_ocr) IS NOT NULL THEN
    RAISE EXCEPTION 'behaviour check: a receipt with nothing read was linked to a line';
  END IF;
  UPDATE receipt_expenses SET vendor = 'CI Esso', expense_date = '2026-09-22', total_amount = 60.00, tax_amount = 7.83 WHERE id = v_ocr;
  IF (SELECT count(*) FROM receipt_expenses WHERE user_id = v_user AND expense_date = '2026-09-22') <> 1
     OR (SELECT statement_line_id FROM receipt_expenses WHERE id = v_ocr) IS DISTINCT FROM v_ocr_line
     OR (SELECT match_receipt_id FROM statement_lines WHERE id = v_ocr_line) IS DISTINCT FROM v_ocr
     OR (SELECT status FROM statement_lines WHERE id = v_ocr_line) <> 'confirmed'
     OR (SELECT category_key FROM receipt_expenses WHERE id = v_ocr) IS DISTINCT FROM 'vehicle_fuel' THEN
    RAISE EXCEPTION 'behaviour check: a receipt corrected after an OCR failure did not replace the statement copy (the charge counts twice)';
  END IF;

  -- Saved with the wrong date, then the date corrected: the same.
  INSERT INTO statement_lines (user_id, statement_id, line_date, description, amount, direction, fingerprint, suggested_category_key)
  VALUES (v_user, v_stmt, '2026-09-24', 'CI STAPLES', 33.33, 'out', repeat('8', 64), 'office_supplies')
  RETURNING id INTO v_date_line;
  v_result := fn_confirm_statement_lines(jsonb_build_array(jsonb_build_object('id', v_date_line)));
  INSERT INTO receipt_expenses (user_id, vendor, expense_date, total_amount, tax_amount)
  VALUES (v_user, 'CI Staples', '2026-07-24', 33.33, 4.35)
  RETURNING id INTO v_dated;
  IF (SELECT hold_reason FROM statement_lines WHERE id = v_date_line) IS NOT NULL THEN
    RAISE EXCEPTION 'behaviour check: a receipt two months away flagged a line';
  END IF;
  UPDATE receipt_expenses SET expense_date = '2026-09-24' WHERE id = v_dated;
  IF (SELECT count(*) FROM receipt_expenses WHERE user_id = v_user AND total_amount = 33.33) <> 1
     OR (SELECT statement_line_id FROM receipt_expenses WHERE id = v_dated) IS DISTINCT FROM v_date_line THEN
    RAISE EXCEPTION 'behaviour check: a receipt whose date was corrected did not replace the statement copy';
  END IF;

  -- A near miss saved after the confirm: the same merchant, a pre-tip amount
  -- within 25%. The line is flagged for the agent, not left to count twice
  -- unnoticed.
  INSERT INTO statement_lines (user_id, statement_id, line_date, description, amount, direction, fingerprint, suggested_category_key)
  VALUES (v_user, v_stmt, '2026-09-25', 'CI THE KEG STEAKHOUSE', 75.00, 'out', repeat('9', 64), 'meals_client')
  RETURNING id INTO v_keg_line;
  v_result := fn_confirm_statement_lines(jsonb_build_array(jsonb_build_object('id', v_keg_line)));
  INSERT INTO receipt_expenses (user_id, vendor, expense_date, total_amount, tax_amount)
  VALUES (v_user, 'The Keg', '2026-09-25', 62.50, 7.19)
  RETURNING id INTO v_keg;
  SELECT hold_reason INTO v_hold FROM statement_lines WHERE id = v_keg_line;
  IF v_hold IS DISTINCT FROM 'later_receipt' OR (SELECT related_receipt_id FROM statement_lines WHERE id = v_keg_line) IS DISTINCT FROM v_keg THEN
    RAISE EXCEPTION 'behaviour check: a same-merchant receipt within 25%% saved after the confirm was not flagged (hold %)', v_hold;
  END IF;
  -- Edited to an amount that no longer comes close: the flag goes.
  UPDATE receipt_expenses SET total_amount = 20.00 WHERE id = v_keg;
  IF (SELECT hold_reason FROM statement_lines WHERE id = v_keg_line) IS NOT NULL THEN
    RAISE EXCEPTION 'behaviour check: a receipt edited away from a flagged line left the flag';
  END IF;

  -- Another merchant at a nearby amount is not a near miss.
  INSERT INTO statement_lines (user_id, statement_id, line_date, description, amount, direction, fingerprint, suggested_category_key)
  VALUES (v_user, v_stmt, '2026-09-26', 'CI COSTCO GAS', 50.00, 'out', repeat('0', 64), 'vehicle_fuel')
  RETURNING id INTO v_gas_line;
  v_result := fn_confirm_statement_lines(jsonb_build_array(jsonb_build_object('id', v_gas_line)));
  INSERT INTO receipt_expenses (user_id, vendor, expense_date, total_amount, tax_amount)
  VALUES (v_user, 'CI Bookstore', '2026-09-26', 45.00, 5.87)
  RETURNING id INTO v_book;
  IF (SELECT hold_reason FROM statement_lines WHERE id = v_gas_line) IS NOT NULL THEN
    RAISE EXCEPTION 'behaviour check: a receipt from another merchant flagged a line';
  END IF;

  -- Changing the recurring expense's charge day sends its confirmed line back, held.
  UPDATE recurring_expenses SET day_of_month = 20 WHERE id = v_recurring;
  SELECT status, hold_reason INTO v_status, v_hold FROM statement_lines WHERE id = v_rec_line;
  IF v_status <> 'pending' OR v_hold IS DISTINCT FROM 'recurring_changed' THEN
    RAISE EXCEPTION 'behaviour check: a line counted by a changed recurring expense is % (%)', v_status, v_hold;
  END IF;
  -- Renaming it does not.
  UPDATE statement_lines SET recurring_expense_id = v_recurring, recurring_charge_date = '2026-09-20', hold_reason = NULL WHERE id = v_rec_line;
  v_result := fn_confirm_statement_lines(jsonb_build_array(jsonb_build_object('id', v_rec_line)));
  UPDATE recurring_expenses SET name = 'CI lease, renamed' WHERE id = v_recurring;
  IF (SELECT status FROM statement_lines WHERE id = v_rec_line) <> 'confirmed' THEN
    RAISE EXCEPTION 'behaviour check: renaming a recurring expense sent its line back';
  END IF;
  -- Deleting it sends the line back too.
  DELETE FROM recurring_expenses WHERE id = v_recurring;
  IF (SELECT status FROM statement_lines WHERE id = v_rec_line) <> 'pending' THEN
    RAISE EXCEPTION 'behaviour check: a line confirmed as a deleted recurring charge stayed confirmed';
  END IF;

  -- ── 5,000 lines: staging, the duplicate check's write and a confirm ─────
  RESET ROLE;
  INSERT INTO imported_statements (user_id, kind, source_format, account_label, file_hash, period_start, period_end)
  VALUES (v_user, 'bank', 'csv:generic', 'CI big', repeat('d', 64), '2020-01-01', '2026-09-30')
  RETURNING id INTO v_big;
  SET LOCAL ROLE authenticated;

  v_t0 := clock_timestamp();
  INSERT INTO statement_lines (user_id, statement_id, line_date, description, amount, direction, fingerprint, suggested_category_key, business_likelihood)
  SELECT v_user, v_big, date '2020-01-01' + (g % 2000), 'CI LINE ' || g, 10 + (g % 50), 'out', md5('big' || g) || md5('line' || g), 'vehicle_fuel', 0.6
    FROM generate_series(1, 5000) g
  ON CONFLICT (user_id, fingerprint) DO NOTHING;
  v_ms := extract(epoch FROM clock_timestamp() - v_t0) * 1000;
  IF v_ms > 8000 OR (SELECT line_count FROM imported_statements WHERE id = v_big) <> 5000 THEN
    RAISE EXCEPTION 'behaviour check: staging 5,000 lines took % ms (counts %)', round(v_ms), (SELECT line_count FROM imported_statements WHERE id = v_big);
  END IF;

  SELECT jsonb_agg(jsonb_build_object('id', id, 'duplicate_candidate_count', 0)) INTO v_flags
    FROM statement_lines WHERE statement_id = v_big;
  v_t0 := clock_timestamp();
  v_n := fn_set_statement_line_flags(v_flags);
  v_ms := extract(epoch FROM clock_timestamp() - v_t0) * 1000;
  IF v_n <> 5000 OR v_ms > 8000 THEN
    RAISE EXCEPTION 'behaviour check: flagging 5,000 lines wrote % in % ms', v_n, round(v_ms);
  END IF;

  SELECT jsonb_agg(jsonb_build_object('id', id)) INTO v_ids
    FROM (SELECT id FROM statement_lines WHERE statement_id = v_big ORDER BY id LIMIT 2000) x;
  v_t0 := clock_timestamp();
  v_result := fn_confirm_statement_lines(v_ids);
  v_ms := extract(epoch FROM clock_timestamp() - v_t0) * 1000;
  IF jsonb_array_length(v_result->'created') <> 2000 OR v_ms > 8000 THEN
    RAISE EXCEPTION 'behaviour check: confirming 2,000 lines created % in % ms', jsonb_array_length(v_result->'created'), round(v_ms);
  END IF;
  IF (SELECT confirmed_count FROM imported_statements WHERE id = v_big) <> 2000
     OR (SELECT pending_count FROM imported_statements WHERE id = v_big) <> 3000 THEN
    RAISE EXCEPTION 'behaviour check: counts after a 2,000-line confirm are wrong';
  END IF;

  RESET ROLE;
  RAISE NOTICE 'behaviour checks (00185 statement import): all passed';
END $$;

-- 00188: suggestion holds and the day's handful. A hold row must say how long
-- it lasts and cover the client; a pin is open or handled; and a client has
-- ONE open pin, which fn_merge_clients' generic FK loop relies on (a clash
-- raises unique_violation and the loop deletes the loser's row).
DO $$
DECLARE
  v_user   uuid := '00000000-0000-0000-0000-000000000132';
  v_a      uuid;
  v_b      uuid;
  v_pin_b  uuid;
  v_open   integer;
BEGIN
  -- fn_merge_clients checks auth.uid().
  PERFORM set_config('request.jwt.claim.sub', v_user::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user)::text, true);

  INSERT INTO clients (user_id, name, name_search)
  VALUES (v_user, 'CI Handful A', 'ci handful a') RETURNING id INTO v_a;
  INSERT INTO clients (user_id, name, name_search)
  VALUES (v_user, 'CI Handful B', 'ci handful b') RETURNING id INTO v_b;

  -- Holds: a skip has no end, a hold has one and covers the client.
  INSERT INTO flight_control_dismissals (user_id, client_id, opportunity_type, trigger_date)
  VALUES (v_user, v_a, 'birthday', '2026-10-19');
  IF (SELECT kind FROM flight_control_dismissals WHERE client_id = v_a AND opportunity_type = 'birthday') <> 'skip' THEN
    RAISE EXCEPTION 'behaviour check: a dismissal with no kind is not a skip';
  END IF;
  INSERT INTO flight_control_dismissals (user_id, client_id, opportunity_type, trigger_date, kind, until)
  VALUES (v_user, v_a, 'any', '2026-10-19', 'later', now() + interval '1 hour');
  BEGIN
    INSERT INTO flight_control_dismissals (user_id, client_id, opportunity_type, trigger_date, kind)
    VALUES (v_user, v_b, 'any', '2026-10-19', 'later');
    RAISE EXCEPTION 'behaviour check: a hold with no end was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO flight_control_dismissals (user_id, client_id, opportunity_type, trigger_date, until)
    VALUES (v_user, v_b, 'birthday', '2026-10-19', now() + interval '1 hour');
    RAISE EXCEPTION 'behaviour check: a skip with an end was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO flight_control_dismissals (user_id, client_id, opportunity_type, trigger_date, kind, until)
    VALUES (v_user, v_b, 'birthday', '2026-10-19', 'stop', now() + interval '3 months');
    RAISE EXCEPTION 'behaviour check: a hold on one reason, not the client, was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO flight_control_dismissals (user_id, client_id, opportunity_type, trigger_date, kind, until)
    VALUES (v_user, v_b, 'any', '2026-10-19', 'snooze', now() + interval '1 hour');
    RAISE EXCEPTION 'behaviour check: an unknown hold kind was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- Pins: open or handled, never half of each.
  BEGIN
    INSERT INTO next_up_handful (user_id, client_id, opportunity_type, trigger_date, rank, handled_at)
    VALUES (v_user, v_b, 'birthday', '2026-10-19', 0, now());
    RAISE EXCEPTION 'behaviour check: a pin handled with no how was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- Two clients of one user each have an open pin.
  INSERT INTO next_up_handful (user_id, client_id, opportunity_type, trigger_date, rank)
  VALUES (v_user, v_a, 'birthday', '2026-10-19', 0);
  INSERT INTO next_up_handful (user_id, client_id, opportunity_type, trigger_date, rank)
  VALUES (v_user, v_b, 'birthday', '2026-10-19', 1) RETURNING id INTO v_pin_b;

  -- A client has one open pin; handled pins are history and may repeat.
  BEGIN
    INSERT INTO next_up_handful (user_id, client_id, opportunity_type, trigger_date, rank)
    VALUES (v_user, v_a, 'idle', '2026-10-19', 2);
    RAISE EXCEPTION 'behaviour check: a second open pin for one client was accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  INSERT INTO next_up_handful (user_id, client_id, opportunity_type, trigger_date, rank, handled_at, handled_how)
  VALUES (v_user, v_a, 'idle', '2026-10-18', 0, now(), 'contacted'),
         (v_user, v_a, 'idle', '2026-10-17', 0, now(), 'expired');

  -- Merging them succeeds.
  PERFORM fn_merge_clients(v_a, ARRAY[v_b]);

  -- The generic FK loop repoints B's pin to A, hits the clash and deletes it.
  -- This replay's loop moves nothing, for any table (see the consent block
  -- above), so do that step by hand for a pin still on the duplicate. Where
  -- the loop does run it has already done this and the step is skipped.
  IF EXISTS (SELECT 1 FROM next_up_handful WHERE id = v_pin_b AND client_id = v_b) THEN
    BEGIN
      UPDATE next_up_handful SET client_id = v_a WHERE id = v_pin_b;
      RAISE EXCEPTION 'behaviour check: repointing a pin onto a client with an open pin did not clash';
    EXCEPTION WHEN unique_violation THEN
      DELETE FROM next_up_handful WHERE id = v_pin_b;
    END;
  END IF;

  -- Exactly one open pin remains, on the surviving client.
  SELECT count(*) INTO v_open FROM next_up_handful
   WHERE user_id = v_user AND client_id IN (v_a, v_b) AND handled_at IS NULL;
  IF v_open <> 1 THEN
    RAISE EXCEPTION 'behaviour check: % open pins remain after merging two clients that each had one', v_open;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM next_up_handful WHERE client_id = v_a AND handled_at IS NULL) THEN
    RAISE EXCEPTION 'behaviour check: the open pin is not on the surviving client';
  END IF;

  RAISE NOTICE 'behaviour checks (00188 handful): all passed';
END $$;
