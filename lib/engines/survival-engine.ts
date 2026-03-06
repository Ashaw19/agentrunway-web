// SurvivalEngine — ported from Swift
// Cash reserve runway months calculation with risk classification.

// ── Risk Level ──────────────────────────────────────────────────────────────

export type RiskLevel = "critical" | "warning" | "healthy" | "strong";

export function riskLevelFromMonths(months: number): RiskLevel {
  if (months < 2) return "critical";
  if (months < 4) return "warning";
  if (months < 6) return "healthy";
  return "strong";
}

// ── Result ──────────────────────────────────────────────────────────────────

export interface SurvivalResult {
  months: number; // capped at 24
  riskLevel: RiskLevel;
  monthlyBurn: number;
  monthlyIncome: number;
  cashReserve: number;
  label: string;
}

// ── Calculations ────────────────────────────────────────────────────────────

/** Pure runway months: cash / (burn - income). Capped at 24. */
export function runwayMonths(
  monthlyBurn: number,
  cashReserve: number,
  monthlyIncome: number = 0,
): number {
  const netBurn = monthlyBurn - monthlyIncome;
  if (netBurn <= 0) {
    return cashReserve > 0 ? 24.0 : 0.0;
  }
  return Math.min(24.0, cashReserve / netBurn);
}

/** Full survival result from monthly cost inputs + cash reserve. */
export function survivalResult(
  monthlyBrokerageFee: number,
  monthlyRecurringExpenses: number,
  cashReserve: number,
  pipelineMonthlyEstimate: number = 0,
): SurvivalResult {
  const burn = monthlyBrokerageFee + monthlyRecurringExpenses;
  const months = runwayMonths(burn, cashReserve, pipelineMonthlyEstimate);
  const risk = riskLevelFromMonths(months);
  const label = months >= 24 ? "24+ months" : `${months.toFixed(1)} months`;

  return {
    months,
    riskLevel: risk,
    monthlyBurn: burn,
    monthlyIncome: pipelineMonthlyEstimate,
    cashReserve,
    label,
  };
}
