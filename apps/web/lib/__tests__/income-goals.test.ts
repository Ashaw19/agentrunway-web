import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  incomeGoalCurrentYear,
  goalForYear,
  goalYearOptions,
  describeIncomeGoals,
  saveIncomeGoal,
  shouldPromptNextYearGoal,
} from "../income-goals";

/**
 * Income goal per calendar year (Andrew, 2026-10-06): "I know I want to shoot
 * for $80,000 next year. This year is a write-off."
 *
 * income_goals (00169) holds one goal per year; user_settings.goal_gci stays
 * "this year's goal" and the DB keeps it in sync. These helpers must agree
 * with the SQL: income_goal_for_year() = that year's own row, else 0 (no
 * carry-forward since 00170: Andrew, 2026-10-07, "We need to have separate
 * years and separate goals"); "this year" is Atlantic time.
 */

const rows = [
  { year: 2026, goal_gci: 0 },
  { year: 2027, goal_gci: 80000 },
];

describe("incomeGoalCurrentYear", () => {
  it("uses Atlantic time, so New Year's Eve evening UTC is still the old year", () => {
    // 2027-01-01 02:00 UTC = 2026-12-31 22:00 AST.
    expect(incomeGoalCurrentYear(new Date("2027-01-01T02:00:00Z"))).toBe(2026);
    // 2027-01-01 05:00 UTC = 2027-01-01 01:00 AST.
    expect(incomeGoalCurrentYear(new Date("2027-01-01T05:00:00Z"))).toBe(2027);
  });
});

describe("goalForYear (mirrors SQL income_goal_for_year)", () => {
  it("returns that year's goal — an explicit 0 means a write-off year", () => {
    expect(goalForYear(rows, 2026)).toBe(0);
    expect(goalForYear(rows, 2027)).toBe(80000);
  });

  it("never carries an earlier year's goal forward (the reported problem)", () => {
    expect(goalForYear(rows, 2028)).toBe(0);
    expect(goalForYear([{ year: 2026, goal_gci: 10000 }], 2027)).toBe(0);
  });

  it("is 0 when the year has no goal", () => {
    expect(goalForYear(rows, 2025)).toBe(0);
    expect(goalForYear([], 2026)).toBe(0);
  });

  it("accepts numeric strings from PostgREST", () => {
    expect(goalForYear([{ year: 2027, goal_gci: "80000.00" }], 2027)).toBe(80000);
  });
});

describe("goalYearOptions", () => {
  it("offers this year and the next two", () => {
    expect(goalYearOptions(2026, [])).toEqual([2026, 2027, 2028]);
  });

  it("also lists further-out years that already have a goal", () => {
    expect(goalYearOptions(2026, [{ year: 2030, goal_gci: 1 }])).toEqual([2026, 2027, 2028, 2030]);
  });

  it("never offers past years", () => {
    expect(goalYearOptions(2026, [{ year: 2024, goal_gci: 1 }])).toEqual([2026, 2027, 2028]);
  });
});

describe("describeIncomeGoals (AI context)", () => {
  it("states this year's and future years' goals, naming a write-off year", () => {
    expect(describeIncomeGoals(rows, 2026)).toBe(
      "Income goals by calendar year: 2026: no goal (set to $0); 2027: $80,000",
    );
  });

  it("says the current year has no goal instead of borrowing an earlier one", () => {
    expect(describeIncomeGoals([{ year: 2025, goal_gci: 120000 }, { year: 2027, goal_gci: 90000 }], 2026)).toBe(
      "Income goals by calendar year: 2026: no goal set; 2027: $90,000",
    );
  });

  it("is null when nothing is set", () => {
    expect(describeIncomeGoals([], 2026)).toBeNull();
  });
});

describe("saveIncomeGoal", () => {
  function fake(error: { message: string } | null = null) {
    const calls: { table: string; payload: unknown; options: unknown }[] = [];
    const supabase = {
      from: (table: string) => ({
        upsert: async (payload: unknown, options: unknown) => {
          calls.push({ table, payload, options });
          return { error };
        },
      }),
    } as unknown as SupabaseClient;
    return { supabase, calls };
  }

  it("upserts one row per user and year", async () => {
    const { supabase, calls } = fake();
    expect(await saveIncomeGoal(supabase, "u1", 2027, 80000)).toEqual({ ok: true });
    expect(calls).toEqual([{
      table: "income_goals",
      payload: { user_id: "u1", year: 2027, goal_gci: 80000 },
      options: { onConflict: "user_id,year" },
    }]);
  });

  it("rejects negative or non-finite amounts without writing", async () => {
    const { supabase, calls } = fake();
    expect(await saveIncomeGoal(supabase, "u1", 2027, -5)).toEqual({ ok: false });
    expect(await saveIncomeGoal(supabase, "u1", 2027, Number.NaN)).toEqual({ ok: false });
    expect(calls).toHaveLength(0);
  });

  it("reports a failed write", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { supabase } = fake({ message: "denied" });
    expect(await saveIncomeGoal(supabase, "u1", 2027, 80000)).toEqual({ ok: false });
    spy.mockRestore();
  });
});

describe("shouldPromptNextYearGoal (dashboard Q4 nudge)", () => {
  // Local-noon dates in Atlantic time are safe for month checks.
  const sep30 = new Date("2026-09-30T16:00:00Z");
  const oct1 = new Date("2026-10-01T16:00:00Z");
  const dec31 = new Date("2026-12-31T16:00:00Z");

  it("prompts from October 1 when next year has no goal", () => {
    expect(shouldPromptNextYearGoal([{ year: 2026, goal_gci: 10000 }], oct1)).toBe(true);
    expect(shouldPromptNextYearGoal([], dec31)).toBe(true);
  });

  it("stays quiet before October", () => {
    expect(shouldPromptNextYearGoal([], sep30)).toBe(false);
  });

  it("stays quiet once next year has a goal — even a deliberate $0", () => {
    expect(shouldPromptNextYearGoal([{ year: 2027, goal_gci: 80000 }], oct1)).toBe(false);
    expect(shouldPromptNextYearGoal([{ year: 2027, goal_gci: 0 }], oct1)).toBe(false);
  });
});
