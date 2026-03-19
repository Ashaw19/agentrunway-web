-- Add runway_score_snapshot to user_settings for month-over-month trend tracking.
-- Stores: { "score": 72, "month": "2026-03" }
-- Updated client-side when the user visits the dashboard in a new month.

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS runway_score_snapshot jsonb;
