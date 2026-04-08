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
 * - Pipeline:   30%  (v1.2: +5% from Benchmark — pipeline is more actionable)
 * - Expenses:   15%
 * - Benchmark:   5%  (v1.2: reduced — CREA national cohorts are too coarse)
 * - Survival:   15%
 *
 * v1.2 changes:
 * - Benchmark weight reduced from 10% to 5%, redistributed to Pipeline.
 *   CREA 2023 national cohorts (4 buckets) are too coarse for meaningful
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
  let survivalScore: number;
  if (survivalMonths < 0) survivalScore = 35;
  else if (survivalMonths >= 6) survivalScore = 95;
  else if (survivalMonths >= 4) survivalScore = 75;
  else if (survivalMonths >= 2) survivalScore = 50;
  else if (survivalMonths >= 1) survivalScore = 25;
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
    components,
    version: SCORE_VERSION,
    timestamp: new Date(),
    hasEnoughData: healthReport.hasEnoughData,
  };
}
