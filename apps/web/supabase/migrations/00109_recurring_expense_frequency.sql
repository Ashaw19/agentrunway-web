-- Migration 00109: Add frequency to recurring expenses
-- Supports monthly, quarterly, and annual recurring expenses
-- Annual expenses also track which month they occur

ALTER TABLE recurring_expenses
  ADD COLUMN IF NOT EXISTS frequency TEXT NOT NULL DEFAULT 'monthly'
    CHECK (frequency IN ('monthly', 'quarterly', 'annual')),
  ADD COLUMN IF NOT EXISTS month_of_year INT
    CHECK (month_of_year IS NULL OR (month_of_year >= 1 AND month_of_year <= 12));

COMMENT ON COLUMN recurring_expenses.frequency IS 'How often this expense recurs: monthly, quarterly, or annual';
COMMENT ON COLUMN recurring_expenses.month_of_year IS 'For annual expenses: which month (1-12). For quarterly: starting month of first quarter occurrence.';
