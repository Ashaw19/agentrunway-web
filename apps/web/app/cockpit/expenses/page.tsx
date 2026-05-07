import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type {
  CorpTransaction,
  CorpChartOfAccount,
  CorpVendor,
  CorpAccountType,
} from "@agent-runway/core/types/database";
import { ExpensesActionsBar } from "./expenses-actions-bar";
import { ExpensesTable, type ExpenseRow } from "./expenses-table";
import { AllocationPanel } from "./allocation-panel";

// Force dynamic — this surface always reads the live Supabase ledger and is
// gated to a single user (Andrew) by the cockpit layout. No ISR / cache.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ExpensesPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Layout already redirects unauthenticated users; this is a defence-in-depth
  // guard in case the layout's redirect is bypassed by direct route hit.
  if (!user) redirect("/login?next=/cockpit/expenses");

  // Pull chart of accounts (shared, RLS allows any authenticated SELECT) and
  // user-scoped vendors in parallel.  Both are small lookup tables so we hand
  // them to the client component as full lists for join-by-id rendering and
  // (in the modal) the account dropdown.
  const [coaResult, vendorsResult] = await Promise.all([
    supabase
      .from("corp_chart_of_accounts")
      .select("account_code, name, type, notes, created_at")
      .order("account_code", { ascending: true }),
    supabase
      .from("corp_vendors")
      .select(
        "id, user_id, name, regex_pattern, default_account_code, sred_eligible, sred_category, corp_pct, notes, created_at, updated_at",
      )
      .eq("user_id", user.id)
      .order("name", { ascending: true }),
  ]);

  const coa = (coaResult.data ?? []) as CorpChartOfAccount[];
  const vendors = (vendorsResult.data ?? []) as CorpVendor[];

  // Account-code → name lookup for the table column.
  const accountByCode = new Map<string, { name: string; type: CorpAccountType }>(
    coa.map((a) => [a.account_code, { name: a.name, type: a.type }]),
  );

  // Vendor-id → display name lookup for the table column.  The seeded vendor
  // names already carry their canonical display label.
  const vendorById = new Map<string, string>(vendors.map((v) => [v.id, v.name]));

  // Pull the user's transactions, sorted by date DESC.  Joining via Supabase's
  // foreign-key embedding keeps it to a single round-trip; we still expose the
  // same columns the manual-entry path expects so the row shape matches.
  const txResult = await supabase
    .from("corp_transactions")
    .select(
      [
        "id",
        "user_id",
        "date",
        "amount_pretax",
        "gst_hst",
        "amount_total",
        "currency",
        "fx_rate",
        "vendor_id",
        "vendor_name_raw",
        "account_code",
        "account_type",
        "description",
        "source_channel",
        "source_ref",
        "receipt_storage_path",
        "corp_pct",
        "sred_eligible",
        "sred_category",
        "pre_incorp_flag",
        "incurred_date",
        "parent_transaction_id",
        "needs_review",
        "review_reason",
        "ingested_by_user_id",
        "ingested_at",
        "posted_at",
        "notes",
        "created_at",
        "updated_at",
      ].join(", "),
    )
    .eq("user_id", user.id)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });

  // Cast through unknown — the supabase-js generic doesn't statically narrow a
  // hand-written column list this wide.  Schema is verified against the
  // 00132_corp_director_cockpit.sql migration; if a column drifts it
  // surfaces at runtime, not in typecheck.
  const txns = ((txResult.data ?? []) as unknown) as CorpTransaction[];

  const rows: ExpenseRow[] = txns.map((t) => {
    const acct = t.account_code ? accountByCode.get(t.account_code) : undefined;
    const vendorDisplay =
      (t.vendor_id ? vendorById.get(t.vendor_id) : undefined) ??
      t.vendor_name_raw ??
      null;
    return {
      id: t.id,
      date: t.date,
      vendor_display: vendorDisplay,
      account_code: t.account_code,
      account_name: acct?.name ?? null,
      amount_pretax: Number(t.amount_pretax),
      gst_hst: Number(t.gst_hst),
      amount_total: Number(t.amount_total),
      currency: t.currency,
      needs_review: t.needs_review,
      review_reason: t.review_reason,
      source_channel: t.source_channel,
    };
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-foreground font-[var(--font-cockpit-display)] text-4xl font-normal leading-none tracking-tight">
            Expenses
          </h1>
          <p className="text-muted-foreground mt-1.5 max-w-2xl text-sm leading-relaxed">
            Every Agent Runway Inc. transaction. Vendor-matched and categorized
            on ingest. Items flagged for review are missing a vendor regex
            match.
          </p>
        </div>
        <ExpensesActionsBar coa={coa} vendors={vendors} />
      </header>

      <ExpensesTable rows={rows} />

      <AllocationPanel vendors={vendors} />
    </div>
  );
}
