-- ============================================================================
-- Migration 00167: fn_org_pending_deals_summary read a column that doesn't exist
--
-- Found 2026-10-06 by a plpgsql_check sweep of every public plpgsql function
-- in prod, run while fixing 00166 (same bug class: a function referencing a
-- missing column fails at run time, never at deploy time). The extension
-- was installed inside a rolled-back transaction, so prod is unchanged.
--
--   fn_org_pending_deals_summary → 42703 column t.close_date does not exist
--
-- transactions has no close_date; its deal date is `date`. Since 00060 the
-- RPC has errored on every call, and org/reports/page.tsx falls back to []
-- (pendingRes.data ?? []), so the team Reports "Pending Deals" section has
-- always shown 0 / "—" to team leaders.
--
-- FIX: t.close_date → t.date. Everything else is the prod definition
-- verbatim, including the SECURITY DEFINER leader check and the
-- search_path pin from 00160.
--
-- Not changed (flagged separately): avg_probability averages commission_pct,
-- which is a commission rate, not a probability.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_org_pending_deals_summary(p_org_id uuid)
RETURNS TABLE(
  user_id         uuid,
  agent_name      text,
  pending_count   bigint,
  pending_value   numeric,
  avg_probability numeric,
  nearest_close   date
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM organization_members
    WHERE org_id = p_org_id AND organization_members.user_id = auth.uid()
      AND status = 'active' AND role IN ('owner','admin','team_leader')
  ) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  RETURN QUERY
  SELECT om.user_id, COALESCE(us.display_name,'Agent'),
    COALESCE(pd.cnt,0), COALESCE(pd.total_val,0), pd.avg_prob, pd.nearest
  FROM organization_members om
  LEFT JOIN user_settings us ON us.user_id = om.user_id
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS cnt, SUM(t.sale_price) AS total_val,
      AVG(CASE WHEN t.commission_pct > 0 THEN t.commission_pct ELSE NULL END) AS avg_prob,
      MIN(t.date) AS nearest
    FROM transactions t WHERE t.user_id = om.user_id AND t.status = 'pending'
  ) pd ON true
  WHERE om.org_id = p_org_id AND om.status = 'active';
END; $function$;
