/**
 * Filing Period Engine
 *
 * Computes GST/HST filing periods and CRA deadlines based on
 * filing frequency and fiscal year-end month.
 *
 * CRA rules for Dec 31 year-end (most common for sole-prop realtors):
 * - Monthly:    due one month after period end
 * - Quarterly:  Q1 Jan-Mar (Apr 30), Q2 Apr-Jun (Jul 31), Q3 Jul-Sep (Oct 31), Q4 Oct-Dec (Mar 31 next year)
 * - Annual:     due June 15 following year (sole prop), March 31 (corp)
 */

import type { FilingFrequency, FilingPeriod } from "../types/database";

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const MONTH_FULL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Last day of a given month (1-indexed) */
function lastDay(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function toISO(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Get all filing periods for a given year.
 * Assumes Dec 31 fiscal year-end (standard for most sole-prop realtors).
 */
export function getFilingPeriods(
  frequency: FilingFrequency,
  year: number,
): FilingPeriod[] {
  switch (frequency) {
    case "monthly":
      return Array.from({ length: 12 }, (_, i) => {
        const m = i + 1;
        const deadlineMonth = m === 12 ? 1 : m + 1;
        const deadlineYear = m === 12 ? year + 1 : year;
        const deadlineDay = lastDay(deadlineYear, deadlineMonth);
        return {
          label: `${MONTH_NAMES[i]} ${year}`,
          startDate: toISO(year, m, 1),
          endDate: toISO(year, m, lastDay(year, m)),
          deadline: toISO(deadlineYear, deadlineMonth, deadlineDay),
        };
      });

    case "quarterly":
      return [
        {
          label: `Q1 ${year}`,
          startDate: toISO(year, 1, 1),
          endDate: toISO(year, 3, 31),
          deadline: toISO(year, 4, 30),
        },
        {
          label: `Q2 ${year}`,
          startDate: toISO(year, 4, 1),
          endDate: toISO(year, 6, 30),
          deadline: toISO(year, 7, 31),
        },
        {
          label: `Q3 ${year}`,
          startDate: toISO(year, 7, 1),
          endDate: toISO(year, 9, 30),
          deadline: toISO(year, 10, 31),
        },
        {
          label: `Q4 ${year}`,
          startDate: toISO(year, 10, 1),
          endDate: toISO(year, 12, 31),
          deadline: toISO(year + 1, 3, 31),
        },
      ];

    case "annual":
      return [
        {
          label: `${year}`,
          startDate: toISO(year, 1, 1),
          endDate: toISO(year, 12, 31),
          deadline: toISO(year + 1, 6, 15), // sole-prop deadline
        },
      ];
  }
}

/**
 * Get the current filing period based on today's date.
 */
export function getCurrentFilingPeriod(
  frequency: FilingFrequency,
  year?: number,
): FilingPeriod {
  const now = new Date();
  const y = year ?? now.getFullYear();
  const periods = getFilingPeriods(frequency, y);
  const today = toISO(now.getFullYear(), now.getMonth() + 1, now.getDate());

  // Find the period that contains today
  const current = periods.find(
    (p) => today >= p.startDate && today <= p.endDate,
  );
  // Fallback to last period of year (shouldn't happen for current year)
  return current ?? periods[periods.length - 1];
}

/**
 * Get a human-readable label for the filing frequency.
 */
export function filingFrequencyLabel(frequency: FilingFrequency): string {
  switch (frequency) {
    case "monthly": return "Monthly";
    case "quarterly": return "Quarterly";
    case "annual": return "Annual";
  }
}

/**
 * Get filing period options for a filter dropdown.
 */
export function getFilingPeriodOptions(
  frequency: FilingFrequency,
  year: number,
): { value: string; label: string }[] {
  const periods = getFilingPeriods(frequency, year);
  return periods.map((p, i) => ({
    value: String(i),
    label: p.label,
  }));
}

/**
 * Format a deadline with urgency context.
 */
export function deadlineUrgency(deadline: string): {
  label: string;
  daysUntil: number;
  urgency: "overdue" | "urgent" | "soon" | "ok";
} {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const dl = new Date(deadline + "T00:00:00");
  const diffMs = dl.getTime() - now.getTime();
  const daysUntil = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  let urgency: "overdue" | "urgent" | "soon" | "ok";
  let label: string;

  if (daysUntil < 0) {
    urgency = "overdue";
    label = `${Math.abs(daysUntil)} day${Math.abs(daysUntil) !== 1 ? "s" : ""} overdue`;
  } else if (daysUntil <= 7) {
    urgency = "urgent";
    label = daysUntil === 0 ? "Due today" : `${daysUntil} day${daysUntil !== 1 ? "s" : ""} left`;
  } else if (daysUntil <= 30) {
    urgency = "soon";
    label = `${daysUntil} days left`;
  } else {
    urgency = "ok";
    label = `Due ${MONTH_FULL[dl.getMonth()]} ${dl.getDate()}, ${dl.getFullYear()}`;
  }

  return { label, daysUntil, urgency };
}
