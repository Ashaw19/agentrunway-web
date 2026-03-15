-- ── Onboarding completion tracking ────────────────────────────────────────────
-- Records the timestamp when a user finishes the onboarding wizard.
-- Used by the dashboard to determine whether to redirect to /onboarding,
-- replacing the fragile goal_gci === 0 check (which broke when users skipped
-- the optional goals step).

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;

COMMENT ON COLUMN user_settings.onboarding_completed_at IS
  'Set when the user submits the onboarding wizard. NULL means onboarding is not yet complete.';
