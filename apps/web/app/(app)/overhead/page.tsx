import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { OverheadContent } from "./overhead-content";
import type { HistoryItem, Transaction, PipelineDeal, RecurringExpense, ListingAppointment } from "@/lib/types/database";
import { expenseTaxContext } from "@agent-runway/core/engines/expense-totals-engine";
import { ytdExpenseTotals } from "@agent-runway/core/engines/t2125-expenses-engine";
import { deductionTrackingFlags } from "@agent-runway/core/engines/tax-optimization-engine";
import { buildScenarioSeed } from "@/lib/scenario-seed";
import { computeIsPro } from "@/lib/compute-is-pro";
import { atlanticNoon } from "@agent-runway/core/lib/local-date";
import { loadVehicleLogbook, loadYearBusinessKm } from "@/lib/vehicle-logbook/load";
import { loadCapYearCarryOver } from "@/lib/cap-year-carry-over";
import { loadTaxYearCarryIn } from "@/lib/tax-year-carry-in";


export default async function OverheadPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // ── Fetch settings ──
  const { data: rawSettings } = await supabase
    .from("user_settings")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  // Atlantic calendar, not the server's UTC clock (local-date.ts).
  const today = atlanticNoon();
  const currentYear = today.getFullYear();
  // The vehicle business-use share comes from the logbook when it covers the
  // year (expenseTaxContext → vehicle-logbook-engine), the setting otherwise.
  const logbookPromise = loadVehicleLogbook(supabase, user.id, currentYear);

  // A REAL agent's closed deals before January 1 in the anniversary year that
  // contains it: the plan waterfall's cap carries across January 1 (the
  // dashboard's carry-over, cap-year-carry-over.ts). Never rejects.
  const carryOverPromise = loadCapYearCarryOver(supabase, user.id, rawSettings, currentYear);
  // A cash-method agent's earlier closings paid this year: the tax figures'
  // carry-in (tax-year-carry-in.ts). Empty for accrual.
  const taxYearCarryInPromise = loadTaxYearCarryIn(supabase, user.id, rawSettings, currentYear);

  // ── Live Supabase queries ──
  const [
    txResult,
    expCatResult,
    expItemResult,
    receiptTotalsResult,
    mileageResult,
    ccaResult,
    historyResult,
    pipelineResult,
    recurringExpResult,
    listingResult,
  ] = await Promise.all([
    supabase
      .from("transactions")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "closed")
      .gte("date", `${currentYear}-01-01`)
      .order("date", { ascending: false })
      .limit(10000),
    supabase
      .from("expense_categories")
      .select("*")
      .eq("user_id", user.id)
      .order("sort_order")
      .limit(10000),
    supabase
      .from("expense_items")
      .select("*")
      .eq("user_id", user.id)
      .limit(10000),
    supabase
      .from("receipt_expenses")
      .select("category_key, total_amount, tax_amount")
      .eq("user_id", user.id)
      .gte("expense_date", `${currentYear}-01-01`)
      .limit(10000),
    // This year's business km, for the tax cards: every trip in the year,
    // read in pages. Until 2026-10-18 this summed every trip ever logged.
    loadYearBusinessKm(supabase, user.id, currentYear).then((km) => ({ data: km })),
    supabase
      .from("t2125_cca_assets")
      .select("id")
      .eq("user_id", user.id)
      .limit(10000),
    supabase
      .from("history_items")
      .select("*")
      .eq("user_id", user.id)
      .order("year", { ascending: false })
      .limit(10000),
    supabase
      .from("pipeline_deals")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(10000),
    supabase
      .from("recurring_expenses")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .limit(10000),
    // The dashboard's listing query: its projected GCI, and so its tax
    // estimate, counts scheduled and active listing appointments.
    supabase
      .from("listing_appointments")
      .select("*")
      .eq("user_id", user.id)
      .in("status", ["scheduled", "active"])
      .limit(10000),
  ]);

  const transactions = (txResult.data ?? []) as Transaction[];
  const carryOverTx = await carryOverPromise;
  const taxYearCarryIn = await taxYearCarryInPromise;
  const expenseItems = expItemResult.data ?? [];
  const pipelineDeals = (pipelineResult.data ?? []) as PipelineDeal[];

  const expenseCategories = (expCatResult.data ?? []).map((cat) => ({
    ...cat,
    items: expenseItems.filter((i) => i.category_id === cat.id),
  }));

  // Year-to-date expenses and the monthly figure: the dashboard's one engine
  // call (t2125-expenses-engine). Receipts, the per-item monthly figures and
  // the Recurring Expenses list, net of the ITCs a registrant claims.
  const expenseCtx = expenseTaxContext(rawSettings, await logbookPromise);
  const expenseTotals = ytdExpenseTotals({
    receipts: receiptTotalsResult.data,
    recurring: (recurringExpResult.data ?? []) as RecurringExpense[],
    expenseItems,
    ctx: expenseCtx,
    now: today,
  });
  const { expensesYTD, expensesRemaining } = expenseTotals;

  // Which expense categories the agent tracks, for the tax cards: the lines
  // the two totals above are the sums of.
  const deductionTracking = deductionTrackingFlags(expenseTotals.tracked.lines, expenseCategories);

  const mileageKmTotal = Number(mileageResult.data ?? 0);

  const ccaAssetCount = (ccaResult.data ?? []).length;

  // ── Scenario Engine seed: the dashboard's projection, seasonal weights,
  // deal count, cash and benchmark (lib/scenario-seed.ts) ──
  const scenarioSeed = buildScenarioSeed({
    settings: rawSettings ?? null,
    transactions,
    carryOverTx,
    taxYearCarryIn,
    pipelineDeals,
    listings: (listingResult.data ?? []) as ListingAppointment[],
    historyItems: (historyResult.data ?? []) as HistoryItem[],
    expenses: expenseTotals,
  });

  return (
    <OverheadContent
      transactions={transactions}
      carryOverTx={carryOverTx}
      taxYearCarryIn={taxYearCarryIn}
      settings={rawSettings}
      expensesYTD={expensesYTD}
      deductionTracking={deductionTracking}
      mileageKmTotal={mileageKmTotal}
      vehicleBusinessUsePct={expenseCtx.vehicleBusinessUsePct}
      ccaAssetCount={ccaAssetCount}
      historyItems={(historyResult.data ?? []) as HistoryItem[]}
      pipelineDeals={pipelineDeals}
      activeListings={(listingResult.data ?? []) as ListingAppointment[]}
      isPro={await computeIsPro(supabase, user.id, rawSettings)}
      scenarioSeed={scenarioSeed}
      expensesRemaining={expensesRemaining}
    />
  );
}
