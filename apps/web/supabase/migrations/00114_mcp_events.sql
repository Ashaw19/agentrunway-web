-- MCP usage event logging
-- Tracks every tool invocation through the MCP server for analytics,
-- rate-limit enforcement, and billing visibility.

CREATE TABLE mcp_events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  tool_name  TEXT NOT NULL,
  latency_ms INTEGER,          -- handler wall-clock time
  is_error   BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fast lookups: per-user recent events, per-tool aggregates
CREATE INDEX idx_mcp_events_user_created ON mcp_events (user_id, created_at DESC);
CREATE INDEX idx_mcp_events_tool         ON mcp_events (tool_name, created_at DESC);

-- RLS: users can only read their own events
ALTER TABLE mcp_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own MCP events"
  ON mcp_events FOR SELECT
  USING (auth.uid() = user_id);

-- The Edge Function inserts via the user's RLS-scoped client,
-- so we need an insert policy too.
CREATE POLICY "Users can insert own MCP events"
  ON mcp_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Auto-cleanup: drop events older than 90 days (pg_cron)
-- Run weekly on Sundays at 04:00 UTC
SELECT cron.schedule(
  'cleanup-mcp-events',
  '0 4 * * 0',
  $$DELETE FROM public.mcp_events WHERE created_at < now() - interval '90 days'$$
);
