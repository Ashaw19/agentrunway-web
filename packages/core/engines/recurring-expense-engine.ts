/**
 * Recurring Expense Engine
 *
 * Shared computation for recurring expenses across analytics pages.
 * Centralizes monthly-equivalent and YTD calculations so Dashboard,
 * Forecast, Reports, Overhead, Chat API, and Scenarios all agree.
 *
 * Every count of charges (year to date, the GST/HST on them, the rest of
 * the year) goes through `recurringOccurrencesInRange`. Don't count months
 * anywhere else.
 */

import type { RecurringExpense } from "../types/database";
import { localISODate } from "../lib/local-date";

// ── Monthly equivalent ────────────────────────────────────────────────────

/** Convert any-frequency recurring expense to its monthly equivalent */
export function recurringMonthlyEquivalent(re: RecurringExpense): number {
  const freq = re.frequency ?? "monthly";
  const amt = Number(re.amount);
  return freq === "monthly" ? amt : freq === "quarterly" ? amt / 3 : amt / 12;
}

/** Total monthly equivalent across all active recurring expenses */
export function totalRecurringMonthly(expenses: RecurringExpense[]): number {
  return expenses
    .filter((re) => re.is_active)
    .reduce((sum, re) => sum + recurringMonthlyEquivalent(re), 0);
}

// ── How many times has it been charged ────────────────────────────────────
//
// THE rule, for every figure built on a recurring expense (expenses to date,
// the ITCs on them, what is still to come this year):
//
//   a charge counts on its charge day (`day_of_month`, in the month or months
//   its frequency names), on or after `start_date`, and on or before
//   `end_date` when there is one.
//
// So a charge due on the 20th is not an expense on the 13th, and an expense
// that has ended keeps the charges it made and adds no more. Until
// 2026-10-13 the expense totals counted a monthly expense by calendar month
// from the 1st and never read `end_date`, while the ITCs counted charge days:
// on the days before a charge, a registrant's expenses had one more charge in
// them than the ITCs taken off them.
//
// `is_active` is not part of the rule. A row that is switched off (removed in
// the Expenses page) counts nowhere, for no part of the year; the totals
// below skip it.

/** The day of the month it is charged on. The column allows 1 to 28. */
function chargeDay(re: RecurringExpense): number {
  return Math.min(28, Math.max(1, Number(re.day_of_month) || 1));
}

/**
 * How many times a recurring expense is charged within [start, end],
 * inclusive of both days.
 */
export function recurringOccurrencesInRange(re: RecurringExpense, start: Date, end: Date): number {
  const reStart = re.start_date ? new Date(re.start_date + "T00:00:00") : null;
  const reEnd   = re.end_date   ? new Date(re.end_date   + "T23:59:59") : null;
  const lo = reStart && reStart > start ? reStart : start;
  const hi = reEnd   && reEnd   < end   ? reEnd   : end;
  if (lo > hi) return 0;

  const freq = re.frequency ?? "monthly";
  const day = chargeDay(re);
  let count = 0;

  if (freq === "annual") {
    const m = (re.month_of_year ?? 1) - 1;
    for (let yr = lo.getFullYear(); yr <= hi.getFullYear(); yr++) {
      const d = new Date(yr, m, day);
      if (d >= lo && d <= hi) count++;
    }
  } else if (freq === "quarterly") {
    // `month_of_year` is the month of one of the four charges; the others
    // are every third month from it, in each calendar year.
    const startM = (re.month_of_year ?? 1) - 1;
    for (let yr = lo.getFullYear(); yr <= hi.getFullYear(); yr++) {
      for (let q = 0; q < 4; q++) {
        const m = (startM + q * 3) % 12;
        const d = new Date(yr, m, day);
        if (d >= lo && d <= hi) count++;
      }
    }
  } else {
    // Monthly — iterate month by month through the range
    const cursor = new Date(lo.getFullYear(), lo.getMonth(), 1);
    while (cursor <= hi) {
      const d = new Date(cursor.getFullYear(), cursor.getMonth(), day);
      if (d >= lo && d <= hi) count++;
      cursor.setMonth(cursor.getMonth() + 1);
    }
  }

  return count;
}

// ── YTD calculation ───────────────────────────────────────────────────────
//
// `now` is the calendar anchor: the year to total and the day to total up
// to. Browser callers take the default; server callers pass atlanticNoon()
// (the server's own clock is UTC, already next year from 8 pm Atlantic on
// Dec 31, which totals one month of a monthly expense instead of twelve).

/** YTD amount for a single recurring expense: its charges from Jan 1 to `now`. */
export function recurringYTD(re: RecurringExpense, now: Date = new Date()): number {
  const yearStart = new Date(now.getFullYear(), 0, 1);
  return recurringOccurrencesInRange(re, yearStart, now) * Number(re.amount);
}

/** Total YTD across all active recurring expenses */
export function totalRecurringYTD(
  expenses: RecurringExpense[],
  now: Date = new Date(),
): number {
  return expenses
    .filter((re) => re.is_active)
    .reduce((sum, re) => sum + recurringYTD(re, now), 0);
}

// ── The rest of the year ──────────────────────────────────────────────────

/**
 * What a single recurring expense is still to be charged this calendar year
 * after `now`: the year's charges less those made to date, so that
 * recurringYTD + this is always the whole year.
 */
export function recurringRemainingThisYear(re: RecurringExpense, now: Date = new Date()): number {
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const yearEnd = new Date(now.getFullYear(), 11, 31, 23, 59, 59);
  const wholeYear = recurringOccurrencesInRange(re, yearStart, yearEnd);
  const toDate = recurringOccurrencesInRange(re, yearStart, now);
  return (wholeYear - toDate) * Number(re.amount);
}

/**
 * Still to be charged this calendar year across all active recurring
 * expenses. An annual expense projection adds this to the year to date: a
 * monthly amount × months left is one charge short on the days before each
 * charge day, and spreads an annual fee over months it is not charged in.
 */
export function totalRecurringRemainingThisYear(
  expenses: RecurringExpense[],
  now: Date = new Date(),
): number {
  return expenses
    .filter((re) => re.is_active)
    .reduce((sum, re) => sum + recurringRemainingThisYear(re, now), 0);
}

/** Project annual total: charges to date + charges still scheduled this year */
export function projectedAnnualRecurring(
  expenses: RecurringExpense[],
  now: Date = new Date(),
): number {
  return totalRecurringYTD(expenses, now) + totalRecurringRemainingThisYear(expenses, now);
}

// ── HST / ITC helpers ────────────────────────────────────────────────────
//
// The same charges as the totals above (recurringOccurrencesInRange), so the
// GST/HST taken off an expense total is the GST/HST claimed as an ITC.

/**
 * Total HST from active recurring expenses with occurrences in [startDate, endDate].
 * Use this to include recurring-expense ITCs in a GST34 or chat-route ITC calculation.
 */
export function totalRecurringHSTForPeriod(
  expenses: RecurringExpense[],
  startDate: string, // YYYY-MM-DD
  endDate: string,   // YYYY-MM-DD
): number {
  const start = new Date(startDate + "T00:00:00");
  const end   = new Date(endDate   + "T23:59:59");
  return expenses
    .filter((re) => re.is_active && Number(re.hst_amount) > 0)
    .reduce((sum, re) => sum + recurringOccurrencesInRange(re, start, end) * Number(re.hst_amount), 0);
}

/**
 * HST on active recurring expenses in [startDate, endDate], one entry per
 * expense, with its category and vehicle flag. The GST34 pre-fill needs them
 * separately: a lease payment's HST is limited to the business-use share and
 * a meal's to 50%, which a single total can't express.
 */
export function recurringHSTEntriesForPeriod(
  expenses: RecurringExpense[],
  startDate: string, // YYYY-MM-DD
  endDate: string,   // YYYY-MM-DD
): { category_key: string | null; tax_amount: number; vehicle_use: boolean }[] {
  const start = new Date(startDate + "T00:00:00");
  const end   = new Date(endDate   + "T23:59:59");
  return expenses
    .filter((re) => re.is_active && Number(re.hst_amount) > 0)
    .map((re) => ({
      category_key: re.category_key ?? null,
      tax_amount:   recurringOccurrencesInRange(re, start, end) * Number(re.hst_amount),
      vehicle_use:  Boolean(re.vehicle_pct_applicable),
    }))
    .filter((e) => e.tax_amount > 0);
}

/** Total YTD HST on active recurring expenses (mirrors totalRecurringYTD). */
export function totalRecurringHSTYTD(
  expenses: RecurringExpense[],
  now: Date = new Date(),
): number {
  return totalRecurringHSTForPeriod(
    expenses,
    `${now.getFullYear()}-01-01`,
    localISODate(now),
  );
}

/** Monthly total from recurring expenses for a specific category key */
export function recurringMonthlyForCategory(
  expenses: RecurringExpense[],
  categoryKey: string,
): number {
  return expenses
    .filter((re) => re.is_active && re.category_key === categoryKey)
    .reduce((sum, re) => sum + recurringMonthlyEquivalent(re), 0);
}
