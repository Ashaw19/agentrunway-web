import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  OrgContext,
  Organization,
  OrganizationMember,
} from "@/lib/types/organizations";

/**
 * Columns of `organizations` that plain members are allowed to read.
 *
 * Postgres revokes column-level SELECT on Stripe/billing columns from the
 * `authenticated` role (migration 00117), so ANY query that touches those
 * columns from a user-session client will fail. Read through this list
 * whenever you're on the user session, and fall back to `createAdminClient()`
 * (after an authz check) for billing reads.
 */
export const ORG_PUBLIC_COLUMNS =
  "id,name,slug,type,owner_id,logo_url,anonymize_agents,max_seats,subscription_status,is_beta,org_goal_gci,created_at,updated_at" as const;

/**
 * Fetch the billing-sensitive columns for an org via the admin client.
 * Callers MUST verify the caller is an admin/owner/team_leader before invoking.
 */
export async function getOrgBillingFields(orgId: string): Promise<{
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_price_id: string | null;
  billing_email: string | null;
} | null> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("organizations")
    .select("stripe_customer_id,stripe_subscription_id,stripe_price_id,billing_email")
    .eq("id", orgId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    stripe_customer_id: data.stripe_customer_id ?? null,
    stripe_subscription_id: data.stripe_subscription_id ?? null,
    stripe_price_id: data.stripe_price_id ?? null,
    billing_email: data.billing_email ?? null,
  };
}

/**
 * Fetch the current user's organization context (if any).
 * Called from app/(app)/layout.tsx to populate sidebar navigation.
 *
 * Returns null if the user is not a member of any organization.
 * If the user is in multiple orgs, returns the first active brokerage
 * (or the first active team if no brokerage).
 *
 * The returned `org` has all Stripe/billing fields set to null — those are
 * for the billing pages to fetch via `getOrgBillingFields` after an authz check.
 */
export async function getOrgContext(): Promise<OrgContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Fetch all active memberships with the safe org projection
  const { data: memberships } = await supabase
    .from("organization_members")
    .select(`*, organizations(${ORG_PUBLIC_COLUMNS})`)
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

  const orgRaw = activeMembership.organizations as Record<string, unknown>;
  // Stripe fields are intentionally null here — the Organization type allows
  // it, and the billing pages fetch the real values via getOrgBillingFields.
  const org = {
    ...orgRaw,
    stripe_customer_id: null,
    stripe_subscription_id: null,
    stripe_price_id: null,
    billing_email: null,
  } as unknown as Organization;
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
