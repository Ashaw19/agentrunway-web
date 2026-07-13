// EffectiveCash helpers — deliberate copy for mcp-server Edge Function.
//
// KEEP IN SYNC with packages/core/engines/effective-cash.ts
// If the canonical helpers there change, mirror the changes here in the same
// commit. Deno edge functions cannot import workspace packages directly, so
// this copy exists per Pattern P-2 (deliberate-duplicate guarded by review).
//
// See:
//   - /Users/b/.claude/.../memory/feedback_data_consistency_protocol.md
//   - apps/web/supabase/functions/mcp-server/lib/README.md
//
// ESTIMATE ONLY — Not legal or tax advice.

export type SplitPreset =
  | "p70_30"
  | "p75_25"
  | "p80_20"
  | "p85_15"
  | "p90_10"
  | "p95_5"
  | "p100_0";

const SPLIT_PRESET_AGENT_PCT: Record<SplitPreset, number> = {
  p70_30: 0.7,
  p75_25: 0.75,
  p80_20: 0.8,
  p85_15: 0.85,
  p90_10: 0.9,
  p95_5: 0.95,
  p100_0: 1.0,
};

export interface EffectiveCashSettingsSlice {
  split_preset: SplitPreset;
  post_cap_threshold_gci: number;
  post_cap_agent_pct: number;
  post_cap_brokerage_pct?: number | null;
  tx_fee_rate_pct: number;
  tx_fee_annual_cap: number;
  monthly_brokerage_fee: number;

  // Compensation plan (REAL Brokerage — migration 00161). Mirrors the
  // RealCompSettings slice in packages/core/engines/real-compensation-engine.ts.
  // Optional so pre-00161 callers keep compiling; absent → 'simple_split'.
  comp_plan?: "simple_split" | "real" | null;
  real_join_date?: string | null;
  real_cap_amount?: number | null;
  real_pre_cap_agent_pct?: number | null;
  real_post_cap_agent_pct?: number | null;
  real_post_cap_fee?: number | null;
  real_elite_fee?: number | null;
  real_elite_threshold?: number | null;
  real_cbr_fee?: number | null;
  real_beop_annual?: number | null;
  real_signup_fee?: number | null;
  real_cap_paid_seed?: number | null;
  real_post_cap_fees_paid_seed?: number | null;
  /** Stored YTD deal count (user_settings.ytd_transactions) — drives per-deal
   *  fee modeling in the analytic REAL path. */
  ytd_transactions?: number | null;
}

// Mirrors packages/core/engines/real-compensation-engine.ts:REAL_COMPANY_DOLLAR_RATE
const REAL_COMPANY_DOLLAR_RATE = 0.15;

// Mirrors packages/core/engines/real-compensation-engine.ts:simulateRealCompensation
// (the ANALYTIC path — the MCP tax tool has no deal list, so like the web
// projection path it models a uniform-deal year; exact per-deal accuracy is
// not required for a projection input).
function simulateRealNet(
  s: EffectiveCashSettingsSlice,
  annualGci: number,
  dealCount: number,
  isYearOne: boolean,
): number {
  if (annualGci <= 0 || dealCount <= 0) return 0;
  const capAmount = s.real_cap_amount ?? 15000;
  const prePct = s.real_pre_cap_agent_pct ?? 0.85;
  const postPct = s.real_post_cap_agent_pct ?? 1.0;
  const postCapFee = s.real_post_cap_fee ?? 375;
  const eliteFee = s.real_elite_fee ?? 175;
  const eliteThreshold = s.real_elite_threshold ?? 9000;

  const companyDollar = Math.min(annualGci * REAL_COMPANY_DOLLAR_RATE, capAmount);
  const preCapGci = companyDollar / REAL_COMPANY_DOLLAR_RATE;
  const postCapGci = Math.max(0, annualGci - preCapGci);
  const agentShare = preCapGci * prePct + postCapGci * postPct;

  const postCapDeals = Math.round(dealCount * (postCapGci / annualGci));
  const dealsToElite = postCapFee > 0 ? Math.ceil(eliteThreshold / postCapFee) : 0;
  const fullFeeDeals = Math.min(postCapDeals, dealsToElite);
  const eliteDeals = Math.max(0, postCapDeals - fullFeeDeals);
  const postCapFees = fullFeeDeals * postCapFee + eliteDeals * eliteFee;

  const cbrFees = dealCount * (s.real_cbr_fee ?? 40);
  const beopFees = (Math.min(3, dealCount) / 3) * (s.real_beop_annual ?? 1200);
  const signup = isYearOne ? (s.real_signup_fee ?? 249) : 0;

  return agentShare - (postCapFees + cbrFees + beopFees + signup);
}

/** Is `now` inside the agent's first REAL anniversary year? */
function isRealYearOne(joinDate: string | null | undefined, now: Date): boolean {
  if (!joinDate) return true;
  const oneYearOn = new Date(joinDate.slice(0, 10) + "T12:00:00");
  oneYearOn.setFullYear(oneYearOn.getFullYear() + 1);
  return now < oneYearOn;
}

// Mirrors packages/core/types/database.ts:computeTxFees
function computeTxFees(totalGCI: number, rateDecimal: number, annualCap: number): number {
  const raw = totalGCI * rateDecimal;
  return annualCap > 0 ? Math.min(raw, annualCap) : raw;
}

// Mirrors packages/core/types/database.ts:computeAgentGross
function computeAgentGross(
  totalGCI: number,
  preset: SplitPreset,
  postCapThreshold: number,
  postCapAgentPct: number,
): { agentGross: number; brokerageTake: number } {
  const agentPct = SPLIT_PRESET_AGENT_PCT[preset] ?? 1;
  const brokeragePct = 1 - agentPct;

  if (postCapThreshold > 0 && totalGCI > postCapThreshold) {
    const preCap = postCapThreshold * agentPct;
    const postCap = (totalGCI - postCapThreshold) * postCapAgentPct;
    const agentGross = preCap + postCap;
    return { agentGross, brokerageTake: totalGCI - agentGross };
  }

  const agentGross = totalGCI * agentPct;
  return { agentGross, brokerageTake: totalGCI * brokeragePct };
}

function projectedAgentNet(
  projectedGCI: number,
  settings: EffectiveCashSettingsSlice,
  now: Date = new Date(),
): number {
  // Plan-aware — mirrors packages/core/engines/effective-cash.ts:projectedAgentNet.
  if (settings.comp_plan === "real") {
    const dealCount = Math.max(
      1,
      settings.ytd_transactions ?? Math.round(projectedGCI / 15000),
    );
    const realNet = simulateRealNet(
      settings,
      projectedGCI,
      dealCount,
      isRealYearOne(settings.real_join_date, now),
    );
    return realNet - settings.monthly_brokerage_fee * 12;
  }

  const { agentGross } = computeAgentGross(
    projectedGCI,
    settings.split_preset,
    settings.post_cap_threshold_gci,
    settings.post_cap_agent_pct,
  );
  const txFees = computeTxFees(
    projectedGCI,
    settings.tx_fee_rate_pct,
    settings.tx_fee_annual_cap,
  );
  const brokerageFeeAnnual = settings.monthly_brokerage_fee * 12;
  return agentGross - txFees - brokerageFeeAnnual;
}

export interface ProjectedNetForTaxInputs {
  projectedGCI: number;
  expensesYTD: number;
  monthlyRecurring: number;
  settings: EffectiveCashSettingsSlice;
  now?: Date;
}

/**
 * D-2 canonical (MCP copy): projected full-year net-for-tax used as the
 * taxable income input to the tax engine.
 *
 * Mirrors packages/core/engines/effective-cash.ts:computeProjectedNetForTax
 * exactly. See that file's header for the formula.
 */
export function computeProjectedNetForTax(
  inputs: ProjectedNetForTaxInputs,
): number {
  const {
    projectedGCI,
    expensesYTD,
    monthlyRecurring,
    settings,
    now = new Date(),
  } = inputs;
  const expRemainingMonths = Math.max(0, 12 - (now.getMonth() + 1));
  const annualExpenses = expensesYTD + monthlyRecurring * expRemainingMonths;
  const projectedNet = projectedAgentNet(projectedGCI, settings);
  return Math.max(0, projectedNet - annualExpenses);
}

/**
 * D-1 canonical (MCP copy): monthly pipeline income estimate.
 *
 * Mirrors packages/core/engines/effective-cash.ts:computePipelineMonthlyIncome
 * exactly. See that file's header for the formula.
 */
export function computePipelineMonthlyIncome(
  pipelineWeightedGCI: number,
  fraction: number,
): number {
  if (fraction <= 0) return 0;
  const remainingMonths = Math.max(1, 12 - Math.floor(fraction * 12));
  return pipelineWeightedGCI / remainingMonths;
}
