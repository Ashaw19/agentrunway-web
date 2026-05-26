// RunwayScoreEngine — ported from Swift
// Versioned composite score wrapping BusinessHealthReport + benchmark + survival.
// 5-component health score (Setup removed in v1.1).

export const SCORE_VERSION = "1.2";

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
 * @deprecated Prose surfaces should use `stateLabel()` instead. Retained for
 * visual-shorthand consumers (PDF hero badge, dashboard letter badge, email
 * badge glyph, mobile chip) only.
 */
function grade(score: number): string {
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
 * Canonical band color (hex) for a Runway Score. Aligns with the `stateLabel`
 * band — i.e. color follows the prose label, not the academic grade. Mobile,
 * PDF, and email surfaces import this directly; web (dashboard pill) uses
 * Tailwind tokens but the semantic mapping is identical.
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
  // Convert survival months to 0–100 score
  // -1 means "not configured" — score at 35 to penalize missing data
  // (previously 50, which rewarded not entering a cash reserve)
  // Non-finite (NaN from a broken cash-position chain) is treated as missing.
  const safeSurvivalMonths = isFinite(survivalMonths) ? survivalMonths : -1;
  let survivalScore: number;
  if (safeSurvivalMonths < 0) survivalScore = 35;
  else if (safeSurvivalMonths >= 6) survivalScore = 95;
  else if (safeSurvivalMonths >= 4) survivalScore = 75;
  else if (safeSurvivalMonths >= 2) survivalScore = 50;
  else if (safeSurvivalMonths >= 1) survivalScore = 25;
  else survivalScore = 10;

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
    grade: grade(scoreValue),
    stateLabel: stateLabel(scoreValue),
    components,
    version: SCORE_VERSION,
    timestamp: new Date(),
    hasEnoughData: healthReport.hasEnoughData,
  };
}
