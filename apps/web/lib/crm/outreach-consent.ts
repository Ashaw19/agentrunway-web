/**
 * CASL gate for every AI email drafter: Flight Control (Scan + nightly cron),
 * on-demand outreach (CRM briefing + Flight Crew), Flight Plan workflow
 * templates, and the newsletter Recipients note.
 *
 * Under CASL, buying (or selling) a home through the agent creates implied
 * consent to receive commercial email for two years. After that, the purchase
 * alone no longer covers an email — a closing-anniversary note with a home
 * value offer, an idle-client check-in, a mortgage-renewal nudge.
 *
 * Flight Control still surfaces those past clients (they are the best people
 * to reconnect with), but as a call, not an email draft. The scan read path
 * (getTopOpportunities), the draft write path (detectAndDraftForUser) and the
 * on-demand drafters in lib/ai/draft-services.ts all apply this — one shared
 * helper keeps them in lock-step, the same reason contactable-records.ts
 * exists.
 *
 * Scope: only clients with a closed deal on record are gated, counting a
 * co-buyer named on a couple's deal (withCoBuyerDeals; Andrew, 2026-10-06).
 * For everyone else the app has no view of their consent basis (an inquiry,
 * an open-house sign-up, express consent), so their behaviour is unchanged.
 */

import { localISODate } from "@agent-runway/core/lib/local-date";
import { excludeCollapsedDeals } from "@agent-runway/core/types/database";

/** CASL s.10(10)(a): implied consent from a purchase lasts two years. */
export const CASL_IMPLIED_CONSENT_MONTHS = 24;

export type ContactChannel = "email" | "call";

export interface DealForConsent {
  client_id?:        string | null;
  close_date?:       string | null;
  condition_status?: string | null;
}

/** A client_record_co_parties row: this deal also named this person (#257). */
export interface CoPartyForConsent {
  client_record_id?: string | null;
  co_client_id?:     string | null;
}

/**
 * `records` plus one entry per co-buyer, crediting them the deal they were
 * named on. A couple's deal is ONE client_records row held by one spouse; the
 * other spouse bought the home too, so their implied consent runs from the
 * same close date.
 *
 * CONSENT ONLY. Never feed the result into GCI, repeat-client or valuation
 * math: #257's invariant is exactly one client_records row per deal, and a
 * co-party's GCI stays $0.
 */
export function withCoBuyerDeals(
  records:   readonly (DealForConsent & { id?: string | null })[],
  coParties: readonly CoPartyForConsent[],
): DealForConsent[] {
  const byId = new Map<string, DealForConsent>();
  for (const r of records) if (r.id) byId.set(r.id, r);
  const out: DealForConsent[] = [...records];
  for (const cp of coParties) {
    const deal = cp.client_record_id ? byId.get(cp.client_record_id) : undefined;
    if (!deal || !cp.co_client_id) continue;
    out.push({ client_id: cp.co_client_id, close_date: deal.close_date, condition_status: deal.condition_status });
  }
  return out;
}

/** Each client's most recent closed deal. Collapsed deals are not purchases. */
export function lastClosedDealByClient(
  records: readonly DealForConsent[],
): Map<string, string> {
  const out = new Map<string, string>();
  for (const r of excludeCollapsedDeals(records)) {
    if (!r.client_id || !r.close_date) continue;
    const prev = out.get(r.client_id);
    if (!prev || r.close_date > prev) out.set(r.client_id, r.close_date);
  }
  return out;
}

/** A Date as YYYY-MM-DD in local time (toISOString would give the UTC day). */
export { localISODate };

/**
 * How Flight Control should reach this client for an opportunity.
 *
 * Measured on the day the message would go out: the trigger date, or today
 * if the trigger has already passed. "call" once that day is on or after the
 * two-year mark from the client's most recent closed deal.
 */
export function outreachChannel(
  lastClose:   string | undefined,
  triggerDate: string,
  today:       Date = new Date(),
): ContactChannel {
  if (!lastClose) return "email";

  // Anchor at local noon — a bare date parsed as UTC midnight lands on the
  // previous day west of Greenwich (the #268 bug class).
  const lapse = new Date(`${lastClose.slice(0, 10)}T12:00:00`);
  if (isNaN(lapse.getTime())) return "call"; // a past client we can't date: fail closed
  lapse.setMonth(lapse.getMonth() + CASL_IMPLIED_CONSENT_MONTHS);

  const todayIso = localISODate(today);
  const trigger  = triggerDate.slice(0, 10);
  const sendIso  = trigger > todayIso ? trigger : todayIso;
  return sendIso >= localISODate(lapse) ? "call" : "email";
}

/**
 * Past clients whose purchase-based implied consent has lapsed as of today.
 * The newsletter Recipients note lists these so a broadcast isn't pasted to
 * them by default. Sorted for stable display.
 */
export function lapsedPastClients(
  records: readonly DealForConsent[],
  today:   Date = new Date(),
): string[] {
  const todayIso = localISODate(today);
  const out: string[] = [];
  for (const [clientId, lastClose] of lastClosedDealByClient(records)) {
    if (outreachChannel(lastClose, todayIso, today) === "call") out.push(clientId);
  }
  return out.sort();
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * The refusal the on-demand drafters (CRM briefing, Flight Crew, Flight Plan
 * templates) return for a lapsed past client. States the rule and what the
 * app does; it is not legal advice, so no should/must.
 */
export function emailConsentLapsedReason(clientName: string, lastClose: string): string {
  // Read the month off the string: no Date parse, no timezone shift (#268).
  const [y, m] = lastClose.slice(0, 10).split("-");
  const month  = MONTHS[Number(m) - 1];
  const when   = month && y ? `${month} ${y}` : lastClose;
  return `${clientName}'s last deal closed in ${when}. Under CASL, implied consent to email from a purchase lasts 2 years, and that window has closed by the time this message would go out, so Agent Runway won't draft an email. A phone call is the way to reconnect. Agent Runway doesn't record express email consent.`;
}
