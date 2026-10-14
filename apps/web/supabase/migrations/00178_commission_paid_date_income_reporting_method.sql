-- ============================================================================
-- Migration 00178: commission paid date + income reporting method
--
-- CRA lets self-employed commission agents report income on the cash method
-- (in the fiscal period it is received) or the accrual method (in the period
-- it is earned). Source: Guide T4002, Chapter 1, "Reporting methods", and
-- canada.ca "Accounting methods" (wording kept in
-- packages/core/tax-copy/cra-rules.ts, INCOME_REPORTING_METHOD_RULES).
--
-- Until now every tax figure put a deal in the year of transactions.date (its
-- closing date). For a cash-method agent a deal that closes in December and
-- pays in January belongs to the next tax year.
--
-- transactions.commission_paid_date: when the commission was received. NULL =
--   not entered; a cash-method agent's deal then counts in its closing year.
--   Not constrained against `date` here: the form and Flight Crew reject a
--   paid date before the closing date (core/validation/input-guards.ts).
--
-- user_settings.income_reporting_method: 'accrual' (default: every existing
--   account keeps its figures) | 'cash'. Read through
--   packages/core/engines/tax-year.ts (taxYearDate), the one helper that
--   places a deal in a tax year.
--
-- Both tables already have RLS; the new columns fall under their policies.
-- ============================================================================

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS commission_paid_date DATE;

COMMENT ON COLUMN transactions.commission_paid_date IS
  'Date the commission was received. NULL = not entered. Cash-method agents (user_settings.income_reporting_method = ''cash'') count the deal in this date''s tax year; everyone else, and a blank date, in the closing date''s (core/engines/tax-year.ts). Production metrics stay on transactions.date.';

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS income_reporting_method TEXT NOT NULL DEFAULT 'accrual'
    CHECK (income_reporting_method IN ('accrual', 'cash'));

COMMENT ON COLUMN user_settings.income_reporting_method IS
  'How the agent reports commission income for income tax (CRA T4002 ch. 1): accrual (year earned, default) | cash (year received). Moves tax-year income only; production metrics stay on the closing date.';
