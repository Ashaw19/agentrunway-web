/**
 * GST/HST return worksheet — what is behind line 106.
 *
 * The return itself is `computeGST34` (gst34-engine). This lists, expense by
 * expense, the GST/HST that was paid in the period and how much of it is an
 * eligible input tax credit, so the agent can check the figure against their
 * own receipts before typing it into CRA's form, and can show an accountant
 * (or CRA) where it came from.
 *
 * It decides nothing. Every amount comes from `itcForExpense`, the same
 * function the return and the expense totals use, and the result carries
 * the difference between its own total and the return's line 106, which is
 * 0 unless the two were given different receipts.
 *
 * Created 2026-10-13.
 */

import { isMealOrEntertainmentKey, isVehicleKey, itcForExpense } from "./gst34-engine";
import type { RecurringHSTDetail } from "./recurring-expense-engine";
import { isHomeOfficeKey } from "./t2125-engine";

type Numeric = number | string | null | undefined;

/** A receipt in the period. `receipt_path` only decides the "no receipt image" flag. */
export interface GST34WorksheetReceipt {
  vendor?: string | null;
  expense_date?: string | null;
  total_amount?: Numeric;
  tax_amount?: Numeric;
  category_key?: string | null;
  receipt_path?: string | null;
}

/** Which limit applied to the GST/HST on an expense. */
export type GST34ItcRule = "full" | "meals" | "vehicle" | "home";

export interface GST34WorksheetRow {
  source: "receipt" | "recurring";
  /** Receipts: the expense date. Recurring: null (charged `occurrences` times in the period). */
  date: string | null;
  /** Vendor, or the recurring expense's name. */
  description: string;
  categoryKey: string | null;
  /** What was paid, GST/HST included. Recurring: the total over the period. */
  paid: number;
  /** GST/HST paid. */
  hst: number;
  /** The eligible input tax credit on it. */
  claimable: number;
  rule: GST34ItcRule;
  /** Receipts: is a receipt image stored. Recurring: null. */
  hasReceiptImage: boolean | null;
  /** Recurring: times charged in the period. Receipts: null. */
  occurrences: number | null;
}

export interface GST34Worksheet {
  /** Every expense with GST/HST recorded: receipts by date, then recurring expenses by name. */
  rows: GST34WorksheetRow[];
  totals: { paid: number; hst: number; claimable: number };
  /**
   * Receipts in the period with no GST/HST recorded. They are expenses, but
   * nothing is claimed on them and they are not part of line 106.
   */
  noTaxRecorded: { count: number; paid: number };
  /** Receipts with an ITC claimed and no receipt image stored. */
  withoutReceiptImage: number;
  /**
   * This worksheet's claimable total minus the return's line 106, in cents
   * precision. 0 when both were built from the same expenses.
   */
  differenceFromLine106: number;
}

const toNumber = (v: Numeric): number => {
  if (v == null || v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const cents = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100 || 0; // || 0: never -0

function ruleFor(categoryKey: string | null | undefined, vehicleUse: boolean): GST34ItcRule {
  if (isHomeOfficeKey(categoryKey)) return "home";
  if (isMealOrEntertainmentKey(categoryKey)) return "meals";
  if (vehicleUse || isVehicleKey(categoryKey)) return "vehicle";
  return "full";
}

export function buildGST34Worksheet(input: {
  /** Receipts dated inside the period (every one, not a page of them). */
  receipts: readonly GST34WorksheetReceipt[] | null | undefined;
  /** recurringHSTDetailForPeriod(...) for the same period. */
  recurring: readonly RecurringHSTDetail[] | null | undefined;
  vehicleBusinessUsePct: number;
  homeOfficeBusinessUsePct: number;
  /** The return's line 106 (unrounded), to reconcile against. */
  line106: number;
}): GST34Worksheet {
  const { vehicleBusinessUsePct, homeOfficeBusinessUsePct } = input;
  const rows: GST34WorksheetRow[] = [];
  let noTaxCount = 0;
  let noTaxPaid = 0;

  const receipts = [...(input.receipts ?? [])].sort((a, b) =>
    (a.expense_date ?? "").localeCompare(b.expense_date ?? "") ||
    (a.vendor ?? "").localeCompare(b.vendor ?? ""),
  );
  for (const r of receipts) {
    const paid = toNumber(r.total_amount);
    const hst = Math.max(0, toNumber(r.tax_amount));
    if (hst <= 0) {
      if (paid !== 0) {
        noTaxCount += 1;
        noTaxPaid += paid;
      }
      continue;
    }
    const split = itcForExpense(hst, r.category_key, vehicleBusinessUsePct, false, homeOfficeBusinessUsePct);
    rows.push({
      source: "receipt",
      date: r.expense_date ?? null,
      description: (r.vendor ?? "").trim() || "Unknown vendor",
      categoryKey: r.category_key ?? null,
      paid,
      hst: split.gross,
      claimable: split.claimable,
      rule: ruleFor(r.category_key, false),
      hasReceiptImage: Boolean(r.receipt_path),
      occurrences: null,
    });
  }

  const recurring = [...(input.recurring ?? [])].sort((a, b) => a.name.localeCompare(b.name));
  for (const e of recurring) {
    if (!(e.tax_amount > 0)) continue;
    const split = itcForExpense(e.tax_amount, e.category_key, vehicleBusinessUsePct, e.vehicle_use, homeOfficeBusinessUsePct);
    rows.push({
      source: "recurring",
      date: null,
      description: e.name,
      categoryKey: e.category_key,
      paid: e.paid,
      hst: split.gross,
      claimable: split.claimable,
      rule: ruleFor(e.category_key, e.vehicle_use),
      hasReceiptImage: null,
      occurrences: e.occurrences,
    });
  }

  const sum = (pick: (r: GST34WorksheetRow) => number) => rows.reduce((s, r) => s + pick(r), 0);
  const claimable = sum((r) => r.claimable);
  return {
    rows,
    totals: { paid: cents(sum((r) => r.paid)), hst: cents(sum((r) => r.hst)), claimable: cents(claimable) },
    noTaxRecorded: { count: noTaxCount, paid: cents(noTaxPaid) },
    withoutReceiptImage: rows.filter((r) => r.source === "receipt" && r.hasReceiptImage === false).length,
    differenceFromLine106: cents(claimable - input.line106),
  };
}
