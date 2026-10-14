// The Scenario Engine's seed and its two columns.
//
// The Scenario Engine is on the Scenarios page and on Overhead's "Scenarios"
// tab. Its "Your Projection" column says it is based on the dashboard's data,
// so the seed is built from the rows the dashboard reads, through the
// dashboard's chain:
//
//   - the projection: `yearProjection` (core/engines/deal-tax-portion), the
//     dashboard's seasonal weights (the agent's own pattern once two history
//     years carry quarterly GCI, else the national pattern when it is switched
//     on, else four equal quarters), its listing appointments in projected
//     GCI, and its projected deal count;
//   - the cash behind the runway: `computeEffectiveCashForSurvival`, with the
//     year's closed deals for the plan's per-deal waterfall, like the dashboard;
//   - the runway: cash ÷ (burn − the pipeline income estimate,
//     `computePipelineMonthlyIncome`);
//   - the Runway Score's benchmark: `compare(projected GCI, experience)`;
//   - the tax: the dashboard's, on the projection as tax-year income
//     (core/engines/tax-year.ts): a cash-method agent's commissions count in
//     the year paid.
//
// Until 2026-10-14 the two pages built the seed themselves from
// `national_quarter_pcts` alone and the pipeline alone, counted deals to date
// instead of projected deals, left the pipeline income out of the runway and
// fixed the benchmark at the 50th percentile, so "Your Projection" could
// differ from the dashboard. scenario-seed.test.ts holds the two together.

import { yearProjection } from "@agent-runway/core/engines/deal-tax-portion";
import { incomeReportingMethod, taxYearGCIAdjustment, taxYearProjectedGCI } from "@agent-runway/core/engines/tax-year";
import { atlanticNoon } from "@agent-runway/core/lib/local-date";
import { computeEffectiveCashForSurvival, computePipelineMonthlyIncome } from "@/lib/engines/effective-cash";
import { computePlanGross, toPlanDeals, type CompSettingsSlice } from "@/lib/engines/real-compensation-engine";
import { calculate as calculateTax } from "@/lib/engines/canadian-tax-engine";
import { calculateCorporateTax } from "@/lib/engines/corporate-tax-engine";
import { survivalResult } from "@/lib/engines/survival-engine";
import { buildHealthReport } from "@/lib/engines/health-report";
import { compute as computeRunwayScore } from "@/lib/engines/runway-score-engine";
import { compare as benchmarkCompare } from "@/lib/engines/benchmark-engine";
import { seasonalFractionElapsed } from "@/lib/engines/projection-engine";
import {
  computeAgentGross,
  computeGCI,
  computeTxFees,
  type HistoryItem,
  type ListingAppointment,
  type PipelineDeal,
  type Province,
  type SplitPreset,
  type Transaction,
  type UserSettings,
} from "@/lib/types/database";

/** Data the client component needs — pre-computed server-side. */
export interface ScenarioSeedData {
  /** Plan-aware compensation slice (comp_plan + real_* + legacy split/fee
   *  fields). null when user_settings row is missing. */
  comp: CompSettingsSlice | null;
  /** Province slug from settings */
  province: string;
  /** Annual GCI goal */
  goalGCI: number;
  /** YTD GCI (closed transactions this year) */
  ytdGCI: number;
  /** Projected annual GCI: the dashboard's (yearProjection, listing appointments included) */
  projectedAnnualGCI: number;
  /** Projected year-end deal count: the dashboard's (yearProjection). The tax engine's per-deal divisor */
  projectedDealCount: number;
  /**
   * `taxYearGCIAdjustment` (core/engines/tax-year.ts): what moves a GCI
   * projection to tax-year income for a cash-method agent (commissions paid
   * in a year other than the closing year). 0 for accrual. The tax in both
   * columns is on the column's GCI plus this; the benchmark is not.
   */
  taxYearGCIAdjustment: number;
  /** Weighted GCI of the active pipeline (no listings): the Runway Score's pipeline input and the runway's income estimate */
  pipelineWeightedGCI: number;
  /** Expected each month: ytdExpenseTotals(...).monthlyRecurring (matches dashboard) */
  monthlyRecurring: number;
  /** Year-to-date expenses: ytdExpenseTotals(...).expensesYTD (matches dashboard) */
  expensesYTD: number;
  /** Expenses still to come this year (remainingYearExpenses): with expensesYTD, the year's expenses */
  expensesRemaining: number;
  /** Monthly brokerage fee from settings */
  monthlyBrokerageFee: number;
  /** Baseline cash for Survival — cashPosition.effectiveCash (matches dashboard/chat).
   *  User slider adjusts this value in scenarios-content; the seed value is the
   *  implied business cash position, not the raw user-entered cash_reserve field. */
  cashReserve: number;
  /** Whether incorporated */
  isIncorporated: boolean;
  /** Compensation method (salary/dividends/mixed) */
  compensationMethod: string;
  /** Seasonal quarter weights: the dashboard's (seasonalWeightsFor), so the seasonal fraction is its */
  quarterPcts: number[];
  /** Years in real estate from settings, for the benchmark (null = not set) */
  experienceYears: number | null;
  /** Brokerage split preset */
  splitPreset: SplitPreset;
  /** Post-cap threshold GCI */
  postCapThreshold: number;
  /** Post-cap agent percentage */
  postCapAgentPct: number;
  /** Post-cap brokerage percentage */
  postCapBrokeragePct: number;
  /** Transaction fee rate (decimal) */
  txFeeRate: number;
  /** Transaction fee annual cap */
  txFeeCap: number;
  /** Self-reported average weekly working hours (null = not set) */
  estimatedWeeklyHours: number | null;
  /** Weeks of vacation/time-off per year (null = not set) */
  vacationWeeks: number | null;
}

export interface ScenarioSeedInputs {
  /** The `user_settings` row, or null when there is none. */
  settings: UserSettings | null;
  /** This year's closed transactions (the dashboard's query). */
  transactions: Transaction[];
  /**
   * A REAL agent's closed deals before January 1 in the anniversary year that
   * contains it (loadCapYearCarryOver, the dashboard's carry-over). The plan
   * waterfall's cap carries across January 1; nothing else reads them.
   */
  carryOverTx: Transaction[];
  /**
   * A cash-method agent's closed deals before January 1 paid this year
   * (loadTaxYearCarryIn, the dashboard's carry-in). Only the tax reads them.
   */
  taxYearCarryIn: Transaction[];
  /** Every `pipeline_deals` row; terminal stages are dropped in the projection. */
  pipelineDeals: PipelineDeal[];
  /** `listing_appointments` rows with status scheduled or active (the dashboard's query). */
  listings: ListingAppointment[];
  /** `history_items` rows: the agent's own seasonal pattern. */
  historyItems: HistoryItem[];
  /** One `ytdExpenseTotals(...)` call, as the dashboard page makes it. */
  expenses: { expensesYTD: number; monthlyRecurring: number; expensesRemaining: number };
  /** The instant the seed is built for (defaults to now). */
  now?: Date;
}

/** The Scenario Engine's seed, through the dashboard's chain. */
export function buildScenarioSeed(inputs: ScenarioSeedInputs): ScenarioSeedData {
  const { settings, transactions, carryOverTx, taxYearCarryIn, expenses, now = new Date() } = inputs;
  const { expensesYTD, monthlyRecurring, expensesRemaining } = expenses;

  const ytdGCI = transactions.reduce((sum, tx) => sum + computeGCI(tx), 0);
  const projection = yearProjection({
    settings,
    ytdGCI,
    ytdDealCount: transactions.length,
    pipelineDeals: inputs.pipelineDeals,
    listings: inputs.listings,
    historyItems: inputs.historyItems,
    now,
  });

  // Baseline cash for Survival MUST be cashPosition.effectiveCash (not raw
  // cash_reserve) so the "current" scenario matches dashboard + chat. The
  // dashboard's planDeals (the cap year's carry-over + this year's closed
  // deals) give the plan's per-deal waterfall.
  // See memory/feedback_data_consistency_protocol.md.
  const baselineCash = settings
    ? computeEffectiveCashForSurvival({
        settings,
        ytdGCI,
        transactions: toPlanDeals(carryOverTx, transactions),
        expensesYTD,
        expensesRemaining,
        projectedGCI: projection.projectedGCI,
        projectedDealCount: projection.projectedDealCount,
        fraction: projection.fraction,
        // Atlantic calendar, not the server's UTC clock (local-date.ts).
        now: atlanticNoon(now),
      }).cashPosition.effectiveCash
    : 0;

  return {
    // Full plan slice (REAL waterfall support); null settings → legacy defaults.
    comp: settings ?? null,
    province: settings?.province ?? "ontario",
    goalGCI: settings?.goal_gci ?? 0,
    ytdGCI,
    projectedAnnualGCI: projection.projectedGCI,
    projectedDealCount: projection.projectedDealCount,
    taxYearGCIAdjustment: taxYearGCIAdjustment(
      [...transactions, ...taxYearCarryIn],
      incomeReportingMethod(settings),
      atlanticNoon(now).getFullYear(),
    ),
    pipelineWeightedGCI: projection.pipelineWeightedGCI,
    monthlyRecurring,
    expensesYTD,
    expensesRemaining,
    monthlyBrokerageFee: settings?.monthly_brokerage_fee ?? 0,
    cashReserve: baselineCash,
    isIncorporated: settings?.is_incorporated ?? false,
    compensationMethod: settings?.compensation_method ?? "salary",
    quarterPcts: projection.seasonalWeights,
    experienceYears: settings?.experience_years ?? null,
    splitPreset: (settings?.split_preset ?? "p80_20") as SplitPreset,
    postCapThreshold: settings?.post_cap_threshold_gci ?? 0,
    postCapAgentPct: settings?.post_cap_agent_pct ?? 1,
    postCapBrokeragePct: settings?.post_cap_brokerage_pct ?? 0,
    txFeeRate: settings?.tx_fee_rate_pct ?? 0,
    txFeeCap: settings?.tx_fee_annual_cap ?? 0,
    estimatedWeeklyHours: settings?.estimated_weekly_hours ?? null,
    vacationWeeks: settings?.vacation_weeks_per_year ?? null,
  };
}

// ── The two columns ─────────────────────────────────────────────────────────

export type CompensationMethod = "salary" | "dividends" | "mixed";

/** The inputs the Scenario Engine lets the agent change. */
export interface ScenarioInputs {
  annualGCI: number;
  dealCount: number;
  rrspContribution: number;
  isIncorporated: boolean;
  compensationMethod: CompensationMethod;
  monthlyRecurring: number;
  cashReserve: number;
}

export interface ScenarioResult {
  taxOwed: number;
  netIncome: number;
  effectiveRate: number;
  quarterlyInstalment: number;
  perDealSetAside: number;
  runwayScore: number;
  runwayGrade: string;
  survivalMonths: number;
  /** The pipeline income estimate the runway nets from the burn (0 = none). */
  pipelineMonthlyIncome: number;
}

/** "Your Projection": the seed's own figures, nothing changed. */
export function seedScenarioInputs(seed: ScenarioSeedData): ScenarioInputs {
  return {
    annualGCI: seed.projectedAnnualGCI,
    dealCount: seed.projectedDealCount,
    rrspContribution: 0,
    isIncorporated: seed.isIncorporated,
    compensationMethod: (seed.compensationMethod as CompensationMethod) || "salary",
    monthlyRecurring: seed.monthlyRecurring,
    cashReserve: seed.cashReserve,
  };
}

/**
 * One column of the Scenario Engine: the dashboard's chain on the seed, with
 * the agent's changes. With `seedScenarioInputs(seed)` it is the dashboard's
 * tax estimate, per-deal tax portion, cash runway and Runway Score.
 */
export function computeScenarioResult(
  seed: ScenarioSeedData,
  inputs: ScenarioInputs,
  now: Date = new Date(),
): ScenarioResult {
  const {
    annualGCI,
    dealCount,
    rrspContribution,
    isIncorporated,
    compensationMethod,
    monthlyRecurring,
    cashReserve,
  } = inputs;
  const province = (seed.province || "ontario") as Province;

  // ── Match dashboard: deduct split, fees, brokerage, expenses before tax ──
  // Plan-aware (REAL analytic waterfall or legacy split) — mirrors
  // effective-cash.ts:projectedAgentNet on hypothetical annual figures, on
  // the column's GCI as tax-year income (annualGCI for an accrual agent).
  const taxGCI = taxYearProjectedGCI(annualGCI, seed.taxYearGCIAdjustment);
  const planScenario = seed.comp
    ? computePlanGross(seed.comp, taxGCI, { dealCount })
    : null;
  const agentGross = planScenario
    ? planScenario.shareBeforePlanFees
    : computeAgentGross(taxGCI, seed.splitPreset, seed.postCapThreshold, seed.postCapAgentPct, seed.postCapBrokeragePct).agentGross;
  const txFees = planScenario ? planScenario.planFees : computeTxFees(taxGCI, seed.txFeeRate, seed.txFeeCap);
  const brokerageFeeAnnual = seed.monthlyBrokerageFee * 12;

  // Dashboard projects annual expenses: expensesYTD + what is still to come
  // this year. A changed monthly figure moves each whole month after this
  // one by the difference; unchanged, this is the dashboard's number. The
  // rest of the year never goes below zero: the monthly figure carries a
  // twelfth of an annual fee that may already be charged, so lowering it
  // can't take back what is in expensesYTD.
  const expRemainingMonths = Math.max(0, 12 - (now.getMonth() + 1));
  const restOfYear = Math.max(
    0,
    seed.expensesRemaining + (monthlyRecurring - seed.monthlyRecurring) * expRemainingMonths,
  );
  const annualExpenses = seed.expensesYTD + restOfYear;

  const projectedNet = agentGross - txFees - brokerageFeeAnnual;
  const netForTax = Math.max(0, projectedNet - annualExpenses - rrspContribution);

  let taxOwed: number;
  let netIncome: number;
  let effectiveRate: number;
  let quarterlyInstalment: number;
  let perDealSetAside: number;

  if (isIncorporated) {
    // Dashboard passes netForTax as corporateIncome (RRSP already deducted above for salary)
    const corpResult = calculateCorporateTax({
      corporateIncome: netForTax,
      province,
      compensationMethod,
      dealCount: dealCount > 0 ? dealCount : 1,
    });
    taxOwed = corpResult.totalCombinedTax;
    netIncome = corpResult.netPersonalIncome;
    effectiveRate = netForTax > 0 ? taxOwed / netForTax : 0;
    quarterlyInstalment = taxOwed / 4;
    perDealSetAside = dealCount > 0 ? taxOwed / dealCount : taxOwed;
  } else {
    const taxResult = calculateTax(netForTax, province, dealCount > 0 ? dealCount : 1);
    taxOwed = taxResult.totalBurden;
    netIncome = netForTax - taxOwed;
    effectiveRate = taxResult.effectiveRate;
    quarterlyInstalment = taxResult.quarterlyEstimate;
    perDealSetAside = taxResult.perDealSetAside;
  }

  // ── Runway score (uses YTD GCI for pace, not projected) ──────────────
  const fraction = seasonalFractionElapsed(seed.quarterPcts, now);
  const healthReport = buildHealthReport(
    seed.ytdGCI,
    seed.goalGCI,
    fraction,
    seed.pipelineWeightedGCI,
    seed.expensesYTD,
  );

  // Survival months — cashReserve here is the user-adjusted slider value,
  // but the baseline comes from cashPosition.effectiveCash (buildScenarioSeed)
  // so the "no change" scenario matches dashboard + chat. The burn is netted
  // by the dashboard's pipeline income estimate (#330).
  // See memory/feedback_data_consistency_protocol.md.
  const survival = survivalResult(
    seed.monthlyBrokerageFee,
    monthlyRecurring,
    cashReserve,
    computePipelineMonthlyIncome(seed.pipelineWeightedGCI, fraction),
  );

  // The dashboard's benchmark: where this projected GCI sits in the agent's
  // experience cohort. The What If column moves it with its GCI.
  const benchmark = benchmarkCompare(annualGCI, seed.experienceYears);
  const runwayResult = computeRunwayScore(
    healthReport,
    benchmark.percentile,
    survival.months,
  );

  return {
    taxOwed,
    netIncome,
    effectiveRate,
    quarterlyInstalment,
    perDealSetAside,
    runwayScore: runwayResult.score,
    runwayGrade: runwayResult.grade,
    survivalMonths: survival.months,
    pipelineMonthlyIncome: survival.monthlyIncome,
  };
}
