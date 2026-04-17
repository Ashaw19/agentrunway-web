"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resend, FROM_ADDRESS } from "@/lib/resend";
import { log } from "@/lib/logger";

/** Escape user-supplied strings before interpolating into HTML email templates */
function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
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
    const { cookies } = await import("next/headers");
    const cookieStore = await cookies();
    const cookieHeader = cookieStore.getAll().map((c) => `${c.name}=${c.value}`).join("; ");
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://agentrunway.ca";
    await fetch(`${appUrl}/api/team-billing/update-seats`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookieHeader,
      },
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
    .maybeSingle();

  if (!data) return { isAdmin: false, membership: null };
  return {
    isAdmin: ["owner", "admin", "team_leader"].includes(data.role),
    membership: data as OrganizationMember,
  };
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

  const { isAdmin } = await verifyAdminRole(orgId, userId);
  if (!isAdmin) return { data: null, error: "Only admins can invite members" };

  // Prevent inviting as owner
  if (role === "owner") {
    return { data: null, error: "Cannot invite someone as owner" };
  }

  const supabase = await createClient();

  // Check seat limit (count both active members AND outstanding invitations)
  const [{ count: memberCount }, { count: pendingInviteCount }] = await Promise.all([
    supabase
      .from("organization_members")
      .select("*", { count: "exact", head: true })
      .eq("org_id", orgId)
      .in("status", ["active", "pending"]),
    supabase
      .from("organization_invitations")
      .select("*", { count: "exact", head: true })
      .eq("org_id", orgId)
      .is("accepted_at", null)
      .gt("expires_at", new Date().toISOString()),
  ]);

  const { data: org } = await supabase
    .from("organizations")
    .select("max_seats")
    .eq("id", orgId)
    .single();

  const totalUsed = (memberCount ?? 0) + (pendingInviteCount ?? 0);
  if (org && totalUsed + emails.length > org.max_seats) {
    return {
      data: null,
      error: `This would exceed the ${org.max_seats} seat limit. ${totalUsed} seats currently used (including pending invitations).`,
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

  // Send invitation emails (fire-and-forget, non-fatal)
  if (resend && created) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://agentrunway.ca";
    const { data: orgData } = await supabase
      .from("organizations")
      .select("name")
      .eq("id", orgId)
      .single();
    const orgName = orgData?.name ?? "your organization";

    for (const inv of created as OrganizationInvitation[]) {
      // Email delivery is non-fatal (admin can share the invite link manually)
      // but we MUST log failures — silent swallow left beta admins debugging
      // "my teammate never got the email" with no signal on our end.
      void resend.emails.send({
        from: FROM_ADDRESS,
        to: inv.email,
        subject: `You're invited to join ${escHtml(orgName)} on Agent Runway`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 0;">
            <h2 style="color: #1a1a1a; margin-bottom: 8px;">You've been invited!</h2>
            <p style="color: #555; line-height: 1.6; margin-bottom: 24px;">
              <strong>${escHtml(orgName)}</strong> has invited you to join their team on Agent Runway as a <strong>${inv.role.replace("_", " ")}</strong>.
            </p>
            <a href="${appUrl}/invite/${inv.token}" style="display: inline-block; background: #f97316; color: #fff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 15px;">
              Accept Invitation
            </a>
            <p style="color: #888; font-size: 13px; margin-top: 28px; line-height: 1.5;">
              This invitation expires on ${new Date(inv.expires_at).toLocaleDateString("en-CA", { month: "long", day: "numeric", year: "numeric" })}. If you didn't expect this, you can safely ignore this email.
            </p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
            <p style="color: #aaa; font-size: 12px;">Agent Runway — Real estate business analytics</p>
          </div>
        `,
      })
        .then((result) => {
          if (result?.error) {
            log.error(
              { err: result.error, email: inv.email, orgId, invitationId: inv.id },
              "[org-actions] Resend returned error sending invitation email",
            );
          }
        })
        .catch((err) => {
          log.error(
            { err, email: inv.email, orgId, invitationId: inv.id },
            "[org-actions] Failed to send invitation email",
          );
        });
    }
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

  // Verify the accepting user's email matches the invitation
  const { data: { user: authUser } } = await admin.auth.admin.getUserById(userId);
  if (!authUser || authUser.email?.toLowerCase() !== invitation.email?.toLowerCase()) {
    return { data: null, error: "This invitation was sent to a different email address" };
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

  // Send welcome email to the new member (fire-and-forget, non-fatal)
  if (resend) {
    const orgData = invitation.organizations as Record<string, unknown> | null;
    const orgName = (orgData?.name as string) ?? "your team";
    // Fetch leader name for personalization
    const { data: leaderRow } = await admin
      .from("organization_members")
      .select("user_id")
      .eq("org_id", invitation.org_id)
      .in("role", ["owner", "team_leader"])
      .limit(1)
      .maybeSingle();
    let leaderName = "Your team leader";
    if (leaderRow?.user_id) {
      const { data: leaderSettings } = await admin
        .from("user_settings")
        .select("display_name")
        .eq("user_id", leaderRow.user_id)
        .maybeSingle();
      if (leaderSettings?.display_name) leaderName = leaderSettings.display_name;
    }
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://agentrunway.ca";

    void resend.emails.send({
      from: FROM_ADDRESS,
      to: invitation.email,
      subject: `Welcome to ${escHtml(orgName)} on Agent Runway`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 0;">
          <h2 style="color: #1a1a1a; margin-bottom: 8px;">Welcome to ${escHtml(orgName)}! 🎉</h2>
          <p style="color: #555; line-height: 1.6; margin-bottom: 16px;">
            You've officially joined <strong>${escHtml(orgName)}</strong> on Agent Runway. ${escHtml(leaderName)} and the rest of the team are glad to have you.
          </p>

          <div style="background: #f8f9fa; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
            <h3 style="color: #1a1a1a; font-size: 14px; margin: 0 0 12px 0;">Quick Start Checklist</h3>
            <table style="width: 100%; border-collapse: collapse;">
              <tr><td style="padding: 6px 0; color: #555; font-size: 13px;">✅ Complete your personal setup</td></tr>
              <tr><td style="padding: 6px 0; color: #555; font-size: 13px;">📊 Add your first transaction or pipeline deal</td></tr>
              <tr><td style="padding: 6px 0; color: #555; font-size: 13px;">🧾 Capture a receipt to start expense tracking</td></tr>
              <tr><td style="padding: 6px 0; color: #555; font-size: 13px;">💬 Ask your Flight Crew anything about your business</td></tr>
            </table>
          </div>

          <div style="background: #fffbeb; border-radius: 12px; padding: 16px; margin-bottom: 24px; border: 1px solid #fef3c7;">
            <h4 style="color: #92400e; font-size: 13px; margin: 0 0 8px 0;">🔒 Your privacy is protected</h4>
            <p style="color: #a16207; font-size: 12px; line-height: 1.5; margin: 0;">
              Your leader can see your GCI totals and pipeline summary. Your expenses, tax details, commission splits, cash reserves, and client information are <strong>never shared</strong>.
            </p>
          </div>

          <a href="${appUrl}/dashboard" style="display: inline-block; background: #f97316; color: #fff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 15px;">
            Go to Dashboard
          </a>

          <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
          <p style="color: #aaa; font-size: 12px;">Agent Runway — Real estate business analytics</p>
        </div>
      `,
    }).catch(() => {
      // Welcome email failure is non-fatal
    });

    // Notify the team leader that a new member joined
    if (leaderRow?.user_id) {
      const { data: leaderAuth } = await admin.auth.admin.getUserById(leaderRow.user_id);
      const leaderEmail = leaderAuth?.user?.email;
      if (leaderEmail) {
        void resend.emails.send({
          from: FROM_ADDRESS,
          to: leaderEmail,
          subject: `${escHtml(invitation.email)} joined ${escHtml(orgName)}`,
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 0;">
              <h2 style="color: #1a1a1a; margin-bottom: 8px;">New team member joined</h2>
              <p style="color: #555; line-height: 1.6; margin-bottom: 24px;">
                <strong>${escHtml(invitation.email)}</strong> has accepted your invitation and joined <strong>${escHtml(orgName)}</strong> as a <strong>${invitation.role.replace("_", " ")}</strong>.
              </p>
              <p style="color: #555; line-height: 1.6; margin-bottom: 24px;">
                Their data will appear on your team dashboard once they start entering transactions and pipeline deals.
              </p>
              <a href="${appUrl}/org/members" style="display: inline-block; background: #f97316; color: #fff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 15px;">
                View Team Members
              </a>
              <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
              <p style="color: #aaa; font-size: 12px;">Agent Runway — Real estate business analytics</p>
            </div>
          `,
        }).catch(() => {
          // Leader notification failure is non-fatal
        });
      }
    }
  }

  return { data: member as OrganizationMember, error: null };
}

// ── 4. Remove Member ──────────────────────────────────────────────────────

export async function removeMember(
  orgId: string,
  targetUserId: string,
): Promise<ActionResult<{ success: true }>> {
  const userId = await getAuthUserId();
  if (!userId) return { data: null, error: "Not authenticated" };

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

  if (newRole === "owner") {
    return { data: null, error: "Cannot assign owner role. Use transfer ownership instead." };
  }

  const { isAdmin, membership } = await verifyAdminRole(orgId, userId);
  if (!isAdmin) return { data: null, error: "Only admins can change roles" };

  // Only team_leaders/admins can promote to admin or team_leader
  if (["admin", "team_leader"].includes(newRole) && !["owner", "admin", "team_leader"].includes(membership?.role ?? "")) {
    return { data: null, error: "Only team leaders and admins can promote members" };
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
    .maybeSingle();

  const becomingActive = current?.status === "pending";
  if (becomingActive) {
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

  // When a pending member becomes active, sync Stripe seat count so
  // the org is billed for the new active seat.
  if (becomingActive) {
    void syncOrgSeats(orgId);
  }

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
