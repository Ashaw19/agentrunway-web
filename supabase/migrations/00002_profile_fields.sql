-- ============================================================================
-- Agent Runway — Migration 00002: Profile display fields
-- Adds display_name, brokerage_name, and color_theme to user_settings.
-- Safe to run multiple times (IF NOT EXISTS guards).
-- ============================================================================

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS display_name  TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS brokerage_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS color_theme   TEXT NOT NULL DEFAULT 'blue';

COMMENT ON COLUMN user_settings.display_name  IS 'Agent display name shown on reports and profile.';
COMMENT ON COLUMN user_settings.brokerage_name IS 'Brokerage / office name.';
COMMENT ON COLUMN user_settings.color_theme    IS 'UI accent colour: blue | violet | emerald | orange | rose.';
