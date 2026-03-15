-- ============================================================================
-- Agent Runway — Migration 00034: Org Dashboard Enhancements
-- ============================================================================
-- Adds goal_gci + experience_years (Tier 1) to the org_agent_performance VIEW
-- and org_goal_gci (optional org-level GCI target) to organizations.
-- Must DROP VIEW first because CREATE OR REPLACE cannot reorder columns.
-- ============================================================================

-- 1. Add optional org-level GCI goal
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS org_goal_gci NUMERIC(14,2) DEFAULT NULL;

COMMENT ON COLUMN organizations.org_goal_gci IS
  'Optional aggregate GCI goal for the organization. NULL = not set (emphasis on individual goals).';

-- 2. Drop existing VIEW (column order changed, CREATE OR REPLACE insufficient)
DROP VIEW IF EXISTS org_agent_performance;

-- 3. Recreate VIEW with additional Tier 1 columns
CREATE VIEW org_agent_performance AS
SELECT
  om.org_id,
  om.user_id,
  om.role,
  om.status,
  om.data_sharing_tier,

  -- ── Tier 1: Always visible ──────────────────────────────────────────────
  COALESCE(tx_agg.ytd_gci, 0)::NUMERIC(14,2)         AS ytd_gci,
  COALESCE(tx_agg.deal_count, 0)::INTEGER              AS deal_count,
  COALESCE(pl_agg.pipeline_count, 0)::INTEGER           AS pipeline_count,
  COALESCE(pl_agg.pipeline_value, 0)::NUMERIC(14,2)    AS pipeline_value,

  -- ── NEW Tier 1: Personal goal + experience ────────────────────────────
  COALESCE(us.goal_gci, 0)::NUMERIC(14,2)             AS goal_gci,
  us.experience_years,

  -- ── Tier 2: Only if agent opted in ──────────────────────────────────────
  CASE
    WHEN om.data_sharing_tier = 'tier2' THEN tx_agg.monthly_gci
    ELSE NULL
  END AS monthly_gci,

  -- ── Agent display info ──────────────────────────────────────────────────
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

COMMENT ON VIEW org_agent_performance IS
  'Pre-computed agent metrics for org dashboards. Now includes goal_gci and experience_years (Tier 1). Tier 3 data is structurally absent.';
