-- ============================================================================
-- Migration 00039 — Email signature for Flight Control outbound messages
-- ============================================================================

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS email_signature TEXT NOT NULL DEFAULT '';

COMMENT ON COLUMN user_settings.email_signature IS
  'Free-form email signature appended to AI Flight Control drafted messages (supports line breaks)';
