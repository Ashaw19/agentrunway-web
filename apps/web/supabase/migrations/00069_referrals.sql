-- Migration 00069 — Referral tracking
--
-- Tracks inbound and outbound referrals between agents.
-- Supports referral fee tracking, status lifecycle, and reporting.

CREATE TABLE referrals (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Referral direction
  direction   TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  -- inbound  = another agent referred a client TO this user
  -- outbound = this user referred a client to another agent

  -- Referral partner
  partner_name       TEXT NOT NULL,           -- name of the other agent
  partner_brokerage  TEXT DEFAULT '',          -- their brokerage
  partner_email      TEXT DEFAULT '',
  partner_phone      TEXT DEFAULT '',

  -- Client info
  client_name        TEXT NOT NULL,            -- the referred client
  client_email       TEXT DEFAULT '',
  client_phone       TEXT DEFAULT '',

  -- Referral details
  referral_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  status             TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'active', 'closed', 'expired', 'cancelled')),
  property_address   TEXT DEFAULT '',
  transaction_type   TEXT DEFAULT 'buy'
                     CHECK (transaction_type IN ('buy', 'sell', 'both')),

  -- Financial
  referral_fee_pct   NUMERIC(5,2) DEFAULT 25.00,  -- standard 25% referral fee
  estimated_value    NUMERIC(12,2) DEFAULT 0,      -- estimated transaction value
  actual_fee_paid    NUMERIC(10,2) DEFAULT 0,      -- actual fee received/paid
  fee_paid_date      DATE,

  -- Optional link to a closed transaction
  transaction_id     UUID REFERENCES transactions(id) ON DELETE SET NULL,

  -- Notes
  notes              TEXT DEFAULT '',

  -- Metadata
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-update timestamp
CREATE TRIGGER referrals_updated_at
  BEFORE UPDATE ON referrals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Index for fast user queries
CREATE INDEX idx_referrals_user_date ON referrals (user_id, referral_date DESC);

-- RLS
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own referrals"
  ON referrals FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
