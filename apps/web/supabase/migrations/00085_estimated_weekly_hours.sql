-- Migration 00085 — Add estimated_weekly_hours to user_settings
--
-- Stores the agent's self-reported average weekly working hours.
-- Used to compute effective hourly rate and time-value metrics.
-- Nullable: when NULL, time-value features show a setup prompt.

ALTER TABLE user_settings
ADD COLUMN IF NOT EXISTS estimated_weekly_hours NUMERIC(5,1) DEFAULT NULL;

COMMENT ON COLUMN user_settings.estimated_weekly_hours IS
  'Self-reported average weekly working hours. Used to compute effective hourly rate.';
