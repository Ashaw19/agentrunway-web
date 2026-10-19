/**
 * Flight Control's consent_lapsing opportunity (CASL consent ledger, 00183).
 *
 * A past client's implied consent from their purchase lasts 2 years from the
 * last closing (CASL s.10(10)(a)). From CONSENT_LAPSING_WARNING_DAYS before
 * that day, Flight Control offers a drafted, approve-before-send message
 * asking whether they'd like to keep hearing from the agent. A consent
 * request is itself a commercial electronic message (s.1(3)), so from the
 * lapse day it becomes a call card for CONSENT_LAPSED_CALL_DAYS: the ask
 * happens by phone, and a yes is recorded in the client's Consent section.
 *
 * The phase comes from consentLapsingPhase() in packages/core (the same
 * consentStatus every drafter reads). Detection, scoring and card copy live
 * here so Scan (getTopOpportunities) and the nightly drafter
 * (detectAndDraftForUser) wire them in the same way, and so they are
 * testable without a database.
 *
 * Never suppressed by the 14-day contact hold: the ask has a deadline. A
 * card goes away when the agent records express consent, dismisses it, or
 * marks the request sent (same occurrence key: the last implied day).
 */

import {
  CASL_IMPLIED_CONSENT_MONTHS,
  consentLapsingPhase,
  consentStatus,
  formatConsentDay,
} from "@agent-runway/core/engines/casl-consent-engine";
import type { ConsentInputs } from "@agent-runway/core/lib/consent-ledger";
import type { CallCardCopy } from "@/lib/crm/scan-call-cards";

export const CONSENT_LAPSING_TYPE = "consent_lapsing" as const;
/** At most this many consent cards per Scan, so the list keeps room for other signals. */
export const CONSENT_LAPSING_MAX_PER_SCAN = 3;
/** Days left at which the ask outranks the backfill (a strong signal, ≥ 55). */
const URGENT_DAYS = 14;

export interface LatestDeal {
  id?:         string | null;
  address?:    string | null;
  close_date?: string | null;
  side?:       string | null;
}

export interface ConsentLapsingCandidate {
  client_id:        string;
  opportunity_type: typeof CONSENT_LAPSING_TYPE;
  trigger_date:     string;
  client_record_id: string | null;
  context: {
    phase:      "ask" | "call";
    lapses_on:  string;
    days_left:  number | null;
    last_close: string | null;
    address:    string | null;
    close_date: string | null;
    side:       string | null;
  };
}

/** "clientId|triggerDate" of a consent request already marked sent. */
export const sentKey = (clientId: string, triggerDate: string) => `${clientId}|${triggerDate}`;

/**
 * Every client whose email consent is in its lapsing window today.
 * `phases` limits it: the nightly drafter only wants "ask" (it drafts);
 * Scan wants both.
 */
export function consentLapsingCandidates(
  inputsByClient: ReadonlyMap<string, ConsentInputs>,
  today:          string,
  latestDeal:     ReadonlyMap<string, LatestDeal>,
  sent:           ReadonlySet<string> = new Set(),
  phases:         ReadonlySet<"ask" | "call"> = new Set(["ask", "call"]),
): ConsentLapsingCandidate[] {
  const out: ConsentLapsingCandidate[] = [];
  for (const [clientId, inputs] of inputsByClient) {
    const status = consentStatus({ ...inputs, today });
    const phase = consentLapsingPhase(status.email, today);
    if (!phase || !phases.has(phase.phase)) continue;
    if (sent.has(sentKey(clientId, phase.triggerDate))) continue;
    const deal = latestDeal.get(clientId);
    out.push({
      client_id:        clientId,
      opportunity_type: CONSENT_LAPSING_TYPE,
      trigger_date:     phase.triggerDate,
      client_record_id: deal?.id ?? null,
      context: {
        phase:      phase.phase,
        lapses_on:  phase.lapsesOn,
        days_left:  phase.daysLeft,
        last_close: status.lastClose,
        address:    deal?.address ?? null,
        close_date: deal?.close_date ?? status.lastClose,
        side:       deal?.side ?? null,
      },
    });
  }
  return out.sort((a, b) => a.context.lapses_on.localeCompare(b.context.lapses_on));
}

/** Scan score: above an idle past client (38), so the same client shows the consent card; the ask is a strong signal in its last 2 weeks. */
export function consentLapsingScore(ctx: Record<string, unknown>): number {
  if (ctx.phase === "call") return 40;
  const days = Number(ctx.days_left);
  return Number.isFinite(days) && days <= URGENT_DAYS ? 60 : 50;
}

function monthYear(iso: unknown): string {
  if (typeof iso !== "string" || !/^\d{4}-\d{2}/.test(iso)) return "";
  const d = formatConsentDay(`${iso.slice(0, 7)}-01`); // "May 1, 2024"
  return d.replace(/ 1, /, " ");
}

/** Card copy for both phases. Information, not advice. */
export function consentLapsingCopy(ctx: Record<string, unknown>): CallCardCopy {
  const lapses = formatConsentDay(typeof ctx.lapses_on === "string" ? ctx.lapses_on : null);
  const closed = monthYear(ctx.last_close ?? ctx.close_date);
  const years = CASL_IMPLIED_CONSENT_MONTHS / 12;
  const whyThisMatters =
    `Past clients are where most repeat and referral business comes from. With their express consent on record, Flight Control keeps drafting for them after the ${years} years.`;

  if (ctx.phase === "call") {
    return {
      label: `Past client · email consent from their purchase ended ${lapses}`,
      whyNow: `Their last deal closed${closed ? ` in ${closed}` : ""}. Under CASL, implied consent from a purchase lasts ${years} years, and it ended on ${lapses}. A message asking for consent counts as a commercial message too, so the ask is a phone call now.`,
      whyThisMatters,
      angle: "Call to catch up, and ask whether they'd like to hear from you by email. If they say yes, record it in the Consent section of their profile with how and when they said it.",
      impact: "A recorded yes makes this past client reachable by email again, for as long as they want.",
      primaryReason: "A call now can reopen email for this past client.",
      risk: "Until their express consent is recorded, Agent Runway won't draft emails or texts to them.",
    };
  }

  const days = Number(ctx.days_left);
  const when = Number.isFinite(days) ? (days === 1 ? "tomorrow" : `in ${days} days`) : "soon";
  return {
    label: `Past client · email consent from their purchase ends ${lapses}`,
    whyNow: `Their last deal closed${closed ? ` in ${closed}` : ""}. Under CASL, implied consent from a purchase lasts ${years} years, so it ends ${when} (${lapses}). A message asking for consent counts as a commercial message, so it can only go by email before then.`,
    whyThisMatters,
    angle: "Ask, in a line or two, whether they'd like to keep hearing from you. If they reply yes, record it in the Consent section of their profile (method: email reply).",
    impact: "One yes keeps this relationship reachable by email for as long as they want, instead of call-only.",
    primaryReason: `This one has a deadline: from ${lapses} the ask can only happen by phone.`,
    risk: `From ${lapses}, Agent Runway treats them as call-only until you record their express consent.`,
  };
}
