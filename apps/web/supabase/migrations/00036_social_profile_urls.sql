-- ============================================================================
-- Migration 00036 — Social media profile URLs on user_settings
-- Adds five nullable text columns so agents can store their personal
-- social media profile links (synced from iOS ProfileView).
-- ============================================================================

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS social_instagram TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS social_facebook  TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS social_linkedin  TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS social_tiktok    TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS social_youtube   TEXT NOT NULL DEFAULT '';

COMMENT ON COLUMN user_settings.social_instagram IS 'Agent Instagram profile URL (synced from iOS)';
COMMENT ON COLUMN user_settings.social_facebook  IS 'Agent Facebook profile URL (synced from iOS)';
COMMENT ON COLUMN user_settings.social_linkedin  IS 'Agent LinkedIn profile URL (synced from iOS)';
COMMENT ON COLUMN user_settings.social_tiktok    IS 'Agent TikTok profile URL (synced from iOS)';
COMMENT ON COLUMN user_settings.social_youtube   IS 'Agent YouTube channel URL (synced from iOS)';
