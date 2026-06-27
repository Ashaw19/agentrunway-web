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

// ── Risk color band ───────────────────────────────────────────────────────────

/**
 * The single semantic color contract for a survival RiskLevel. ONE meaning per
 * color, everywhere on every surface (dashboard hero, forecast, expenses,
 * reports, PDF). Aligned to spec_runway_score_canonical_bands.md §9.1/§9.5:
 *
 *   critical (<2mo)   → "red"     concern
 *   warning  (2–<4mo) → "amber"   watch
 *   healthy  (4–<6mo) → "amber"   watch    ← NOT emerald: under 6 months is not yet "strong"
 *   strong   (6mo+)   → "emerald" genuine strength
 *   notConfigured     → "slate"   no data
 *
 * Each surface maps the returned band token to its own shade/format (Tailwind
 * class, hex, KpiCard colorScheme, react-pdf style). Keeping the
 * riskLevel→band assignment here is what stops the semantic from drifting
 * across surfaces again — display code must derive its color from this, never
 * re-encode the ladder. This is a SEPARATE band system from the composite
 * Runway Score's RUNWAY_SCORE_BANDS (runway-score-engine.ts); it is keyed off
 * cash-runway months, not the 0–100 composite score.
 */
export type RiskColorBand = "red" | "amber" | "emerald" | "slate";

export function riskColorBand(level: RiskLevel): RiskColorBand {
  switch (level) {
    case "critical":
      return "red";
    case "warning":
    case "healthy":
      return "amber";
    case "strong":
      return "emerald";
    case "notConfigured":
      return "slate";
  }
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
