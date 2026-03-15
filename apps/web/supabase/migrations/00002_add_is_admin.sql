-- Migration 00002: Add is_admin column for founder/admin override
-- Run this in the Supabase SQL editor, then set the founder's row:
--   UPDATE user_settings SET is_admin = true WHERE user_id = '<your-user-id>';

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;
