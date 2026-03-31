-- Migration 00083 — Add pipeline-ready fields to listing_appointments
--
-- Adds commission rate and expected close date so listing appointments
-- can produce weighted GCI figures for pipeline forecasting.

ALTER TABLE listing_appointments
  ADD COLUMN IF NOT EXISTS estimated_commission_pct NUMERIC(7,6) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS expected_close_date DATE DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS listing_agreement_date DATE DEFAULT NULL;
