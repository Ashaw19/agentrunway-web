import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/org-context";
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

  // Count active members for billing display
  const { count: activeMemberCount } = await supabase
    .from("organization_members")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgContext.org.id)
    .eq("status", "active");

  return (
    <OrgSettingsContent
      org={orgContext.org}
      isOwner={orgContext.isOwner}
      role={orgContext.membership.role}
      activeMemberCount={activeMemberCount ?? 0}
    />
  );
}
