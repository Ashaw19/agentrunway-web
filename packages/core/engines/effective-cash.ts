// EffectiveCashEngine — shared orchestration helper for Survival cash input.
//
// WHY THIS EXISTS
// ---------------
// Every surface that renders the Survival metric or the Runway Score MUST pass
// `cashPosition.effectiveCash` into `survivalResult(...)` — NEVER the raw
// `settings.cash_reserve` field. That divergence is what caused the Runway
// Score 53/61 incident on 2026-04-17 (chat route passed raw reserve, dashboard
// passed effective cash → same agent, same moment, different scores, and
// Captain gave alarmist advice off a wrong number).
//
// Dashboard (apps/web/app/(app)/dashboard/dashboard-content.tsx) and the chat
// route (apps/web/app/api/chat/route.ts) both open-code the full chain:
//   agentGross → tx fees → brokerage fees → ytdAgentNet
//   tax projection → ytdTaxSetAside (annual burden * min(fraction, 1))
//   HST collected on commissions + HST ITCs on expenses
//   → computeCashPosition(...) → effectiveCash
//
// Every other surface that calls `survivalResult(...)` has to mirror that
// chain exactly. This helper centralizes it so new surfaces can't drift.
//
// SEE ALSO
// --------
// - memory/feedback_data_consistency_protocol.md
// - dashboard-content.tsx ~lines 615-642 (canonical reference)
// - api/chat/route.ts ~lines 481-517 (second canonical reference)

import {
  computeCashPosition,
  type CashPositionResult,
} from "./cash-position-engine";
import { calculate as calculateCanadianTax, gstHstRate } from "./canadian-tax-engine";
import { calculateCorporateTax } from "./corporate-tax-engine";
import { computeHSTCollected } from "./hst-engine";
import {
  computePlanGross,
  type CompSettingsSlice,
  type RealDealInput,
} from "./real-compensation-engine";
import type { UserSettings } from "../types/database";

/** Every field the plan-aware split/fee chain reads (legacy + REAL). */
type PlanSettingsKeys = keyof CompSettingsSlice;

export interface EffectiveCashInputs {
  /** UserSettings row (full). Required — we read split_preset, cash_reserve, HST flags, etc. */
  settings: Pick<
    UserSettings,
    | PlanSettingsKeys
    | "province"
    | "monthly_brokerage_fee"
    | "cash_reserve"
    | "gst_hst_registered"
    | "gst_hst_paid_on_expenses"
    | "brokerage_withholds_hst"
    | "is_incorporated"
    | "compensation_method"
  >;
  /** YTD gross commission income (before split) — sum of closed transactions this year. */
  ytdGCI: number;
  /**
   * Closed transactions ({date, gci}) for the current calendar year.
   * OPTIONAL for `simple_split` (aggregate math is exact); STRONGLY
   * recommended under `comp_plan = 'real'` — with them the engine runs the
   * exact per-deal waterfall; without them it falls back to the analytic
   * simulation on `ytdGCI` (documented approximation).
   */
  transactions?: RealDealInput[];
  /** YTD business expenses (receipts + recurring). */
  expensesYTD: number;
  /** Monthly recurring expenses (used to project remaining-year expenses for tax). */
  monthlyRecurring: number;
  /** Projected year-end GCI (from projection-engine). */
  projectedGCI: number;
  /** Projected year-end deal count (from projection-engine). Used for per-deal set-aside. */
  projectedDealCount: number;
  /** Seasonal fraction of year elapsed (from projection-engine.seasonalFractionElapsed). */
  fraction: number;
  /** Reference date (defaults to now). Used for months-elapsed & remaining calculations. */
  now?: Date;
}

export interface EffectiveCashResult {
  /** The CashPositionResult to read .effectiveCash from (pass into survivalResult). */
  cashPosition: CashPositionResult;
  /** Net-for-tax used to project the annual burden (exposed for callers that display it). */
  netForTax: number;
  /** Projected annual tax burden (personal or corporate, matches dashboard). */
  annualTaxBurden: number;
}

/**
 * Project full-year agent net (gross after split, tx fees, and brokerage fees).
 * Mirrors dashboard-content.tsx:computeProjectedNet exactly.
 *
 * Accepts the narrow slice so both `computeEffectiveCashForSurvival` (which
 * has the full EffectiveCashInputs["settings"] type, a strict superset) and
 * `computeProjectedNetForTax` (which only needs the split/fee/brokerage
 * fields) can call it.
 */
function projectedAgentNet(
  projectedGCI: number,
  settings: Pick<UserSettings, PlanSettingsKeys | "monthly_brokerage_fee">,
  projectedDealCount?: number,
  now: Date = new Date(),
): number {
  // Plan-aware: simple_split path is byte-identical to the legacy
  // computeAgentGross − computeTxFees chain; 'real' runs the analytic
  // REAL waterfall (projections have no deal list).
  const { grossAfterPlan } = computePlanGross(settings, projectedGCI, {
    dealCount: projectedDealCount,
    asOf: now.toISOString().slice(0, 10),
  });
  const brokerageFeeAnnual = settings.monthly_brokerage_fee * 12;
  return grossAfterPlan - brokerageFeeAnnual;
}

// ── Shared helpers exported for use across surfaces ─────────────────────────
//
// WHY THESE EXIST (Audit 1, 2026-04-22, D-1 + D-2 fix)
// -----------------------------------------------------
// Two metrics were being open-coded on 6+ surfaces with formulas that diverged
// from the dashboard:
//   - `pipelineMonthlyEst` (D-1): dashboard uses weighted GCI / remainingMonths.
//     Six other surfaces used `(pipelineWeighted * 0.5) / 12`. Materially
//     different mid-year (late-year especially — divisor of 12 vs 3).
//   - `netForTax` (D-2): dashboard uses `computeProjectedNet - annualExpenses`.
//     Chat, chat-diagnostics, and MCP used `projGCI * agentPct - annualizedExpenses`
//     (ignored tx fees + brokerage monthly, double-applied season scaling).
//
// Every surface that wants either number MUST call these helpers instead of
// re-deriving. See memory/feedback_data_consistency_protocol.md.

/**
 * D-1 canonical: monthly pipeline income estimate used as `monthlyIncome` input
 * to `survivalResult(...)`.
 *
 * Mirrors dashboard-content.tsx:593-594 exactly. The denominator is
 * `max(1, 12 - floor(fraction * 12))` — months of year still ahead — so that
 * late-year the weighted pipeline gets divided across the few remaining months
 * instead of the full 12.
 *
 * @param pipelineWeightedGCI Σ(computeWeightedGCI(deal)) across the active pipeline.
 * @param fraction Seasonal fraction of year elapsed (0..1).
 * @returns Monthly expected income from the pipeline; 0 if fraction is non-positive.
 */
export function computePipelineMonthlyIncome(
  pipelineWeightedGCI: number,
  fraction: number,
): number {
  if (fraction <= 0) return 0;
  const remainingMonths = Math.max(1, 12 - Math.floor(fraction * 12));
  return pipelineWeightedGCI / remainingMonths;
}

/**
 * Inputs for {@link computeProjectedNetForTax}. Match the fields the dashboard
 * reads at dashboard-content.tsx:596-603.
 */
export interface ProjectedNetForTaxInputs {
  /** Projected year-end GCI (from projection-engine). */
  projectedGCI: number;
  /** YTD business expenses (receipts + recurring). */
  expensesYTD: number;
  /** Monthly recurring expenses (used to project remainder of year). */
  monthlyRecurring: number;
  /** UserSettings slice needed to compute agent net (plan, split, fees, brokerage). */
  settings: Pick<UserSettings, PlanSettingsKeys | "monthly_brokerage_fee">;
  /** Projected year-end deal count — drives per-deal fee modeling under
   *  `comp_plan = 'real'`. Optional; the engine estimates when absent. */
  projectedDealCount?: number;
  /** Reference date (defaults to now). Used to count remaining months. */
  now?: Date;
}

/**
 * D-2 canonical: projected full-year net-for-tax used as the taxable income
 * input to `calculateTax(...)` / `calculateCorporateTax(...)`.
 *
 * Mirrors dashboard-content.tsx:596-603 exactly:
 *   projectedNet  = agentGross(projectedGCI) − txFees(projectedGCI) − monthly_brokerage_fee × 12
 *   annualExpenses = expensesYTD + monthlyRecurring × (12 − (now.getMonth()+1))
 *   netForTax      = max(0, projectedNet − annualExpenses)
 *
 * The floor-at-zero is deliberate: a negative net-for-tax is not a tax refund
 * in this context — it's an input to the tax engine that expects non-negative
 * taxable income.
 *
 * @returns Projected net self-employment / corporate-income number ready to
 *          feed the tax engine.
 */
export function computeProjectedNetForTax(
  inputs: ProjectedNetForTaxInputs,
): number {
  const { projectedGCI, expensesYTD, monthlyRecurring, settings, projectedDealCount, now = new Date() } = inputs;
  const expRemainingMonths = Math.max(0, 12 - (now.getMonth() + 1));
  const annualExpenses = expensesYTD + monthlyRecurring * expRemainingMonths;
  const projectedNet = projectedAgentNet(projectedGCI, settings, projectedDealCount, now);
  return Math.max(0, projectedNet - annualExpenses);
}

/**
 * Compute the CashPositionResult to feed into survivalResult(...).
 *
 * Read the result's `.effectiveCash` and pass it as the 3rd arg of survivalResult.
 * This is the ONE function every surface should call.
 *
 * Mirrors the dashboard chain at apps/web/app/(app)/dashboard/dashboard-content.tsx
 * lines 595-642. If the dashboard formula changes, change it here and all
 * surfaces follow automatically.
 */
export function computeEffectiveCashForSurvival(
  inputs: EffectiveCashInputs,
): EffectiveCashResult {
  const {
    settings,
    ytdGCI,
    expensesYTD,
    monthlyRecurring,
    projectedGCI,
    projectedDealCount,
    fraction,
    now = new Date(),
  } = inputs;

  // ── Project annual expenses (actual YTD + remaining months of recurring) ──
  const expRemainingMonths = Math.max(0, 12 - (now.getMonth() + 1));
  const annualExpenses = expensesYTD + monthlyRecurring * expRemainingMonths;

  // ── Project net income for tax calc ─────────────────────────────────────
  const projectedNet = projectedAgentNet(projectedGCI, settings, projectedDealCount, now);
  const netForTax = Math.max(0, projectedNet - annualExpenses);

  // ── Annual tax burden (personal or corporate) ───────────────────────────
  let annualTaxBurden = 0;
  if (settings.is_incorporated) {
    const corpResult = calculateCorporateTax({
      corporateIncome: netForTax,
      province: settings.province,
      compensationMethod:
        (settings.compensation_method as "salary" | "dividends" | "mixed") ?? "salary",
      dealCount: Math.max(projectedDealCount, 1),
    });
    annualTaxBurden = corpResult.totalCombinedTax;
  } else {
    const taxResult = calculateCanadianTax(
      netForTax,
      settings.province,
      Math.max(projectedDealCount, 1),
    );
    annualTaxBurden = taxResult.totalBurden;
  }

  // ── YTD agent net (used as the "take-home before tax" starting point) ───
  // Plan-aware: under 'real' with transactions provided this is the EXACT
  // per-deal waterfall over the calendar YTD window; simple_split is the
  // byte-identical legacy chain (agentGross − txFees).
  const asOf = now.toISOString().slice(0, 10);
  const yearStart = `${now.getFullYear()}-01-01`;
  const yearEnd = `${now.getFullYear() + 1}-01-01`;
  const { grossAfterPlan: ytdGrossAfterPlan } = computePlanGross(settings, ytdGCI, {
    deals: inputs.transactions,
    windowStart: yearStart,
    windowEnd: yearEnd,
    asOf,
  });
  const ytdBrokerageFees = settings.monthly_brokerage_fee * (now.getMonth() + 1);
  const ytdAgentNet = Math.max(0, ytdGrossAfterPlan - ytdBrokerageFees);

  // ── HST collected / ITCs on expenses ────────────────────────────────────
  // D-4 fix (Audit 1 2026-04-22): canonical HST helper. Returns 0 if not
  // registered OR brokerage withholds. See hst-engine.ts.
  const hstRateValue = gstHstRate(settings.province);
  const ytdHstCollected = computeHSTCollected({
    ytdGCI,
    hstRate: hstRateValue,
    isRegistered: settings.gst_hst_registered ?? false,
    brokerageWithholdsHst: settings.brokerage_withholds_hst ?? false,
  });
  // NOTE: dashboard treats `gst_hst_paid_on_expenses` as truthy (a 0 dollar
  // field disables the ITC adjustment). Preserve that behavior exactly.
  const ytdHstOnExpenses = settings.gst_hst_paid_on_expenses
    ? expensesYTD * (hstRateValue / (1 + hstRateValue))
    : 0;

  // ── Cash Position ──────────────────────────────────────────────────────
  const cashPosition = computeCashPosition({
    ytdGCI,
    ytdAgentNet,
    ytdExpenses: expensesYTD,
    ytdTaxSetAside: annualTaxBurden * Math.min(fraction, 1),
    ytdHstCollected,
    ytdHstOnExpenses,
    brokerageWithholdsHst: settings.brokerage_withholds_hst ?? false,
    manualCashReserve: settings.cash_reserve ?? 0,
    fractionElapsed: fraction,
  });

  return {
    cashPosition,
    netForTax,
    annualTaxBurden,
  };
}
