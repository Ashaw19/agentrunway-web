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
    const r = planTakeHome({ gci: 80_000, settings, monthlyRecurring: 1_000, dealCount: 6, year: 2027 });
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

  it("never goes negative when costs exceed income", () => {
    const r = planTakeHome({ gci: 5_000, settings, monthlyRecurring: 5_000, dealCount: 1, year: 2027 });
    expect(r.netForTax).toBe(0);
    expect(r.takeHome).toBe(0);
  });
});
