-- Migration 00022: Per-user API rate limiting table
--
-- Backs the server-side rate limiter in lib/rate-limit.ts.
-- Uses a fixed-window counter: one row per (user_id, endpoint) tracks the
-- current window's start time and request count. When the window expires the
-- row is reset in-place (upsert), keeping the table tiny regardless of traffic.
--
-- Limits enforced today:
--   /api/chat            — 30 requests per 60-minute window (protects Groq quota)
--   /api/import-history  — 10 requests per 60-minute window (expensive LLM + vision)
--
-- Access: written exclusively by the service_role client inside API routes.
-- The authenticated role has no need to read or write this table directly.

CREATE TABLE IF NOT EXISTS rate_limits (
  user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint      TEXT        NOT NULL,
  window_start  TIMESTAMPTZ NOT NULL DEFAULT now(),
  request_count INTEGER     NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, endpoint)
);

-- Quickly find stale windows for cleanup (optional maintenance)
CREATE INDEX IF NOT EXISTS rate_limits_window_start_idx
  ON rate_limits (window_start);

-- No RLS needed — only ever accessed via the service_role admin client.
