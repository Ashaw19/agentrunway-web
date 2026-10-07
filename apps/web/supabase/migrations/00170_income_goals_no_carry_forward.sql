-- ============================================================================
-- Migration 00170: income goals don't carry forward
--
-- Andrew (2026-10-07), looking at 2027 showing "10,000 (carried forward)":
-- "I don't want previous year GCI carried forward. We need to have separate
-- years and separate goals."
--
-- income_goal_for_year() now returns that year's own row, else 0. A year
-- nobody set is "no goal" (not the previous year's number); from October 1
-- the dashboard prompts for next year's goal (shouldPromptNextYearGoal in
-- apps/web/lib/income-goals.ts) so January doesn't start blank by accident.
-- Mirrors goalForYear() in the same file.
--
-- Everything else from 00169 is unchanged (sync triggers, nightly rollover,
-- privileges). Re-syncs every user with rows; today (2026) every such user
-- has a 2026 row, so no user_settings.goal_gci value changes now.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.income_goal_for_year(p_user_id uuid, p_year integer)
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT coalesce((
    SELECT g.goal_gci FROM income_goals g
     WHERE g.user_id = p_user_id AND g.year = p_year
  ), 0)
$$;

-- CREATE OR REPLACE keeps existing grants; restate the 00169 revoke anyway.
REVOKE EXECUTE ON FUNCTION public.income_goal_for_year(uuid, integer) FROM PUBLIC, anon;

SELECT public.sync_all_income_goals();
