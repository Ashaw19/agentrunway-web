-- ============================================================================
-- 00060 · Aggregate-only RPC functions for team leader reports
-- ============================================================================
-- These functions return ONLY counts and boolean flags — never raw data.
-- SECURITY DEFINER ensures they run with the definer's privileges but
-- include explicit access checks to prevent unauthorized calls.

-- ── 1. CRM Activity Summary ─────────────────────────────────────────────────
-- Returns per-member activity counts (no content, no descriptions)

CREATE OR REPLACE FUNCTION fn_org_crm_activity_summary(p_org_id UUID)
RETURNS TABLE (
  user_id        UUID,
  agent_name     TEXT,
  total_activities  BIGINT,
  calls            BIGINT,
  emails           BIGINT,
  texts            BIGINT,
  meetings         BIGINT,
  showings         BIGINT,
  active_clients   BIGINT,
  last_activity_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Access check: caller must be active owner/admin of this org
  IF NOT EXISTS (
    SELECT 1 FROM organization_members
    WHERE org_id = p_org_id
      AND organization_members.user_id = auth.uid()
      AND status = 'active'
      AND role IN ('owner', 'admin', 'team_leader')
  ) THEN
    RAISE EXCEPTION 'Unauthorized: not an admin of this organization';
  END IF;

  RETURN QUERY
  SELECT
    om.user_id,
    COALESCE(us.display_name, 'Agent') AS agent_name,
    COALESCE(act.total, 0) AS total_activities,
    COALESCE(act.calls, 0) AS calls,
    COALESCE(act.emails, 0) AS emails,
    COALESCE(act.texts, 0) AS texts,
    COALESCE(act.meetings, 0) AS meetings,
    COALESCE(act.showings, 0) AS showings,
    COALESCE(cl.active_count, 0) AS active_clients,
    act.last_at AS last_activity_at
  FROM organization_members om
  LEFT JOIN user_settings us ON us.user_id = om.user_id
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*)                                      AS total,
      COUNT(*) FILTER (WHERE ca.type = 'call')      AS calls,
      COUNT(*) FILTER (WHERE ca.type = 'email')     AS emails,
      COUNT(*) FILTER (WHERE ca.type = 'text')      AS texts,
      COUNT(*) FILTER (WHERE ca.type = 'meeting')   AS meetings,
      COUNT(*) FILTER (WHERE ca.type = 'showing')   AS showings,
      MAX(ca.activity_date)                         AS last_at
    FROM contact_activities ca
    WHERE ca.user_id = om.user_id
      AND ca.activity_date >= date_trunc('year', CURRENT_DATE)
  ) act ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS active_count
    FROM clients c
    WHERE c.user_id = om.user_id
      AND c.status IN ('boarding', 'taxiing', 'approach', 'in_flight')
  ) cl ON true
  WHERE om.org_id = p_org_id
    AND om.status = 'active';
END;
$$;

-- ── 2. Pending Deals Summary ────────────────────────────────────────────────
-- Returns per-member pending deal counts and total values (no addresses)

CREATE OR REPLACE FUNCTION fn_org_pending_deals_summary(p_org_id UUID)
RETURNS TABLE (
  user_id          UUID,
  agent_name       TEXT,
  pending_count    BIGINT,
  pending_value    NUMERIC,
  avg_probability  NUMERIC,
  nearest_close    DATE
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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

  RETURN QUERY
  SELECT
    om.user_id,
    COALESCE(us.display_name, 'Agent') AS agent_name,
    COALESCE(pd.cnt, 0) AS pending_count,
    COALESCE(pd.total_val, 0) AS pending_value,
    pd.avg_prob AS avg_probability,
    pd.nearest AS nearest_close
  FROM organization_members om
  LEFT JOIN user_settings us ON us.user_id = om.user_id
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*)              AS cnt,
      SUM(t.sale_price)     AS total_val,
      AVG(
        CASE
          WHEN t.commission_pct > 0 THEN t.commission_pct
          ELSE NULL
        END
      )                     AS avg_prob,
      MIN(t.close_date)     AS nearest
    FROM transactions t
    WHERE t.user_id = om.user_id
      AND t.status = 'pending'
  ) pd ON true
  WHERE om.org_id = p_org_id
    AND om.status = 'active';
END;
$$;

-- ── 3. Expense Filing Status ────────────────────────────────────────────────
-- Returns ONLY boolean flags — never amounts

CREATE OR REPLACE FUNCTION fn_org_expense_filing_status(p_org_id UUID)
RETURNS TABLE (
  user_id                    UUID,
  agent_name                 TEXT,
  has_expenses_this_quarter  BOOLEAN,
  expense_category_count     BIGINT,
  has_receipt_uploads        BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
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

  quarter_start := date_trunc('quarter', CURRENT_DATE);

  RETURN QUERY
  SELECT
    om.user_id,
    COALESCE(us.display_name, 'Agent') AS agent_name,
    COALESCE(exp.has_items, false) AS has_expenses_this_quarter,
    COALESCE(exp.cat_count, 0) AS expense_category_count,
    COALESCE(rcpt.has_receipts, false) AS has_receipt_uploads
  FROM organization_members om
  LEFT JOIN user_settings us ON us.user_id = om.user_id
  LEFT JOIN LATERAL (
    SELECT
      EXISTS(
        SELECT 1 FROM expense_items ei
        JOIN expense_categories ec ON ec.id = ei.category_id
        WHERE ec.user_id = om.user_id
          AND ei.ytd_amount > 0
      ) AS has_items,
      (
        SELECT COUNT(DISTINCT ec2.id)
        FROM expense_categories ec2
        WHERE ec2.user_id = om.user_id
      ) AS cat_count
  ) exp ON true
  LEFT JOIN LATERAL (
    SELECT EXISTS(
      SELECT 1 FROM receipt_expenses re
      WHERE re.user_id = om.user_id
        AND re.expense_date >= quarter_start
    ) AS has_receipts
  ) rcpt ON true
  WHERE om.org_id = p_org_id
    AND om.status = 'active';
END;
$$;
