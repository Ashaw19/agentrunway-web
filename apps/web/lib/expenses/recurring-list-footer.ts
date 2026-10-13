/**
 * The two figures under the Recurring Expenses list, from its rows as
 * entered (GST/HST included, like the Amount column above them). A list
 * footer, not an expense total: those are `ytdExpenseTotals`, net of ITCs.
 *
 * Until 2026-10-13 the second figure was "Annual total", the first × 12. A
 * row has dates, so no year costs that: a row due to end on Dec 31 was
 * counted for twelve more months, a row that started in July read as a full
 * year, and a row that ended in June read as nothing.
 */
import { recurringChargesInYear, recurringMonthlyRunRate } from "@agent-runway/core/engines/recurring-expense-engine";
import type { RecurringExpense } from "@agent-runway/core/types/database";

export interface RecurringListFooter {
  /** What the list costs each month as of `now`: the rows that have not ended. */
  monthly: number;
  /**
   * What the list is charged in calendar year `year`: each row's charge dates
   * from Jan 1 to Dec 31, between its start date and its end date. Year to
   * date plus what is still to come, on any day of that year.
   */
  yearTotal: number;
}

export function recurringListFooter(
  list: readonly RecurringExpense[],
  year: number,
  now: Date = new Date(),
): RecurringListFooter {
  let monthly = 0;
  let yearTotal = 0;
  for (const re of list) {
    // A paused row counts in no total. (`recurringMonthlyRunRate` checks this itself.)
    if (!re.is_active) continue;
    monthly += recurringMonthlyRunRate(re, now);
    yearTotal += recurringChargesInYear(re, year);
  }
  return { monthly, yearTotal };
}
