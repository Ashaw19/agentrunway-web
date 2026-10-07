// ── Year Plan Engine ────────────────────────────────────────────────────────
//
// The dashboard's "next year" view (Andrew, 2026-10-07: "On the dashboard, I
// should be able to flip between the current year and the next year").
// Next year has no actuals, so it is a plan, built from the same engines the
// rest of the app uses so its numbers agree with them:
//
//   - pipelineLinedUpForYear: active deals expected to close that year,
//     probability-weighted (activePipelineDeals + computeWeightedGCI — the
//     canonical filter/weighting every pipeline total uses).
//   - averageDealGCI: last two full years (history_items) + this year's
//     closed deals. The dashboard's YTD-only average is 0 in a slow year,
//     which would leave "deals needed" undefined exactly when it matters.
//   - dealsNeeded: remaining gap ÷ average, rounded up.
//   - monthlyTargets: goal spread by the same quarterly seasonal weights the
//     pace engine uses (normalizeSeasonalWeights).
//   - planTakeHome: projectedAgentNet (split/plan fees/brokerage fees, the
//     forecast + dashboard chain) − a full year of recurring expenses −
//     canadian-tax-engine income tax + CPP. Estimates only.

import {
  activePipelineDeals,
  computeWeightedGCI,
  type PipelineDealMetrics,
  type UserSettings,
} from "../types/database";
import { normalizeSeasonalWeights } from "./projection-engine";
import { projectedAgentNet } from "./effective-cash";
import { calculate as calculateCanadianTax } from "./canadian-tax-engine";
import type { CompSettingsSlice } from "./real-compensation-engine";

/**
 * A planned year is evaluated as of mid-year. The REAL plan's year-one test
 * (anniversary window from real_join_date) needs one date for a whole year;
 * July 1 represents most of it.
 */
export const PLAN_AS_OF_MONTH_DAY = "07-01";

// ── Pipeline already lined up ───────────────────────────────────────────────

export interface LinedUp {
  weightedGCI:  number;
  dealCount:    number;
  /** Active deals with no expected close date — can't be placed in a year. */
  undatedCount: number;
}

export function pipelineLinedUpForYear<
  T extends PipelineDealMetrics & { expected_close_date?: string | null },
>(deals: readonly T[], year: number): LinedUp {
  const active = activePipelineDeals(deals);
  const prefix = String(year);
  let weightedGCI = 0;
  let dealCount = 0;
  let undatedCount = 0;
  for (const d of active) {
    if (!d.expected_close_date) {
      undatedCount += 1;
      continue;
    }
    if (d.expected_close_date.slice(0, 4) !== prefix) continue;
    weightedGCI += computeWeightedGCI(d);
    dealCount += 1;
  }
  return { weightedGCI, dealCount, undatedCount };
}

// ── Average deal size ───────────────────────────────────────────────────────

export interface HistoryYear {
  year:       number;
  annual_gci: number;
  annual_tx:  number;
}

/** Average GCI per closed deal: the last `lookbackYears` full years + this year so far. */
export function averageDealGCI(
  history:       readonly HistoryYear[],
  ytd:           { gci: number; deals: number },
  currentYear:   number,
  lookbackYears: number = 2,
): { avg: number; deals: number } | null {
  let gci = Math.max(0, ytd.gci);
  let deals = Math.max(0, ytd.deals);
  for (const h of history) {
    if (h.year >= currentYear || h.year < currentYear - lookbackYears) continue;
    const tx = Number(h.annual_tx) || 0;
    if (tx <= 0) continue;
    gci += Number(h.annual_gci) || 0;
    deals += tx;
  }
  if (deals <= 0 || gci <= 0) return null;
  return { avg: gci / deals, deals };
}

export function dealsNeeded(goal: number, linedUpGCI: number, avgDealGCI: number | null): number | null {
  if (!(goal > 0) || !avgDealGCI || avgDealGCI <= 0) return null;
  return Math.ceil(Math.max(0, goal - linedUpGCI) / avgDealGCI);
}

// ── Month-by-month targets ──────────────────────────────────────────────────

/** 12 monthly targets: each quarter's share of the goal, split evenly over its 3 months. */
export function monthlyTargets(goal: number, seasonalWeights: readonly number[]): number[] {
  const w = normalizeSeasonalWeights([...seasonalWeights]);
  const g = goal > 0 ? goal : 0;
  return Array.from({ length: 12 }, (_, m) => (g * w[Math.floor(m / 3)]) / 3);
}

// ── Take-home at goal ───────────────────────────────────────────────────────

export interface PlanTakeHome {
  gci:             number;
  /** After commission split / plan fees, before brokerage desk fees. */
  afterPlan:       number;
  brokerageFees:   number;
  expenses:        number;
  netForTax:       number;
  incomeTaxAndCpp: number;
  takeHome:        number;
}

export function planTakeHome(input: {
  gci:              number;
  settings:         Pick<UserSettings, keyof CompSettingsSlice | "monthly_brokerage_fee" | "province">;
  monthlyRecurring: number;
  dealCount?:       number;
  year:             number;
}): PlanTakeHome {
  const { gci, settings, monthlyRecurring, dealCount, year } = input;
  const asOf = new Date(`${year}-${PLAN_AS_OF_MONTH_DAY}T12:00:00Z`);
  const brokerageFees = settings.monthly_brokerage_fee * 12;
  const afterPlanAndFees = projectedAgentNet(gci, settings, dealCount, asOf);
  const afterPlan = afterPlanAndFees + brokerageFees;
  const expenses = Math.max(0, monthlyRecurring) * 12;
  const netForTax = Math.max(0, afterPlanAndFees - expenses);
  const incomeTaxAndCpp = netForTax > 0
    ? calculateCanadianTax(netForTax, settings.province, Math.max(dealCount ?? 1, 1)).totalBurden
    : 0;
  return {
    gci,
    afterPlan,
    brokerageFees,
    expenses,
    netForTax,
    incomeTaxAndCpp,
    takeHome: Math.max(0, netForTax - incomeTaxAndCpp),
  };
}
