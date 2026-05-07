import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { AltimeterContent } from "./altimeter-content";
import type { HistoryItem, RecurringExpense } from "@/lib/types/database";
import { totalRecurringMonthly, totalRecurringYTD } from "@agent-runway/core/engines/recurring-expense-engine";
import { computeIsPro } from "@/lib/compute-is-pro";


export default async function AltimeterPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const dashYear = new Date().getFullYear();

  const settingsResult = await supabase
    .from("user_settings")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  const settings = settingsResult.data;

  // ── Live Supabase queries ──
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

  const transactions = txResult.data ?? [];
  const pipelineDeals = pipelineResult.data ?? [];
  const historyItems = (historyResult.data ?? []) as HistoryItem[];

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
  const altMonthlyRecurring = legacyMonthlyRecurring + recurringExpMonthly;
  const expMonthsElapsed = new Date().getMonth() + (new Date().getDate() / 30);
  const altExpensesYTD = Math.max(receiptYTD, legacyMonthlyRecurring * expMonthsElapsed) + recurringExpYTD;

  return (
    <AltimeterContent
      transactions={transactions}
      pipelineDeals={pipelineDeals}
      settings={settings}
      historyItems={historyItems}
      isPro={await computeIsPro(supabase, user.id, settings)}
      recurringExpMonthly={altMonthlyRecurring}
      expensesYTD={altExpensesYTD}
    />
  );
}
