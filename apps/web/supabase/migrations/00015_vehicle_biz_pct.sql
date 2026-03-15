-- Migration 00015: Add vehicle_business_use_pct to user_settings
-- Allows agents to set the percentage of vehicle use that is for business
-- (e.g. 0.80 = 80% business use).  Defaults to 80% — a common starting
-- point for real estate agents who drive frequently for work.

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS vehicle_business_use_pct NUMERIC(5,4) NOT NULL DEFAULT 0.80;
