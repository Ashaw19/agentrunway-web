-- ============================================================================
-- Agent Runway — Migration 00004: Media uploads + Business identity fields
--
-- 1. Adds avatar_url, business_logo_url, business_name, business_number
--    columns to user_settings.
-- 2. Creates the `profile-media` Supabase Storage bucket (public).
-- 3. Sets RLS policies so each user can only write to their own folder
--    while anyone can read (required for public image URLs).
--
-- Safe to run multiple times (IF NOT EXISTS / ON CONFLICT guards).
-- ============================================================================

-- ── Column additions ─────────────────────────────────────────────────────────

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS avatar_url         TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS business_logo_url  TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS business_name      TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS business_number    TEXT NOT NULL DEFAULT '';

COMMENT ON COLUMN user_settings.avatar_url        IS 'Public URL of the agent profile photo stored in profile-media bucket.';
COMMENT ON COLUMN user_settings.business_logo_url IS 'Public URL of the business / brokerage logo stored in profile-media bucket.';
COMMENT ON COLUMN user_settings.business_name     IS 'Agent trade name or team name (e.g. "The Smith Group"), distinct from brokerage_name.';
COMMENT ON COLUMN user_settings.business_number   IS 'GST/HST registration number for CRA expense claiming.';

-- ── Storage bucket ───────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'profile-media',
  'profile-media',
  true,
  2097152,                                           -- 2 MB per file
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- ── RLS policies ─────────────────────────────────────────────────────────────
-- Files are stored as {user_id}/avatar.ext and {user_id}/logo.ext
-- (storage.foldername returns the path segments as an array)

-- Drop first so re-runs are safe
DROP POLICY IF EXISTS "profile_media_insert"    ON storage.objects;
DROP POLICY IF EXISTS "profile_media_update"    ON storage.objects;
DROP POLICY IF EXISTS "profile_media_delete"    ON storage.objects;
DROP POLICY IF EXISTS "profile_media_select"    ON storage.objects;

-- Authenticated users can upload to their own folder only
CREATE POLICY "profile_media_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'profile-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Authenticated users can overwrite their own files (upsert)
CREATE POLICY "profile_media_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'profile-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Authenticated users can delete their own files
CREATE POLICY "profile_media_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'profile-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Public read (bucket is public — anyone can fetch an image URL)
CREATE POLICY "profile_media_select"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'profile-media');
