-- ── CASL Consent Records ───────────────────────────────────────────────────
-- Tracks explicit and implied consent for each client contact.
-- Required by Canadian law for any commercial electronic messages.

CREATE TABLE IF NOT EXISTS consent_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  consent_type TEXT NOT NULL CHECK (consent_type IN ('express', 'implied_transaction', 'implied_inquiry', 'referral')),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ, -- NULL for express consent (indefinite until withdrawn)
  source TEXT, -- e.g. 'signup_form', 'transaction_close', 'inquiry', 'referral_from_X'
  notes TEXT,
  withdrawn_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, client_id, consent_type)
);

ALTER TABLE consent_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own consent records" ON consent_records
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_consent_records_client ON consent_records(user_id, client_id);
CREATE INDEX idx_consent_records_expiry ON consent_records(expires_at) WHERE withdrawn_at IS NULL;

COMMENT ON TABLE consent_records IS 'CASL consent tracking. Express consent has no expiry. Implied consent expires: 2yr post-transaction, 6mo post-inquiry.';

-- ── Nurture Sequences ──────────────────────────────────────────────────────
-- Automated post-close and lifecycle nurture sequences per client.

CREATE TABLE IF NOT EXISTS nurture_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
  sequence_type TEXT NOT NULL DEFAULT 'post_close' CHECK (sequence_type IN ('post_close', 'pre_close', 'anniversary', 're_engagement', 'custom')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'cancelled')),
  current_step INT NOT NULL DEFAULT 0,
  next_send_at TIMESTAMPTZ,
  paused_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE nurture_sequences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own nurture sequences" ON nurture_sequences
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_nurture_sequences_next ON nurture_sequences(next_send_at) WHERE status = 'active';
CREATE INDEX idx_nurture_sequences_client ON nurture_sequences(user_id, client_id);

COMMENT ON TABLE nurture_sequences IS 'Automated nurture sequences. Steps are defined in code (nurture-engine.ts). next_send_at is checked by daily cron.';
