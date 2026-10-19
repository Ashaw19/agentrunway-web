/**
 * The Expenses page's receipt list, and the rule that numbers never come
 * from it.
 *
 * Until 2026-10-13 the page loaded "the last 50 receipts" for the on-screen
 * log and then used that same list for the GST34 summary, the CSV export and
 * the PDF receipt log. Past 50 receipts a year everything built on it went
 * quietly short: an account with 122 receipts showed a Q2 HST summary that
 * left out a $640 input tax credit, and the "accountant-ready" exports
 * stopped at 50 rows.
 *
 *   - The list now loads every receipt dated this year or last (and any with
 *     no date). The screen shows RECEIPT_LIST_PAGE at a time.
 *   - The GST34 summary reads the full current-year rows the totals use
 *     (receiptsInPeriod), not the list.
 *   - The exports are every receipt of the year they are named for
 *     (receiptsForYear).
 *
 * Since 2026-10-19 the log reads in receipt-date order with a heading at each
 * filing period: `receiptSections` (packages/core/lib/receipt-sections.ts),
 * the same helper as the phone. The headings' wording is below.
 */
import type { ReceiptSection } from "@agent-runway/core/lib/receipt-sections";

/**
 * Columns for the receipt list: everything except `ocr_raw` (the OCR
 * payload, large, and never shown in the list or the edit dialog).
 */
export const RECEIPT_LIST_COLUMNS =
  "id, user_id, vendor, expense_date, total_amount, tax_amount, subtotal, currency, category_key, notes, receipt_path, ocr_confidence, created_at, updated_at";

/** Rows the receipt log shows before "Show all". Display only. */
export const RECEIPT_LIST_PAGE = 50;

/** PostgREST `or` filter for the list: dated this year or last, or undated. */
export function receiptListDateFilter(year: number): string {
  return `expense_date.gte.${year - 1}-01-01,expense_date.is.null`;
}

interface Dated {
  expense_date?: string | null;
}

/** Receipts dated inside a filing period, both ends included. Undated ones are in no period. */
export function receiptsInPeriod<T extends Dated>(
  rows: readonly T[] | null | undefined,
  period: { startDate: string; endDate: string } | null | undefined,
): T[] {
  if (!period) return [...(rows ?? [])];
  return (rows ?? []).filter((r) => {
    const d = r.expense_date;
    return !!d && d >= period.startDate && d <= period.endDate;
  });
}

/**
 * Receipts for a calendar-year export. Undated receipts are kept: they can't
 * be placed in a year, and dropping them from an accountant's file would
 * hide them.
 */
export function receiptsForYear<T extends Dated>(rows: readonly T[] | null | undefined, year: number): T[] {
  const prefix = `${year}-`;
  return (rows ?? []).filter((r) => !r.expense_date || r.expense_date.startsWith(prefix));
}

type SectionHeading = Pick<ReceiptSection<unknown>, "period" | "months">;

/**
 * A section heading in the receipt log: "Q4 2026 · Oct to Dec" for a quarter,
 * "2026 · Jan to Dec" for an annual filer, "Oct 2026" for a monthly one, and
 * "No date" for receipts without one.
 */
export function receiptSectionTitle(section: SectionHeading): string {
  if (!section.period) return "No date";
  return section.months
    ? `${section.period.label} · ${section.months.from} to ${section.months.to}`
    : section.period.label;
}

/**
 * The count beside a heading: "1 receipt", "12 receipts", or "10 of 40
 * receipts" when the page cap cuts the section short.
 */
export function receiptSectionCount(section: Pick<ReceiptSection<unknown>, "rows" | "count">): string {
  const noun = section.count === 1 ? "receipt" : "receipts";
  return section.rows.length < section.count
    ? `${section.rows.length} of ${section.count} ${noun}`
    : `${section.count} ${noun}`;
}
