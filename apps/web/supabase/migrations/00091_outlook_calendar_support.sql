-- ============================================================================
-- Migration 00091 — Outlook Calendar support
--
-- Extends the calendar system to support Microsoft Outlook Calendar alongside
-- Google Calendar. Uses the existing calendar_events table with a new
-- outlook_event_id column for bidirectional sync.
--
-- Changes:
--   1. Add outlook_event_id to calendar_events (for Microsoft Graph event IDs)
--   2. Add unique index for Outlook events (same pattern as Google)
--   3. Add calendar fields to email_connections (sync token, enabled flag)
--   4. Update source check to allow 'outlook' as a source
-- ============================================================================

-- ── 1. Add Outlook event ID column ──────────────────────────────────────────
ALTER TABLE calendar_events
  ADD COLUMN IF NOT EXISTS outlook_event_id TEXT;

-- ── 2. Unique index for Outlook events (mirrors Google's) ───────────────────
CREATE UNIQUE INDEX IF NOT EXISTS idx_calendar_events_user_outlook
  ON calendar_events (user_id, outlook_event_id)
  WHERE outlook_event_id IS NOT NULL;

-- ── 3. Add index for Outlook event lookups ──────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_calendar_events_outlook_id
  ON calendar_events (user_id, outlook_event_id);

-- ── 4. Add calendar sync fields to email_connections ────────────────────────
ALTER TABLE email_connections
  ADD COLUMN IF NOT EXISTS calendar_sync_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS calendar_sync_token   TEXT,
  ADD COLUMN IF NOT EXISTS last_calendar_sync    TIMESTAMPTZ;

COMMENT ON COLUMN email_connections.calendar_sync_enabled IS
  'Whether this Microsoft connection has Calendars.ReadWrite permission';
COMMENT ON COLUMN email_connections.calendar_sync_token IS
  'Microsoft Graph deltaLink for incremental calendar sync';
