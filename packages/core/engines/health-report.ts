/**
 * Build a BusinessHealthReport from live agent data.
 *
 * Extracted from dashboard-content.tsx so it can be shared by the
 * Scenario Engine and any other consumer that needs health sub-scores.
 */

import type { BusinessHealthReport } from "./runway-score-engine";
import { expenseRatioBand } from "./expense-ratio-bands";

/**
 * Runway Score expense sub-score: lower ratio = higher score. The score for
 * each band lives on `EXPENSE_RATIO_BANDS` (expense-ratio-bands.ts), the same
 * table every screen colours the ratio from.
 *
 * v1.2: an agent with GCI but zero expenses logged scores 35 instead of 80.
 * No real estate agent has zero expenses, so this means they haven't entered
 * their data yet. Penalize to incentivize completeness.
 */
export function expenseSubScore(ytdGCI: number, expensesYTD: number): number {
  if (ytdGCI > 0 && expensesYTD > 0) {
    const band = expenseRatioBand(expensesYTD / ytdGCI);
    if (band) return band.subScore;
  }
  // Has income but no expenses — data is incomplete
  if (ytdGCI > 0 && expensesYTD === 0) return 35;
  // No GCI yet — neutral, agent hasn't started
  return 50;
}

/**
 * Runway Score pipeline sub-score: the share of the goal still to reach that
 * the weighted pipeline covers, as a percent, capped at 100. An empty
 * pipeline covers none of it and scores 0 (v1.5; until 2026-10-20 it fell
 * back to a neutral 65). Goal already met: 90. No goal set: 65, as there is
 * nothing to measure the pipeline against.
 */
export function pipelineSubScore(goalGCI: number, ytdGCI: number, pipelineWeightedGCI: number): number {
  const remaining = Math.max(0, goalGCI - ytdGCI);
  if (remaining > 0) {
    const weighted = Number.isFinite(pipelineWeightedGCI) && pipelineWeightedGCI > 0 ? pipelineWeightedGCI : 0;
    return Math.min(100, Math.round((weighted / remaining) * 100));
  }
  if (goalGCI > 0 && ytdGCI >= goalGCI) return 90;
  return 65;
}

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
  const pipelineScore = pipelineSubScore(goalGCI, ytdGCI, pipelineWeightedGCI);

  // ── Expense score: lower ratio = higher score ──────────────────────
  const expenseScore = expenseSubScore(ytdGCI, expensesYTD);

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
