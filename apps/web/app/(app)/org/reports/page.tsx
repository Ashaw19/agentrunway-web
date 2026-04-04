import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/org-context";
import { ReportsContent } from "./reports-content";
import type { TeamReportAgent } from "@agent-runway/core/engines";

export default async function OrgReportsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const orgContext = await getOrgContext();
  if (!orgContext) redirect("/dashboard");

  // Only owners, admins, and team leaders can view reports
  if (!["owner", "admin", "team_leader"].includes(orgContext.membership.role)) {
    redirect("/org");
  }

  // Fetch all data in parallel
  const [perfRes, activityRes, pendingRes, expenseRes] = await Promise.all([
    supabase
      .from("org_agent_performance")
      .select("*")
      .eq("org_id", orgContext.org.id)
      .limit(10000),
    supabase.rpc("fn_org_crm_activity_summary", {
      p_org_id: orgContext.org.id,
    }),
    supabase.rpc("fn_org_pending_deals_summary", {
      p_org_id: orgContext.org.id,
    }),
    supabase.rpc("fn_org_expense_filing_status", {
      p_org_id: orgContext.org.id,
    }),
  ]);

  return (
    <ReportsContent
      orgId={orgContext.org.id}
      orgName={orgContext.org.name}
      performance={(perfRes.data ?? []) as TeamReportAgent[]}
      activitySummary={activityRes.data ?? []}
      pendingDeals={pendingRes.data ?? []}
      expenseStatus={expenseRes.data ?? []}
    />
  );
}
