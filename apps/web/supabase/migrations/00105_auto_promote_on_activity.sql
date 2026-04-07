-- ============================================================================
-- Migration 00105: Auto-promote on activity (Phase 3 Wave A)
--
-- Extends the existing update_client_last_contact() trigger function to
-- ALSO flip a client's flight status from Cruising/Scheduled → Boarding
-- when a real touchpoint is logged. The original last_contact_at update
-- behavior is preserved exactly — this is purely an addition.
--
-- WHY ONE TRIGGER FOR ALL INSERT PATHS
--   contact_activities is written from at least 5 places: the AI tool
--   (lib/ai/tools.ts), the web manual logger (clients-content.tsx), the
--   mobile data store (mobile/stores/data-store.ts), the mobile outreach
--   completion path (same file), and the mobile API endpoint
--   (app/api/mobile/log-activity/route.ts). Putting the auto-promote
--   logic in the trigger means all five paths get it atomically forever
--   with zero risk of drift.
--
-- THE SIX GUARDS
--   1. Global feature flag — single SQL UPDATE disables instantly
--   2. Per-user opt-out — users can turn it off in settings
--   3. Sandbox mode — never mutate categorization on fake data
--   4. Activity type ≠ 'note' — notes aren't real touchpoints
--   5. Activity is recent (≤ 7 days old) — block historical backfills
--   6. Status filter — only cruising/scheduled get promoted; in_flight
--      and already-boarding clients are untouched; archived clients are
--      skipped; and freshly imported clients (< 24h old) are skipped to
--      avoid promoting test imports.
--
-- SECURITY MODEL
--   Function remains SECURITY INVOKER (default). Rationale: the original
--   function ran as the calling user, the new logic should too. If the
--   user successfully inserted the activity, they own the client (FK +
--   RLS) and have UPDATE rights on it. The sandbox guard handles the
--   one edge case where a service-role caller (mobile API) bypasses
--   RLS but should still respect sandbox semantics.
--
-- KILL SWITCH
--   To disable instantly without a redeploy:
--     UPDATE feature_flags SET enabled = false
--      WHERE name = 'auto_promote_on_activity';
-- ============================================================================

CREATE OR REPLACE FUNCTION update_client_last_contact()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_flag_enabled  BOOLEAN;
  v_user_opted_in BOOLEAN;
  v_is_sandbox    BOOLEAN;
BEGIN
  -- ── EXISTING BEHAVIOR (preserved unchanged) ────────────────────────────
  -- Keep clients.last_contact_at in sync; only forward in time, never back.
  UPDATE clients
     SET last_contact_at = NEW.activity_date,
         updated_at      = now()
   WHERE id = NEW.client_id
     AND (last_contact_at IS NULL OR NEW.activity_date > last_contact_at);

  -- ── NEW: auto-promote on activity (Phase 3 Wave A) ─────────────────────

  -- Guard 1: global kill switch
  SELECT enabled INTO v_flag_enabled
    FROM feature_flags
   WHERE name = 'auto_promote_on_activity';
  IF NOT COALESCE(v_flag_enabled, false) THEN
    RETURN NEW;
  END IF;

  -- Guard 2: per-user opt-out
  SELECT auto_categorize_enabled INTO v_user_opted_in
    FROM user_settings
   WHERE user_id = NEW.user_id;
  IF NOT COALESCE(v_user_opted_in, true) THEN
    RETURN NEW;
  END IF;

  -- Guard 3: sandbox mode — fake data should never auto-categorize.
  -- Checked explicitly (not via is_sandbox_active_for_current_user())
  -- because the mobile API path uses service role with no auth.uid().
  SELECT COALESCE(sandbox_mode, false) INTO v_is_sandbox
    FROM user_settings
   WHERE user_id = NEW.user_id;
  IF v_is_sandbox THEN
    RETURN NEW;
  END IF;

  -- Guard 4: notes aren't touchpoints
  IF NEW.type = 'note' THEN
    RETURN NEW;
  END IF;

  -- Guard 5: only recent activities (≤ 7 days) — blocks backfill spirals
  IF NEW.activity_date < now() - interval '7 days' THEN
    RETURN NEW;
  END IF;

  -- Guard 6: the actual promotion, with status / archive / import-quiet filters
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

-- The trigger itself (contact_activities_update_last_contact) is unchanged.
-- It already fires AFTER INSERT on contact_activities and calls this function.

COMMENT ON FUNCTION update_client_last_contact() IS
  'Phase 3 Wave A: extended in migration 00105. Updates last_contact_at '
  '(original behavior, unchanged) AND auto-promotes Cruising/Scheduled '
  'clients to Boarding when a real touchpoint is logged. Six guards '
  'prevent surprise behavior; see migration 00105 header for details. '
  'Kill switch: feature_flags.auto_promote_on_activity.';
