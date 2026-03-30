// RunwayScoreEngine — ported from Swift
// Versioned composite score wrapping BusinessHealthReport + benchmark + survival.
// 5-component health score (Setup removed in v1.1).

export const SCORE_VERSION = "1.1";

// ── Component ───────────────────────────────────────────────────────────────

export interface ScoreComponent {
  label: string;
  score: number; // 0–100
  weight: string; // display, e.g. "30%"
  weightValue: number; // 0.0–1.0
}

// ── Result ──────────────────────────────────────────────────────────────────

export interface RunwayScoreResult {
  score: number; // 0–100 composite
  grade: string; // A+ / A / B / C / D / F
  components: ScoreComponent[];
  version: string;
  timestamp: Date;
  hasEnoughData: boolean;
}

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

function grade(score: number): string {
  if (score >= 92) return "A+";
  if (score >= 85) return "A";
  if (score >= 75) return "B";
  if (score >= 62) return "C";
  if (score >= 50) return "D";
  return "F";
}

// ── Compute ─────────────────────────────────────────────────────────────────

/**
 * Compute the Runway Score.
 *
 * Component weights (total = 100%):
 * - Goal Pace:  35%
 * - Pipeline:   25%
 * - Expenses:   15%
 * - Benchmark:  10%
 * - Survival:   15%
 *
 * NOTE: "Setup" (readinessScore) was removed in v1.1 — it measured app
 * configuration completeness, not business health.  Its 10% was
 * redistributed to Goal Pace (+5%) and Pipeline (+5%).
 */
export function compute(
  healthReport: BusinessHealthReport,
  benchmarkPercentile: number,
  survivalMonths: number,
): RunwayScoreResult {
  // Convert survival months to 0–100 score
  // -1 means "not configured" — use neutral 50 instead of punitive 10
  let survivalScore: number;
  if (survivalMonths < 0) survivalScore = 50;
  else if (survivalMonths >= 6) survivalScore = 95;
  else if (survivalMonths >= 4) survivalScore = 75;
  else if (survivalMonths >= 2) survivalScore = 50;
  else if (survivalMonths >= 1) survivalScore = 25;
  else survivalScore = 10;

  const components: ScoreComponent[] = [
    { label: "Goal Pace", score: healthReport.paceScore, weight: "35%", weightValue: 0.35 },
    { label: "Pipeline", score: healthReport.pipelineScore, weight: "25%", weightValue: 0.25 },
    { label: "Expenses", score: healthReport.expenseScore, weight: "15%", weightValue: 0.15 },
    { label: "Benchmark", score: benchmarkPercentile, weight: "10%", weightValue: 0.1 },
    { label: "Survival", score: survivalScore, weight: "15%", weightValue: 0.15 },
  ];

  const composite = components.reduce(
    (sum, c) => sum + c.score * c.weightValue,
    0,
  );
  const scoreValue = Math.round(composite);

  return {
    score: scoreValue,
    grade: grade(scoreValue),
    components,
    version: SCORE_VERSION,
    timestamp: new Date(),
    hasEnoughData: healthReport.hasEnoughData,
  };
}
