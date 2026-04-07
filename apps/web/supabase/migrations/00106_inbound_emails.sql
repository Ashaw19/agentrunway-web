-- ============================================================================
-- Migration 00106 — Inbound Email Receiving (vendor: Resend)
--
-- Enables the "user email connection" feature: agents forward client replies
-- to their unique inbound alias (e.g. abc123@inbox.agentrunway.ca), Resend
-- receives them, and our webhook stores + links them to contacts, feeding
-- engagement scoring, reply detection, and auto-pausing nurture sequences.
--
-- Two table changes + one column addition:
--   1. user_settings.inbound_alias — unique opaque token per user
--   2. inbound_emails              — one row per received email (metadata only;
--                                     body/attachments fetched lazily from
--                                     Resend's Received Emails API)
-- ============================================================================

-- ── 1. Inbound alias on user_settings ────────────────────────────────────────
-- Each user gets a unique opaque token so their forwarding address can't be
-- guessed or enumerated. Format: 16-char lowercase alphanumeric.
-- The full address is constructed in code as `${inbound_alias}@inbox.agentrunway.ca`.

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS inbound_alias TEXT UNIQUE;

-- Backfill aliases for existing users. 16 chars of base36 (~82 bits entropy).
-- gen_random_bytes is available via pgcrypto (already enabled in 00001).
UPDATE user_settings
   SET inbound_alias = lower(substring(encode(gen_random_bytes(12), 'hex') from 1 for 16))
 WHERE inbound_alias IS NULL;

-- Enforce presence for future rows (defaults at signup time via trigger)
ALTER TABLE user_settings
  ALTER COLUMN inbound_alias SET NOT NULL;

-- Auto-generate inbound_alias for new user_settings rows
CREATE OR REPLACE FUNCTION generate_inbound_alias()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.inbound_alias IS NULL OR NEW.inbound_alias = '' THEN
    NEW.inbound_alias := lower(substring(encode(gen_random_bytes(12), 'hex') from 1 for 16));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_settings_inbound_alias ON user_settings;
CREATE TRIGGER user_settings_inbound_alias
  BEFORE INSERT ON user_settings
  FOR EACH ROW EXECUTE FUNCTION generate_inbound_alias();

COMMENT ON COLUMN user_settings.inbound_alias IS
  'Unique opaque token used to construct the user''s inbound forwarding address: {alias}@inbox.agentrunway.ca';

-- ── 2. Inbound emails table ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS inbound_emails (
  id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Resend identifiers
  -- resend_email_id is the primary idempotency key — if the same webhook is
  -- delivered twice (Resend will retry on 5xx or timeout), we must not create
  -- duplicate rows. Enforced UNIQUE below.
  resend_email_id    TEXT         NOT NULL,

  -- RFC 5322 threading headers (optional, used for thread grouping in UI and
  -- for matching replies back to outreach messages we sent)
  message_id         TEXT,
  in_reply_to        TEXT,
  email_references   TEXT[],      -- References header, parsed into array

  -- Addressing
  from_address       TEXT         NOT NULL,
  from_name          TEXT,
  to_address         TEXT         NOT NULL,   -- the inbound alias that received it
  cc_addresses       TEXT[]       NOT NULL DEFAULT '{}',

  -- Subject + short preview (full body fetched on-demand from Resend API)
  subject            TEXT,
  preview            TEXT,        -- first ~280 chars of plain text, if available

  -- Attachment metadata (bytes fetched on-demand from Resend API)
  has_attachments    BOOLEAN      NOT NULL DEFAULT FALSE,
  attachment_count   INT          NOT NULL DEFAULT 0,
  attachment_summary JSONB        NOT NULL DEFAULT '[]',
  -- [{ id, filename, content_type, size_bytes? }]

  -- Resolution state — unresolved emails need agent attention to link to a contact
  status             TEXT         NOT NULL DEFAULT 'unresolved'
    CONSTRAINT inbound_emails_status_check
    CHECK (status IN ('unresolved', 'linked', 'archived', 'spam')),

  -- Contact linking (nullable for unresolved emails)
  client_id          UUID         REFERENCES clients(id) ON DELETE SET NULL,

  -- Outreach reply matching (set when this email is a reply to an outreach_queue item)
  matched_outreach_id UUID        REFERENCES outreach_queue(id) ON DELETE SET NULL,

  -- Raw webhook payload for debugging and future reprocessing
  raw_webhook        JSONB        NOT NULL DEFAULT '{}',

  received_at        TIMESTAMPTZ  NOT NULL,
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),

  -- Idempotency: a given Resend email_id must only produce one row
  UNIQUE (resend_email_id)
);

ALTER TABLE inbound_emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own inbound emails"
  ON inbound_emails FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Service role (webhook handler) can insert without an auth context
CREATE POLICY "Service role full access on inbound_emails"
  ON inbound_emails FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE TRIGGER inbound_emails_updated_at
  BEFORE UPDATE ON inbound_emails
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Indexes tuned for the most common queries
CREATE INDEX IF NOT EXISTS idx_inbound_emails_user_received
  ON inbound_emails (user_id, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_inbound_emails_client
  ON inbound_emails (user_id, client_id, received_at DESC)
  WHERE client_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inbound_emails_unresolved
  ON inbound_emails (user_id, received_at DESC)
  WHERE status = 'unresolved';

CREATE INDEX IF NOT EXISTS idx_inbound_emails_thread
  ON inbound_emails (user_id, in_reply_to)
  WHERE in_reply_to IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inbound_emails_outreach
  ON inbound_emails (matched_outreach_id)
  WHERE matched_outreach_id IS NOT NULL;

COMMENT ON TABLE inbound_emails IS
  'Inbound emails received via Resend webhook. Metadata only — body and attachment bytes are fetched on-demand from Resend''s Received Emails API. Idempotent on resend_email_id.';

-- ── 3. Helper RPC: look up user by inbound alias ─────────────────────────────
-- The webhook handler needs to resolve an incoming recipient like
-- abc123@inbox.agentrunway.ca → user_id. This SECURITY DEFINER function lets
-- the webhook (running as service role) do the lookup without exposing the
-- alias column to unauthorized reads.

CREATE OR REPLACE FUNCTION resolve_inbound_alias(alias_token TEXT)
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT user_id FROM user_settings WHERE inbound_alias = lower(alias_token) LIMIT 1;
$$;

REVOKE ALL ON FUNCTION resolve_inbound_alias(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resolve_inbound_alias(TEXT) TO service_role;

COMMENT ON FUNCTION resolve_inbound_alias IS
  'Resolves an inbound email alias token to a user_id. Service role only.';
