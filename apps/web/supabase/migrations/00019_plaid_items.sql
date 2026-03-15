-- Migration 00019: Plaid bank/card sync
-- Stores connected bank accounts (Plaid Items) and imported expense transactions.

-- ── 1. Plaid items (one row per connected bank account) ─────────────────────
CREATE TABLE IF NOT EXISTS plaid_items (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Plaid credentials (encrypted at rest by Supabase/Postgres)
  plaid_item_id   TEXT        NOT NULL,
  access_token    TEXT        NOT NULL,

  -- Institution display info
  institution_id  TEXT,
  institution_name TEXT,

  -- Sync cursor (Plaid /transactions/sync uses this for incremental updates)
  sync_cursor     TEXT,
  last_synced_at  TIMESTAMPTZ,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (user_id, plaid_item_id)
);

CREATE OR REPLACE TRIGGER plaid_items_updated_at
  BEFORE UPDATE ON plaid_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE plaid_items ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users manage own Plaid items"
    ON plaid_items FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 2. Imported expense transactions from Plaid ──────────────────────────────
-- Each row is one bank/card transaction pulled from Plaid.
-- Agents review and categorise them; confirmed ones contribute to expense YTD.
CREATE TABLE IF NOT EXISTS plaid_transactions (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plaid_item_id       UUID         NOT NULL REFERENCES plaid_items(id) ON DELETE CASCADE,

  plaid_transaction_id TEXT        NOT NULL,  -- Plaid's own ID for dedup
  plaid_account_id    TEXT,

  -- Transaction data from Plaid
  transaction_date    DATE         NOT NULL,
  merchant_name       TEXT,
  description         TEXT         NOT NULL DEFAULT '',
  amount              NUMERIC(12,2) NOT NULL,  -- positive = expense (debit)

  -- Categorisation (agent-assigned after review)
  category_key        TEXT,    -- maps to expense_items.key; null = uncategorised
  review_status       TEXT     NOT NULL DEFAULT 'pending',  -- pending | approved | ignored

  -- AI-suggested category (filled by auto-categorise endpoint)
  suggested_category  TEXT,
  suggestion_confidence NUMERIC(5,4),  -- 0.0–1.0

  created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),

  UNIQUE (user_id, plaid_transaction_id)
);

CREATE OR REPLACE TRIGGER plaid_transactions_updated_at
  BEFORE UPDATE ON plaid_transactions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE plaid_transactions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users manage own Plaid transactions"
    ON plaid_transactions FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS plaid_transactions_user_date_idx
  ON plaid_transactions (user_id, transaction_date DESC);

CREATE INDEX IF NOT EXISTS plaid_transactions_status_idx
  ON plaid_transactions (user_id, review_status)
  WHERE review_status = 'pending';
