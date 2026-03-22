-- ============================================================================
-- 00061 · calendar_events — bidirectional Google Calendar sync
-- ============================================================================

CREATE TABLE IF NOT EXISTS calendar_events (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Google Calendar linkage
  google_event_id text,                          -- null if not yet synced to Google

  -- Origin tracking
  source          text        NOT NULL,          -- 'agent_runway' | 'google'
  source_type     text,                          -- 'showing' | 'closing' | 'follow_up' | 'meeting' | 'personal'
  source_id       uuid,                          -- FK to pipeline_deals, contact_tasks, etc.

  -- Event details
  title           text        NOT NULL,
  description     text,
  start_at        timestamptz NOT NULL,
  end_at          timestamptz NOT NULL,
  all_day         boolean     NOT NULL DEFAULT false,
  location        text,

  -- Sync metadata
  google_updated  timestamptz,                   -- Google's last-modified timestamp
  synced_at       timestamptz,                   -- when we last synced this event
  sync_status     text        NOT NULL DEFAULT 'pending',  -- 'pending' | 'synced' | 'deleted'

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Unique constraint for upsert on sync (one Google event per user)
CREATE UNIQUE INDEX idx_calendar_events_user_google
  ON calendar_events (user_id, google_event_id)
  WHERE google_event_id IS NOT NULL;

-- ── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own calendar events"
  ON calendar_events FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── Indexes ─────────────────────────────────────────────────────────────────

CREATE INDEX idx_calendar_events_user       ON calendar_events (user_id);
CREATE INDEX idx_calendar_events_dates      ON calendar_events (user_id, start_at);
CREATE INDEX idx_calendar_events_google_id  ON calendar_events (user_id, google_event_id);
CREATE INDEX idx_calendar_events_source     ON calendar_events (user_id, source, source_id);

-- ── Auto-update updated_at ──────────────────────────────────────────────────

CREATE TRIGGER trg_calendar_events_updated
  BEFORE UPDATE ON calendar_events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
