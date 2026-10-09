/**
 * Income goal per calendar year (income_goals, migration 00169).
 *
 * income_goals is the source of truth: one GCI goal per (user, year).
 * user_settings.goal_gci stays "this year's goal" for every existing reader
 * and the database keeps it in sync, including the Jan 1 rollover (pg_cron
 * 'sync-income-goals'). Writers set a year's goal here; nothing in the app
 * writes goal_gci for a future year.
 *
 * goalForYear mirrors SQL income_goal_for_year(): that year's own row (an
 * explicit 0 = no goal, e.g. a write-off year), else 0. Years are separate:
 * an earlier year's goal never carries forward (00170; Andrew, 2026-10-07).
 * "This year" is Atlantic time to match income_goal_current_year().
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { fmtCurrency } from "@/lib/formatters";

export const INCOME_GOAL_TIMEZONE = "America/Halifax";

export interface IncomeGoalRow {
  year:     number;
  goal_gci: number | string;
}

export function incomeGoalCurrentYear(now: Date = new Date()): number {
  return Number(new Intl.DateTimeFormat("en-CA", { timeZone: INCOME_GOAL_TIMEZONE, year: "numeric" }).format(now));
}

/** That year's goal, or 0 when the year has none. */
export function goalForYear(rows: readonly IncomeGoalRow[], year: number): number {
  const row = rows.find((r) => r.year === year);
  return row ? Number(row.goal_gci) || 0 : 0;
}

export function hasGoalRow(rows: readonly IncomeGoalRow[], year: number): boolean {
  return rows.some((r) => r.year === year);
}

/**
 * Dashboard nudge from October 1 (Atlantic) until next year has a goal row.
 * With no carry-forward, a year nobody set starts at "no goal" on Jan 1.
 * A deliberate $0 for next year counts as answered.
 */
export function shouldPromptNextYearGoal(rows: readonly IncomeGoalRow[], now: Date = new Date()): boolean {
  const month = Number(new Intl.DateTimeFormat("en-CA", { timeZone: INCOME_GOAL_TIMEZONE, month: "numeric" }).format(now));
  if (month < 10) return false;
  return !hasGoalRow(rows, incomeGoalCurrentYear(now) + 1);
}

/** Years the settings picker offers: this year, the next two, plus any later year already set. */
export function goalYearOptions(currentYear: number, rows: readonly IncomeGoalRow[]): number[] {
  const years = new Set([currentYear, currentYear + 1, currentYear + 2]);
  for (const r of rows) if (r.year >= currentYear) years.add(r.year);
  return [...years].sort((a, b) => a - b);
}

/** One line for the AI context: this year's goal in effect and every future year with a goal. */
export function describeIncomeGoals(rows: readonly IncomeGoalRow[], currentYear: number): string | null {
  if (rows.length === 0) return null;
  const parts: string[] = [];

  const own = rows.find((r) => r.year === currentYear);
  if (own) {
    const g = Number(own.goal_gci) || 0;
    parts.push(`${currentYear}: ${g > 0 ? fmtCurrency(g) : "no goal (set to $0)"}`);
  } else {
    parts.push(`${currentYear}: no goal set`);
  }

  for (const r of [...rows].filter((r) => r.year > currentYear).sort((a, b) => a.year - b.year)) {
    const g = Number(r.goal_gci) || 0;
    parts.push(`${r.year}: ${g > 0 ? fmtCurrency(g) : "no goal (set to $0)"}`);
  }

  return parts.length > 0 ? `Income goals by calendar year: ${parts.join("; ")}` : null;
}

/** Set one year's goal. The DB syncs user_settings.goal_gci when it's this year. */
export async function saveIncomeGoal(
  supabase: SupabaseClient,
  userId:   string,
  year:     number,
  goalGci:  number,
): Promise<{ ok: boolean }> {
  if (!Number.isFinite(goalGci) || goalGci < 0 || !Number.isInteger(year)) return { ok: false };
  const { error } = await supabase
    .from("income_goals")
    .upsert({ user_id: userId, year, goal_gci: goalGci }, { onConflict: "user_id,year" });
  if (error) {
    console.error("[income-goals] save failed:", error.message);
    return { ok: false };
  }
  return { ok: true };
}
