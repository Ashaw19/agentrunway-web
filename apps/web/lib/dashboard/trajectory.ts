/**
 * Pure, deterministic dashboard-trajectory helpers. No React, no DOM.
 *
 * These back the Runway Score sparkline + the direction-of-change carets on the
 * dashboard hero. The numbers themselves come from the canonical runway-score
 * engine — this module NEVER recomputes score or band math. It only shapes the
 * already-computed history rows + the live score into a series and derives
 * honest direction/delta signals against the most-recent PRIOR daily row.
 *
 * Honesty constraints (memory/findings/dashboard_dynamism_2026-06-27.md):
 *  - carets show direction-of-CHANGE vs a real prior row, never a band boundary;
 *  - no prior row → no direction ("none"), we never invent movement;
 *  - a single-point series renders no line (the caller's Sparkline returns null
 *    for <2 points) rather than faking a trajectory off one point.
 */

import type { SparkPoint } from "@/lib/charts/sparkline-geometry";

export interface ScoreHistoryPoint {
  captured_on: string; // YYYY-MM-DD
  score: number;
  components: { label: string; score: number; weight: number }[];
  cash_runway_months: number | null;
}

export type CaretDir = "up" | "down" | "flat" | "none";

/** YYYY-MM-DD lexicographic sort key. */
function sortByDateAsc(rows: ScoreHistoryPoint[]): ScoreHistoryPoint[] {
  return rows.slice().sort((a, b) => (a.captured_on < b.captured_on ? -1 : a.captured_on > b.captured_on ? 1 : 0));
}

/**
 * Build the Runway Score trajectory series from persisted history + today's
 * LIVE score. Every point is an actual (`projected: false`) — the score
 * trajectory has no projected tail.
 *
 * Merge rule: if the latest history row IS today, today's row is REPLACED by
 * the live value (the persisted row is this morning's capture; the live value
 * supersedes it within the day); otherwise the live value is APPENDED as
 * today's point. A genuinely-earlier-period `seedScore` is PREPENDED only when
 * the result would otherwise be a single point, so day-1 accounts get a real
 * 2-point line instead of a flat dot.
 */
export function buildScoreTrajectory(
  history: ScoreHistoryPoint[],
  liveScore: number,
  today: string,
  seedScore: number | null,
  maxPoints = 12,
): SparkPoint[] {
  const sorted = sortByDateAsc(history);

  // Working list of scores from history (each row → its score).
  const scores = sorted.map((r) => r.score);

  if (sorted.length === 0) {
    // No history → just today's live value.
    scores.push(liveScore);
  } else if (sorted[sorted.length - 1].captured_on === today) {
    // Latest row is today → replace it with the live value.
    scores[scores.length - 1] = liveScore;
  } else {
    // Latest row predates today → append today's live value.
    scores.push(liveScore);
  }

  let points: SparkPoint[] = scores.map((value) => ({ value, projected: false }));

  // Seed a 2nd point ONLY for day-1 accounts (caller gates seedScore to a
  // genuinely-earlier period — see dashboard-content.tsx).
  if (points.length < 2 && seedScore != null) {
    points = [{ value: seedScore, projected: false }, ...points];
  }

  // Cap to the last `maxPoints` (keep the most recent tail).
  if (points.length > maxPoints) {
    points = points.slice(points.length - maxPoints);
  }

  return points;
}

/**
 * Direction of change of `current` vs `prior`. `prior == null` (covers both
 * null and undefined — e.g. no prior row, or no matching component) → "none":
 * we never invent a direction.
 */
export function caretDirection(current: number, prior: number | null | undefined): CaretDir {
  if (prior == null) return "none";
  if (current > prior) return "up";
  if (current < prior) return "down";
  return "flat";
}

/**
 * Map of `label → score` from the MOST RECENT history row strictly BEFORE
 * today. Today's own row is the current capture, not a prior, so it's excluded.
 * Returns null when no prior row exists (first-ever capture).
 */
export function priorComponentScores(
  history: ScoreHistoryPoint[],
  today: string,
): Map<string, number> | null {
  const sorted = sortByDateAsc(history);
  let prior: ScoreHistoryPoint | null = null;
  for (const row of sorted) {
    if (row.captured_on < today) prior = row; // last one wins (latest before today)
  }
  if (!prior) return null;
  const map = new Map<string, number>();
  for (const c of prior.components) map.set(c.label, c.score);
  return map;
}

/**
 * Cash-runway months delta (1-decimal) vs the most recent prior row's
 * `cash_runway_months`. Returns null when the current value is unknown, when
 * there's no prior row, or when the prior row's cash value is unknown. May be
 * 0 / negative.
 */
export function cashRunwayDelta(
  history: ScoreHistoryPoint[],
  currentMonths: number | null,
  today: string,
): number | null {
  if (currentMonths == null) return null;
  const sorted = sortByDateAsc(history);
  let prior: ScoreHistoryPoint | null = null;
  for (const row of sorted) {
    if (row.captured_on < today) prior = row;
  }
  if (!prior || prior.cash_runway_months == null) return null;
  return Math.round((currentMonths - prior.cash_runway_months) * 10) / 10;
}

/**
 * Whether to write today's history row. True when no row exists yet OR the
 * latest captured day is strictly before today (lexicographic compare is valid
 * for YYYY-MM-DD). Guards the once-per-day write.
 */
export function shouldWriteHistoryToday(latestCapturedOn: string | null, today: string): boolean {
  return latestCapturedOn == null || latestCapturedOn < today;
}
