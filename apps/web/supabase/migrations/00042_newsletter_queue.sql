-- Migration: Newsletter Queue
-- AI-drafted newsletters sent to all active clients (or a tagged subset).
-- One row = one newsletter send event; drafted once, copied to any email tool.

CREATE TABLE newsletter_queue (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Which template was used and the data that informed the draft
  template_type  text        NOT NULL
                   CHECK (template_type IN ('boc_rate_change', 'market_update', 'custom')),
  context        jsonb       NOT NULL DEFAULT '{}',

  -- Lifecycle
  status         text        NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft', 'ready', 'sent')),

  -- AI-generated content (populated by Groq after insert)
  ai_subject     text,
  ai_body        text,

  -- Agent-edited final version (overrides ai_* when present)
  final_subject  text,
  final_body     text,

  -- Targeting: empty array = all active clients; otherwise filter by tag
  recipient_tags text[]      NOT NULL DEFAULT '{}',

  -- Stamped when agent marks as sent
  sent_at        timestamptz,

  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- Row-level security: users see and manage only their own newsletters
ALTER TABLE newsletter_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own newsletters"
  ON newsletter_queue FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Index for the Flight Control queue fetch (most recent drafts/ready items first)
CREATE INDEX idx_newsletter_queue_user_status
  ON newsletter_queue (user_id, status, created_at DESC);

-- Auto-update updated_at on every write
CREATE TRIGGER trg_newsletter_queue_updated
  BEFORE UPDATE ON newsletter_queue
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
