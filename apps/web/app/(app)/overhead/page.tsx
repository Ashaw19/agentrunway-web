import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { OverheadContent } from "./overhead-content";
import type { HistoryItem, Transaction, PipelineDeal, SplitPreset } from "@/lib/types/database";
import { computeGCI, computeWeightedGCI } from "@/lib/types/database";
import { projectedYearEndGCI, seasonalFractionElapsed } from "@/lib/engines/projection-engine";
import type { ScenarioSeedData } from "@/app/(app)/scenarios/page";
import {
  isSandboxActive,
  getSandboxData,
  mergeSandboxSettings,
  getSandboxReceiptYTD,
  getSandboxMileageTotal,
  getSandboxExpenseItems,
} from "@/lib/sandbox-resolver";

export default async function OverheadPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // ── Fetch settings first (needed to check sandbox mode) ──
  const { data: rawSettings } = await supabase
    .from("user_settings")
    .select("*")
    .eq("user_id", user.id)
    .single();

  const currentYear = new Date().getFullYear();

  // ── Sandbox path ──
  if (isSandboxActive(rawSettings)) {
    const sb = getSandboxData(rawSettings);
    const settings = mergeSandboxSettings(rawSettings);

    // Build scenario seed from sandbox data
    const sbClosedTx = sb.transactions.filter(
      (tx) => tx.status === "closed" && tx.date >= `${currentYear}-01-01`,
    );
    const sbYtdGCI = sbClosedTx.reduce((sum, tx) => sum + computeGCI(tx as Transaction), 0);
    const sbPipelineWeightedGCI = sb.pipelineDeals.reduce((sum, d) => sum + computeWeightedGCI(d as PipelineDeal), 0);
    const sbExpenseItems = getSandboxExpenseItems(sb);
    const sbReceiptYTD = getSandboxReceiptYTD(sb);
    const sbMonthlyRecurring = sbExpenseItems.reduce((sum, item) => sum + Number(item.monthly_recurring ?? 0), 0);
    const now = new Date();
    const sbExpMonthsElapsed = now.getMonth() + (now.getDate() / 30);
    const sbExpensesYTD = Math.max(sbReceiptYTD, sbMonthlyRecurring * sbExpMonthsElapsed);
    const sbQPcts = settings.national_quarter_pcts ?? [0.25, 0.25, 0.25, 0.25];
    const sbFraction = seasonalFractionElapsed(sbQPcts);
    const sbProjectedGCI = projectedYearEndGCI(sbYtdGCI, sbPipelineWeightedGCI, sbFraction, settings.goal_gci ?? 0);

    const sbScenarioSeed: ScenarioSeedData = {
      province: settings.province ?? "ontario",
      goalGCI: settings.goal_gci ?? 0,
      ytdGCI: sbYtdGCI,
      projectedAnnualGCI: sbProjectedGCI,
      dealCount: sbClosedTx.length,
      pipelineWeightedGCI: sbPipelineWeightedGCI,
      monthlyRecurring: sbMonthlyRecurring,
      expensesYTD: sbExpensesYTD,
      monthlyBrokerageFee: settings.monthly_brokerage_fee ?? 0,
      cashReserve: settings.cash_reserve ?? 0,
      isIncorporated: settings.is_incorporated ?? false,
      compensationMethod: settings.compensation_method ?? "salary",
      quarterPcts: sbQPcts,
      splitPreset: (settings.split_preset ?? "p80_20") as SplitPreset,
      postCapThreshold: settings.post_cap_threshold_gci ?? 0,
      postCapAgentPct: settings.post_cap_agent_pct ?? 1,
      postCapBrokeragePct: settings.post_cap_brokerage_pct ?? 0,
      txFeeRate: settings.tx_fee_rate_pct ?? 0,
      txFeeCap: settings.tx_fee_annual_cap ?? 0,
      estimatedWeeklyHours: settings.estimated_weekly_hours ?? null,
      vacationWeeks: settings.vacation_weeks_per_year ?? null,
    };

    return (
      <OverheadContent
        transactions={sb.transactions}
        settings={settings}
        expenseCategories={sb.expenseCategories}
        receiptYTD={getSandboxReceiptYTD(sb)}
        mileageKmTotal={getSandboxMileageTotal(sb)}
        ccaAssetCount={sb.ccaAssets.length}
        historyItems={sb.historyItems as HistoryItem[]}
        pipelineDeals={sb.pipelineDeals}
        subscriptionTier={settings.subscription_tier ?? "starter"}
        scenarioSeed={sbScenarioSeed}
      />
    );
  }

  // ── Normal Supabase path ──
  const [
    txResult,
    expCatResult,
    expItemResult,
    receiptTotalsResult,
    mileageResult,
    ccaResult,
    historyResult,
    pipelineResult,
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
  ]);

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
  const monthlyRecurring = expenseItems.reduce((sum, i) => sum + Number(i.monthly_recurring ?? 0), 0);
  const now = new Date();
  const expMonthsElapsed = now.getMonth() + (now.getDate() / 30);
  const expensesYTD = Math.max(receiptYTD, monthlyRecurring * expMonthsElapsed);
  const qPcts = rawSettings?.national_quarter_pcts ?? [0.25, 0.25, 0.25, 0.25];
  const fraction = seasonalFractionElapsed(qPcts);
  const projectedGCI = projectedYearEndGCI(ytdGCI, pipelineWeightedGCI, fraction, rawSettings?.goal_gci ?? 0);

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
    cashReserve: rawSettings?.cash_reserve ?? 0,
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
      subscriptionTier={rawSettings?.subscription_tier ?? "starter"}
      scenarioSeed={scenarioSeed}
    />
  );
}
