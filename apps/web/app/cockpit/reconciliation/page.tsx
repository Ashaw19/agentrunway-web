import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ReconciliationClient } from "./reconciliation-client";
import type { CorpBankReconciliationSummaryRow } from "@agent-runway/core/types/database";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ReconciliationPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const ALLOWED = new Set(["andrew@andrewdshaw.ca"]);
  if (!user.email || !ALLOWED.has(user.email.toLowerCase())) redirect("/cockpit");

  const { data: statements } = await supabase
    .from("v_corp_bank_reconciliation_summary")
    .select("*")
    .eq("user_id", user.id)
    .order("period_end", { ascending: false })
    .limit(20);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-white">Bank Reconciliation</h1>
        <p className="text-sm text-zinc-400 mt-1">
          Upload a bank CSV to match statement lines against cockpit ledger entries.
        </p>
      </div>
      <ReconciliationClient
        initialStatements={(statements ?? []) as CorpBankReconciliationSummaryRow[]}
      />
    </div>
  );
}
