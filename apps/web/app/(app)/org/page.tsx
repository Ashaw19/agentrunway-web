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

  // Apply server-side anonymization when enabled so real agent names are
  // never serialized into the RSC payload visible in browser devtools.
  // Owners always see real names; all other members see "Agent A/B/C…".
  let safePerformance = (performance ?? []) as OrgAgentPerformance[];
  if (orgContext.org.anonymize_agents && !orgContext.isOwner) {
    safePerformance = safePerformance.map((agent, i) => ({
      ...agent,
      agent_name: `Agent ${String.fromCharCode(65 + (i % 26))}`,
      avatar_url: "",
    }));
  }

  return (
    <OrgDashboardContent
      org={orgContext.org}
      membership={orgContext.membership}
      isAdmin={orgContext.isAdmin}
      performance={safePerformance}
      activeMemberCount={memberCount ?? 0}
    />
  );
}
