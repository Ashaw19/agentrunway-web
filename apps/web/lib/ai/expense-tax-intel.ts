/**
 * Flight Crew expense context that depends on WHICH expenses are tracked:
 * the "[MISSING DEDUCTIONS]", "[DOCUMENTATION]" and "[CCA OPPORTUNITY]"
 * tax-intel lines (chat route) and the per-category lines of the expense
 * diagnostic (chat-diagnostics).
 *
 * Until 2026-10-13 all four read `expense_items.ytd_amount`. Nothing has
 * written that column since receipts replaced it, so an agent with a year of
 * fuel receipts was described as having $0 recorded under Vehicle, and the
 * diagnostic's category lines contradicted its own total.
 *
 * They now read the tracked expense lines (`buildT2125Expenses`, the lines
 * behind the Expenses page and the T2125): receipts this year, the per-item
 * monthly figure and the Recurring Expenses list. Pure: the callers pass
 * their rows in, so every line can be pinned in a unit test.
 *
 * Tax copy is information, not advice: each line states what is recorded and
 * a CRA rule, and tells the model to describe no action.
 */
import {
  trackedExpensesByCategory,
  type TrackedExpenseLine,
} from "@agent-runway/core/engines/t2125-expenses-engine";

/** An `expense_categories` row with its `expense_items`, as PostgREST nests them. */
export interface ExpenseCategoryRow {
  key: string;
  title?: string | null;
  expense_items?: { key: string; monthly_recurring?: number | string | null }[] | null;
}

type Line = Pick<TrackedExpenseLine, "key" | "rawAmount" | "source">;

const categoryKeys = (categories: readonly ExpenseCategoryRow[] | null | undefined) =>
  (categories ?? []).map((cat) => ({ key: cat.key, items: cat.expense_items ?? [] }));

/** Every expense item of every category: `ytdExpenseTotals({ expenseItems })`. */
export function expenseItemsOf(categories: readonly ExpenseCategoryRow[] | null | undefined) {
  return (categories ?? []).flatMap((cat) =>
    (cat.expense_items ?? []).map((item) => ({ key: item.key, monthly_recurring: item.monthly_recurring ?? null })),
  );
}

// ── "Expense Data" completeness line ─────────────────────────────────────────

/**
 * How many expense lines and categories carry an amount this year. Every
 * account is seeded with the full list of categories and items, so counting
 * `expense_items` rows says nothing about what has been recorded.
 */
export function trackedExpenseCounts(
  lines: readonly Line[],
  categories: readonly ExpenseCategoryRow[] | null | undefined,
): { lines: number; categories: number } {
  const withAmount = lines.filter((l) => l.rawAmount > 0);
  const byCategory = trackedExpensesByCategory(withAmount, categoryKeys(categories)).categories;
  return { lines: withAmount.length, categories: Object.keys(byCategory).length };
}

// ── [MISSING DEDUCTIONS] ─────────────────────────────────────────────────────

/** Closed deals this year before the line is emitted. */
const MIN_DEALS_FOR_MISSING_DEDUCTIONS = 3;

/** `expense_categories.key` → how the category is named to the model. */
export const CORE_EXPENSE_CATEGORIES: Record<string, string> = {
  vehicle: "Vehicle expenses (gas, insurance, lease)",
  marketing: "Marketing & advertising",
  office_tech: "Office & technology",
  professional: "Professional fees (MLS, licensing, E&O)",
};

/** The core categories with nothing tracked: no receipt this year, no monthly figure, no active recurring expense. */
export function untrackedCoreCategories(
  lines: readonly Line[],
  categories: readonly ExpenseCategoryRow[] | null | undefined,
): string[] {
  const tracked = trackedExpensesByCategory(lines, categoryKeys(categories)).categories;
  return Object.entries(CORE_EXPENSE_CATEGORIES)
    .filter(([key]) => !tracked[key])
    .map(([, label]) => label);
}

export function missingDeductionsLine(input: {
  closedDealsYTD: number;
  lines: readonly Line[];
  categories: readonly ExpenseCategoryRow[] | null | undefined;
}): string | null {
  if (input.closedDealsYTD < MIN_DEALS_FOR_MISSING_DEDUCTIONS) return null;
  const missing = untrackedCoreCategories(input.lines, input.categories);
  if (missing.length === 0) return null;
  return (
    `[MISSING DEDUCTIONS] Agent has ${input.closedDealsYTD} closed deals YTD with $0 recorded in: ${missing.join(", ")} ` +
    `(no receipts this year, no monthly figure and no active recurring expense under these categories). ` +
    `CRA T2125 permits deductions in these categories when substantiated by receipts. ` +
    `State the data neutrally — describe the zero balance, cite T2125 categories, name no amounts.`
  );
}

// ── [DOCUMENTATION] ──────────────────────────────────────────────────────────

export interface ReceiptBackedLines {
  /** Expense lines with an amount this year. */
  withAmount: number;
  /** Of those, the lines with at least one receipt logged this year. */
  withReceipts: number;
  /** Amount comes from the per-item monthly figure alone. */
  fromMonthlyFigure: number;
  /** Amount comes from the Recurring Expenses list, which holds no receipts. */
  fromRecurringList: number;
}

/**
 * An expense line is an expense item, the uncategorized receipts, or one
 * entry of the Recurring Expenses list. An item's amount is its receipts, or
 * its monthly figure where that is larger, so it has a receipt behind it
 * exactly when `receiptByKey` (aggregateReceiptTotals(...).byKey) has an
 * amount for its key.
 */
export function receiptBackedLines(
  lines: readonly Line[],
  receiptByKey: Readonly<Record<string, number>>,
): ReceiptBackedLines {
  const counts: ReceiptBackedLines = { withAmount: 0, withReceipts: 0, fromMonthlyFigure: 0, fromRecurringList: 0 };
  for (const line of lines) {
    if (!(line.rawAmount > 0)) continue;
    counts.withAmount += 1;
    if (line.source === "recurring") counts.fromRecurringList += 1;
    else if (line.source === "uncategorized" || (line.key != null && (receiptByKey[line.key] ?? 0) > 0)) counts.withReceipts += 1;
    else counts.fromMonthlyFigure += 1;
  }
  return counts;
}

export function documentationLine(input: {
  lines: readonly Line[];
  receiptByKey: Readonly<Record<string, number>>;
  /** `receipt_expenses` rows this year. */
  receiptCount: number;
}): string | null {
  const c = receiptBackedLines(input.lines, input.receiptByKey);
  if (c.withAmount === 0) return null;
  const without = c.fromMonthlyFigure + c.fromRecurringList;
  return (
    `[DOCUMENTATION] ${c.withReceipts} of ${c.withAmount} expense lines with an amount this year have at least one receipt logged in Agent Runway ` +
    `(${input.receiptCount} receipts logged YTD). ` +
    (without > 0
      ? `The other ${without}: ${c.fromMonthlyFigure} from a monthly figure typed on an expense item, ${c.fromRecurringList} from the Recurring Expenses list (no receipt is attached to a recurring entry). `
      : "") +
    `CRA T2125 guidance requires receipts to substantiate claims. ` +
    `State the counts neutrally — apply no qualitative label.`
  );
}

// ── [CCA OPPORTUNITY] ────────────────────────────────────────────────────────

/** Year-to-date amount on the hardware item above which the CCA rule is mentioned. */
const HARDWARE_CCA_THRESHOLD = 500;

export function ccaOpportunityLine(lines: readonly Line[]): string | null {
  const hardware = lines.some(
    (l) => l.source === "item" && l.key === "office_hardware" && l.rawAmount > HARDWARE_CCA_THRESHOLD,
  );
  if (!hardware) return null;
  return (
    `[CCA OPPORTUNITY] Agent has hardware/equipment expenses over $${HARDWARE_CCA_THRESHOLD} YTD. ` +
    `CRA T2125 treats larger capital purchases (laptop, camera, signage) as depreciable assets under the Capital Cost Allowance regime ` +
    `(Class 50 for computers/peripherals at 55% declining balance, Class 8 for office equipment at 20%) rather than current-year expenses. ` +
    `State the rule only — do not characterize CCA treatment as more or less advantageous than expensing.`
  );
}

// ── Expense diagnostic: year to date by category ─────────────────────────────

export interface ExpenseCategoryYtd {
  name: string;
  ytd: number;
}

/**
 * The tracked lines by category title, largest first: the Expenses page's
 * category rows. They add up to that page's "YTD Expenses"
 * (`ytdExpenseTotals(...).expensesYTD`, the figure every surface shows).
 */
export function expenseCategoryBreakdown(
  lines: readonly Line[],
  categories: readonly ExpenseCategoryRow[] | null | undefined,
): ExpenseCategoryYtd[] {
  const { categories: byCategory, unfiledYtd } = trackedExpensesByCategory(lines, categoryKeys(categories));
  const titles = new Map((categories ?? []).map((cat) => [cat.key, cat.title || cat.key]));
  const rows = Object.entries(byCategory).map(([key, c]) => ({ name: titles.get(key) ?? key, ytd: c.ytd }));
  if (unfiledYtd > 0) rows.push({ name: "No category", ytd: unfiledYtd });
  return rows.filter((r) => r.ytd > 0).sort((a, b) => b.ytd - a.ytd);
}
