/**
 * Layer 8: Integration Tests — Full Pipeline
 * =============================================
 * Tests the complete computation pipeline that the Dashboard and Forecast
 * pages use: transactions → GCI → projections → tax → net income.
 *
 * This verifies the engines work correctly together with realistic data.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  computeGCI,
  computeAgentGross,
  computeTxFees,
  computeWeightedGCI,
} from "../../types/database";
import {
  seasonalFractionElapsed,
  projectedYearEndGCI,
  paceVsGoalPercent,
  monthlyGCITotals,
} from "../projection-engine";
import { calculate } from "../canadian-tax-engine";
import { survivalResult } from "../survival-engine";
import { compare } from "../benchmark-engine";
import { probabilityBands, fiveYearBands } from "../probabilistic-forecast-engine";
import { compute as computeRunwayScore } from "../runway-score-engine";
import type { BusinessHealthReport } from "../runway-score-engine";
import {
  TEST_TRANSACTIONS,
  TEST_PIPELINE,
  TEST_SETTINGS,
  TEST_EXPENSES,
  EXPECTED_GCI,
  EXPECTED_PIPELINE,
} from "./test-data";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 2, 11)); // March 11, 2026
});

afterEach(() => {
  vi.useRealTimers();
});

// ── Full Dashboard Pipeline ──────────────────────────────────────────────────

describe("Full Dashboard Pipeline", () => {
  // Step 1: Compute YTD GCI from transactions
  const ytdGCI = TEST_TRANSACTIONS.reduce((sum, tx) => sum + computeGCI(tx), 0);

  it("Step 1: YTD GCI = $66,375", () => {
    expect(ytdGCI).toBe(EXPECTED_GCI.total);
  });

  // Step 2: Compute pipeline weighted GCI
  const pipelineWeightedGCI = TEST_PIPELINE.reduce(
    (sum, d) => sum + computeWeightedGCI(d),
    0,
  );

  it("Step 2: Pipeline weighted GCI = $22,887.50", () => {
    expect(pipelineWeightedGCI).toBe(EXPECTED_PIPELINE.totalWeighted);
  });

  // Step 3: Seasonal fraction elapsed
  it("Step 3: Seasonal fraction ≈ 0.156", () => {
    const fraction = seasonalFractionElapsed(TEST_SETTINGS.national_quarter_pcts);
    expect(fraction).toBeCloseTo(0.155, 1);
  });

  // Step 4: Projected year-end GCI
  it("Step 4: Projected GCI from pace + pipeline", () => {
    const fraction = seasonalFractionElapsed(TEST_SETTINGS.national_quarter_pcts);
    const projected = projectedYearEndGCI(ytdGCI, pipelineWeightedGCI, fraction);
    // paceBasedProjection = 66375 / 0.156 ≈ 425481
    // + pipeline × 0.5 = 22887.5 × 0.5 = 11443.75
    // ≈ $436,925
    expect(projected).toBeGreaterThan(400_000); // pace-based, very high early in year
    expect(projected).toBeLessThan(500_000);
  });

  // Step 5: Agent gross from splits
  it("Step 5: Agent gross with 80/20 split", () => {
    const { agentGross, brokerageTake } = computeAgentGross(
      ytdGCI,
      TEST_SETTINGS.split_preset,
      TEST_SETTINGS.post_cap_threshold_gci,
      TEST_SETTINGS.post_cap_agent_pct,
    );
    // Below $100K cap: agent = 66375 × 0.8 = $53,100
    expect(agentGross).toBe(53_100);
    expect(brokerageTake).toBeCloseTo(13_275, 2);
    expect(agentGross + brokerageTake).toBeCloseTo(ytdGCI, 2);
  });

  // Step 6: Transaction fees
  it("Step 6: Transaction fees = $1,327.50", () => {
    const txFees = computeTxFees(
      ytdGCI,
      TEST_SETTINGS.tx_fee_rate_pct,
      TEST_SETTINGS.tx_fee_annual_cap,
    );
    expect(txFees).toBe(1_327.50); // 66375 × 0.02 = 1327.50, below $3K cap
  });

  // Step 7: Net pre-tax income
  it("Step 7: Net pre-tax = agentGross - txFees - brokerageFees", () => {
    const { agentGross } = computeAgentGross(
      ytdGCI,
      TEST_SETTINGS.split_preset,
      TEST_SETTINGS.post_cap_threshold_gci,
      TEST_SETTINGS.post_cap_agent_pct,
    );
    const txFees = computeTxFees(
      ytdGCI,
      TEST_SETTINGS.tx_fee_rate_pct,
      TEST_SETTINGS.tx_fee_annual_cap,
    );
    const brokerageFeeAnnual = TEST_SETTINGS.monthly_brokerage_fee * 12;
    const netPreTax = agentGross - txFees - brokerageFeeAnnual;
    // $53,100 - $1,327.50 - $6,000 = $45,772.50
    expect(netPreTax).toBeCloseTo(45_772.50, 2);
  });

  // Step 8: Tax calculation
  it("Step 8: Tax on net pre-tax income (Ontario)", () => {
    const netPreTax = 45_772.50;
    const taxResult = calculate(netPreTax, "ontario", 6);
    expect(taxResult.totalBurden).toBeGreaterThan(0);
    expect(taxResult.effectiveRate).toBeGreaterThan(0);
    expect(taxResult.effectiveRate).toBeLessThan(0.50); // sanity check
    // Quarterly estimate should be burden / 4
    expect(taxResult.quarterlyEstimate).toBeCloseTo(taxResult.totalBurden / 4, 2);
    // Per-deal set-aside should be burden / 6 deals
    expect(taxResult.perDealSetAside).toBeCloseTo(taxResult.totalBurden / 6, 2);
  });

  // Step 9: Survival
  it("Step 9: Survival result", () => {
    const survival = survivalResult(
      TEST_SETTINGS.monthly_brokerage_fee,
      TEST_EXPENSES.monthlyRecurring,
      TEST_SETTINGS.cash_reserve,
      0,
    );
    // burn = 500 + 800 = 1300, months = 15000 / 1300 = 11.54
    expect(survival.months).toBeCloseTo(11.54, 1);
    expect(survival.riskLevel).toBe("strong");
  });

  // Step 10: Benchmark
  it("Step 10: Benchmark comparison", () => {
    const benchmark = compare(ytdGCI, TEST_SETTINGS.experience_years);
    expect(benchmark.cohort).toBe("growth"); // 4 years
    expect(benchmark.percentile).toBe(41); // 41st percentile
    expect(benchmark.distanceToNextTier).toBe(29_625); // $96K - $66,375
  });

  // Step 11: Probability bands
  it("Step 11: Probability bands (low confidence, 3 months)", () => {
    const fraction = seasonalFractionElapsed(TEST_SETTINGS.national_quarter_pcts);
    const projected = projectedYearEndGCI(ytdGCI, pipelineWeightedGCI, fraction);
    const bands = probabilityBands(TEST_TRANSACTIONS, projected);
    expect(bands.confidence).toBe("low");
    expect(bands.monthsOfData).toBe(3);
    // Fixed bands at ±15% / ±30%
    expect(bands.p25).toBeCloseTo(projected * 0.85, 0);
    expect(bands.p75).toBeCloseTo(projected * 1.15, 0);
  });

  // Step 12: Runway Score
  it("Step 12: Runway Score composite", () => {
    const fraction = seasonalFractionElapsed(TEST_SETTINGS.national_quarter_pcts);
    const pacePercent = paceVsGoalPercent(TEST_SETTINGS.goal_gci, ytdGCI, fraction);

    // Build health report (simplified version of dashboard's buildHealthReport)
    const paceScore = Math.min(100, Math.max(0, 50 + pacePercent * 0.5));
    const pipelineScore = TEST_PIPELINE.length > 0 ? 65 : 20;
    const expenseRatio = TEST_EXPENSES.ytdExpenses / Math.max(1, ytdGCI);
    const expenseScore = expenseRatio < 0.25 ? 90 : expenseRatio < 0.35 ? 75 : 50;

    const healthReport: BusinessHealthReport = {
      score: 0,
      grade: "",
      paceScore,
      pipelineScore,
      expenseScore,
      readinessScore: 0,
      weakestLabel: "Pipeline",
      hasEnoughData: true,
    };

    const benchmark = compare(ytdGCI, TEST_SETTINGS.experience_years);
    const survival = survivalResult(
      TEST_SETTINGS.monthly_brokerage_fee,
      TEST_EXPENSES.monthlyRecurring,
      TEST_SETTINGS.cash_reserve,
      0,
    );

    const runwayScore = computeRunwayScore(
      healthReport,
      benchmark.percentile,
      survival.months,
    );

    expect(runwayScore.score).toBeGreaterThan(0);
    expect(runwayScore.score).toBeLessThanOrEqual(100);
    expect(runwayScore.grade).toMatch(/^(A\+|A|B|C|D|F)$/);
    expect(runwayScore.components).toHaveLength(5);
  });
});

// ── Full Forecast Pipeline (Net After Tax) ───────────────────────────────────

describe("Full Forecast Pipeline", () => {
  it("computes projected net after tax for full year", () => {
    // 1. Projected year-end GCI
    const fraction = seasonalFractionElapsed(TEST_SETTINGS.national_quarter_pcts);
    const pipelineWeightedGCI = TEST_PIPELINE.reduce(
      (sum, d) => sum + computeWeightedGCI(d),
      0,
    );
    const ytdGCI = EXPECTED_GCI.total;
    const projectedGCI = projectedYearEndGCI(ytdGCI, pipelineWeightedGCI, fraction);

    // 2. Agent gross on projected GCI (will exceed cap at ~$436K)
    const { agentGross } = computeAgentGross(
      projectedGCI,
      TEST_SETTINGS.split_preset,
      TEST_SETTINGS.post_cap_threshold_gci,
      TEST_SETTINGS.post_cap_agent_pct,
    );
    // Pre-cap: $100K × 0.8 = $80K
    // Post-cap: (projectedGCI - $100K) × 0.95
    expect(agentGross).toBeGreaterThan(80_000); // Must include post-cap portion

    // 3. Transaction fees
    const txFees = computeTxFees(
      projectedGCI,
      TEST_SETTINGS.tx_fee_rate_pct,
      TEST_SETTINGS.tx_fee_annual_cap,
    );
    expect(txFees).toBe(3_000); // capped at $3K (projectedGCI × 2% > $3K)

    // 4. Net for tax
    const brokerageFeeAnnual = TEST_SETTINGS.monthly_brokerage_fee * 12;
    const netForTax = agentGross - txFees - brokerageFeeAnnual;
    expect(netForTax).toBeGreaterThan(0);

    // 5. Tax
    const projectedDeals = 6; // current count for now
    const taxResult = calculate(netForTax, TEST_SETTINGS.province, projectedDeals);
    expect(taxResult.effectiveRate).toBeGreaterThan(0.2); // Should be 20%+ at this income

    // 6. After-tax net
    const afterTax = netForTax - taxResult.totalBurden;
    expect(afterTax).toBeGreaterThan(0);
    expect(afterTax).toBeLessThan(netForTax); // Tax reduces income

    // 7. Annual expense deduction
    const annualExpenses = TEST_EXPENSES.ytdExpenses + TEST_EXPENSES.monthlyRecurring * 9;
    // 8500 + 800 × 9 = 15700
    expect(annualExpenses).toBe(15_700);
  });
});

// ── Monthly GCI Totals → Pipeline Consistency ────────────────────────────────

describe("Monthly Totals Consistency", () => {
  it("monthly totals sum equals YTD GCI", () => {
    const totals = monthlyGCITotals(TEST_TRANSACTIONS);
    const totalFromMonthly = totals.reduce((a, b) => a + b, 0);
    expect(totalFromMonthly).toBe(EXPECTED_GCI.total);
  });
});

// ── 5-Year Projection Pipeline ──────────────────────────────────────────────

describe("5-Year Projection Pipeline", () => {
  it("projects 5 years with widening bands", () => {
    const ytdGCI = EXPECTED_GCI.total;
    const fraction = seasonalFractionElapsed(TEST_SETTINGS.national_quarter_pcts);
    const pipelineWeightedGCI = EXPECTED_PIPELINE.totalWeighted;
    const projected = projectedYearEndGCI(ytdGCI, pipelineWeightedGCI, fraction);

    const currentBands = probabilityBands(TEST_TRANSACTIONS, projected);
    // TEST_SETTINGS.growth_goal_year_pcts is seeded as decimals in the fixture
    // (see test-data.ts header). fiveYearBands expects decimals directly.
    const growthRates = TEST_SETTINGS.growth_goal_year_pcts;

    const fiveYear = fiveYearBands(projected, growthRates, currentBands);
    expect(fiveYear).toHaveLength(5);

    // Each year's p50 should be greater than or equal to the previous
    for (let i = 1; i < 5; i++) {
      expect(fiveYear[i].p50).toBeGreaterThanOrEqual(fiveYear[i - 1].p50);
    }

    // P10 < P25 < P50 < P75 < P90 for each year
    for (const year of fiveYear) {
      expect(year.p10).toBeLessThanOrEqual(year.p25);
      expect(year.p25).toBeLessThan(year.p50);
      expect(year.p50).toBeLessThan(year.p75);
      expect(year.p75).toBeLessThan(year.p90);
    }
  });
});

// ── Edge Cases: Zero Data ────────────────────────────────────────────────────

describe("Edge Cases — Zero Data", () => {
  it("handles agent with zero transactions", () => {
    const ytdGCI = 0;
    const fraction = seasonalFractionElapsed([0.25, 0.25, 0.25, 0.25]);
    const projected = projectedYearEndGCI(ytdGCI, 0, fraction);
    expect(projected).toBe(0);

    const { agentGross } = computeAgentGross(0, "p80_20", 100_000, 0.95);
    expect(agentGross).toBe(0);

    const txFees = computeTxFees(0, 0.02, 3_000);
    expect(txFees).toBe(0);

    const taxResult = calculate(0, "ontario", 0);
    expect(taxResult.totalBurden).toBe(0);

    const survival = survivalResult(500, 800, 15_000, 0);
    expect(survival.months).toBeCloseTo(11.54, 1); // Cash still provides runway
    expect(survival.riskLevel).toBe("strong");

    const benchmark = compare(0, 4);
    expect(benchmark.percentile).toBe(0);
  });

  it("handles very high income agent ($1M GCI)", () => {
    const ytdGCI = 1_000_000;
    const { agentGross } = computeAgentGross(ytdGCI, "p80_20", 100_000, 0.95);
    // Pre-cap: 100K × 0.8 = 80K
    // Post-cap: 900K × 0.95 = 855K
    // Total: 935K
    expect(agentGross).toBe(935_000);

    const taxResult = calculate(agentGross, "ontario", 30);
    // Very high income → high effective rate
    expect(taxResult.effectiveRate).toBeGreaterThan(0.40);
    expect(taxResult.effectiveRate).toBeLessThan(0.60);

    const benchmark = compare(ytdGCI, 4);
    expect(benchmark.percentile).toBe(99);
  });
});
