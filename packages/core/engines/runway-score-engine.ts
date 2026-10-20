// RunwayScoreEngine — ported from Swift
// Versioned composite score wrapping BusinessHealthReport + benchmark + survival.
// 5-component health score (Setup removed in v1.1).

import {
  nextRiskBand,
  RISK_BAND_FLOOR_MONTHS,
  RISK_BAND_LEVELS,
  type RiskBandLevel,
} from "./survival-engine";

export const SCORE_VERSION = "1.5";

/**
 * The first day (Atlantic, YYYY-MM-DD) scores were worked out under
 * SCORE_VERSION. A score from before it was worked out under other rules, so
 * the weekly trend doesn't compare across it. Bump both together.
 * v1.5 (2026-10-20): an empty pipeline with a goal still to reach scores 0
 * on Pipeline (it was a neutral 65).
 */
export const SCORE_VERSION_SINCE = "2026-10-20";

// ── Component ───────────────────────────────────────────────────────────────

export interface ScoreComponent {
  label: string;
  score: number; // 0–100
  weight: string; // display, e.g. "30%"
  weightValue: number; // 0.0–1.0
}

// ── Result ──────────────────────────────────────────────────────────────────

/**
 * Neutral, info-not-advice label for the Runway Score. This is the ONLY
 * user-facing prose label. Use it in chat answers, email subtitles, insights
 * prose, and dashboard pills. The academic `grade` letter is retained as a
 * visual shorthand (badge glyph) in the dashboard letter badge, PDF report,
 * email badge, and mobile chip — never in prose.
 *
 * Bands (matches dashboard scoreBand thresholds verbatim):
 *   Strong   ≥ 81
 *   On Track ≥ 61
 *   Building ≥ 41
 *   At Risk  < 41
 */
export type RunwayStateLabel = "Strong" | "On Track" | "Building" | "At Risk";

export interface RunwayScoreResult {
  score: number; // 0–100 composite
  /**
   * @deprecated Use `stateLabel` for any user-facing prose. `grade` is
   * retained only as a visual shorthand (badge glyph) in the dashboard
   * letter badge, PDF report hero, weekly-digest email badge, and mobile
   * home chip. Do not inject it into chat prose, email text blocks, or
   * insight messages.
   */
  grade: string; // A+ / A / B / C / D / F
  stateLabel: RunwayStateLabel;
  components: ScoreComponent[];
  version: string;
  timestamp: Date;
  hasEnoughData: boolean;
}

// ── Canonical Band Tables ───────────────────────────────────────────────────

/**
 * Canonical Runway Score band tables. Single source of truth for every
 * surface that derives a label, glyph, or color from the composite score.
 *
 * Two parallel schemes — both authoritative, different roles:
 *
 * - `stateLabel` (prose band): "Strong / On Track / Building / At Risk".
 *   The ONLY scheme allowed in user-facing prose (chat, email body, insight
 *   cards, Flight Crew dialog, push text, dashboard pill, mobile profile,
 *   MCP tool outputs).
 *
 * - `grade` (visual-shorthand glyph): "A+ / A / B / C / D / F". Retained
 *   ONLY for compact visual shorthand (dashboard letter badge, PDF hero,
 *   weekly-digest email badge, mobile home gauge chip). Never in prose.
 *
 * Bands are ordered descending by `min`. Comparison is inclusive lower-bound
 * (>=). Hex colors mirror the dashboard pill family — emerald/blue/amber/red
 * — and are exported for any surface (mobile, PDF, email) that needs a color
 * alongside the label.
 *
 * A component sub-score (Goal Pace, Pipeline, Expenses, Benchmark, Survival,
 * each 0–100) is coloured on the same `stateLabel` bands, through
 * `bandColorHexForScore()`. Components have no second scheme, and no surface
 * writes a ladder of its own: decided 2026-10-13 (spec §7 question 1), held
 * by apps/web/lib/__tests__/runway-sub-score-colour-canonical.test.ts.
 *
 * Spec: memory/spec_runway_score_canonical_bands.md §3.1.
 */
export const RUNWAY_SCORE_BANDS = {
  stateLabel: [
    { min: 81, label: "Strong"   as const, hex: "#10B981" },
    { min: 61, label: "On Track" as const, hex: "#3B5EF6" },
    { min: 41, label: "Building" as const, hex: "#F59E0B" },
    { min:  0, label: "At Risk"  as const, hex: "#EF4444" },
  ],
  grade: [
    { min: 92, glyph: "A+" as const },
    { min: 85, glyph: "A"  as const },
    { min: 75, glyph: "B"  as const },
    { min: 62, glyph: "C"  as const },
    { min: 50, glyph: "D"  as const },
    { min:  0, glyph: "F"  as const },
  ],
} as const;

/**
 * Slate-500. Returned by `bandColorHexForScore()` when the score is
 * non-finite (NaN, Infinity, -Infinity). Distinct from the four band colors
 * so a broken score input renders as "no data" rather than impersonating
 * "At Risk".
 */
const NON_FINITE_COLOR_HEX = "#6B7280";

// ── Health Report Input ─────────────────────────────────────────────────────

export interface BusinessHealthReport {
  score: number;
  grade: string;
  paceScore: number; // 0–100
  pipelineScore: number;
  expenseScore: number;
  readinessScore: number; // kept for backward compat — NOT used in score
  weakestLabel: string;
  hasEnoughData: boolean;
}

// ── Grade Mapping ───────────────────────────────────────────────────────────

/**
 * The grade glyph for a score: the one table (`RUNWAY_SCORE_BANDS.grade`) for
 * every surface that prints it without running `compute()`, such as the
 * phone's score sheet (a snapshot saved before the grade was written has none).
 *
 * @deprecated Prose surfaces should use `stateLabel()` instead. Retained for
 * visual-shorthand consumers (PDF hero badge, dashboard letter badge, email
 * badge glyph, mobile chip and score sheet) only.
 */
export function gradeForScore(score: number): string {
  // Defensive: NaN/Infinity slips past every comparison and falls to "F",
  // which silently mislabels broken inputs as a graded score.
  if (!isFinite(score)) return "—";
  for (const band of RUNWAY_SCORE_BANDS.grade) {
    if (score >= band.min) return band.glyph;
  }
  // Unreachable — the last band has min: 0 — but kept for exhaustiveness.
  return RUNWAY_SCORE_BANDS.grade[RUNWAY_SCORE_BANDS.grade.length - 1].glyph;
}

/**
 * Canonical neutral label for the Runway Score. Mirrors the dashboard's
 * historical `scoreBand()` thresholds. This is the single source of truth
 * for Runway Score prose labels across chat, insights, email text, and any
 * other surface that renders a human-readable band.
 *
 * Boundaries: ≥81 Strong, ≥61 On Track, ≥41 Building, else At Risk.
 */
export function stateLabel(score: number): RunwayStateLabel {
  for (const band of RUNWAY_SCORE_BANDS.stateLabel) {
    if (score >= band.min) return band.label;
  }
  // Unreachable — the last band has min: 0 — but kept for exhaustiveness.
  return RUNWAY_SCORE_BANDS.stateLabel[RUNWAY_SCORE_BANDS.stateLabel.length - 1].label;
}

/**
 * Canonical band color (hex) for a Runway Score, and for each of its component
 * sub-scores. Aligns with the `stateLabel` band — i.e. color follows the prose
 * label, not the academic grade. Mobile, PDF, and email surfaces import this
 * directly; web (dashboard pill) uses Tailwind tokens but the semantic mapping
 * is identical.
 *
 * Non-finite scores (NaN, Infinity) return the slate-500 "no data" color
 * rather than impersonating an "At Risk" red, so a broken upstream chain is
 * visually distinguishable from a genuine low score.
 *
 * Spec: memory/spec_runway_score_canonical_bands.md §3.1.
 */
export function bandColorHexForScore(score: number): string {
  if (!isFinite(score)) return NON_FINITE_COLOR_HEX;
  for (const band of RUNWAY_SCORE_BANDS.stateLabel) {
    if (score >= band.min) return band.hex;
  }
  // Unreachable — the last band has min: 0 — but kept for exhaustiveness.
  return RUNWAY_SCORE_BANDS.stateLabel[RUNWAY_SCORE_BANDS.stateLabel.length - 1].hex;
}

// ── Survival sub-score ──────────────────────────────────────────────────────

/**
 * Scored when no cash reserve or costs are entered (the survival engine's -1
 * sentinel). Missing data pulls the composite down; before v1.2 it scored 50,
 * which rewarded not entering a reserve. It is a penalty, not a band: the
 * Cash Runway number reads "Not set" in slate while this is an At Risk score.
 */
const SURVIVAL_SCORE_NOT_CONFIGURED = 35;

/**
 * The Survival sub-score for a cash runway, by the survival engine's band: one
 * score per month from the band's floor, the last holding to the top of the
 * band. The Survival bar is drawn beside the Cash Runway number, the bar
 * coloured by this score on RUNWAY_SCORE_BANDS and the number by
 * `riskColorBand()`, so each band's scores stay inside the Runway Score band
 * of the same colour:
 *
 *   critical → At Risk  (red,     under 41)
 *   warning  → Building (amber,   41–60)
 *   healthy  → Building (amber,   41–60)
 *   strong   → Strong   (emerald, 81 and up)
 *
 * Held at every hundredth of a month by survival-engine.test.ts ("Runway
 * Score Survival sub-score"). Scores rise with the runway across the whole
 * ladder.
 */
const SURVIVAL_SCORES_BY_BAND: Record<RiskBandLevel, readonly number[]> = {
  critical: [10, 20],
  warning: [41, 42],
  healthy: [50, 58],
  strong: [95],
};

export interface SurvivalScoreStep {
  /** The cash runway band the step is in. */
  level: RiskBandLevel;
  /** The month count the step starts at. It runs up to, not including, the next step's. */
  fromMonths: number;
  score: number;
}

/**
 * The Survival ladder, lowest first, laid out on the survival engine's band
 * floors. A playbook or a test reads this; nothing types the ladder again.
 */
export const SURVIVAL_SCORE_STEPS: readonly SurvivalScoreStep[] = RISK_BAND_LEVELS.flatMap((level) => {
  const floor = level === "critical" ? 0 : RISK_BAND_FLOOR_MONTHS[level];
  const ceiling = nextRiskBand(level)?.fromMonths ?? Infinity;
  return SURVIVAL_SCORES_BY_BAND[level]
    .map((score, monthsIntoBand) => ({ level, fromMonths: floor + monthsIntoBand, score }))
    .filter((step) => step.fromMonths < ceiling);
});

/** The Survival sub-score (0–100) for a cash runway in months, as `survivalResult().months` gives it. */
export function survivalSubScore(months: number): number {
  // Non-finite (NaN from a broken cash-position chain) is treated as missing.
  if (!isFinite(months) || months < 0) return SURVIVAL_SCORE_NOT_CONFIGURED;
  let score = SURVIVAL_SCORE_STEPS[0].score;
  for (const step of SURVIVAL_SCORE_STEPS) {
    if (months >= step.fromMonths) score = step.score;
  }
  return score;
}

// ── Compute ─────────────────────────────────────────────────────────────────

/**
 * Compute the Runway Score.
 *
 * Component weights (total = 100%):
 * - Goal Pace:  35%
 * - Pipeline:   30%  (v1.2: +5% from Benchmark — pipeline is more actionable)
 * - Expenses:   15%
 * - Benchmark:   5%  (v1.2: reduced — national cohort buckets are too coarse)
 * - Survival:   15%
 *
 * v1.2 changes:
 * - Benchmark weight reduced from 10% to 5%, redistributed to Pipeline.
 *   National industry cohorts (4 buckets) are too coarse for meaningful
 *   individual comparison. Pipeline health is forward-looking and actionable.
 * - Incomplete data penalty: "not configured" survival and zero-expense
 *   scores now pull the composite down (35 instead of 50/80) to incentivize
 *   data completeness and prevent inflated scores from missing data.
 *
 * v1.3 changes:
 * - Survival sub-score re-anchored to the product's published cash-runway
 *   standard ("6+ months is considered strong"). Band edges: >=6 Strong (95),
 *   3–<6 Building/watch (42–58), <3 At Risk (10–30). A 4.2-month account now
 *   scores 50 (Building) instead of 75 (top-tier) so the survival bar agrees
 *   with the rest of the dashboard's runway narrative. Survival is 15% of the
 *   composite, so low-runway accounts see a slightly lower, more honest score.
 *
 * v1.4 changes (2026-10-13):
 * - Survival sub-score follows the survival engine's cash runway bands
 *   (`survivalSubScore`). v1.3's edges were the dashboard's old narrative
 *   ("< 3 months → At Risk"); every screen now reads the survival engine,
 *   where Warning starts at 2 months. One step moved: a runway from 2 to under
 *   3 months scores 41 (Building, amber), not 30 (At Risk, red), so the
 *   Survival bar is the colour of the Warning runway beside it. That lifts
 *   the composite by 1.65 points for a runway in that range and by nothing
 *   for any other.
 */
export function compute(
  healthReport: BusinessHealthReport,
  benchmarkPercentile: number,
  survivalMonths: number,
): RunwayScoreResult {
  // Guard upstream NaN/Infinity — treat non-finite inputs as 0 rather than
  // silently propagating NaN into the composite score and grade.
  const safeBenchmark = isFinite(benchmarkPercentile) ? benchmarkPercentile : 0;
  const safePace      = isFinite(healthReport.paceScore)     ? healthReport.paceScore     : 0;
  const safePipeline  = isFinite(healthReport.pipelineScore) ? healthReport.pipelineScore : 0;
  const safeExpense   = isFinite(healthReport.expenseScore)  ? healthReport.expenseScore  : 0;
  const survivalScore = survivalSubScore(survivalMonths);

  const components: ScoreComponent[] = [
    { label: "Goal Pace", score: safePace,      weight: "35%", weightValue: 0.35 },
    { label: "Pipeline",  score: safePipeline,  weight: "30%", weightValue: 0.30 },
    { label: "Expenses",  score: safeExpense,   weight: "15%", weightValue: 0.15 },
    { label: "Benchmark", score: safeBenchmark, weight: "5%",  weightValue: 0.05 },
    { label: "Survival",  score: survivalScore, weight: "15%", weightValue: 0.15 },
  ];

  const composite = components.reduce(
    (sum, c) => sum + c.score * c.weightValue,
    0,
  );
  // Clamp to 0–100 to guard against negative sub-scores slipping through isFinite
  const scoreValue = Math.round(Math.min(100, Math.max(0, composite)));

  return {
    score: scoreValue,
    grade: gradeForScore(scoreValue),
    stateLabel: stateLabel(scoreValue),
    components,
    version: SCORE_VERSION,
    timestamp: new Date(),
    hasEnoughData: healthReport.hasEnoughData,
  };
}
