import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOrgContext, getOrgBillingFields } from "@/lib/org-context";
import { OrgSettingsContent } from "./org-settings-content";

export default async function OrgSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const orgContext = await getOrgContext();
  if (!orgContext || !orgContext.isAdmin) {
    redirect("/org");
  }

  // Admin-gated billing field read (org context omits Stripe fields).
  const billingFields = await getOrgBillingFields(orgContext.org.id);
  const org = {
    ...orgContext.org,
    stripe_customer_id: billingFields?.stripe_customer_id ?? null,
    stripe_subscription_id: billingFields?.stripe_subscription_id ?? null,
    stripe_price_id: billingFields?.stripe_price_id ?? null,
    billing_email: billingFields?.billing_email ?? null,
  };

  // Count active members for billing display
  const { count: activeMemberCount } = await supabase
    .from("organization_members")
    .select("id", { count: "exact", head: true })
    .eq("org_id", org.id)
    .eq("status", "active");

  return (
    <OrgSettingsContent
      org={org}
      isOwner={orgContext.isOwner}
      role={orgContext.membership.role}
      activeMemberCount={activeMemberCount ?? 0}
    />
  );
}
