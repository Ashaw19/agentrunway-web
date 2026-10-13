import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { AltimeterContent } from "./altimeter-content";
import type { HistoryItem, RecurringExpense } from "@/lib/types/database";
import { totalRecurringMonthly, totalRecurringRemainingThisYear, totalRecurringYTD } from "@agent-runway/core/engines/recurring-expense-engine";
import { aggregateReceiptTotals, expenseTaxContext, expensesRemainingThisYear, recurringExpensesNetOfItc } from "@agent-runway/core/engines/expense-totals-engine";
import { computeIsPro } from "@/lib/compute-is-pro";
import { atlanticNoon } from "@agent-runway/core/lib/local-date";


export default async function AltimeterPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Atlantic calendar, not the server's UTC clock (local-date.ts).
  const today = atlanticNoon();
  const dashYear = today.getFullYear();

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
        .select("category_key, total_amount, tax_amount")
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
  // Net of the GST/HST a registrant claims back as ITCs (expense-totals-engine).
  const taxCtx = expenseTaxContext(settings);
  const receiptYTD = aggregateReceiptTotals(receiptTotalsResult.data, taxCtx).total;
  const legacyMonthlyRecurring = expenseCategories.reduce(
    (sum: number, cat: { items: { monthly_recurring?: number | string }[] }) =>
      sum + cat.items.reduce((s: number, i: { monthly_recurring?: number | string }) => s + Number(i.monthly_recurring ?? 0), 0), 0,
  );
  const recurringExps = recurringExpensesNetOfItc(
    (recurringExpResult.data ?? []) as RecurringExpense[],
    taxCtx,
  );
  const recurringExpMonthly = totalRecurringMonthly(recurringExps);
  const recurringExpYTD = totalRecurringYTD(recurringExps, today);
  const altMonthlyRecurring = legacyMonthlyRecurring + recurringExpMonthly;
  // Integer months elapsed (1-12) — matches the dashboard. See
  // dashboard_metric_divergence_fix_2026-06-26.md.
  const expMonthsElapsed = today.getMonth() + 1;
  const altExpensesYTD = Math.max(receiptYTD, legacyMonthlyRecurring * expMonthsElapsed) + recurringExpYTD;
  const altExpensesRemaining = expensesRemainingThisYear(
    legacyMonthlyRecurring,
    totalRecurringRemainingThisYear(recurringExps, today),
    today,
  );

  return (
    <AltimeterContent
      transactions={transactions}
      pipelineDeals={pipelineDeals}
      settings={settings}
      historyItems={historyItems}
      isPro={await computeIsPro(supabase, user.id, settings)}
      recurringExpMonthly={altMonthlyRecurring}
      expensesYTD={altExpensesYTD}
      expensesRemaining={altExpensesRemaining}
    />
  );
}
