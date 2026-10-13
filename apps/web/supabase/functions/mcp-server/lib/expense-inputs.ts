// Expense inputs for the MCP tools: the dashboard's, read the same way.
//
// NOT a mirror. The math is the canonical engine, imported from the Deno copy
// of packages/core (`pnpm build:mcp-shared`): `ytdExpenseTotals` and
// `inputTaxCreditsForPeriod` in expense-totals-engine. This file only fetches
// the rows, with the dashboard's tables, columns and filters
// (apps/web/app/(app)/dashboard/page.tsx):
//
//   receipt_expenses    category_key, total_amount, tax_amount
//                       expense_date on or after Jan 1 of the Atlantic year
//   recurring_expenses  every column, is_active = true
//   expense_items       monthly_recurring (the legacy monthly estimate)
//   user_settings       gst_hst_registered, vehicle_business_use_pct,
//                       home_office_business_use_pct (the three inputs of
//                       expenseTaxContext; without the last one a home bill
//                       counts for $0 here and at its share on the dashboard)
//
// `expense_items.ytd_amount` is deliberately not read. The app stopped
// writing it when receipts replaced it; until 2026-10-13 every MCP expense
// figure was a sum of that column (0, or a stale number).
//
// Every tool that reports an expense figure calls `loadExpenseInputs`, so the
// tools agree with each other as well as with the dashboard.
// apps/web/lib/mcp-server/__tests__/expense-parity.test.ts runs them.
//
// ESTIMATE ONLY. Not legal or tax advice.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  expenseTaxContext,
  inputTaxCreditsForPeriod,
  recurringExpensesNetOfItc,
  ytdExpenseTotals,
  type ExpenseTaxContext,
  type PeriodInputTaxCredits,
  type ReceiptTotalsRow,
  type YtdExpenseTotals,
} from "../../_shared/core/engines/expense-totals-engine.ts";
import { atlanticISODate, atlanticNoon } from "../../_shared/core/lib/local-date.ts";
import type { RecurringExpense } from "../../_shared/core/types/database.ts";

/** An `expense_items` row with its category, for the per-line breakdown. */
export interface ExpenseItemRow {
  key: string;
  title: string;
  monthly_recurring: number | string | null;
  expense_categories: { key: string; title: string } | null;
}

export interface ExpenseInputs {
  /** Who claims ITCs, and the vehicle and home office business-use shares (user_settings). */
  taxCtx: ExpenseTaxContext;
  /** Calendar anchor: noon on the Atlantic day. */
  today: Date;
  /** YYYY-MM-DD, Atlantic. */
  todayISO: string;
  /** Jan 1 of the Atlantic year. */
  yearStart: string;
  /** Active recurring expenses as stored (GST/HST included). */
  recurring: RecurringExpense[];
  /** The same rows with `amount` net of ITC: for totals only. */
  recurringNet: RecurringExpense[];
  items: ExpenseItemRow[];
  /** The dashboard's `expensesYTD` and `monthlyRecurring`, and what they are built from. */
  totals: YtdExpenseTotals;
  /** ITCs on this year's receipts and on recurring expenses charged to date. */
  itcs: PeriodInputTaxCredits;
}

export async function loadExpenseInputs(
  supabase: SupabaseClient,
  userId: string,
  now: Date = new Date(),
): Promise<ExpenseInputs> {
  // The Atlantic calendar, not the edge runtime's UTC clock: from 8 pm
  // Atlantic on Dec 31, UTC is already next year.
  const today = atlanticNoon(now);
  const todayISO = atlanticISODate(now);
  const yearStart = `${today.getFullYear()}-01-01`;

  const [settingsRes, receiptRes, recurringRes, itemRes] = await Promise.all([
    supabase
      .from("user_settings")
      .select("gst_hst_registered, vehicle_business_use_pct, home_office_business_use_pct")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("receipt_expenses")
      .select("category_key, total_amount, tax_amount")
      .eq("user_id", userId)
      .gte("expense_date", yearStart)
      .limit(10000),
    supabase
      .from("recurring_expenses")
      .select("*")
      .eq("user_id", userId)
      .eq("is_active", true)
      .limit(10000),
    supabase
      .from("expense_items")
      .select("key, title, monthly_recurring, expense_categories(key, title)")
      .eq("user_id", userId)
      .limit(10000),
  ]);

  // A failed read is an error, not $0 of expenses: with the expenses missing,
  // net income and the tax estimate would come out too high and look valid.
  for (const res of [settingsRes, receiptRes, recurringRes, itemRes]) {
    if (res.error) throw res.error;
  }

  const taxCtx = expenseTaxContext(settingsRes.data);
  const receipts: ReceiptTotalsRow[] = receiptRes.data ?? [];
  const recurring: RecurringExpense[] = recurringRes.data ?? [];
  const items: ExpenseItemRow[] = itemRes.data ?? [];

  return {
    taxCtx,
    today,
    todayISO,
    yearStart,
    recurring,
    recurringNet: recurringExpensesNetOfItc(recurring, taxCtx),
    items,
    totals: ytdExpenseTotals({ receipts, recurring, legacyItems: items, ctx: taxCtx, now: today }),
    itcs: inputTaxCreditsForPeriod(receipts, recurring, taxCtx, yearStart, todayISO),
  };
}
