-- Migration 00070 — Accountant share tokens
--
-- Allows agents to generate secure, revocable links that give their
-- accountant read-only access to T2125, expenses, and transaction data.

CREATE TABLE accountant_shares (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token       TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  label       TEXT NOT NULL DEFAULT 'My Accountant',  -- e.g. accountant name or firm
  is_active   BOOLEAN NOT NULL DEFAULT true,
  -- What data is shared (all default true — agent can toggle)
  share_t2125        BOOLEAN NOT NULL DEFAULT true,
  share_expenses     BOOLEAN NOT NULL DEFAULT true,
  share_transactions BOOLEAN NOT NULL DEFAULT true,
  share_mileage      BOOLEAN NOT NULL DEFAULT true,
  -- Access log
  last_accessed_at   TIMESTAMPTZ,
  access_count       INTEGER NOT NULL DEFAULT 0,
  -- Lifecycle
  expires_at         TIMESTAMPTZ,  -- null = never expires
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-update timestamp
CREATE TRIGGER accountant_shares_updated_at
  BEFORE UPDATE ON accountant_shares
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Index for fast token lookup (public endpoint)
CREATE INDEX idx_accountant_shares_token ON accountant_shares (token) WHERE is_active = true;

-- Index for user's shares
CREATE INDEX idx_accountant_shares_user ON accountant_shares (user_id);

-- RLS
ALTER TABLE accountant_shares ENABLE ROW LEVEL SECURITY;

-- Agents manage their own shares
CREATE POLICY "Users manage own accountant shares"
  ON accountant_shares FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
