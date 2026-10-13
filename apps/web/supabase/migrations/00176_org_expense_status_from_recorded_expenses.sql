-- 00176_org_expense_status_from_recorded_expenses.sql
--
-- fn_org_expense_filing_status: "has this agent logged expenses this quarter"
-- read from the expenses that are actually recorded.
--
-- The function (00060) set has_expenses_this_quarter from
-- expense_items.ytd_amount > 0. Nothing in the app has written that column
-- since receipts replaced it: it is 0, or a figure typed years ago. So the
-- team report's "N agent(s) haven't logged expenses this quarter" counted an
-- agent with a quarter of receipts as not having logged any, and an agent
-- with one stale typed figure as having logged some. It was also not about
-- the quarter at all: ytd_amount was a year-to-date field.
--
-- An agent has logged expenses this quarter when any of these is true:
--   1. a receipt_expenses row dated in the quarter;
--   2. an active recurring_expenses row in effect during the quarter
--      (started on or before today, not ended before the quarter began);
--   3. a monthly figure typed on an expense item
--      (expense_items.monthly_recurring > 0): the older way to enter a cost,
--      which every expense total still counts for each month elapsed.
-- These are the three places an expense is recorded
-- (packages/core/engines/expense-totals-engine.ts, ytdExpenseTotals).
--
-- Unchanged: the signature and return columns, the caller check, SECURITY
-- DEFINER with search_path = public (00160), has_receipt_uploads and
-- expense_category_count. Still booleans and a count only, never an amount.
--
-- "This quarter" is now the Atlantic calendar quarter (the app's calendar,
-- as in income_goal_current_year, 00169), not the database server's UTC date:
-- from 9 pm Atlantic on the last day of a quarter (8 pm on Dec 31), UTC is
-- already in the next one and every agent read as having no receipts.
--
-- Prod at 2026-10-13, by count only: 1 organization, 7 active members; the
-- old and the new flag are true for the same 1 member, so no row changes
-- today.
--
-- CREATE OR REPLACE keeps the grants (00160). Safe to re-run.

CREATE OR REPLACE FUNCTION public.fn_org_expense_filing_status(p_org_id UUID)
RETURNS TABLE (
  user_id                    UUID,
  agent_name                 TEXT,
  has_expenses_this_quarter  BOOLEAN,
  expense_category_count     BIGINT,
  has_receipt_uploads        BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today       DATE := (now() AT TIME ZONE 'America/Halifax')::date;
  quarter_start DATE;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM organization_members
    WHERE org_id = p_org_id
      AND organization_members.user_id = auth.uid()
      AND status = 'active'
      AND role IN ('owner', 'admin', 'team_leader')
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  quarter_start := date_trunc('quarter', v_today)::date;

  RETURN QUERY
  SELECT
    om.user_id,
    COALESCE(us.display_name, 'Agent') AS agent_name,
    (
      COALESCE(rcpt.has_receipts, false)
      OR EXISTS (
        SELECT 1 FROM recurring_expenses rx
        WHERE rx.user_id = om.user_id
          AND rx.is_active
          AND rx.start_date <= v_today
          AND (rx.end_date IS NULL OR rx.end_date >= quarter_start)
      )
      OR EXISTS (
        SELECT 1 FROM expense_items ei
        WHERE ei.user_id = om.user_id
          AND ei.monthly_recurring > 0
      )
    ) AS has_expenses_this_quarter,
    (
      SELECT COUNT(DISTINCT ec.id)
      FROM expense_categories ec
      WHERE ec.user_id = om.user_id
    ) AS expense_category_count,
    COALESCE(rcpt.has_receipts, false) AS has_receipt_uploads
  FROM organization_members om
  LEFT JOIN user_settings us ON us.user_id = om.user_id
  LEFT JOIN LATERAL (
    SELECT EXISTS (
      SELECT 1 FROM receipt_expenses re
      WHERE re.user_id = om.user_id
        AND re.expense_date >= quarter_start
    ) AS has_receipts
  ) rcpt ON true
  WHERE om.org_id = p_org_id
    AND om.status = 'active';
END;
$$;
