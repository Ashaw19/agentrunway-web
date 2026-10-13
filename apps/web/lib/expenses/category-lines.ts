/**
 * Expense lines by category: how the engine's lines are arranged under a
 * user's expense categories.
 *
 * The lines come from `ytdExpenseTotals(...).tracked.lines`
 * (t2125-expenses-engine): one per expense item with an amount, one for
 * receipts with no category, one per active recurring expense. Their amounts
 * add up to "YTD Expenses" and their monthly amounts to "Monthly Recurring".
 * This file only sorts them into category rows, so a table built from
 * `expenseCategoryRows` always adds up to those two totals. Which category
 * a key belongs to is the engine's rule (`expenseCategoryResolver`), the one
 * the tax cards and Flight Crew use: nothing here decides it.
 *
 * Used by the Expenses page (category table, donut, PDF export), the Reports
 * overview ("Expenses by Category" table and donut) and the business report
 * PDF. Until 2026-10-13 the Reports table and the PDF listed receipts per
 * category under a Total row that also held the Recurring Expenses list and
 * the monthly figures, so the rows came short of the total.
 */

import {
  expenseCategoryResolver,
  type TrackedExpenseLine,
} from "@agent-runway/core/engines/t2125-expenses-engine";

export interface CategoryWithItemKeys {
  key: string;
  title: string;
  items: readonly { key: string }[];
}

export interface ExpenseLinesByCategory {
  /** The line for an expense item's receipts or monthly figure. */
  lineByItemKey: Map<string, TrackedExpenseLine>;
  /** The line for a recurring expense, by `recurring_expenses.id`. */
  lineByRecurringId: Map<string, TrackedExpenseLine>;
  /** Lines under each category in `categories`, by category key. */
  linesByCatKey: Record<string, TrackedExpenseLine[]>;
  /**
   * Lines with no category row to sit under: receipts saved with no
   * category, or anything filed under a category that isn't in `categories`.
   */
  unfiledLines: TrackedExpenseLine[];
}

/** Every line lands in exactly one place: under a category, or in `unfiledLines`. */
export function groupExpenseLinesByCategory(
  lines: readonly TrackedExpenseLine[],
  categories: readonly Pick<CategoryWithItemKeys, "key" | "items">[],
): ExpenseLinesByCategory {
  const categoryOf = expenseCategoryResolver(categories);
  const shownCatKeys = new Set(categories.map((c) => c.key));
  const lineByItemKey = new Map<string, TrackedExpenseLine>();
  const lineByRecurringId = new Map<string, TrackedExpenseLine>();
  const linesByCatKey: Record<string, TrackedExpenseLine[]> = {};
  const unfiledLines: TrackedExpenseLine[] = [];
  for (const line of lines) {
    if (line.source === "item" && line.key) lineByItemKey.set(line.key, line);
    if (line.recurringId) lineByRecurringId.set(line.recurringId, line);
    // A category the caller doesn't list (the Expenses page hides payroll
    // and corporate admin until they are switched on) has no row to sit
    // under, so its lines are unfiled rather than lost.
    const catKey = categoryOf(line.key);
    if (catKey && shownCatKeys.has(catKey)) {
      if (!linesByCatKey[catKey]) linesByCatKey[catKey] = [];
      linesByCatKey[catKey].push(line);
    } else {
      unfiledLines.push(line);
    }
  }
  return { lineByItemKey, lineByRecurringId, linesByCatKey, unfiledLines };
}

export const linesYtd = (lines: readonly TrackedExpenseLine[] | undefined): number =>
  (lines ?? []).reduce((s, l) => s + l.rawAmount, 0);
export const linesMonthly = (lines: readonly TrackedExpenseLine[] | undefined): number =>
  (lines ?? []).reduce((s, l) => s + l.monthlyAmount, 0);
export const linesDeductible = (lines: readonly TrackedExpenseLine[] | undefined): number =>
  (lines ?? []).reduce((s, l) => s + l.deductibleAmount, 0);

/** The row for lines with no category to sit under. */
export const UNFILED_CATEGORY_TITLE = "Not in a category";

export interface ExpenseCategoryRow {
  /** `expense_categories.key`; null for the unfiled row. */
  key: string | null;
  title: string;
  /** Year to date. */
  ytd: number;
  /** Expected each month. */
  monthly: number;
  /** Year to date after the T2125 limits. */
  deductible: number;
  lines: TrackedExpenseLine[];
}

/**
 * One row per category, in the order given, then the unfiled row. Every row
 * is returned, including the ones at $0, so the caller decides what to hide;
 * `ytd` adds up to the engine's `ytdTotal` and `monthly` to its
 * `monthlyTotal` whatever is hidden.
 */
export function expenseCategoryRows(
  lines: readonly TrackedExpenseLine[],
  categories: readonly CategoryWithItemKeys[],
): ExpenseCategoryRow[] {
  const { linesByCatKey, unfiledLines } = groupExpenseLinesByCategory(lines, categories);
  const row = (key: string | null, title: string, rowLines: TrackedExpenseLine[]): ExpenseCategoryRow => ({
    key,
    title,
    ytd: linesYtd(rowLines),
    monthly: linesMonthly(rowLines),
    deductible: linesDeductible(rowLines),
    lines: rowLines,
  });
  // Two categories with one key (never seeded, but not ruled out by the
  // schema) share one set of lines: the first row carries them.
  const taken = new Set<string>();
  const linesFor = (catKey: string): TrackedExpenseLine[] => {
    if (taken.has(catKey)) return [];
    taken.add(catKey);
    return linesByCatKey[catKey] ?? [];
  };
  return [
    ...categories.map((cat) => row(cat.key, cat.title, linesFor(cat.key))),
    row(null, UNFILED_CATEGORY_TITLE, unfiledLines),
  ];
}
