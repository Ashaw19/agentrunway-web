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
 *
 * v1.3 changes:
 * - Survival sub-score re-anchored to "6+ months is strong":
 *   >=6 → 95 (Strong), 5–<6 → 58, 4–<5 → 50, 3–<4 → 42 (Building/watch),
 *   2–<3 → 30, 1–<2 → 20, <1 → 10 (At Risk). A 4.2-month account moves
 *   from 75 (top-tier) to 50 (Building) so the survival bar matches the
 *   dashboard's runway narrative.
 *
 * v1.4 changes:
 * - Survival sub-score follows the survival engine's cash runway bands:
 *   Critical runways score At Risk, Warning and Healthy score Building,
 *   Strong scores Strong. One step moved: 2–<3 months, 30 → 41.
 */

import { describe, it, expect } from "vitest";
import {
  compute,
  gradeForScore,
  stateLabel,
  bandColorHexForScore,
  survivalSubScore,
  RUNWAY_SCORE_BANDS,
  SCORE_VERSION,
  SURVIVAL_SCORE_STEPS,
} from "../runway-score-engine";
import {
  riskLevelFromMonths,
  RISK_BAND_FLOOR_MONTHS,
  RISK_BAND_LEVELS,
} from "../survival-engine";
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
//
// v1.4: the Survival sub-score follows the cash runway's band in the survival
// engine, a step per month inside a band. Critical runways score At Risk,
// Warning and Healthy score Building, Strong scores Strong, so the Survival
// bar is the colour of the Cash Runway number beside it. That agreement is
// held at every band in survival-engine.test.ts ("Runway Score Survival
// sub-score"); this block holds the ladder itself.

function survivalScoreFor(months: number): number {
  const result = compute(
    makeReport({ paceScore: 50, pipelineScore: 50, expenseScore: 50 }),
    50,
    months,
  );
  return result.components.find((c) => c.label === "Survival")!.score;
}

/** The v1.3 ladder, kept to show which scores v1.4 moved. */
function v13SurvivalScore(months: number): number {
  if (months >= 6) return 95;
  if (months >= 5) return 58;
  if (months >= 4) return 50;
  if (months >= 3) return 42;
  if (months >= 2) return 30;
  if (months >= 1) return 20;
  return 10;
}

/** Every hundredth of a month from 0 to the engine's 24-month cap. */
const EVERY_HUNDREDTH = Array.from({ length: 2401 }, (_, i) => i / 100);

describe("Survival Score Mapping (v1.4: follows the cash runway bands)", () => {
  it.each([
    [0, 10],
    [0.5, 10],
    [0.99, 10],
    [1, 20],
    [1.99, 20],
    [2, 41],
    [2.5, 41],
    [2.99, 41],
    [3, 42],
    [3.99, 42],
    [4, 50],
    [4.2, 50],
    [4.99, 50],
    [5, 58],
    [5.99, 58],
    [6, 95],
    [11.54, 95],
    [24, 95],
  ])("%s months → %s", (months, score) => {
    expect(survivalScoreFor(months)).toBe(score);
  });

  it("a Warning runway under 3 months is Building, not At Risk", () => {
    // v1.3 scored it 30: a red Survival bar beside an amber Cash Runway number.
    expect(riskLevelFromMonths(2.5)).toBe("warning");
    expect(stateLabel(survivalScoreFor(2.5))).toBe("Building");
    expect(stateLabel(survivalScoreFor(1.99))).toBe("At Risk");
  });

  it("moved one step from v1.3: 2 to under 3 months, 30 → 41", () => {
    const moved = EVERY_HUNDREDTH.filter((m) => survivalScoreFor(m) !== v13SurvivalScore(m));
    expect(moved[0]).toBe(2);
    expect(moved[moved.length - 1]).toBe(2.99);
    expect(moved).toHaveLength(100);
    expect(new Set(moved.map(v13SurvivalScore))).toEqual(new Set([30]));
    expect(new Set(moved.map(survivalScoreFor))).toEqual(new Set([41]));
  });

  it("that step lifts the composite by 15% of 11 points", () => {
    // 50×0.35 + 50×0.30 + 50×0.15 + 50×0.05 = 42.5, plus Survival × 0.15:
    // v1.3 30 → 47.0; v1.4 41 → 48.65 → 49.
    const report = makeReport({ paceScore: 50, pipelineScore: 50, expenseScore: 50 });
    expect(compute(report, 50, 2.5).score).toBe(49);
  });

  it("never falls as the runway grows", () => {
    const scores = EVERY_HUNDREDTH.map(survivalScoreFor);
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeGreaterThanOrEqual(scores[i - 1]);
    }
  });

  it("not configured (-1) → 35 (penalize missing data)", () => {
    expect(survivalScoreFor(-1)).toBe(35);
  });

  it("a non-finite month count is missing data, not a runway", () => {
    expect(survivalScoreFor(Number.NaN)).toBe(35);
    expect(survivalScoreFor(Number.POSITIVE_INFINITY)).toBe(35);
    expect(survivalScoreFor(Number.NEGATIVE_INFINITY)).toBe(35);
  });

  it("compute()'s Survival component is survivalSubScore()", () => {
    for (const months of [-1, 0, 1.9, 2.5, 3, 4.2, 5.99, 6, 24]) {
      expect(survivalScoreFor(months)).toBe(survivalSubScore(months));
    }
  });
});

describe("SURVIVAL_SCORE_STEPS (the ladder a playbook reads)", () => {
  it("starts at zero months and ascends in months and in score", () => {
    expect(SURVIVAL_SCORE_STEPS[0].fromMonths).toBe(0);
    for (let i = 1; i < SURVIVAL_SCORE_STEPS.length; i++) {
      expect(SURVIVAL_SCORE_STEPS[i].fromMonths).toBeGreaterThan(SURVIVAL_SCORE_STEPS[i - 1].fromMonths);
      expect(SURVIVAL_SCORE_STEPS[i].score).toBeGreaterThan(SURVIVAL_SCORE_STEPS[i - 1].score);
    }
  });

  it("each step's band is the survival engine's band for the month it starts at", () => {
    for (const step of SURVIVAL_SCORE_STEPS) {
      expect(riskLevelFromMonths(step.fromMonths), `${step.fromMonths} months`).toBe(step.level);
    }
  });

  it("every band has a step, and one starts at each band's floor", () => {
    expect(new Set(SURVIVAL_SCORE_STEPS.map((s) => s.level))).toEqual(new Set(RISK_BAND_LEVELS));
    const starts = SURVIVAL_SCORE_STEPS.map((s) => s.fromMonths);
    for (const floor of Object.values(RISK_BAND_FLOOR_MONTHS)) expect(starts).toContain(floor);
  });

  it("survivalSubScore() holds each step's score from its start to the next step", () => {
    SURVIVAL_SCORE_STEPS.forEach((step, i) => {
      const next = SURVIVAL_SCORE_STEPS[i + 1];
      expect(survivalSubScore(step.fromMonths)).toBe(step.score);
      expect(survivalSubScore(next ? next.fromMonths - 0.01 : 24)).toBe(step.score);
    });
  });
});

// ── Incomplete Data Penalty ─────────────────────────────────────────────────

describe("Incomplete Data Penalty", () => {
  it("not-configured survival pulls score below neutral", () => {
    const report = makeReport({ paceScore: 50, pipelineScore: 50, expenseScore: 50 });
    const configured = compute(report, 50, 5);    // 5–<6 months → 58
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
    // Survival 4–<5 months → 50. With every other component at 50 the
    // composite is exactly 50 → grade D.
    const result = compute(report, 50, 4); // survival = 50
    // 50×0.35 + 50×0.30 + 50×0.15 + 50×0.05 + 50×0.15 = 50
    expect(result.score).toBe(50);
    expect(result.grade).toBe("D");
  });
});

describe("gradeForScore (the glyph a surface prints without running compute)", () => {
  it("sits on the same edges as compute(): 92 / 85 / 75 / 62 / 50", () => {
    const edges: [number, string][] = [
      [100, "A+"], [92, "A+"], [91, "A"], [85, "A"], [84, "B"], [75, "B"],
      [74, "C"], [62, "C"], [61, "D"], [50, "D"], [49, "F"], [34, "F"], [0, "F"],
    ];
    for (const [score, glyph] of edges) expect(gradeForScore(score), String(score)).toBe(glyph);
  });

  it("gives the glyph compute() gives for the score it returns", () => {
    for (const pace of [10, 40, 60, 75, 90, 100]) {
      const result = compute(makeReport({ paceScore: pace, pipelineScore: pace, expenseScore: pace }), pace, 6);
      expect(gradeForScore(result.score)).toBe(result.grade);
    }
  });

  it("reads a broken score as no grade, not an F", () => {
    expect(gradeForScore(Number.NaN)).toBe("\u2014");
    expect(gradeForScore(Number.POSITIVE_INFINITY)).toBe("\u2014");
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
    // Survival 4–<5 months → 50, so an all-50 input gives composite 50 → Building.
    const result = compute(report, 50, 4); // composite 50 → Building
    expect(result.stateLabel).toBe(stateLabel(result.score));
    expect(result.stateLabel).toBe("Building");
  });
});

// ── Metadata ─────────────────────────────────────────────────────────────────

describe("Score Metadata", () => {
  it("includes version string", () => {
    const result = compute(makeReport(), 50, 5);
    expect(SCORE_VERSION).toBe("1.4");
    expect(result.version).toBe(SCORE_VERSION);
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
