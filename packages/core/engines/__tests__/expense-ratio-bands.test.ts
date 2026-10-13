/**
 * Expense ratio bands: one scheme, read by the Runway Score, the insight and
 * advisor cards, and every screen that colours or describes the ratio.
 *
 * Until 2026-10-13 the app carried two benchmarks ("25–30%" and "25–35%")
 * and three sets of colour cut-offs (30/40, 35/50 and the score's 25/35/50),
 * so a 33% ratio was healthy to the Runway Score, amber on Reports and green
 * on Expenses. The cut-offs here are the Runway Score's, unchanged: moving
 * them would move every agent's score.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  EXPENSE_RATIO_BANDS,
  EXPENSE_RATIO_COPY,
  EXPENSE_RATIO_GAUGE_MAX,
  EXPENSE_RATIO_TARGET_MAX,
  expenseRatioBand,
  expenseRatioBandRange,
  expenseRatioColorHex,
  expenseRatioTone,
  expenseRatioVsTarget,
  isExpenseRatioAboveTarget,
} from "../expense-ratio-bands";
import { buildHealthReport, expenseSubScore } from "../health-report";
import { bandColorHexForScore } from "../runway-score-engine";
import { generateInsights, type InsightsInput } from "../insights-engine";
import { generateAdvisory, type AdvisorInput } from "../advisor-engine";
import { EXPECTED_GCI, TEST_DATE, TEST_TRANSACTIONS } from "./test-data";

describe("EXPENSE_RATIO_BANDS", () => {
  it("has the Runway Score's cut-offs: 25%, 35% and 50% of GCI", () => {
    expect(EXPENSE_RATIO_BANDS.map((b) => [b.key, b.max, b.subScore])).toEqual([
      ["wellWithin", 0.25, 90],
      ["within", 0.35, 75],
      ["above", 0.5, 55],
      ["wellAbove", Infinity, 30],
    ]);
  });

  it("is ordered from the lowest ratio up, and the target is a band edge", () => {
    const maxes = EXPENSE_RATIO_BANDS.map((b) => b.max);
    expect([...maxes].sort((a, b) => a - b)).toEqual(maxes);
    expect(maxes).toContain(EXPENSE_RATIO_TARGET_MAX);
    expect(maxes).toContain(EXPENSE_RATIO_GAUGE_MAX);
  });

  it("gives each band the colour the dashboard gives its Runway sub-score", () => {
    for (const band of EXPENSE_RATIO_BANDS) {
      expect(band.hex).toBe(bandColorHexForScore(band.subScore));
    }
  });

  it("states each band's range from its own edges", () => {
    expect(EXPENSE_RATIO_BANDS.map(expenseRatioBandRange)).toEqual([
      "25% or less",
      "over 25% to 35%",
      "over 35% to 50%",
      "over 50%",
    ]);
  });
});

describe("expenseRatioBand", () => {
  it.each([
    [0.01, "wellWithin"],
    [0.25, "wellWithin"],
    [0.2501, "within"],
    [0.33, "within"],
    [0.35, "within"],
    [0.3501, "above"],
    [0.5, "above"],
    [0.5001, "wellAbove"],
    [1.4, "wellAbove"],
  ])("a ratio of %f is %s", (ratio, key) => {
    expect(expenseRatioBand(ratio)?.key).toBe(key);
  });

  it.each([0, -0.2, NaN, Infinity, -Infinity])(
    "has no band for %f: no GCI, or no expenses recorded",
    (ratio) => {
      expect(expenseRatioBand(ratio)).toBeNull();
      expect(expenseRatioTone(ratio)).toBe("slate");
      expect(expenseRatioColorHex(ratio)).toBe("#6B7280");
      expect(expenseRatioVsTarget(ratio)).toBeNull();
    },
  );

  it("33% reads the same everywhere: within target, blue", () => {
    expect(expenseRatioBand(0.33)?.label).toBe("Within target");
    expect(expenseRatioTone(0.33)).toBe("blue");
    expect(expenseRatioColorHex(0.33)).toBe("#3B5EF6");
    expect(isExpenseRatioAboveTarget(0.33)).toBe(false);
  });

  it("is above target only past 35%", () => {
    expect(isExpenseRatioAboveTarget(0.35)).toBe(false);
    expect(isExpenseRatioAboveTarget(0.3501)).toBe(true);
    expect(isExpenseRatioAboveTarget(NaN)).toBe(false);
  });
});

describe("EXPENSE_RATIO_COPY", () => {
  it("words the target as Agent Runway's, from the number", () => {
    expect(EXPENSE_RATIO_COPY.targetShort).toBe("35% or less");
    expect(EXPENSE_RATIO_COPY.target).toBe("35% of GCI or less");
    expect(EXPENSE_RATIO_COPY.targetCaption).toBe("Target: 35% or less");
    expect(EXPENSE_RATIO_COPY.targetPhrase).toBe("Agent Runway's target of 35% of GCI or less");
  });

  it("never calls the target an industry figure", () => {
    const claims = /industry (benchmark|average|standard)|widely cited|typical/i;
    const { provenance, ...statements } = EXPENSE_RATIO_COPY;
    for (const text of Object.values(statements)) {
      expect(text).not.toMatch(claims);
    }
    expect(provenance).toBe("It is Agent Runway's own target, not an industry statistic.");
  });

  it("places a ratio against the target in words", () => {
    expect(expenseRatioVsTarget(0.2)).toBe("well within Agent Runway's target of 35% of GCI or less");
    expect(expenseRatioVsTarget(0.33)).toBe("within Agent Runway's target of 35% of GCI or less");
    expect(expenseRatioVsTarget(0.41)).toBe("above Agent Runway's target of 35% of GCI or less");
    expect(expenseRatioVsTarget(0.62)).toBe("well above Agent Runway's target of 35% of GCI or less");
  });
});

describe("Runway Score expense sub-score", () => {
  it.each([
    [0.2, 90],
    [0.25, 90],
    [0.33, 75],
    [0.35, 75],
    [0.41, 55],
    [0.5, 55],
    [0.62, 30],
  ])("a ratio of %f scores %i, as it did before the bands were shared", (ratio, score) => {
    const ytdGCI = 100_000;
    expect(expenseSubScore(ytdGCI, ytdGCI * ratio)).toBe(score);
    expect(buildHealthReport(ytdGCI, 200_000, 0.5, 0, ytdGCI * ratio).expenseScore).toBe(score);
    expect(expenseRatioBand(ratio)?.subScore).toBe(score);
  });

  it("scores 35 with GCI and no expenses recorded, 50 with no GCI", () => {
    expect(expenseSubScore(100_000, 0)).toBe(35);
    expect(expenseSubScore(0, 0)).toBe(50);
    expect(expenseSubScore(0, 4_000)).toBe(50);
  });
});

describe("insight cards", () => {
  function insightsAt(ratio: number) {
    const input: InsightsInput = {
      transactions: TEST_TRANSACTIONS,
      pipelineDeals: [],
      goalGCI: 0,
      seasonalWeights: [0.25, 0.25, 0.25, 0.25],
      expensesYTD: EXPECTED_GCI.total * ratio,
      monthlyRecurringExpenses: 0,
      capIsConfigured: false,
      hasHitCap: false,
      gciRemainingToCap: 0,
      postCapAgentPct: 0,
      estimatedCapMonth: null,
      forecastReadiness: 1,
      now: TEST_DATE,
    };
    return generateInsights(input, 50).filter((i) => /expense/i.test(i.title));
  }

  it("says nothing about a ratio within target", () => {
    expect(insightsAt(0.2)).toEqual([]);
    expect(insightsAt(0.33)).toEqual([]);
  });

  it("names Agent Runway's target, not an industry average, above it", () => {
    const [tip] = insightsAt(0.41);
    expect(tip.type).toBe("tip");
    expect(tip.message).toBe("Expenses are 41% of GCI. Agent Runway's target is 35% or less.");
  });

  it("prints the decimal when rounding would land on the target", () => {
    const [tip] = insightsAt(0.352);
    expect(tip.message).toBe("Expenses are 35.2% of GCI. Agent Runway's target is 35% or less.");
  });

  it("warns once the ratio is well above target", () => {
    const [warning] = insightsAt(0.62);
    expect(warning.type).toBe("warning");
    expect(warning.title).toBe("High Expense Ratio");
  });
});

describe("advisor card", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(TEST_DATE);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function cardAt(ratio: number) {
    const projectedYearEndGCI = 200_000;
    const input: AdvisorInput = {
      transactions: TEST_TRANSACTIONS,
      pipelineDeals: [],
      goalGCI: 0,
      splitPreset: "p100_0",
      seasonalWeights: [0.25, 0.25, 0.25, 0.25],
      expensesYTD: projectedYearEndGCI * ratio * 0.4,
      expensesRemaining: projectedYearEndGCI * ratio * 0.6,
      projectedYearEndGCI,
      marketYoYGrowth: 0,
      benchmarkPercentile: 50,
      survivalMonths: 12,
      capIsConfigured: false,
      hasHitCap: false,
      gciRemainingToCap: 0,
      postCapAgentPct: 0,
    };
    return generateAdvisory(input, 50).find((c) => c.category === "expenseBenchmark");
  }

  it("is not shown at 33%, which is within target", () => {
    expect(cardAt(0.33)).toBeUndefined();
    expect(cardAt(0.35)).toBeUndefined();
  });

  it("measures the saving to the target it names", () => {
    const card = cardAt(0.4);
    expect(card?.title).toBe("Trim Expenses to Target");
    expect(card?.evidence).toEqual([
      "Expense ratio: 40% of projected GCI",
      "Agent Runway's target: 35% or less",
    ]);
    // 40% of $200,000 is $80,000; 35% is $70,000.
    expect(card?.impactValue).toBeCloseTo(10_000, 6);
  });
});
