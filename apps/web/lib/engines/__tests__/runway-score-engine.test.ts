/**
 * Layer 6: Runway Score Engine
 * ==============================
 * Tests for the composite 5-component health score.
 *
 * Weights: Goal Pace (35%), Pipeline (25%), Expenses (15%),
 *          Benchmark (10%), Survival (15%)
 *
 * Grades: A+ (≥92), A (≥85), B (≥75), C (≥62), D (≥50), F (<50)
 *
 * NOTE: "Setup" (readinessScore) was removed in v1.1 — it measured
 * app configuration completeness, not business health.
 */

import { describe, it, expect } from "vitest";
import { compute } from "@/lib/engines/runway-score-engine";
import type { BusinessHealthReport } from "@/lib/engines/runway-score-engine";

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
  it("computes weighted average correctly", () => {
    const report = makeReport({
      paceScore: 80,
      pipelineScore: 80,
      expenseScore: 80,
    });
    const result = compute(report, 80, 6); // benchmark 80, survival 6+ months → score 95
    // Weighted: 80×0.35 + 80×0.25 + 80×0.15 + 80×0.1 + 95×0.15
    // = 28 + 20 + 12 + 8 + 14.25 = 82.25 → rounds to 82
    expect(result.score).toBe(82);
    expect(result.grade).toBe("B"); // 75–84
  });

  it("computes test agent score", () => {
    const report = makeReport({
      paceScore: 90,
      pipelineScore: 65,
      expenseScore: 80,
    });
    const result = compute(report, 41, 11.54);
    // Weighted: 90×0.35 + 65×0.25 + 80×0.15 + 41×0.1 + 95×0.15
    // = 31.5 + 16.25 + 12 + 4.1 + 14.25 = 78.1 → rounds to 78
    expect(result.score).toBe(78);
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
    // 88 × 0.85 + 95 × 0.15 = 74.8 + 14.25 = 89.05 → 89
    expect(result.score).toBe(89);
    expect(result.grade).toBe("A");
  });

  it("F for score < 50", () => {
    const report = makeReport({
      paceScore: 20, pipelineScore: 20, expenseScore: 20,
    });
    const result = compute(report, 20, 0.5); // survival score = 10
    // 20 × 0.85 + 10 × 0.15 = 17 + 1.5 = 18.5 → 19
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

// ── Metadata ─────────────────────────────────────────────────────────────────

describe("Score Metadata", () => {
  it("includes version string", () => {
    const result = compute(makeReport(), 50, 5);
    expect(result.version).toBe("1.1");
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
