-- 00159: Lock down SECURITY DEFINER views flagged by the Supabase security
-- advisor (2026-07-02 pre-onboarding audit).
--
-- 1) org_agent_performance leaked cross-tenant: SECURITY DEFINER (bypasses
--    RLS on transactions/pipeline_deals/user_settings, which is required so
--    team leaders can aggregate members' numbers) but had NO caller filter,
--    and both anon and authenticated held SELECT. Any API caller could read
--    every agent's GCI/deals/pipeline/goals across ALL orgs by omitting the
--    app's client-side .eq("org_id", ...) filter.
--    Fix: keep DEFINER (needed for the cross-user aggregation) but restrict
--    rows to orgs where the CALLER is an active member, and revoke anon.
--    App consumers (org/page, org/reports, chat route, org-actions,
--    data-export) all query as an org member, so they see exactly what they
--    saw before.
--
-- 2) v_corp_* (Director Cockpit) were SECURITY DEFINER with authenticated
--    SELECT — exposing AR Inc.'s corporate books to any logged-in user. The
--    underlying corp_* tables carry proper RLS (user_id = auth.uid() AND
--    cockpit_has_access()), so flipping the views to security_invoker makes
--    that RLS apply. Cockpit pages query with the owner's JWT and keep
--    working; everyone else gets zero rows.

-- ── 1. org_agent_performance: rebuild with caller-membership filter ─────────

CREATE OR REPLACE VIEW public.org_agent_performance
WITH (security_barrier = true) AS
SELECT
  om.org_id,
  om.user_id,
  om.role,
  om.status,
  om.data_sharing_tier,
  (COALESCE(tx_agg.ytd_gci, 0::numeric))::numeric(14,2)      AS ytd_gci,
  (COALESCE(tx_agg.deal_count, 0::bigint))::integer          AS deal_count,
  (COALESCE(pl_agg.pipeline_count, 0::bigint))::integer      AS pipeline_count,
  (COALESCE(pl_agg.pipeline_value, 0::numeric))::numeric(14,2) AS pipeline_value,
  (COALESCE(us.goal_gci, 0::numeric))::numeric(14,2)         AS goal_gci,
  us.experience_years,
  CASE
    WHEN om.data_sharing_tier = 'tier2'::data_sharing_tier THEN tx_agg.monthly_gci
    ELSE NULL::jsonb
  END                                                        AS monthly_gci,
  COALESCE(NULLIF(us.display_name, ''::text), 'Agent'::text) AS agent_name,
  us.avatar_url
FROM organization_members om
LEFT JOIN user_settings us ON us.user_id = om.user_id
LEFT JOIN LATERAL (
  SELECT
    sum(COALESCE(tx.gci_override, tx.sale_price * tx.commission_pct) * COALESCE(tx.team_split_pct, 1::numeric)) AS ytd_gci,
    count(*) AS deal_count,
    jsonb_object_agg(
      (EXTRACT(month FROM tx.date))::text,
      COALESCE(tx.gci_override, tx.sale_price * tx.commission_pct) * COALESCE(tx.team_split_pct, 1::numeric)
    ) AS monthly_gci
  FROM transactions tx
  WHERE tx.user_id = om.user_id
    AND tx.status = 'closed'::transaction_status
    AND EXTRACT(year FROM tx.date) = EXTRACT(year FROM now())
) tx_agg ON true
LEFT JOIN LATERAL (
  SELECT
    count(*) AS pipeline_count,
    sum(pd.estimated_price * pd.estimated_commission_pct) AS pipeline_value
  FROM pipeline_deals pd
  WHERE pd.user_id = om.user_id
) pl_agg ON true
WHERE om.status = 'active'::org_member_status
  -- Caller isolation: only rows from orgs the requesting user actively
  -- belongs to. anon (auth.uid() IS NULL) matches nothing.
  AND om.org_id IN (
    SELECT my.org_id
    FROM organization_members my
    WHERE my.user_id = (SELECT auth.uid())
      AND my.status = 'active'::org_member_status
  );

REVOKE ALL ON public.org_agent_performance FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.org_agent_performance FROM authenticated;

-- ── 2. Director Cockpit views: inherit corp_* RLS via security_invoker ──────

ALTER VIEW public.v_corp_upcoming_compliance          SET (security_invoker = true);
ALTER VIEW public.v_corp_bank_reconciliation_summary  SET (security_invoker = true);
ALTER VIEW public.v_corp_sred_annual_summary          SET (security_invoker = true);

REVOKE ALL ON public.v_corp_upcoming_compliance         FROM anon;
REVOKE ALL ON public.v_corp_bank_reconciliation_summary FROM anon;
REVOKE ALL ON public.v_corp_sred_annual_summary         FROM anon;
