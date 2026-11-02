/**
 * GST/HST return pre-filing check: the entries behind a period's return that
 * look wrong, listed so the agent can look at them before filing.
 *
 * It decides nothing and claims nothing. The return is `computeGST34`
 * (gst34-engine) and the expense-by-expense list behind line 106 is
 * `buildGST34Worksheet` (gst34-worksheet). This reads the same inputs and
 * reports entries that a person reviewing the records would stop on:
 *
 *   - tax that doesn't fit the rate: a receipt whose recorded GST/HST is a
 *     different share of its total than the province's rate gives, outside a
 *     tolerance for rounding, tips and zero-rated items on the same bill
 *   - a receipt dated after today, or in a different period from the one
 *     being filed, when the file holds it as this period's
 *   - two receipts on the same day, from the same vendor, for the same amount
 *   - a purchase of $30 or more with no vendor recorded (CRA's documentary
 *     evidence for an ITC on that amount names the supplier)
 *   - a commission on this return with no GST/HST recorded from the
 *     statement, so its line 103 share is an estimate at the rate
 *   - when commissions go on the return by the date paid: a deal on this
 *     return by its closing date only, because no paid date is entered yet
 *     (gstHstCommissionDate falls back to the closing date)
 *
 * Every rule here is a question for the agent, not a finding against them,
 * and the wording is information, never advice (tax-copy). Andrew's brief
 * for this (2026-11-02): a solo operator's quarterly review over a read-only
 * connector that lists what doesn't reconcile, with the human still filing.
 *
 * Pure: no I/O.
 */

import type { GST34WorksheetReceipt } from "./gst34-worksheet";
import { gstHstCommissionDate, recordedCommissionHst, type GstHstCommissionTiming } from "./commission-hst-engine";

type Numeric = number | string | null | undefined;

const toNumber = (v: Numeric): number => {
  if (v == null || v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const cents = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100 || 0;

/**
 * CRA's threshold below which an ITC's supporting document need not name the
 * supplier's registration number (GST/HST Memoranda Series 8.4: the "less
 * than $30" tier of the documentary requirements).
 */
export const ITC_DOCUMENT_SUPPLIER_THRESHOLD = 30;

/**
 * How far a receipt's recorded tax may sit from `rate ÷ (1 + rate)` of its
 * total before it's flagged. Receipts mix taxed and untaxed lines (a tip, a
 * zero-rated grocery item), so this is a wide net for a wrong entry, not a
 * recomputation. Measured as a share of the total.
 */
export const TAX_SHARE_TOLERANCE = 0.03;

export type PrefilingCheckKind =
  | "tax_share_off"
  | "future_dated"
  | "outside_period"
  | "possible_duplicate"
  | "no_vendor_over_threshold"
  | "commission_hst_estimated"
  | "commission_no_paid_date";

export interface PrefilingCheckItem {
  kind: PrefilingCheckKind;
  /** Receipt: vendor and date. Commission: address. */
  description: string;
  date: string | null;
  amount: number;
  /** What a reviewer would look at, in plain words. */
  note: string;
}

export interface PrefilingReceipt extends GST34WorksheetReceipt {
  id?: string | null;
}

export interface PrefilingCommission {
  id?: string | null;
  address?: string | null;
  /** Closing date (YYYY-MM-DD). */
  date?: string | null;
  commission_paid_date?: string | null;
  commission_hst?: Numeric;
  status?: string | null;
}

export interface PrefilingCheckInput {
  /** Receipts the return treats as this period's. */
  receipts: readonly PrefilingReceipt[] | null | undefined;
  /** The deals this return covers (commissionsInGstHstPeriod for the same period and timing). */
  commissions?: readonly PrefilingCommission[] | null;
  /** YYYY-MM-DD, both ends included. */
  periodStart: string;
  periodEnd: string;
  /** The province's GST/HST rate as a fraction (0.15 for NB). */
  taxRate: number;
  /** Today, YYYY-MM-DD, for the future-dated rule. */
  today: string;
  /** How commissions are placed on the return (the agent's setting). */
  commissionTiming: GstHstCommissionTiming;
}

export interface PrefilingCheck {
  items: PrefilingCheckItem[];
  /** How many receipts and commissions were looked at. */
  reviewed: { receipts: number; commissions: number };
  counts: Record<PrefilingCheckKind, number>;
}

const EMPTY_COUNTS: Record<PrefilingCheckKind, number> = {
  tax_share_off: 0,
  future_dated: 0,
  outside_period: 0,
  possible_duplicate: 0,
  no_vendor_over_threshold: 0,
  commission_hst_estimated: 0,
  commission_no_paid_date: 0,
};

const money = (n: number) => `$${Math.abs(n).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const vendorOf = (r: PrefilingReceipt) => (r.vendor ?? "").trim() || "Unknown vendor";
const dayOf = (v: string | null | undefined) => (v && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);

export function runGST34PrefilingCheck(input: PrefilingCheckInput): PrefilingCheck {
  const items: PrefilingCheckItem[] = [];
  const counts = { ...EMPTY_COUNTS };
  const push = (item: PrefilingCheckItem) => {
    items.push(item);
    counts[item.kind] += 1;
  };

  const receipts = input.receipts ?? [];
  const expectedShare = input.taxRate > 0 ? input.taxRate / (1 + input.taxRate) : 0;

  // ── Receipts, one at a time ───────────────────────────────────────────────
  for (const r of receipts) {
    const total = toNumber(r.total_amount);
    const tax = toNumber(r.tax_amount);
    const date = dayOf(r.expense_date);
    const description = vendorOf(r);

    if (date && date > input.today) {
      push({
        kind: "future_dated",
        description,
        date,
        amount: cents(total),
        note: "Dated after today. A scanned date can be read wrong.",
      });
    } else if (date && (date < input.periodStart || date > input.periodEnd)) {
      push({
        kind: "outside_period",
        description,
        date,
        amount: cents(total),
        note: `Dated outside ${input.periodStart} to ${input.periodEnd}, but counted in this period.`,
      });
    }

    if (expectedShare > 0 && total > 0 && tax > 0) {
      const share = tax / total;
      if (Math.abs(share - expectedShare) > TAX_SHARE_TOLERANCE) {
        const atRate = cents(total * expectedShare);
        push({
          kind: "tax_share_off",
          description,
          date,
          amount: cents(total),
          note: `${money(tax)} of GST/HST recorded on ${money(total)}. At the full rate the tax on that total is ${money(atRate)}. A bill can carry tips or untaxed items; a typed figure can be off.`,
        });
      }
    }

    if (total >= ITC_DOCUMENT_SUPPLIER_THRESHOLD && !(r.vendor ?? "").trim() && tax > 0) {
      push({
        kind: "no_vendor_over_threshold",
        description,
        date,
        amount: cents(total),
        note: `No vendor recorded on a purchase of ${money(ITC_DOCUMENT_SUPPLIER_THRESHOLD)} or more with GST/HST claimed. CRA's documentary requirements for an ITC at that amount name the supplier.`,
      });
    }
  }

  // ── Possible duplicates: same day, same vendor, same amount ──────────────
  const groups = new Map<string, PrefilingReceipt[]>();
  for (const r of receipts) {
    const date = dayOf(r.expense_date);
    const total = cents(toNumber(r.total_amount));
    if (!date || total === 0) continue;
    const key = `${date}|${vendorOf(r).toLowerCase()}|${total.toFixed(2)}`;
    const list = groups.get(key) ?? [];
    list.push(r);
    groups.set(key, list);
  }
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const r = list[0];
    push({
      kind: "possible_duplicate",
      description: vendorOf(r),
      date: dayOf(r.expense_date),
      amount: cents(toNumber(r.total_amount)),
      note: `${list.length} receipts on the same day from the same vendor for the same amount. Two visits, or one receipt entered twice.`,
    });
  }

  // ── Commissions ──────────────────────────────────────────────────────────
  const commissions = input.commissions ?? [];
  for (const c of commissions) {
    const placed = gstHstCommissionDate({ date: c.date ?? "", commission_paid_date: c.commission_paid_date ?? null }, input.commissionTiming) || null;
    const address = (c.address ?? "").trim() || "A deal";

    if (recordedCommissionHst(c) == null) {
      push({
        kind: "commission_hst_estimated",
        description: address,
        date: placed,
        amount: 0,
        note: "No GST/HST recorded from the brokerage statement, so its share of line 103 is an estimate at the rate.",
      });
    }
    if (input.commissionTiming === "paid" && !dayOf(c.commission_paid_date)) {
      push({
        kind: "commission_no_paid_date",
        description: address,
        date: placed,
        amount: 0,
        note: "No paid date entered, so it sits on this return by its closing date. If it was paid in a different period, the paid date moves it there.",
      });
    }
  }

  // Dated items first, newest last; the same order a reviewer reads the list in.
  items.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "") || a.description.localeCompare(b.description));

  return { items, reviewed: { receipts: receipts.length, commissions: commissions.length }, counts };
}
