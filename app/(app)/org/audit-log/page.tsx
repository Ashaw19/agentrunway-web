import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/org-context";
import { AuditContent } from "./audit-content";
import type { SecurityAuditEntry } from "@/lib/types/organizations";

export default async function AuditLogPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const orgContext = await getOrgContext();
  if (!orgContext || !orgContext.isAdmin) {
    redirect("/org");
  }

  // Fetch initial page of audit entries
  const { data: entries, count } = await supabase
    .from("security_audit_log")
    .select("*", { count: "exact" })
    .eq("org_id", orgContext.org.id)
    .order("created_at", { ascending: false })
    .range(0, 49);

  return (
    <AuditContent
      orgId={orgContext.org.id}
      initialEntries={(entries ?? []) as SecurityAuditEntry[]}
      totalCount={count ?? 0}
    />
  );
}
