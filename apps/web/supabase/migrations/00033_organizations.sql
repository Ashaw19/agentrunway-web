-- ============================================================================
-- Agent Runway — Migration 00033: Organizations (Brokerage & Team Management)
-- ============================================================================
-- Multi-tenant architecture for brokerages (50–500+ agents) and standalone
-- teams (2–20 agents). Enforces three-tier data access model:
--   Tier 1 (always visible): YTD GCI, deal count, pipeline summary
--   Tier 2 (opt-in): Monthly GCI breakdown, expense ratio
--   Tier 3 (NEVER visible): Tax, expenses, splits, cash runway, province
-- ============================================================================

-- ============================================================================
-- ENUMS
-- ============================================================================

CREATE TYPE org_type AS ENUM ('brokerage', 'team');

CREATE TYPE org_member_role AS ENUM ('owner', 'admin', 'team_leader', 'agent');

CREATE TYPE org_member_status AS ENUM ('active', 'pending', 'suspended', 'departed');

CREATE TYPE data_sharing_tier AS ENUM ('tier1', 'tier2');

CREATE TYPE audit_action AS ENUM (
  'member_invited',
  'member_joined',
  'member_removed',
  'member_departed',
  'member_role_changed',
  'consent_granted',
  'consent_revoked',
  'settings_changed',
  'performance_viewed',
  'export_requested'
);

-- ============================================================================
-- 1. ORGANIZATIONS
-- ============================================================================

CREATE TABLE organizations (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT        NOT NULL,
  slug                TEXT        NOT NULL UNIQUE,
  type                org_type    NOT NULL,
  owner_id            UUID        NOT NULL REFERENCES auth.users(id),
  logo_url            TEXT,
  anonymize_agents    BOOLEAN     NOT NULL DEFAULT false,
  max_seats           INTEGER     NOT NULL DEFAULT 10,
  subscription_status TEXT        NOT NULL DEFAULT 'active',

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE organizations IS 'Brokerages and standalone teams. One row per organization.';
COMMENT ON COLUMN organizations.slug IS 'URL-safe unique identifier (e.g. "keller-williams-ottawa").';
COMMENT ON COLUMN organizations.anonymize_agents IS 'When true, agent names are replaced with "Agent A", "Agent B" in org dashboard.';
COMMENT ON COLUMN organizations.max_seats IS 'Maximum agent seats for this organization subscription.';


-- ============================================================================
-- 2. ORGANIZATION MEMBERS
-- ============================================================================

CREATE TABLE organization_members (
  id                  UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID              NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id             UUID              NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role                org_member_role   NOT NULL DEFAULT 'agent',
  status              org_member_status NOT NULL DEFAULT 'pending',
  data_sharing_tier   data_sharing_tier NOT NULL DEFAULT 'tier1',
  consent_granted_at  TIMESTAMPTZ,
  consent_version     INTEGER,
  joined_at           TIMESTAMPTZ,

  created_at          TIMESTAMPTZ       NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ       NOT NULL DEFAULT now(),

  UNIQUE (org_id, user_id)
);

COMMENT ON TABLE organization_members IS 'Maps users to organizations with role, consent, and data-sharing preferences.';
COMMENT ON COLUMN organization_members.data_sharing_tier IS 'tier1 = minimum (GCI, deals); tier2 = opt-in (monthly breakdown, expense ratio).';
COMMENT ON COLUMN organization_members.consent_version IS 'Tracks which version of the consent disclosure the agent agreed to.';


-- ============================================================================
-- 3. ORGANIZATION INVITATIONS
-- ============================================================================

CREATE TABLE organization_invitations (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email       TEXT        NOT NULL,
  role        org_member_role NOT NULL DEFAULT 'agent',
  token       TEXT        NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  invited_by  UUID        NOT NULL REFERENCES auth.users(id),
  accepted_at TIMESTAMPTZ,
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '14 days'),

  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (org_id, email)
);

COMMENT ON TABLE organization_invitations IS 'Token-based email invitations. Expires after 14 days. One per org+email.';


-- ============================================================================
-- 4. SECURITY AUDIT LOG (append-only)
-- ============================================================================

CREATE TABLE security_audit_log (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_id        UUID          NOT NULL REFERENCES auth.users(id),
  action          audit_action  NOT NULL,
  target_user_id  UUID          REFERENCES auth.users(id),
  metadata        JSONB         DEFAULT '{}',
  ip_address      INET,

  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now()
);

COMMENT ON TABLE security_audit_log IS 'Immutable audit trail. No UPDATE or DELETE policies — append-only by design.';


-- ============================================================================
-- 4b. PREREQUISITE — ensure team_split_pct column exists on transactions
-- ============================================================================
-- Migration 00012 added this column but may not have been applied to production.
-- The VIEW below references it, so we ensure it exists.
-- ============================================================================

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS team_split_pct NUMERIC(5,4) DEFAULT NULL;

COMMENT ON COLUMN transactions.team_split_pct IS
  'Agent''s share of the commission BEFORE the brokerage split is applied.
   NULL = no team split (agent keeps 100%).
   Example: 0.60 means a 60/40 arrangement with a team member.';


-- ============================================================================
-- 5. PERFORMANCE VIEW — org_agent_performance
-- ============================================================================
-- This VIEW computes only Tier 1/2 metrics from source tables.
-- Brokerage admins query this VIEW — NEVER source tables directly.
-- Tier 3 data (tax, expenses, splits, cash runway) is structurally absent.
-- ============================================================================

CREATE OR REPLACE VIEW org_agent_performance AS
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
  'Pre-computed agent metrics for org dashboards. Tier 3 data (tax, expenses, splits) is structurally absent — cannot be leaked.';


-- ============================================================================
-- 6. ROW LEVEL SECURITY
-- ============================================================================

-- ── organizations ──────────────────────────────────────────────────────────
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- Any active member can read their org
CREATE POLICY "org_member_read" ON organizations
  FOR SELECT
  USING (
    id IN (
      SELECT org_id FROM organization_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

-- Owner can insert (create) organizations they own
CREATE POLICY "org_owner_insert" ON organizations
  FOR INSERT
  WITH CHECK (owner_id = auth.uid());

-- Owner/admin can update org settings
CREATE POLICY "org_admin_update" ON organizations
  FOR UPDATE
  USING (
    id IN (
      SELECT org_id FROM organization_members
      WHERE user_id = auth.uid()
        AND role IN ('owner', 'admin')
        AND status = 'active'
    )
  );

-- Only owner can delete
CREATE POLICY "org_owner_delete" ON organizations
  FOR DELETE
  USING (owner_id = auth.uid());


-- ── organization_members ───────────────────────────────────────────────────
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;

-- Active members can see the member list for their org
CREATE POLICY "member_list_read" ON organization_members
  FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM organization_members
      WHERE user_id = auth.uid() AND status IN ('active', 'pending')
    )
  );

-- Owner/admin can insert new members
CREATE POLICY "admin_insert_member" ON organization_members
  FOR INSERT
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM organization_members
      WHERE user_id = auth.uid()
        AND role IN ('owner', 'admin')
        AND status = 'active'
    )
  );

-- Owner/admin can update any member; agents can update their own row (consent)
CREATE POLICY "admin_or_self_update_member" ON organization_members
  FOR UPDATE
  USING (
    user_id = auth.uid()
    OR org_id IN (
      SELECT org_id FROM organization_members
      WHERE user_id = auth.uid()
        AND role IN ('owner', 'admin')
        AND status = 'active'
    )
  );

-- Owner/admin can delete (remove) members
CREATE POLICY "admin_delete_member" ON organization_members
  FOR DELETE
  USING (
    org_id IN (
      SELECT org_id FROM organization_members
      WHERE user_id = auth.uid()
        AND role IN ('owner', 'admin')
        AND status = 'active'
    )
  );


-- ── organization_invitations ───────────────────────────────────────────────
ALTER TABLE organization_invitations ENABLE ROW LEVEL SECURITY;

-- Owner/admin can manage invitations
CREATE POLICY "admin_manage_invitations" ON organization_invitations
  FOR ALL
  USING (
    org_id IN (
      SELECT org_id FROM organization_members
      WHERE user_id = auth.uid()
        AND role IN ('owner', 'admin')
        AND status = 'active'
    )
  );

-- Anyone can read an invitation by token (for the accept flow)
-- This is handled via a service-role function, not RLS — token lookup
-- happens before the user is authenticated/associated with the org.


-- ── security_audit_log ─────────────────────────────────────────────────────
ALTER TABLE security_audit_log ENABLE ROW LEVEL SECURITY;

-- Active org members can insert audit entries
CREATE POLICY "audit_insert" ON security_audit_log
  FOR INSERT
  WITH CHECK (
    actor_id = auth.uid()
    AND org_id IN (
      SELECT org_id FROM organization_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

-- Owner/admin can read audit log
CREATE POLICY "audit_admin_read" ON security_audit_log
  FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM organization_members
      WHERE user_id = auth.uid()
        AND role IN ('owner', 'admin')
        AND status = 'active'
    )
  );

-- ⚠️ NO UPDATE OR DELETE POLICIES — append-only by design ⚠️


-- ============================================================================
-- 7. TRIGGERS
-- ============================================================================

-- Reuse the existing update_updated_at() function from migration 00001
CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_org_members_updated_at
  BEFORE UPDATE ON organization_members
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ============================================================================
-- 8. INDEXES
-- ============================================================================

CREATE INDEX idx_org_members_user        ON organization_members (user_id);
CREATE INDEX idx_org_members_org_status  ON organization_members (org_id, status);
CREATE INDEX idx_org_invitations_token   ON organization_invitations (token);
CREATE INDEX idx_org_invitations_email   ON organization_invitations (email);
CREATE INDEX idx_audit_log_org_date      ON security_audit_log (org_id, created_at DESC);
CREATE INDEX idx_organizations_slug      ON organizations (slug);
CREATE INDEX idx_organizations_owner     ON organizations (owner_id);
