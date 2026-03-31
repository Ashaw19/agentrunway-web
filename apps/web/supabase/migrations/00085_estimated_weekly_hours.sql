-- Migration 00085 — Add time-value fields to user_settings
--
-- Stores the agent's self-reported average weekly working hours and
-- annual vacation weeks. Used to compute effective hourly rate and
-- time-value metrics. Nullable: when NULL, time-value features show
-- a setup prompt.

ALTER TABLE user_settings
ADD COLUMN IF NOT EXISTS estimated_weekly_hours NUMERIC(5,1) DEFAULT NULL;

ALTER TABLE user_settings
ADD COLUMN IF NOT EXISTS vacation_weeks_per_year NUMERIC(4,1) DEFAULT NULL;

COMMENT ON COLUMN user_settings.estimated_weekly_hours IS
  'Self-reported average weekly working hours. Used to compute effective hourly rate.';

COMMENT ON COLUMN user_settings.vacation_weeks_per_year IS
  'Weeks of vacation/time-off per year. Reduces annual working hours for hourly rate calculation.';
