import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/org-context";
import { OrgDashboardContent } from "./org-dashboard-content";
import type { OrgAgentPerformance } from "@/lib/types/organizations";

export default async function OrgPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const orgContext = await getOrgContext();
  if (!orgContext) {
    redirect("/dashboard");
  }

  // Fetch performance data from the VIEW
  const { data: performance } = await supabase
    .from("org_agent_performance")
    .select("*")
    .eq("org_id", orgContext.org.id)
    .limit(10000);

  // Fetch member count
  const { count: memberCount } = await supabase
    .from("organization_members")
    .select("*", { count: "exact", head: true })
    .eq("org_id", orgContext.org.id)
    .eq("status", "active");

  return (
    <OrgDashboardContent
      org={orgContext.org}
      membership={orgContext.membership}
      isAdmin={orgContext.isAdmin}
      performance={(performance ?? []) as OrgAgentPerformance[]}
      activeMemberCount={memberCount ?? 0}
    />
  );
}
