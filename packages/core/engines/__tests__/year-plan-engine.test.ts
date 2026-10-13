import { describe, it, expect } from "vitest";
import {
  pipelineLinedUpForYear,
  averageDealGCI,
  dealsNeeded,
  monthlyTargets,
  planTakeHome,
  PLAN_AS_OF_MONTH_DAY,
} from "../year-plan-engine";
import { TEST_PIPELINE, EXPECTED_PIPELINE, createTestSettings } from "./test-data";
import { computePlanGross } from "../real-compensation-engine";
import { calculate } from "../canadian-tax-engine";
import { ytdExpenseTotals } from "../t2125-expenses-engine";
import type { RecurringExpense } from "../../types/database";

/**
 * Dashboard "next year" planning view (Andrew, 2026-10-07): "On the dashboard,
 * I should be able to flip between the current year and the next year."
 * Next year has no actuals yet, so it's a plan: goal, pipeline already
 * expected to close that year, deals still needed, month targets, and
 * estimated take-home at goal — all from the same engines as the rest of
 * the app.
 */

// deal-001 lead (weighted 1,250), deal-002 conditional (12,187.5), deal-003 firm (9,450)
const [lead, conditional, firm] = TEST_PIPELINE;

describe("pipelineLinedUpForYear", () => {
  const deals = [
    { ...conditional, expected_close_date: "2027-03-15" },
    { ...firm, expected_close_date: "2026-11-20" },
    { ...lead, expected_close_date: null },
    { ...firm, id: "lost-2027", stage: "lost", expected_close_date: "2027-05-01" },
  ];

  it("counts only active deals expected to close in that year, probability-weighted", () => {
    const r = pipelineLinedUpForYear(deals, 2027);
    expect(r.weightedGCI).toBeCloseTo(EXPECTED_PIPELINE.deal2.weighted, 2);
    expect(r.dealCount).toBe(1);
  });

  it("reports active deals with no expected close date separately", () => {
    expect(pipelineLinedUpForYear(deals, 2027).undatedCount).toBe(1);
  });

  it("is empty for a year with nothing expected", () => {
    expect(pipelineLinedUpForYear(deals, 2029)).toMatchObject({ weightedGCI: 0, dealCount: 0 });
  });
});

describe("averageDealGCI", () => {
  const history = [
    { year: 2025, annual_gci: 60_000, annual_tx: 4 },
    { year: 2024, annual_gci: 30_000, annual_tx: 3 },
    { year: 2023, annual_gci: 99_999, annual_tx: 1 }, // outside the 2-year lookback
    { year: 2026, annual_gci: 50_000, annual_tx: 9 }, // current year comes from YTD, not history
  ];

  it("blends the last two full years with this year's closed deals", () => {
    const r = averageDealGCI(history, { gci: 10_000, deals: 1 }, 2026);
    expect(r).toEqual({ avg: 12_500, deals: 8 });
  });

  it("still works in a year with no deals yet (a write-off year)", () => {
    expect(averageDealGCI(history, { gci: 0, deals: 0 }, 2026)).toEqual({ avg: 90_000 / 7, deals: 7 });
  });

  it("is null with no deal history at all", () => {
    expect(averageDealGCI([], { gci: 0, deals: 0 }, 2026)).toBeNull();
  });
});

describe("dealsNeeded", () => {
  it("rounds up the remaining gap at the average deal size", () => {
    expect(dealsNeeded(80_000, 12_187.5, 12_500)).toBe(6);
  });

  it("is 0 when the pipeline already covers the goal", () => {
    expect(dealsNeeded(10_000, 12_000, 12_500)).toBe(0);
  });

  it("is null without a goal or an average", () => {
    expect(dealsNeeded(0, 0, 12_500)).toBeNull();
    expect(dealsNeeded(80_000, 0, null)).toBeNull();
  });
});

describe("monthlyTargets", () => {
  it("spreads the goal by quarterly seasonality, a third of each quarter per month", () => {
    const m = monthlyTargets(80_000, [0.2, 0.3, 0.3, 0.2]);
    expect(m).toHaveLength(12);
    expect(m[0]).toBeCloseTo((80_000 * 0.2) / 3, 6);
    expect(m[4]).toBeCloseTo((80_000 * 0.3) / 3, 6);
    expect(m.reduce((a, b) => a + b, 0)).toBeCloseTo(80_000, 6);
  });

  it("accepts weights stored as percentages", () => {
    expect(monthlyTargets(80_000, [20, 30, 30, 20])).toEqual(monthlyTargets(80_000, [0.2, 0.3, 0.3, 0.2]));
  });

  it("is all zeros with no goal", () => {
    expect(monthlyTargets(0, [0.25, 0.25, 0.25, 0.25]).every((v) => v === 0)).toBe(true);
  });
});

describe("planTakeHome", () => {
  const settings = createTestSettings();

  it("runs the same plan, fee, expense and tax chain as the forecast", () => {
    const r = planTakeHome({ gci: 80_000, settings, expenses: 12_000, dealCount: 6, year: 2027 });
    const { grossAfterPlan } = computePlanGross(settings, 80_000, { dealCount: 6, asOf: `2027-${PLAN_AS_OF_MONTH_DAY}` });
    const netForTax = grossAfterPlan - settings.monthly_brokerage_fee * 12 - 12_000;
    const tax = calculate(netForTax, settings.province, 6).totalBurden;

    expect(r.gci).toBe(80_000);
    expect(r.afterPlan).toBeCloseTo(grossAfterPlan, 6);
    expect(r.brokerageFees).toBe(settings.monthly_brokerage_fee * 12);
    expect(r.expenses).toBe(12_000);
    expect(r.netForTax).toBeCloseTo(netForTax, 6);
    expect(r.incomeTaxAndCpp).toBeCloseTo(tax, 6);
    expect(r.takeHome).toBeCloseTo(netForTax - tax, 6);
    expect(r.takeHome).toBeLessThan(r.gci);
  });

  it("takes the year's expenses as given: it does not multiply them", () => {
    const r = planTakeHome({ gci: 80_000, settings, expenses: 1_000, dealCount: 6, year: 2027 });
    expect(r.expenses).toBe(1_000);
  });

  it("never goes negative when costs exceed income", () => {
    const r = planTakeHome({ gci: 5_000, settings, expenses: 60_000, dealCount: 1, year: 2027 });
    expect(r.netForTax).toBe(0);
    expect(r.takeHome).toBe(0);
  });

  it("treats a negative expense figure as none", () => {
    expect(planTakeHome({ gci: 80_000, settings, expenses: -500, dealCount: 6, year: 2027 }).expenses).toBe(0);
  });
});

/**
 * The plan's "Business expenses" row (2026-10-13). It used to be today's
 * monthly recurring figure × 12, so a recurring expense known to stop before
 * next year was counted for all twelve months of it until Jan 1, and one
 * starting in July for the whole year.
 *
 * It is now next year's own figure, `ytdExpenseTotals(...).expensesNextYear`:
 * each Recurring Expenses row by the charge dates that fall in that year,
 * plus twelve months of the per-item monthly figures (which have no dates).
 * These run the dashboard's chain: the page's one engine call, then the plan.
 */
describe("planTakeHome — business expenses are next year's charge dates", () => {
  const settings = createTestSettings();
  const OCT_13_2026 = new Date(2026, 9, 13, 12);
  const NOT_REGISTERED = { gstHstRegistered: false, vehicleBusinessUsePct: 0.8, homeOfficeBusinessUsePct: 0 };

  function recurring(overrides: Partial<RecurringExpense>): RecurringExpense {
    return {
      id: "re-1",
      user_id: "u1",
      name: "Office lease",
      amount: 400,
      category_key: "office_rent",
      frequency: "monthly",
      day_of_month: 1,
      month_of_year: null,
      hst_included: false,
      hst_amount: 0,
      vehicle_pct_applicable: false,
      notes: "",
      start_date: "2025-01-01",
      end_date: null,
      is_active: true,
      created_at: "2025-01-01T12:00:00Z",
      updated_at: "2025-01-01T12:00:00Z",
      ...overrides,
    };
  }

  function plan2027(rows: RecurringExpense[], expenseItems: { key: string; monthly_recurring: number }[] = []) {
    const totals = ytdExpenseTotals({ receipts: [], recurring: rows, expenseItems, ctx: NOT_REGISTERED, now: OCT_13_2026 });
    const plan = planTakeHome({ gci: 80_000, settings, expenses: totals.expensesNextYear, dealCount: 6, year: 2027 });
    return { plan, monthlyRecurringToday: totals.monthlyRecurring };
  }

  it("a row with no end date is twelve charges", () => {
    expect(plan2027([recurring({})]).plan.expenses).toBe(4_800);
  });

  it("a lease that ends on Dec 31 this year costs nothing next year", () => {
    const { plan, monthlyRecurringToday } = plan2027([recurring({ end_date: "2026-12-31" })]);
    expect(plan.expenses).toBe(0);
    // It is still being paid in October, so the old row read 400 × 12.
    expect(monthlyRecurringToday * 12).toBe(4_800);
  });

  it("a row that ends in the middle of next year counts up to its end date", () => {
    expect(plan2027([recurring({ end_date: "2027-06-30" })]).plan.expenses).toBe(2_400);
  });

  it("a row that starts in the middle of next year counts from its start date", () => {
    const { plan, monthlyRecurringToday } = plan2027([recurring({ start_date: "2027-07-01" })]);
    expect(plan.expenses).toBe(2_400);
    expect(monthlyRecurringToday * 12).toBe(4_800);
  });

  it("an annual fee counts once, in full", () => {
    const dues = recurring({ frequency: "annual", amount: 1_200, month_of_year: 11, day_of_month: 1 });
    expect(plan2027([dues]).plan.expenses).toBe(1_200);
  });

  it("a per-item monthly figure has no dates, so it stays × 12", () => {
    expect(plan2027([], [{ key: "office_phone", monthly_recurring: 50 }]).plan.expenses).toBe(600);
  });

  it("the tax estimate is on the plan's own net: a lease that has ended is no longer deducted", () => {
    const ended = plan2027([recurring({ end_date: "2026-12-31" })]).plan;
    const running = plan2027([recurring({})]).plan;
    expect(ended.netForTax - running.netForTax).toBeCloseTo(4_800, 6);
    expect(ended.incomeTaxAndCpp).toBeGreaterThan(running.incomeTaxAndCpp);
    expect(ended.takeHome).toBeGreaterThan(running.takeHome);
  });
});
