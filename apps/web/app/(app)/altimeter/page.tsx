import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { AltimeterContent } from "./altimeter-content";
import type { HistoryItem, RecurringExpense } from "@/lib/types/database";
import { expenseTaxContext } from "@agent-runway/core/engines/expense-totals-engine";
import { ytdExpenseTotals } from "@agent-runway/core/engines/t2125-expenses-engine";
import { computeIsPro } from "@/lib/compute-is-pro";
import { atlanticNoon } from "@agent-runway/core/lib/local-date";
import { loadCapYearCarryOver } from "@/lib/cap-year-carry-over";


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

  // A REAL agent's closed deals before January 1 in the anniversary year that
  // contains it: the plan waterfall's cap carries across January 1 (the
  // dashboard's carry-over, cap-year-carry-over.ts). Never rejects.
  const carryOverPromise = loadCapYearCarryOver(supabase, user.id, settings, dashYear);

  // ── Live Supabase queries ──
  const [txResult, pipelineResult, historyResult, expItemResult, receiptTotalsResult, recurringExpResult] = await Promise.all([
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
  const carryOverTx = await carryOverPromise;
  const pipelineDeals = pipelineResult.data ?? [];
  const historyItems = (historyResult.data ?? []) as HistoryItem[];

  // Expense totals for Altimeter insights: the dashboard's one engine call
  // (t2125-expenses-engine). Receipts, the per-item monthly figures and the
  // Recurring Expenses list, net of the ITCs a registrant claims.
  const expenseTotals = ytdExpenseTotals({
    receipts: receiptTotalsResult.data,
    recurring: (recurringExpResult.data ?? []) as RecurringExpense[],
    expenseItems: expItemResult.data,
    ctx: expenseTaxContext(settings),
    now: today,
  });

  return (
    <AltimeterContent
      transactions={transactions}
      carryOverTx={carryOverTx}
      pipelineDeals={pipelineDeals}
      settings={settings}
      historyItems={historyItems}
      isPro={await computeIsPro(supabase, user.id, settings)}
      recurringExpMonthly={expenseTotals.monthlyRecurring}
      expensesYTD={expenseTotals.expensesYTD}
      expensesRemaining={expenseTotals.expensesRemaining}
    />
  );
}
