// ============================================================================
// Agent Runway — Time Value Engine
// Computes effective hourly rate and related time-value metrics
// for real estate agents based on self-reported weekly hours.
// ============================================================================

export interface TimeValueInput {
  /** Self-reported average weekly working hours */
  estimatedWeeklyHours: number;
  /** Weeks of vacation/time-off per year (default 0) */
  vacationWeeks: number;
  /** YTD gross commission income */
  ytdGCI: number;
  /** YTD net income (after splits, fees, tax) */
  ytdNetIncome: number;
  /** Projected annual net income */
  projectedAnnualNet: number;
  /** Projected annual GCI */
  projectedAnnualGCI: number;
  /** YTD closed deal count */
  dealCount: number;
  /** Total annual expenses (business) */
  annualExpenses: number;
  /** Fraction of year elapsed (0–1) */
  yearFractionElapsed: number;
}

export interface TimeValueResult {
  /** Effective hourly rate based on projected annual net / annual hours */
  effectiveHourlyRate: number;
  /** Gross hourly rate based on projected annual GCI / annual hours */
  grossHourlyRate: number;
  /** Estimated annual working hours (accounts for vacation) */
  annualHours: number;
  /** Working weeks per year (52 minus vacation) */
  workingWeeks: number;
  /** Average revenue (GCI) per deal */
  revenuePerDeal: number;
  /** Estimated hours per deal (annual hours / deal count, annualized) */
  hoursPerDeal: number;
  /** Net income per deal */
  netPerDeal: number;
  /** Net income per deal-hour (what each hour on a deal earns) */
  netPerDealHour: number;
  /** Number of deals needed just to cover annual expenses */
  breakEvenDealCount: number;
  /** Cost per hour of working (expenses / annual hours) */
  costPerHour: number;
}

/**
 * Computes time-value metrics from self-reported weekly hours and financial data.
 *
 * All outputs are annualized projections based on current pace.
 * Returns null-safe defaults when deal count is 0.
 */
export function computeTimeValue(input: TimeValueInput): TimeValueResult {
  const {
    estimatedWeeklyHours,
    vacationWeeks,
    ytdGCI,
    ytdNetIncome,
    projectedAnnualNet,
    projectedAnnualGCI,
    dealCount,
    annualExpenses,
    yearFractionElapsed,
  } = input;

  // Annual hours: weekly hours × (52 weeks minus vacation)
  const workingWeeks = Math.max(0, 52 - (vacationWeeks || 0));
  const annualHours = estimatedWeeklyHours * workingWeeks;

  // Effective hourly rates
  const effectiveHourlyRate = annualHours > 0 ? projectedAnnualNet / annualHours : 0;
  const grossHourlyRate = annualHours > 0 ? projectedAnnualGCI / annualHours : 0;

  // Per-deal metrics
  // Early-year confidence ramp mirrors projectedYearEndTransactions
  // (projection-engine.ts): below 10% elapsed, blend the raw annualization
  // toward the actual deal count. Without this, 1 deal on Jan 5 implies
  // ~77 deals/year and inflates revenuePerDeal / breakEvenDealCount.
  const rawAnnualized = yearFractionElapsed > 0 ? dealCount / yearFractionElapsed : dealCount;
  const annualizedDealCount =
    yearFractionElapsed > 0 && yearFractionElapsed < 0.10
      ? dealCount * (1 - yearFractionElapsed / 0.10) + rawAnnualized * (yearFractionElapsed / 0.10)
      : rawAnnualized;
  const revenuePerDeal = annualizedDealCount > 0 ? projectedAnnualGCI / annualizedDealCount : 0;
  const hoursPerDeal = annualizedDealCount > 0 ? annualHours / annualizedDealCount : 0;
  const netPerDeal = annualizedDealCount > 0 ? projectedAnnualNet / annualizedDealCount : 0;
  const netPerDealHour = hoursPerDeal > 0 ? netPerDeal / hoursPerDeal : 0;

  // Break-even: how many deals at current avg GCI to cover expenses
  const breakEvenDealCount = revenuePerDeal > 0 ? Math.ceil(annualExpenses / revenuePerDeal) : 0;

  // Cost of operating per hour
  const costPerHour = annualHours > 0 ? annualExpenses / annualHours : 0;

  return {
    effectiveHourlyRate: Math.round(effectiveHourlyRate * 100) / 100,
    grossHourlyRate: Math.round(grossHourlyRate * 100) / 100,
    annualHours,
    workingWeeks,
    revenuePerDeal: Math.round(revenuePerDeal),
    hoursPerDeal: Math.round(hoursPerDeal * 10) / 10,
    netPerDeal: Math.round(netPerDeal),
    netPerDealHour: Math.round(netPerDealHour * 100) / 100,
    breakEvenDealCount,
    costPerHour: Math.round(costPerHour * 100) / 100,
  };
}
