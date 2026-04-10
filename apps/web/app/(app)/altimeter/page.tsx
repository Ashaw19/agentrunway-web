import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { AltimeterContent } from "./altimeter-content";
import type { HistoryItem, Transaction, PipelineDeal, RecurringExpense } from "@/lib/types/database";
import { totalRecurringMonthly, totalRecurringYTD } from "@agent-runway/core/engines/recurring-expense-engine";
import { CREA_BOARDS, fetchBoardData, type LocalMarketData } from "@/lib/crea-board";
import { isSandboxActive, getSandboxData, mergeSandboxSettings } from "@/lib/sandbox-resolver";

export default async function AltimeterPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const dashYear = new Date().getFullYear();

  // Always fetch settings first — needed to determine sandbox mode
  const settingsResult = await supabase
    .from("user_settings")
    .select("*")
    .eq("user_id", user.id)
    .single();

  let transactions: Transaction[] = [];
  let pipelineDeals: PipelineDeal[] = [];
  let settings = settingsResult.data;
  let historyItems: HistoryItem[] = [];
  let altMonthlyRecurring = 0;
  let altExpensesYTD = 0;

  if (isSandboxActive(settings)) {
    // ── Sandbox mode: use embedded demo data ──
    const sandbox = getSandboxData(settings);
    transactions = sandbox.transactions ?? [];
    pipelineDeals = sandbox.pipelineDeals ?? [];
    historyItems = (sandbox.historyItems ?? []) as HistoryItem[];
    settings = mergeSandboxSettings(settings);
  } else {
    // ── Live mode: query Supabase ──
    const [txResult, pipelineResult, historyResult, expCatResult, expItemResult, receiptTotalsResult, recurringExpResult] = await Promise.all([
      supabase
        .from("transactions")
        .select("*")
        .eq("user_id", user.id)
        .eq("status", "closed")
        .gte("date", `${dashYear}-01-01`)
        .order("date", { ascending: false })
        .limit(10000),
      supabase
        .from("pipeline_deals")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(10000),
      supabase
        .from("history_items")
        .select("*")
        .eq("user_id", user.id)
        .order("year", { ascending: false })
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
        .gte("expense_date", `${dashYear}-01-01`)
        .limit(10000),
      supabase
        .from("recurring_expenses")
        .select("*")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .limit(10000),
    ]);

    transactions = txResult.data ?? [];
    pipelineDeals = pipelineResult.data ?? [];
    historyItems = (historyResult.data ?? []) as HistoryItem[];

    // Compute expense totals for Altimeter insights
    const expenseCategories = (expCatResult.data ?? []).map((cat: { id: string }) => ({
      ...cat,
      items: (expItemResult.data ?? []).filter((i: { category_id: string }) => i.category_id === cat.id),
    }));
    const receiptYTD = (receiptTotalsResult.data ?? []).reduce(
      (sum: number, r: { total_amount?: number | string | null }) => sum + Number(r.total_amount ?? 0), 0,
    );
    const legacyMonthlyRecurring = expenseCategories.reduce(
      (sum: number, cat: { items: { monthly_recurring?: number | string }[] }) =>
        sum + cat.items.reduce((s: number, i: { monthly_recurring?: number | string }) => s + Number(i.monthly_recurring ?? 0), 0), 0,
    );
    const recurringExps = (recurringExpResult.data ?? []) as RecurringExpense[];
    const recurringExpMonthly = totalRecurringMonthly(recurringExps);
    const recurringExpYTD = totalRecurringYTD(recurringExps);
    altMonthlyRecurring = legacyMonthlyRecurring + recurringExpMonthly;
    const expMonthsElapsed = new Date().getMonth() + (new Date().getDate() / 30);
    altExpensesYTD = Math.max(receiptYTD, legacyMonthlyRecurring * expMonthsElapsed) + recurringExpYTD;
  }

  // Fetch live CREA board data if the user has selected a board
  // (always real — external market data, not sandboxed)
  let boardMarketData: LocalMarketData | null = null;
  const boardCode = settings?.board_code ?? "";
  if (boardCode) {
    const board = CREA_BOARDS.find((b) => b.slug === boardCode);
    if (board) {
      try {
        boardMarketData = await fetchBoardData(board);
      } catch {
        // Board data is non-critical — continue without it
      }
    }
  }

  return (
    <AltimeterContent
      transactions={transactions}
      pipelineDeals={pipelineDeals}
      settings={settings}
      historyItems={historyItems}
      boardMarketData={boardMarketData}
      boardSubregion={settings?.board_subregion ?? ""}
      subscriptionTier={settings?.subscription_tier ?? "starter"}
      recurringExpMonthly={altMonthlyRecurring}
      expensesYTD={altExpensesYTD}
    />
  );
}
