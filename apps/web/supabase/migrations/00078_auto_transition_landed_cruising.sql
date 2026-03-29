-- Migration 00078 — Auto-transition clients from "Landed" to "Cruising"
--
-- When a client's most recent closed transaction is older than 90 days,
-- they should automatically move from "landed" to "cruising" flight status.
--
-- This migration creates:
--   1. fn_auto_transition_landed_to_cruising() — the transition function
--   2. A pg_cron schedule to run it daily at 3:00 AM UTC
--
-- The 90-day threshold represents the post-close period where the agent
-- is still actively managing closing tasks (title, keys, etc.). After
-- 90 days the relationship shifts to long-term nurture ("cruising").

-- ── 1. Transition function ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_auto_transition_landed_to_cruising()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected integer;
BEGIN
  -- Update all "landed" clients whose most recent closed transaction
  -- (from client_records via client_id FK, or transactions via client_name match)
  -- closed more than 90 days ago.
  --
  -- A client qualifies if:
  --   a) They have flight_status = 'landed'
  --   b) They have at least one closed transaction with a close_date
  --   c) The MOST RECENT such close_date is older than 90 days from today

  WITH latest_close AS (
    -- From client_records (linked via client_id FK)
    SELECT
      cr.client_id AS cid,
      MAX(cr.close_date) AS last_close
    FROM client_records cr
    WHERE cr.client_id IS NOT NULL
      AND cr.close_date IS NOT NULL
    GROUP BY cr.client_id

    UNION ALL

    -- From transactions (linked via client_name matching)
    SELECT
      c.id AS cid,
      MAX(t.date) AS last_close
    FROM transactions t
    JOIN clients c
      ON lower(trim(t.client_name)) = c.name_search
      AND t.user_id = c.user_id
    WHERE t.status = 'closed'
      AND t.date IS NOT NULL
    GROUP BY c.id
  ),
  -- Merge both sources: take the latest close_date per client
  merged AS (
    SELECT
      cid,
      MAX(last_close) AS last_close
    FROM latest_close
    GROUP BY cid
  )
  UPDATE clients
  SET status = 'cruising',
      updated_at = now()
  FROM merged
  WHERE clients.id = merged.cid
    AND clients.status = 'landed'
    AND merged.last_close < (CURRENT_DATE - INTERVAL '90 days');

  GET DIAGNOSTICS affected = ROW_COUNT;

  RAISE LOG 'fn_auto_transition_landed_to_cruising: transitioned % clients', affected;

  RETURN affected;
END;
$$;

-- Ownership & comment
ALTER FUNCTION fn_auto_transition_landed_to_cruising() OWNER TO postgres;
COMMENT ON FUNCTION fn_auto_transition_landed_to_cruising() IS
  'Auto-transitions clients from "landed" to "cruising" when their most recent '
  'closed transaction is older than 90 days. Runs daily via pg_cron at 03:00 UTC.';


-- ── 2. pg_cron schedule ─────────────────────────────────────────────────────

-- Enable pg_cron if not already (idempotent on Supabase)
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

-- Remove any existing schedule with this name (idempotent re-run)
SELECT cron.unschedule('auto-transition-landed-cruising')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'auto-transition-landed-cruising'
);

-- Schedule: daily at 3:00 AM UTC
SELECT cron.schedule(
  'auto-transition-landed-cruising',
  '0 3 * * *',
  $$SELECT fn_auto_transition_landed_to_cruising()$$
);
