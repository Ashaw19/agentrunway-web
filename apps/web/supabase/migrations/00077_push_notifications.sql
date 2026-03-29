-- Push notification tokens and preferences for mobile app
-- Migration: 00077_push_notifications.sql

-- ── Push Tokens ─────────────────────────────────────────────────────────────
-- Stores Expo push tokens for each user/device combination.

CREATE TABLE IF NOT EXISTS push_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expo_push_token TEXT NOT NULL,
  device_name TEXT,
  platform TEXT NOT NULL DEFAULT 'ios',  -- ios | android
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, expo_push_token)
);

-- RLS: users can only see/manage their own tokens
ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own push tokens"
  ON push_tokens FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Index for looking up tokens by user (used by edge functions)
CREATE INDEX idx_push_tokens_user_id ON push_tokens(user_id);

-- ── Notification Preferences ────────────────────────────────────────────────
-- Per-user toggle for each notification type + quiet hours.

CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  morning_briefing BOOLEAN NOT NULL DEFAULT true,
  hot_lead_alert BOOLEAN NOT NULL DEFAULT true,
  follow_up_due BOOLEAN NOT NULL DEFAULT true,
  deal_milestone BOOLEAN NOT NULL DEFAULT true,
  afternoon_recap BOOLEAN NOT NULL DEFAULT true,
  quiet_hours_start TEXT NOT NULL DEFAULT '22:00',
  quiet_hours_end TEXT NOT NULL DEFAULT '07:00',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS: users can only see/manage their own preferences
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own notification preferences"
  ON notification_preferences FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── Notification Log ────────────────────────────────────────────────────────
-- Track sent notifications to prevent duplicates and enable analytics.

CREATE TABLE IF NOT EXISTS notification_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL,  -- morning_briefing | hot_lead_alert | follow_up_due | deal_milestone | afternoon_recap
  title TEXT NOT NULL,
  body TEXT,
  data JSONB DEFAULT '{}',
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expo_ticket_id TEXT,  -- Expo push receipt ID for delivery tracking
  status TEXT NOT NULL DEFAULT 'sent'  -- sent | delivered | failed
);

-- RLS: users can read their own notification history
ALTER TABLE notification_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own notification log"
  ON notification_log FOR SELECT
  USING (auth.uid() = user_id);

-- Service role can insert (edge functions)
CREATE POLICY "Service role inserts notification log"
  ON notification_log FOR INSERT
  WITH CHECK (true);

-- Index for querying recent notifications per user
CREATE INDEX idx_notification_log_user_sent ON notification_log(user_id, sent_at DESC);

-- Cleanup: auto-delete notifications older than 90 days (optional, can be done via cron)
