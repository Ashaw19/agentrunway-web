// SurvivalEngine — ported from Swift
// Cash reserve runway months calculation with risk classification.

import { fmtCurrency } from "../formatters";

// ── Risk Level ──────────────────────────────────────────────────────────────

export type RiskLevel = "critical" | "warning" | "healthy" | "strong" | "notConfigured";

/** A band a runway can be in: every level but "notConfigured". */
export type RiskBandLevel = Exclude<RiskLevel, "notConfigured">;

/** The four bands, lowest first (public metric page, Flight Crew's table). */
export const RISK_BAND_LEVELS: readonly RiskBandLevel[] = ["critical", "warning", "healthy", "strong"];

/**
 * The month count at which each band above critical starts.
 *
 * The Runway Score's Survival sub-score is laid out on these floors
 * (runway-score-engine.ts, SURVIVAL_SCORE_STEPS), so moving one changes
 * users' scores: bump SCORE_VERSION with it.
 */
export const RISK_BAND_FLOOR_MONTHS = { warning: 2, healthy: 4, strong: 6 } as const;

export function riskLevelFromMonths(months: number): RiskLevel {
  if (months < RISK_BAND_FLOOR_MONTHS.warning) return "critical";
  if (months < RISK_BAND_FLOOR_MONTHS.healthy) return "warning";
  if (months < RISK_BAND_FLOOR_MONTHS.strong) return "healthy";
  return "strong";
}

// ── Band wording ──────────────────────────────────────────────────────────────
// What a surface prints about a band is built from the edges above, so copy
// cannot name a band the classification does not use. Each band runs from its
// floor up to, not including, the next one.

/** The word printed for a level (Reports badge, business report PDF). */
export const RISK_LEVEL_LABEL: Record<RiskLevel, string> = {
  critical: "Critical",
  warning: "Warning",
  healthy: "Healthy",
  strong: "Strong",
  notConfigured: "Not Set",
};

const { warning: WARNING_FROM, healthy: HEALTHY_FROM, strong: STRONG_FROM } = RISK_BAND_FLOOR_MONTHS;

/** Each level's range, for a sentence about one runway. */
export const RISK_BAND_RANGE: Record<RiskBandLevel, string> = {
  critical: `under ${WARNING_FROM} months`,
  warning: `${WARNING_FROM}–${HEALTHY_FROM} months`,
  healthy: `${HEALTHY_FROM}–${STRONG_FROM} months`,
  strong: `${STRONG_FROM}+ months`,
};

/** The four bands in one sentence (Guide PDF, business report PDF). */
export const RISK_BAND_LADDER =
  `Under ${WARNING_FROM} months is critical, ${WARNING_FROM}–${HEALTHY_FROM} is warning, ` +
  `${HEALTHY_FROM}–${STRONG_FROM} is healthy, ${STRONG_FROM}+ is strong.`;

/** Where one runway sits: "in the Warning range (2–4 months)". */
export function riskBandPhrase(level: RiskBandLevel): string {
  return `in the ${RISK_LEVEL_LABEL[level]} range (${RISK_BAND_RANGE[level]})`;
}

/** The band above a level and the month count it starts at. Null at the top band and when nothing is set. */
export function nextRiskBand(level: RiskLevel): { level: RiskBandLevel; fromMonths: number } | null {
  switch (level) {
    case "critical":
      return { level: "warning", fromMonths: WARNING_FROM };
    case "warning":
      return { level: "healthy", fromMonths: HEALTHY_FROM };
    case "healthy":
      return { level: "strong", fromMonths: STRONG_FROM };
    case "strong":
    case "notConfigured":
      return null;
  }
}

// ── Flagged runways ───────────────────────────────────────────────────────────
// The bands a surface draws attention to (dashboard alert, advisor card,
// Scenarios note, Flight Crew): those under Healthy. One rule, so a runway is
// never alerted on one screen as something its badge on another does not say.

export type FlaggedRiskLevel = "critical" | "warning";

export function isFlaggedRiskLevel(level: RiskLevel): level is FlaggedRiskLevel {
  return level === "critical" || level === "warning";
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

// ── What the figure is made of ───────────────────────────────────────────────
// The months are cash ÷ (burn − pipeline income). A sentence that names only
// the cash and the burn describes a different division whenever there is
// pipeline, so these name the income when there is some.

/** What the month count divides the cash by: burn less pipeline income, never below zero. */
export function netMonthlyBurn(result: SurvivalResult): number {
  return Math.max(0, result.monthlyBurn - result.monthlyIncome);
}

/** What a runway figure is worked out from, in one sentence (Reports card, business report PDF). */
export function runwayBasisSentence(result: SurvivalResult): string {
  const base =
    `Based on your cash reserve of ${fmtCurrency(result.cashReserve)} ` +
    `and a monthly burn rate of ${fmtCurrency(result.monthlyBurn)}`;
  if (result.riskLevel === "notConfigured" || result.monthlyIncome <= 0) return `${base}.`;
  return `${base}, less an estimated ${fmtCurrency(result.monthlyIncome)} a month of pipeline income.`;
}

/**
 * What the band above takes at this burn: "The Healthy range starts at 4
 * months: $10,000 of cash at your burn of $2,500 a month." Null at the top
 * band, when nothing is set, and when pipeline income covers the burn.
 */
export function nextRiskBandSentence(result: SurvivalResult): string | null {
  const next = nextRiskBand(result.riskLevel);
  const burn = netMonthlyBurn(result);
  if (!next || burn <= 0) return null;
  const burnWord = result.monthlyIncome > 0 ? "net burn" : "burn";
  return (
    `The ${RISK_LEVEL_LABEL[next.level]} range starts at ${next.fromMonths} months: ` +
    `${fmtCurrency(next.fromMonths * burn)} of cash at your ${burnWord} of ${fmtCurrency(burn)} a month.`
  );
}

/** A flagged runway, worded for an alert: the band it is in, then the four bands. */
export interface RunwayFlag {
  level: FlaggedRiskLevel;
  title: string;
  body: string;
}

export function runwayFlag(result: SurvivalResult): RunwayFlag | null {
  const level = result.riskLevel;
  if (!isFlaggedRiskLevel(level)) return null;
  const covered = result.months < 1 ? "less than 1 month" : result.label;
  const afterPipeline = result.monthlyIncome > 0 ? ", after the income estimated from your pipeline" : "";
  return {
    level,
    title: `Cash runway is ${riskBandPhrase(level)}`,
    body: `Your cash covers ${covered} of monthly costs${afterPipeline}. ${RISK_BAND_LADDER}`,
  };
}
