/**
 * Expense Totals Engine — what an expense counts for once the GST/HST a
 * registrant gets back is taken out.
 *
 * CANONICAL source for every expense TOTAL in the app (Expenses KPI and
 * "Est. Tax Deductible", expense ratio, T2125 lines, income-tax estimate,
 * overhead, forecast, cash position, Flight Crew context, weekly digest,
 * mobile, and the MCP server through its Deno copy). Created 2026-10-13.
 *
 * `receipt_expenses.total_amount` and `recurring_expenses.amount` are what
 * was PAID, GST/HST included. Until this engine every surface summed those
 * directly. A GST/HST registrant claims that tax back as an input tax credit
 * (ITC) on the GST34, so it was counted twice: once as an ITC and again as
 * a business expense. In a 15% HST province that is $15 of every $115.
 *
 * CRA's rule (information only, not advice):
 *   - Deductible expenses include the GST/HST incurred on them, less any
 *     ITC claimed. A registrant who claims the ITC reduces the expense by
 *     it; someone who is not registered claims no ITC, so the full amount
 *     paid stays the expense.
 *       T4002 ch. 3: canada.ca/en/revenue-agency/services/forms-publications/publications/t4002/t4002-5.html
 *       Business expenses: canada.ca/en/revenue-agency/services/tax/businesses/topics/sole-proprietorships-partnerships/business-expenses.html
 *   - How much of the GST/HST is an ITC (50% on meals and entertainment; the
 *     business-use share on vehicle costs) is `itcForExpense` in
 *     gst34-engine. This engine never re-derives it, so the amount taken
 *     off the expenses is the amount the GST34 pre-fill claims.
 *       canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/calculate-prepare-report/input-tax-credit/calculate-eligibility-percentage.html
 *
 * The GST/HST on one expense ends up in one of three places:
 *   1. Claimed as an ITC                 → out of the expense.
 *   2. Not claimable, business cost      → stays in the expense. This is the
 *      disallowed half on meals (so the T2125 50% limit then applies to the
 *      amount less the ITC), and all of it when vehicle business use is 10%
 *      or less (no ITC at all).
 *   3. Not claimable, personal           → out of the expense. This is the
 *      personal-use share of vehicle GST/HST: the T2125 business-use share
 *      is then applied to the cost before tax, which is the business part
 *      of the cost less the ITC claimed on it.
 *
 * HOME BILLS (the Home Office expense category, added 2026-10-13) are the
 * one kind of expense that is not mostly a business cost. A power bill or a
 * mortgage interest statement is a household bill, and only the workspace
 * share of it (user_settings.home_office_business_use_pct) belongs to the
 * business. So for a home bill `net` is that share alone, and every total
 * built on this engine counts it that way: a $300 heating bill at 15% is $45
 * of expenses, not $300. The whole bill is kept in `homeCost` for the T2125
 * business-use-of-home section, which shows the costs and then the share.
 * This is deliberately different from vehicle costs, which stay whole in the
 * totals and take their business-use share only in the deductible figures.
 *
 * GST/HST not recorded (`tax_amount` null or 0): no ITC is claimed for that
 * expense anywhere in the app, so nothing comes off. Tax is never inferred
 * from a rate: insurance, most dues and out-of-province purchases would be
 * wrong.
 */

import { itcForExpense } from "./gst34-engine";
import {
  recurringHSTEntriesForPeriod,
  totalRecurringMonthly,
  totalRecurringYTD,
} from "./recurring-expense-engine";
import { isHomeOfficeKey } from "./t2125-engine";
import type { RecurringExpense } from "../types/database";

// ── Who claims ITCs ────────────────────────────────────────────────────────

export interface ExpenseTaxContext {
  /** user_settings.gst_hst_registered. Only a registrant claims ITCs. */
  gstHstRegistered: boolean;
  /** user_settings.vehicle_business_use_pct, 0–1. */
  vehicleBusinessUsePct: number;
  /**
   * user_settings.home_office_business_use_pct, 0–1: the share of a home
   * bill that is a business cost. 0 (the column default) means home bills
   * count for nothing until the workspace share is set.
   */
  homeOfficeBusinessUsePct: number;
}

/** The column default (migration 00015), for a settings row that isn't loaded. */
export const DEFAULT_VEHICLE_BUSINESS_USE_PCT = 0.8;

/** Build the context from a user_settings row (or the slice a query selected). */
export function expenseTaxContext(
  settings:
    | {
        gst_hst_registered?: boolean | null;
        vehicle_business_use_pct?: number | string | null;
        /** Required key: a typed slice that didn't select it won't compile. */
        home_office_business_use_pct: number | string | null | undefined;
      }
    | null
    | undefined,
): ExpenseTaxContext {
  const raw = settings?.vehicle_business_use_pct;
  const pct = raw == null || raw === "" ? DEFAULT_VEHICLE_BUSINESS_USE_PCT : Number(raw);
  // Column default is 0 (migration 00001). A query that selects a slice of
  // user_settings has to include home_office_business_use_pct, or home bills
  // drop out of that surface's totals while the others count them.
  const home = Number(settings?.home_office_business_use_pct ?? 0);
  return {
    gstHstRegistered: settings?.gst_hst_registered === true,
    vehicleBusinessUsePct: Number.isFinite(pct)
      ? Math.min(1, Math.max(0, pct))
      : DEFAULT_VEHICLE_BUSINESS_USE_PCT,
    homeOfficeBusinessUsePct: Number.isFinite(home) ? Math.min(1, Math.max(0, home)) : 0,
  };
}

// ── One expense ────────────────────────────────────────────────────────────

export interface ExpenseAmounts {
  /** What was paid, GST/HST included. */
  paid: number;
  /** GST/HST on it claimed as an ITC (what the GST34 pre-fill claims). 0 if not registered. */
  itc: number;
  /**
   * The expense: paid, less the GST/HST that is claimed back or is personal.
   * The T2125 limits (50% meals, vehicle business use) apply to THIS amount.
   * For a home bill it is the workspace share only (see the header).
   */
  net: number;
  /**
   * Home bills only: the whole bill before the workspace share, less any
   * GST/HST that is claimed back or is personal. `net` = homeCost × the
   * share. Absent for every other expense.
   */
  homeCost?: number;
}

type Numeric = number | string | null | undefined;

const toNumber = (v: Numeric): number => {
  if (v == null || v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * One expense, net of the ITC a registrant claims on it.
 *
 * @param vehicleUse a recurring expense flagged `vehicle_pct_applicable`
 *                   (its category key may not say it is a vehicle cost).
 */
export function expenseNetOfItc(
  totalAmount: Numeric,
  taxAmount: Numeric,
  categoryKey: string | null | undefined,
  ctx: ExpenseTaxContext,
  vehicleUse = false,
): ExpenseAmounts {
  const paid = toNumber(totalAmount);
  // GST/HST can't be more than the amount it is part of.
  const tax = ctx.gstHstRegistered && paid > 0
    ? Math.min(Math.max(0, toNumber(taxAmount)), paid)
    : 0;

  if (isHomeOfficeKey(categoryKey)) {
    const share = Math.min(1, Math.max(0, ctx.homeOfficeBusinessUsePct || 0));
    const itc = tax > 0
      ? Math.max(0, itcForExpense(tax, categoryKey, ctx.vehicleBusinessUsePct, false, share).claimable)
      : 0;
    // With an ITC, the rest of the bill's GST/HST is personal use, so the
    // cost the share applies to is the bill before tax. With none (not
    // registered, no tax recorded, or 10% business use or less) the tax is
    // part of the cost.
    const homeCost = itc > 0 ? paid - tax : paid;
    return { paid, itc, net: homeCost * share, homeCost };
  }

  if (tax === 0) return { paid, itc: 0, net: paid };

  const split = itcForExpense(tax, categoryKey, ctx.vehicleBusinessUsePct, vehicleUse);
  const itc = Math.max(0, split.claimable);
  // With an ITC on a vehicle cost, the rest of its GST/HST is personal use.
  // With none (10% business use or less) it all stays in the expense.
  const personalTax = itc > 0 ? split.vehicleReduction : 0;
  return { paid, itc, net: paid - itc - personalTax };
}

// ── Receipts ───────────────────────────────────────────────────────────────
//
// `receipt_expenses.category_key` is NULLABLE and every write path can leave
// it null (web capture dialog, mobile save screen, mobile scan route). A
// per-key map is therefore NOT the total: surfaces that key receipts by
// expense item (Expenses rows, T2125 line allocation) need the map, but any
// total they show has to add the uncategorized remainder back (#270).

export interface ReceiptTotalsRow {
  category_key?: string | null;
  total_amount?: Numeric;
  tax_amount?: Numeric;
}

export interface ReceiptTotals {
  /** Net per `category_key`. Excludes rows with no category. */
  byKey: Record<string, number>;
  /** Net of rows with a null/empty `category_key`. */
  uncategorized: number;
  /** Every row, net. This is the dashboard's `receiptYTD`. */
  total: number;
  /** Every row as paid, GST/HST included. */
  paid: number;
  /** ITCs on every row. */
  itc: number;
  /**
   * Home bills by key: the whole bill before the workspace share
   * (`ExpenseAmounts.homeCost`). `byKey` and `total` carry home bills at the
   * share; this is what the T2125 business-use-of-home section starts from.
   */
  homeOfficeCosts: Record<string, number>;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Totals for a set of `receipt_expenses` rows. Select `category_key,
 * total_amount, tax_amount`: without `tax_amount` a registrant's totals come
 * back with the GST/HST still in them.
 */
export function aggregateReceiptTotals(
  rows: readonly ReceiptTotalsRow[] | null | undefined,
  ctx: ExpenseTaxContext,
): ReceiptTotals {
  const byKey: Record<string, number> = {};
  const homeOfficeCosts: Record<string, number> = {};
  let uncategorized = 0;
  let paid = 0;
  let itc = 0;

  for (const r of rows ?? []) {
    if (r.total_amount == null) continue;
    if (!Number.isFinite(Number(r.total_amount))) continue;
    const amounts = expenseNetOfItc(r.total_amount, r.tax_amount, r.category_key, ctx);
    paid += amounts.paid;
    itc += amounts.itc;
    if (r.category_key) {
      byKey[r.category_key] = round2((byKey[r.category_key] ?? 0) + amounts.net);
      if (amounts.homeCost) {
        homeOfficeCosts[r.category_key] = round2((homeOfficeCosts[r.category_key] ?? 0) + amounts.homeCost);
      }
    } else {
      uncategorized += amounts.net;
    }
  }

  uncategorized = round2(uncategorized);
  const total = round2(
    Object.values(byKey).reduce((s, v) => s + v, 0) + uncategorized,
  );

  return { byKey, uncategorized, total, paid: round2(paid), itc: round2(itc), homeOfficeCosts };
}

// ── Recurring expenses ─────────────────────────────────────────────────────
//
// `amount` is what is charged each time; `hst_amount` is the GST/HST inside
// it (0 when `hst_included` is off). The GST34 pre-fill claims `hst_amount`
// (recurringHSTEntriesForPeriod), so that is what comes off here.

/** One occurrence of a recurring expense, net of ITC. */
export function recurringNetOfItc(
  re: Pick<RecurringExpense, "amount" | "hst_amount" | "category_key" | "vehicle_pct_applicable">,
  ctx: ExpenseTaxContext,
): ExpenseAmounts {
  return expenseNetOfItc(re.amount, re.hst_amount, re.category_key, ctx, Boolean(re.vehicle_pct_applicable));
}

/**
 * Copies of the recurring expenses with `amount` net of ITC, to pass to the
 * recurring-expense-engine totals (totalRecurringMonthly, totalRecurringYTD,
 * projectedAnnualRecurring). FOR TOTALS ONLY: a list that shows the user
 * what they entered, and anything that reads `hst_amount` for ITCs, takes
 * the original rows.
 */
export function recurringExpensesNetOfItc<T extends RecurringExpense>(
  expenses: readonly T[] | null | undefined,
  ctx: ExpenseTaxContext,
): T[] {
  return (expenses ?? []).map((re) => ({ ...re, amount: recurringNetOfItc(re, ctx).net }));
}

// ── Year to date, across the three places an expense is recorded ───────────
//
// The dashboard's total (dashboard/page.tsx + dashboard-content.tsx), as one
// call for a server surface that can't render the dashboard (the MCP server):
//
//   receipts          `receipt_expenses` dated this calendar year, net.
//   recurring         active `recurring_expenses`, net, year to date.
//                     (Net as above: a home bill at the workspace share.)
//   legacy estimate   `expense_items.monthly_recurring` × months elapsed: the
//                     older "monthly amount per line" entry. It stands in for
//                     the receipts only when it is the larger of the two, so
//                     a cost typed there and also captured as receipts is
//                     counted once.
//
//   expensesYTD = max(receipts, legacy estimate) + recurring
//
// `expense_items.ytd_amount` is NOT an input: nothing in the app has written
// it since receipts replaced it, so it holds 0 or a stale figure.

export interface YtdExpenseInputs {
  /** `receipt_expenses` rows with expense_date on or after Jan 1 (category_key, total_amount, tax_amount). */
  receipts: readonly ReceiptTotalsRow[] | null | undefined;
  /** `recurring_expenses` rows where is_active, as stored (GST/HST included). */
  recurring: readonly RecurringExpense[] | null | undefined;
  /** `expense_items` rows; only monthly_recurring is read. */
  legacyItems: readonly { monthly_recurring?: Numeric }[] | null | undefined;
  ctx: ExpenseTaxContext;
  /** Calendar anchor for the year and month. Server callers pass atlanticNoon(). */
  now: Date;
}

export interface YtdExpenseTotals {
  /** The receipt totals the figures below are built from (per key, ITCs, amount paid). */
  receipts: ReceiptTotals;
  /** Receipts this year, net. */
  receiptYTD: number;
  /** Sum of `expense_items.monthly_recurring`. */
  legacyMonthlyRecurring: number;
  /** legacyMonthlyRecurring × months elapsed (1 to 12). */
  legacyRecurringYTDEstimate: number;
  /** Monthly equivalent of the active recurring expenses, net. */
  recurringMonthly: number;
  /** Active recurring expenses year to date, net. */
  recurringYTD: number;
  /** Legacy + recurring per month: the dashboard's `monthlyRecurring`. */
  monthlyRecurring: number;
  /** The dashboard's `expensesYTD`. */
  expensesYTD: number;
}

export function ytdExpenseTotals(inputs: YtdExpenseInputs): YtdExpenseTotals {
  const { ctx, now } = inputs;

  const receipts = aggregateReceiptTotals(inputs.receipts, ctx);
  const receiptYTD = receipts.total;

  const recurringNet = recurringExpensesNetOfItc(inputs.recurring, ctx);
  const recurringMonthly = totalRecurringMonthly(recurringNet);
  const recurringYTD = totalRecurringYTD(recurringNet, now);

  const legacyMonthlyRecurring = (inputs.legacyItems ?? []).reduce(
    (sum, item) => sum + toNumber(item.monthly_recurring),
    0,
  );
  // Whole months, 1 to 12: the dashboard's `expMonthsElapsed`. A fractional
  // month here once made Flight Crew's expenses differ from the dashboard's.
  const monthsElapsed = now.getMonth() + 1;
  const legacyRecurringYTDEstimate = legacyMonthlyRecurring * monthsElapsed;

  return {
    receipts,
    receiptYTD,
    legacyMonthlyRecurring,
    legacyRecurringYTDEstimate,
    recurringMonthly,
    recurringYTD,
    monthlyRecurring: legacyMonthlyRecurring + recurringMonthly,
    expensesYTD: Math.max(receiptYTD, legacyRecurringYTDEstimate) + recurringYTD,
  };
}

// ── Input tax credits for a period ─────────────────────────────────────────

export interface PeriodInputTaxCredits {
  /** ITCs on the receipts passed in. */
  receipts: number;
  /** ITCs on recurring expenses charged in the period. */
  recurring: number;
  total: number;
}

/**
 * The ITCs a registrant claims for a period: GST34 line 108 for the same
 * receipts and recurring expenses (the same `itcForExpense` limits: 50% on
 * meals, the business-use share on vehicle costs and on home bills; and
 * `recurringHSTEntriesForPeriod` for what was charged in the period).
 * Someone who is not registered claims none.
 *
 * @param receipts  `receipt_expenses` rows already limited to the period.
 * @param recurring `recurring_expenses` rows as stored: `hst_amount` is read,
 *                  so never pass the net copies.
 */
export function inputTaxCreditsForPeriod(
  receipts: readonly ReceiptTotalsRow[] | null | undefined,
  recurring: readonly RecurringExpense[] | null | undefined,
  ctx: ExpenseTaxContext,
  startDate: string, // YYYY-MM-DD
  endDate: string,   // YYYY-MM-DD
): PeriodInputTaxCredits {
  if (!ctx.gstHstRegistered) return { receipts: 0, recurring: 0, total: 0 };

  const vehicleUse = ctx.vehicleBusinessUsePct;
  const homeUse = ctx.homeOfficeBusinessUsePct;
  const onReceipts = (receipts ?? []).reduce(
    (sum, r) =>
      sum + itcForExpense(toNumber(r.tax_amount), r.category_key, vehicleUse, false, homeUse).claimable,
    0,
  );
  const onRecurring = recurringHSTEntriesForPeriod([...(recurring ?? [])], startDate, endDate).reduce(
    (sum, e) =>
      sum + itcForExpense(e.tax_amount, e.category_key, vehicleUse, e.vehicle_use, homeUse).claimable,
    0,
  );

  return {
    receipts: round2(onReceipts),
    recurring: round2(onRecurring),
    total: round2(onReceipts + onRecurring),
  };
}
