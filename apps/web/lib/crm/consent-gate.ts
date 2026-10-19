/**
 * The CASL consent check for one client, as every single-client drafter and
 * send path runs it (draftOutreachForClient, draftWorkflowMessage,
 * draftTextForClient, the email send routes, the consent request drafts).
 * Status: consentStatus() in packages/core/engines/casl-consent-engine.ts.
 * Bulk surfaces (Flight Control Scan, the nightly drafter, the newsletter
 * note) build the same inputs with consentInputsFor in ./outreach-consent.ts.
 *
 * Also the consent request's fixed text (s.6(2) identification and
 * unsubscribe, Regs SOR/2012-36 s.4(e) "can withdraw their consent"), which
 * the code appends so a model can never leave it out.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  consentLapsingPhase,
  consentRefusalReason,
  type ConsentChannel,
  type ConsentLapsingPhase,
  type ConsentStatus,
} from "@agent-runway/core/engines/casl-consent-engine";
import type { ConsentInputs } from "@agent-runway/core/lib/consent-ledger";
import { loadClientConsent } from "@agent-runway/core/lib/consent-writes";
import { atlanticISODate } from "@agent-runway/core/lib/local-date";
import { consentOnSendDay } from "@/lib/crm/outreach-consent";

export const CONSENT_READ_FAILED =
  "Agent Runway couldn't read their consent record, so nothing was drafted. Try again in a moment.";

export type ClientConsentRead =
  | { ok: true; inputs: ConsentInputs }
  | { ok: false; reason: string; notFound: boolean };

/** Load one client's consent inputs. Fails closed: a read error drafts nothing. */
export async function readClientConsent(
  supabase: SupabaseClient,
  userId:   string,
  clientId: string,
): Promise<ClientConsentRead> {
  try {
    const data = await loadClientConsent(supabase, userId, clientId);
    if (!data) return { ok: false, reason: "Client not found or access denied", notFound: true };
    return { ok: true, inputs: data.inputs };
  } catch (err) {
    console.error("[consent-gate] consent read failed:", err instanceof Error ? err.message : err);
    return { ok: false, reason: CONSENT_READ_FAILED, notFound: false };
  }
}

/**
 * Null when a message on `channel` for `triggerDate` may be drafted; else
 * the call-only reason to show the agent.
 */
export function consentBlockReason(
  inputs:      ConsentInputs,
  channel:     ConsentChannel,
  triggerDate: string | null | undefined,
  clientName:  string,
  today:       string = atlanticISODate(),
): string | null {
  const ch = consentOnSendDay(inputs, triggerDate, today)[channel];
  return ch.canMessage ? null : consentRefusalReason(ch, clientName);
}

/**
 * For a message already drafted and about to go out: refused if consent
 * doesn't cover it today OR on its send day (the later of its trigger date
 * and today). Null when both allow it.
 */
export function consentBlockReasonNowAndOnSendDay(
  inputs:      ConsentInputs,
  channel:     ConsentChannel,
  triggerDate: string | null | undefined,
  clientName:  string,
  today:       string = atlanticISODate(),
): string | null {
  return consentBlockReason(inputs, channel, null, clientName, today)
    ?? consentBlockReason(inputs, channel, triggerDate, clientName, today);
}

/** The status on the send day (for callers that need more than a yes/no). */
export function consentAt(inputs: ConsentInputs, triggerDate: string | null | undefined, today: string = atlanticISODate()): ConsentStatus {
  return consentOnSendDay(inputs, triggerDate, today);
}

/**
 * Where a consent request stands for this client today, or why there isn't
 * one: only a past client whose implied consent from a purchase still holds
 * can be asked by message (a request is itself a CEM, s.1(3)).
 */
export function consentRequestWindow(
  inputs:     ConsentInputs,
  channel:    ConsentChannel,
  clientName: string,
  today:      string = atlanticISODate(),
): { ok: true; phase: ConsentLapsingPhase } | { ok: false; reason: string } {
  const ch = consentOnSendDay(inputs, today, today)[channel];
  const noun = channel === "sms" ? "a text" : "an email";
  if (ch.state === "express") {
    return { ok: false, reason: `${clientName} already gave you express consent, so there's nothing to ask.` };
  }
  if (!ch.canMessage) return { ok: false, reason: consentRefusalReason(ch, clientName) };
  if (ch.state !== "implied" || ch.basis !== "purchase" || !ch.lapsesOn) {
    return {
      ok: false,
      reason: `${clientName} has no closed deal on record, so Agent Runway can't tell what their consent rests on and won't draft ${noun} asking for it. Asking in person or on a call works, and you can record their answer in the Consent section of their profile.`,
    };
  }
  const phase = consentLapsingPhase(ch, today) ?? {
    phase: "ask" as const,
    lapsesOn: ch.lapsesOn,
    triggerDate: ch.impliedUntil ?? ch.lapsesOn,
    daysLeft: ch.daysLeft,
  };
  return { ok: true, phase };
}

// ── The consent request's fixed text ───────────────────────────────────────

/** Appended to every consent request: Regs s.4(e) and the s.6(2)(c) unsubscribe. */
export const CONSENT_REQUEST_EMAIL_LINE =
  'You can say no, and if you say yes you can change your mind at any time. To stop getting emails from me, reply "unsubscribe" and I\'ll stop.';

/** The text version: the withdrawal statement is part of the ask itself. */
export const CONSENT_REQUEST_TEXT_LINE = "You can say no, or change your mind any time.";

/** A Canadian postal code: how Agent Runway tells a mailing address is in a signature. */
const POSTAL_CODE = /\b[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z][ -]?\d[ABCEGHJ-NPRSTV-Z]\d\b/i;
const HAS_PHONE = /(?:\d[\s().+-]*){10}/;
const HAS_EMAIL = /[^\s@]+@[^\s@]+\.[a-z]{2,}/i;
const HAS_WEB = /\bhttps?:\/\/\S+|\bwww\.\S+|\b[a-z0-9-]+\.(?:ca|com|net|org|realtor)\b/i;

/** The settings a consent request's sender identification is built from. */
export interface ConsentSender {
  emailSignature?: string | null;
  displayName?:    string | null;
  brokerage?:      string | null;
  phone?:          string | null;
  /** user_settings.mailing_address (00183). */
  mailingAddress?: string | null;
}

/** A user_settings row (any subset of its columns) as a ConsentSender. */
export function senderFromSettings(row: Record<string, unknown> | null | undefined): ConsentSender {
  const str = (v: unknown) => (typeof v === "string" ? v : null);
  return {
    emailSignature: str(row?.email_signature),
    displayName:    str(row?.display_name),
    brokerage:      str(row?.brokerage_name),
    phone:          str(row?.phone),
    mailingAddress: str(row?.mailing_address),
  };
}

/** What a consent request is missing: the card's short label reads off this. */
export type ConsentSenderGap = "name" | "address" | "contact";

export type ConsentRequestFooter =
  | { ok: true; footer: string }
  | { ok: false; reason: string; missing: ConsentSenderGap | "text_footer" };

/** The short label for a missing piece of sender identification. */
export const CONSENT_SENDER_GAP_LABEL: Record<ConsentSenderGap, string> = {
  name:    "Needs your name",
  address: "Needs your mailing address",
  contact: "Needs your phone, email or website",
};

const NEEDS_ADDRESS =
  "CASL's regulations (SOR/2012-36, s.2 and s.4) have a consent request carry your mailing address and a phone number, email or website, and Agent Runway doesn't have your mailing address. Add it in Flight Control, under Email Signature (Mailing address), then draft again.";
const NEEDS_CONTACT =
  "CASL's regulations (SOR/2012-36, s.2 and s.4) have a consent request carry a phone number, email or website along with your mailing address. Add one to your email signature, or your phone number in Settings, then draft again.";
const NEEDS_NAME =
  "A consent request carries your name (CASL's regulations, SOR/2012-36, s.4). Add your name in Settings or an email signature, then draft again.";

/**
 * The email consent request's closing block, or why Agent Runway won't
 * draft one. The signature is the existing footer; the mailing address from
 * Settings is added when the signature has no postal code; the phone from
 * Settings when the signature has no phone, email or website. Then the
 * withdrawal and unsubscribe line. An ask never goes out without the
 * sender's name, mailing address and a way to reach them.
 */
export function consentRequestEmailFooter(sender: ConsentSender): ConsentRequestFooter {
  const signature = sender.emailSignature?.trim() ?? "";
  const nameLine = [sender.displayName?.trim(), sender.brokerage?.trim()].filter(Boolean).join(", ");
  const address = sender.mailingAddress?.trim() ?? "";
  const phone = sender.phone?.trim() ?? "";
  if (!signature && !nameLine) return { ok: false, reason: NEEDS_NAME, missing: "name" };
  const signatureHasAddress = POSTAL_CODE.test(signature);
  if (!signatureHasAddress && !address) return { ok: false, reason: NEEDS_ADDRESS, missing: "address" };
  const signatureHasContact = HAS_PHONE.test(signature) || HAS_EMAIL.test(signature) || HAS_WEB.test(signature);
  if (!signatureHasContact && !phone) return { ok: false, reason: NEEDS_CONTACT, missing: "contact" };
  const lines = [
    signature || nameLine,
    signatureHasAddress ? null : address,
    signatureHasContact ? null : phone,
  ].filter(Boolean);
  return { ok: true, footer: `${lines.join("\n")}\n\n${CONSENT_REQUEST_EMAIL_LINE}` };
}

/**
 * A text consent request's sign-off, or why Agent Runway won't draft one.
 * Texts don't carry the email signature, so the name and the mailing
 * address come from Settings (or the signature's postal-code line). With the
 * text footer off (the agent's choice, respected) a consent request would go
 * out with no sender identification, so it isn't drafted as a text at all.
 */
export function consentRequestTextSignOff(sender: ConsentSender & { textFooter: boolean }): ConsentRequestFooter {
  const name = [sender.displayName?.trim(), sender.brokerage?.trim()].filter(Boolean).join(", ");
  if (!sender.textFooter) {
    return {
      ok: false,
      missing: "text_footer",
      reason: "Your texts go out without your name and opt-out line (your setting), and a consent request carries your name and mailing address (CASL's regulations, SOR/2012-36, s.2 and s.4), so Agent Runway won't draft this ask as a text. The email ask in Flight Control, or a call, works instead.",
    };
  }
  if (!name) return { ok: false, reason: NEEDS_NAME, missing: "name" };
  const addressLine = sender.mailingAddress?.trim()
    || (sender.emailSignature ?? "").split("\n").map((l) => l.trim()).find((l) => POSTAL_CODE.test(l))
    || "";
  if (!addressLine) return { ok: false, reason: NEEDS_ADDRESS, missing: "address" };
  const phone = sender.phone?.trim();
  return { ok: true, footer: [name, addressLine, phone].filter(Boolean).join("\n") };
}
