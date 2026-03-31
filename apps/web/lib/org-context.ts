import { createClient } from "@/lib/supabase/server";
import type { OrgContext, Organization, OrganizationMember } from "@/lib/types/organizations";

/**
 * Fetch the current user's organization context (if any).
 * Called from app/(app)/layout.tsx to populate sidebar navigation.
 *
 * Returns null if the user is not a member of any organization.
 * If the user is in multiple orgs, returns the first active brokerage
 * (or the first active team if no brokerage).
 */
export async function getOrgContext(): Promise<OrgContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Fetch all active memberships with the org joined
  const { data: memberships } = await supabase
    .from("organization_members")
    .select("*, organizations(*)")
    .eq("user_id", user.id)
    .in("status", ["active", "pending"])
    .order("created_at", { ascending: true });

  if (!memberships || memberships.length === 0) return null;

  // Prefer brokerage over team if user has both
  const brokerageMembership = memberships.find(
    (m: Record<string, unknown>) =>
      (m.organizations as Record<string, unknown>)?.type === "brokerage" && m.status === "active",
  );

  const activeMembership = brokerageMembership ?? memberships.find(
    (m: Record<string, unknown>) => m.status === "active",
  );

  if (!activeMembership) return null;

  const org = activeMembership.organizations as unknown as Organization;
  const membership = {
    id: activeMembership.id,
    org_id: activeMembership.org_id,
    user_id: activeMembership.user_id,
    role: activeMembership.role,
    status: activeMembership.status,
    data_sharing_tier: activeMembership.data_sharing_tier,
    consent_granted_at: activeMembership.consent_granted_at,
    consent_version: activeMembership.consent_version,
    joined_at: activeMembership.joined_at,
    created_at: activeMembership.created_at,
    updated_at: activeMembership.updated_at,
  } as OrganizationMember;

  return {
    org,
    membership,
    isAdmin: ["owner", "admin", "team_leader"].includes(membership.role),
    isOwner: org.owner_id === user.id,
  };
}
