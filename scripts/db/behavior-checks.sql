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
