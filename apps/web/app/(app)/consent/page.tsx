import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ConsentContent } from "./consent-content";
import type { OrganizationMember, Organization } from "@/lib/types/organizations";

export default async function ConsentPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Fetch all active/pending memberships with org details
  const { data: memberships } = await supabase
    .from("organization_members")
    .select("*, organizations(*)")
    .eq("user_id", user.id)
    .in("status", ["active", "pending"])
    .order("created_at", { ascending: true });

  if (!memberships || memberships.length === 0) {
    redirect("/dashboard");
  }

  const membershipData = memberships.map((m: Record<string, unknown>) => ({
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
    org: m.organizations as unknown as Organization,
  }));

  return <ConsentContent memberships={membershipData} />;
}
