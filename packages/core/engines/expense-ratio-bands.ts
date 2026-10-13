/**
 * Expense ratio bands. Single source of truth for every surface that scores,
 * colours or describes the expense ratio: the Runway Score's expense
 * sub-score (health-report.ts), the insight and advisor cards, the dashboard,
 * Expenses and Reports pages, the report PDFs, Flight Crew's knowledge and
 * the marketing pages.
 *
 * Expense ratio = year-to-date expenses ÷ year-to-date GCI, passed here as a
 * FRACTION (0.33 is 33%). A surface that holds a percentage divides by 100.
 *
 * The cut-offs are the ones the Runway Score has always used (25%, 35%, 50%).
 * Until 2026-10-13 other surfaces carried their own: a "25–30%" benchmark
 * coloured at 30/40 on Reports and its PDF, a "25–30% target" coloured at
 * 35/50 on Expenses, and a "25–35% industry average" in the insight cards and
 * Flight Crew. A 33% ratio was healthy to the score, amber on Reports and
 * green on Expenses.
 *
 * None of those figures had a source, so none is called an industry
 * benchmark here. 35% of GCI or less is Agent Runway's own target: the edge
 * past which the insight card, the dashboard alert and Flight Crew have
 * always flagged the ratio.
 */

// ── Canonical Band Table ────────────────────────────────────────────────────

export type ExpenseRatioBandKey = "wellWithin" | "within" | "above" | "wellAbove";

/** `slate` is "no band": no GCI yet, or no expenses recorded. */
export type ExpenseRatioTone = "emerald" | "blue" | "amber" | "red" | "slate";

export interface ExpenseRatioBand {
  key: ExpenseRatioBandKey;
  /** Upper edge of the band as a fraction of GCI, inclusive. */
  max: number;
  /** Badge text. States where the ratio sits, with no judgement on it. */
  label: string;
  /** The label as it reads mid-sentence: "is {position} Agent Runway's target…". */
  position: string;
  tone: Exclude<ExpenseRatioTone, "slate">;
  hex: string;
  /** Runway Score expense sub-score (0–100) for a ratio in this band. */
  subScore: number;
}

/**
 * Agent Runway's target: an expense ratio of 35% of GCI or less. A band edge
 * below, so "above target" and the amber band start at the same number.
 */
export const EXPENSE_RATIO_TARGET_MAX = 0.35;

/**
 * Bands are ordered ascending by `max`. Comparison is inclusive upper-bound
 * (<=), so exactly 25% is well within target and exactly 35% is within it.
 *
 * `tone` and `hex` follow the dashboard's colour contract
 * (spec_runway_score_canonical_bands.md §9.1): each band wears the colour the
 * Runway Score hero gives its sub-score, so the Expenses bar on the dashboard
 * and the ratio on every other screen are the same colour.
 * expense-ratio-bands.test.ts pins that against `bandColorHexForScore()`.
 */
export const EXPENSE_RATIO_BANDS = [
  { key: "wellWithin", max: 0.25,                     label: "Well within target", position: "well within", tone: "emerald", hex: "#10B981", subScore: 90 },
  { key: "within",     max: EXPENSE_RATIO_TARGET_MAX, label: "Within target",      position: "within",      tone: "blue",    hex: "#3B5EF6", subScore: 75 },
  { key: "above",      max: 0.5,                      label: "Above target",       position: "above",       tone: "amber",   hex: "#F59E0B", subScore: 55 },
  { key: "wellAbove",  max: Infinity,                 label: "Well above target",  position: "well above",  tone: "red",     hex: "#EF4444", subScore: 30 },
] as const satisfies readonly ExpenseRatioBand[];

/**
 * Where a ratio gauge ends: the edge past which a ratio is well above target.
 * A bar drawn to this scale is full at 50% of GCI.
 */
export const EXPENSE_RATIO_GAUGE_MAX = EXPENSE_RATIO_BANDS[2].max;

/**
 * Below 20% of GCI, Flight Crew is told the ratio more likely reflects
 * expenses not yet recorded than a low-cost business. Not a band: nothing is
 * scored or coloured from it, and a ratio under it is still well within
 * target on screen.
 */
export const EXPENSE_RATIO_LIKELY_INCOMPLETE_BELOW = 0.2;

/** Slate-500, as `bandColorHexForScore()` returns for a score it can't place. */
const NO_BAND_COLOR_HEX = "#6B7280";

// ── Lookups ─────────────────────────────────────────────────────────────────

/**
 * The band an expense ratio falls in. Null when there is nothing to place:
 * no GCI (the ratio is not finite) or no expenses recorded (the ratio is 0).
 * The Runway Score treats that second case as incomplete data, not as a low
 * ratio, so no surface paints it green.
 */
export function expenseRatioBand(ratio: number): ExpenseRatioBand | null {
  if (!Number.isFinite(ratio) || ratio <= 0) return null;
  for (const band of EXPENSE_RATIO_BANDS) {
    if (ratio <= band.max) return band;
  }
  // Unreachable — the last band has max: Infinity — but kept for exhaustiveness.
  return EXPENSE_RATIO_BANDS[EXPENSE_RATIO_BANDS.length - 1];
}

/** Colour token for a ratio. Each surface maps it to its own shade or class. */
export function expenseRatioTone(ratio: number): ExpenseRatioTone {
  return expenseRatioBand(ratio)?.tone ?? "slate";
}

/** Colour (hex) for a ratio, for surfaces that take a colour value: PDF, mobile, email. */
export function expenseRatioColorHex(ratio: number): string {
  return expenseRatioBand(ratio)?.hex ?? NO_BAND_COLOR_HEX;
}

/** True past 35% of GCI: where the insight card, the dashboard alert and the advisor card start. */
export function isExpenseRatioAboveTarget(ratio: number): boolean {
  return Number.isFinite(ratio) && ratio > EXPENSE_RATIO_TARGET_MAX;
}

// ── Wording ─────────────────────────────────────────────────────────────────

function pct(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

/**
 * A ratio as it prints beside the target: one decimal, dropped when it is
 * zero ("41%", "35.2%"). Rounding 35.2% to "35%" next to "target: 35% or
 * less" would read as on target when the band says above.
 */
export function formatExpenseRatio(ratio: number): string {
  if (!Number.isFinite(ratio)) return "—";
  return `${Math.round(ratio * 1000) / 10}%`;
}

/** A band's range in words: "25% or less", "over 25% to 35%", "over 50%". */
export function expenseRatioBandRange(band: ExpenseRatioBand): string {
  const index = EXPENSE_RATIO_BANDS.findIndex((b) => b.key === band.key);
  if (index === 0) return `${pct(band.max)} or less`;
  const floor = pct(EXPENSE_RATIO_BANDS[index - 1].max);
  return Number.isFinite(band.max) ? `over ${floor} to ${pct(band.max)}` : `over ${floor}`;
}

const TARGET = pct(EXPENSE_RATIO_TARGET_MAX);
const [WELL_WITHIN, WITHIN, ABOVE, WELL_ABOVE] = EXPENSE_RATIO_BANDS;

/**
 * The target, worded once. Every string is built from the numbers above, so
 * a surface that prints one of these cannot state a different figure.
 */
export const EXPENSE_RATIO_COPY = {
  /** "35% or less" */
  targetShort: `${TARGET} or less`,
  /** "35% of GCI or less" */
  target: `${TARGET} of GCI or less`,
  /** "Target: 35% or less". Caption under a gauge. */
  targetCaption: `Target: ${TARGET} or less`,
  /** "50%+". The right-hand end of a gauge. */
  gaugeMaxCaption: `${pct(EXPENSE_RATIO_GAUGE_MAX)}+`,
  /** Reads after a band's `position`: "is above Agent Runway's target of…". */
  targetPhrase: `Agent Runway's target of ${TARGET} of GCI or less`,
  targetSentence: `Agent Runway's target for the expense ratio is ${TARGET} of GCI or less.`,
  /** Whose number it is. Said wherever the target is explained, not just shown. */
  provenance: "It is Agent Runway's own target, not an industry statistic.",
  /** How the Runway Score reads the ratio, for the score's own explainer. */
  scoreSentence: `${pct(WELL_WITHIN.max)} or less scores highest. Over ${pct(ABOVE.max)} scores lowest.`,
  /** All four bands in one sentence. */
  bandsSentence:
    `${expenseRatioBandRange(WELL_WITHIN)} is ${WELL_WITHIN.position} target, ` +
    `${expenseRatioBandRange(WITHIN)} is ${WITHIN.position} target, ` +
    `${expenseRatioBandRange(ABOVE)} is ${ABOVE.position} target and ` +
    `${expenseRatioBandRange(WELL_ABOVE)} is ${WELL_ABOVE.position} target.`,
} as const;

/**
 * The band table as a list, one band per line, for Flight Crew's knowledge
 * and playbooks: "- over 25% to 35%: Within target (Runway sub-score 75)".
 */
export function expenseRatioBandsList(): string {
  return EXPENSE_RATIO_BANDS.map(
    (band) => `- ${expenseRatioBandRange(band)}: ${band.label} (Runway sub-score ${band.subScore})`,
  ).join("\n");
}

/**
 * Where a ratio sits against the target, to finish "Your expense ratio of
 * 41% is …": "above Agent Runway's target of 35% of GCI or less". Null when
 * the ratio has no band.
 */
export function expenseRatioVsTarget(ratio: number): string | null {
  const band = expenseRatioBand(ratio);
  return band ? `${band.position} ${EXPENSE_RATIO_COPY.targetPhrase}` : null;
}
