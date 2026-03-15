-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 00014: T2125 Statement of Business Activities
-- ─────────────────────────────────────────────────────────────────────────────
-- Adds fields to user_settings needed for full T2125 pre-fill:
--   • Home office expense fields (for detailed method)
--   • GST/HST remittance tracking
--   • Vehicle ownership type
-- Creates t2125_cca_assets for Capital Cost Allowance tracking
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Extend user_settings with home-office detail fields ───────────────────

ALTER TABLE user_settings
  -- Home office method: 'simplified' uses $5/sq ft, 'detailed' uses actual costs
  ADD COLUMN IF NOT EXISTS home_office_method          TEXT         NOT NULL DEFAULT 'simplified',
  -- Square footage of dedicated office space (for simplified method)
  ADD COLUMN IF NOT EXISTS home_office_sq_footage      INTEGER               DEFAULT NULL,
  -- Detailed method: monthly/annual costs of the whole home
  ADD COLUMN IF NOT EXISTS home_office_rent_monthly    NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS home_office_utilities_monthly NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS home_office_property_tax_annual NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS home_office_insurance_monthly NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS home_office_maintenance_annual NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS home_office_condo_fees_monthly NUMERIC(10,2) NOT NULL DEFAULT 0,
  -- GST/HST registration and remittance tracking
  ADD COLUMN IF NOT EXISTS gst_hst_registered         BOOLEAN       NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS gst_hst_remitted_q1        NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gst_hst_remitted_q2        NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gst_hst_remitted_q3        NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gst_hst_remitted_q4        NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gst_hst_paid_on_expenses   NUMERIC(12,2) NOT NULL DEFAULT 0,
  -- Vehicle ownership: 'own', 'lease', 'none'
  ADD COLUMN IF NOT EXISTS vehicle_type               TEXT          NOT NULL DEFAULT 'own',
  -- T2125 instalment payments actually made this year
  ADD COLUMN IF NOT EXISTS cpp_instalment_paid_ytd    NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_instalment_paid_q1     NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_instalment_paid_q2     NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_instalment_paid_q3     NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_instalment_paid_q4     NUMERIC(12,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN user_settings.home_office_method IS 'T2125 home office deduction method: simplified ($5/sq ft) or detailed (actual costs × business use %).';
COMMENT ON COLUMN user_settings.home_office_sq_footage IS 'Square footage of dedicated home office space. Used for simplified T2125 home office deduction.';
COMMENT ON COLUMN user_settings.home_office_rent_monthly IS 'Monthly rent or mortgage interest for the home. Used in detailed T2125 home office calculation.';
COMMENT ON COLUMN user_settings.home_office_utilities_monthly IS 'Monthly utilities (hydro, heat, water) for the home. Used in detailed T2125 calculation.';
COMMENT ON COLUMN user_settings.home_office_property_tax_annual IS 'Annual property tax on the home. Used in detailed T2125 calculation.';
COMMENT ON COLUMN user_settings.home_office_insurance_monthly IS 'Monthly home insurance. Used in detailed T2125 calculation.';
COMMENT ON COLUMN user_settings.home_office_maintenance_annual IS 'Annual home maintenance and repairs. Used in detailed T2125 calculation.';
COMMENT ON COLUMN user_settings.home_office_condo_fees_monthly IS 'Monthly condo fees if applicable. Used in detailed T2125 calculation.';
COMMENT ON COLUMN user_settings.gst_hst_registered IS 'Whether the agent is registered for GST/HST with CRA.';
COMMENT ON COLUMN user_settings.gst_hst_remitted_q1 IS 'Actual GST/HST remitted to CRA in Q1.';
COMMENT ON COLUMN user_settings.gst_hst_remitted_q2 IS 'Actual GST/HST remitted to CRA in Q2.';
COMMENT ON COLUMN user_settings.gst_hst_remitted_q3 IS 'Actual GST/HST remitted to CRA in Q3.';
COMMENT ON COLUMN user_settings.gst_hst_remitted_q4 IS 'Actual GST/HST remitted to CRA in Q4.';
COMMENT ON COLUMN user_settings.gst_hst_paid_on_expenses IS 'GST/HST paid on business expenses YTD (Input Tax Credits claimable).';
COMMENT ON COLUMN user_settings.vehicle_type IS 'How the vehicle is held: own (purchased), lease, or none.';
COMMENT ON COLUMN user_settings.tax_instalment_paid_q1 IS 'CRA income tax instalment actually paid in Q1.';
COMMENT ON COLUMN user_settings.tax_instalment_paid_q2 IS 'CRA income tax instalment actually paid in Q2.';
COMMENT ON COLUMN user_settings.tax_instalment_paid_q3 IS 'CRA income tax instalment actually paid in Q3.';
COMMENT ON COLUMN user_settings.tax_instalment_paid_q4 IS 'CRA income tax instalment actually paid in Q4.';

-- ── 2. Capital Cost Allowance (CCA) assets table ─────────────────────────────

CREATE TABLE IF NOT EXISTS t2125_cca_assets (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID          NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,

  -- CRA CCA class and rates
  cca_class           INTEGER       NOT NULL,          -- 8, 10, 10.1, 12, 50, etc.
  class_rate          NUMERIC(5,4)  NOT NULL,           -- 0.20 = 20%, 0.30 = 30%, 1.00 = 100%
  class_half_year     BOOLEAN       NOT NULL DEFAULT true, -- CRA half-year rule applies

  -- Asset identification
  description         TEXT          NOT NULL,           -- "2023 Honda CR-V", "MacBook Pro", etc.
  acquisition_date    DATE          NOT NULL,

  -- Cost basis
  original_cost       NUMERIC(14,2) NOT NULL,           -- Total purchase price
  business_use_pct    NUMERIC(5,4)  NOT NULL DEFAULT 1, -- 0.0–1.0 (e.g. 0.80 for 80% business)

  -- Running UCC (Undepreciated Capital Cost)
  opening_ucc         NUMERIC(14,2) NOT NULL DEFAULT 0, -- UCC at start of current tax year
  additions_this_year NUMERIC(14,2) NOT NULL DEFAULT 0, -- New purchases this tax year
  disposals_this_year NUMERIC(14,2) NOT NULL DEFAULT 0, -- Proceeds from disposals this year
  cca_claimed_prior   NUMERIC(14,2) NOT NULL DEFAULT 0, -- Total CCA claimed in prior years

  -- Optional
  notes               TEXT,

  created_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- Trigger to auto-update updated_at
CREATE OR REPLACE TRIGGER t2125_cca_assets_updated_at
  BEFORE UPDATE ON t2125_cca_assets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── 3. RLS for t2125_cca_assets ──────────────────────────────────────────────

ALTER TABLE t2125_cca_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own CCA assets"
  ON t2125_cca_assets
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── 4. Helpful index ─────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS t2125_cca_assets_user_idx
  ON t2125_cca_assets (user_id);
