// Expense inputs for the MCP tools: the dashboard's, read the same way.
//
// NOT a mirror. The math is the canonical engine, imported from the Deno copy
// of packages/core (`pnpm build:mcp-shared`): `ytdExpenseTotals` in
// t2125-expenses-engine (the one year-to-date total the dashboard, the
// Expenses page and every other surface take) and `inputTaxCreditsForPeriod`
// in expense-totals-engine. This file only fetches the rows, with the
// dashboard's tables, columns and filters
// (apps/web/app/(app)/dashboard/page.tsx):
//
//   receipt_expenses    category_key, total_amount, tax_amount
//                       expense_date on or after Jan 1 of the Atlantic year
//   recurring_expenses  every column, is_active = true
//   expense_items       key, monthly_recurring (the monthly estimate typed
//                       on an expense line; it counts per item, so the key
//                       has to be read with it)
//   user_settings       gst_hst_registered, vehicle_business_use_pct,
//                       home_office_business_use_pct (the three inputs of
//                       expenseTaxContext; without the last one a home bill
//                       counts for $0 here and at its share on the dashboard)
//   the vehicle logbook vehicles, logbook periods, odometer readings and the
//                       trips the share needs, for the Atlantic year
//                       (`loadLogbookRowsOrNull`, core/lib/vehicle-logbook-
//                       rows.ts: the loader the dashboard's
//                       `loadVehicleLogbook` calls)
//
// The vehicle business-use share is `expenseTaxContext(settings, { rows,
// year, today })`'s, as on the dashboard: the logbook's figure when it
// covers the year (CRA's full or simplified method,
// engines/vehicle-logbook-engine.ts), the declared setting otherwise. It
// sets the ITC on vehicle costs (get_hst_status) and, at 10% business use or
// less, whether a vehicle cost's GST/HST is claimed back at all (so the
// expense totals). `vehicleUse` says which figure applied and why. A failed
// logbook read is logged and the declared setting applies, labelled
// "declared"; before migration 00184 that is every account.
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
  type ExpenseTaxContext,
  type PeriodInputTaxCredits,
  type ReceiptTotalsRow,
} from "../../_shared/core/engines/expense-totals-engine.ts";
import {
  ytdExpenseTotals,
  type YtdExpenseTotals,
} from "../../_shared/core/engines/t2125-expenses-engine.ts";
import {
  vehicleBusinessUseFor,
  type VehicleBusinessUse,
} from "../../_shared/core/engines/vehicle-logbook-engine.ts";
import { atlanticISODate, atlanticNoon } from "../../_shared/core/lib/local-date.ts";
import { loadLogbookRowsOrNull } from "../../_shared/core/lib/vehicle-logbook-rows.ts";
import type { RecurringExpense } from "../../_shared/core/types/database.ts";

/** An `expense_items` row with its category, for the per-line breakdown. */
export interface ExpenseItemRow {
  key: string;
  title: string;
  monthly_recurring: number | string | null;
  expense_categories: { key: string; title: string } | null;
}

export interface ExpenseInputs {
  /**
   * Who claims ITCs (user_settings), the vehicle business-use share (the
   * logbook's for the year when it covers it, else user_settings) and the
   * home office share (user_settings).
   */
  taxCtx: ExpenseTaxContext;
  /** Where the vehicle share in `taxCtx` comes from: method, label, the 10% test. */
  vehicleUse: VehicleBusinessUse;
  /** Calendar anchor: noon on the Atlantic day. */
  today: Date;
  /** YYYY-MM-DD, Atlantic. */
  todayISO: string;
  /** Jan 1 of the Atlantic year. */
  yearStart: string;
  /** Active recurring expenses as stored (GST/HST included). */
  recurring: RecurringExpense[];
  items: ExpenseItemRow[];
  /** The dashboard's `expensesYTD` and `monthlyRecurring`, and the lines they are the sums of. */
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
  const year = today.getFullYear();
  const yearStart = `${year}-01-01`;

  const [settingsRes, receiptRes, recurringRes, itemRes, logbookRows] = await Promise.all([
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
    // Never rejects: null when the rows can't be read (the declared share).
    loadLogbookRowsOrNull(supabase, userId, year),
  ]);

  // A failed read is an error, not $0 of expenses: with the expenses missing,
  // net income and the tax estimate would come out too high and look valid.
  for (const res of [settingsRes, receiptRes, recurringRes, itemRes]) {
    if (res.error) throw res.error;
  }

  const taxCtx = expenseTaxContext(settingsRes.data, { rows: logbookRows, year, today: todayISO });
  // expenseTaxContext always sets it; the fallback is the same call.
  const vehicleUse = taxCtx.vehicleBusinessUse ?? vehicleBusinessUseFor(settingsRes.data, logbookRows, year, todayISO);
  const receipts: ReceiptTotalsRow[] = receiptRes.data ?? [];
  const recurring: RecurringExpense[] = recurringRes.data ?? [];
  const items: ExpenseItemRow[] = itemRes.data ?? [];

  return {
    taxCtx,
    vehicleUse,
    today,
    todayISO,
    yearStart,
    recurring,
    items,
    totals: ytdExpenseTotals({ receipts, recurring, expenseItems: items, ctx: taxCtx, now: today }),
    itcs: inputTaxCreditsForPeriod(receipts, recurring, taxCtx, yearStart, todayISO),
  };
}

/** Percent, one decimal: 0.54326 → 54.3. */
const pct1 = (fraction: number) => Math.round(fraction * 1000) / 10;

/**
 * The vehicle share a tool reports beside a figure that depends on it:
 * `pct` is a percentage (54.3 = 54.3%), `method` full / simplified /
 * declared, `label` the engine's one line ("54.3%, computed from the
 * logbook by CRA's simplified method").
 */
export function vehicleUseSummary(v: VehicleBusinessUse): { pct: number; method: VehicleBusinessUse["method"]; label: string } {
  return { pct: pct1(v.pct), method: v.method, label: v.label };
}
