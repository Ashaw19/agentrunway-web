/**
 * Commissions recorded as closed but not yet marked paid, past the point
 * where the money would normally have arrived.
 *
 * A closed deal with no `commission_paid_date` is a question: did the cheque
 * come and nobody wrote the date down, or is it still owed? Either way it is
 * worth a look. The paid date also places the deal on the GST/HST return
 * (commission-hst-engine) and in the tax year (tax-year.ts), so an unmarked
 * one can sit in the wrong period.
 *
 * Two guards keep this from flagging history:
 *   - Deals closed before `trackingSince` are left out. Paid dates began
 *     with migration 00178 (2026-10-14); deals closed before the agent started
 *     recording them are not receivables, they are old records.
 *   - A deal is listed only `graceDays` after closing. The brokerage's own
 *     statements show Andrew paid a median of 14 days after closing and never
 *     more than 21 (read 2026-11-02), so 30 is well past normal.
 *
 * From Finn's field research (2026-11-02): a solo operator's bot that tracked
 * unpaid reimbursements and nudged him was the one "receivables" automation
 * with evidence behind it. Pure: no I/O.
 */

import { daysBetweenISO } from "../lib/local-date";

export interface ReceivableDeal {
  id: string;
  address?: string | null;
  client_name?: string | null;
  /** Closing date, YYYY-MM-DD. */
  date: string;
  status?: string | null;
  commission_paid_date?: string | null;
  /** The agent's commission on the deal (computeGCI), supplied by the caller. */
  gci?: number | null;
}

export interface CommissionReceivable {
  id: string;
  address: string;
  clientName: string;
  closedOn: string;
  daysSinceClose: number;
  gci: number;
}

export interface CommissionReceivablesInput {
  deals: readonly ReceivableDeal[] | null | undefined;
  /** Today, YYYY-MM-DD (atlanticISODate on the server, localISODate on a device). */
  today: string;
  /** Deals closed before this day are not considered. */
  trackingSince: string;
  /** Days after closing before a deal with no paid date is listed. */
  graceDays?: number;
}

export interface CommissionReceivables {
  items: CommissionReceivable[];
  totalGci: number;
  /** Closed deals in the tracked range still inside the grace period. */
  waiting: number;
}

/** Paid dates were recorded from this day (migration 00178). */
export const PAID_DATE_TRACKING_SINCE = "2026-01-01";
/** Past the brokerage's normal close-to-paid gap. */
export const RECEIVABLE_GRACE_DAYS = 30;

const cents = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100 || 0;

export function commissionReceivables(input: CommissionReceivablesInput): CommissionReceivables {
  const grace = input.graceDays ?? RECEIVABLE_GRACE_DAYS;
  const items: CommissionReceivable[] = [];
  let waiting = 0;

  for (const d of input.deals ?? []) {
    if ((d.status ?? "closed") !== "closed") continue;
    if (d.commission_paid_date) continue;
    const closedOn = (d.date ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(closedOn)) continue;
    if (closedOn < input.trackingSince) continue;
    const days = daysBetweenISO(closedOn, input.today);
    if (days < grace) {
      if (days >= 0) waiting += 1;
      continue;
    }
    items.push({
      id: d.id,
      address: (d.address ?? "").trim() || "A deal",
      clientName: (d.client_name ?? "").trim(),
      closedOn,
      daysSinceClose: days,
      gci: cents(Number(d.gci) || 0),
    });
  }

  // Longest outstanding first.
  items.sort((a, b) => b.daysSinceClose - a.daysSinceClose || a.address.localeCompare(b.address));
  return { items, totalGci: cents(items.reduce((s, i) => s + i.gci, 0)), waiting };
}

/** One line for a briefing or a card. Information, not advice. */
export function receivablesSummaryLine(r: CommissionReceivables): string | null {
  if (r.items.length === 0) return null;
  const n = r.items.length;
  const oldest = r.items[0];
  const money = `$${r.totalGci.toLocaleString("en-CA", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  return n === 1
    ? `${oldest.address} closed ${oldest.daysSinceClose} days ago with no paid date recorded (${money} commission).`
    : `${n} closed deals have no paid date recorded, ${money} in commission; the oldest, ${oldest.address}, closed ${oldest.daysSinceClose} days ago.`;
}
