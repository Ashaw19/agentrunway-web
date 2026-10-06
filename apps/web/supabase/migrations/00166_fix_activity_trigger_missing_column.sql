-- ============================================================================
-- Migration 00166: Restore update_client_last_contact() — every activity
-- insert has failed since 00112 (applied to prod 2026-04-12).
--
-- ROOT CAUSE
--   00112_remove_sandbox_mode only needed to drop the sandbox guard from
--   00105's trigger function. It rewrote the whole function and read
--   user_settings.auto_promote_on_activity, a column no migration ever
--   created. plpgsql resolves that at run time, so every INSERT into
--   contact_activities raised 42703 and rolled back: web "Log Activity",
--   the mobile log-activity API, the Flight Crew logActivity tool, and CSV
--   call/text imports. Last activity saved in prod: 2026-04-08.
--   Reproduced 2026-10-06 in a rolled-back transaction:
--     42703: column "auto_promote_on_activity" does not exist
--
--   Knock-on: clients.last_contact_at stopped moving, so the 14-day outreach
--   suppression and every "days since last contact" signal froze in April.
--
--   The rewrite also inverted the promotion (boarding → scheduled) and
--   dropped 00105's recency, archived and import-quiet guards. Every caller
--   expects 00105 — Cruising/Scheduled → Boarding on a real touchpoint:
--   crm/clients-content.tsx, api/mobile/log-activity, lib/ai/tools.ts,
--   apps/mobile/stores/data-store.ts.
--
-- FIX
--   00105's function minus the sandbox guard (sandbox_mode was dropped in
--   00112), with search_path pinned as 00160 did. The per-user opt-out reads
--   user_settings.auto_categorize_enabled, the column 00104 added for it.
--   Every column referenced below was verified present in prod 2026-10-06.
--   SECURITY INVOKER (default), unchanged.
--
-- KILL SWITCH (unchanged)
--   UPDATE feature_flags SET enabled = false WHERE name = 'auto_promote_on_activity';
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

  -- Guard 3: notes aren't touchpoints
  IF NEW.type = 'note' THEN
    RETURN NEW;
  END IF;

  -- Guard 4: only recent activities (≤ 7 days) — blocks backfill spirals
  IF NEW.activity_date < now() - interval '7 days' THEN
    RETURN NEW;
  END IF;

  -- Guard 5: the promotion, with status / archive / import-quiet filters
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
  'clients to Boarding when a real touchpoint is logged (00105). Restored '
  'in 00166 after 00112 broke every activity insert. '
  'Kill switch: feature_flags.auto_promote_on_activity.';
