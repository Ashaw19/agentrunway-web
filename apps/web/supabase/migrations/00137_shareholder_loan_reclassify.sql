-- ============================================================================
-- Migration 00137 — Reclassify shareholder loan COA account
--
-- Migration 00132 seeded account 3010 "Shareholder Loan — Andrew Shaw" as
-- type 'equity'. This is incorrect for Canadian accounting: a loan FROM the
-- shareholder TO the corporation appears on the corp's balance sheet as a
-- liability (the corp owes the shareholder). Equity accounts track
-- ownership stakes and retained earnings — not funds the corp must repay.
--
-- This migration:
--   1. Corrects the type from 'equity' to 'liability'.
--   2. Renames to "Due to Shareholder — Andrew Shaw" (standard AR terminology).
--   3. Updates the notes field with the sign convention used by the cockpit
--      balance card (positive = corp owes Andrew, negative = overpaid /
--      repayment exceeded loan balance — should not occur in normal operation).
--
-- No RLS changes needed: corp_chart_of_accounts uses the shared cockpit
-- allowlist from migration 00134 (cockpit_has_access() function).
-- No type changes needed: 'liability' is already a valid CorpAccountType
-- per packages/core/types/database.ts.
-- ============================================================================

UPDATE corp_chart_of_accounts
SET
  name  = 'Due to Shareholder — Andrew Shaw',
  type  = 'liability',
  notes = 'Loans from Andrew Shaw to AR Inc. Sign convention: positive amount_total = loan inflow (corp owes more), negative = repayment (corp owes less). Running balance = SUM(amount_total) across all 3010 corp_transactions.'
WHERE account_code = '3010';
