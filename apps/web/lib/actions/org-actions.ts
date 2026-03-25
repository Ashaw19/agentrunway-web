"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  OrgType,
  OrgMemberRole,
  DataSharingTier,
  Organization,
  OrganizationMember,
  OrganizationInvitation,
  OrgAgentPerformance,
  SecurityAuditEntry,
} from "@/lib/types/organizations";
import { CURRENT_CONSENT_VERSION } from "@/lib/types/organizations";

// ── Helpers ────────────────────────────────────────────────────────────────

type ActionResult<T> = { data: T; error: null } | { data: null; error: string };

// Sync Stripe seat count after member changes — non-fatal
async function syncOrgSeats(orgId: string): Promise<void> {
  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://agentrunway.ca";
    await fetch(`${appUrl}/api/team-billing/update-seats`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ org_id: orgId }),
    });
  } catch {
    // Non-fatal — billing sync failure doesn't block UX
  }
}

async function getAuthUserId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

async function verifyAdminRole(
  orgId: string,
  userId: string,
): Promise<{ isAdmin: boolean; membership: OrganizationMember | null }> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("organization_members")
    .select("*")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .eq("status", "active")
    .single();

  if (!data) return { isAdmin: false, membership: null };
  return {
    isAdmin: data.role === "owner" || data.role === "admin",
    membership: data as OrganizationMember,
  };
}

async function isUserInSandboxMode(userId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("user_settings")
    .select("sandbox_mode")
    .eq("user_id", userId)
    .single();
  return data?.sandbox_mode === true;
}

async function logAudit(
  orgId: string,
  actorId: string,
  action: string,
  targetUserId?: string | null,
  metadata?: Record<string, unknown>,
): Promise<void> {
  const supabase = await createClient();
  await supabase.from("security_audit_log").insert({
    org_id: orgId,
    actor_id: actorId,
    action,
    target_user_id: targetUserId ?? null,
    metadata: metadata ?? {},
  });
}

// ── 1. Create Organization ────────────────────────────────────────────────

export async function createOrganization(
  name: string,
  type: OrgType,
  slug: string,
): Promise<ActionResult<Organization>> {
  const userId = await getAuthUserId();
  if (!userId) return { data: null, error: "Not authenticated" };

  if (await isUserInSandboxMode(userId)) {
    return { data: null, error: "Blocked in Sandbox Mode" };
  }

  const supabase = await createClient();

  // Validate slug format
  const cleanSlug = slug
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  if (cleanSlug.length < 3) {
    return { data: null, error: "Slug must be at least 3 characters" };
  }

  // Check if user already owns an org of this type
  const { data: existingMembership } = await supabase
    .from("organization_members")
    .select("*, organizations!inner(type)")
    .eq("user_id", userId)
    .eq("role", "owner")
    .eq("status", "active");

  const existingTypes = (existingMembership ?? []).map(
    (m: Record<string, unknown>) =>
      (m.organizations as Record<string, unknown>)?.type,
  );

  if (existingTypes.includes(type)) {
    return {
      data: null,
      error: `You already own a ${type}. Only one ${type} per account.`,
    };
  }

  // Create the organization
  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .insert({
      name,
      slug: cleanSlug,
      type,
      owner_id: userId,
    })
    .select()
    .single();

  if (orgError || !org) {
    if (orgError?.code === "23505") {
      return { data: null, error: "This slug is already taken" };
    }
    return { data: null, error: orgError?.message ?? "Failed to create organization" };
  }

  // Create owner membership
  await supabase.from("organization_members").insert({
    org_id: org.id,
    user_id: userId,
    role: "owner" as OrgMemberRole,
    status: "active",
    data_sharing_tier: "tier2" as DataSharingTier,
    consent_granted_at: new Date().toISOString(),
    consent_version: CURRENT_CONSENT_VERSION,
    joined_at: new Date().toISOString(),
  });

  // Audit log
  await logAudit(org.id, userId, "settings_changed", null, {
    detail: "Organization created",
    name,
    type,
  });

  return { data: org as Organization, error: null };
}

// ── 2. Invite Members ─────────────────────────────────────────────────────

export async function inviteMembers(
  orgId: string,
  emails: string[],
  role: OrgMemberRole = "agent",
): Promise<ActionResult<OrganizationInvitation[]>> {
  const userId = await getAuthUserId();
  if (!userId) return { data: null, error: "Not authenticated" };

  if (await isUserInSandboxMode(userId)) {
    return { data: null, error: "Blocked in Sandbox Mode" };
  }

  const { isAdmin } = await verifyAdminRole(orgId, userId);
  if (!isAdmin) return { data: null, error: "Only admins can invite members" };

  // Prevent inviting as owner
  if (role === "owner") {
    return { data: null, error: "Cannot invite someone as owner" };
  }

  const supabase = await createClient();

  // Check seat limit
  const { count: memberCount } = await supabase
    .from("organization_members")
    .select("*", { count: "exact", head: true })
    .eq("org_id", orgId)
    .in("status", ["active", "pending"]);

  const { data: org } = await supabase
    .from("organizations")
    .select("max_seats")
    .eq("id", orgId)
    .single();

  if (org && memberCount !== null && memberCount + emails.length > org.max_seats) {
    return {
      data: null,
      error: `This would exceed the ${org.max_seats} seat limit. ${memberCount} seats currently used.`,
    };
  }

  // Create invitations (upsert to handle re-invites)
  const invitations = emails.map((email) => ({
    org_id: orgId,
    email: email.toLowerCase().trim(),
    role,
    invited_by: userId,
  }));

  const { data: created, error } = await supabase
    .from("organization_invitations")
    .upsert(invitations, { onConflict: "org_id,email" })
    .select();

  if (error) return { data: null, error: error.message };

  // Audit each invitation
  for (const email of emails) {
    await logAudit(orgId, userId, "member_invited", null, {
      email: email.toLowerCase().trim(),
      role,
    });
  }

  // Sync Stripe seat count (fire-and-forget, non-fatal)
  void syncOrgSeats(orgId);

  return { data: (created ?? []) as OrganizationInvitation[], error: null };
}

// ── 3. Accept Invitation ──────────────────────────────────────────────────

export async function acceptInvitation(
  token: string,
): Promise<ActionResult<OrganizationMember>> {
  const userId = await getAuthUserId();
  if (!userId) return { data: null, error: "Not authenticated" };

  if (await isUserInSandboxMode(userId)) {
    return { data: null, error: "Blocked in Sandbox Mode" };
  }

  // Use admin client to read invitation (not RLS-protected for the invitee)
  const admin = createAdminClient();

  const { data: invitation, error: invError } = await admin
    .from("organization_invitations")
    .select("*, organizations(name, type)")
    .eq("token", token)
    .is("accepted_at", null)
    .single();

  if (invError || !invitation) {
    return { data: null, error: "Invitation not found or already accepted" };
  }

  // Check expiry
  if (new Date(invitation.expires_at) < new Date()) {
    return { data: null, error: "This invitation has expired" };
  }

  // Check multi-org limit: 1 brokerage + 1 team max
  const { data: existingMemberships } = await admin
    .from("organization_members")
    .select("*, organizations!inner(type)")
    .eq("user_id", userId)
    .in("status", ["active", "pending"]);

  const orgType = (invitation.organizations as Record<string, unknown>)?.type;
  const alreadyInSameType = (existingMemberships ?? []).some(
    (m: Record<string, unknown>) =>
      (m.organizations as Record<string, unknown>)?.type === orgType,
  );

  if (alreadyInSameType) {
    return {
      data: null,
      error: `You are already a member of a ${orgType}. You can only belong to one ${orgType} at a time.`,
    };
  }

  // Create membership (pending until consent is granted)
  const { data: member, error: memberError } = await admin
    .from("organization_members")
    .insert({
      org_id: invitation.org_id,
      user_id: userId,
      role: invitation.role,
      status: "pending",
      data_sharing_tier: "tier1" as DataSharingTier,
    })
    .select()
    .single();

  if (memberError) {
    if (memberError.code === "23505") {
      return { data: null, error: "You are already a member of this organization" };
    }
    return { data: null, error: memberError.message };
  }

  // Mark invitation as accepted
  await admin
    .from("organization_invitations")
    .update({ accepted_at: new Date().toISOString() })
    .eq("id", invitation.id);

  // Audit log (use admin client since user may not have RLS access yet)
  await admin.from("security_audit_log").insert({
    org_id: invitation.org_id,
    actor_id: userId,
    action: "member_joined",
    metadata: { email: invitation.email, role: invitation.role },
  });

  // Sync Stripe seat count (fire-and-forget, non-fatal)
  void syncOrgSeats(invitation.org_id);

  return { data: member as OrganizationMember, error: null };
}

// ── 4. Remove Member ──────────────────────────────────────────────────────

export async function removeMember(
  orgId: string,
  targetUserId: string,
): Promise<ActionResult<{ success: true }>> {
  const userId = await getAuthUserId();
  if (!userId) return { data: null, error: "Not authenticated" };

  if (await isUserInSandboxMode(userId)) {
    return { data: null, error: "Blocked in Sandbox Mode" };
  }

  const { isAdmin } = await verifyAdminRole(orgId, userId);
  if (!isAdmin) return { data: null, error: "Only admins can remove members" };

  // Cannot remove the owner
  const supabase = await createClient();
  const { data: targetMember } = await supabase
    .from("organization_members")
    .select("role")
    .eq("org_id", orgId)
    .eq("user_id", targetUserId)
    .single();

  if (targetMember?.role === "owner") {
    return { data: null, error: "Cannot remove the organization owner" };
  }

  // Set status to departed (soft delete — keeps audit trail)
  const { error } = await supabase
    .from("organization_members")
    .update({ status: "departed" as const })
    .eq("org_id", orgId)
    .eq("user_id", targetUserId);

  if (error) return { data: null, error: error.message };

  await logAudit(orgId, userId, "member_removed", targetUserId);

  // Sync Stripe seat count (fire-and-forget, non-fatal)
  void syncOrgSeats(orgId);

  return { data: { success: true }, error: null };
}

// ── 5. Update Member Role ─────────────────────────────────────────────────

export async function updateMemberRole(
  orgId: string,
  targetUserId: string,
  newRole: OrgMemberRole,
): Promise<ActionResult<OrganizationMember>> {
  const userId = await getAuthUserId();
  if (!userId) return { data: null, error: "Not authenticated" };

  if (await isUserInSandboxMode(userId)) {
    return { data: null, error: "Blocked in Sandbox Mode" };
  }

  if (newRole === "owner") {
    return { data: null, error: "Cannot assign owner role. Use transfer ownership instead." };
  }

  const { isAdmin, membership } = await verifyAdminRole(orgId, userId);
  if (!isAdmin) return { data: null, error: "Only admins can change roles" };

  // Only owners can promote to admin
  if (newRole === "admin" && membership?.role !== "owner") {
    return { data: null, error: "Only the owner can promote members to admin" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organization_members")
    .update({ role: newRole })
    .eq("org_id", orgId)
    .eq("user_id", targetUserId)
    .neq("role", "owner") // never change owner via this action
    .select()
    .single();

  if (error || !data) {
    return { data: null, error: error?.message ?? "Failed to update role" };
  }

  await logAudit(orgId, userId, "member_role_changed", targetUserId, {
    new_role: newRole,
  });

  return { data: data as OrganizationMember, error: null };
}

// ── 6. Update Consent (Agent Self-Service) ────────────────────────────────

export async function updateConsent(
  orgId: string,
  tier: DataSharingTier,
): Promise<ActionResult<OrganizationMember>> {
  const userId = await getAuthUserId();
  if (!userId) return { data: null, error: "Not authenticated" };

  if (await isUserInSandboxMode(userId)) {
    return { data: null, error: "Blocked in Sandbox Mode" };
  }

  const supabase = await createClient();

  const updates: Record<string, unknown> = {
    data_sharing_tier: tier,
    consent_granted_at: new Date().toISOString(),
    consent_version: CURRENT_CONSENT_VERSION,
  };

  // If upgrading from pending to active (first consent), set joined_at + status
  const { data: current } = await supabase
    .from("organization_members")
    .select("status, joined_at")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .single();

  if (current?.status === "pending") {
    updates.status = "active";
    updates.joined_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from("organization_members")
    .update(updates)
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .select()
    .single();

  if (error || !data) {
    return { data: null, error: error?.message ?? "Failed to update consent" };
  }

  await logAudit(orgId, userId, "consent_granted", userId, {
    tier,
    version: CURRENT_CONSENT_VERSION,
  });

  return { data: data as OrganizationMember, error: null };
}

// ── 7. Update Org Settings ────────────────────────────────────────────────

export async function updateOrgSettings(
  orgId: string,
  settings: {
    name?: string;
    anonymize_agents?: boolean;
    org_goal_gci?: number | null;
  },
): Promise<ActionResult<Organization>> {
  const userId = await getAuthUserId();
  if (!userId) return { data: null, error: "Not authenticated" };

  if (await isUserInSandboxMode(userId)) {
    return { data: null, error: "Blocked in Sandbox Mode" };
  }

  const { isAdmin } = await verifyAdminRole(orgId, userId);
  if (!isAdmin) return { data: null, error: "Only admins can update settings" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organizations")
    .update(settings)
    .eq("id", orgId)
    .select()
    .single();

  if (error || !data) {
    return { data: null, error: error?.message ?? "Failed to update settings" };
  }

  await logAudit(orgId, userId, "settings_changed", null, {
    changes: Object.keys(settings),
  });

  return { data: data as Organization, error: null };
}

// ── 8. Get Org Performance ────────────────────────────────────────────────

export async function getOrgPerformance(
  orgId: string,
): Promise<ActionResult<OrgAgentPerformance[]>> {
  const userId = await getAuthUserId();
  if (!userId) return { data: null, error: "Not authenticated" };

  const supabase = await createClient();

  // Verify membership (any active member can view)
  const { data: membership } = await supabase
    .from("organization_members")
    .select("role")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .eq("status", "active")
    .single();

  if (!membership) {
    return { data: null, error: "Not a member of this organization" };
  }

  // Fetch from the VIEW
  const { data: performance, error } = await supabase
    .from("org_agent_performance")
    .select("*")
    .eq("org_id", orgId);

  if (error) return { data: null, error: error.message };

  // Check if anonymization is enabled
  const { data: org } = await supabase
    .from("organizations")
    .select("anonymize_agents")
    .eq("id", orgId)
    .single();

  let agents = (performance ?? []) as OrgAgentPerformance[];

  // Apply anonymization if enabled (admin/owner only see anonymized names)
  if (org?.anonymize_agents && membership.role !== "owner") {
    agents = agents.map((agent, i) => ({
      ...agent,
      agent_name: `Agent ${String.fromCharCode(65 + (i % 26))}`,
      avatar_url: "",
    }));
  }

  // Log performance view for audit trail
  await logAudit(orgId, userId, "performance_viewed", null, {
    agent_count: agents.length,
  });

  return { data: agents, error: null };
}

// ── 9. Leave Organization (Agent Self-Service) ───────────────────────────

export async function leaveOrganization(
  orgId: string,
): Promise<ActionResult<{ success: true }>> {
  const userId = await getAuthUserId();
  if (!userId) return { data: null, error: "Not authenticated" };

  if (await isUserInSandboxMode(userId)) {
    return { data: null, error: "Blocked in Sandbox Mode" };
  }

  const supabase = await createClient();

  // Check role — owners cannot leave (must transfer first)
  const { data: membership } = await supabase
    .from("organization_members")
    .select("role")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .single();

  if (!membership) return { data: null, error: "Not a member of this organization" };
  if (membership.role === "owner") {
    return { data: null, error: "Owners cannot leave. Transfer ownership first." };
  }

  // Set status to departed
  const { error } = await supabase
    .from("organization_members")
    .update({ status: "departed" as const })
    .eq("org_id", orgId)
    .eq("user_id", userId);

  if (error) return { data: null, error: error.message };

  await logAudit(orgId, userId, "member_departed", userId);

  // Sync Stripe seat count (fire-and-forget, non-fatal)
  void syncOrgSeats(orgId);

  return { data: { success: true }, error: null };
}

// ── 10. Get Audit Log ────────────────────────────────────────────────────

export async function getAuditLog(
  orgId: string,
  page = 0,
  pageSize = 50,
): Promise<ActionResult<{ entries: SecurityAuditEntry[]; total: number }>> {
  const userId = await getAuthUserId();
  if (!userId) return { data: null, error: "Not authenticated" };

  const { isAdmin } = await verifyAdminRole(orgId, userId);
  if (!isAdmin) return { data: null, error: "Only admins can view the audit log" };

  const supabase = await createClient();
  const from = page * pageSize;
  const to = from + pageSize - 1;

  const { data, error, count } = await supabase
    .from("security_audit_log")
    .select("*", { count: "exact" })
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) return { data: null, error: error.message };

  return {
    data: {
      entries: (data ?? []) as SecurityAuditEntry[],
      total: count ?? 0,
    },
    error: null,
  };
}

// ── 11. Revoke Invitation ────────────────────────────────────────────────

export async function revokeInvitation(
  orgId: string,
  invitationId: string,
): Promise<ActionResult<{ success: true }>> {
  const userId = await getAuthUserId();
  if (!userId) return { data: null, error: "Not authenticated" };

  if (await isUserInSandboxMode(userId)) {
    return { data: null, error: "Blocked in Sandbox Mode" };
  }

  const { isAdmin } = await verifyAdminRole(orgId, userId);
  if (!isAdmin) return { data: null, error: "Only admins can revoke invitations" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("organization_invitations")
    .delete()
    .eq("id", invitationId)
    .eq("org_id", orgId);

  if (error) return { data: null, error: error.message };

  return { data: { success: true }, error: null };
}

// ── 12. Get Invitation by Token (for public accept page) ────────────────

export async function getInvitationByToken(
  token: string,
): Promise<
  ActionResult<OrganizationInvitation & { org_name: string; org_type: string }>
> {
  // Use admin client since invitee may not have RLS access
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("organization_invitations")
    .select("*, organizations(name, type)")
    .eq("token", token)
    .is("accepted_at", null)
    .single();

  if (error || !data) {
    return { data: null, error: "Invitation not found or already accepted" };
  }

  if (new Date(data.expires_at) < new Date()) {
    return { data: null, error: "This invitation has expired" };
  }

  const org = data.organizations as Record<string, unknown>;

  return {
    data: {
      ...(data as unknown as OrganizationInvitation),
      org_name: (org?.name as string) ?? "Unknown",
      org_type: (org?.type as string) ?? "team",
    },
    error: null,
  };
}
