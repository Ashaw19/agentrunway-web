/**
 * What the dashboard's Runway Score badge and the score sheet show, worked
 * out from the score the web dashboard saved
 * (settings.runway_score_snapshot), the history row the data store found to
 * compare it with (scoreCompare), and today. The phone never works a score
 * out; it reads this one, and puts its band, grade and label on it through the
 * engine's own functions.
 *
 * The day the score was saved is the phone's calendar day of the snapshot's
 * `updated_at` (localDayOf), the same day the store used to look the compare
 * row up, so the trend and the store agree near midnight.
 */

import {
  bandColorHexForScore,
  gradeForScore,
  stateLabel as engineStateLabel,
  type RunwayStateLabel,
} from "@agent-runway/core/engines/runway-score-engine";
import {
  PART_LABELS,
  lowestPart,
  scoreAsOf,
  scoreTrend,
  type ScorePart,
  type ScoreTrend,
} from "@agent-runway/core/lib/next-up/score-badge";
import type { ScoreCompare, UserSettings } from "../stores/data-store";
import { localDayOf } from "./activity-streak";

export type ScoreSnapshot = NonNullable<UserSettings["runway_score_snapshot"]>;

/** One of the score's parts, as the sheet's bars and "lowest part" line show it. */
export interface ScorePartView {
  /** The engine's label ("Goal Pace"). */
  label: string;
  /** The key of the phone's `scoreBar.*` strings; null for a label the phone has no name for. */
  part: ScorePart | null;
  /** 0 to 100, as saved. */
  score: number;
}

export interface ScoreView {
  /** The saved composite score. */
  score: number;
  /** The band colour (bandColorHexForScore): the ring, the number and the bars follow it. */
  color: string;
  /** The grade glyph (the snapshot's, else the engine's for this score). */
  grade: string;
  /** The engine's state label (the snapshot's, else the engine's for this score). */
  stateLabel: RunwayStateLabel;
  trend: ScoreTrend | null;
  /** The day it was saved, when that is more than 3 days ago. */
  asOf: string | null;
  /** The parts in the engine's order. Empty for a snapshot saved without them. */
  components: ScorePartView[];
  lowest: ScorePartView | null;
}

function partKey(label: string): ScorePart | null {
  return Object.prototype.hasOwnProperty.call(PART_LABELS, label) ? PART_LABELS[label] : null;
}

/**
 * The badge and sheet's view of the saved score, or null when nothing is
 * saved yet (the badge shows "–" and the sheet sends Andrew to the web).
 * `today` is the phone's calendar day (YYYY-MM-DD).
 */
export function scoreView(
  snapshot: ScoreSnapshot | null | undefined,
  compare: ScoreCompare | null,
  today: string,
): ScoreView | null {
  if (!snapshot || !Number.isFinite(snapshot.score)) return null;
  const { score } = snapshot;
  const savedOn = snapshot.updated_at ? localDayOf(snapshot.updated_at) : null;

  const components: ScorePartView[] = (snapshot.components ?? [])
    .filter((component) => Number.isFinite(component.score))
    .map((component) => ({ label: component.label, part: partKey(component.label), score: component.score }));
  const lowest = lowestPart(components);

  return {
    score,
    color: bandColorHexForScore(score),
    grade: snapshot.grade ?? gradeForScore(score),
    stateLabel: snapshot.stateLabel ?? engineStateLabel(score),
    trend: scoreTrend({ score, savedOn }, compare),
    asOf: scoreAsOf(savedOn, today),
    components,
    lowest: lowest ? (components.find((c) => c.label === lowest.part) ?? null) : null,
  };
}
