-- Migration 00102 — Collapse client statuses to 4 stages
--
-- Old (6): boarding, taxiing, approach, in_flight, landed, cruising
-- New (4): boarding, scheduled, in_flight, cruising
--
-- Rationale: 6-stage funnel was too rigid. Collapse to mirror real agent
-- mental model. "Landed" becomes a celebration moment (not a status) — clients
-- transition straight to "cruising" on close. "Scheduled" is a new bucket
-- for future-intent clients with a target date or phrase.
--
-- Mapping:
--   taxiing → boarding   (early-stage active prospects)
--   approach → in_flight (closer to closing)
--   landed   → cruising  (post-close = cruising immediately)
--
-- Also: drop the pg_cron landed→cruising auto-transition (no longer needed),
-- change default status from boarding to cruising (imports default to cruising),
-- add scheduled_for + scheduled_phrase columns for the Scheduled stage.

-- 1. Drop the pg_cron job and underlying function (no longer needed)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'auto-transition-landed-cruising') THEN
    PERFORM cron.unschedule('auto-transition-landed-cruising');
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- Non-fatal: cron extension may not be available in some envs
  NULL;
END $$;

DROP FUNCTION IF EXISTS fn_auto_transition_landed_to_cruising();

-- 2. Drop the existing CHECK constraint so we can remap rows
ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_status_valid;

-- 3. Remap existing rows to the 4-stage model
UPDATE clients SET status = 'boarding'  WHERE status = 'taxiing';
UPDATE clients SET status = 'in_flight' WHERE status = 'approach';
UPDATE clients SET status = 'cruising'  WHERE status = 'landed';

-- 4. Add the new CHECK constraint
ALTER TABLE clients
  ADD CONSTRAINT clients_status_valid
  CHECK (status IN ('boarding', 'scheduled', 'in_flight', 'cruising'));

-- 5. Change default to cruising (imports default to cruising; new manual entries
--    that are forward-looking should be set explicitly to boarding/scheduled).
ALTER TABLE clients ALTER COLUMN status SET DEFAULT 'cruising';

-- 6. Add scheduled stage columns
ALTER TABLE clients ADD COLUMN IF NOT EXISTS scheduled_for date;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS scheduled_phrase text;

COMMENT ON COLUMN clients.scheduled_for IS
  'Future date when client plans to act (sell/buy). Used by Scheduled stage.';
COMMENT ON COLUMN clients.scheduled_phrase IS
  'Vague phrase like "after the holidays" or "next spring" when exact date unknown.';
