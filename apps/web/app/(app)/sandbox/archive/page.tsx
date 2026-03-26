import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { SandboxDataset, Transaction, PipelineDeal, HistoryItem, ExpenseCategoryWithItems } from "@/lib/types/database";
import { SANDBOX_TIER_LABELS } from "@/lib/types/database";
import { computeGCI } from "@/lib/types/database";
import { fmtCurrency } from "@/lib/formatters";

// ============================================================================
// Sandbox Archive
// Read-only view of the fictional agent's completed dataset.
// Available after the 90-day interactive window expires.
// ============================================================================

export default async function SandboxArchivePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: settings } = await supabase
    .from("user_settings")
    .select("sandbox_data, sandbox_tier, sandbox_activated_at, sandbox_expires_at, display_name")
    .eq("user_id", user.id)
    .single();

  const sandboxData = settings?.sandbox_data as SandboxDataset | null;

  if (!sandboxData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <h1 className="text-xl font-semibold">No Sandbox Data</h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-md">
          You haven&apos;t activated a sandbox yet. Go to your dashboard to explore
          the platform with a fictional agent dataset.
        </p>
        <Link
          href="/dashboard"
          className="mt-4 text-sm font-medium text-primary underline underline-offset-2"
        >
          Go to Dashboard
        </Link>
      </div>
    );
  }

  const transactions = sandboxData.transactions as Transaction[];
  const pipelineDeals = sandboxData.pipelineDeals as PipelineDeal[];
  const expenseCategories = sandboxData.expenseCategories as ExpenseCategoryWithItems[];
  const historyItems = sandboxData.historyItems as HistoryItem[];
  const meta = sandboxData.meta;

  const ytdGCI = transactions.reduce((sum, tx) => sum + computeGCI(tx), 0);
  const totalExpensesMonthly = expenseCategories.reduce(
    (sum, cat) => sum + cat.items.reduce((s, item) => s + item.monthly_recurring, 0),
    0,
  );

  const tier = (settings?.sandbox_tier ?? meta.tier) as keyof typeof SANDBOX_TIER_LABELS;
  const activatedAt = settings?.sandbox_activated_at
    ? new Date(settings.sandbox_activated_at as string).toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric" })
    : "Unknown";

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="border-b pb-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
            Archived Sandbox
          </span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Sandbox Archive
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Read-only view of the fictional agent dataset generated on {activatedAt}.
          Use this as a benchmark for what a healthy{" "}
          <span className="font-medium">{SANDBOX_TIER_LABELS[tier]?.toLowerCase() ?? tier}</span>
          {" "}agent looks like in {meta.boardName}.
        </p>
      </div>

      {/* Generation metadata */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Board</p>
          <p className="text-sm font-semibold mt-0.5">{meta.boardName}</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Avg Board Price</p>
          <p className="text-sm font-semibold mt-0.5">{fmtCurrency(meta.avgBoardPrice)}</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Board Deals/Agent</p>
          <p className="text-sm font-semibold mt-0.5">{meta.dealsPerAgent}/yr</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Tier</p>
          <p className="text-sm font-semibold mt-0.5 capitalize">{tier.replace("_", " ")}</p>
        </div>
      </div>

      {/* YTD Summary */}
      <div className="rounded-lg border p-5">
        <h2 className="text-lg font-semibold">YTD Summary</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4">
          <div>
            <p className="text-xs text-muted-foreground">Closed Deals</p>
            <p className="text-xl font-bold">{transactions.length}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Gross Commission</p>
            <p className="text-xl font-bold">{fmtCurrency(ytdGCI)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Pipeline Deals</p>
            <p className="text-xl font-bold">{pipelineDeals.length}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Monthly Expenses</p>
            <p className="text-xl font-bold">{fmtCurrency(totalExpensesMonthly)}</p>
          </div>
        </div>
      </div>

      {/* Transactions */}
      <div className="rounded-lg border p-5">
        <h2 className="text-lg font-semibold">Closed Transactions</h2>
        <div className="mt-3 space-y-2">
          {transactions.map((tx) => (
            <div key={tx.id} className="flex items-center justify-between text-sm border-b border-border/40 pb-2">
              <div>
                <p className="font-medium">{tx.address}</p>
                <p className="text-xs text-muted-foreground">{tx.client_name} &middot; {tx.side} &middot; {tx.date}</p>
              </div>
              <p className="font-semibold shrink-0 ml-4">{fmtCurrency(computeGCI(tx))}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Pipeline */}
      <div className="rounded-lg border p-5">
        <h2 className="text-lg font-semibold">Pipeline</h2>
        <div className="mt-3 space-y-2">
          {pipelineDeals.map((deal) => (
            <div key={deal.id} className="flex items-center justify-between text-sm border-b border-border/40 pb-2">
              <div>
                <p className="font-medium">{deal.address}</p>
                <p className="text-xs text-muted-foreground">
                  {deal.client_name} &middot; {deal.side} &middot;{" "}
                  <span className="capitalize">{deal.stage}</span>
                  {deal.expected_close_date && ` &middot; Close: ${deal.expected_close_date}`}
                </p>
              </div>
              <p className="font-semibold shrink-0 ml-4">{fmtCurrency(deal.estimated_price)}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Historical Performance */}
      <div className="rounded-lg border p-5">
        <h2 className="text-lg font-semibold">Historical Performance</h2>
        <div className="mt-3 space-y-2">
          {historyItems.map((h) => (
            <div key={h.id} className="flex items-center justify-between text-sm border-b border-border/40 pb-2">
              <p className="font-medium">{h.year}</p>
              <div className="text-right">
                <p className="font-semibold">{fmtCurrency(h.annual_gci)} GCI</p>
                <p className="text-xs text-muted-foreground">{h.annual_tx} deals &middot; {fmtCurrency(h.annual_expenses)} expenses</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Back link */}
      <div className="text-center pb-6">
        <Link
          href="/dashboard"
          className="text-sm font-medium text-primary underline underline-offset-2"
        >
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
