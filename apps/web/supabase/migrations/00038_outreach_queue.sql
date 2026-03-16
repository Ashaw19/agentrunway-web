-- ============================================================================
-- Migration 00038 — AI Flight Control: outreach queue + email connections
--
-- outreach_queue  : one row per detected opportunity (anniversary, idle, birthday)
--                   with AI-drafted subject + body awaiting agent review.
-- email_connections: OAuth email provider connections for direct-send (Phase B).
-- ============================================================================

-- ── Outreach opportunity queue ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS outreach_queue (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid        REFERENCES auth.users NOT NULL,
  client_id         uuid        REFERENCES clients(id) ON DELETE CASCADE,
  client_record_id  uuid        REFERENCES client_records(id) ON DELETE SET NULL,

  -- Opportunity metadata
  opportunity_type  text        NOT NULL,
  -- valid values: 'closing_anniversary' | 'idle_client' | 'birthday'
  trigger_date      date        NOT NULL,
  context           jsonb       NOT NULL DEFAULT '{}',
  -- closing_anniversary : { anniversary_year, address, close_date, gci }
  -- idle_client         : { last_deal, months_idle }
  -- birthday            : { birthdate }

  -- Workflow state
  status            text        NOT NULL DEFAULT 'draft'
    CONSTRAINT outreach_queue_status_check
    CHECK (status IN ('draft', 'ready', 'sent', 'skipped')),
  -- draft   = detected, AI drafting not yet run
  -- ready   = AI has drafted, awaiting agent review
  -- sent    = agent sent / marked as sent
  -- skipped = agent dismissed this opportunity

  -- AI-generated content
  ai_subject        text,
  ai_body           text,

  -- Agent-edited overrides (NULL = use ai_ version as-is)
  final_subject     text,
  final_body        text,

  -- Tracking
  sent_at           timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),

  -- One active opportunity per client per type per trigger window.
  -- For anniversaries: trigger_date = the exact anniversary date.
  -- For idle: trigger_date = first of current month (coarse key, max 1/month).
  -- For birthdays: trigger_date = the birthday date this year/next.
  UNIQUE (user_id, client_id, opportunity_type, trigger_date)
);

CREATE INDEX IF NOT EXISTS outreach_queue_user_status_idx
  ON outreach_queue (user_id, status, trigger_date DESC);

CREATE INDEX IF NOT EXISTS outreach_queue_client_idx
  ON outreach_queue (client_id);

ALTER TABLE outreach_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "outreach_queue_owner"
  ON outreach_queue FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE outreach_queue IS
  'AI Flight Control: detected outreach moments with AI-drafted messages for agent review';

-- ── Email connections (Phase B OAuth — schema created now, wired later) ───────

CREATE TABLE IF NOT EXISTS email_connections (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid        REFERENCES auth.users NOT NULL UNIQUE,
  provider          text        NOT NULL
    CONSTRAINT email_connections_provider_check
    CHECK (provider IN ('gmail', 'outlook')),
  email_address     text        NOT NULL,
  display_name      text,
  -- Tokens are stored encrypted; Phase B will populate these via OAuth flow.
  access_token_enc  text,
  refresh_token_enc text,
  expires_at        timestamptz,
  connected_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE email_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "email_connections_owner"
  ON email_connections FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE email_connections IS
  'OAuth email provider connections for direct-send from Flight Control (Phase B)';
