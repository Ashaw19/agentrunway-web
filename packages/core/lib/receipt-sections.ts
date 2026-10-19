/**
 * The receipt list in receipt-date order, cut into filing periods.
 *
 * Andrew, 2026-10-19: "On the list of receipts in expenses, I want line breaks
 * that indicate a new quarter. They should be listed in chronological order,
 * not order of upload." The phone listed receipts newest upload first; the web
 * sorted by date in the database (where an undated receipt sorts first) and
 * had no breaks. Both lists now go through this file.
 *
 *   - Order: undated receipts first (newest upload first), then by receipt
 *     date (`expense_date`), newest first. Same date: newest upload
 *     (`created_at`) first, then `id`, so both apps show the same order
 *     whatever order the rows arrived in. An undated receipt counts in no
 *     total and no input tax credit until it has a date, so it goes where it
 *     is seen first.
 *   - Sections: the undated receipts are their own section, first; then one
 *     per filing period of the agent's GST/HST filing frequency (quarters for
 *     a quarterly filer, months, or the year), named by the filing-period
 *     engine, newest first.
 *   - `limit` is the screen's cap (50) on DATED receipts: the newest `limit`
 *     by receipt date are shown. The undated section is always shown in full.
 *     Each section also carries how many receipts of its period the whole
 *     list holds.
 *
 * DISPLAY ONLY. No amount is read here. Totals, the GST34 summary and the
 * exports come from the full rows (apps/web/lib/expenses/receipt-list.ts).
 */
import type { FilingFrequency, FilingPeriod } from "../types/database";
import { filingPeriodForDate, filingPeriodMonths } from "../engines/filing-period-engine";

/** What ordering and grouping read from a receipt row. */
export interface ReceiptListRow {
  id?: string | null;
  expense_date?: string | null;
  created_at?: string | null;
}

const FREQUENCIES: readonly FilingFrequency[] = ["monthly", "quarterly", "annual"];

/**
 * The agent's filing frequency, or quarterly when the value is missing or not
 * one of the three (the column's default, and the web page's fallback).
 */
export function toFilingFrequency(value: unknown): FilingFrequency {
  return FREQUENCIES.includes(value as FilingFrequency) ? (value as FilingFrequency) : "quarterly";
}

/** `YYYY-MM-DD` with a real month and a day of 01 to 31: always inside its year's periods. */
const RECEIPT_DAY = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** The row's receipt day, or null when it has none (or not a `YYYY-MM-DD` day). */
function receiptDay(row: ReceiptListRow): string | null {
  const d = row.expense_date;
  return d && RECEIPT_DAY.test(d) ? d : null;
}

/** An upload instant as a number, so "Z" and "+00:00" strings compare correctly. Missing = oldest. */
function uploadedAt(row: ReceiptListRow): number {
  const t = row.created_at ? Date.parse(row.created_at) : NaN;
  return Number.isNaN(t) ? -Infinity : t;
}

/** Undated first, then receipt date newest first; same date, newest upload first; then id. */
export function compareReceiptsByDate(a: ReceiptListRow, b: ReceiptListRow): number {
  const da = receiptDay(a);
  const db = receiptDay(b);
  if (da !== db) {
    if (da === null) return -1;
    if (db === null) return 1;
    return da < db ? 1 : -1;
  }
  const ua = uploadedAt(a);
  const ub = uploadedAt(b);
  if (ua !== ub) return ua < ub ? 1 : -1;
  const ia = a.id ?? "";
  const ib = b.id ?? "";
  return ia === ib ? 0 : ia < ib ? -1 : 1;
}

/** A copy of the rows in list order (see compareReceiptsByDate). */
export function sortReceiptsByDate<T extends ReceiptListRow>(rows: readonly T[] | null | undefined): T[] {
  return [...(rows ?? [])].sort(compareReceiptsByDate);
}

export interface ReceiptSection<T> {
  /** The period's first day, or "undated". */
  key: string;
  /** The filing period, from the engine. Null for the undated section. */
  period: FilingPeriod | null;
  /**
   * First and last month of the period ("Oct", "Dec"), for a period longer
   * than a month. Null for a monthly period (its label is the month) and for
   * the undated section.
   */
  months: { from: string; to: string } | null;
  /** The rows shown in this section, in list order. */
  rows: T[];
  /** Receipts of this period in the whole list, shown or not. */
  count: number;
}

export interface ReceiptSections<T> {
  /** Undated first, then newest period first. Only sections with a row shown. */
  sections: ReceiptSection<T>[];
  /** Rows shown: every undated one, plus at most `limit` dated ones. */
  shown: number;
  /** Rows in the list. */
  total: number;
  /** Dated rows in the list, the ones `limit` applies to. */
  datedTotal: number;
}

/**
 * Sorts the rows (compareReceiptsByDate), keeps every undated row and the
 * first `limit` dated ones, and groups them by filing period. `frequency` is
 * `user_settings.filing_frequency`.
 */
export function receiptSections<T extends ReceiptListRow>(
  rows: readonly T[] | null | undefined,
  frequency: unknown,
  limit: number = Infinity,
): ReceiptSections<T> {
  const freq = toFilingFrequency(frequency);
  const sorted = sortReceiptsByDate(rows);
  const cap = Math.max(0, Math.floor(limit));

  const byKey = new Map<string, ReceiptSection<T>>();
  const sections: ReceiptSection<T>[] = [];
  let datedTotal = 0;
  let shown = 0;
  for (const row of sorted) {
    const period = filingPeriodForDate(freq, receiptDay(row));
    const key = period ? period.startDate : "undated";
    let section = byKey.get(key);
    if (!section) {
      const months = period ? filingPeriodMonths(period) : null;
      section = {
        key,
        period,
        months: months && months.from !== months.to ? months : null,
        rows: [],
        count: 0,
      };
      byKey.set(key, section);
      sections.push(section);
    }
    section.count += 1;
    // Undated: always shown. Dated: the newest `limit`.
    let show = true;
    if (period) {
      show = datedTotal < cap;
      datedTotal += 1;
    }
    if (show) {
      section.rows.push(row);
      shown += 1;
    }
  }

  return {
    sections: sections.filter((s) => s.rows.length > 0),
    shown,
    total: sorted.length,
    datedTotal,
  };
}
