/**
 * Captain tax-intel line: "[SEASONAL COMMISSION PATTERN]".
 *
 * Emitted when the quarter `today` falls in carries more than 30% of the
 * agent's annual GCI and at least two deals have closed in it. Pure: the chat
 * route passes its inputs in, so the quarter can be pinned in a unit test.
 *
 * Tax copy is information, not advice: the line states engine estimates and
 * tells the model to describe no action.
 */
import { taxPortionOfCommission } from "@agent-runway/core/engines/deal-tax-portion";
import { currentQuarter } from "@agent-runway/core/engines/projection-engine";
import { fmtCurrency } from "@/lib/formatters";

/** A quarter is "heavy" when its share of annual GCI is above this. */
const HEAVY_QUARTER_WEIGHT = 0.30;
/** Deals closed in the quarter before the line is emitted. */
const MIN_QUARTER_DEALS = 2;

export interface SeasonalCommissionInput {
  /** Calendar anchor. The chat route passes atlanticNoon(). */
  today: Date;
  /** Quarter weights as fractions of annual GCI (index 0 = Q1 .. 3 = Q4). */
  seasonalWeights: number[];
  /** This year's closed deals. `date` is date-only (YYYY-MM-DD). */
  ytdTx: { date: string }[];
  /** Projected year-end GCI. */
  projectedGCI: number;
  /** canadian-tax-engine `totalBurden`: the year's estimate. */
  annualTaxEstimate: number;
  /** canadian-tax-engine `perDealSetAside`. */
  perDealSetAside: number;
}

export interface SeasonalQuarterStats {
  /** Quarter number as shown to the agent: 1 = Q1 .. 4 = Q4. */
  quarter: number;
  /** That quarter's share of annual GCI (0-1). */
  weight: number;
  /** Deals in `ytdTx` that closed in that quarter. */
  deals: number;
}

/** The quarter `today` falls in: its seasonal weight and its closed deals. */
export function seasonalQuarterStats(
  today: Date,
  seasonalWeights: number[],
  ytdTx: { date: string }[],
): SeasonalQuarterStats {
  // 0-based (0 = Q1 .. 3 = Q4), the same base as the weights array. Only the
  // label shown to the agent is 1-based.
  const currentQ = currentQuarter(today);
  const weight = seasonalWeights[currentQ] ?? 0;
  const deals = ytdTx.filter((tx) => {
    // Local-noon anchor — `tx.date` is date-only, so a bare `new Date()`
    // pushes every Jan 1 / Apr 1 / Jul 1 / Oct 1 close into the previous
    // quarter and under-counts the quarter this nudge is reasoning about.
    const m = new Date(tx.date + "T12:00:00").getMonth();
    return Math.floor(m / 3) === currentQ;
  }).length;
  return { quarter: currentQ + 1, weight, deals };
}

/** The tax-intel line, or null when the current quarter is not a heavy one. */
export function seasonalCommissionPatternLine(input: SeasonalCommissionInput): string | null {
  const { quarter, weight, deals } = seasonalQuarterStats(input.today, input.seasonalWeights, input.ytdTx);
  if (weight <= HEAVY_QUARTER_WEIGHT || deals < MIN_QUARTER_DEALS) return null;

  // The quarter's tax portion: the year's estimate by the quarter's share of
  // projected GCI, the definition the deal-close screens use for one
  // commission. This line used to multiply the quarter's GCI by the engine's
  // `effectiveRate` (a share of NET income) and call that a marginal rate.
  const qProjectedGCI = input.projectedGCI * weight;
  const qTaxPortion = taxPortionOfCommission(qProjectedGCI, input.projectedGCI, input.annualTaxEstimate);
  return (
    `[SEASONAL COMMISSION PATTERN] Q${quarter} seasonal weight: ${(weight * 100).toFixed(0)}% of annual. ` +
    `Agent closed ${deals} deals in Q${quarter}. ` +
    `Tax portion of this quarter's projected GCI of ${fmtCurrency(qProjectedGCI)}: ~${fmtCurrency(qTaxPortion)}, ` +
    `the quarter's share of the year's estimate of ${fmtCurrency(input.annualTaxEstimate)}. ` +
    `Per-deal tax portion: ${fmtCurrency(input.perDealSetAside)}. ` +
    `State the math only — describe no action.`
  );
}
