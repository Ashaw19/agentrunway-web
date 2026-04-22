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
): number {
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
