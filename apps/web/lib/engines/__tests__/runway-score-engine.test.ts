/**
 * Layer 6: Runway Score Engine
 * ==============================
 * Tests for the composite 6-component health score.
 *
 * Weights: Goal Pace (30%), Pipeline (20%), Expenses (15%),
 *          Setup (10%), Benchmark (10%), Survival (15%)
 *
 * Grades: A+ (≥92), A (≥85), B (≥75), C (≥62), D (≥50), F (<50)
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
    readinessScore: 90,
    weakestLabel: "Pipeline",
    hasEnoughData: true,
    ...overrides,
  };
}

// ── Composite Score Calculation ──────────────────────────────────────────────

describe("Runway Score — Composite Calculation", () => {
  it("computes weighted average correctly", () => {
    // All components at 80 → composite = 80
    const report = makeReport({
      paceScore: 80,
      pipelineScore: 80,
      expenseScore: 80,
      readinessScore: 80,
    });
    const result = compute(report, 80, 6); // benchmark 80, survival 6+ months → score 95
    // Weighted: 80×0.3 + 80×0.2 + 80×0.15 + 80×0.1 + 80×0.1 + 95×0.15
    // = 24 + 16 + 12 + 8 + 8 + 14.25 = 82.25 → rounds to 82
    expect(result.score).toBe(82);
    expect(result.grade).toBe("B"); // 75–84
  });

  it("computes test agent score", () => {
    // Realistic scores for test agent Sarah Chen:
    // Pace: 90 (well ahead of pace at 183%)
    // Pipeline: 65 (3 deals, decent but not heavy)
    // Expenses: 80 (reasonable ratio)
    // Readiness: 85 (mostly configured)
    // Benchmark: 41 (41st percentile in growth cohort)
    // Survival: 11.54 months → score 95
    const report = makeReport({
      paceScore: 90,
      pipelineScore: 65,
      expenseScore: 80,
      readinessScore: 85,
    });
    const result = compute(report, 41, 11.54);
    // Weighted: 90×0.3 + 65×0.2 + 80×0.15 + 85×0.1 + 41×0.1 + 95×0.15
    // = 27 + 13 + 12 + 8.5 + 4.1 + 14.25 = 78.85 → rounds to 79
    expect(result.score).toBe(79);
    expect(result.grade).toBe("B");
  });

  it("returns all score components", () => {
    const report = makeReport();
    const result = compute(report, 50, 5);
    expect(result.components).toHaveLength(6);
    expect(result.components.map((c) => c.label)).toEqual([
      "Goal Pace", "Pipeline", "Expenses", "Setup", "Benchmark", "Survival",
    ]);
  });

  it("component weights sum to 1.0", () => {
    const report = makeReport();
    const result = compute(report, 50, 5);
    const totalWeight = result.components.reduce((s, c) => s + c.weightValue, 0);
    expect(totalWeight).toBeCloseTo(1.0, 10);
  });
});

// ── Survival Score Mapping ───────────────────────────────────────────────────

describe("Survival Score Mapping", () => {
  it("≥ 6 months → score 95", () => {
    const result = compute(makeReport({ paceScore: 50, pipelineScore: 50, expenseScore: 50, readinessScore: 50 }), 50, 6);
    const survivalComponent = result.components.find((c) => c.label === "Survival");
    expect(survivalComponent!.score).toBe(95);
  });

  it("≥ 4 months → score 75", () => {
    const result = compute(makeReport({ paceScore: 50, pipelineScore: 50, expenseScore: 50, readinessScore: 50 }), 50, 4);
    const survivalComponent = result.components.find((c) => c.label === "Survival");
    expect(survivalComponent!.score).toBe(75);
  });

  it("≥ 2 months → score 50", () => {
    const result = compute(makeReport({ paceScore: 50, pipelineScore: 50, expenseScore: 50, readinessScore: 50 }), 50, 2);
    const survivalComponent = result.components.find((c) => c.label === "Survival");
    expect(survivalComponent!.score).toBe(50);
  });

  it("≥ 1 month → score 25", () => {
    const result = compute(makeReport({ paceScore: 50, pipelineScore: 50, expenseScore: 50, readinessScore: 50 }), 50, 1);
    const survivalComponent = result.components.find((c) => c.label === "Survival");
    expect(survivalComponent!.score).toBe(25);
  });

  it("< 1 month → score 10", () => {
    const result = compute(makeReport({ paceScore: 50, pipelineScore: 50, expenseScore: 50, readinessScore: 50 }), 50, 0.5);
    const survivalComponent = result.components.find((c) => c.label === "Survival");
    expect(survivalComponent!.score).toBe(10);
  });
});

// ── Grade Boundaries ─────────────────────────────────────────────────────────

describe("Grade Boundaries", () => {
  // All components at X, benchmark at X, survival ≥ 6 → score 95 for survival
  // Composite ≈ X × 0.85 + 95 × 0.15 = X × 0.85 + 14.25
  // For score = 92 (A+): need X × 0.85 + 14.25 ≥ 92 → X ≥ 91.47 → 92
  // For score = 85 (A):  need X × 0.85 + 14.25 ≥ 85 → X ≥ 83.24 → 84

  it("A+ for score ≥ 92", () => {
    const report = makeReport({
      paceScore: 95, pipelineScore: 95, expenseScore: 95, readinessScore: 95,
    });
    const result = compute(report, 95, 10);
    expect(result.score).toBe(95);
    expect(result.grade).toBe("A+");
  });

  it("A for score 85–91", () => {
    const report = makeReport({
      paceScore: 88, pipelineScore: 88, expenseScore: 88, readinessScore: 88,
    });
    const result = compute(report, 88, 10);
    // 88 × 0.85 + 95 × 0.15 = 74.8 + 14.25 = 89.05 → 89
    expect(result.score).toBe(89);
    expect(result.grade).toBe("A");
  });

  it("F for score < 50", () => {
    const report = makeReport({
      paceScore: 20, pipelineScore: 20, expenseScore: 20, readinessScore: 20,
    });
    const result = compute(report, 20, 0.5); // survival score = 10
    // 20 × 0.85 + 10 × 0.15 = 17 + 1.5 = 18.5 → 19
    expect(result.score).toBe(19);
    expect(result.grade).toBe("F");
  });

  it("D for score 50–61", () => {
    const report = makeReport({
      paceScore: 50, pipelineScore: 50, expenseScore: 50, readinessScore: 50,
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
    expect(result.version).toBe("1.0");
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
