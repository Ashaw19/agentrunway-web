/**
 * The CASL consent ledger's rules for writing, and the inputs consentStatus
 * reads, assembled the same way on every surface. Pure: no I/O. The writers
 * in ./consent-writes.ts (web, phone, Flight Crew) and the MCP server's
 * tools/consent.ts both validate and shape rows here, so a record made
 * anywhere meets the same bar.
 *
 * The bar (CASL s.13: whoever relies on consent has to prove it):
 *   - how it was given (method) and the date are required;
 *   - so is the wording they agreed to, or a note on where the proof is;
 *   - a date in the future is refused;
 *   - express consent dated before an unsubscribe doesn't lift it.
 * Only the agent records consent. Flight Crew and the MCP tools record what
 * the agent tells them, after the agent approves it; nothing infers consent
 * from notes, replies or activity.
 */

import {
  CONSENT_BASES,
  CONSENT_CHANNELS,
  CONSENT_CHANNEL_LABELS,
  CONSENT_METHODS,
  CASL_INQUIRY_CONSENT_MONTHS,
  addMonthsISO,
  formatConsentDay,
  type ConsentBasis,
  type ConsentChannel,
  type ConsentDealInput,
  type ConsentMethod,
  type ConsentRecordInput,
  type ConsentStatusInput,
} from "../engines/casl-consent-engine";
import { atlanticDayStart, atlanticISODate, localISODate } from "./local-date";

/** Where a record was made (client_email_consents.recorded_via). */
export const CONSENT_RECORDED_VIA = ["web", "mobile", "flight_crew", "mcp"] as const;
export type ConsentRecordedVia = (typeof CONSENT_RECORDED_VIA)[number];

export const CONSENT_WORDING_MAX = 1000;
export const CONSENT_NOTE_MAX = 1000;

/** The columns every consent read selects. */
export const CONSENT_RECORD_COLUMNS =
  "id, client_id, kind, source, channel, basis, method, consent_text, evidence_note, consented_at, recorded_via, withdrawn_at, withdrawn_method, withdrawn_note, created_at";

/** The clients columns consentStatus reads. */
export const CONSENT_CLIENT_COLUMNS = "email_opt_out_at, sms_opt_out_at";

export interface RecordConsentInput {
  clientId:    string;
  channels:    readonly string[];
  basis:       string;
  method:      string;
  /** YYYY-MM-DD: the day they gave it (or made the inquiry). */
  date:        string;
  wording?:    string | null;
  note?:       string | null;
  recordedVia: ConsentRecordedVia;
}

export interface WithdrawConsentInput {
  clientId:    string;
  channels:    readonly string[];
  method:      string;
  /** YYYY-MM-DD: the day they asked to stop. */
  date:        string;
  note?:       string | null;
  recordedVia: ConsentRecordedVia;
}

/**
 * The agent's calendar. `today` is their day (Atlantic on the server, the
 * phone's own day on the phone); `noonOf` turns another day into the instant
 * stored for it.
 */
export interface ConsentClock {
  today:  string;
  now:    Date;
  noonOf: (day: string) => Date;
}

export interface CurrentOptOuts {
  email_opt_out_at?: string | null;
  sms_opt_out_at?:   string | null;
}

export type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

export interface CheckedConsent {
  clientId:    string;
  channels:    ConsentChannel[];
  basis:       ConsentBasis;
  method:      ConsentMethod;
  date:        string;
  /** The instant stored as consented_at. */
  at:          string;
  wording:     string;
  note:        string | null;
  recordedVia: ConsentRecordedVia;
  /** Said back to the agent when the record saves but changes nothing today. */
  warning:     string | null;
}

export interface CheckedWithdrawal {
  clientId:    string;
  channels:    ConsentChannel[];
  method:      ConsentMethod;
  date:        string;
  at:          string;
  note:        string | null;
  recordedVia: ConsentRecordedVia;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function isRealDay(iso: string): boolean {
  if (!ISO_DAY.test(iso)) return false;
  const d = new Date(`${iso}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso;
}

/**
 * The server's clock: Atlantic days (APP_TIME_ZONE), noon Atlantic for a day
 * that isn't today. The phone builds its own from its local day.
 */
export function atlanticConsentClock(now: Date = new Date()): ConsentClock {
  return {
    today: atlanticISODate(now),
    now,
    noonOf: (day) => new Date(atlanticDayStart(day).getTime() + 12 * 3_600_000),
  };
}

/**
 * The device's clock (the web browser, the phone): the agent's own day, and
 * local noon for a day that isn't today. No Atlantic formatter, so it works
 * on the phone's JS engine.
 */
export function localConsentClock(now: Date = new Date()): ConsentClock {
  return {
    today: localISODate(now),
    now,
    noonOf: (day) => {
      const [y, m, d] = day.split("-").map(Number);
      return new Date(y, m - 1, d, 12, 0, 0, 0);
    },
  };
}

/** An instant as the device's calendar day (consentStatus `dayOf` on the web and the phone). */
export function localDayOf(ts: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(ts)) return ts;
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? ts.slice(0, 10) : localISODate(d);
}

/** The stored instant for a day: now when it is today, else noon of that day. */
export function consentInstant(day: string, clock: ConsentClock): string {
  return (day === clock.today ? clock.now : clock.noonOf(day)).toISOString();
}

function checkChannels(raw: readonly string[]): Checked<ConsentChannel[]> {
  const set = [...new Set(raw)];
  if (set.length === 0) return { ok: false, error: "Pick email, texts, or both." };
  if (!set.every((c) => (CONSENT_CHANNELS as readonly string[]).includes(c))) {
    return { ok: false, error: "Channels are email and texts (sms)." };
  }
  return { ok: true, value: CONSENT_CHANNELS.filter((c) => set.includes(c)) };
}

function checkMethod(raw: string): Checked<ConsentMethod> {
  return (CONSENT_METHODS as readonly string[]).includes(raw)
    ? { ok: true, value: raw as ConsentMethod }
    : { ok: false, error: "Pick how they told you: in person, on a phone call, in writing, by email reply, by text reply, or on a web form." };
}

function checkDay(raw: string, clock: ConsentClock, what: string): Checked<string> {
  const day = raw?.trim() ?? "";
  if (!isRealDay(day)) return { ok: false, error: `Enter the date ${what} as YYYY-MM-DD.` };
  if (day > clock.today) return { ok: false, error: `The date ${what} can't be in the future.` };
  return { ok: true, value: day };
}

const clean = (s: string | null | undefined, max: number) => (s ?? "").trim().slice(0, max);

/**
 * Check a consent the agent is recording, against the client's current
 * opt-outs. Returns the normalized record or a plain-words error.
 */
export function checkRecordConsent(
  input: RecordConsentInput,
  clock: ConsentClock,
  optOuts: CurrentOptOuts,
): Checked<CheckedConsent> {
  if (!input.clientId) return { ok: false, error: "Pick the client first." };
  const channels = checkChannels(input.channels);
  if (!channels.ok) return channels;
  if (!(CONSENT_BASES as readonly string[]).includes(input.basis)) {
    return { ok: false, error: "Pick express consent or an inquiry." };
  }
  const basis = input.basis as ConsentBasis;
  const method = checkMethod(input.method);
  if (!method.ok) return method;
  const day = checkDay(input.date, clock, basis === "express" ? "they gave consent" : "of the inquiry");
  if (!day.ok) return day;
  const wording = clean(input.wording, CONSENT_WORDING_MAX);
  const note = clean(input.note, CONSENT_NOTE_MAX) || null;
  if (!wording && !note) {
    return {
      ok: false,
      error: basis === "express"
        ? "Add what they agreed to, in their words if you have them, or a note on where the proof is (a saved email, a signed form)."
        : "Add a note on what they asked about.",
    };
  }
  const at = consentInstant(day.value, clock);

  let warning: string | null = null;
  for (const ch of channels.value) {
    const optOut = ch === "email" ? optOuts.email_opt_out_at : optOuts.sms_opt_out_at;
    if (!optOut) continue;
    const label = CONSENT_CHANNEL_LABELS[ch].toLowerCase();
    if (basis === "express" && Date.parse(at) <= Date.parse(optOut)) {
      return {
        ok: false,
        error: `They unsubscribed from ${label} after the date you entered. Consent given before an unsubscribe doesn't lift it. If they agreed again after unsubscribing, enter that date.`,
      };
    }
    if (basis === "implied_inquiry") {
      warning = `Saved. They're still unsubscribed from ${label}: an inquiry doesn't lift an unsubscribe, only express consent does.`;
    }
  }
  if (!warning && basis === "implied_inquiry") {
    const lapses = addMonthsISO(day.value, CASL_INQUIRY_CONSENT_MONTHS);
    if (lapses && lapses <= clock.today) {
      warning = `Saved. Under CASL implied consent from an inquiry lasts ${CASL_INQUIRY_CONSENT_MONTHS} months, so this one ended on ${formatConsentDay(lapses)}.`;
    }
  }

  return {
    ok: true,
    value: {
      clientId: input.clientId,
      channels: channels.value,
      basis,
      method: method.value,
      date: day.value,
      at,
      wording,
      note,
      recordedVia: input.recordedVia,
      warning,
    },
  };
}

/** client_email_consents rows for a checked record: one per channel. */
export function consentInsertRows(userId: string, c: CheckedConsent) {
  return c.channels.map((channel) => ({
    user_id:       userId,
    client_id:     c.clientId,
    kind:          "other",
    source:        "agent",
    channel,
    basis:         c.basis,
    method:        c.method,
    consent_text:  c.wording,
    evidence_note: c.note,
    consented_at:  c.at,
    recorded_via:  c.recordedVia,
  }));
}

export function checkWithdrawConsent(input: WithdrawConsentInput, clock: ConsentClock): Checked<CheckedWithdrawal> {
  if (!input.clientId) return { ok: false, error: "Pick the client first." };
  const channels = checkChannels(input.channels);
  if (!channels.ok) return channels;
  const method = checkMethod(input.method);
  if (!method.ok) return method;
  const day = checkDay(input.date, clock, "they asked to stop");
  if (!day.ok) return day;
  return {
    ok: true,
    value: {
      clientId: input.clientId,
      channels: channels.value,
      method: method.value,
      date: day.value,
      at: consentInstant(day.value, clock),
      note: clean(input.note, CONSENT_NOTE_MAX) || null,
      recordedVia: input.recordedVia,
    },
  };
}

/**
 * The clients update for a withdrawal: each channel's opt-out, always
 * written, as the LATER of the withdrawal and any opt-out already on file,
 * with source 'agent' and this withdrawal's method and note. Latest, because
 * express consent given after an opt-out lifts it (an earlier date could let
 * a consent that predates this withdrawal lift it); 'agent', because a later
 * sign-up on the agent's website must not clear an unsubscribe the agent
 * recorded (lib/inbound/website-event.ts).
 */
export function withdrawalClientPatch(w: CheckedWithdrawal, current: CurrentOptOuts): Record<string, string | null> {
  const patch: Record<string, string | null> = {};
  for (const ch of w.channels) {
    const existing = ch === "email" ? current.email_opt_out_at : current.sms_opt_out_at;
    const at = existing && Date.parse(existing) > Date.parse(w.at) ? existing : w.at;
    const p = ch === "email" ? "email" : "sms";
    patch[`${p}_opt_out_at`] = at;
    patch[`${p}_opt_out_source`] = "agent";
    patch[`${p}_opt_out_method`] = w.method;
    patch[`${p}_opt_out_note`] = w.note;
  }
  return patch;
}

/** The client_email_consents update that ends a record. */
export function withdrawalRowPatch(w: CheckedWithdrawal) {
  return { withdrawn_at: w.at, withdrawn_method: w.method, withdrawn_note: w.note };
}

// ── Inputs for consentStatus ────────────────────────────────────────────────

export interface DealRow extends ConsentDealInput {
  id?:        string | null;
  client_id?: string | null;
}

export interface CoPartyRow {
  client_record_id?: string | null;
  co_client_id?:     string | null;
}

/**
 * `records` plus one entry per co-buyer, crediting them the deal they were
 * named on (#278). A couple's deal is ONE client_records row held by one
 * spouse; the other bought the home too, so their implied consent runs from
 * the same close date. CONSENT ONLY: never feed this into GCI, repeat-client
 * or valuation math (#257: one client_records row per deal).
 */
export function creditCoBuyers<T extends DealRow>(records: readonly T[], coParties: readonly CoPartyRow[]): DealRow[] {
  const byId = new Map<string, DealRow>();
  for (const r of records) if (r.id) byId.set(r.id, r);
  const out: DealRow[] = [...records];
  for (const cp of coParties) {
    const deal = cp.client_record_id ? byId.get(cp.client_record_id) : undefined;
    if (!deal || !cp.co_client_id) continue;
    out.push({ client_id: cp.co_client_id, close_date: deal.close_date, condition_status: deal.condition_status });
  }
  return out;
}

export type ConsentInputs = Omit<ConsentStatusInput, "today" | "dayOf">;

/**
 * Per-client consentStatus inputs from rows already fetched for many
 * clients (Flight Control Scan and the nightly drafter, the newsletter
 * note). `deals` must include co-buyers (creditCoBuyers) and be unfiltered
 * by archive: a co-buyer's shared deal counts when the spouse holding it is
 * archived.
 */
export function consentInputsByClient(
  clients:  readonly ({ id: string } & { email_opt_out_at?: string | null; sms_opt_out_at?: string | null })[],
  deals:    readonly DealRow[],
  consents: readonly (ConsentRecordInput & { client_id?: string | null })[],
): Map<string, ConsentInputs> {
  type Mutable = { client: ConsentInputs["client"]; closedDeals: ConsentDealInput[]; consents: ConsentRecordInput[] };
  const out = new Map<string, Mutable>();
  for (const c of clients) {
    out.set(c.id, {
      client: { email_opt_out_at: c.email_opt_out_at ?? null, sms_opt_out_at: c.sms_opt_out_at ?? null },
      closedDeals: [],
      consents: [],
    });
  }
  for (const d of deals) {
    if (d.client_id && d.close_date) out.get(d.client_id)?.closedDeals.push(d);
  }
  for (const r of consents) {
    if (r.client_id) out.get(r.client_id)?.consents.push(r);
  }
  return out;
}
