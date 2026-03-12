-- ============================================================================
-- Agent Runway — Migration 00024: Agent cutout photo for Social Studio
--
-- Adds agent_cutout_url column to user_settings for storing the public URL
-- of a transparent PNG cutout photo used as an overlay on social slides.
--
-- Also bumps the profile-media bucket size limit from 2 MB to 5 MB so
-- larger transparent PNGs can be uploaded.
--
-- Safe to run multiple times (IF NOT EXISTS guards).
-- ============================================================================

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS agent_cutout_url TEXT NOT NULL DEFAULT '';

COMMENT ON COLUMN user_settings.agent_cutout_url
  IS 'Public URL of the agent cutout PNG (transparent bg) for social slide overlays.';

-- Bump file size limit: transparent PNGs can exceed 2 MB
UPDATE storage.buckets SET file_size_limit = 5242880 WHERE id = 'profile-media';
