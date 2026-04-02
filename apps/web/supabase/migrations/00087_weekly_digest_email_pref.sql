-- Add weekly digest email preference to notification_preferences
-- Migration: 00087_weekly_digest_email_pref.sql

-- Add column for weekly digest opt-out
ALTER TABLE notification_preferences
  ADD COLUMN IF NOT EXISTS weekly_digest_enabled BOOLEAN NOT NULL DEFAULT true;

-- Ensure RLS is already enabled (it is from 00077, but be safe)
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

-- The existing "Users manage own notification preferences" policy already covers
-- SELECT/INSERT/UPDATE/DELETE for auth.uid() = user_id, so no new policy needed.
-- However, the unsubscribe endpoint uses the service role (admin client), which
-- bypasses RLS entirely — so that path is already covered.
