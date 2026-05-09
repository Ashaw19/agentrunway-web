import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { CorpUpcomingComplianceRow } from "@agent-runway/core/types/database";
import { ComplianceClient } from "./compliance-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ALLOWED_EMAILS = new Set(["andrew@andrewdshaw.ca"]);

export default async function CompliancePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.email || !ALLOWED_EMAILS.has(user.email.toLowerCase())) {
    redirect("/dashboard");
  }

  const { data: rows } = await supabase
    .from("v_corp_upcoming_compliance")
    .select(
      "id, title, kind, due_date, severity, recurring_pattern, notes, completed_at, created_at, days_until_due, urgency",
    )
    .eq("user_id", user.id)
    .order("due_date", { ascending: true });

  const events = (rows ?? []) as CorpUpcomingComplianceRow[];

  return <ComplianceClient initialEvents={events} />;
}
