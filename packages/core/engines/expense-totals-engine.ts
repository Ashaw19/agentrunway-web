/**
 * Expense Totals Engine — what an expense counts for once the GST/HST a
 * registrant gets back is taken out.
 *
 * CANONICAL source for every expense TOTAL in the app (Expenses KPI and
 * "Est. Tax Deductible", expense ratio, T2125 lines, income-tax estimate,
 * overhead, forecast, cash position, Flight Crew context, weekly digest,
 * mobile). Created 2026-10-13.
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
 * GST/HST not recorded (`tax_amount` null or 0): no ITC is claimed for that
 * expense anywhere in the app, so nothing comes off. Tax is never inferred
 * from a rate: insurance, most dues and out-of-province purchases would be
 * wrong.
 */

import { itcForExpense } from "./gst34-engine";
import type { RecurringExpense } from "../types/database";

// ── Who claims ITCs ────────────────────────────────────────────────────────

export interface ExpenseTaxContext {
  /** user_settings.gst_hst_registered. Only a registrant claims ITCs. */
  gstHstRegistered: boolean;
  /** user_settings.vehicle_business_use_pct, 0–1. */
  vehicleBusinessUsePct: number;
}

/** The column default (migration 00015), for a settings row that isn't loaded. */
export const DEFAULT_VEHICLE_BUSINESS_USE_PCT = 0.8;

/** Build the context from a user_settings row (or the slice a query selected). */
export function expenseTaxContext(
  settings:
    | {
        gst_hst_registered?: boolean | null;
        vehicle_business_use_pct?: number | string | null;
      }
    | null
    | undefined,
): ExpenseTaxContext {
  const raw = settings?.vehicle_business_use_pct;
  const pct = raw == null || raw === "" ? DEFAULT_VEHICLE_BUSINESS_USE_PCT : Number(raw);
  return {
    gstHstRegistered: settings?.gst_hst_registered === true,
    vehicleBusinessUsePct: Number.isFinite(pct)
      ? Math.min(1, Math.max(0, pct))
      : DEFAULT_VEHICLE_BUSINESS_USE_PCT,
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
   */
  net: number;
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
  if (!ctx.gstHstRegistered || paid <= 0) return { paid, itc: 0, net: paid };

  // GST/HST can't be more than the amount it is part of.
  const tax = Math.min(Math.max(0, toNumber(taxAmount)), paid);
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
    } else {
      uncategorized += amounts.net;
    }
  }

  uncategorized = round2(uncategorized);
  const total = round2(
    Object.values(byKey).reduce((s, v) => s + v, 0) + uncategorized,
  );

  return { byKey, uncategorized, total, paid: round2(paid), itc: round2(itc) };
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
