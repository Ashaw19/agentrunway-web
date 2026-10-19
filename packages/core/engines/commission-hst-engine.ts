// CommissionHst — the GST/HST an agent collected on each commission, and the
// period of the GST/HST return it belongs to.
//
// ESTIMATE ONLY — Not legal or tax advice.
//
// WHY THIS EXISTS
// ---------------
// Until 2026-10-19 every surface took the HST collected on a commission as
// the province's rate × the full commission (GCI), and the GST/HST return
// card put each deal in the period of its closing date. A real brokerage
// statement (Royal LePage, plan 75/25, NB) works differently: on a $7,000
// commission the brokerage paid the agent $777 of HST, which is 15% of
// $5,180, the agent's share after the brokerage split ($1,750) and the
// franchise fee ($70). Another brokerage pays HST on the full commission and
// invoices its split back with HST. Agent Runway can't tell which from the
// plan settings (a pre-REAL deal's franchise fee isn't even in them), so it
// takes the figure from the statement:
//
//   HST collected on a deal
//     = transactions.commission_hst, the GST/HST the brokerage's commission
//       statement shows was paid to the agent, when entered
//     = the rate × the full commission otherwise (the estimate every account
//       had before; nothing changes until a statement figure is entered)
//   line 101 on a deal with the statement's HST = that HST ÷ the rate (the
//       commission it was charged on: $777 ÷ 15% = $5,180).
//
// TIMING (user_settings.gst_hst_commission_timing). CRA: GST/HST is payable
// on the earlier of the day the consideration is paid and the day it becomes
// due (GST/HST Memorandum 300-6, ETA s.168 and s.152). When a commission
// becomes due depends on the agent's agreement with the brokerage, which
// Agent Runway doesn't know. The agent chooses where the return card places
// a commission: by its closing date (the default, the placement every
// account had) or by the date it was paid (transactions.commission_paid_date,
// falling back to the closing date when blank). The copy for it is in
// tax-copy/cra-rules.ts (GST_HST_COMMISSION_TIMING_RULE).

import { computeGCI, type Transaction } from "../types/database";

/** `user_settings.gst_hst_commission_timing` (migration 00187). */
export type GstHstCommissionTiming = "closing" | "paid";

export const GST_HST_COMMISSION_TIMINGS: readonly GstHstCommissionTiming[] = ["closing", "paid"];

/**
 * The agent's choice. Closing date unless the setting says exactly "paid": a
 * missing row, a select without the column or an unknown value keeps the
 * placement every account had before.
 */
export function gstHstCommissionTiming(
  settings: { gst_hst_commission_timing?: string | null } | null | undefined,
): GstHstCommissionTiming {
  return settings?.gst_hst_commission_timing === "paid" ? "paid" : "closing";
}

/** The fields this file reads from a `transactions` row. */
export type CommissionHstDeal = Pick<
  Transaction,
  "date" | "sale_price" | "commission_pct" | "team_split_pct" | "gci_override"
> & {
  /** `transactions.commission_paid_date`. Optional so a select without it reads as blank. */
  commission_paid_date?: string | null;
  /** `transactions.commission_hst` (numeric: may arrive as a string). Blank = not entered. */
  commission_hst?: number | string | null;
};

/** The statement's HST on a deal, or null when it isn't entered (or isn't a number). */
export function recordedCommissionHst(deal: { commission_hst?: number | string | null }): number | null {
  const raw = deal.commission_hst;
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** The date that places a deal on a GST/HST return (YYYY-MM-DD). */
export function gstHstCommissionDate(
  deal: Pick<CommissionHstDeal, "date" | "commission_paid_date">,
  timing: GstHstCommissionTiming,
): string {
  if (timing === "paid" && deal.commission_paid_date) return deal.commission_paid_date.slice(0, 10);
  return (deal.date ?? "").slice(0, 10);
}

/** The deals a return for [startDate, endDate] (inclusive, YYYY-MM-DD) covers. */
export function commissionsInGstHstPeriod<T extends Pick<CommissionHstDeal, "date" | "commission_paid_date">>(
  deals: readonly T[],
  startDate: string,
  endDate: string,
  timing: GstHstCommissionTiming,
): T[] {
  return deals.filter((d) => {
    const day = gstHstCommissionDate(d, timing);
    return day >= startDate && day <= endDate;
  });
}

/** One commission, reduced to what the GST/HST figures need. */
export interface CommissionHstInput {
  /** The full commission (computeGCI). */
  gci: number;
  /** The statement's HST, or null/undefined when not entered. */
  recordedHst?: number | null;
}

/** A deal as a {@link CommissionHstInput}. */
export function commissionHstInput(deal: CommissionHstDeal): CommissionHstInput {
  return { gci: computeGCI(deal), recordedHst: recordedCommissionHst(deal) };
}

export interface CommissionHstLine {
  /** What line 101 counts: the commission the HST was charged on. */
  base: number;
  /** What line 103 counts. */
  hst: number;
  /** True when `hst` is the statement's figure, false for the estimate. */
  recorded: boolean;
}

/**
 * One commission's line 101 and line 103 amounts. With the statement's HST:
 * that HST, on the commission it implies (HST ÷ rate). Without it: the rate
 * × the full commission.
 */
export function commissionHst(input: CommissionHstInput, hstRate: number): CommissionHstLine {
  const gci = Number.isFinite(input.gci) ? input.gci : 0;
  const rate = Number.isFinite(hstRate) && hstRate > 0 ? hstRate : 0;
  const recorded = input.recordedHst;
  if (recorded != null && Number.isFinite(recorded) && recorded >= 0) {
    return { base: rate > 0 ? recorded / rate : gci, hst: recorded, recorded: true };
  }
  return { base: gci, hst: gci * rate, recorded: false };
}

export interface CommissionHstTotals {
  /** Line 101: commissions before HST. */
  base: number;
  /** Line 103: HST collected or collectible. */
  hst: number;
  /** Deals whose HST came from the statement, and that HST. */
  recordedCount: number;
  recordedHst: number;
  /** Deals estimated at the rate × the full commission, and that estimate. */
  estimatedCount: number;
  estimatedHst: number;
}

/** {@link commissionHst} summed over deals. */
export function commissionHstTotals(inputs: readonly CommissionHstInput[], hstRate: number): CommissionHstTotals {
  const totals: CommissionHstTotals = {
    base: 0, hst: 0, recordedCount: 0, recordedHst: 0, estimatedCount: 0, estimatedHst: 0,
  };
  for (const input of inputs) {
    const line = commissionHst(input, hstRate);
    totals.base += line.base;
    totals.hst += line.hst;
    if (line.recorded) {
      totals.recordedCount += 1;
      totals.recordedHst += line.hst;
    } else {
      totals.estimatedCount += 1;
      totals.estimatedHst += line.hst;
    }
  }
  return totals;
}

/**
 * The deals among `inputs` whose HST was entered from the statement, as the
 * `recorded` input of computeHSTCollected: their full commission (the part
 * of YTD GCI not to estimate) and the HST the statements show.
 */
export function recordedCommissionHstShare(
  inputs: readonly CommissionHstInput[],
): { gci: number; hst: number } {
  let gci = 0;
  let hst = 0;
  for (const input of inputs) {
    const recorded = input.recordedHst;
    if (recorded == null || !Number.isFinite(recorded) || recorded < 0) continue;
    gci += Number.isFinite(input.gci) ? input.gci : 0;
    hst += recorded;
  }
  return { gci, hst };
}

/**
 * {@link recordedCommissionHstShare} straight from `transactions` rows: the
 * `recorded` input of computeHSTCollected for the rows a YTD GCI sums. A row
 * selected without `commission_hst` counts as not entered (estimated).
 */
export function statementHstShare(rows: readonly CommissionHstDeal[]): { gci: number; hst: number } {
  return recordedCommissionHstShare(rows.map(commissionHstInput));
}
