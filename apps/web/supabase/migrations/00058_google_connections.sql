-- ============================================================================
-- 00058 · google_connections — unified Google OAuth for Gmail, Calendar, Drive
-- ============================================================================

CREATE TABLE IF NOT EXISTS google_connections (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid        REFERENCES auth.users NOT NULL UNIQUE,
  email_address       text        NOT NULL,
  display_name        text,
  access_token_enc    text        NOT NULL,
  refresh_token_enc   text        NOT NULL,
  expires_at          timestamptz NOT NULL,
  granted_scopes      text[]      NOT NULL DEFAULT '{}',
  -- Feature toggles (derived from granted_scopes on upsert)
  gmail_send_enabled    boolean   NOT NULL DEFAULT false,
  calendar_sync_enabled boolean   NOT NULL DEFAULT false,
  drive_read_enabled    boolean   NOT NULL DEFAULT false,
  -- Calendar sync state
  calendar_sync_token text,
  last_calendar_sync  timestamptz,
  -- Timestamps
  connected_at        timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE google_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "google_connections_owner"
  ON google_connections FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Index for quick lookup by user
CREATE INDEX IF NOT EXISTS idx_google_connections_user
  ON google_connections (user_id);

COMMENT ON TABLE google_connections IS
  'Unified Google OAuth connection storing encrypted tokens for Gmail send, Calendar sync, and Drive access.';
