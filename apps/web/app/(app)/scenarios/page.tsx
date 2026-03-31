import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ScenariosContent } from "./scenarios-content";
import type { UserSettings, Transaction, PipelineDeal } from "@/lib/types/database";
import { computeGCI, computeWeightedGCI } from "@/lib/types/database";
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
  /** YTD closed deal count */
  dealCount: number;
  /** Pipeline weighted GCI total */
  pipelineWeightedGCI: number;
  /** Sum of all expense items + receipt expenses YTD */
  expensesYTD: number;
  /** Monthly brokerage fee from settings */
  monthlyBrokerageFee: number;
  /** Monthly recurring expenses from settings */
  monthlyRecurringExpenses: number;
  /** Cash reserve from settings */
  cashReserve: number;
  /** Whether incorporated */
  isIncorporated: boolean;
  /** Compensation method (salary/dividends/mixed) */
  compensationMethod: string;
  /** Seasonal quarter weights */
  quarterPcts: number[];
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
    const categoryExpenses = getSandboxExpenseItems(sb).reduce(
      (sum, item) => sum + Number(item.amount ?? 0),
      0,
    );
    const receiptYTD = getSandboxReceiptYTD(sb);

    seed = {
      province: merged.province ?? "ontario",
      goalGCI: merged.goal_gci ?? 0,
      ytdGCI,
      dealCount: closedTx.length,
      pipelineWeightedGCI,
      expensesYTD: categoryExpenses + receiptYTD,
      monthlyBrokerageFee: merged.monthly_brokerage_fee ?? 0,
      monthlyRecurringExpenses: merged.monthly_recurring_expenses ?? 0,
      cashReserve: merged.cash_reserve ?? 0,
      isIncorporated: merged.is_incorporated ?? false,
      compensationMethod: merged.compensation_method ?? "salary",
      quarterPcts: merged.national_quarter_pcts ?? [0.25, 0.25, 0.25, 0.25],
    };
  } else {
    // Live Supabase queries
    const [txResult, pipelineResult, expCatResult, expItemResult, receiptResult] =
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
          .from("expense_categories")
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

    // Build expense total: category items + receipt expenses
    const expenseCategories = (expCatResult.data ?? []).map((cat) => ({
      ...cat,
      items: (expItemResult.data ?? []).filter(
        (i) => i.category_id === cat.id,
      ),
    }));
    const categoryExpenses = expenseCategories.reduce(
      (sum, cat) =>
        sum + cat.items.reduce((s: number, i: { amount: number }) => s + Number(i.amount ?? 0), 0),
      0,
    );
    const receiptYTD = (receiptResult.data ?? []).reduce(
      (sum, r) => sum + Number(r.total_amount ?? 0),
      0,
    );

    seed = {
      province: settingsRow?.province ?? "ontario",
      goalGCI: settingsRow?.goal_gci ?? 0,
      ytdGCI,
      dealCount: transactions.length,
      pipelineWeightedGCI,
      expensesYTD: categoryExpenses + receiptYTD,
      monthlyBrokerageFee: settingsRow?.monthly_brokerage_fee ?? 0,
      monthlyRecurringExpenses: settingsRow?.monthly_recurring_expenses ?? 0,
      cashReserve: settingsRow?.cash_reserve ?? 0,
      isIncorporated: settingsRow?.is_incorporated ?? false,
      compensationMethod: settingsRow?.compensation_method ?? "salary",
      quarterPcts: settingsRow?.national_quarter_pcts ?? [0.25, 0.25, 0.25, 0.25],
    };
  }

  return <ScenariosContent seed={seed} />;
}
