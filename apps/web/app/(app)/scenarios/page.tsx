import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ScenariosContent } from "./scenarios-content";
import type { UserSettings, Transaction, PipelineDeal, SplitPreset } from "@/lib/types/database";
import { computeGCI, computeWeightedGCI } from "@/lib/types/database";
import { projectedYearEndGCI, seasonalFractionElapsed } from "@/lib/engines/projection-engine";
import {
  isSandboxActive,
  getSandboxData,
  mergeSandboxSettings,
  getSandboxExpenseItems,
  getSandboxReceiptYTD,
} from "@/lib/sandbox-resolver";

/** Data the client component needs — pre-computed from real or sandbox sources. */
export interface ScenarioSeedData {
  /** Province slug from settings */
  province: string;
  /** Annual GCI goal */
  goalGCI: number;
  /** YTD GCI (closed transactions this year) */
  ytdGCI: number;
  /** Projected annual GCI (year-end projection from pace + pipeline) */
  projectedAnnualGCI: number;
  /** YTD closed deal count */
  dealCount: number;
  /** Pipeline weighted GCI total */
  pipelineWeightedGCI: number;
  /** Monthly recurring expenses (from expense item monthly_recurring fields — matches dashboard) */
  monthlyRecurring: number;
  /** Sum of all expense items + receipt expenses YTD */
  expensesYTD: number;
  /** Monthly brokerage fee from settings */
  monthlyBrokerageFee: number;
  /** Cash reserve from settings */
  cashReserve: number;
  /** Whether incorporated */
  isIncorporated: boolean;
  /** Compensation method (salary/dividends/mixed) */
  compensationMethod: string;
  /** Seasonal quarter weights */
  quarterPcts: number[];
  /** Brokerage split preset */
  splitPreset: SplitPreset;
  /** Post-cap threshold GCI */
  postCapThreshold: number;
  /** Post-cap agent percentage */
  postCapAgentPct: number;
  /** Post-cap brokerage percentage */
  postCapBrokeragePct: number;
  /** Transaction fee rate (decimal) */
  txFeeRate: number;
  /** Transaction fee annual cap */
  txFeeCap: number;
  /** Self-reported average weekly working hours (null = not set) */
  estimatedWeeklyHours: number | null;
}

export default async function ScenariosPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const currentYear = new Date().getFullYear();

  // ── Step 1: Fetch settings ──────────────────────────────────────────────
  const { data: settingsRow } = await supabase
    .from("user_settings")
    .select("*")
    .eq("user_id", user.id)
    .single();

  const sandboxActive = isSandboxActive(settingsRow as UserSettings | null);

  // ── Step 2: Resolve data (sandbox or live) ──────────────────────────────
  let seed: ScenarioSeedData;

  if (sandboxActive) {
    const sb = getSandboxData(settingsRow as UserSettings);
    const merged = mergeSandboxSettings(settingsRow as UserSettings);

    const closedTx = sb.transactions.filter(
      (tx) => tx.status === "closed" && tx.date >= `${currentYear}-01-01`,
    );
    const ytdGCI = closedTx.reduce(
      (sum, tx) => sum + computeGCI(tx as Transaction),
      0,
    );
    const pipelineWeightedGCI = sb.pipelineDeals.reduce(
      (sum, d) => sum + computeWeightedGCI(d as PipelineDeal),
      0,
    );
    const sbExpenseItems = getSandboxExpenseItems(sb);
    const receiptYTD = getSandboxReceiptYTD(sb);
    // Monthly recurring from expense items — matches dashboard (line 554–557)
    const monthlyRecurring = sbExpenseItems.reduce(
      (sum, item) => sum + Number(item.monthly_recurring ?? 0),
      0,
    );
    // expensesYTD: max(receiptTotal, recurringYTDEstimate) — matches dashboard (line 559–561)
    const now = new Date();
    const expMonthsElapsed = now.getMonth() + (now.getDate() / 30);
    const recurringYTDEstimate = monthlyRecurring * expMonthsElapsed;
    const expensesYTD = Math.max(receiptYTD, recurringYTDEstimate);

    const qPcts = merged.national_quarter_pcts ?? [0.25, 0.25, 0.25, 0.25];
    const fraction = seasonalFractionElapsed(qPcts);
    const projectedAnnualGCI = projectedYearEndGCI(ytdGCI, pipelineWeightedGCI, fraction, merged.goal_gci ?? 0);

    seed = {
      province: merged.province ?? "ontario",
      goalGCI: merged.goal_gci ?? 0,
      ytdGCI,
      projectedAnnualGCI,
      dealCount: closedTx.length,
      pipelineWeightedGCI,
      monthlyRecurring,
      expensesYTD,
      monthlyBrokerageFee: merged.monthly_brokerage_fee ?? 0,
      cashReserve: merged.cash_reserve ?? 0,
      isIncorporated: merged.is_incorporated ?? false,
      compensationMethod: merged.compensation_method ?? "salary",
      quarterPcts: qPcts,
      splitPreset: (merged.split_preset ?? "p80_20") as SplitPreset,
      postCapThreshold: merged.post_cap_threshold_gci ?? 0,
      postCapAgentPct: merged.post_cap_agent_pct ?? 1,
      postCapBrokeragePct: merged.post_cap_brokerage_pct ?? 0,
      txFeeRate: merged.tx_fee_rate_pct ?? 0,
      txFeeCap: merged.tx_fee_annual_cap ?? 0,
      estimatedWeeklyHours: merged.estimated_weekly_hours ?? null,
    };
  } else {
    // Live Supabase queries
    const [txResult, pipelineResult, expItemResult, receiptResult] =
      await Promise.all([
        supabase
          .from("transactions")
          .select("*")
          .eq("user_id", user.id)
          .eq("status", "closed")
          .gte("date", `${currentYear}-01-01`)
          .limit(10000),
        supabase
          .from("pipeline_deals")
          .select("*")
          .eq("user_id", user.id)
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
      ]);

    const transactions = (txResult.data ?? []) as Transaction[];
    const pipelineDeals = (pipelineResult.data ?? []) as PipelineDeal[];

    const ytdGCI = transactions.reduce((sum, tx) => sum + computeGCI(tx), 0);
    const pipelineWeightedGCI = pipelineDeals.reduce(
      (sum, d) => sum + computeWeightedGCI(d),
      0,
    );

    // Monthly recurring from expense items — matches dashboard (line 554–557)
    const expenseItems = expItemResult.data ?? [];
    const monthlyRecurring = expenseItems.reduce(
      (sum, i) => sum + Number(i.monthly_recurring ?? 0),
      0,
    );
    // expensesYTD: max(receiptTotal, recurringYTDEstimate) — matches dashboard (line 559–561)
    const receiptYTD = (receiptResult.data ?? []).reduce(
      (sum, r) => sum + Number(r.total_amount ?? 0),
      0,
    );
    const now = new Date();
    const expMonthsElapsed = now.getMonth() + (now.getDate() / 30);
    const recurringYTDEstimate = monthlyRecurring * expMonthsElapsed;
    const expensesYTD = Math.max(receiptYTD, recurringYTDEstimate);

    const qPcts = settingsRow?.national_quarter_pcts ?? [0.25, 0.25, 0.25, 0.25];
    const fraction = seasonalFractionElapsed(qPcts);
    const projectedAnnualGCI = projectedYearEndGCI(ytdGCI, pipelineWeightedGCI, fraction, settingsRow?.goal_gci ?? 0);

    seed = {
      province: settingsRow?.province ?? "ontario",
      goalGCI: settingsRow?.goal_gci ?? 0,
      ytdGCI,
      projectedAnnualGCI,
      dealCount: transactions.length,
      pipelineWeightedGCI,
      monthlyRecurring,
      expensesYTD,
      monthlyBrokerageFee: settingsRow?.monthly_brokerage_fee ?? 0,
      cashReserve: settingsRow?.cash_reserve ?? 0,
      isIncorporated: settingsRow?.is_incorporated ?? false,
      compensationMethod: settingsRow?.compensation_method ?? "salary",
      quarterPcts: qPcts,
      splitPreset: (settingsRow?.split_preset ?? "p80_20") as SplitPreset,
      postCapThreshold: settingsRow?.post_cap_threshold_gci ?? 0,
      postCapAgentPct: settingsRow?.post_cap_agent_pct ?? 1,
      postCapBrokeragePct: settingsRow?.post_cap_brokerage_pct ?? 0,
      txFeeRate: settingsRow?.tx_fee_rate_pct ?? 0,
      txFeeCap: settingsRow?.tx_fee_annual_cap ?? 0,
      estimatedWeeklyHours: settingsRow?.estimated_weekly_hours ?? null,
    };
  }

  return <ScenariosContent seed={seed} />;
}
