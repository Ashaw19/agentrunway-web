-- Migration 00096 — Auto-transition function now returns affected client IDs
--
-- The previous function only returned a count. The cron route needs the actual
-- client_id + user_id pairs to fire matching flight plans server-side,
-- since flight plans were previously only triggered from client-side code.

-- Drop old function (return type changed from integer to TABLE)
DROP FUNCTION IF EXISTS fn_auto_transition_landed_to_cruising();

CREATE OR REPLACE FUNCTION fn_auto_transition_landed_to_cruising()
RETURNS TABLE(client_id uuid, user_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
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
      lc.cid,
      MAX(lc.last_close) AS last_close
    FROM latest_close lc
    GROUP BY lc.cid
  ),
  transitioned AS (
    UPDATE clients
    SET status = 'cruising',
        updated_at = now()
    FROM merged
    WHERE clients.id = merged.cid
      AND clients.status = 'landed'
      AND merged.last_close < (CURRENT_DATE - INTERVAL '30 days')
    RETURNING clients.id AS cid, clients.user_id AS uid
  )
  SELECT t.cid AS client_id, t.uid AS user_id
  FROM transitioned t;
END;
$$;

ALTER FUNCTION fn_auto_transition_landed_to_cruising() OWNER TO postgres;
COMMENT ON FUNCTION fn_auto_transition_landed_to_cruising() IS
  'Auto-transitions clients from "landed" to "cruising" when their most recent '
  'closed transaction is older than 30 days. Returns affected client_id + user_id pairs '
  'so the cron route can fire matching flight plans. Runs daily via pg_cron at 03:00 UTC.';
