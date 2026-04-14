import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ORG_PUBLIC_COLUMNS } from "@/lib/org-context";
import { ConsentContent } from "./consent-content";
import type { OrganizationMember, Organization } from "@/lib/types/organizations";

export default async function ConsentPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Fetch all active/pending memberships with the safe org projection.
  // Stripe/billing columns are revoked from the `authenticated` role
  // (migration 00117) — consent UI never needs them anyway.
  const { data: memberships } = await supabase
    .from("organization_members")
    .select(`*, organizations(${ORG_PUBLIC_COLUMNS})`)
    .eq("user_id", user.id)
    .in("status", ["active", "pending"])
    .order("created_at", { ascending: true });

  if (!memberships || memberships.length === 0) {
    redirect("/dashboard");
  }

  const membershipData = memberships.map((m: Record<string, unknown>) => {
    const orgRaw = m.organizations as Record<string, unknown>;
    const org = {
      ...orgRaw,
      stripe_customer_id: null,
      stripe_subscription_id: null,
      stripe_price_id: null,
      billing_email: null,
    } as unknown as Organization;
    return {
      membership: {
        id: m.id,
        org_id: m.org_id,
        user_id: m.user_id,
        role: m.role,
        status: m.status,
        data_sharing_tier: m.data_sharing_tier,
        consent_granted_at: m.consent_granted_at,
        consent_version: m.consent_version,
        joined_at: m.joined_at,
        created_at: m.created_at,
        updated_at: m.updated_at,
      } as OrganizationMember,
      org,
    };
  });

  return <ConsentContent memberships={membershipData} />;
}
