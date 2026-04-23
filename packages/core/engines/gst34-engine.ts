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
 *   107  — ITC adjustments (meal 50% reduction, personal-use vehicle)
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
  }[];
  /** Amount already remitted for this specific period (user-entered) */
  instalmentsPaid: number;
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

// ── Meal/entertainment categories that get 50% ITC reduction ──────────────

const MEAL_CATEGORIES = new Set([
  "meals_entertainment",
  "client_meals",
  "meals",
  "entertainment",
]);

// ── Engine ─────────────────────────────────────────────────────────────────

export function computeGST34(input: GST34Input): GST34Result {
  const {
    province,
    period,
    frequency,
    periodTransactions,
    periodReceipts,
    instalmentsPaid,
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
  // Sum all tax_amount from receipts. For meals/entertainment, only 50%
  // of the ITC is claimable (matching CRA rules for ITC on M&E).
  let grossITCs = 0;
  let mealITCReduction = 0;

  for (const r of periodReceipts) {
    const tax = Number(r.tax_amount) || 0;
    if (tax <= 0) continue;

    if (r.category_key && MEAL_CATEGORIES.has(r.category_key)) {
      // Only 50% of tax on meals/entertainment is claimable as ITC
      grossITCs += tax;
      mealITCReduction += tax * 0.5; // Half is disallowed
    } else {
      grossITCs += tax;
    }
  }

  // Line 106: Gross ITCs before adjustments
  const line106 = grossITCs;

  // Line 107: Adjustments to be subtracted (meal reduction is negative)
  // This is the 50% disallowed portion of meal/entertainment ITCs
  const line107 = -mealITCReduction;

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
    ...(mealITCReduction > 0
      ? [
          {
            line: "107",
            label: "ITC adjustments (50% meal/entertainment reduction)",
            amount: line107,
            note: "CRA disallows 50% of ITCs on meals & entertainment",
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
