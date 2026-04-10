/**
 * Recurring Expense Engine
 *
 * Shared computation for recurring expenses across analytics pages.
 * Centralizes monthly-equivalent and YTD calculations so Dashboard,
 * Forecast, Reports, Overhead, Chat API, and Scenarios all agree.
 */

import type { RecurringExpense } from "../types/database";

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

// ── YTD calculation ───────────────────────────────────────────────────────

/** YTD amount for a single recurring expense based on frequency and start_date */
export function recurringYTD(re: RecurringExpense, year?: number): number {
  const thisYear = year ?? new Date().getFullYear();
  const freq = re.frequency ?? "monthly";
  const amt = Number(re.amount);
  const startDate = re.start_date
    ? new Date(re.start_date + "T00:00:00")
    : new Date(thisYear, 0, 1);
  const yearStart = new Date(thisYear, 0, 1);
  const effectiveStart = startDate > yearStart ? startDate : yearStart;
  const now = new Date();

  if (effectiveStart > now) return 0;

  if (freq === "annual") {
    const chargeMonth = (re.month_of_year ?? 1) - 1;
    const chargeDate = new Date(thisYear, chargeMonth, re.day_of_month);
    return chargeDate >= effectiveStart && chargeDate <= now ? amt : 0;
  }

  if (freq === "quarterly") {
    const startMonth = (re.month_of_year ?? 1) - 1;
    let count = 0;
    for (let q = 0; q < 4; q++) {
      const m = (startMonth + q * 3) % 12;
      const occDate = new Date(thisYear, m, Math.min(re.day_of_month, 28));
      if (occDate >= effectiveStart && occDate <= now) count++;
    }
    return count * amt;
  }

  // Monthly
  const startM = effectiveStart.getMonth();
  const nowM = now.getMonth();
  const months = Math.max(
    0,
    nowM - startM + (now.getDate() >= effectiveStart.getDate() ? 1 : 0),
  );
  return months * amt;
}

/** Total YTD across all active recurring expenses */
export function totalRecurringYTD(
  expenses: RecurringExpense[],
  year?: number,
): number {
  return expenses
    .filter((re) => re.is_active)
    .reduce((sum, re) => sum + recurringYTD(re, year), 0);
}

/** Project annual total: YTD actuals + remaining monthly recurring */
export function projectedAnnualRecurring(
  expenses: RecurringExpense[],
): number {
  const ytd = totalRecurringYTD(expenses);
  const monthly = totalRecurringMonthly(expenses);
  const now = new Date();
  const monthsElapsed = now.getMonth() + now.getDate() / 30;
  const remainingMonths = Math.max(0, 12 - Math.ceil(monthsElapsed));
  return ytd + monthly * remainingMonths;
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
