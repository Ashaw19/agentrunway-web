-- Migration 00110: Add brokerage HST withholding flag
-- Some brokerages withhold the HST/GST portion of commission cheques
-- and remit it to CRA on the agent's behalf (releasing quarterly).
-- This affects cash flow projections, survival runway, and per-paycheque guidance.

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS brokerage_withholds_hst boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN user_settings.brokerage_withholds_hst IS
  'If true, the brokerage withholds HST from commission cheques and remits to CRA. Agent receives net-of-HST payments.';
