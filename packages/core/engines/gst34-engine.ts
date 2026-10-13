/**
 * GST34 Pre-Fill Engine
 *
 * Computes all GST34 (GST/HST Return for Registrants) line values
 * for a given filing period based on the agent's transactions and receipts.
 *
 * CRA GST34 Line Reference:
 *   101  — Total sales and other revenue (before GST/HST)
 *   103  — GST/HST collected or collectible
 *   104  — Adjustments (usually $0 for sole-prop agents)
 *   105  — Total GST/HST and adjustments (103 + 104)
 *   106  — Input Tax Credits (ITCs) — HST paid on eligible expenses
 *   107  — ITC adjustments (meal 50% reduction, personal-use share of vehicle
 *          costs and of home bills)
 *   108  — Total ITCs and adjustments (106 + 107)
 *   109  — Net tax (105 − 108). Positive = owe CRA. Negative = refund.
 *   110  — Instalments and net tax already remitted
 *   112  — Subtotal of credits (110 + 111)
 *   113A — Balance owing (if 109 > 112)
 *   113B — Refund claimed (if 112 > 109)
 *
 * Sources:
 *   - CRA GST34 form: canada.ca/en/revenue-agency/services/forms-publications/forms/gst34.html
 *   - RC4022 General Information for GST/HST Registrants
 *   - GST/HST Memoranda Series 8.1 (ITCs)
 */

import { gstHstRate, gstHstLabel } from "./canadian-tax-engine";
import { EXPENSE_KEY_TO_T2125, isHomeOfficeKey } from "./t2125-engine";
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
   * Share of vehicle use that is business, 0–1 (user_settings.vehicle_business_use_pct).
   * Omitted = 1 (no vehicle reduction), so older callers keep their numbers.
   */
  vehicleBusinessUsePct?: number;
  /**
   * Share of the home that is the business workspace, 0–1
   * (user_settings.home_office_business_use_pct). Applies to GST/HST on bills
   * in the Home Office expense category. Omitted = 0: no ITC on a home bill,
   * so a caller that doesn't know the share never over-claims.
   */
  homeOfficeBusinessUsePct?: number;
}

export interface GST34Line {
  /** CRA GST34 line number */
  line: string;
  /** Human-readable label */
  label: string;
  /** Computed dollar amount */
  amount: number;
  /** Explanatory note for the agent */
  note: string;
}

export interface GST34Result {
  /** All computed lines */
  lines: GST34Line[];
  /** Quick access to key values */
  line101: number; // Revenue
  line103: number; // HST collected
  line105: number; // Total HST + adjustments
  line106: number; // Gross ITCs
  line107: number; // ITC adjustments (negative — reductions)
  /** The parts of line 107, as positive amounts. */
  mealItcReduction: number;
  vehicleItcReduction: number;
  homeItcReduction: number;
  line108: number; // Net ITCs
  line109: number; // Net tax
  line110: number; // Instalments paid
  line113: number; // Balance owing (positive) or refund (negative)
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
// estimate uses (EXPENSE_KEY_TO_T2125), so the two can't disagree.
//
// Until 2026-10-13 this file kept its own list of meal keys
// ("meals_entertainment", "client_meals", "meals", "entertainment"). No
// expense in the app has ever used those: the real keys are meals_client,
// meals_team, ent_client and ent_events. So the 50% reduction never applied
// and every meal's HST was claimed in full. Vehicle ITCs ignored the
// business-use share entirely. Both overstated the refund.

/** Keys older receipts may carry (category-level, before item keys). */
const LEGACY_MEAL_KEYS = new Set(["meals_entertainment", "client_meals", "meals", "entertainment"]);
const LEGACY_VEHICLE_KEYS = new Set(["vehicle"]);

/** Meals and entertainment: CRA allows 50% of the GST/HST paid as an ITC. */
export function isMealOrEntertainmentKey(key: string | null | undefined): boolean {
  if (!key) return false;
  return LEGACY_MEAL_KEYS.has(key) || EXPENSE_KEY_TO_T2125[key]?.deductiblePct === 0.5;
}

/** Vehicle running costs and lease payments: ITC follows the business-use share. */
export function isVehicleKey(key: string | null | undefined): boolean {
  if (!key) return false;
  return LEGACY_VEHICLE_KEYS.has(key) || EXPENSE_KEY_TO_T2125[key]?.applyVehicleUse === true;
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
  vehicleBusinessUsePct = 1,
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
  const vehicleReduction = vehicleUse || isVehicleKey(categoryKey)
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
    vehicleBusinessUsePct = 1,
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

  // ── Line 104: Adjustments (usually $0 for sole-prop agents) ─────────
  const line104 = 0;

  // ── Line 105: Total GST/HST and adjustments ─────────────────────────
  const line105 = line103 + line104;

  // ── Lines 106/107: Input Tax Credits ─────────────────────────────────
  // Sum all tax_amount from receipts, then take off what CRA doesn't allow:
  // half of meals and entertainment, and the personal-use share of vehicle
  // costs and of home bills (itcForExpense).
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

  // Line 106: Gross ITCs before adjustments
  const line106 = grossITCs;

  // Line 107: Adjustments to be subtracted (negative): the disallowed half
  // of meal/entertainment ITCs plus the personal-use share of vehicle ITCs
  // and of home-bill ITCs.
  const line107 = -(mealITCReduction + vehicleITCReduction + homeITCReduction);

  // Line 108: Total ITCs and adjustments
  const line108 = line106 + line107;

  // ── Line 109: Net tax ────────────────────────────────────────────────
  const line109 = line105 - line108;

  // ── Line 110: Instalments already paid ───────────────────────────────
  const line110 = instalmentsPaid;

  // ── Line 112: Subtotal of credits ────────────────────────────────────
  const line112 = line110;

  // ── Line 113: Balance owing or refund ────────────────────────────────
  // Positive = owe CRA, Negative = refund
  const line113 = line109 - line112;

  // ── Build structured line items ──────────────────────────────────────
  const rateDisplay = rate === 0.14975
    ? "14.975%"
    : `${(rate * 100).toFixed(0)}%`;

  // Real receipts have total_amount set; the synthetic recurring-HST entry has total_amount: null
  const eligibleReceiptCount = periodReceipts.filter(
    (r) => (Number(r.tax_amount) || 0) > 0 && r.total_amount !== null
  ).length;
  const hasRecurringHST = periodReceipts.some(
    (r) => (Number(r.tax_amount) || 0) > 0 && r.total_amount === null
  );
  const itcNote = `${label} paid on ${eligibleReceiptCount} eligible expense receipt${eligibleReceiptCount !== 1 ? "s" : ""}${hasRecurringHST ? " + recurring expenses" : ""}`;

  const lines: GST34Line[] = [
    {
      line: "101",
      label: "Total sales and other revenue",
      amount: line101,
      note: `Sum of GCI from ${periodTransactions.length} closed deal${periodTransactions.length !== 1 ? "s" : ""} in ${period.label}`,
    },
    {
      line: "103",
      label: `${label} collected or collectible`,
      amount: line103,
      note: `Line 101 × ${rateDisplay} ${label} rate`,
    },
    {
      line: "105",
      label: `Total ${label} and adjustments`,
      amount: line105,
      note: "Line 103 + Line 104 (adjustments typically $0)",
    },
    {
      line: "106",
      label: "Input Tax Credits (ITCs)",
      amount: line106,
      note: itcNote,
    },
    ...(mealITCReduction + vehicleITCReduction + homeITCReduction > 0
      ? [
          {
            line: "107",
            label: "ITC adjustments",
            amount: line107,
            note: [
              mealITCReduction > 0 ? "50% of meals & entertainment ITCs" : null,
              vehicleITCReduction > 0
                ? `personal-use share of vehicle ITCs (business use ${Math.round(Math.min(1, Math.max(0, vehicleBusinessUsePct)) * 100)}%)`
                : null,
              homeITCReduction > 0
                ? `personal-use share of home bill ITCs (business use of home ${Math.round(Math.min(1, Math.max(0, homeOfficeBusinessUsePct)) * 100)}%)`
                : null,
            ].filter(Boolean).join(" + ") + " not claimable under CRA rules",
          },
        ]
      : []),
    {
      line: "108",
      label: "Total ITCs and adjustments",
      amount: line108,
      note: "Line 106 + Line 107",
    },
    {
      line: "109",
      label: "Net tax",
      amount: line109,
      note: line109 >= 0
        ? "Line 105 − Line 108 — Amount owing before credits"
        : "Line 105 − Line 108 — Refund position before credits",
    },
    ...(line110 > 0
      ? [
          {
            line: "110",
            label: "Instalments and net tax already remitted",
            amount: line110,
            note: "Payments already made to CRA for this period",
          },
        ]
      : []),
    {
      line: "113",
      label: line113 >= 0 ? "Balance owing to CRA" : "Refund claimed",
      amount: Math.abs(line113),
      note: line113 >= 0
        ? "Amount due with this return"
        : "Amount CRA owes you for this period",
    },
  ];

  return {
    lines,
    line101,
    line103,
    line105,
    line106,
    line107,
    mealItcReduction: mealITCReduction,
    vehicleItcReduction: vehicleITCReduction,
    homeItcReduction: homeITCReduction,
    line108,
    line109,
    line110,
    line113,
    taxRate: rate,
    taxLabel: label,
    periodLabel: period.label,
    deadline: period.deadline,
  };
}
