-- ============================================================================
-- Migration 00169: income goal per calendar year
--
-- Andrew (2026-10-06): "I need to be able to assign my income goal to a
-- specific year. I know I want to shoot for $80,000 next year. This year is a
-- write-off."
--
-- DESIGN
--   income_goals holds one GCI goal per (user, calendar year) — the source of
--   truth. user_settings.goal_gci stays exactly what ~55 readers already
--   treat it as: THIS year's goal (dashboard pace, Runway Score, forecasts,
--   AI context, org_agent_performance, mobile). It is kept in sync here, so
--   none of those readers change.
--
--   Goal in effect for a year = that year's row (an explicit 0 means "no goal
--   — write-off"); otherwise the latest earlier year's goal carries forward;
--   otherwise 0. "This year" is the calendar year in Atlantic time
--   (America/Halifax) — the business's home zone.
--
--   Sync paths:
--   - income_goals changes  → user_settings.goal_gci recomputed (trigger).
--   - user_settings.goal_gci written directly by older paths (onboarding,
--     mobile settings, Flight Crew updateUserSettings, MCP) → upserted as
--     this year's row (trigger). A transaction-local flag
--     (app.income_goal_sync) stops the two triggers re-firing each other.
--   - Year rollover: pg_cron 'sync-income-goals' daily at 04:05 UTC
--     (00:05 Atlantic on Jan 1) recomputes goal_gci for every user with rows.
--     Users with no rows are never touched.
--
-- Backfill: every existing goal_gci > 0 becomes that user's row for the
-- current year, so nothing changes for anyone until they set another year.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.income_goals (
  id         uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  year       integer       NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  goal_gci   numeric(14,2) NOT NULL DEFAULT 0 CHECK (goal_gci >= 0),
  created_at timestamptz   NOT NULL DEFAULT now(),
  updated_at timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT income_goals_user_year_key UNIQUE (user_id, year)
);

ALTER TABLE public.income_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "income_goals_select_own" ON public.income_goals
  FOR SELECT TO authenticated USING (user_id = (select auth.uid()));
CREATE POLICY "income_goals_insert_own" ON public.income_goals
  FOR INSERT TO authenticated WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY "income_goals_update_own" ON public.income_goals
  FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY "income_goals_delete_own" ON public.income_goals
  FOR DELETE TO authenticated USING (user_id = (select auth.uid()));

REVOKE ALL ON public.income_goals FROM anon;

-- ── Helpers ──────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.income_goal_current_year()
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT extract(year FROM now() AT TIME ZONE 'America/Halifax')::integer
$$;

-- Goal in effect: the latest row at or before p_year (that year's own row
-- wins; otherwise the most recent earlier goal carries forward), else 0.
CREATE OR REPLACE FUNCTION public.income_goal_for_year(p_user_id uuid, p_year integer)
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT coalesce((
    SELECT g.goal_gci FROM income_goals g
     WHERE g.user_id = p_user_id AND g.year <= p_year
     ORDER BY g.year DESC
     LIMIT 1
  ), 0)
$$;

-- Write the goal in effect for the current year into user_settings.goal_gci.
CREATE OR REPLACE FUNCTION public.sync_user_income_goal(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_goal numeric;
BEGIN
  v_goal := income_goal_for_year(p_user_id, income_goal_current_year());
  PERFORM set_config('app.income_goal_sync', 'on', true);
  UPDATE user_settings
     SET goal_gci = v_goal
   WHERE user_id = p_user_id
     AND goal_gci IS DISTINCT FROM v_goal;
  PERFORM set_config('app.income_goal_sync', 'off', true);
END;
$$;

-- Daily (pg_cron): handles the Jan 1 rollover. Only users who have rows.
CREATE OR REPLACE FUNCTION public.sync_all_income_goals()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT DISTINCT user_id FROM income_goals LOOP
    PERFORM sync_user_income_goal(r.user_id);
  END LOOP;
END;
$$;

-- ── Backfill (before the triggers exist) ─────────────────────────────────────

INSERT INTO public.income_goals (user_id, year, goal_gci)
SELECT user_id, public.income_goal_current_year(), goal_gci
  FROM public.user_settings
 WHERE goal_gci > 0
ON CONFLICT (user_id, year) DO NOTHING;

-- ── Sync triggers ────────────────────────────────────────────────────────────

-- income_goals → user_settings.goal_gci
CREATE OR REPLACE FUNCTION public.income_goals_after_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('app.income_goal_sync', true) = 'on' THEN
    RETURN NULL;
  END IF;
  PERFORM sync_user_income_goal(coalesce(NEW.user_id, OLD.user_id));
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_income_goals_sync ON public.income_goals;
CREATE TRIGGER trg_income_goals_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.income_goals
  FOR EACH ROW EXECUTE FUNCTION public.income_goals_after_change();

-- user_settings.goal_gci written directly → this year's income_goals row
CREATE OR REPLACE FUNCTION public.user_settings_goal_to_income_goals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('app.income_goal_sync', true) = 'on' THEN
    RETURN NEW;
  END IF;
  IF NEW.goal_gci IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.goal_gci IS NOT DISTINCT FROM OLD.goal_gci THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' AND NEW.goal_gci = 0 THEN
    RETURN NEW; -- a fresh settings row, not a goal
  END IF;

  PERFORM set_config('app.income_goal_sync', 'on', true);
  INSERT INTO income_goals (user_id, year, goal_gci)
  VALUES (NEW.user_id, income_goal_current_year(), NEW.goal_gci)
  ON CONFLICT (user_id, year)
  DO UPDATE SET goal_gci = EXCLUDED.goal_gci, updated_at = now();
  PERFORM set_config('app.income_goal_sync', 'off', true);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_settings_goal_sync ON public.user_settings;
CREATE TRIGGER trg_user_settings_goal_sync
  AFTER INSERT OR UPDATE OF goal_gci ON public.user_settings
  FOR EACH ROW EXECUTE FUNCTION public.user_settings_goal_to_income_goals();

-- ── Privileges: internal plumbing, not RPCs ──────────────────────────────────
-- PUBLIC holds EXECUTE by default; revoking only from anon is a no-op (00160).

REVOKE EXECUTE ON FUNCTION public.sync_user_income_goal(uuid)              FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_all_income_goals()                  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.income_goals_after_change()              FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.user_settings_goal_to_income_goals()     FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.income_goal_for_year(uuid, integer)      FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.income_goal_current_year()               FROM PUBLIC, anon;

-- ── Year rollover ────────────────────────────────────────────────────────────

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'sync-income-goals';
SELECT cron.schedule('sync-income-goals', '5 4 * * *', $cron$SELECT public.sync_all_income_goals()$cron$);
