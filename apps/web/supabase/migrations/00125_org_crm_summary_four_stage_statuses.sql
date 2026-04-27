-- ============================================================================
-- 00125 · Update fn_org_crm_activity_summary for the 4-stage status model
-- ============================================================================
-- Migration 00102 collapsed client statuses from 6 stages to 4
-- (Boarding, Scheduled, In-Flight, Cruising). The org-report function
-- defined in 00060 still filtered active clients on the dropped legacy
-- statuses ('taxiing', 'approach') and silently excluded the new
-- 'scheduled' stage. After 00102's UPDATE remap, taxiing/approach rows
-- no longer exist, but Scheduled clients have been silently missing
-- from team-leader org reports ever since.
--
-- This redefines the function to filter on the canonical four-stage
-- "active" set ('boarding', 'scheduled', 'in_flight'). Cruising is
-- excluded because it represents past clients in long-term nurture,
-- which is the same semantic position 'landed' held in 00060.

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
SET search_path = public, pg_temp
AS $$
BEGIN
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
      AND c.status IN ('boarding', 'scheduled', 'in_flight')
  ) cl ON true
  WHERE om.org_id = p_org_id
    AND om.status = 'active';
END;
$$;
