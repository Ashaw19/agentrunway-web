-- ============================================================================
-- Agent Runway — Migration 00113: Fix org_agent_performance VIEW security
-- ============================================================================
-- The VIEW was created with default SECURITY INVOKER, which means RLS on
-- underlying tables (user_settings, transactions, pipeline_deals) blocks
-- team leaders/admins from seeing other members' data.
--
-- Fix: Recreate with SECURITY DEFINER so the VIEW can read across users.
-- This is safe because the VIEW only exposes Tier 1/2 metrics — no expenses,
-- no tax, no client details, no splits, no cash runway (Tier 3 is
-- structurally absent from the SELECT).
-- ============================================================================

-- 1. Drop existing VIEW
DROP VIEW IF EXISTS org_agent_performance;

-- 2. Recreate with SECURITY DEFINER
CREATE VIEW org_agent_performance
WITH (security_invoker = false)
AS
SELECT
  om.org_id,
  om.user_id,
  om.role,
  om.status,
  om.data_sharing_tier,

  -- Tier 1: Always visible
  COALESCE(tx_agg.ytd_gci, 0)::NUMERIC(14,2)         AS ytd_gci,
  COALESCE(tx_agg.deal_count, 0)::INTEGER              AS deal_count,
  COALESCE(pl_agg.pipeline_count, 0)::INTEGER           AS pipeline_count,
  COALESCE(pl_agg.pipeline_value, 0)::NUMERIC(14,2)    AS pipeline_value,

  -- Tier 1: Personal goal + experience
  COALESCE(us.goal_gci, 0)::NUMERIC(14,2)             AS goal_gci,
  us.experience_years,

  -- Tier 2: Only if agent opted in
  CASE
    WHEN om.data_sharing_tier = 'tier2' THEN tx_agg.monthly_gci
    ELSE NULL
  END AS monthly_gci,

  -- Agent display info
  COALESCE(NULLIF(us.display_name, ''), 'Agent') AS agent_name,
  us.avatar_url

FROM organization_members om
LEFT JOIN user_settings us ON us.user_id = om.user_id

-- Aggregate closed YTD transactions
LEFT JOIN LATERAL (
  SELECT
    SUM(
      COALESCE(tx.gci_override, tx.sale_price * tx.commission_pct)
      * COALESCE(tx.team_split_pct, 1)
    ) AS ytd_gci,
    COUNT(*) AS deal_count,
    jsonb_object_agg(
      EXTRACT(MONTH FROM tx.date)::TEXT,
      COALESCE(tx.gci_override, tx.sale_price * tx.commission_pct)
        * COALESCE(tx.team_split_pct, 1)
    ) AS monthly_gci
  FROM transactions tx
  WHERE tx.user_id = om.user_id
    AND tx.status = 'closed'
    AND EXTRACT(YEAR FROM tx.date) = EXTRACT(YEAR FROM now())
) tx_agg ON true

-- Aggregate active pipeline
LEFT JOIN LATERAL (
  SELECT
    COUNT(*)  AS pipeline_count,
    SUM(pd.estimated_price * pd.estimated_commission_pct) AS pipeline_value
  FROM pipeline_deals pd
  WHERE pd.user_id = om.user_id
) pl_agg ON true

WHERE om.status = 'active';

-- 3. Set owner to postgres (the superuser) so SECURITY DEFINER runs as postgres
ALTER VIEW org_agent_performance OWNER TO postgres;

COMMENT ON VIEW org_agent_performance IS
  'Pre-computed agent metrics for org dashboards. SECURITY DEFINER so team leaders can read across members. Tier 3 data is structurally absent.';
