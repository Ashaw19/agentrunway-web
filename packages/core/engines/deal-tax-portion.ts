// DealTaxPortion — the tax portion of one commission.
//
// ESTIMATE ONLY — Not legal or tax advice.
//
// WHY THIS EXISTS
// ---------------
// Income tax is worked out on net business income for the whole year, so the
// tax on one deal cannot be read off the deal. Until 2026-10-13 three screens
// answered "how much of this commission is tax" three ways:
//   - the dashboard, Forecast and Reports: the year's estimate / projected
//     deals ("Per-deal tax portion", canadian-tax-engine `perDealSetAside`);
//   - the two deal-close screens: the commission x a marginal rate looked up
//     at GCI (not at net income), with CPP left out;
//   - the Flight Crew's paycheque guidance: the commission x income tax / net
//     income, called a marginal rate.
//
// ONE DEFINITION
// --------------
//   tax portion of a commission
//     = the year's tax estimate x the commission / projected year-end GCI
//
// The year's tax estimate is the engine's `totalBurden` (federal tax +
// provincial tax + CPP/QPP) on projected net business income: the figure the
// dashboard's tax card is headed with. The per-deal tax portion is this same
// definition for a deal of the projected average size (projected GCI /
// projected deals), so the two cannot disagree, and the portions of every
// deal in the projected year add up to the year's estimate.
//
// It is linear in the commission on purpose. A with-and-without difference
// (the estimate with this commission less the estimate without it) depends on
// which deal is counted last, and those differences do not add up to the
// year's estimate.

import { calculate, type CanadianTaxResult } from "./canadian-tax-engine";
import { computeProjectedNetForTax, type ProjectedNetForTaxInputs } from "./effective-cash";
import {
  computeListingWeightedGCI,
  projectedYearEndGCI,
  projectedYearEndTransactions,
  seasonalFractionElapsed,
  type ListingWeightInput,
} from "./projection-engine";
import {
  activePipelineDeals,
  computeWeightedGCI,
  type PipelineDealMetrics,
  type UserSettings,
} from "../types/database";

/** Round to the nearest cent, like the tax engine. */
const cents = (n: number) => Math.round(n * 100) / 100;

const FLAT_SEASONAL_WEIGHTS = [0.25, 0.25, 0.25, 0.25];

// ── The definition ──────────────────────────────────────────────────────────

/**
 * The tax portion of a commission: the year's tax estimate, by the
 * commission's share of projected year-end GCI.
 *
 * @param commissionGCI     The commission, as GCI (before the brokerage split).
 * @param projectedGCI      Projected year-end GCI, this commission included.
 * @param annualTaxEstimate The engine's estimate for the year (`totalBurden`).
 * @returns Dollars and cents. 0 when there is no projection or no estimate.
 *          Never more than the year's estimate.
 */
export function taxPortionOfCommission(
  commissionGCI: number,
  projectedGCI: number,
  annualTaxEstimate: number,
): number {
  if (!(commissionGCI > 0) || !(projectedGCI > 0) || !(annualTaxEstimate > 0)) return 0;
  const share = Math.min(1, commissionGCI / projectedGCI);
  return cents(annualTaxEstimate * share);
}

// ── The year's tax estimate, from the rows the dashboard reads ──────────────

/** A history year, as far as the seasonal pattern reads it. */
export interface SeasonalHistoryYear {
  quarter_gci: ReadonlyArray<number | null> | null | undefined;
}

/**
 * Quarter weights for the year's projection. Mirrors dashboard-content.tsx:
 * the agent's own pattern once two history years carry quarterly GCI, else
 * the national pattern when the agent has it switched on, else four equal
 * quarters.
 */
export function seasonalWeightsFor(
  historyItems: ReadonlyArray<SeasonalHistoryYear>,
  settings: Pick<UserSettings, "use_national_seasonality" | "national_quarter_pcts">,
): number[] {
  const withData = historyItems.filter((h) => (h.quarter_gci ?? []).some((v) => (v ?? 0) > 0));
  if (withData.length >= 2) {
    const avgQ = [0, 1, 2, 3].map(
      (q) => withData.reduce((sum, h) => sum + (h.quarter_gci?.[q] ?? 0), 0) / withData.length,
    );
    const total = avgQ.reduce((a, b) => a + b, 0);
    if (total > 0) return avgQ.map((v) => v / total);
  }
  return settings.use_national_seasonality
    ? (settings.national_quarter_pcts ?? FLAT_SEASONAL_WEIGHTS)
    : FLAT_SEASONAL_WEIGHTS;
}

export interface YearTaxEstimateInputs {
  settings: ProjectedNetForTaxInputs["settings"] &
    Pick<UserSettings, "province" | "goal_gci" | "use_national_seasonality" | "national_quarter_pcts">;
  /** GCI of this year's closed deals (sum of `computeGCI`). */
  ytdGCI: number;
  /** This year's closed deals. */
  ytdDealCount: number;
  /** Every pipeline row; terminal stages are dropped here. */
  pipelineDeals: ReadonlyArray<PipelineDealMetrics & { id: string; stage: string }>;
  /** `listing_appointments` rows with status scheduled or active. */
  listings: ReadonlyArray<ListingWeightInput> | null | undefined;
  historyItems: ReadonlyArray<SeasonalHistoryYear>;
  /** `ytdExpenseTotals(...).expensesYTD` */
  expensesYTD: number;
  /** `ytdExpenseTotals(...).expensesRemaining` */
  expensesRemaining: number;
  now?: Date;
}

export interface YearTaxEstimate {
  /** Seasonal fraction of the year elapsed. */
  fraction: number;
  projectedGCI: number;
  projectedDealCount: number;
  /** Projected net business income: the tax engine's input. */
  netForTax: number;
  /** The engine's estimate for the year. `totalBurden` heads the dashboard's tax card. */
  tax: CanadianTaxResult;
}

/**
 * The dashboard's tax estimate for the year, from the rows the dashboard
 * reads. Mirrors dashboard-content.tsx ("Seasonality-aware projections" and
 * "Tax estimate"); cross-surface-parity.test.ts holds the two together.
 */
export function yearTaxEstimate(inputs: YearTaxEstimateInputs): YearTaxEstimate {
  const { settings, ytdGCI, ytdDealCount, expensesYTD, expensesRemaining, now = new Date() } = inputs;

  const livePipelineDeals = activePipelineDeals(inputs.pipelineDeals);
  const pipelineWeightedGCI = livePipelineDeals.reduce((sum, d) => sum + computeWeightedGCI(d), 0);
  const listingWeightedGCI = computeListingWeightedGCI(inputs.listings);

  const fraction = seasonalFractionElapsed(seasonalWeightsFor(inputs.historyItems, settings), now);
  const projectedGCI = projectedYearEndGCI(
    ytdGCI, pipelineWeightedGCI + listingWeightedGCI, fraction, settings.goal_gci ?? 0,
  );
  const projectedDealCount = projectedYearEndTransactions(ytdDealCount, livePipelineDeals.length, fraction);

  const netForTax = computeProjectedNetForTax({
    projectedGCI,
    expensesYTD,
    expensesRemaining,
    settings,
    projectedDealCount,
    now,
  });
  const tax = calculate(netForTax, settings.province, Math.max(projectedDealCount, 1));

  return { fraction, projectedGCI, projectedDealCount, netForTax, tax };
}

// ── A deal closing ──────────────────────────────────────────────────────────

export interface DealCloseTaxInputs extends YearTaxEstimateInputs {
  /** GCI of the deal being closed. Not yet in `ytdGCI`. */
  commissionGCI: number;
  /** The pipeline row the deal is closing from, if any. */
  closingPipelineDealId?: string | null;
}

export interface DealTaxPortion {
  /** {@link taxPortionOfCommission} for this commission. */
  taxPortion: number;
  commissionGCI: number;
  /** The year's estimate with this deal closed (`totalBurden`). */
  annualTaxEstimate: number;
  /** Projected year-end GCI with this deal closed. */
  projectedGCI: number;
  /** The engine's tax year. */
  taxYear: number;
}

/**
 * The tax portion of a commission at the moment its deal closes.
 *
 * The year is estimated with the deal already closed (its GCI in the year to
 * date, its row out of the pipeline), which is the estimate the dashboard
 * shows once it reloads.
 */
export function dealCloseTaxPortion(inputs: DealCloseTaxInputs): DealTaxPortion {
  const { commissionGCI, closingPipelineDealId, ...year } = inputs;
  const gci = commissionGCI > 0 ? commissionGCI : 0;

  const afterClose = yearTaxEstimate({
    ...year,
    ytdGCI: year.ytdGCI + gci,
    ytdDealCount: year.ytdDealCount + 1,
    pipelineDeals: closingPipelineDealId
      ? year.pipelineDeals.filter((d) => d.id !== closingPipelineDealId)
      : year.pipelineDeals,
  });

  return {
    taxPortion: taxPortionOfCommission(gci, afterClose.projectedGCI, afterClose.tax.totalBurden),
    commissionGCI: gci,
    annualTaxEstimate: afterClose.tax.totalBurden,
    projectedGCI: afterClose.projectedGCI,
    taxYear: afterClose.tax.taxYear,
  };
}
