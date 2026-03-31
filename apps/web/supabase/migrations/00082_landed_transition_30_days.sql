-- Migration 00082 — Shorten Landed → Cruising auto-transition from 90 to 30 days
--
-- The 90-day window was too long for the post-close relationship phase.
-- 30 days better reflects reality: after a month, the agent has wrapped up
-- closing tasks and the relationship shifts to long-term nurture.
--
-- This replaces the function from migration 00078. The pg_cron schedule
-- remains unchanged (daily at 3:00 AM UTC).

CREATE OR REPLACE FUNCTION fn_auto_transition_landed_to_cruising()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected integer;
BEGIN
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
    AND merged.last_close < (CURRENT_DATE - INTERVAL '30 days');

  GET DIAGNOSTICS affected = ROW_COUNT;

  RAISE LOG 'fn_auto_transition_landed_to_cruising: transitioned % clients (30-day threshold)', affected;

  RETURN affected;
END;
$$;

ALTER FUNCTION fn_auto_transition_landed_to_cruising() OWNER TO postgres;
COMMENT ON FUNCTION fn_auto_transition_landed_to_cruising() IS
  'Auto-transitions clients from "landed" to "cruising" when their most recent '
  'closed transaction is older than 30 days. Runs daily via pg_cron at 03:00 UTC.';
