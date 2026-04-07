// SurvivalEngine — ported from Swift
// Cash reserve runway months calculation with risk classification.

// ── Risk Level ──────────────────────────────────────────────────────────────

export type RiskLevel = "critical" | "warning" | "healthy" | "strong" | "notConfigured";

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
  // Income strictly exceeds expenses: cash-flow positive → indefinite runway.
  if (netBurn < 0) return 24.0;
  // Break-even (net burn = 0): runway depends on whether there is any cash.
  // Cash > 0 → effectively infinite; cash = 0 → no buffer at all → 0.
  if (netBurn === 0) return cashReserve > 0 ? 24.0 : 0;
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

  // If cash reserve is 0 AND no burn tracked, user hasn't configured — show neutral state
  if (cashReserve <= 0 && burn <= 0) {
    return {
      months: -1, // sentinel: not configured
      riskLevel: "notConfigured",
      monthlyBurn: 0,
      monthlyIncome: pipelineMonthlyEstimate,
      cashReserve: 0,
      label: "Not set",
    };
  }

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
