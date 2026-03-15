-- Migration: Add tax_opt_dismissed column to user_settings
-- Tracks which tax optimization insight cards the user has dismissed or acted on.
-- Stored as a JSONB array of card IDs (e.g. ["rrspOptimization", "vehicleExpenseOptimizer"]).

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS tax_opt_dismissed JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN user_settings.tax_opt_dismissed
  IS 'Array of tax optimization card IDs the user has dismissed or marked as acted-on.';
