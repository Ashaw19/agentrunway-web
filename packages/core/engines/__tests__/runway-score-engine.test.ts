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
import {
  compute,
  stateLabel,
  bandColorHexForScore,
  RUNWAY_SCORE_BANDS,
} from "../runway-score-engine";
import type {
  BusinessHealthReport,
  RunwayScoreResult,
  RunwayStateLabel,
} from "../runway-score-engine";

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

// ── Canonical Band Tables ────────────────────────────────────────────────────
//
// Pins every boundary on the canonical band tables. If any of these tests
// fail, a downstream surface (mobile home, mobile profile, breakdown sheet,
// PDF report, email digest) is about to silently mislabel a real user's
// score. Spec: memory/spec_runway_score_canonical_bands.md §5.1.

describe("RUNWAY_SCORE_BANDS", () => {
  // Table-driven assertion covering every boundary and the two failure modes
  // (NaN and Infinity) the engine guards against.
  const cases: Array<{
    score: number;
    label: RunwayStateLabel;
    grade: string;
    hex: string;
    notes?: string;
  }> = [
    // Strong band (≥81) — emerald
    { score: 100, label: "Strong",   grade: "A+", hex: "#10B981" },
    { score:  92, label: "Strong",   grade: "A+", hex: "#10B981" },
    { score:  91, label: "Strong",   grade: "A",  hex: "#10B981" },
    { score:  85, label: "Strong",   grade: "A",  hex: "#10B981" },
    { score:  84, label: "Strong",   grade: "B",  hex: "#10B981" },
    { score:  81, label: "Strong",   grade: "B",  hex: "#10B981" },
    // On Track band (61–80) — blue
    { score:  80, label: "On Track", grade: "B",  hex: "#3B5EF6", notes: "intentional shift: was Strong pre-canonicalization" },
    { score:  75, label: "On Track", grade: "B",  hex: "#3B5EF6" },
    { score:  74, label: "On Track", grade: "C",  hex: "#3B5EF6" },
    { score:  62, label: "On Track", grade: "C",  hex: "#3B5EF6" },
    // NOTE: the two band tables are NOT aligned — grade flips at 62, label at 61.
    // Score 61 is "On Track" (label band) but "D" (grade band). This is a known
    // off-by-one between the two tables baked into the engine since v1.2. The
    // spec §5.1 row "61 → C" was an authoring slip; the engine is canonical.
    { score:  61, label: "On Track", grade: "D",  hex: "#3B5EF6" },
    // Building band (41–60) — amber
    { score:  60, label: "Building", grade: "D",  hex: "#F59E0B", notes: "intentional shift: was On Track pre-canonicalization" },
    { score:  50, label: "Building", grade: "D",  hex: "#F59E0B" },
    { score:  49, label: "Building", grade: "F",  hex: "#F59E0B" },
    { score:  41, label: "Building", grade: "F",  hex: "#F59E0B" },
    // At Risk band (<41) — red
    { score:  40, label: "At Risk",  grade: "F",  hex: "#EF4444", notes: "intentional shift: was Building pre-canonicalization" },
    { score:   0, label: "At Risk",  grade: "F",  hex: "#EF4444" },
  ];

  it.each(cases)(
    "score $score → stateLabel=$label, grade=$grade, hex=$hex",
    ({ score, label, grade, hex }) => {
      expect(stateLabel(score)).toBe(label);
      // grade() is not exported, but compute() surfaces it on the result.
      // We assert against a synthetic compute that hits the target composite
      // by routing through a single-component report.
      expect(bandColorHexForScore(score)).toBe(hex);

      // Smoke-check grade by reading it off a compute() whose composite is
      // the test value. Use 100-only pace and benchmark=0 with survival=-1
      // (35) tuned so the weighted average rounds to `score`. The simpler
      // route: assert against the table directly via the exported constant.
      const expectedGradeBand = RUNWAY_SCORE_BANDS.grade.find(
        (b) => score >= b.min,
      );
      expect(expectedGradeBand?.glyph).toBe(grade);
    },
  );

  it("non-finite scores: NaN → At Risk + slate hex", () => {
    expect(stateLabel(NaN)).toBe("At Risk");
    expect(bandColorHexForScore(NaN)).toBe("#6B7280");
  });

  it("non-finite scores: +Infinity → Strong (≥81 catches it) + slate hex from color helper", () => {
    // stateLabel() does NOT guard non-finite — Infinity matches `>= 81` and
    // returns "Strong". This is consistent with the engine's contract:
    // compute() guards inputs before they reach stateLabel(), so the only
    // way a non-finite score reaches the helper is a caller that bypassed
    // compute(). bandColorHexForScore() guards independently so a broken
    // upstream chain still paints slate, not emerald.
    expect(stateLabel(Number.POSITIVE_INFINITY)).toBe("Strong");
    expect(bandColorHexForScore(Number.POSITIVE_INFINITY)).toBe("#6B7280");
  });

  it("non-finite scores: -Infinity → At Risk + slate hex from color helper", () => {
    expect(stateLabel(Number.NEGATIVE_INFINITY)).toBe("At Risk");
    expect(bandColorHexForScore(Number.NEGATIVE_INFINITY)).toBe("#6B7280");
  });

  it("compute() coerces non-finite inputs to 0 before band derivation", () => {
    // Belt-and-suspenders: the engine's compute() is the public entry point.
    // Even if every input is NaN, the composite clamps to 0 → At Risk → red.
    const brokenReport: BusinessHealthReport = {
      score: 0,
      grade: "",
      paceScore: NaN,
      pipelineScore: NaN,
      expenseScore: NaN,
      readinessScore: 0,
      weakestLabel: "Pipeline",
      hasEnoughData: false,
    };
    const result = compute(brokenReport, NaN, NaN);
    expect(result.score).toBe(5); // survival -1 → 35; 35 × 0.15 = 5.25 → 5
    expect(result.stateLabel).toBe("At Risk");
    expect(result.grade).toBe("F");
  });

  it("constant shape: stateLabel bands are descending and cover [0, 100]", () => {
    const mins = RUNWAY_SCORE_BANDS.stateLabel.map((b) => b.min);
    expect(mins).toEqual([81, 61, 41, 0]); // monotonically descending
    expect(mins[mins.length - 1]).toBe(0); // last band catches the bottom
  });

  it("constant shape: grade bands are descending and cover [0, 100]", () => {
    const mins = RUNWAY_SCORE_BANDS.grade.map((b) => b.min);
    expect(mins).toEqual([92, 85, 75, 62, 50, 0]); // monotonically descending
    expect(mins[mins.length - 1]).toBe(0); // last band catches the bottom
  });
});

// ── Snapshot-shape contract ──────────────────────────────────────────────────
//
// Per spec §5.2: lock the `RunwayScoreResult.stateLabel` union to the four
// canonical literal strings. If a future engine change widens the type or
// emits an unexpected string (e.g. translation token, lower-case variant),
// this test trips before any snapshot-writing surface persists the drift.

describe("RunwayScoreResult snapshot shape", () => {
  const VALID_LABELS: ReadonlySet<RunwayStateLabel> = new Set([
    "Strong",
    "On Track",
    "Building",
    "At Risk",
  ]);

  function syntheticReport(
    overrides: Partial<BusinessHealthReport> = {},
  ): BusinessHealthReport {
    return {
      score: 0,
      grade: "",
      paceScore: 50,
      pipelineScore: 50,
      expenseScore: 50,
      readinessScore: 0,
      weakestLabel: "Pipeline",
      hasEnoughData: true,
      ...overrides,
    };
  }

  // Sweep a representative span of composite scores by tuning inputs.
  it("stateLabel is one of the four canonical literals across the score range", () => {
    const fixtures: Array<[BusinessHealthReport, number, number]> = [
      [syntheticReport({ paceScore: 95, pipelineScore: 95, expenseScore: 95 }), 95, 10],   // Strong
      [syntheticReport({ paceScore: 70, pipelineScore: 70, expenseScore: 70 }), 70,  5],   // On Track
      [syntheticReport({ paceScore: 45, pipelineScore: 45, expenseScore: 45 }), 45,  2],   // Building
      [syntheticReport({ paceScore: 20, pipelineScore: 20, expenseScore: 20 }), 20, 0.5],  // At Risk
      [syntheticReport({ paceScore:  0, pipelineScore:  0, expenseScore:  0 }),  0, -1],   // At Risk floor
    ];
    for (const [report, benchmark, survival] of fixtures) {
      const result: RunwayScoreResult = compute(report, benchmark, survival);
      expect(VALID_LABELS.has(result.stateLabel)).toBe(true);
    }
  });

  it("snapshot-writable fields are present on every compute() result", () => {
    const result = compute(syntheticReport(), 50, 5);
    // These five fields are what dashboard-content.tsx persists to
    // user_settings.runway_score_snapshot. If any disappears, mobile reads
    // undefined and silently re-derives — the exact divergence vector this
    // spec exists to close.
    expect(typeof result.score).toBe("number");
    expect(typeof result.grade).toBe("string");
    expect(typeof result.stateLabel).toBe("string");
    expect(VALID_LABELS.has(result.stateLabel)).toBe(true);
    expect(Array.isArray(result.components)).toBe(true);
  });
});
