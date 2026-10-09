-- ============================================================================
-- Migration 00171: a Note is not contact
--
-- Andrew (2026-10-07) agreed: logging a Note about a client (an internal
-- memo, nobody was reached) must not count as contacting them. Before this,
-- any contact_activities insert moved clients.last_contact_at, so a note
-- hid the client from Flight Control for 14 days and reset "days since
-- contact" in the CRM and the briefing's going-quiet list. The auto-promote
-- guard already treated notes as non-touchpoints (00105/00166); this makes
-- "last contacted" and "first contacted" agree with it.
--
-- Going forward only. Existing last_contact_at values are not recomputed:
-- some came from CSV imports (clients-content.tsx import sets it from a
-- "last activity" column), not from activities. Prod had 1 note ever
-- (2026-03-27), so nothing material changes for existing data.
--
-- update_client_last_contact(): 00166 body, last_contact_at update now
-- skipped for notes. set_client_first_contacted(): skips notes too
-- (first_contacted_at drives the new-client welcome and contact anniversary).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_client_last_contact()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_flag_enabled  BOOLEAN;
  v_user_opted_in BOOLEAN;
BEGIN
  -- Notes aren't contact: nothing below applies to them.
  IF NEW.type = 'note' THEN
    RETURN NEW;
  END IF;

  -- Keep clients.last_contact_at in sync; only forward in time, never back.
  UPDATE clients
     SET last_contact_at = NEW.activity_date,
         updated_at      = now()
   WHERE id = NEW.client_id
     AND (last_contact_at IS NULL OR NEW.activity_date > last_contact_at);

  -- Guard 1: global kill switch (missing row = off)
  SELECT enabled INTO v_flag_enabled
    FROM feature_flags
   WHERE name = 'auto_promote_on_activity';
  IF NOT COALESCE(v_flag_enabled, false) THEN
    RETURN NEW;
  END IF;

  -- Guard 2: per-user opt-out (00104)
  SELECT auto_categorize_enabled INTO v_user_opted_in
    FROM user_settings
   WHERE user_id = NEW.user_id;
  IF NOT COALESCE(v_user_opted_in, true) THEN
    RETURN NEW;
  END IF;

  -- Guard 3: only recent activities (≤ 7 days) — blocks backfill spirals
  IF NEW.activity_date < now() - interval '7 days' THEN
    RETURN NEW;
  END IF;

  -- Guard 4: the promotion, with status / archive / import-quiet filters
  UPDATE clients
     SET status     = 'boarding',
         updated_at = now()
   WHERE id = NEW.client_id
     AND user_id = NEW.user_id
     AND status IN ('cruising', 'scheduled')
     AND archived_at IS NULL
     AND (imported_at IS NULL OR imported_at < now() - interval '24 hours');

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.update_client_last_contact() IS
  'Updates clients.last_contact_at and auto-promotes Cruising/Scheduled '
  'clients to Boarding when a real touchpoint is logged (00105). Notes are '
  'not contact (00171). Kill switch: feature_flags.auto_promote_on_activity.';

CREATE OR REPLACE FUNCTION public.set_client_first_contacted()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.type = 'note' THEN
    RETURN NEW; -- a note is not first contact (00171)
  END IF;
  UPDATE clients
     SET first_contacted_at = NEW.activity_date
   WHERE id = NEW.client_id
     AND first_contacted_at IS NULL;
  RETURN NEW;
END;
$$;
