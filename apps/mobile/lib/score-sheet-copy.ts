/**
 * The words on the Runway Score badge and the score sheet, from the "home"
 * namespace (packages/i18n/mobile/<locale>/home.json: `scoreSheet`, plus the
 * existing `score` and `scoreBar` strings).
 *
 * The sheet's own sentences name a part and its number and never say "good",
 * "strong" or "should". The one "Strong" it can print is the engine's state
 * label (`score.strong`), shown as the engine names it.
 *
 * The trend takes a count (`{{count}}`), so i18next looks for `down_one` /
 * `down_other` first and falls back to `down`: English needs only the one
 * string, and a language that agrees the number can add forms.
 */

import { daysBetweenISO } from "@agent-runway/core/lib/local-date";
import type { RunwayStateLabel } from "@agent-runway/core/engines/runway-score-engine";
import type { ScoreTrend } from "@agent-runway/core/lib/next-up/score-badge";
import { dayLabel, type Translate } from "./next-up-copy";
import type { ScorePartView, ScoreView } from "./score-view";

/** Joins the parts of the status line. */
const SEP = " · ";

/** The app's words for each of the engine's state labels. */
const STATE_LABEL_KEYS: Readonly<Record<RunwayStateLabel, string>> = {
  Strong: "score.strong",
  "On Track": "score.onTrack",
  Building: "score.building",
  "At Risk": "score.atRisk",
};

/** The badge's tag: an arrow and the size of the change ("▼ 3"). */
export function trendTag(trend: ScoreTrend): string {
  return `${trend.direction === "down" ? "▼" : "▲"} ${trend.delta}`;
}

/** "down 3 since last week". */
export function trendPhrase(trend: ScoreTrend, t: Translate): string {
  return t(trend.direction === "down" ? "scoreSheet.down" : "scoreSheet.up", { count: trend.delta });
}

/**
 * The line under the score: the state label, then the trend, then (once the
 * save is old) "as of <day>". "At Risk · down 3 since last week". `today` is
 * the phone's calendar day.
 */
export function statusLine(
  view: Pick<ScoreView, "stateLabel" | "trend" | "asOf">,
  today: string,
  t: Translate,
  locale: string,
): string {
  const parts = [t(STATE_LABEL_KEYS[view.stateLabel])];
  if (view.trend) parts.push(trendPhrase(view.trend, t));
  if (view.asOf) {
    parts.push(t("scoreSheet.asOf", { day: dayLabel(view.asOf, daysBetweenISO(today, view.asOf), t, locale) }));
  }
  return parts.join(SEP);
}

/** A part's name as the score bars print it ("Bench"), else the engine's label. */
export function partName(part: Pick<ScorePartView, "label" | "part">, t: Translate): string {
  return part.part ? t(`scoreBar.${part.part}`) : part.label;
}

/** "Lowest part: Bench, at 6 of 100." Null with no lowest part. */
export function lowestLine(view: Pick<ScoreView, "lowest">, t: Translate): string | null {
  if (!view.lowest) return null;
  return t("scoreSheet.lowest", { part: partName(view.lowest, t), score: Math.round(view.lowest.score) });
}

/** What a screen reader says for the badge: "Runway Score 34, down 3 since last week". */
export function badgeLabel(view: ScoreView | null, t: Translate): string {
  const name = t("score.runwayScore");
  if (!view) return name;
  const score = `${name} ${Math.round(view.score)}`;
  return view.trend ? `${score}, ${trendPhrase(view.trend, t)}` : score;
}
