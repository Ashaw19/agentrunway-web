/**
 * Build a BusinessHealthReport from live agent data.
 *
 * Extracted from dashboard-content.tsx so it can be shared by the
 * Scenario Engine and any other consumer that needs health sub-scores.
 */

import type { BusinessHealthReport } from "./runway-score-engine";

/**
 * Maps agent performance metrics into the three sub-scores consumed
 * by `computeRunwayScore()`.
 *
 * All inputs are plain numbers — no Supabase or side-effect dependencies.
 */
export function buildHealthReport(
  ytdGCI: number,
  goalGCI: number,
  fraction: number,
  pipelineWeightedGCI: number,
  expensesYTD: number,
): BusinessHealthReport {
  // ── Pace score: maps [-50%, +50%] → [0, 100] ──────────────────────
  let paceScore = 50;
  if (goalGCI > 0 && fraction > 0) {
    const expectedAtThisPoint = goalGCI * fraction;
    const paceVsGoal =
      expectedAtThisPoint > 0
        ? ((ytdGCI - expectedAtThisPoint) / expectedAtThisPoint) * 100
        : 0;
    const raw = (paceVsGoal + 50) / 100;
    paceScore = Math.round(Math.min(1, Math.max(0, raw)) * 100);
  }

  // ── Pipeline score: pipeline-to-remaining-goal ratio ───────────────
  let pipelineScore = 65;
  const remaining = Math.max(0, goalGCI - ytdGCI);
  if (remaining > 0 && pipelineWeightedGCI > 0) {
    pipelineScore = Math.min(
      100,
      Math.round((pipelineWeightedGCI / remaining) * 100),
    );
  } else if (goalGCI > 0 && ytdGCI >= goalGCI) {
    pipelineScore = 90;
  }

  // ── Expense score: lower ratio = higher score ──────────────────────
  // v1.2: if agent has GCI but zero expenses logged, score at 35 instead
  // of 80 — no real estate agent has zero expenses, so this means they
  // haven't entered their data yet. Penalize to incentivize completeness.
  let expenseScore: number;
  if (ytdGCI > 0 && expensesYTD > 0) {
    const ratio = expensesYTD / ytdGCI;
    if (ratio > 0.5) expenseScore = 30;
    else if (ratio > 0.35) expenseScore = 55;
    else if (ratio > 0.25) expenseScore = 75;
    else expenseScore = 90;
  } else if (ytdGCI > 0 && expensesYTD === 0) {
    // Has income but no expenses — data is incomplete
    expenseScore = 35;
  } else {
    // No GCI yet — neutral, agent hasn't started
    expenseScore = 50;
  }

  const readinessScore = 0; // deprecated, kept for backward compat

  const components = [paceScore, pipelineScore, expenseScore];
  const avg = components.reduce((a, b) => a + b, 0) / 3;
  const weakest = Math.min(...components);
  const weakestLabels = ["Pace", "Pipeline", "Expenses"];
  const weakestIdx = components.indexOf(weakest);

  return {
    score: Math.round(avg),
    grade:
      avg >= 85 ? "A" : avg >= 75 ? "B" : avg >= 62 ? "C" : avg >= 50 ? "D" : "F",
    paceScore,
    pipelineScore,
    expenseScore,
    readinessScore,
    weakestLabel: weakestLabels[weakestIdx],
    hasEnoughData: ytdGCI > 0,
  };
}
