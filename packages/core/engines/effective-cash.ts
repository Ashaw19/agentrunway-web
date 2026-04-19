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
import { computeAgentGross, computeTxFees } from "../types/database";
import type { UserSettings } from "../types/database";

export interface EffectiveCashInputs {
  /** UserSettings row (full). Required — we read split_preset, cash_reserve, HST flags, etc. */
  settings: Pick<
    UserSettings,
    | "province"
    | "split_preset"
    | "post_cap_threshold_gci"
    | "post_cap_agent_pct"
    | "post_cap_brokerage_pct"
    | "tx_fee_rate_pct"
    | "tx_fee_annual_cap"
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
 */
function projectedAgentNet(
  projectedGCI: number,
  settings: EffectiveCashInputs["settings"],
): number {
  const { agentGross } = computeAgentGross(
    projectedGCI,
    settings.split_preset,
    settings.post_cap_threshold_gci,
    settings.post_cap_agent_pct,
    settings.post_cap_brokerage_pct,
  );
  const txFees = computeTxFees(
    projectedGCI,
    settings.tx_fee_rate_pct,
    settings.tx_fee_annual_cap,
  );
  const brokerageFeeAnnual = settings.monthly_brokerage_fee * 12;
  return agentGross - txFees - brokerageFeeAnnual;
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
  const projectedNet = projectedAgentNet(projectedGCI, settings);
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
  const { agentGross: ytdAgentGross } = computeAgentGross(
    ytdGCI,
    settings.split_preset,
    settings.post_cap_threshold_gci,
    settings.post_cap_agent_pct,
    settings.post_cap_brokerage_pct,
  );
  const ytdTxFees = computeTxFees(
    ytdGCI,
    settings.tx_fee_rate_pct,
    settings.tx_fee_annual_cap,
  );
  const ytdBrokerageFees = settings.monthly_brokerage_fee * (now.getMonth() + 1);
  const ytdAgentNet = Math.max(0, ytdAgentGross - ytdTxFees - ytdBrokerageFees);

  // ── HST collected / ITCs on expenses ────────────────────────────────────
  const hstRateValue = gstHstRate(settings.province);
  const ytdHstCollected = settings.gst_hst_registered ? ytdGCI * hstRateValue : 0;
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
