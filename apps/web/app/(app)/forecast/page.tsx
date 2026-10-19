import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ForecastContent } from "./forecast-content";

import { expenseTaxContext } from "@agent-runway/core/engines/expense-totals-engine";
import { ytdExpenseTotals } from "@agent-runway/core/engines/t2125-expenses-engine";
import { deductionTrackingFlags } from "@agent-runway/core/engines/tax-optimization-engine";
import type { RecurringExpense } from "@/lib/types/database";
import { computeIsPro } from "@/lib/compute-is-pro";
import { atlanticNoon } from "@agent-runway/core/lib/local-date";
import { loadVehicleLogbook, loadYearBusinessKm } from "@/lib/vehicle-logbook/load";

export default async function ForecastPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Fetch settings
  const settingsResult = await supabase
    .from("user_settings")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  const rawSettings = settingsResult.data;

  // ── Live Supabase queries ───────────────────────────────────────
  // Atlantic calendar, not the server's UTC clock (local-date.ts).
  const today = atlanticNoon();
  const year = today.getFullYear();
  // The vehicle business-use share comes from the logbook when it covers the
  // year (expenseTaxContext → vehicle-logbook-engine), the setting otherwise.
  const logbookPromise = loadVehicleLogbook(supabase, user.id, year);
  const [txResult, pipelineResult, expCatResult, expItemResult, historyResult, mileageResult, ccaResult, receiptTotalsResult, listingApptResult, recurringExpResult] =
    await Promise.all([
      supabase
        .from("transactions")
        .select("*")
        .eq("user_id", user.id)
        .eq("status", "closed")
        .order("date", { ascending: false })
        .limit(10000),
      supabase
        .from("pipeline_deals")
        .select("*")
        .eq("user_id", user.id)
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
        .from("history_items")
        .select("*")
        .eq("user_id", user.id)
        .order("year", { ascending: false })
        .limit(10000),
      // This year's business km, for the tax cards: every trip in the year,
      // read in pages. Until 2026-10-18 this summed every trip ever logged.
      loadYearBusinessKm(supabase, user.id, year).then((km) => ({ data: km })),
      // CCA assets count for tax optimization engine
      supabase
        .from("t2125_cca_assets")
        .select("id")
        .eq("user_id", user.id)
        .limit(10000),
      // Current-year receipt totals for accurate YTD expense calculation
      supabase
        .from("receipt_expenses")
        .select("category_key, total_amount, tax_amount")
        .eq("user_id", user.id)
        .gte("expense_date", `${year}-01-01`)
        .limit(10000),
      // Listing appointments for forecast weighted GCI
      supabase
        .from("listing_appointments")
        .select("*")
        .eq("user_id", user.id)
        .not("status", "in", "(sold,expired,withdrawn,lost)")
        .limit(10000),
      supabase
        .from("recurring_expenses")
        .select("*")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .limit(10000),
    ]);

  const expenseCategories = (expCatResult.data ?? []).map((cat) => ({
    ...cat,
    items: (expItemResult.data ?? []).filter((i) => i.category_id === cat.id),
  }));

  // Year-to-date expenses and the monthly figure: the dashboard's one engine
  // call (t2125-expenses-engine). Receipts, the per-item monthly figures and
  // the Recurring Expenses list, net of the ITCs a registrant claims.
  const expenseCtx = expenseTaxContext(rawSettings, await logbookPromise);
  const expenseTotals = ytdExpenseTotals({
    receipts: receiptTotalsResult.data,
    recurring: (recurringExpResult.data ?? []) as RecurringExpense[],
    expenseItems: expItemResult.data,
    ctx: expenseCtx,
    now: today,
  });

  // Which expense categories the agent tracks, for the tax cards: the lines
  // the two totals above are the sums of.
  const deductionTracking = deductionTrackingFlags(expenseTotals.tracked.lines, expenseCategories);

  // Sum mileage logs for tax optimization
  const mileageKmTotal = Number(mileageResult.data ?? 0);
  const ccaAssetCount = (ccaResult.data ?? []).length;

  return (
    <ForecastContent
      settings={rawSettings}
      transactions={txResult.data ?? []}
      pipelineDeals={pipelineResult.data ?? []}
      listingAppointments={listingApptResult.data ?? []}
      historyItems={historyResult.data ?? []}
      isPro={await computeIsPro(supabase, user.id, rawSettings)}
      expensesYTD={expenseTotals.expensesYTD}
      monthlyRecurring={expenseTotals.monthlyRecurring}
      deductionTracking={deductionTracking}
      mileageKmTotal={mileageKmTotal}
      vehicleBusinessUsePct={expenseCtx.vehicleBusinessUsePct}
      ccaAssetCount={ccaAssetCount}
      expensesRemaining={expenseTotals.expensesRemaining}
    />
  );
}
