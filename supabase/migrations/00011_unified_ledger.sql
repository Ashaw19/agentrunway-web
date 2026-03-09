-- ============================================================================
-- Phase 1: Unified Transaction Ledger
-- Adds date_precision + source columns to transactions so the table can hold
-- both current-year manual entries AND multi-year imported historical records.
-- ============================================================================

-- date_precision: how accurate the date on an imported deal is
--   'day'     → exact closing date known (default for all manual entries)
--   'month'   → date approximated to mid-month (day unknown)
--   'quarter' → date approximated to end-of-quarter (month unknown)
--   'year'    → date approximated to Dec 31 (only year known)
CREATE TYPE tx_date_precision AS ENUM ('day', 'month', 'quarter', 'year');

-- source: how the transaction was created
--   'manual'   → user typed it in via the Add Deal form
--   'imported' → extracted from an uploaded brokerage or tracker file
CREATE TYPE tx_source AS ENUM ('manual', 'imported');

ALTER TABLE transactions
  ADD COLUMN date_precision tx_date_precision NOT NULL DEFAULT 'day',
  ADD COLUMN source         tx_source         NOT NULL DEFAULT 'manual';

COMMENT ON COLUMN transactions.date_precision IS
  'How precise the closing date is: day (exact), month, quarter, or year (approximate). Always day for manual entries.';

COMMENT ON COLUMN transactions.source IS
  'Whether the record was entered manually by the user or extracted from an uploaded file.';
