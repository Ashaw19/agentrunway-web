/**
 * CASL gate for every AI drafter and send path: Flight Control (Scan + the
 * nightly drafter), on-demand outreach (CRM briefing, client panel AI
 * Actions, Flight Crew), Flight Plan templates, the text queue, the email
 * send routes and the newsletter Recipients note.
 *
 * The rule itself lives in ONE place: consentStatus() in
 * packages/core/engines/casl-consent-engine.ts (CASL s.6, s.10(9)-(10),
 * s.11). This file only feeds it the rows each surface already reads, and
 * evaluates it on the day the message would go out.
 *
 *   - An unsubscribe (email or texts) blocks that channel everywhere.
 *   - Express consent the agent recorded opens drafting again for a past
 *     client whose purchase-based implied consent lapsed.
 *   - Implied consent from a purchase lasts 2 years from the last closing
 *     (own or co-bought, #278; collapsed deals don't count); from a
 *     recorded inquiry, 6 months.
 *   - A client with no closed deal and no consent record: the app can't see
 *     their basis, so drafting is unchanged ("no_record").
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { consentStatus, type ConsentStatus } from "@agent-runway/core/engines/casl-consent-engine";
import {
  CONSENT_RECORD_COLUMNS,
  consentInputsByClient,
  creditCoBuyers,
  type ConsentInputs,
  type CoPartyRow,
  type DealRow,
} from "@agent-runway/core/lib/consent-ledger";
import { atlanticISODate } from "@agent-runway/core/lib/local-date";
import { excludeCollapsedDeals } from "@agent-runway/core/types/database";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import type { ConsentLedgerRow } from "@agent-runway/core/types/database";

export { CASL_IMPLIED_CONSENT_MONTHS } from "@agent-runway/core/engines/casl-consent-engine";
export type { ConsentInputs };

export type ContactChannel = "email" | "call";

export type DealForConsent = DealRow;
export type CoPartyForConsent = CoPartyRow;

/**
 * `records` plus one entry per co-buyer, crediting them the deal they were
 * named on (#278). CONSENT ONLY: never feed the result into GCI,
 * repeat-client or valuation math (#257).
 */
export function withCoBuyerDeals(
  records:   readonly (DealForConsent & { id?: string | null })[],
  coParties: readonly CoPartyForConsent[],
): DealForConsent[] {
  return creditCoBuyers(records, coParties);
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

/**
 * The day a message would go out: the trigger date, or today if the trigger
 * has already passed (a post-close lookback carries a past trigger date).
 */
export function sendDay(triggerDate: string | null | undefined, today: string = atlanticISODate()): string {
  const trigger = (triggerDate ?? "").slice(0, 10);
  return trigger > today ? trigger : today;
}

/** consentStatus on the day a message for `triggerDate` would go out. */
export function consentOnSendDay(
  inputs:      ConsentInputs | undefined,
  triggerDate: string | null | undefined,
  today:       string = atlanticISODate(),
): ConsentStatus {
  return consentStatus({
    ...(inputs ?? { client: {}, closedDeals: [], consents: [] }),
    today: sendDay(triggerDate, today),
  });
}

/** "email" when an email may be drafted for `triggerDate`, else "call". */
export function emailChannelFor(
  inputs:      ConsentInputs | undefined,
  triggerDate: string,
  today:       string = atlanticISODate(),
): ContactChannel {
  return consentOnSendDay(inputs, triggerDate, today).email.canMessage ? "email" : "call";
}

/**
 * Every consent ledger row for the user, in pages (a request stops at 1,000
 * rows). A failed read throws: a caller that treated it as "no records"
 * would let an express consent go unseen (harmless) but, worse, read a
 * withdrawal as missing (harmful), so the caller fails closed.
 */
export async function fetchConsentLedger(
  supabase: SupabaseClient,
  userId:   string,
): Promise<ConsentLedgerRow[]> {
  const res = await fetchAllRows<ConsentLedgerRow>((from, to) =>
    supabase
      .from("client_email_consents")
      .select(CONSENT_RECORD_COLUMNS)
      .eq("user_id", userId)
      .order("id")
      .range(from, to));
  if (res.error) throw new Error(`consent ledger read failed: ${res.error.message}`);
  return res.data ?? [];
}

/**
 * Consent inputs for many clients from rows a surface already fetched.
 * `records` should be the unfiltered closed deals (an archived spouse's deal
 * still counts for the co-buyer); co-buyers are credited here.
 */
export function consentInputsFor(
  clients:   readonly { id: string; email_opt_out_at?: string | null; sms_opt_out_at?: string | null }[],
  records:   readonly (DealForConsent & { id?: string | null })[],
  coParties: readonly CoPartyForConsent[],
  consents:  readonly ConsentLedgerRow[],
): Map<string, ConsentInputs> {
  return consentInputsByClient(clients, withCoBuyerDeals(records, coParties), consents);
}

/**
 * Clients whose email consent doesn't cover a newsletter today: lapsed past
 * clients (implied consent from a purchase or an inquiry has ended), and
 * clients who unsubscribed from email. The Flight Control newsletter
 * Recipients note lists them (the app never picks recipients). Sorted ids.
 */
export function emailBlockedClients(
  inputsByClient: ReadonlyMap<string, ConsentInputs>,
  today: string = atlanticISODate(),
): { lapsed: string[]; optedOut: string[] } {
  const lapsed: string[] = [];
  const optedOut: string[] = [];
  for (const [id, inputs] of inputsByClient) {
    const s = consentStatus({ ...inputs, today }).email;
    if (s.state === "lapsed") lapsed.push(id);
    else if (s.state === "opted_out") optedOut.push(id);
  }
  return { lapsed: lapsed.sort(), optedOut: optedOut.sort() };
}
