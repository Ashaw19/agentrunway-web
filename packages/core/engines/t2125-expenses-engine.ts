/**
 * T2125 Expenses Engine — what each tracked expense counts for on the T2125.
 *
 * CANONICAL source for (created 2026-10-13):
 *   - the expense entries the T2125 pre-fill is computed from (Reports page),
 *   - the Expenses page's "Est. Tax Deductible YTD" card, its Deductible
 *     column and its year-to-date total,
 *   - YEAR-TO-DATE EXPENSES on every other surface (`ytdExpenseTotals`, at
 *     the foot of this file): dashboard, Reports, Forecast, Overhead,
 *     Altimeter, Scenarios, Flight Crew, the weekly digest and the Connector.
 * They all read the lines `buildT2125Expenses` makes, so they can't disagree.
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
 *      the GST/HST (`itcForExpense`). One that has ended (an `end_date`,
 *      the row left active) keeps the occurrences up to that date and is
 *      expected to cost nothing each month from the day after.
 *
 * A monthly figure on an item and a Recurring Expenses row filed under the
 * same item are two entries the user made, so both count (sources 1 and 3).
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

import {
  aggregateReceiptTotals,
  recurringExpensesNetOfItc,
  recurringNetOfItc,
  remainingYearExpenses,
  type ExpenseTaxContext,
  type ReceiptTotals,
  type ReceiptTotalsRow,
} from "./expense-totals-engine";
import { recurringMonthlyRunRate, recurringYTD, totalRecurringRemaining } from "./recurring-expense-engine";
import {
  HOME_OFFICE_CATEGORY_KEY,
  expenseItemKeyFor,
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
  /**
   * What this line is expected to cost each month from here on: the item's
   * monthly figure, or a recurring expense's monthly equivalent net of ITC.
   * 0 for receipts alone (nothing says they repeat), and 0 for a recurring
   * expense whose end date has passed: its charges to that date stay in
   * `rawAmount` (`recurringMonthlyRunRate`).
   */
  monthlyAmount: number;
}

/** An `expense_items` row, as far as the totals read it. */
export interface ExpenseItemMonthlyFigure {
  key: string;
  /** The legacy per-item monthly figure ("Monthly Recurring" on the Expenses page). */
  monthly_recurring?: number | string | null;
}

export interface T2125ExpensesInput {
  /** `aggregateReceiptTotals(rows, ctx)` for the tax year to date. */
  receiptTotals: Pick<ReceiptTotals, "byKey" | "uncategorized" | "homeOfficeCosts">;
  /** `expense_items` rows: the legacy per-item monthly figure. */
  expenseItems: readonly ExpenseItemMonthlyFigure[] | null | undefined;
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
  /** Expected each month: the sum of the lines' `monthlyAmount`. */
  monthlyTotal: number;
  /** After the limits. Less `byRule.home`, this is the T2125's line 9369. */
  deductibleTotal: number;
  byRule: Record<DeductionRule, number>;
}

/**
 * Months of the legacy per-item monthly figure counted so far this year: the
 * current month included, a whole number from 1 to 12 (never a fraction of
 * a month). The figure has no charge day, so there is no "has this month's
 * happened yet" to check. No later month is ever counted.
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

  const track = (source: TrackedExpenseSource, entry: T2125ExpenseEntry, monthlyAmount: number, recurringId?: string) => {
    const line = t2125ExpenseLine(entry, ctx.vehicleBusinessUsePct);
    const rule = ruleFor(line);
    lines.push({ ...line, source, rule, monthlyAmount, ...(recurringId ? { recurringId } : {}) });
    if (entry.amount > 0 && rule !== "home") entries.push(entry);
  };

  // 1. Per expense key. A home item has no monthly figure to count: home
  //    bills vary and are logged one by one (the Expenses page has no box).
  const months = legacyMonthsElapsed(now);
  const monthlyByKey: Record<string, number> = {};
  for (const item of input.expenseItems ?? []) {
    const monthly = Number(item.monthly_recurring ?? 0);
    if (!item.key || !(monthly > 0) || isHomeOfficeKey(item.key)) continue;
    monthlyByKey[item.key] = (monthlyByKey[item.key] ?? 0) + monthly;
  }
  for (const key of new Set([...Object.keys(receiptTotals.byKey), ...Object.keys(monthlyByKey)])) {
    const monthly = monthlyByKey[key] ?? 0;
    const amount = Math.max(receiptTotals.byKey[key] ?? 0, monthly * months);
    if (amount > 0) track("item", { key, amount }, monthly);
  }

  // 2. Receipts with no category.
  if (receiptTotals.uncategorized > 0) track("uncategorized", { key: null, amount: receiptTotals.uncategorized }, 0);

  // 3. The Recurring Expenses list, occurrences to date.
  for (const re of input.recurringExpenses ?? []) {
    if (!re.is_active) continue;
    const key = re.category_key || null;
    const amounts = recurringNetOfItc(re, ctx);
    const net = { ...re, amount: amounts.net };
    track(
      "recurring",
      { key, amount: recurringYTD(net, now), vehicleUse: Boolean(re.vehicle_pct_applicable) },
      recurringMonthlyRunRate(net, now),
      re.id,
    );
    if (key && amounts.homeCost) {
      const whole = recurringYTD({ ...re, amount: amounts.homeCost }, now);
      if (whole > 0) homeOfficeCosts[key] = round2((homeOfficeCosts[key] ?? 0) + whole);
    }
  }

  const byRule: Record<DeductionRule, number> = { full: 0, meals: 0, vehicle: 0, home: 0 };
  let ytdTotal = 0;
  let monthlyTotal = 0;
  let deductibleTotal = 0;
  for (const line of lines) {
    ytdTotal += line.rawAmount;
    monthlyTotal += line.monthlyAmount;
    deductibleTotal += line.deductibleAmount;
    byRule[line.rule] += line.deductibleAmount;
  }

  return { lines, entries, homeOfficeCosts, ytdTotal, monthlyTotal, deductibleTotal, byRule };
}

// ── Year-to-date expenses: one total for every surface ─────────────────────
//
// `expensesYTD` here is the Expenses page's "YTD Expenses": the sum of the
// lines above. Every surface that shows or uses year-to-date expenses calls
// this with the rows it read; none works the figure out itself.
//
// Until 2026-10-13 the other surfaces had their own rule,
//
//   max(all receipts, all monthly figures × months) + recurring
//
// which compared the two TOTALS and dropped the smaller side whole. A $300
// monthly figure on one item vanished behind $4,000 of receipts on other
// items, so the dashboard and the Reports headline read lower than the
// Expenses page and the T2125 on the same data. The lines above compare per
// item, where the monthly figure and the receipts describe the same spending.
//
// `expense_items.ytd_amount` is NOT an input: nothing in the app has written
// it since receipts replaced it, so it holds 0 or a stale figure.

export interface YtdExpenseInputs {
  /** `receipt_expenses` rows with expense_date on or after Jan 1 (category_key, total_amount, tax_amount). */
  receipts: readonly ReceiptTotalsRow[] | null | undefined;
  /** `recurring_expenses` rows where is_active, AS STORED (GST/HST included), not the net copies. */
  recurring: readonly RecurringExpense[] | null | undefined;
  /** Every `expense_items` row, with its key: the monthly figure counts per item. */
  expenseItems: readonly ExpenseItemMonthlyFigure[] | null | undefined;
  ctx: ExpenseTaxContext;
  /** Calendar anchor for the year and month. Server callers pass atlanticNoon(). */
  now: Date;
}

export interface YtdExpenseTotals {
  /** The receipt totals the lines are built from (per key, ITCs, amount paid). */
  receipts: ReceiptTotals;
  /** The lines the totals are the sums of, with their T2125 treatment. */
  tracked: T2125ExpensesResult;
  /** Year-to-date expenses: `tracked.ytdTotal`. */
  expensesYTD: number;
  /** Receipts this year, net. */
  receiptYTD: number;
  /** Where an item's monthly figure × months is above its receipts, the difference. */
  estimatesAboveReceipts: number;
  /** Active recurring expenses year to date, net. */
  recurringYTD: number;
  /** Sum of the per-item monthly figures that count. */
  legacyMonthlyRecurring: number;
  /** Monthly equivalent of the active recurring expenses that have not ended, net. */
  recurringMonthly: number;
  /** Expected each month, both kinds: `tracked.monthlyTotal`. */
  monthlyRecurring: number;
  /** Active recurring expenses' charges after today, through Dec 31, net. */
  recurringRemaining: number;
  /**
   * Expenses still to come this year (`remainingYearExpenses`): the monthly
   * figures for the whole months after this one, plus `recurringRemaining`.
   * expensesYTD + this = the year's expenses.
   */
  expensesRemaining: number;
}

export function ytdExpenseTotals(inputs: YtdExpenseInputs): YtdExpenseTotals {
  const receipts = aggregateReceiptTotals(inputs.receipts, inputs.ctx);
  const tracked = buildT2125Expenses({
    receiptTotals: receipts,
    expenseItems: inputs.expenseItems,
    recurringExpenses: inputs.recurring,
    ctx: inputs.ctx,
    now: inputs.now,
  });

  let estimatesAboveReceipts = 0;
  let recurringYTDTotal = 0;
  let legacyMonthlyRecurring = 0;
  let recurringMonthly = 0;
  for (const line of tracked.lines) {
    if (line.source === "recurring") {
      recurringYTDTotal += line.rawAmount;
      recurringMonthly += line.monthlyAmount;
    } else if (line.source === "item") {
      estimatesAboveReceipts += Math.max(0, line.rawAmount - Math.max(0, receipts.byKey[line.key ?? ""] ?? 0));
      legacyMonthlyRecurring += line.monthlyAmount;
    }
  }

  // Still to come: the same recurring rows the lines count to date, by the
  // charge dates after today, so each charge of the year is in exactly one.
  const recurringRemaining = totalRecurringRemaining(
    recurringExpensesNetOfItc(inputs.recurring, inputs.ctx),
    inputs.now,
  );

  return {
    receipts,
    tracked,
    expensesYTD: tracked.ytdTotal,
    receiptYTD: receipts.total,
    estimatesAboveReceipts,
    recurringYTD: recurringYTDTotal,
    legacyMonthlyRecurring,
    recurringMonthly,
    monthlyRecurring: tracked.monthlyTotal,
    recurringRemaining,
    expensesRemaining: remainingYearExpenses(legacyMonthlyRecurring, recurringRemaining, inputs.now),
  };
}

/**
 * The same total with the GST/HST left in: what it would read for someone
 * who is not registered. Context only, so Flight Crew can say how much of a
 * registrant's expenses is GST/HST claimed back. Never a figure to show as
 * "expenses".
 */
export function ytdExpensesGstHstIncluded(inputs: YtdExpenseInputs): number {
  return ytdExpenseTotals({ ...inputs, ctx: { ...inputs.ctx, gstHstRegistered: false } }).expensesYTD;
}

// ── Tracked expenses by category ─────────────────────────────────────────────
//
// "Has this agent recorded anything under Marketing?" is asked by the tax
// cards (Commonly Missed Deductions), by Flight Crew's tax context and by the
// expense diagnostics. Until 2026-10-13 each of them answered it from
// `expense_items.ytd_amount`, a column nothing has written since receipts
// replaced it, so an agent with a year of fuel receipts read as having no
// vehicle expenses. The answer is in the lines above: receipts, the per-item
// monthly figure and the Recurring Expenses list.

/** An `expense_categories` row with the keys of its `expense_items`. */
export interface ExpenseCategoryKeys {
  key: string;
  items?: readonly { key: string }[] | null;
}

/**
 * The seeded categories (`seed_default_expenses`) and the prefix their item
 * keys carry. Used only for a key the agent has no item row for: an older
 * account can hold a recurring expense under `vehicle_payment` without that
 * item, and it is still a vehicle cost.
 */
const STANDARD_KEY_PREFIXES: readonly (readonly [prefix: string, categoryKey: string])[] = [
  ["vehicle_", "vehicle"],
  ["marketing_", "marketing"],
  ["office_", "office_tech"],
  ["prof_", "professional"],
  ["edu_", "education"],
  ["meals_", "meals"],
  ["ent_", "entertainment"],
  ["other_", "other"],
  ["payroll_", "payroll"],
  ["corp_", "corp_admin"],
  ["home_", HOME_OFFICE_CATEGORY_KEY],
];

function standardCategoryKey(key: string): string | null {
  for (const [prefix, categoryKey] of STANDARD_KEY_PREFIXES) {
    if (key === categoryKey || key.startsWith(prefix)) return categoryKey;
  }
  return null;
}

/**
 * Which category an expense key sits under, for one agent's categories:
 *   1. the category of the agent's own item with that key (so a custom item
 *      counts for the category it was added to);
 *   2. the key itself, when it is one of the agent's categories;
 *   3. for a category-level key from before 2026-10-13, the category of the
 *      item it stands for (`expenseItemKeyFor`, the T2125's own reading);
 *   4. the seeded category a standard key belongs to.
 * null: no key (a receipt saved with no category), or a key none of these
 * recognize.
 */
export function expenseCategoryResolver(
  categories: readonly ExpenseCategoryKeys[] | null | undefined,
): (key: string | null | undefined) => string | null {
  const categoryKeys = new Set<string>();
  const categoryByItem = new Map<string, string>();
  for (const cat of categories ?? []) {
    categoryKeys.add(cat.key);
    for (const item of cat.items ?? []) {
      if (item.key && !categoryByItem.has(item.key)) categoryByItem.set(item.key, cat.key);
    }
  }
  return (key) => {
    if (!key) return null;
    const own = categoryByItem.get(key);
    if (own) return own;
    if (categoryKeys.has(key)) return key;
    const itemKey = expenseItemKeyFor(key);
    return categoryByItem.get(itemKey) ?? standardCategoryKey(itemKey);
  };
}

type TrackedLine = Pick<TrackedExpenseLine, "key" | "rawAmount" | "source">;

/**
 * A line the agent is tracking: it has an amount this year, or it is an
 * active recurring expense. The second matters before the first occurrence
 * of the year: board dues set up to renew in November are $0 in June and are
 * still an expense the agent tracks.
 */
export function isTrackedLine(line: TrackedLine): boolean {
  return line.rawAmount > 0 || line.source === "recurring";
}

export interface TrackedCategory {
  /** Year to date: the category's lines added up. */
  ytd: number;
  /** The expense keys tracked under it. */
  keys: string[];
}

export interface TrackedExpensesByCategory {
  /** By `expense_categories.key`. A category with nothing tracked is absent. */
  categories: Record<string, TrackedCategory>;
  /** Year to date of the tracked lines no category claims. */
  unfiledYtd: number;
}

/**
 * `buildT2125Expenses(...).lines` arranged by expense category. The amounts
 * add up to the builder's `ytdTotal`.
 */
export function trackedExpensesByCategory(
  lines: readonly TrackedLine[],
  categories: readonly ExpenseCategoryKeys[] | null | undefined,
): TrackedExpensesByCategory {
  const categoryOf = expenseCategoryResolver(categories);
  const byCategory: Record<string, TrackedCategory> = {};
  let unfiledYtd = 0;
  for (const line of lines) {
    if (!isTrackedLine(line)) continue;
    const categoryKey = categoryOf(line.key);
    if (!categoryKey) {
      unfiledYtd += line.rawAmount;
      continue;
    }
    if (!byCategory[categoryKey]) byCategory[categoryKey] = { ytd: 0, keys: [] };
    const category = byCategory[categoryKey];
    category.ytd += line.rawAmount;
    if (line.key && !category.keys.includes(line.key)) category.keys.push(line.key);
  }
  for (const category of Object.values(byCategory)) category.ytd = round2(category.ytd);
  return { categories: byCategory, unfiledYtd: round2(unfiledYtd) };
}
