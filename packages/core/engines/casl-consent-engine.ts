/**
 * CASL consent status: the one answer every drafter, detector and send path
 * reads before a commercial electronic message (email or text) to a client.
 *
 * Primary text: Canada's Anti-Spam Legislation, S.C. 2010, c. 23 (Justice
 * Laws, read 2026-10-18), and the CRTC's Electronic Commerce Protection
 * Regulations, SOR/2012-36.
 *
 *   s.1(2)   A message whose purpose, or one of whose purposes, is to
 *            encourage participation in a commercial activity is a
 *            commercial electronic message (CEM).
 *   s.1(3)   A message that asks for consent to send a CEM "is also
 *            considered to be a commercial electronic message". So a consent
 *            request itself needs consent: it can only go out while implied
 *            consent still holds. After the lapse, asking is a phone call.
 *   s.6(1)   No CEM without the recipient's express or implied consent.
 *   s.6(2)   A CEM identifies the sender, says how to reach them, and carries
 *            an unsubscribe mechanism (s.11). Regs s.2: business name and a
 *            mailing address plus a phone, email or web address.
 *   s.10(9)(a)  Consent is implied by an existing business relationship.
 *   s.10(10)(a) ...a purchase within the "two-year period immediately before
 *            the day on which the message was sent";
 *   s.10(10)(e) ...an inquiry within the "six-month period immediately before
 *            the day on which the message was sent".
 *   s.11(3)  An unsubscribe takes effect without delay, within 10 business
 *            days at the latest.
 *   s.13     Whoever says they have consent has the onus of proving it,
 *            which is why express consent is recorded with a method, a date
 *            and the wording (and only ever by the agent: Agent Runway never
 *            infers it from notes, replies or activity).
 *   The Act gives express consent no expiry; it ends when withdrawn.
 *
 * Counting: the lapse day is the anniversary (purchase + 24 months, inquiry
 * + 6 months) and that day itself is already lapsed. It is the cautious
 * reading of "immediately before the day", and the same day the earlier
 * `outreachChannel` rule used (PR #273).
 *
 * Scope of what the app can see: a client with no closed deal and no
 * consent record is "no_record". Their basis (a friend, an inquiry made by
 * phone, an open house sign-in) is unknown to the app, so drafting for them
 * is unchanged, as before this ledger existed.
 *
 * Pure: no I/O, no clock. Dates are YYYY-MM-DD calendar days; instants are
 * read as Atlantic days (APP_TIME_ZONE) unless the caller passes `dayOf`
 * (the phone passes its own local day).
 */

import { addDaysISO, atlanticISODate, daysBetweenISO } from "../lib/local-date";

// ── The rule ────────────────────────────────────────────────────────────────

/** s.10(10)(a): implied consent from a purchase lasts two years. */
export const CASL_IMPLIED_CONSENT_MONTHS = 24;
/** s.10(10)(e): implied consent from an inquiry lasts six months. */
export const CASL_INQUIRY_CONSENT_MONTHS = 6;
/** Flight Control's consent_lapsing card starts this many days before the lapse. */
export const CONSENT_LAPSING_WARNING_DAYS = 60;
/** ...and stays, as a call card, this many days after it. */
export const CONSENT_LAPSED_CALL_DAYS = 30;

export const CONSENT_CHANNELS = ["email", "sms"] as const;
export type ConsentChannel = (typeof CONSENT_CHANNELS)[number];

export const CONSENT_BASES = ["express", "implied_inquiry"] as const;
export type ConsentBasis = (typeof CONSENT_BASES)[number];

/** How the client gave it. Required on every record the agent makes. */
export const CONSENT_METHODS = ["in_person", "verbal", "written", "email_reply", "text_reply", "web_form"] as const;
export type ConsentMethod = (typeof CONSENT_METHODS)[number];

export const CONSENT_METHOD_LABELS: Record<ConsentMethod, string> = {
  in_person:   "In person",
  verbal:      "On a phone call",
  written:     "In writing (signed form or letter)",
  email_reply: "Email reply",
  text_reply:  "Text reply",
  web_form:    "Web form",
};

export const CONSENT_CHANNEL_LABELS: Record<ConsentChannel, string> = {
  email: "Email",
  sms:   "Texts",
};

// ── Inputs ──────────────────────────────────────────────────────────────────

/** A client_email_consents row (00173, generalized in 00183). */
export interface ConsentRecordInput {
  /** 'email' | 'sms'. Rows from before 00183 have none: email. */
  channel?:      string | null;
  /** 'express' | 'implied_inquiry'. Rows from before 00183 have none: express. */
  basis?:        string | null;
  /** 'agent' (recorded by the agent) | 'website' (the agent's site form). */
  source?:       string | null;
  /** The website list it was given for; 'other' on agent records. */
  kind?:         string | null;
  method?:       string | null;
  /** When it was given: a timestamptz (or YYYY-MM-DD). */
  consented_at:  string;
  withdrawn_at?: string | null;
}

export interface ConsentClientInput {
  /** Unsubscribed from email (00173): the website's "all", or a withdrawal the agent recorded. */
  email_opt_out_at?: string | null;
  /** Unsubscribed from texts (00183). */
  sms_opt_out_at?:   string | null;
}

/** A closed deal the client bought or sold, their own or co-bought (#278). */
export interface ConsentDealInput {
  close_date?:       string | null;
  condition_status?: string | null;
}

export interface ConsentStatusInput {
  client:      ConsentClientInput;
  closedDeals: readonly ConsentDealInput[];
  consents:    readonly ConsentRecordInput[];
  /** The day the message would go out, YYYY-MM-DD (today, or a later trigger day). */
  today:       string;
  /** Instant → calendar day. Default: the Atlantic day. */
  dayOf?:      (ts: string) => string;
}

// ── Output ──────────────────────────────────────────────────────────────────

/**
 *   express    express consent on file, not withdrawn
 *   implied    implied consent (purchase or inquiry) holds until `impliedUntil`
 *   lapsed     implied consent ended on `lapsesOn`: call only
 *   opted_out  unsubscribed from this channel: call only
 *   no_record  no deal and no consent on file: basis unknown, drafting unchanged
 */
export type ConsentState = "express" | "implied" | "lapsed" | "opted_out" | "no_record";

export interface ChannelConsent {
  channel:      ConsentChannel;
  state:        ConsentState;
  /** A draft on this channel is allowed on the evaluated day. */
  canMessage:   boolean;
  basis:        "express" | "purchase" | "inquiry" | "opt_out" | null;
  /** implied: the first day it no longer holds. lapsed: the day it lapsed (null when unreadable). */
  lapsesOn:     string | null;
  /** implied: the last day it holds. */
  impliedUntil: string | null;
  /** express: the day given. opted_out: the day of the opt-out. implied/lapsed: the purchase or inquiry day. */
  since:        string | null;
  /** implied: whole days from the evaluated day to `lapsesOn`. */
  daysLeft:     number | null;
  /** express: how it was given. */
  method:       ConsentMethod | null;
  /** Plain words, information not advice. */
  reason:       string;
}

export interface ConsentStatus {
  email:     ChannelConsent;
  sms:       ChannelConsent;
  /** The client's most recent closing (own or co-bought, collapsed excluded). */
  lastClose: string | null;
}

// ── Date helpers ────────────────────────────────────────────────────────────

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const pad2 = (n: number) => String(n).padStart(2, "0");

function realDay(iso: string): boolean {
  const m = ISO_DAY.exec(iso);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toISOString().slice(0, 10) === iso;
}

/**
 * YYYY-MM-DD plus whole calendar months. A day the target month lacks rolls
 * into the next month (Feb 29 + 24 months = Mar 1), the same result as
 * Date#setMonth. Null for anything that isn't a real day.
 */
export function addMonthsISO(iso: string, months: number): string | null {
  const day = iso.slice(0, 10);
  if (!realDay(day)) return null;
  const [y, m, d] = day.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + months, d));
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

/** The first day implied consent from a closing on `closeDate` no longer holds. */
export function purchaseConsentLapsesOn(closeDate: string): string | null {
  return addMonthsISO(closeDate, CASL_IMPLIED_CONSENT_MONTHS);
}

function defaultDayOf(ts: string): string {
  if (ISO_DAY.test(ts)) return ts;
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? ts.slice(0, 10) : atlanticISODate(d);
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "2027-03-09" → "March 9, 2027", read off the string (no Date, no zone shift). */
export function formatConsentDay(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const month = MONTHS[m - 1];
  return month && d && y ? `${month} ${d}, ${y}` : iso;
}

function monthYear(iso: string): string {
  const [y, m] = iso.slice(0, 10).split("-").map(Number);
  const month = MONTHS[m - 1];
  return month && y ? `${month} ${y}` : iso;
}

/** Compare two stored instants: true when `a` is strictly later than `b`. */
function laterThan(a: string, b: string, dayOf: (ts: string) => string): boolean {
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (!Number.isNaN(ta) && !Number.isNaN(tb)) return ta > tb;
  return dayOf(a) > dayOf(b);
}

// ── Records ─────────────────────────────────────────────────────────────────

const channelOf = (r: ConsentRecordInput): string => r.channel || "email";
const basisOf = (r: ConsentRecordInput): string => r.basis || "express";

/**
 * Express consent for one-to-one outreach: recorded by the agent. A website
 * sign-up (source 'website') is express consent to that list only (the
 * market letter, listing alerts): s.10(1) ties consent to the purpose stated
 * when it was asked for, so it doesn't open up personal emails or texts.
 */
export function isOutreachExpressConsent(r: ConsentRecordInput): boolean {
  return basisOf(r) === "express" && (r.source ?? "agent") === "agent" && !r.withdrawn_at;
}

function isMethod(v: unknown): v is ConsentMethod {
  return typeof v === "string" && (CONSENT_METHODS as readonly string[]).includes(v);
}

// ── Status ──────────────────────────────────────────────────────────────────

interface ImpliedCandidate {
  basis:    "purchase" | "inquiry";
  since:    string;
  lapsesOn: string | null; // null: unreadable date, already lapsed (fail closed)
}

const CHANNEL_NOUN: Record<ConsentChannel, { plural: string; one: string }> = {
  email: { plural: "emails", one: "an email" },
  sms:   { plural: "texts", one: "a text" },
};

function channelConsent(
  channel: ConsentChannel,
  input: ConsentStatusInput,
  lastClose: string | null,
  unreadableClose: boolean,
): ChannelConsent {
  const dayOf = input.dayOf ?? defaultDayOf;
  const today = input.today;
  const base = { channel, lapsesOn: null, impliedUntil: null, daysLeft: null, method: null } as const;
  const rows = input.consents.filter((r) => channelOf(r) === channel);
  const noun = CHANNEL_NOUN[channel];

  const express = rows
    .filter(isOutreachExpressConsent)
    .sort((a, b) => (laterThan(a.consented_at, b.consented_at, dayOf) ? -1 : 1))[0];

  // 1. Unsubscribed from this channel. Only express consent given after the
  //    opt-out lifts it (they changed their mind and said so).
  const optOutAt = channel === "email" ? input.client.email_opt_out_at : input.client.sms_opt_out_at;
  if (optOutAt && !(express && laterThan(express.consented_at, optOutAt, dayOf))) {
    const since = dayOf(optOutAt);
    return {
      ...base,
      state: "opted_out",
      canMessage: false,
      basis: "opt_out",
      since,
      reason: `Unsubscribed from your ${noun.plural} on ${formatConsentDay(since)}. Under CASL an unsubscribe stays in effect until they give express consent again.`,
    };
  }

  // 2. Express consent on file.
  if (express) {
    const since = dayOf(express.consented_at);
    const method = isMethod(express.method) ? express.method : null;
    return {
      ...base,
      state: "express",
      canMessage: true,
      basis: "express",
      since,
      method,
      reason: `Express consent recorded for ${noun.plural}, given ${formatConsentDay(since)}${method ? ` (${CONSENT_METHOD_LABELS[method].toLowerCase()})` : ""}. Under CASL express consent has no end date; it lasts until they withdraw it.`,
    };
  }

  // 3. Implied consent: the latest-lapsing of the last purchase and any inquiry.
  const candidates: ImpliedCandidate[] = [];
  if (lastClose) candidates.push({ basis: "purchase", since: lastClose, lapsesOn: purchaseConsentLapsesOn(lastClose) });
  else if (unreadableClose) candidates.push({ basis: "purchase", since: "", lapsesOn: null });
  for (const r of rows) {
    if (basisOf(r) !== "implied_inquiry" || r.withdrawn_at) continue;
    const since = dayOf(r.consented_at);
    candidates.push({ basis: "inquiry", since, lapsesOn: addMonthsISO(since, CASL_INQUIRY_CONSENT_MONTHS) });
  }
  if (candidates.length === 0) {
    return {
      ...base,
      state: "no_record",
      canMessage: true,
      basis: null,
      since: null,
      reason: "No closed deal or consent on record, so Agent Runway can't see what their consent rests on. Drafting works as it did before the consent ledger.",
    };
  }
  const best = candidates.reduce((a, b) => ((b.lapsesOn ?? "") > (a.lapsesOn ?? "") ? b : a));
  const rule = best.basis === "purchase"
    ? `Under CASL, implied consent from a purchase lasts ${CASL_IMPLIED_CONSENT_MONTHS / 12} years`
    : `Under CASL, implied consent from an inquiry lasts ${CASL_INQUIRY_CONSENT_MONTHS} months`;
  const from = best.basis === "purchase"
    ? (best.since ? `Their last deal closed in ${monthYear(best.since)}.` : "Their last deal's closing date can't be read.")
    : `They made an inquiry on ${formatConsentDay(best.since)}.`;

  if (best.lapsesOn && today < best.lapsesOn) {
    const impliedUntil = addDaysISO(best.lapsesOn, -1);
    return {
      ...base,
      state: "implied",
      canMessage: true,
      basis: best.basis,
      since: best.since || null,
      lapsesOn: best.lapsesOn,
      impliedUntil,
      daysLeft: daysBetweenISO(today, best.lapsesOn),
      reason: `${from} ${rule}, so it holds until ${formatConsentDay(impliedUntil)}.`,
    };
  }
  return {
    ...base,
    state: "lapsed",
    canMessage: false,
    basis: best.basis,
    since: best.since || null,
    lapsesOn: best.lapsesOn,
    reason: best.lapsesOn
      ? `${from} ${rule}, and that ended on ${formatConsentDay(best.lapsesOn)}. A phone call is the way to reconnect, or to ask for their express consent.`
      : `${from} Agent Runway treats their implied consent as ended. A phone call is the way to reconnect.`,
  };
}

/**
 * Consent per channel for one client, on the day a message would go out.
 * `closedDeals` are the client's own deals plus any they co-bought; collapsed
 * deals and deals with no close date are ignored here.
 */
export function consentStatus(input: ConsentStatusInput): ConsentStatus {
  let lastClose: string | null = null;
  let unreadableClose = false;
  for (const d of input.closedDeals) {
    if (d.condition_status === "collapsed" || !d.close_date) continue;
    const day = d.close_date.slice(0, 10);
    if (!realDay(day)) { unreadableClose = true; continue; }
    if (!lastClose || day > lastClose) lastClose = day;
  }
  return {
    email: channelConsent("email", input, lastClose, unreadableClose),
    sms: channelConsent("sms", input, lastClose, unreadableClose),
    lastClose,
  };
}

// ── Flight Control: consent_lapsing ─────────────────────────────────────────

export interface ConsentLapsingPhase {
  /** ask: implied consent still holds, so a consent request can go out. call: it lapsed. */
  phase:       "ask" | "call";
  lapsesOn:    string;
  /** The last day implied consent holds: the card's trigger_date (its dismiss and queue key). */
  triggerDate: string;
  /** ask only: days until the lapse. */
  daysLeft:    number | null;
}

/**
 * Where a past client stands against their purchase-based lapse on `today`:
 * from CONSENT_LAPSING_WARNING_DAYS before it, Flight Control offers a
 * drafted consent request ("ask"); from the lapse day, for
 * CONSENT_LAPSED_CALL_DAYS, a call card ("call"), because a consent request
 * is itself a CEM (s.1(3)). Null otherwise: express consent on file, an
 * opt-out, an inquiry-only lead, or no deal.
 */
export function consentLapsingPhase(ch: ChannelConsent, today: string): ConsentLapsingPhase | null {
  if (ch.basis !== "purchase" || !ch.lapsesOn) return null;
  const triggerDate = addDaysISO(ch.lapsesOn, -1);
  if (ch.state === "implied") {
    const daysLeft = daysBetweenISO(today, ch.lapsesOn);
    return daysLeft <= CONSENT_LAPSING_WARNING_DAYS
      ? { phase: "ask", lapsesOn: ch.lapsesOn, triggerDate, daysLeft }
      : null;
  }
  if (ch.state === "lapsed") {
    const since = daysBetweenISO(ch.lapsesOn, today);
    return since >= 0 && since < CONSENT_LAPSED_CALL_DAYS
      ? { phase: "call", lapsesOn: ch.lapsesOn, triggerDate, daysLeft: null }
      : null;
  }
  return null;
}

// ── Copy ────────────────────────────────────────────────────────────────────

/** A short label for a badge: "Express", "Implied until March 9, 2027", "Lapsed: call only". */
export function consentStateLabel(ch: ChannelConsent): string {
  switch (ch.state) {
    case "express":   return "Express";
    case "implied":   return `Implied until ${formatConsentDay(ch.impliedUntil)}`;
    case "lapsed":    return "Lapsed: call only";
    case "opted_out": return "Unsubscribed: call only";
    case "no_record": return "No record";
  }
}

/**
 * What a drafter answers when `canMessage` is false: the rule as information
 * and what Agent Runway does. Never "should" or "must".
 */
export function consentRefusalReason(ch: ChannelConsent, clientName: string): string {
  const noun = CHANNEL_NOUN[ch.channel];
  if (ch.state === "opted_out") {
    return `${clientName} unsubscribed from your ${noun.plural}${ch.since ? ` on ${formatConsentDay(ch.since)}` : ""}, so Agent Runway won't draft ${noun.one}. A phone call is the way to reach them.`;
  }
  if (ch.state === "lapsed") {
    const rule = ch.basis === "inquiry"
      ? `Under CASL, implied consent from an inquiry lasts ${CASL_INQUIRY_CONSENT_MONTHS} months`
      : `Under CASL, implied consent from a purchase lasts ${CASL_IMPLIED_CONSENT_MONTHS / 12} years${ch.channel === "sms" ? " and covers texts the same as email" : ""}`;
    const from = ch.basis === "inquiry"
      ? `${clientName} made an inquiry on ${formatConsentDay(ch.since)}.`
      : ch.since
        ? `${clientName}'s last deal closed in ${monthYear(ch.since)}.`
        : `${clientName}'s last deal has a closing date Agent Runway can't read.`;
    return `${from} ${rule}, and that window has closed by the time this message would go out, so Agent Runway won't draft ${noun.one}. A phone call is the way to reconnect. If they give you express consent, record it in the Consent section of their profile and drafting opens up again.`;
  }
  return ch.reason;
}
