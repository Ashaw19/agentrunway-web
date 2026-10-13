/**
 * The Recurring Expenses form's end date: what the form accepts and what the
 * list says about a row. Whether a row has ended is the engine's call
 * (`recurringHasEnded`), the same one the monthly run-rate makes.
 */
import { recurringHasEnded } from "@agent-runway/core/engines/recurring-expense-engine";
import type { RecurringExpense } from "@agent-runway/core/types/database";

/**
 * Why this end date can't be saved, or null when it can. Both are date-input
 * values (YYYY-MM-DD); an empty end date means the expense has no end.
 */
export function recurringEndDateError(startDate: string, endDate: string): string | null {
  if (!endDate) return null;
  if (startDate && endDate < startDate) return "The end date is before the start date.";
  return null;
}

/**
 * What the list shows for a row's end date: "Ended Jun 30, 2026" once it has
 * passed, "Ends Dec 31, 2026" while it is still ahead, null with none.
 */
export function recurringEndStatus(
  re: Pick<RecurringExpense, "end_date">,
  now: Date = new Date(),
): { ended: boolean; label: string } | null {
  if (!re.end_date) return null;
  const ended = recurringHasEnded(re, now);
  // Noon, so the date-only value prints as its own day on any clock.
  const day = new Date(`${re.end_date}T12:00:00`).toLocaleDateString("en-CA", {
    month: "short", day: "numeric", year: "numeric",
  });
  return { ended, label: `${ended ? "Ended" : "Ends"} ${day}` };
}
