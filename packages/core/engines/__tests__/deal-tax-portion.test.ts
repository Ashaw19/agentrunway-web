/**
 * The tax portion of one commission (2026-10-13).
 *
 * What was wrong: the two deal-close screens printed "Income tax reserve" as
 * the commission x a marginal rate looked up at GCI (not at net income, and
 * without CPP), while the dashboard, Forecast and Reports printed the year's
 * estimate / projected deals as "Per-deal tax portion", and the Flight Crew
 * worked a third figure out from income tax / net income. One deal, three
 * figures.
 *
 * One definition now: the year's estimate x the commission / projected GCI.
 * cross-surface-parity.test.ts holds the surfaces to it; this file tests the
 * definition and the year's estimate it is built on.
 */
import { describe, it, expect } from "vitest";
import {
  dealCloseTaxPortion,
  seasonalWeightsFor,
  taxPortionOfCommission,
  yearTaxEstimate,
  type YearTaxEstimateInputs,
} from "../deal-tax-portion";
import { calculate } from "../canadian-tax-engine";
import { computeProjectedNetForTax } from "../effective-cash";
import { projectedYearEndGCI, projectedYearEndTransactions, seasonalFractionElapsed } from "../projection-engine";
import { computeWeightedGCI } from "../../types/database";
import { createTestSettings } from "./test-data";

const NOW = new Date(2026, 6, 15, 12); // July 15, 2026

const SETTINGS = createTestSettings({
  province: "newBrunswick",
  split_preset: "p80_20",
  monthly_brokerage_fee: 500,
  goal_gci: 180_000,
  use_national_seasonality: true,
  national_quarter_pcts: [0.2, 0.3, 0.3, 0.2],
});

const PIPELINE = [
  { id: "p1", estimated_price: 400_000, estimated_commission_pct: 0.025, probability_override: null, stage: "firm" },
  { id: "p2", estimated_price: 500_000, estimated_commission_pct: 0.025, probability_override: null, stage: "offer" },
  { id: "p3", estimated_price: 300_000, estimated_commission_pct: 0.025, probability_override: null, stage: "closed" },
  { id: "p4", estimated_price: 350_000, estimated_commission_pct: 0.025, probability_override: null, stage: "lost" },
];

const YEAR: YearTaxEstimateInputs = {
  settings: SETTINGS,
  ytdGCI: 60_000,
  ytdDealCount: 5,
  pipelineDeals: PIPELINE,
  listings: [{ estimated_list_price: 600_000, estimated_commission_pct: 0.025, status: "active" }],
  historyItems: [],
  expensesYTD: 9_000,
  expensesRemaining: 6_000,
  now: NOW,
};

describe("taxPortionOfCommission: the year's estimate by the commission's share of projected GCI", () => {
  it("is the estimate x commission / projected GCI, to the cent", () => {
    expect(taxPortionOfCommission(10_000, 150_000, 30_000)).toBe(2_000);
    expect(taxPortionOfCommission(12_345.67, 151_200, 31_415.92)).toBe(
      Math.round(((31_415.92 * 12_345.67) / 151_200) * 100) / 100,
    );
  });

  it("for a deal of the projected average size it is the per-deal tax portion", () => {
    for (const [netIncome, deals, projectedGCI] of [[90_000, 12, 140_000], [45_000, 7, 70_000], [210_000, 23, 300_000]]) {
      const tax = calculate(netIncome, "ontario", deals);
      expect(taxPortionOfCommission(projectedGCI / deals, projectedGCI, tax.totalBurden)).toBeCloseTo(tax.perDealSetAside, 2);
    }
  });

  it("the portions of every deal in the projected year add up to the year's estimate", () => {
    const deals = [4_500, 9_250, 11_000, 15_750, 22_500, 7_000];
    const projectedGCI = deals.reduce((a, b) => a + b, 0);
    const total = deals.reduce((sum, gci) => sum + taxPortionOfCommission(gci, projectedGCI, 18_400), 0);
    expect(total).toBeCloseTo(18_400, 1);
  });

  it("scales with the commission: twice the commission, twice the portion", () => {
    expect(taxPortionOfCommission(20_000, 150_000, 30_000)).toBe(2 * taxPortionOfCommission(10_000, 150_000, 30_000));
  });

  it("is never more than the year's estimate", () => {
    expect(taxPortionOfCommission(50_000, 20_000, 3_000)).toBe(3_000);
  });

  it("is 0 with no commission, no projection or no estimate", () => {
    expect(taxPortionOfCommission(0, 150_000, 30_000)).toBe(0);
    expect(taxPortionOfCommission(-500, 150_000, 30_000)).toBe(0);
    expect(taxPortionOfCommission(10_000, 0, 30_000)).toBe(0);
    expect(taxPortionOfCommission(10_000, 150_000, 0)).toBe(0);
    expect(taxPortionOfCommission(Number.NaN, 150_000, 30_000)).toBe(0);
    expect(taxPortionOfCommission(10_000, Number.NaN, 30_000)).toBe(0);
  });
});

describe("seasonalWeightsFor: the dashboard's choice of quarter weights", () => {
  const settings = { use_national_seasonality: true, national_quarter_pcts: [0.2, 0.3, 0.3, 0.2] };

  it("the agent's own pattern once two history years carry quarterly GCI", () => {
    const weights = seasonalWeightsFor(
      [{ quarter_gci: [10_000, 30_000, 40_000, 20_000] }, { quarter_gci: [30_000, 30_000, 20_000, 20_000] }],
      settings,
    );
    // Quarter averages 20k / 30k / 30k / 20k of 100k.
    expect(weights).toEqual([0.2, 0.3, 0.3, 0.2]);
  });

  it("one history year is not a pattern: the national weights when switched on", () => {
    expect(seasonalWeightsFor([{ quarter_gci: [50_000, 0, 0, 0] }], settings)).toEqual([0.2, 0.3, 0.3, 0.2]);
  });

  it("years with no quarterly GCI do not count toward the two", () => {
    expect(
      seasonalWeightsFor([{ quarter_gci: [50_000, 0, 0, 0] }, { quarter_gci: [0, 0, 0, 0] }, { quarter_gci: null }], settings),
    ).toEqual([0.2, 0.3, 0.3, 0.2]);
  });

  it("four equal quarters when national seasonality is off", () => {
    expect(seasonalWeightsFor([], { ...settings, use_national_seasonality: false })).toEqual([0.25, 0.25, 0.25, 0.25]);
  });
});

describe("yearTaxEstimate: the dashboard's chain from the rows it reads", () => {
  it("is the projection, net income and tax engine call the dashboard makes", () => {
    const fraction = seasonalFractionElapsed([0.2, 0.3, 0.3, 0.2], NOW);
    // p1 and p2 are live; p3 (closed) and p4 (lost) are terminal.
    const pipelineWeighted = computeWeightedGCI(PIPELINE[0]) + computeWeightedGCI(PIPELINE[1]);
    const listingWeighted = 600_000 * 0.025 * 0.4;
    const projectedGCI = projectedYearEndGCI(60_000, pipelineWeighted + listingWeighted, fraction, 180_000);
    const projectedDealCount = projectedYearEndTransactions(5, 2, fraction);
    const netForTax = computeProjectedNetForTax({
      projectedGCI, expensesYTD: 9_000, expensesRemaining: 6_000, settings: SETTINGS, projectedDealCount, now: NOW,
    });

    const year = yearTaxEstimate(YEAR);
    expect(year.fraction).toBe(fraction);
    expect(year.projectedGCI).toBe(projectedGCI);
    expect(year.projectedDealCount).toBe(projectedDealCount);
    expect(year.netForTax).toBe(netForTax);
    expect(year.tax).toEqual(calculate(netForTax, "newBrunswick", Math.max(projectedDealCount, 1)));
    expect(year.tax.totalBurden).toBeGreaterThan(0);
  });

  it("no listings and no pipeline is a projection from closed deals alone", () => {
    const year = yearTaxEstimate({ ...YEAR, pipelineDeals: [], listings: null });
    const fraction = seasonalFractionElapsed([0.2, 0.3, 0.3, 0.2], NOW);
    expect(year.projectedGCI).toBe(projectedYearEndGCI(60_000, 0, fraction, 180_000));
  });
});

describe("dealCloseTaxPortion: the year is estimated with the deal already closed", () => {
  const COMMISSION = 400_000 * 0.025; // p1 closes at its estimated price

  it("moves the commission into the year to date and the row out of the pipeline", () => {
    const afterClose = yearTaxEstimate({
      ...YEAR,
      ytdGCI: 60_000 + COMMISSION,
      ytdDealCount: 6,
      pipelineDeals: PIPELINE.filter((d) => d.id !== "p1"),
    });
    const portion = dealCloseTaxPortion({ ...YEAR, commissionGCI: COMMISSION, closingPipelineDealId: "p1" });

    expect(portion.annualTaxEstimate).toBe(afterClose.tax.totalBurden);
    expect(portion.projectedGCI).toBe(afterClose.projectedGCI);
    expect(portion.taxYear).toBe(afterClose.tax.taxYear);
    expect(portion.commissionGCI).toBe(COMMISSION);
    expect(portion.taxPortion).toBe(
      taxPortionOfCommission(COMMISSION, afterClose.projectedGCI, afterClose.tax.totalBurden),
    );
  });

  it("is the same whether the pipeline row is dropped or already marked closed", () => {
    // The Transactions tab keeps the row at stage='closed'; the dashboard's
    // prompt deletes it. Either way it is out of the active pipeline.
    const dropped = dealCloseTaxPortion({ ...YEAR, commissionGCI: COMMISSION, closingPipelineDealId: "p1" });
    const marked = dealCloseTaxPortion({
      ...YEAR,
      commissionGCI: COMMISSION,
      pipelineDeals: PIPELINE.map((d) => (d.id === "p1" ? { ...d, stage: "closed" } : d)),
    });
    expect(dropped).toEqual(marked);
  });

  it("leaving the row in the pipeline would count the deal twice", () => {
    const counted = dealCloseTaxPortion({ ...YEAR, commissionGCI: COMMISSION });
    const dropped = dealCloseTaxPortion({ ...YEAR, commissionGCI: COMMISSION, closingPipelineDealId: "p1" });
    expect(counted.projectedGCI).toBeGreaterThan(dropped.projectedGCI);
  });

  it("is less than the commission: a share of tax on net income cannot exceed the gross", () => {
    for (const commissionGCI of [1_500, 10_000, 45_000, 120_000]) {
      const portion = dealCloseTaxPortion({ ...YEAR, commissionGCI });
      expect(portion.taxPortion).toBeGreaterThan(0);
      expect(portion.taxPortion).toBeLessThan(commissionGCI);
    }
  });

  it("the first deal of the year has a portion: the projection already counts it", () => {
    const january = new Date(2026, 0, 20, 12);
    const portion = dealCloseTaxPortion({
      ...YEAR,
      settings: createTestSettings({ ...SETTINGS, goal_gci: 0 }),
      ytdGCI: 0,
      ytdDealCount: 0,
      pipelineDeals: [],
      listings: [],
      expensesYTD: 500,
      expensesRemaining: 5_500,
      commissionGCI: 12_000,
      now: january,
    });
    expect(portion.projectedGCI).toBeGreaterThanOrEqual(12_000);
    expect(portion.annualTaxEstimate).toBeGreaterThan(0);
    expect(portion.taxPortion).toBeGreaterThan(0);
  });

  it("a commission of 0 or less has no portion, and the year is estimated without it", () => {
    const portion = dealCloseTaxPortion({ ...YEAR, commissionGCI: -100 });
    expect(portion.taxPortion).toBe(0);
    expect(portion.commissionGCI).toBe(0);
  });
});
