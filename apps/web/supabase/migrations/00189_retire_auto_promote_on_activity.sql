-- ============================================================================
-- Migration 00189: logging contact no longer moves a client to Boarding
--
-- Since 00105, any real touchpoint (call, text, email, meeting, showing,
-- offer) logged on a Cruising or Scheduled client moved them to Boarding.
-- On 2026-10-06/07 Andrew sent 12 past-client check-in texts from the app's
-- text queue; every one of those past clients became Boarding, counted as
-- Active, and showed as Overdue 14 days later (Boarding with no contact for
-- 14+ days). The app asks for those check-ins (past-client and sphere
-- check-ins, Flight Control), so logging one must not turn a past client
-- into a lead. Andrew, 2026-10-27: "She's a past client who is not
-- currently looking."
--
-- Stage changes are the agent's: a client moves to Boarding when the agent
-- moves them. On 2026-10-27 the kill switch was turned off in prod and the
-- 12 were moved back to Cruising by hand; this records it.
--
-- update_client_last_contact(): the 00171 body without the promotion. It
-- still moves clients.last_contact_at forward, and a note still isn't
-- contact. feature_flags.auto_promote_on_activity and
-- user_settings.auto_categorize_enabled are no longer read; the flag stays
-- off and the column stays (dropping a column is a separate decision).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_client_last_contact()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Notes aren't contact (00171).
  IF NEW.type = 'note' THEN
    RETURN NEW;
  END IF;

  -- Keep clients.last_contact_at in sync; only forward in time, never back.
  -- The client's stage is left alone (00189).
  UPDATE clients
     SET last_contact_at = NEW.activity_date,
         updated_at      = now()
   WHERE id = NEW.client_id
     AND (last_contact_at IS NULL OR NEW.activity_date > last_contact_at);

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.update_client_last_contact() IS
  'Moves clients.last_contact_at forward when contact is logged. Notes are '
  'not contact (00171). Never changes the client''s stage (00189).';

UPDATE feature_flags
   SET enabled     = false,
       description = 'Retired in 00189: logging contact no longer changes a client''s stage. Not read.',
       updated_at  = now()
 WHERE name = 'auto_promote_on_activity';

COMMENT ON COLUMN user_settings.auto_categorize_enabled IS
  'Not read since 00189 (it was the per-user opt-out from moving a client to Boarding on logged contact).';
