/**
 * Layer 6: Runway Score Engine
 * ==============================
 * Tests for the composite 5-component health score.
 *
 * v1.2 Weights: Goal Pace (35%), Pipeline (30%), Expenses (15%),
 *               Benchmark (5%), Survival (15%)
 *
 * Grades: A+ (≥92), A (≥85), B (≥75), C (≥62), D (≥50), F (<50)
 *
 * v1.2 changes:
 * - Benchmark reduced 10% → 5%, Pipeline increased 25% → 30%
 * - Not-configured survival: 50 → 35 (penalize missing data)
 */

import { describe, it, expect } from "vitest";
import { compute, stateLabel } from "../runway-score-engine";
import type { BusinessHealthReport } from "../runway-score-engine";

// ── Helper to make a health report ──────────────────────────────────────────

function makeReport(overrides: Partial<BusinessHealthReport> = {}): BusinessHealthReport {
  return {
    score: 0,
    grade: "",
    paceScore: 80,
    pipelineScore: 70,
    expenseScore: 85,
    readinessScore: 0, // kept for backward compat, not used in score
    weakestLabel: "Pipeline",
    hasEnoughData: true,
    ...overrides,
  };
}

// ── Composite Score Calculation ──────────────────────────────────────────────

describe("Runway Score — Composite Calculation", () => {
  it("computes weighted average correctly with v1.2 weights", () => {
    const report = makeReport({
      paceScore: 80,
      pipelineScore: 80,
      expenseScore: 80,
    });
    const result = compute(report, 80, 6); // benchmark 80, survival 6+ months → score 95
    // Weighted: 80×0.35 + 80×0.30 + 80×0.15 + 80×0.05 + 95×0.15
    // = 28 + 24 + 12 + 4 + 14.25 = 82.25 → rounds to 82
    expect(result.score).toBe(82);
    expect(result.grade).toBe("B"); // 75–84
  });

  it("computes test agent score with v1.2 weights", () => {
    const report = makeReport({
      paceScore: 90,
      pipelineScore: 65,
      expenseScore: 80,
    });
    const result = compute(report, 41, 11.54);
    // Weighted: 90×0.35 + 65×0.30 + 80×0.15 + 41×0.05 + 95×0.15
    // = 31.5 + 19.5 + 12 + 2.05 + 14.25 = 79.3 → rounds to 79
    expect(result.score).toBe(79);
    expect(result.grade).toBe("B");
  });

  it("returns all score components", () => {
    const report = makeReport();
    const result = compute(report, 50, 5);
    expect(result.components).toHaveLength(5);
    expect(result.components.map((c) => c.label)).toEqual([
      "Goal Pace", "Pipeline", "Expenses", "Benchmark", "Survival",
    ]);
  });

  it("component weights sum to 1.0", () => {
    const report = makeReport();
    const result = compute(report, 50, 5);
    const totalWeight = result.components.reduce((s, c) => s + c.weightValue, 0);
    expect(totalWeight).toBeCloseTo(1.0, 10);
  });

  it("readinessScore has no effect on final score", () => {
    const report1 = makeReport({ readinessScore: 0 });
    const report2 = makeReport({ readinessScore: 100 });
    const result1 = compute(report1, 50, 5);
    const result2 = compute(report2, 50, 5);
    expect(result1.score).toBe(result2.score);
  });

  it("benchmark at 5% weight has less impact than pipeline at 30%", () => {
    // Same everything, but swap benchmark and pipeline scores
    const report = makeReport({ paceScore: 70, pipelineScore: 90, expenseScore: 70 });
    const highPipeline = compute(report, 20, 5); // high pipeline, low benchmark

    const report2 = makeReport({ paceScore: 70, pipelineScore: 20, expenseScore: 70 });
    const highBenchmark = compute(report2, 90, 5); // low pipeline, high benchmark

    // High pipeline should win significantly
    expect(highPipeline.score).toBeGreaterThan(highBenchmark.score);
    expect(highPipeline.score - highBenchmark.score).toBeGreaterThanOrEqual(14);
  });
});

// ── Survival Score Mapping ───────────────────────────────────────────────────

describe("Survival Score Mapping", () => {
  it("≥ 6 months → score 95", () => {
    const result = compute(makeReport({ paceScore: 50, pipelineScore: 50, expenseScore: 50 }), 50, 6);
    const survivalComponent = result.components.find((c) => c.label === "Survival");
    expect(survivalComponent!.score).toBe(95);
  });

  it("≥ 4 months → score 75", () => {
    const result = compute(makeReport({ paceScore: 50, pipelineScore: 50, expenseScore: 50 }), 50, 4);
    const survivalComponent = result.components.find((c) => c.label === "Survival");
    expect(survivalComponent!.score).toBe(75);
  });

  it("≥ 2 months → score 50", () => {
    const result = compute(makeReport({ paceScore: 50, pipelineScore: 50, expenseScore: 50 }), 50, 2);
    const survivalComponent = result.components.find((c) => c.label === "Survival");
    expect(survivalComponent!.score).toBe(50);
  });

  it("≥ 1 month → score 25", () => {
    const result = compute(makeReport({ paceScore: 50, pipelineScore: 50, expenseScore: 50 }), 50, 1);
    const survivalComponent = result.components.find((c) => c.label === "Survival");
    expect(survivalComponent!.score).toBe(25);
  });

  it("< 1 month → score 10", () => {
    const result = compute(makeReport({ paceScore: 50, pipelineScore: 50, expenseScore: 50 }), 50, 0.5);
    const survivalComponent = result.components.find((c) => c.label === "Survival");
    expect(survivalComponent!.score).toBe(10);
  });

  it("not configured (-1) → score 35 (penalize missing data)", () => {
    const result = compute(makeReport({ paceScore: 50, pipelineScore: 50, expenseScore: 50 }), 50, -1);
    const survivalComponent = result.components.find((c) => c.label === "Survival");
    expect(survivalComponent!.score).toBe(35);
  });
});

// ── Incomplete Data Penalty ─────────────────────────────────────────────────

describe("Incomplete Data Penalty", () => {
  it("not-configured survival pulls score below neutral", () => {
    const report = makeReport({ paceScore: 50, pipelineScore: 50, expenseScore: 50 });
    const configured = compute(report, 50, 5);    // 4-5 months → 75
    const notConfigured = compute(report, 50, -1); // not configured → 35
    expect(notConfigured.score).toBeLessThan(configured.score);
  });
});

// ── Grade Boundaries ─────────────────────────────────────────────────────────

describe("Grade Boundaries", () => {
  it("A+ for score ≥ 92", () => {
    const report = makeReport({
      paceScore: 95, pipelineScore: 95, expenseScore: 95,
    });
    const result = compute(report, 95, 10);
    expect(result.score).toBe(95);
    expect(result.grade).toBe("A+");
  });

  it("A for score 85–91", () => {
    const report = makeReport({
      paceScore: 88, pipelineScore: 88, expenseScore: 88,
    });
    const result = compute(report, 88, 10);
    // 88 × 0.35 + 88 × 0.30 + 88 × 0.15 + 88 × 0.05 + 95 × 0.15
    // = 30.8 + 26.4 + 13.2 + 4.4 + 14.25 = 89.05 → 89
    expect(result.score).toBe(89);
    expect(result.grade).toBe("A");
  });

  it("F for score < 50", () => {
    const report = makeReport({
      paceScore: 20, pipelineScore: 20, expenseScore: 20,
    });
    const result = compute(report, 20, 0.5); // survival score = 10
    // 20 × 0.35 + 20 × 0.30 + 20 × 0.15 + 20 × 0.05 + 10 × 0.15
    // = 7 + 6 + 3 + 1 + 1.5 = 18.5 → 19
    expect(result.score).toBe(19);
    expect(result.grade).toBe("F");
  });

  it("D for score 50–61", () => {
    const report = makeReport({
      paceScore: 50, pipelineScore: 50, expenseScore: 50,
    });
    const result = compute(report, 50, 2); // survival = 50
    // All 50 → composite = 50
    expect(result.score).toBe(50);
    expect(result.grade).toBe("D");
  });
});

// ── State Label Boundaries ───────────────────────────────────────────────────
//
// The `stateLabel` function is the canonical neutral prose label for the
// Runway Score. It is what chat, insights, email text, the dashboard pill,
// and any other prose surface renders. The academic grade letter is retained
// as visual shorthand only. These boundary tests pin the band edges so they
// can never drift from the dashboard's historical `scoreBand` thresholds.

describe("State Label Boundaries", () => {
  it("< 41 → At Risk", () => {
    expect(stateLabel(0)).toBe("At Risk");
    expect(stateLabel(40)).toBe("At Risk");
  });

  it("41–60 → Building", () => {
    expect(stateLabel(41)).toBe("Building");
    expect(stateLabel(58)).toBe("Building"); // reported bug score
    expect(stateLabel(60)).toBe("Building");
  });

  it("61–80 → On Track", () => {
    expect(stateLabel(61)).toBe("On Track");
    expect(stateLabel(80)).toBe("On Track");
  });

  it("≥ 81 → Strong", () => {
    expect(stateLabel(81)).toBe("Strong");
    expect(stateLabel(100)).toBe("Strong");
  });

  it("compute() result exposes stateLabel matching the helper", () => {
    const report: BusinessHealthReport = {
      score: 0,
      grade: "",
      paceScore: 50,
      pipelineScore: 50,
      expenseScore: 50,
      readinessScore: 0,
      weakestLabel: "Pipeline",
      hasEnoughData: true,
    };
    const result = compute(report, 50, 2); // composite 50 → Building
    expect(result.stateLabel).toBe(stateLabel(result.score));
    expect(result.stateLabel).toBe("Building");
  });
});

// ── Metadata ─────────────────────────────────────────────────────────────────

describe("Score Metadata", () => {
  it("includes version string", () => {
    const result = compute(makeReport(), 50, 5);
    expect(result.version).toBe("1.2");
  });

  it("includes timestamp", () => {
    const result = compute(makeReport(), 50, 5);
    expect(result.timestamp).toBeInstanceOf(Date);
  });

  it("passes through hasEnoughData from health report", () => {
    const result1 = compute(makeReport({ hasEnoughData: true }), 50, 5);
    expect(result1.hasEnoughData).toBe(true);

    const result2 = compute(makeReport({ hasEnoughData: false }), 50, 5);
    expect(result2.hasEnoughData).toBe(false);
  });
});
