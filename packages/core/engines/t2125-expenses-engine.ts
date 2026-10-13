/**
 * T2125 Expenses Engine — what each tracked expense counts for on the T2125.
 *
 * CANONICAL source for (created 2026-10-13):
 *   - the expense entries the T2125 pre-fill is computed from (Reports page),
 *   - the Expenses page's "Est. Tax Deductible YTD" card, its Deductible
 *     column and its year-to-date total.
 * Both screens call `buildT2125Expenses`, so they can't disagree.
 *
 * Why it exists: the Reports page used to build the T2125 input itself, from
 * receipts and the legacy per-item monthly figure, and the Expenses page
 * worked out deductible amounts row by row from the same two sources. Neither
 * read the Recurring Expenses list (`recurring_expenses`, migration 00108).
 * A vehicle lease or board dues kept in that list counted in "YTD Expenses"
 * on every screen and in no T2125 line, so the pre-fill's net business
 * income was too high by all of it.
 *
 * Three sources, one line each:
 *
 *   1. Per expense key: receipts this year, or the legacy per-item monthly
 *      figure × months elapsed where that is larger. They describe the same
 *      spending (the monthly figure is the estimate, the receipts are the
 *      actuals), so the larger counts, not the sum.
 *   2. Receipts saved with no category: one line, line 9270.
 *   3. Each active recurring expense: its occurrences to date
 *      (`recurringYTD`), so an annual fee due in November is not in June's
 *      figure. Its `vehicle_pct_applicable` box is honoured, as it is for
 *      the GST/HST (`itcForExpense`).
 *
 * Every amount is net of the ITCs a GST/HST registrant claims
 * (expense-totals-engine). The line, the 50% meals limit and the vehicle
 * business-use share come from `t2125ExpenseLine`; nothing here re-derives
 * them. Home Office bills count at the home office share and reach the T2125
 * whole, as costs behind line 9945 (`homeOfficeCosts`), never as an entry.
 *
 * Information only, not tax advice: these are estimates from what was
 * logged, for review with an accountant.
 */

import { recurringNetOfItc, type ExpenseTaxContext, type ReceiptTotals } from "./expense-totals-engine";
import { recurringYTD } from "./recurring-expense-engine";
import {
  isHomeOfficeKey,
  t2125ExpenseLine,
  t2125LineForExpenseKey,
  type ExpenseLineItem,
  type T2125ExpenseEntry,
} from "./t2125-engine";
import type { RecurringExpense } from "../types/database";

/** Where a line's amount came from. */
export type TrackedExpenseSource = "item" | "recurring" | "uncategorized";

/** Which limit applies. `home`: the amount is already the home office share. */
export type DeductionRule = "full" | "meals" | "vehicle" | "home";

export interface TrackedExpenseLine extends ExpenseLineItem {
  source: TrackedExpenseSource;
  /** `recurring_expenses.id`, for source "recurring". */
  recurringId?: string;
  rule: DeductionRule;
}

export interface T2125ExpensesInput {
  /** `aggregateReceiptTotals(rows, ctx)` for the tax year to date. */
  receiptTotals: Pick<ReceiptTotals, "byKey" | "uncategorized" | "homeOfficeCosts">;
  /** `expense_items` rows: the legacy per-item monthly figure. */
  expenseItems: readonly { key: string; monthly_recurring: number | string | null }[] | null | undefined;
  /** `recurring_expenses` rows AS STORED, not the net-of-ITC copies. */
  recurringExpenses: readonly RecurringExpense[] | null | undefined;
  ctx: ExpenseTaxContext;
  /** Calendar anchor: the tax year and the day to total up to. Server callers pass atlanticNoon(). */
  now?: Date;
}

export interface T2125ExpensesResult {
  /**
   * One line per expense key with an amount, one for uncategorized receipts,
   * and one per active recurring expense (kept at $0 before its first
   * occurrence of the year, so a row can always find its line).
   */
  lines: TrackedExpenseLine[];
  /** `computeT2125({ expenses })`: every line with an amount, except home bills. */
  entries: T2125ExpenseEntry[];
  /** `computeT2125({ homeOfficeCosts })`: home bills by key, whole. */
  homeOfficeCosts: Record<string, number>;
  /** Expenses to date: the sum of the lines' amounts. */
  ytdTotal: number;
  /** After the limits. Less `byRule.home`, this is the T2125's line 9369. */
  deductibleTotal: number;
  byRule: Record<DeductionRule, number>;
}

/**
 * Months of the legacy per-item monthly figure counted so far this year: the
 * current month included, as on the dashboard and every other expense total
 * (`expMonthsElapsed`). The figure has no charge day, so there is no "has
 * this month's happened yet" to check. No later month is ever counted.
 */
export function legacyMonthsElapsed(now: Date = new Date()): number {
  return now.getMonth() + 1;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function ruleFor(line: ExpenseLineItem): DeductionRule {
  if (t2125LineForExpenseKey(line.key).applyHomeUse) return "home";
  if (line.isMeals) return "meals";
  if (line.isVehicle) return "vehicle";
  return "full";
}

export function buildT2125Expenses(input: T2125ExpensesInput): T2125ExpensesResult {
  const { receiptTotals, ctx } = input;
  const now = input.now ?? new Date();
  const lines: TrackedExpenseLine[] = [];
  const homeOfficeCosts: Record<string, number> = { ...receiptTotals.homeOfficeCosts };

  const entries: T2125ExpenseEntry[] = [];

  const track = (source: TrackedExpenseSource, entry: T2125ExpenseEntry, recurringId?: string) => {
    const line = t2125ExpenseLine(entry, ctx.vehicleBusinessUsePct);
    const rule = ruleFor(line);
    lines.push({ ...line, source, rule, ...(recurringId ? { recurringId } : {}) });
    if (entry.amount > 0 && rule !== "home") entries.push(entry);
  };

  // 1. Per expense key. A home item has no monthly figure to count: home
  //    bills vary and are logged one by one (the Expenses page has no box).
  const months = legacyMonthsElapsed(now);
  const legacyByKey: Record<string, number> = {};
  for (const item of input.expenseItems ?? []) {
    const monthly = Number(item.monthly_recurring ?? 0);
    if (!item.key || !(monthly > 0) || isHomeOfficeKey(item.key)) continue;
    legacyByKey[item.key] = (legacyByKey[item.key] ?? 0) + monthly * months;
  }
  for (const key of new Set([...Object.keys(receiptTotals.byKey), ...Object.keys(legacyByKey)])) {
    const amount = Math.max(receiptTotals.byKey[key] ?? 0, legacyByKey[key] ?? 0);
    if (amount > 0) track("item", { key, amount });
  }

  // 2. Receipts with no category.
  if (receiptTotals.uncategorized > 0) track("uncategorized", { key: null, amount: receiptTotals.uncategorized });

  // 3. The Recurring Expenses list, occurrences to date.
  for (const re of input.recurringExpenses ?? []) {
    if (!re.is_active) continue;
    const key = re.category_key || null;
    const amounts = recurringNetOfItc(re, ctx);
    track(
      "recurring",
      { key, amount: recurringYTD({ ...re, amount: amounts.net }, now), vehicleUse: Boolean(re.vehicle_pct_applicable) },
      re.id,
    );
    if (key && amounts.homeCost) {
      const whole = recurringYTD({ ...re, amount: amounts.homeCost }, now);
      if (whole > 0) homeOfficeCosts[key] = round2((homeOfficeCosts[key] ?? 0) + whole);
    }
  }

  const byRule: Record<DeductionRule, number> = { full: 0, meals: 0, vehicle: 0, home: 0 };
  let ytdTotal = 0;
  let deductibleTotal = 0;
  for (const line of lines) {
    ytdTotal += line.rawAmount;
    deductibleTotal += line.deductibleAmount;
    byRule[line.rule] += line.deductibleAmount;
  }

  return { lines, entries, homeOfficeCosts, ytdTotal, deductibleTotal, byRule };
}
