-- ============================================================================
-- Migration 00090 — Multi-provider email connections
--
-- Expands the email_connections table to support Microsoft OAuth and generic
-- SMTP connections in addition to the existing Google integration (which lives
-- in google_connections). This enables agents to send outreach from Outlook,
-- Yahoo (via SMTP), or any custom-domain email provider.
--
-- Changes:
--   1. Drop old provider CHECK (was: 'gmail','outlook')
--   2. Add new provider CHECK: 'microsoft','smtp'
--      (Gmail is handled by google_connections — not stored here)
--   3. Drop UNIQUE on user_id → replace with UNIQUE(user_id, provider)
--      so a user can have both Microsoft and SMTP connections
--   4. Add SMTP-specific columns
--   5. Add updated_at column with auto-update trigger
--   6. Add connection_name for user-friendly labelling
-- ============================================================================

-- ── 1. Drop old provider constraint ──────────────────────────────────────────
ALTER TABLE email_connections
  DROP CONSTRAINT IF EXISTS email_connections_provider_check;

-- ── 2. Add new provider constraint ───────────────────────────────────────────
ALTER TABLE email_connections
  ADD CONSTRAINT email_connections_provider_check
  CHECK (provider IN ('microsoft', 'smtp'));

-- ── 3. Drop UNIQUE on user_id, add UNIQUE(user_id, provider) ────────────────
ALTER TABLE email_connections
  DROP CONSTRAINT IF EXISTS email_connections_user_id_key;

ALTER TABLE email_connections
  ADD CONSTRAINT email_connections_user_provider_key UNIQUE (user_id, provider);

-- ── 4. Add SMTP columns ─────────────────────────────────────────────────────
ALTER TABLE email_connections
  ADD COLUMN IF NOT EXISTS smtp_host         TEXT,
  ADD COLUMN IF NOT EXISTS smtp_port         INTEGER DEFAULT 587,
  ADD COLUMN IF NOT EXISTS smtp_username     TEXT,
  ADD COLUMN IF NOT EXISTS smtp_password_enc TEXT,
  ADD COLUMN IF NOT EXISTS connection_name   TEXT,
  ADD COLUMN IF NOT EXISTS updated_at        TIMESTAMPTZ DEFAULT now();

-- ── 5. Auto-update trigger for updated_at ────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_email_connections_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_email_connections_updated_at ON email_connections;
CREATE TRIGGER trg_email_connections_updated_at
  BEFORE UPDATE ON email_connections
  FOR EACH ROW
  EXECUTE FUNCTION fn_email_connections_updated_at();

-- ── 6. Add SMTP validation constraint ────────────────────────────────────────
-- If provider is 'smtp', require smtp_host to be set
ALTER TABLE email_connections
  ADD CONSTRAINT email_connections_smtp_fields_check
  CHECK (
    provider != 'smtp'
    OR (smtp_host IS NOT NULL AND smtp_host != '')
  );

COMMENT ON TABLE email_connections IS
  'OAuth and SMTP email connections for multi-provider outreach sending (Microsoft, custom SMTP)';
