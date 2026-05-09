import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SredClient } from "./sred-client";
import type { CorpSredEntry, CorpSredAnnualSummary } from "@agent-runway/core/types/database";

export const dynamic = "force-dynamic";

const ALLOWED_EMAILS = new Set(["andrew@andrewdshaw.ca"]);

export default async function SredPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.email || !ALLOWED_EMAILS.has(user.email.toLowerCase())) {
    redirect("/dashboard");
  }

  const year = new Date().getFullYear();

  const [entriesResult, summaryResult] = await Promise.all([
    supabase
      .from("corp_sred_entries")
      .select("*")
      .gte("entry_date", `${year}-01-01`)
      .lte("entry_date", `${year}-12-31`)
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("v_corp_sred_annual_summary")
      .select("*")
      .eq("fiscal_year", year)
      .single(),
  ]);

  const entries = (entriesResult.data ?? []) as CorpSredEntry[];
  const summary = (summaryResult.data ?? null) as CorpSredAnnualSummary | null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-white">SR&amp;ED Work Log</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Daily sessions for FY{year} — T661 narrative material, eligible-hours quantum, refundable ITC estimate.
        </p>
      </div>
      <SredClient initialEntries={entries} initialSummary={summary} year={year} />
    </div>
  );
}
