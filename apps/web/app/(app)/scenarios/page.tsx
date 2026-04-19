import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ScenariosContent } from "./scenarios-content";
import type { Transaction, PipelineDeal, SplitPreset, RecurringExpense } from "@/lib/types/database";
import { totalRecurringMonthly, totalRecurringYTD } from "@agent-runway/core/engines/recurring-expense-engine";
import { computeGCI, computeWeightedGCI } from "@/lib/types/database";
import { projectedYearEndGCI, projectedYearEndTransactions, seasonalFractionElapsed } from "@/lib/engines/projection-engine";
import { computeEffectiveCashForSurvival } from "@/lib/engines/effective-cash";


/** Data the client component needs — pre-computed server-side. */
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
  /** Baseline cash for Survival — cashPosition.effectiveCash (matches dashboard/chat).
   *  User slider adjusts this value in scenarios-content; the seed value is the
   *  implied business cash position, not the raw user-entered cash_reserve field. */
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
  /** Weeks of vacation/time-off per year (null = not set) */
  vacationWeeks: number | null;
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
    .maybeSingle();

  // ── Live Supabase queries ──────────────────────────────────────────
  const [txResult, pipelineResult, expItemResult, receiptResult, recurringExpResult] =
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
        supabase
          .from("recurring_expenses")
          .select("*")
          .eq("user_id", user.id)
          .eq("is_active", true)
          .limit(10000),
      ]);

    const recurringExps = (recurringExpResult.data ?? []) as RecurringExpense[];
    const recurringExpMonthly = totalRecurringMonthly(recurringExps);
    const recurringExpYTDValue = totalRecurringYTD(recurringExps);

    const transactions = (txResult.data ?? []) as Transaction[];
    const pipelineDeals = (pipelineResult.data ?? []) as PipelineDeal[];

    const ytdGCI = transactions.reduce((sum, tx) => sum + computeGCI(tx), 0);
    const pipelineWeightedGCI = pipelineDeals.reduce(
      (sum, d) => sum + computeWeightedGCI(d),
      0,
    );

    // Monthly recurring from expense items + recurring_expenses table
    const expenseItems = expItemResult.data ?? [];
    const legacyMonthlyRecurring = expenseItems.reduce(
      (sum, i) => sum + Number(i.monthly_recurring ?? 0),
      0,
    );
    const monthlyRecurring = legacyMonthlyRecurring + recurringExpMonthly;
    const receiptYTD = (receiptResult.data ?? []).reduce(
      (sum, r) => sum + Number(r.total_amount ?? 0),
      0,
    );
    const now = new Date();
    const expMonthsElapsed = now.getMonth() + (now.getDate() / 30);
    const legacyRecurringYTDEstimate = legacyMonthlyRecurring * expMonthsElapsed;
    const expensesYTD = Math.max(receiptYTD, legacyRecurringYTDEstimate) + recurringExpYTDValue;

    const qPcts = settingsRow?.national_quarter_pcts ?? [0.25, 0.25, 0.25, 0.25];
    const fraction = seasonalFractionElapsed(qPcts);
    const projectedAnnualGCI = projectedYearEndGCI(ytdGCI, pipelineWeightedGCI, fraction, settingsRow?.goal_gci ?? 0);

    // Baseline cash input MUST be cashPosition.effectiveCash (not raw cash_reserve)
    // to match dashboard + chat. The scenarios slider lets the user adjust
    // this lever — but the starting point has to agree with the dashboard.
    // See memory/feedback_data_consistency_protocol.md.
    const projectedDealCount = projectedYearEndTransactions(transactions.length, pipelineDeals.length, fraction);
    const scenarioBaselineCash = settingsRow
      ? computeEffectiveCashForSurvival({
          settings: settingsRow,
          ytdGCI,
          expensesYTD,
          monthlyRecurring,
          projectedGCI: projectedAnnualGCI,
          projectedDealCount,
          fraction,
        }).cashPosition.effectiveCash
      : 0;

  const seed: ScenarioSeedData = {
    province: settingsRow?.province ?? "ontario",
    goalGCI: settingsRow?.goal_gci ?? 0,
    ytdGCI,
    projectedAnnualGCI,
    dealCount: transactions.length,
    pipelineWeightedGCI,
    monthlyRecurring,
    expensesYTD,
    monthlyBrokerageFee: settingsRow?.monthly_brokerage_fee ?? 0,
    cashReserve: scenarioBaselineCash,
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
    vacationWeeks: settingsRow?.vacation_weeks_per_year ?? null,
  };

  return <ScenariosContent seed={seed} />;
}
