-- ============================================================================
-- Migration 00079: Data Integrity CHECK Constraints
--
-- Prevents negative and unreasonable values at the database level.
-- These are the last line of defense — app-level validation catches them first.
-- ============================================================================

-- ── Transactions ─────────────────────────────────────────────────────────────

ALTER TABLE transactions
  ADD CONSTRAINT chk_tx_sale_price_non_negative
    CHECK (sale_price >= 0),
  ADD CONSTRAINT chk_tx_sale_price_reasonable
    CHECK (sale_price <= 100000000),
  ADD CONSTRAINT chk_tx_commission_pct_range
    CHECK (commission_pct >= 0 AND commission_pct <= 0.25),
  ADD CONSTRAINT chk_tx_gci_override_non_negative
    CHECK (gci_override IS NULL OR gci_override >= 0),
  ADD CONSTRAINT chk_tx_team_split_pct_range
    CHECK (team_split_pct IS NULL OR (team_split_pct >= 0 AND team_split_pct <= 1));


-- ── Pipeline Deals ───────────────────────────────────────────────────────────

ALTER TABLE pipeline_deals
  ADD CONSTRAINT chk_pd_estimated_price_non_negative
    CHECK (estimated_price >= 0),
  ADD CONSTRAINT chk_pd_estimated_price_reasonable
    CHECK (estimated_price <= 100000000),
  ADD CONSTRAINT chk_pd_commission_pct_range
    CHECK (estimated_commission_pct >= 0 AND estimated_commission_pct <= 0.25),
  ADD CONSTRAINT chk_pd_probability_range
    CHECK (probability_override IS NULL OR (probability_override >= 0 AND probability_override <= 1));


-- ── Receipt Expenses ─────────────────────────────────────────────────────────

ALTER TABLE receipt_expenses
  ADD CONSTRAINT chk_re_total_amount_non_negative
    CHECK (total_amount >= 0),
  ADD CONSTRAINT chk_re_total_amount_reasonable
    CHECK (total_amount <= 10000000),
  ADD CONSTRAINT chk_re_tax_non_negative
    CHECK (tax_amount IS NULL OR tax_amount >= 0);


-- ── Expense Items (monthly recurring) ────────────────────────────────────────

ALTER TABLE expense_items
  ADD CONSTRAINT chk_ei_monthly_recurring_non_negative
    CHECK (monthly_recurring IS NULL OR monthly_recurring >= 0),
  ADD CONSTRAINT chk_ei_monthly_recurring_reasonable
    CHECK (monthly_recurring IS NULL OR monthly_recurring <= 100000);


-- ── User Settings ────────────────────────────────────────────────────────────

ALTER TABLE user_settings
  ADD CONSTRAINT chk_us_vehicle_pct_range
    CHECK (vehicle_business_use_pct IS NULL OR (vehicle_business_use_pct >= 0 AND vehicle_business_use_pct <= 1)),
  ADD CONSTRAINT chk_us_cash_reserve_non_negative
    CHECK (cash_reserve IS NULL OR cash_reserve >= 0),
  ADD CONSTRAINT chk_us_goal_gci_non_negative
    CHECK (goal_gci IS NULL OR goal_gci >= 0),
  ADD CONSTRAINT chk_us_goal_transactions_non_negative
    CHECK (goal_transactions IS NULL OR goal_transactions >= 0);


-- ── History Items ────────────────────────────────────────────────────────────

ALTER TABLE history_items
  ADD CONSTRAINT chk_hi_annual_expenses_non_negative
    CHECK (annual_expenses IS NULL OR annual_expenses >= 0),
  ADD CONSTRAINT chk_hi_mileage_km_non_negative
    CHECK (annual_mileage_km IS NULL OR annual_mileage_km >= 0),
  ADD CONSTRAINT chk_hi_mileage_deduct_non_negative
    CHECK (annual_mileage_deduct IS NULL OR annual_mileage_deduct >= 0);


-- ── Client name length ───────────────────────────────────────────────────────

-- Fix existing overlong names (bad CSV imports stored messages as names)
UPDATE clients SET name = left(name, 200), name_search = left(lower(left(name, 200)), 200)
  WHERE char_length(name) > 200;

ALTER TABLE clients
  ADD CONSTRAINT chk_cl_name_length
    CHECK (char_length(name) <= 200);
