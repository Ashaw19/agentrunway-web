/**
 * GST34 Pre-Fill Engine
 *
 * Computes all GST34 (GST/HST Return for Registrants) line values
 * for a given filing period based on the agent's transactions and receipts.
 *
 * CRA GST34 line reference, as CRA's own instructions define them
 * (canada.ca "Instructions for preparing a GST/HST return", checked
 * 2026-10-13):
 *   101  — Sales and other revenue (before GST/HST)
 *   103  — GST/HST collected or collectible
 *   104  — Adjustments to be ADDED to the net tax (e.g. GST/HST recovered on
 *          a bad debt; the yearly 50% add-back if meals were claimed in full)
 *   105  — Total GST/HST and adjustments (103 + 104)
 *   106  — ELIGIBLE input tax credits for the period. The 50% meal limit and
 *          the personal-use share of vehicle costs and home bills are applied
 *          BEFORE this line: it is what can be claimed, not what was paid.
 *   107  — Adjustments to be DEDUCTED when determining the net tax (e.g.
 *          GST/HST in a bad debt written off). It is ADDED to line 106.
 *   108  — Total ITCs and adjustments (106 + 107)
 *   109  — Net tax (105 − 108). Negative = refund position.
 *   110  — Instalments and other annual filer payments
 *   111  — Rebates
 *   112  — Total other credits (110 + 111)                    [paper only]
 *   113A — Balance (109 − 112)                                [paper only]
 *   205  — GST/HST due on purchases of real property or emission allowances
 *   405  — Other GST/HST to be self-assessed
 *   113B — Total other debits (205 + 405)                     [paper only]
 *   113C — Balance (113A + 113B)                              [paper only]
 *   114  — Refund claimed (113C negative)
 *   115  — Amount owing (113C positive)
 *
 * Filed electronically, lines 105, 108, 109 and 114 are calculated by CRA
 * from what is entered on the others; 112 and 113A–C don't appear at all.
 *
 * Until 2026-10-13 this engine reported the GST/HST PAID as line 106 and the
 * part that can't be claimed as a NEGATIVE line 107. The net (108) was right,
 * but the two lines were not CRA's: line 107 is added to line 106 on the
 * return, so someone copying "106: $466, 107: $90" into CRA's form would have
 * claimed $556 instead of $376. Line 106 is now the eligible amount, line 107
 * is 0 (not tracked), and what was paid and what isn't claimable are reported
 * beside the lines, not as lines.
 *
 * Sources:
 *   - CRA, Instructions for preparing a GST/HST return:
 *     canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/complete-file-instructions.html
 *   - CRA GST34 form: canada.ca/en/revenue-agency/services/forms-publications/forms/gst34.html
 *   - RC4022 General Information for GST/HST Registrants
 *   - GST/HST Memoranda Series 8.1 (ITCs)
 */

import { gstHstRate, gstHstLabel } from "./canadian-tax-engine";
import { isFullVehicleDeductionKey, isHomeOfficeKey, t2125LineForExpenseKey } from "./t2125-engine";
import type { FilingPeriod, FilingFrequency } from "../types/database";

// ── Types ──────────────────────────────────────────────────────────────────

export interface GST34Input {
  /** Agent's province for HST rate lookup */
  province: string;
  /** Selected filing period */
  period: FilingPeriod;
  /** Filing frequency */
  frequency: FilingFrequency;
  /** Closed transactions in this period — array of { gci: number } */
  periodTransactions: { gci: number }[];
  /** Receipts in this period — array of { total_amount, tax_amount, category_key } */
  periodReceipts: {
    total_amount: number | null;
    tax_amount: number | null;
    category_key: string | null;
    /** A recurring expense flagged vehicle_pct_applicable (its key may not say so). */
    vehicle_use?: boolean;
  }[];
  /** Amount already remitted for this specific period (user-entered) */
  instalmentsPaid: number;
  /**
   * Share of vehicle use that is business, 0–1: `ctx.vehicleBusinessUsePct`
   * from expenseTaxContext (the logbook's figure when it covers the year, the
   * declared setting otherwise). Required, so no caller can skip it.
   */
  vehicleBusinessUsePct: number;
  /**
   * Share of the home that is the business workspace, 0–1
   * (user_settings.home_office_business_use_pct). Applies to GST/HST on bills
   * in the Home Office expense category. Omitted = 0: no ITC on a home bill,
   * so a caller that doesn't know the share never over-claims.
   */
  homeOfficeBusinessUsePct?: number;
}

/** How a line gets onto the return. */
export type GST34LineHow =
  /** You type it into CRA's return (electronic or paper). */
  | "enter"
  /** CRA's electronic return works it out from the lines you entered. */
  | "calculated"
  /** Paper return only; it does not appear when filing electronically. */
  | "paper";

export interface GST34FilingLine {
  /** CRA line number: "101", "113A", "405"... */
  line: string;
  /** CRA's wording for the line. */
  label: string;
  /** Dollars and cents, as it goes on the return. Never negative, except 109 and 113A/C. */
  amount: number;
  how: GST34LineHow;
  /**
   * false = Agent Runway has no data for this line. The amount shown is 0 and
   * only the agent knows whether something belongs there.
   */
  tracked: boolean;
  /** Where the figure comes from, in plain words. */
  note: string;
}

export interface GST34Result {
  /**
   * Every line of the return in CRA's order, with amounts rounded to the cent
   * and totals built from the rounded entries, so the worksheet adds up the
   * way CRA's form will.
   */
  filingLines: GST34FilingLine[];
  line101: number; // Sales and other revenue
  line103: number; // GST/HST collected or collectible
  line104: number; // Adjustments added to net tax (not tracked: 0)
  line105: number; // 103 + 104
  /** GST/HST paid on the period's expenses, before any limit. NOT a return line. */
  hstPaidOnExpenses: number;
  /** The part of it that can't be claimed (the three reductions below). NOT a return line. */
  itcNotClaimable: number;
  mealItcReduction: number;
  vehicleItcReduction: number;
  homeItcReduction: number;
  /** Eligible ITCs: hstPaidOnExpenses − itcNotClaimable. This is CRA's line 106. */
  line106: number;
  line107: number; // Adjustments deducted from net tax (not tracked: 0)
  line108: number; // 106 + 107
  line109: number; // Net tax: 105 − 108
  line110: number; // Instalments paid
  line111: number; // Rebates (not tracked: 0)
  line112: number; // 110 + 111
  line113A: number; // 109 − 112
  line205: number; // Not tracked: 0
  line405: number; // Not tracked: 0
  line113B: number; // 205 + 405
  line113C: number; // 113A + 113B
  line114: number; // Refund claimed (0 if owing)
  line115: number; // Amount owing (0 if a refund)
  /** Balance: positive = owing, negative = refund. Same as line113C. */
  line113: number;
  /** Tax rate used */
  taxRate: number;
  /** Tax label (HST, GST, GST + QST) */
  taxLabel: string;
  /** Period this applies to */
  periodLabel: string;
  /** Filing deadline */
  deadline: string;
}

// ── ITC limits ─────────────────────────────────────────────────────────────
// Which expenses are meals or vehicle comes from the SAME map the T2125
// estimate uses (t2125LineForExpenseKey), so the two can't disagree.
//
// Until 2026-10-13 this file kept its own list of meal keys
// ("meals_entertainment", "client_meals", "meals", "entertainment"). No
// expense in the app has ever used those: the real keys are meals_client,
// meals_team, ent_client and ent_events. So the 50% reduction never applied
// and every meal's HST was claimed in full. Vehicle ITCs ignored the
// business-use share entirely. Both overstated the refund.
//
// A category-level key ("meals", "vehicle") resolves in
// t2125LineForExpenseKey too. This file had its own list of them until the
// T2125 started counting those keys: two lists is how the first bug happened.

/** Meals and entertainment: CRA allows 50% of the GST/HST paid as an ITC. */
export function isMealOrEntertainmentKey(key: string | null | undefined): boolean {
  if (!key) return false;
  return t2125LineForExpenseKey(key).deductiblePct === 0.5;
}

/** Vehicle running costs and lease payments: ITC follows the business-use share. */
export function isVehicleKey(key: string | null | undefined): boolean {
  if (!key) return false;
  return t2125LineForExpenseKey(key).applyVehicleUse;
}

/**
 * The share of a vehicle's GST/HST an individual can claim, by how much of
 * its use is business (CRA "ITC eligibility percentage" table, operating
 * expenses): 10% or less → none; 90% or more → all; otherwise that share.
 */
export function vehicleItcShare(businessUsePct: number): number {
  const p = Math.min(1, Math.max(0, Number.isFinite(businessUsePct) ? businessUsePct : 0));
  if (p <= 0.10) return 0;
  if (p >= 0.90) return 1;
  return p;
}

/**
 * The share of a home bill's GST/HST an individual can claim. Same CRA table
 * and the same bands as a vehicle's running costs: an operating expense used
 * 10% or less for the business gets no ITC, 90% or more gets all of it, and
 * in between it is the business-use share.
 */
export function homeOfficeItcShare(businessUsePct: number): number {
  return vehicleItcShare(businessUsePct);
}

export interface ItcSplit {
  /** GST/HST paid. */
  gross: number;
  /** Disallowed half on meals and entertainment. */
  mealReduction: number;
  /** Disallowed personal-use share on vehicle costs. */
  vehicleReduction: number;
  /** Disallowed personal-use share on home bills. */
  homeReduction: number;
  /** gross − reductions. */
  claimable: number;
}

/**
 * The claimable ITC on one expense's GST/HST. Used by the GST34 pre-fill and
 * by Flight Crew's HST forecast so both apply the same limits.
 */
export function itcForExpense(
  taxAmount: number,
  categoryKey: string | null | undefined,
  vehicleBusinessUsePct: number,
  vehicleUse = false,
  homeOfficeBusinessUsePct = 0,
): ItcSplit {
  const gross = Number(taxAmount) || 0;
  if (gross <= 0) return { gross: 0, mealReduction: 0, vehicleReduction: 0, homeReduction: 0, claimable: 0 };
  // A home bill is a household cost first. Only the workspace share of its
  // GST/HST is an ITC, and with no share given (default 0) none of it is.
  if (isHomeOfficeKey(categoryKey)) {
    const homeReduction = gross * (1 - homeOfficeItcShare(homeOfficeBusinessUsePct));
    return { gross, mealReduction: 0, vehicleReduction: 0, homeReduction, claimable: gross - homeReduction };
  }
  const mealReduction = isMealOrEntertainmentKey(categoryKey) ? gross * 0.5 : 0;
  // Business parking and supplementary business insurance: in full, box or
  // not (isFullVehicleDeductionKey, the T2125's rule).
  const vehicleReduction = (vehicleUse || isVehicleKey(categoryKey)) && !isFullVehicleDeductionKey(categoryKey)
    ? gross * (1 - vehicleItcShare(vehicleBusinessUsePct))
    : 0;
  return { gross, mealReduction, vehicleReduction, homeReduction: 0, claimable: gross - mealReduction - vehicleReduction };
}

// ── Engine ─────────────────────────────────────────────────────────────────

export function computeGST34(input: GST34Input): GST34Result {
  const {
    province,
    period,
    frequency,
    periodTransactions,
    periodReceipts,
    instalmentsPaid,
    vehicleBusinessUsePct,
    homeOfficeBusinessUsePct = 0,
  } = input;

  const rate = gstHstRate(province);
  const label = gstHstLabel(province);

  // ── Line 101: Total sales and other revenue ──────────────────────────
  // Sum of GCI from closed transactions in this period (before HST)
  const line101 = periodTransactions.reduce(
    (sum, tx) => sum + (tx.gci ?? 0),
    0,
  );

  // ── Line 103: GST/HST collected or collectible ──────────────────────
  // GCI × applicable tax rate
  const line103 = line101 * rate;

  // ── Line 104: Adjustments added to net tax (not tracked) ─────────────
  const line104 = 0;

  // ── Line 105: Total GST/HST and adjustments ─────────────────────────
  const line105 = line103 + line104;

  // ── Line 106: Input Tax Credits ──────────────────────────────────────
  // Sum all tax_amount from receipts, then take off what CRA doesn't allow:
  // half of meals and entertainment, and the personal-use share of vehicle
  // costs and of home bills (itcForExpense). What is left is line 106.
  let grossITCs = 0;
  let mealITCReduction = 0;
  let vehicleITCReduction = 0;
  let homeITCReduction = 0;

  for (const r of periodReceipts) {
    const itc = itcForExpense(
      Number(r.tax_amount) || 0, r.category_key, vehicleBusinessUsePct, r.vehicle_use, homeOfficeBusinessUsePct,
    );
    grossITCs += itc.gross;
    mealITCReduction += itc.mealReduction;
    vehicleITCReduction += itc.vehicleReduction;
    homeITCReduction += itc.homeReduction;
  }

  // What was paid, and the part of it that can't be claimed. Neither is a
  // line on the return.
  const hstPaidOnExpenses = grossITCs;
  const itcNotClaimable = mealITCReduction + vehicleITCReduction + homeITCReduction;

  // Line 106: ELIGIBLE ITCs (CRA: "enter eligible ITCs"). The limits come off
  // before this line, not on line 107.
  const line106 = hstPaidOnExpenses - itcNotClaimable;

  // Line 107: adjustments deducted from net tax (bad debts and the like).
  // Agent Runway doesn't track any.
  const line107 = 0;

  // Line 108: Total ITCs and adjustments
  const line108 = line106 + line107;

  // ── Line 109: Net tax ────────────────────────────────────────────────
  const line109 = line105 - line108;

  // ── Lines 110–112: other credits ─────────────────────────────────────
  const line110 = instalmentsPaid;
  const line111 = 0;
  const line112 = line110 + line111;
  const line113A = line109 - line112;

  // ── Lines 205/405: other debits (not tracked) ────────────────────────
  const line205 = 0;
  const line405 = 0;
  const line113B = line205 + line405;

  // ── Balance: positive = owe CRA, negative = refund ───────────────────
  const line113C = line113A + line113B;
  const line114 = line113C < 0 ? -line113C : 0;
  const line115 = line113C > 0 ? line113C : 0;

  // ── The return, line by line, in dollars and cents ───────────────────
  // Totals are rebuilt from the ROUNDED entries, which is what CRA's form
  // does with the figures typed into it.
  const cents = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100 || 0; // || 0: never -0
  const rateDisplay = rate === 0.14975
    ? "14.975%"
    : `${(rate * 100).toFixed(0)}%`;
  const pct = (share: number) => `${Math.round(Math.min(1, Math.max(0, share)) * 100)}%`;

  // Real receipts have total_amount set; a recurring-expense entry has total_amount: null
  const eligibleReceiptCount = periodReceipts.filter(
    (r) => (Number(r.tax_amount) || 0) > 0 && r.total_amount !== null
  ).length;
  const hasRecurringHST = periodReceipts.some(
    (r) => (Number(r.tax_amount) || 0) > 0 && r.total_amount === null
  );
  const paidOn = `${eligibleReceiptCount} receipt${eligibleReceiptCount !== 1 ? "s" : ""}${hasRecurringHST ? " and your recurring expenses" : ""}`;
  const notClaimableParts = [
    mealITCReduction > 0 ? `half of the ${label} on meals and entertainment` : null,
    vehicleITCReduction > 0 ? `the personal share of vehicle ${label} (business use ${pct(vehicleBusinessUsePct)})` : null,
    homeITCReduction > 0 ? `the personal share of home bill ${label} (home office ${pct(homeOfficeBusinessUsePct)})` : null,
  ].filter(Boolean);
  const itcNote = itcNotClaimable > 0
    ? `${label} paid on ${paidOn}: $${cents(hstPaidOnExpenses).toFixed(2)}, less $${cents(itcNotClaimable).toFixed(2)} that can't be claimed (${notClaimableParts.join("; ")})`
    : `${label} paid on ${paidOn}`;

  const f101 = cents(line101);
  const f103 = cents(line103);
  const f104 = 0;
  const f105 = cents(f103 + f104);
  const f106 = cents(line106);
  const f107 = 0;
  const f108 = cents(f106 + f107);
  const f109 = cents(f105 - f108);
  const f110 = cents(line110);
  const f111 = 0;
  const f112 = cents(f110 + f111);
  const f113A = cents(f109 - f112);
  const f205 = 0;
  const f405 = 0;
  const f113B = cents(f205 + f405);
  const f113C = cents(f113A + f113B);
  const NOT_TRACKED = "Agent Runway doesn't track this.";

  const filingLines: GST34FilingLine[] = [
    {
      line: "101", label: "Sales and other revenue", amount: f101, how: "enter", tracked: true,
      note: `Commission income (GCI) from ${periodTransactions.length} closed deal${periodTransactions.length !== 1 ? "s" : ""} in ${period.label}, before ${label}`,
    },
    {
      line: "103", label: `${label} collected or collectible`, amount: f103, how: "enter", tracked: true,
      note: `Line 101 × ${rateDisplay}`,
    },
    {
      line: "104", label: "Adjustments to be added to the net tax", amount: f104, how: "enter", tracked: false,
      note: `${NOT_TRACKED} $0 unless you have one, such as ${label} recovered on a bad debt. Meals are already at 50% on line 106, so there is no yearly meal add-back.`,
    },
    {
      line: "105", label: `Total ${label} and adjustments for the period`, amount: f105, how: "calculated", tracked: true,
      note: "Line 103 + line 104",
    },
    {
      line: "106", label: "Input tax credits (ITCs) for the period", amount: f106, how: "enter", tracked: true,
      note: itcNote,
    },
    {
      line: "107", label: "Adjustments to be deducted when determining the net tax", amount: f107, how: "enter", tracked: false,
      note: `${NOT_TRACKED} $0 unless you have one, such as ${label} inside a bad debt you wrote off.`,
    },
    {
      line: "108", label: "Total ITCs and adjustments", amount: f108, how: "calculated", tracked: true,
      note: "Line 106 + line 107",
    },
    {
      line: "109", label: "Net tax", amount: f109, how: "calculated", tracked: true,
      note: f109 < 0 ? "Line 105 minus line 108. Negative: a refund position." : "Line 105 minus line 108",
    },
    {
      line: "110", label: "Instalments and other annual filer payments", amount: f110, how: "enter", tracked: true,
      note: frequency === "annual"
        ? "Instalments you paid toward this year"
        : "Instalments apply to annual filers. $0 for a monthly or quarterly filer.",
    },
    {
      line: "111", label: "Rebates", amount: f111, how: "enter", tracked: false,
      note: `${NOT_TRACKED} $0 unless you are claiming a rebate with this return.`,
    },
    {
      line: "112", label: "Total other credits", amount: f112, how: "paper", tracked: true,
      note: "Line 110 + line 111",
    },
    {
      line: "113A", label: "Balance", amount: f113A, how: "paper", tracked: true,
      note: "Line 109 minus line 112",
    },
    {
      line: "205", label: `${label} due on purchases of real property or emission allowances`, amount: f205, how: "enter", tracked: false,
      note: `${NOT_TRACKED} $0 unless you bought real property for the business and have to pay the tax on it yourself.`,
    },
    {
      line: "405", label: `Other ${label} to be self-assessed`, amount: f405, how: "enter", tracked: false,
      note: `${NOT_TRACKED} It covers tax you have to work out and report yourself, for example on services bought from outside Canada that are used less than 90% in your business.`,
    },
    {
      line: "113B", label: "Total other debits", amount: f113B, how: "paper", tracked: true,
      note: "Line 205 + line 405",
    },
    {
      line: "113C", label: "Balance", amount: f113C, how: "paper", tracked: true,
      note: "Line 113A + line 113B",
    },
    f113C < 0
      ? {
          line: "114", label: "Refund claimed", amount: cents(-f113C), how: "calculated" as const, tracked: true,
          note: "The balance is negative: the amount CRA owes you for this period",
        }
      : {
          line: "115", label: "Amount owing", amount: f113C, how: "calculated" as const, tracked: true,
          note: f113C > 0 ? "The balance is positive: the amount due with this return" : "Nothing owing and no refund for this period",
        },
  ];

  return {
    filingLines,
    line101,
    line103,
    line104,
    line105,
    hstPaidOnExpenses,
    itcNotClaimable,
    mealItcReduction: mealITCReduction,
    vehicleItcReduction: vehicleITCReduction,
    homeItcReduction: homeITCReduction,
    line106,
    line107,
    line108,
    line109,
    line110,
    line111,
    line112,
    line113A,
    line205,
    line405,
    line113B,
    line113C,
    line114,
    line115,
    line113: line113C,
    taxRate: rate,
    taxLabel: label,
    periodLabel: period.label,
    deadline: period.deadline,
  };
}
