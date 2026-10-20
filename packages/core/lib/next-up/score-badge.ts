/**
 * The Runway Score badge and sheet on the phone dashboard: how a saved score
 * compares with last week, when the save is old enough to say "as of", and
 * which of the five parts is the lowest. The phone only reads the score the
 * web dashboard saved (user_settings.runway_score_snapshot and
 * runway_score_history); nothing here works a score out.
 *
 * Days are YYYY-MM-DD strings, compared as calendar days with no time zone:
 * the caller picks whose day each one is (the phone's own calendar day for
 * the day the score was saved and for today).
 *
 * Relative imports only: the MCP build copies core into Deno.
 */

import { addDaysISO, daysBetweenISO } from "../local-date";

/** The trend compares with a score at least this many days older than the save. */
export const SCORE_TREND_DAYS = 7;

/** A score saved more than this many days ago is shown "as of" its day. */
export const SCORE_STALE_DAYS = 3;

export type ScorePart = "pace" | "pipeline" | "expenses" | "bench" | "survival";

/**
 * The Runway Score's five components, in the engine's order, by the label the
 * engine writes (runway-score-engine.ts compute()), to the key of the phone's
 * `scoreBar.*` strings. The test compares these labels with compute()'s.
 */
export const PART_LABELS: Readonly<Record<string, ScorePart>> = {
  "Goal Pace": "pace",
  Pipeline: "pipeline",
  Expenses: "expenses",
  Benchmark: "bench",
  Survival: "survival",
};

export interface ScoreTrend {
  /** How far the score moved since the compared day: a whole, positive number. */
  delta: number;
  direction: "up" | "down";
}

/**
 * The saved score against the latest history row at least a week older than
 * the day it was saved. Null (the tag is hidden) with no such row, with no
 * save day, or when the score hasn't moved.
 */
export function scoreTrend(
  current: { score: number; savedOn: string | null },
  compare: { captured_on: string; score: number } | null,
): ScoreTrend | null {
  if (!compare || !current.savedOn) return null;
  if (compare.captured_on > addDaysISO(current.savedOn, -SCORE_TREND_DAYS)) return null;
  const change = current.score - compare.score;
  if (!Number.isFinite(change) || change === 0) return null;
  return { delta: Math.abs(change), direction: change > 0 ? "up" : "down" };
}

/** The save day when the score is more than 3 days old (the sheet says "as of"), else null. */
export function scoreAsOf(savedOn: string | null, today: string): string | null {
  if (!savedOn) return null;
  return daysBetweenISO(savedOn, today) > SCORE_STALE_DAYS ? savedOn : null;
}

/**
 * The part with the lowest score, by the engine's label. A tie goes to the
 * part that comes first in the engine's order; a score that can't be read is
 * passed over. Null with no readable part.
 */
export function lowestPart(components: readonly { label: string; score: number }[]): { part: string; score: number } | null {
  let lowest: { part: string; score: number } | null = null;
  for (const component of components) {
    if (!Number.isFinite(component.score)) continue;
    if (!lowest || component.score < lowest.score) lowest = { part: component.label, score: component.score };
  }
  return lowest;
}
