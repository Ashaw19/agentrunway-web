/**
 * Recurring Expense Engine
 *
 * Shared computation for recurring expenses across analytics pages.
 * Centralizes monthly-equivalent and YTD calculations so Dashboard,
 * Forecast, Reports, Overhead, Chat API, and Scenarios all agree.
 */

import type { RecurringExpense } from "../types/database";
import { localISODate } from "../lib/local-date";

// ── Monthly equivalent ────────────────────────────────────────────────────

/**
 * Convert any-frequency recurring expense to its monthly equivalent. A plain
 * conversion of one charge, with no date: what the row adds to the monthly
 * run-rate today is `recurringMonthlyRunRate`.
 */
export function recurringMonthlyEquivalent(re: RecurringExpense): number {
  const freq = re.frequency ?? "monthly";
  const amt = Number(re.amount);
  return freq === "monthly" ? amt : freq === "quarterly" ? amt / 3 : amt / 12;
}

// ── Monthly run-rate ──────────────────────────────────────────────────────
//
// The run-rate is what the Recurring Expenses list is expected to cost each
// month from here on: "Monthly Recurring", survival burn, next year's plan.
// Unlike the dated totals below it is not a count of charge dates, so it
// needs its own rule for a row with an end date.
//
// An expense that really ended is kept active with an `end_date`: the
// charges up to that date stay in the year to date, the T2125 lines and the
// ITCs (`occurrencesInRange`). It leaves the run-rate the day after its end
// date. On the end date itself it still counts, as that day's charge does.
//
// A row whose `start_date` is still ahead counts in the run-rate. The
// figures it feeds look forward, and a cost already scheduled is part of
// what lies ahead. (Its year to date is $0 until its first charge date.)
//
// `now` is the calendar anchor, as for the dated totals: browser callers
// take the default, server callers pass atlanticNoon().

/** Has this expense's end date passed, as of `now`'s day? False with no end date. */
export function recurringHasEnded(
  re: Pick<RecurringExpense, "end_date">,
  now: Date = new Date(),
): boolean {
  return re.end_date ? re.end_date < localISODate(now) : false;
}

/**
 * What one recurring expense adds to the monthly run-rate on `now`'s day:
 * its monthly equivalent, or 0 when it is inactive or its end date has passed.
 */
export function recurringMonthlyRunRate(re: RecurringExpense, now: Date = new Date()): number {
  if (!re.is_active || recurringHasEnded(re, now)) return 0;
  return recurringMonthlyEquivalent(re);
}

/** Monthly run-rate across the recurring expenses that have not ended */
export function totalRecurringMonthly(
  expenses: RecurringExpense[],
  now: Date = new Date(),
): number {
  return expenses.reduce((sum, re) => sum + recurringMonthlyRunRate(re, now), 0);
}

// ── Occurrences ───────────────────────────────────────────────────────────
//
// One count for everything dated: the year-to-date expense, what is still to
// come this year, and the GST/HST behind the GST34 input tax credits. An
// occurrence is a charge date: `day_of_month` of each month (monthly), of
// every third month from `month_of_year` (quarterly), or of `month_of_year`
// (annual). It counts when it falls on or after `start_date` and on or
// before `end_date`.

/**
 * Count how many times a recurring expense fires within [start, end] inclusive.
 * Respects the expense's own start_date and end_date.
 */
function occurrencesInRange(re: RecurringExpense, start: Date, end: Date): number {
  const reStart = re.start_date ? new Date(re.start_date + "T00:00:00") : null;
  const reEnd   = re.end_date   ? new Date(re.end_date   + "T23:59:59") : null;
  const lo = reStart && reStart > start ? reStart : start;
  const hi = reEnd   && reEnd   < end   ? reEnd   : end;
  if (lo > hi) return 0;

  const freq = re.frequency ?? "monthly";
  let count = 0;

  if (freq === "annual") {
    for (let yr = lo.getFullYear(); yr <= hi.getFullYear(); yr++) {
      const m = (re.month_of_year ?? 1) - 1;
      const d = new Date(yr, m, re.day_of_month);
      if (d >= lo && d <= hi) count++;
    }
  } else if (freq === "quarterly") {
    const startM = (re.month_of_year ?? 1) - 1;
    for (let yr = lo.getFullYear(); yr <= hi.getFullYear(); yr++) {
      for (let q = 0; q < 4; q++) {
        const m = (startM + q * 3) % 12;
        const d = new Date(yr, m, Math.min(re.day_of_month, 28));
        if (d >= lo && d <= hi) count++;
      }
    }
  } else {
    // Monthly — iterate month by month through the range
    const cursor = new Date(lo.getFullYear(), lo.getMonth(), 1);
    while (cursor <= hi) {
      const d = new Date(cursor.getFullYear(), cursor.getMonth(), Math.min(re.day_of_month, 28));
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
//
// Year to date is Jan 1 through `now`'s day; still to come is the day after
// through Dec 31. Every charge date of the year is in exactly one of them, so
// the two always add up to the year.

const startOfYear = (now: Date) => new Date(now.getFullYear(), 0, 1);
const endOfDay = (now: Date) => new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
const startOfNextDay = (now: Date) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
const endOfYear = (now: Date) => new Date(now.getFullYear(), 11, 31, 23, 59, 59);

/**
 * YTD amount for a single recurring expense: the charges that have happened
 * this year, through `now`'s day. This month's charge counts from its
 * `day_of_month`, not from the 1st. The same occurrences as
 * `totalRecurringHSTYTD`, so the expense and its ITC can't differ by one.
 */
export function recurringYTD(re: RecurringExpense, now: Date = new Date()): number {
  return Number(re.amount) * occurrencesInRange(re, startOfYear(now), endOfDay(now));
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

/**
 * What a single recurring expense is still to charge this year, after
 * `now`'s day: recurringYTD + this = the year's charges, on any day.
 */
export function recurringRemainingThisYear(re: RecurringExpense, now: Date = new Date()): number {
  return Number(re.amount) * occurrencesInRange(re, startOfNextDay(now), endOfYear(now));
}

/** Total still to come this year across all active recurring expenses */
export function totalRecurringRemaining(
  expenses: RecurringExpense[],
  now: Date = new Date(),
): number {
  return expenses
    .filter((re) => re.is_active)
    .reduce((sum, re) => sum + recurringRemainingThisYear(re, now), 0);
}

/** Project annual total: YTD charges + the charges still to come this year */
export function projectedAnnualRecurring(
  expenses: RecurringExpense[],
  now: Date = new Date(),
): number {
  return totalRecurringYTD(expenses, now) + totalRecurringRemaining(expenses, now);
}

// ── HST / ITC helpers ────────────────────────────────────────────────────

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
    .reduce((sum, re) => sum + occurrencesInRange(re, start, end) * Number(re.hst_amount), 0);
}

/**
 * HST on active recurring expenses in [startDate, endDate], one entry per
 * expense, with its category and vehicle flag. The GST34 pre-fill needs them
 * separately: a lease payment's HST is limited to the business-use share and
 * a meal's to 50%, which a single total can't express.
 */
export interface RecurringHSTDetail {
  id: string;
  name: string;
  category_key: string | null;
  /** Flagged vehicle_pct_applicable (its key may not say it is a vehicle cost). */
  vehicle_use: boolean;
  /** Times it was charged inside the period. */
  occurrences: number;
  /** What was charged over the period, GST/HST included. */
  paid: number;
  /** GST/HST inside that. */
  tax_amount: number;
}

/**
 * Each active recurring expense that carried GST/HST in a period, with its
 * name and how many times it was charged. The GST34 worksheet lists these so
 * the agent can see what is behind line 106; `recurringHSTEntriesForPeriod`
 * is the same data without the labels.
 */
export function recurringHSTDetailForPeriod(
  expenses: RecurringExpense[],
  startDate: string, // YYYY-MM-DD
  endDate: string,   // YYYY-MM-DD
): RecurringHSTDetail[] {
  const start = new Date(startDate + "T00:00:00");
  const end   = new Date(endDate   + "T23:59:59");
  return expenses
    .filter((re) => re.is_active && Number(re.hst_amount) > 0)
    .map((re) => {
      const occurrences = occurrencesInRange(re, start, end);
      return {
        id: re.id,
        name: re.name,
        category_key: re.category_key ?? null,
        vehicle_use: Boolean(re.vehicle_pct_applicable),
        occurrences,
        paid: occurrences * Number(re.amount),
        tax_amount: occurrences * Number(re.hst_amount),
      };
    })
    .filter((e) => e.tax_amount > 0);
}

export function recurringHSTEntriesForPeriod(
  expenses: RecurringExpense[],
  startDate: string, // YYYY-MM-DD
  endDate: string,   // YYYY-MM-DD
): { category_key: string | null; tax_amount: number; vehicle_use: boolean }[] {
  return recurringHSTDetailForPeriod(expenses, startDate, endDate).map((e) => ({
    category_key: e.category_key,
    tax_amount: e.tax_amount,
    vehicle_use: e.vehicle_use,
  }));
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

/** Monthly run-rate from the recurring expenses filed under one category key */
export function recurringMonthlyForCategory(
  expenses: RecurringExpense[],
  categoryKey: string,
  now: Date = new Date(),
): number {
  return expenses
    .filter((re) => re.category_key === categoryKey)
    .reduce((sum, re) => sum + recurringMonthlyRunRate(re, now), 0);
}
