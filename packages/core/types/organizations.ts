// ── Organization Types ──────────────────────────────────────────────────────
// Multi-tenant architecture for brokerages and standalone teams.
// Matches enums and tables from migration 00033_organizations.sql.
// ────────────────────────────────────────────────────────────────────────────

// ── Enums ──────────────────────────────────────────────────────────────────

export type OrgType = "brokerage" | "team";

export type OrgMemberRole = "owner" | "admin" | "team_leader" | "agent";

export type OrgMemberStatus = "active" | "pending" | "suspended" | "departed";

export type DataSharingTier = "tier1" | "tier2";

export type AuditAction =
  | "member_invited"
  | "member_joined"
  | "member_removed"
  | "member_departed"
  | "member_role_changed"
  | "consent_granted"
  | "consent_revoked"
  | "settings_changed"
  | "performance_viewed"
  | "export_requested";

// ── Display Labels ─────────────────────────────────────────────────────────

export const ORG_TYPE_LABELS: Record<OrgType, string> = {
  brokerage: "Brokerage",
  team: "Team",
};

export const ORG_MEMBER_ROLE_LABELS: Record<OrgMemberRole, string> = {
  owner: "Owner",
  admin: "Admin",
  team_leader: "Team Leader",
  agent: "Agent",
};

export const ORG_MEMBER_STATUS_LABELS: Record<OrgMemberStatus, string> = {
  active: "Active",
  pending: "Pending",
  suspended: "Suspended",
  departed: "Departed",
};

export const DATA_SHARING_TIER_LABELS: Record<DataSharingTier, string> = {
  tier1: "Basic (GCI & Deals Only)",
  tier2: "Extended (Monthly Breakdown & Expense Ratio)",
};

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  member_invited: "Member Invited",
  member_joined: "Member Joined",
  member_removed: "Member Removed",
  member_departed: "Member Departed",
  member_role_changed: "Role Changed",
  consent_granted: "Consent Granted",
  consent_revoked: "Consent Revoked",
  settings_changed: "Settings Changed",
  performance_viewed: "Performance Viewed",
  export_requested: "Export Requested",
};

// ── Row Types ──────────────────────────────────────────────────────────────

export interface Organization {
  id: string;
  name: string;
  slug: string;
  type: OrgType;
  owner_id: string;
  logo_url: string | null;
  anonymize_agents: boolean;
  max_seats: number;
  subscription_status: string;
  org_goal_gci: number | null;
  /** Stripe billing fields (added by migration 00059) */
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_price_id: string | null;
  billing_email: string | null;
  is_beta: boolean;
  created_at: string;
  updated_at: string;
}

export interface OrganizationMember {
  id: string;
  org_id: string;
  user_id: string;
  role: OrgMemberRole;
  status: OrgMemberStatus;
  data_sharing_tier: DataSharingTier;
  consent_granted_at: string | null;
  consent_version: number | null;
  joined_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrganizationInvitation {
  id: string;
  org_id: string;
  email: string;
  role: OrgMemberRole;
  token: string;
  invited_by: string;
  accepted_at: string | null;
  expires_at: string;
  created_at: string;
}

export interface SecurityAuditEntry {
  id: string;
  org_id: string;
  actor_id: string;
  action: AuditAction;
  target_user_id: string | null;
  metadata: Record<string, unknown>;
  ip_address: string | null;
  created_at: string;
}

// ── VIEW Type (org_agent_performance) ──────────────────────────────────────

export interface OrgAgentPerformance {
  org_id: string;
  user_id: string;
  role: OrgMemberRole;
  status: OrgMemberStatus;
  data_sharing_tier: DataSharingTier;

  // Tier 1 — always visible
  ytd_gci: number;
  deal_count: number;
  pipeline_count: number;
  pipeline_value: number;
  goal_gci: number;
  experience_years: number | null;

  // Tier 2 — only if agent opted in (null otherwise)
  monthly_gci: Record<string, number> | null;

  // Display
  agent_name: string;
  avatar_url: string;
}

// ── Context (passed through layout to sidebar) ─────────────────────────────

export interface OrgContext {
  org: Organization;
  membership: OrganizationMember;
  isAdmin: boolean;
  isOwner: boolean;
}

// ── Consent version constant ───────────────────────────────────────────────
// Increment when consent disclosure text changes materially.
export const CURRENT_CONSENT_VERSION = 1;

// ── Org Dashboard Types ───────────────────────────────────────────────────

export type OrgDashboardTab = "overview" | "leaderboard" | "trends" | "insights";

export type PaceStatus = "ahead" | "on-track" | "behind" | "no-goal";

export type OrgInsightSeverity = "critical" | "warning" | "info" | "praise";

export type LeaderboardSortKey =
  | "ytd_gci"
  | "deal_count"
  | "pipeline_value"
  | "avg_deal_size"
  | "goal_progress";

export interface OrgInsight {
  id: string;
  severity: OrgInsightSeverity;
  title: string;
  message: string;
  agentName?: string;
  agentId?: string;
  priority: number; // 0–100, higher = more urgent
}

export interface LeaderboardFilters {
  role: OrgMemberRole | "all";
  paceStatus: PaceStatus | "all";
  cohort: string; // "all" | Cohort values from benchmark engine
  search: string;
}

export const PACE_STATUS_LABELS: Record<PaceStatus, string> = {
  ahead: "Ahead",
  "on-track": "On Track",
  behind: "Behind",
  "no-goal": "No Goal Set",
};

export const ORG_INSIGHT_SEVERITY_COLORS: Record<OrgInsightSeverity, string> = {
  critical: "text-rose-500 bg-rose-500/10 border-rose-500/20",
  warning: "text-amber-500 bg-amber-500/10 border-amber-500/20",
  info: "text-blue-500 bg-blue-500/10 border-blue-500/20",
  praise: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20",
};
