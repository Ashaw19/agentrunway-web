-- Migration 00108: Tax Filing Phase 1
-- Adds filing frequency, fiscal year-end to user_settings
-- Creates recurring_expenses and recurring_expense_entries tables

-- ── user_settings additions ──────────────────────────────────────────────────

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS filing_frequency TEXT NOT NULL DEFAULT 'quarterly'
    CHECK (filing_frequency IN ('monthly', 'quarterly', 'annual')),
  ADD COLUMN IF NOT EXISTS fiscal_year_end_month INT NOT NULL DEFAULT 12
    CHECK (fiscal_year_end_month BETWEEN 1 AND 12);

-- ── recurring_expenses ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS recurring_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  name TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  category_key TEXT NOT NULL,
  day_of_month INT NOT NULL CHECK (day_of_month BETWEEN 1 AND 28),
  hst_included BOOLEAN NOT NULL DEFAULT false,
  hst_amount NUMERIC(12,2) DEFAULT 0,
  vehicle_pct_applicable BOOLEAN NOT NULL DEFAULT false,
  notes TEXT DEFAULT '',
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fetching user's recurring expenses
CREATE INDEX IF NOT EXISTS idx_recurring_expenses_user
  ON recurring_expenses (user_id, is_active);

-- RLS
ALTER TABLE recurring_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY recurring_expenses_select ON recurring_expenses
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY recurring_expenses_insert ON recurring_expenses
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY recurring_expenses_update ON recurring_expenses
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY recurring_expenses_delete ON recurring_expenses
  FOR DELETE USING (auth.uid() = user_id);

-- ── recurring_expense_entries ────────────────────────────────────────────────
-- Tracks auto-generated receipt_expenses entries to prevent duplicates

CREATE TABLE IF NOT EXISTS recurring_expense_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recurring_expense_id UUID NOT NULL REFERENCES recurring_expenses ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  receipt_expense_id UUID REFERENCES receipt_expenses ON DELETE SET NULL,
  entry_date DATE NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'generated'
    CHECK (status IN ('generated', 'confirmed', 'skipped')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (recurring_expense_id, entry_date)
);

-- Index for checking if entry already exists for a given month
CREATE INDEX IF NOT EXISTS idx_recurring_entries_lookup
  ON recurring_expense_entries (recurring_expense_id, entry_date);

CREATE INDEX IF NOT EXISTS idx_recurring_entries_user
  ON recurring_expense_entries (user_id, entry_date);

-- RLS
ALTER TABLE recurring_expense_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY recurring_entries_select ON recurring_expense_entries
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY recurring_entries_insert ON recurring_expense_entries
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY recurring_entries_update ON recurring_expense_entries
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY recurring_entries_delete ON recurring_expense_entries
  FOR DELETE USING (auth.uid() = user_id);
