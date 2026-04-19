import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { OverheadContent } from "./overhead-content";
import type { HistoryItem, Transaction, PipelineDeal, SplitPreset, RecurringExpense } from "@/lib/types/database";
import { totalRecurringMonthly, totalRecurringYTD } from "@agent-runway/core/engines/recurring-expense-engine";
import { computeGCI, computeWeightedGCI } from "@/lib/types/database";
import { projectedYearEndGCI, projectedYearEndTransactions, seasonalFractionElapsed } from "@/lib/engines/projection-engine";
import { computeEffectiveCashForSurvival } from "@/lib/engines/effective-cash";
import type { ScenarioSeedData } from "@/app/(app)/scenarios/page";
import { computeIsPro } from "@/lib/compute-is-pro";


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

  const currentYear = new Date().getFullYear();

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
      .select("total_amount")
      .eq("user_id", user.id)
      .gte("expense_date", `${currentYear}-01-01`)
      .limit(10000),
    supabase
      .from("mileage_logs")
      .select("km")
      .eq("user_id", user.id)
      .limit(10000),
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
  ]);

  const recurringExpenses = (recurringExpResult.data ?? []) as RecurringExpense[];
  const recurringExpMonthly = totalRecurringMonthly(recurringExpenses);
  const recurringExpYTD = totalRecurringYTD(recurringExpenses);

  const transactions = (txResult.data ?? []) as Transaction[];
  const expenseItems = expItemResult.data ?? [];
  const pipelineDeals = (pipelineResult.data ?? []) as PipelineDeal[];

  const expenseCategories = (expCatResult.data ?? []).map((cat) => ({
    ...cat,
    items: expenseItems.filter((i) => i.category_id === cat.id),
  }));

  const receiptYTD = (receiptTotalsResult.data ?? []).reduce(
    (sum, r) => sum + Number(r.total_amount ?? 0),
    0,
  );

  const mileageKmTotal = (mileageResult.data ?? []).reduce(
    (sum, r) => sum + Number(r.km ?? 0),
    0,
  );

  const ccaAssetCount = (ccaResult.data ?? []).length;

  // ── Build scenario seed from the same data ──
  const ytdGCI = transactions.reduce((sum, tx) => sum + computeGCI(tx), 0);
  const pipelineWeightedGCI = pipelineDeals.reduce((sum, d) => sum + computeWeightedGCI(d), 0);
  const legacyMonthlyRecurring = expenseItems.reduce((sum, i) => sum + Number(i.monthly_recurring ?? 0), 0);
  const monthlyRecurring = legacyMonthlyRecurring + recurringExpMonthly;
  const now = new Date();
  const expMonthsElapsed = now.getMonth() + (now.getDate() / 30);
  const expensesYTD = Math.max(receiptYTD, legacyMonthlyRecurring * expMonthsElapsed) + recurringExpYTD;
  const qPcts = rawSettings?.national_quarter_pcts ?? [0.25, 0.25, 0.25, 0.25];
  const fraction = seasonalFractionElapsed(qPcts);
  const projectedGCI = projectedYearEndGCI(ytdGCI, pipelineWeightedGCI, fraction, rawSettings?.goal_gci ?? 0);

  // Baseline cash for Survival MUST be cashPosition.effectiveCash (not raw
  // cash_reserve) so the "current" scenario matches dashboard + chat. See
  // memory/feedback_data_consistency_protocol.md.
  const overheadProjectedDealCount = projectedYearEndTransactions(
    transactions.length, pipelineDeals.length, fraction,
  );
  const overheadBaselineCash = rawSettings
    ? computeEffectiveCashForSurvival({
        settings: rawSettings,
        ytdGCI,
        expensesYTD,
        monthlyRecurring,
        projectedGCI,
        projectedDealCount: overheadProjectedDealCount,
        fraction,
      }).cashPosition.effectiveCash
    : 0;

  const scenarioSeed: ScenarioSeedData = {
    province: rawSettings?.province ?? "ontario",
    goalGCI: rawSettings?.goal_gci ?? 0,
    ytdGCI,
    projectedAnnualGCI: projectedGCI,
    dealCount: transactions.length,
    pipelineWeightedGCI,
    monthlyRecurring,
    expensesYTD,
    monthlyBrokerageFee: rawSettings?.monthly_brokerage_fee ?? 0,
    cashReserve: overheadBaselineCash,
    isIncorporated: rawSettings?.is_incorporated ?? false,
    compensationMethod: rawSettings?.compensation_method ?? "salary",
    quarterPcts: qPcts,
    splitPreset: (rawSettings?.split_preset ?? "p80_20") as SplitPreset,
    postCapThreshold: rawSettings?.post_cap_threshold_gci ?? 0,
    postCapAgentPct: rawSettings?.post_cap_agent_pct ?? 1,
    postCapBrokeragePct: rawSettings?.post_cap_brokerage_pct ?? 0,
    txFeeRate: rawSettings?.tx_fee_rate_pct ?? 0,
    txFeeCap: rawSettings?.tx_fee_annual_cap ?? 0,
    estimatedWeeklyHours: rawSettings?.estimated_weekly_hours ?? null,
    vacationWeeks: rawSettings?.vacation_weeks_per_year ?? null,
  };

  return (
    <OverheadContent
      transactions={transactions}
      settings={rawSettings}
      expenseCategories={expenseCategories}
      receiptYTD={receiptYTD}
      mileageKmTotal={mileageKmTotal}
      ccaAssetCount={ccaAssetCount}
      historyItems={(historyResult.data ?? []) as HistoryItem[]}
      pipelineDeals={pipelineDeals}
      isPro={await computeIsPro(supabase, user.id, rawSettings)}
      scenarioSeed={scenarioSeed}
      recurringExpMonthly={recurringExpMonthly}
      recurringExpYTD={recurringExpYTD}
    />
  );
}
