/**
 * Repeat client rate reference points. Single source of truth for every
 * surface that colours, fills or describes the repeat rate: the Clients page
 * KPI strip, the Insights tab's Repeat Client Rate card, the impact line on
 * Scan cards (detect-opportunities), Flight Crew's knowledge and the GCI goal
 * blog post.
 *
 * Repeat rate = clients with two or more counted deals ÷ clients with at
 * least one, passed here as a whole PERCENTAGE (22 is 22%), the way
 * `repeatClientStats()` in apps/web/lib/crm/client-groups.ts returns it and
 * the way every screen prints it. A band is looked up on that printed figure,
 * so the number and the band beside it cannot disagree.
 *
 * Until 2026-10-13 the cut-offs were typed by hand and did not agree: the
 * Insights card was highlighted from 20%, its bar changed colour at 15% and
 * 30% and its sentence read "Good" and "Excellent" at the same two, the KPI
 * strip's bar was full at 35%, and Scan cards called the rate "strong" above
 * 25%.
 *
 * None of those figures had a source, so none is an industry benchmark. The
 * two kept are 15% and 30%: the only pair an agent has seen put into words,
 * so a rate stays in the band the card has always shown it in. They are Agent
 * Runway's own reference points, and the labels only state where a rate sits
 * against them.
 */

// ── Canonical Band Table ────────────────────────────────────────────────────

export type RepeatRateBandKey = "belowLower" | "between" | "atOrAboveUpper";

export type RepeatRateTone = "slate" | "lightViolet" | "violet";

export interface RepeatRateBand {
  key: RepeatRateBandKey;
  /** Lower edge of the band in percent, inclusive. */
  min: number;
  /** Badge text. States where the rate sits, with no judgement on it. */
  label: string;
  tone: RepeatRateTone;
}

/** Agent Runway's lower reference point for the repeat rate, in percent. */
export const REPEAT_RATE_LOWER_REFERENCE_PCT = 15;

/** Agent Runway's upper reference point for the repeat rate, in percent. */
export const REPEAT_RATE_UPPER_REFERENCE_PCT = 30;

/**
 * Fewest clients with a deal before a rate is placed in a band. With one
 * client the rate can only be 0% or 100%, which says nothing about a
 * business. The Insights card has always waited for two.
 */
export const REPEAT_RATE_MIN_CLIENTS = 2;

/**
 * Bands are ordered ascending by `min`. Comparison is inclusive lower-bound
 * (>=), so exactly 15% is between the reference points and exactly 30% is at
 * the upper one.
 *
 * The tones are depths of one hue. The dashboard's colour contract
 * (spec_runway_score_canonical_bands.md §9.1) gives emerald, blue, amber and
 * red the meanings healthy, acceptable, watch and concern. These bands carry
 * no such meaning, so none of them wears a health colour.
 */
export const REPEAT_RATE_BANDS = [
  { key: "belowLower",     min: 0,                               label: "Below the lower reference point",       tone: "slate" },
  { key: "between",        min: REPEAT_RATE_LOWER_REFERENCE_PCT, label: "Between the reference points",          tone: "lightViolet" },
  { key: "atOrAboveUpper", min: REPEAT_RATE_UPPER_REFERENCE_PCT, label: "At or above the upper reference point", tone: "violet" },
] as const satisfies readonly RepeatRateBand[];

/**
 * Where a repeat rate gauge ends: the upper reference point. A bar drawn to
 * this scale is full at 30%, and half full at the lower reference point.
 */
export const REPEAT_RATE_GAUGE_MAX_PCT = REPEAT_RATE_UPPER_REFERENCE_PCT;

/** Where the lower reference point falls along the gauge, 0–100. */
export const REPEAT_RATE_GAUGE_LOWER_MARK_PCT =
  (REPEAT_RATE_LOWER_REFERENCE_PCT / REPEAT_RATE_GAUGE_MAX_PCT) * 100;

// ── Lookups ─────────────────────────────────────────────────────────────────

/**
 * The band a repeat rate falls in. Null when there is nothing to place: fewer
 * than two clients with a deal, or a rate that is not a number.
 *
 * @param ratePct          the rate as a whole percentage (22 for 22%)
 * @param clientsWithADeal the rate's denominator
 */
export function repeatRateBand(ratePct: number, clientsWithADeal: number): RepeatRateBand | null {
  if (!Number.isFinite(ratePct) || ratePct < 0) return null;
  if (!(clientsWithADeal >= REPEAT_RATE_MIN_CLIENTS)) return null;
  let found: RepeatRateBand = REPEAT_RATE_BANDS[0];
  for (const band of REPEAT_RATE_BANDS) {
    if (ratePct >= band.min) found = band;
  }
  return found;
}

/** True when the rate is in the top band: at or above the upper reference point. */
export function isRepeatRateAtOrAboveUpper(ratePct: number, clientsWithADeal: number): boolean {
  return repeatRateBand(ratePct, clientsWithADeal)?.key === "atOrAboveUpper";
}

/**
 * Fill of a repeat rate gauge, 0–100: full at the upper reference point.
 * Empty when the rate has no band.
 */
export function repeatRateGaugePct(ratePct: number, clientsWithADeal: number): number {
  if (!repeatRateBand(ratePct, clientsWithADeal)) return 0;
  return Math.min(100, Math.round((ratePct / REPEAT_RATE_GAUGE_MAX_PCT) * 100));
}

// ── Wording ─────────────────────────────────────────────────────────────────

const LOWER = `${REPEAT_RATE_LOWER_REFERENCE_PCT}%`;
const UPPER = `${REPEAT_RATE_UPPER_REFERENCE_PCT}%`;

/** A band's range in words: "under 15%", "15% to under 30%", "30% or more". */
export function repeatRateBandRange(band: RepeatRateBand): string {
  const index = REPEAT_RATE_BANDS.findIndex((b) => b.key === band.key);
  const next = REPEAT_RATE_BANDS[index + 1];
  if (!next) return `${band.min}% or more`;
  return index === 0 ? `under ${next.min}%` : `${band.min}% to under ${next.min}%`;
}

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

/**
 * The reference points, worded once. Every string is built from the numbers
 * above, so a surface that prints one of these cannot state a different
 * figure.
 */
export const REPEAT_RATE_COPY = {
  /** "15% and 30%" */
  referencePoints: `${LOWER} and ${UPPER}`,
  /** "15%". The mark part-way along a gauge. */
  lowerMarkCaption: LOWER,
  /** "30%+". The right-hand end of a gauge. */
  gaugeMaxCaption: `${UPPER}+`,
  referenceSentence: `Agent Runway marks two reference points on the repeat client rate: ${LOWER} and ${UPPER}.`,
  /** Whose numbers they are. Said wherever the reference points are explained, not just shown. */
  provenance: "The reference points are Agent Runway's own, not an industry statistic.",
  /** When a rate is placed against them at all. */
  minClientsSentence: `A rate is placed against them once ${REPEAT_RATE_MIN_CLIENTS} or more clients have a deal.`,
  /** Every band in one sentence: "Under 15% is below the lower reference point, …". */
  bandsSentence: `${capitalise(
    REPEAT_RATE_BANDS.map((band) => `${repeatRateBandRange(band)} is ${lowerFirst(band.label)}`)
      .join(", ")
      .replace(/, (?=[^,]*$)/, " and "),
  )}.`,
} as const;

/**
 * The band table as a list, one band per line, for Flight Crew's knowledge
 * and playbooks: "- 15% to under 30%: Between the reference points".
 */
export function repeatRateBandsList(): string {
  return REPEAT_RATE_BANDS.map((band) => `- ${repeatRateBandRange(band)}: ${band.label}`).join("\n");
}

const VS_REFERENCE_POINTS: Record<RepeatRateBandKey, string> = {
  belowLower: `below Agent Runway's lower reference point of ${LOWER}`,
  between: `between Agent Runway's reference points of ${LOWER} and ${UPPER}`,
  atOrAboveUpper: `at or above Agent Runway's upper reference point of ${UPPER}`,
};

/**
 * Where a rate sits against the reference points, to finish "Your repeat
 * rate of 22% is …": "between Agent Runway's reference points of 15% and
 * 30%". Null when the rate has no band.
 */
export function repeatRateVsReferencePoints(ratePct: number, clientsWithADeal: number): string | null {
  const band = repeatRateBand(ratePct, clientsWithADeal);
  return band ? VS_REFERENCE_POINTS[band.key] : null;
}
