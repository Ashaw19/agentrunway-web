-- ============================================================================
-- Migration 00104: Auto-categorization safety controls
-- Phase 3 Wave A — kill switches that MUST exist before the trigger logic.
--
-- Adds two layers of off-switches for the auto-promote-on-activity feature
-- shipped in migration 00105:
--
--   1. feature_flags table — global on/off switches keyed by name.
--      Flip a single row to instantly disable the entire feature for
--      every user with no redeploy:
--        UPDATE feature_flags SET enabled = false
--         WHERE name = 'auto_promote_on_activity';
--
--   2. user_settings.auto_categorize_enabled — per-user opt-out so
--      individual users can disable auto-categorization without affecting
--      anyone else. Default TRUE (opt-out, not opt-in).
--
-- The trigger added in 00105 reads BOTH flags before firing. Either one
-- being false short-circuits the entire auto-promote logic.
-- ============================================================================

-- ── 1. feature_flags table ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS feature_flags (
  name        TEXT         PRIMARY KEY,
  enabled     BOOLEAN      NOT NULL DEFAULT TRUE,
  description TEXT,
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;

-- Authenticated users can READ flags (so client code can check before
-- showing UI affordances). Writes are restricted to service role only —
-- there is intentionally no INSERT/UPDATE/DELETE policy for authenticated.
DROP POLICY IF EXISTS "Anyone authenticated can read feature flags" ON feature_flags;
CREATE POLICY "Anyone authenticated can read feature flags"
  ON feature_flags FOR SELECT
  TO authenticated
  USING (true);

-- Auto-update updated_at on every row change
CREATE OR REPLACE FUNCTION feature_flags_update_timestamp()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS feature_flags_updated_at ON feature_flags;
CREATE TRIGGER feature_flags_updated_at
  BEFORE UPDATE ON feature_flags
  FOR EACH ROW EXECUTE FUNCTION feature_flags_update_timestamp();

-- Seed the Wave A kill switch (default: enabled)
INSERT INTO feature_flags (name, enabled, description) VALUES
  (
    'auto_promote_on_activity',
    true,
    'Phase 3 Wave A: when a contact activity is logged on a Cruising or Scheduled client, auto-promote them to Boarding. Set enabled=false to disable instantly without redeploy.'
  )
ON CONFLICT (name) DO NOTHING;

COMMENT ON TABLE feature_flags IS
  'Global feature kill switches. Read by triggers and application code; '
  'writes restricted to service role. Flip enabled=false to disable a '
  'feature instantly for all users without a deploy.';

-- ── 2. user_settings.auto_categorize_enabled (per-user opt-out) ─────────────
ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS auto_categorize_enabled BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN user_settings.auto_categorize_enabled IS
  'Per-user opt-out for Phase 3 auto-categorization (auto-promote on '
  'activity in Wave A, briefing housekeeping prompts in Wave B). '
  'Default TRUE — users are opted in unless they turn it off.';
