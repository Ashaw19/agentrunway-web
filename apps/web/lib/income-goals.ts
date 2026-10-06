/**
 * Income goal per calendar year (income_goals, migration 00169).
 *
 * income_goals is the source of truth: one GCI goal per (user, year).
 * user_settings.goal_gci stays "this year's goal" for every existing reader
 * and the database keeps it in sync, including the Jan 1 rollover (pg_cron
 * 'sync-income-goals'). Writers set a year's goal here; nothing in the app
 * writes goal_gci for a future year.
 *
 * goalInEffect mirrors SQL income_goal_for_year(): that year's row (an
 * explicit 0 = no goal, e.g. a write-off year), else the latest earlier
 * year's goal carries forward, else 0. "This year" is Atlantic time to match
 * income_goal_current_year().
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

function latestAtOrBefore(rows: readonly IncomeGoalRow[], year: number): IncomeGoalRow | undefined {
  let best: IncomeGoalRow | undefined;
  for (const r of rows) {
    if (r.year <= year && (!best || r.year > best.year)) best = r;
  }
  return best;
}

export function goalInEffect(rows: readonly IncomeGoalRow[], year: number): number {
  const row = latestAtOrBefore(rows, year);
  return row ? Number(row.goal_gci) || 0 : 0;
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
  const carried = own ? undefined : latestAtOrBefore(rows, currentYear);
  if (own) {
    const g = Number(own.goal_gci) || 0;
    parts.push(`${currentYear}: ${g > 0 ? fmtCurrency(g) : "no goal (set to $0)"}`);
  } else if (carried && Number(carried.goal_gci) > 0) {
    parts.push(`${currentYear}: ${fmtCurrency(Number(carried.goal_gci))} (carried forward from ${carried.year})`);
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
