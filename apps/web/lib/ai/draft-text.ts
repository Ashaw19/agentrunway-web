/**
 * Text queue drafter (00179). Flight Crew writes one short text per client;
 * the agent sends it from the phone app, where iOS Messages opens prefilled
 * and the agent taps Send. A draft is an outreach_queue row with channel
 * "sms", opportunity_type "text_message" and today's Atlantic date as the
 * trigger date, so a client has at most one text draft a day.
 *
 * Consent is the same core rule as the email drafters (consentStatus, via
 * lib/crm/consent-gate.ts), on the text channel: CASL treats a text like an
 * email. A client who unsubscribed from texts, or a past client whose
 * implied consent from a purchase has lapsed with no express text consent
 * on record, gets a "call instead" answer and nothing is written.
 *
 * purpose "consent_request" asks a past client to keep in touch before
 * their implied consent lapses (Flight Control's consent_lapsing). It only
 * drafts while implied consent still holds: the request is itself a
 * commercial message (CASL s.1(3)).
 */

import { generateText } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { models, aiCallHeaders } from "@/lib/ai/provider";
import {
  type Tone,
  type TextPurpose,
  AGENT_RUNWAY_VOICE,
  TEXT_PURPOSES,
  buildTextMessagePrompt,
} from "@/lib/outreach-prompts";
import { extractFirstName } from "@/lib/ai/draft-services";
import { excludeCollapsedDeals } from "@/lib/crm/contactable-records";
import {
  CONSENT_REQUEST_TEXT_LINE,
  consentBlockReason,
  consentRequestTextSignOff,
  consentRequestWindow,
  readClientConsent,
} from "@/lib/crm/consent-gate";
import { atlanticISODate, atlanticNoon } from "@agent-runway/core/lib/local-date";

export const TEXT_OPPORTUNITY_TYPE = "text_message" as const;

/** The longest message body the drafter keeps, before the sign-off. */
export const TEXT_BODY_MAX_CHARS = 300;

/** Appended to every text: CASL asks every commercial message for a way to opt out. */
export const TEXT_OPT_OUT_LINE = "Reply STOP to opt out.";

/** Most clients one request may draft for; each one is an AI call. */
export const MAX_TEXT_DRAFTS_PER_REQUEST = 10;

export type DraftTextStatus = "created" | "existing" | "call_only" | "skipped";

export interface DraftTextResult {
  status: DraftTextStatus;
  clientId: string;
  clientName: string;
  queueItemId?: string;
  body?: string;
  phone?: string;
  /** Why nothing was drafted (call_only / skipped), in plain words. */
  reason?: string;
}

export function isTextPurpose(v: unknown): v is TextPurpose {
  return typeof v === "string" && (TEXT_PURPOSES as readonly string[]).includes(v);
}

interface PhoneFields {
  phone?: string | null;
  phone_type?: string | null;
  secondary_phone?: string | null;
  secondary_phone_type?: string | null;
}

/**
 * The number a text goes to: the first mobile number (a number with no type
 * counts as mobile, the column's default), else the primary number. Returns
 * null when the client has no number with at least 10 digits.
 */
export function pickTextPhone(c: PhoneFields): string | null {
  const usable = (n: string | null | undefined) => (n && n.replace(/\D/g, "").length >= 10 ? n.trim() : null);
  const isMobile = (t: string | null | undefined) => !t || t.toLowerCase() === "mobile";
  const primary = usable(c.phone);
  const secondary = usable(c.secondary_phone);
  if (primary && isMobile(c.phone_type)) return primary;
  if (secondary && isMobile(c.secondary_phone_type)) return secondary;
  return primary ?? secondary;
}

/**
 * The model's text, made safe to send: quotes and labels stripped, no em or
 * en dashes (house style), no sign-off it added anyway, capped at
 * TEXT_BODY_MAX_CHARS on a sentence or word boundary. With a footer, the
 * agent's name (with brokerage when set) and the opt-out line follow, each on
 * its own line; with `signOff` null (the agent turned it off in Settings,
 * user_settings.text_footer) the message stands alone.
 */
export function finalizeTextBody(raw: string, signOff: string | null, agentFirst: string): string {
  let body = raw.trim()
    .replace(/^(message|text|sms)\s*:\s*/i, "")
    .replace(/^["'“”]+|["'“”]+$/g, "")
    .replace(/\s*[—–]\s*/g, ", ")
    .replace(/\s+/g, " ")
    .trim();
  // A sign-off the model added anyway ("- Andrew", "Talk soon, Andrew"):
  // the app adds the real one below.
  const first = agentFirst.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (first) {
    body = body
      .replace(new RegExp(`(?:[,.!]?\\s*(?:cheers|thanks|best|talk soon|take care)[,!.]?)?\\s*[-,]?\\s*${first}\\.?$`, "i"), "")
      .trim();
  }
  if (body.length > TEXT_BODY_MAX_CHARS) {
    const cut = body.slice(0, TEXT_BODY_MAX_CHARS);
    const sentenceEnd = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "));
    body = sentenceEnd > 80 ? cut.slice(0, sentenceEnd + 1) : `${cut.slice(0, cut.lastIndexOf(" "))}…`;
  }
  return withTextFooter(body, signOff);
}

/** The sign-off and opt-out line, each on its own line; none when the footer is off. */
export function withTextFooter(body: string, signOff: string | null): string {
  return signOff === null ? body : `${body}\n${signOff}\n${TEXT_OPT_OUT_LINE}`;
}

/**
 * The ask plus the code's own withdrawal statement, always (Regs s.4(e)),
 * whatever the model wrote. Only an exact copy of the line at the very end
 * is dropped first, so it never appears twice.
 */
export function withConsentLine(raw: string): string {
  let t = raw.trim();
  if (t.endsWith(CONSENT_REQUEST_TEXT_LINE)) t = t.slice(0, -CONSENT_REQUEST_TEXT_LINE.length).trim();
  return t ? `${t} ${CONSENT_REQUEST_TEXT_LINE}` : CONSENT_REQUEST_TEXT_LINE;
}

function monthsSince(iso: string | null | undefined, now: Date): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return Math.max(0, Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24 * 30)));
}

/**
 * Draft one text for one client and queue it as "ready". Ownership is checked
 * on every read (user_id), so a client id from another account finds nothing.
 */
export async function draftTextForClient(input: {
  supabase: SupabaseClient;
  userId: string;
  clientId: string;
  purpose: TextPurpose;
  note?: string | null;
}): Promise<DraftTextResult> {
  const { supabase, userId, clientId, purpose } = input;
  const note = input.note?.trim() ? input.note.trim().slice(0, 500) : null;

  const { data: client } = await supabase
    .from("clients")
    .select(
      "id, name, first_name, last_name, city, communication_tone, notes, tags, last_contact_at, phone, phone_type, secondary_phone, secondary_phone_type",
    )
    .eq("id", clientId)
    .eq("user_id", userId)
    .is("archived_at", null)
    .maybeSingle();

  if (!client) {
    return { status: "skipped", clientId, clientName: "This client", reason: "Client not found." };
  }

  const clientName =
    (client.name as string | null)?.trim() ||
    [client.first_name, client.last_name].filter(Boolean).join(" ").trim() ||
    "This client";

  // CASL (core consentStatus) on the text channel, on today's date. A failed
  // read drafts nothing.
  const consent = await readClientConsent(supabase, userId, clientId);
  if (!consent.ok) return { status: "skipped", clientId, clientName, reason: consent.reason };
  const blocked = consentBlockReason(consent.inputs, "sms", null, clientName);
  if (blocked) return { status: "call_only", clientId, clientName, reason: blocked };
  if (purpose === "consent_request") {
    const window = consentRequestWindow(consent.inputs, "sms", clientName);
    if (!window.ok) return { status: "call_only", clientId, clientName, reason: window.reason };
  }

  const phone = pickTextPhone(client as PhoneFields);
  if (!phone) {
    return { status: "skipped", clientId, clientName, reason: `No phone number on file for ${clientName}.` };
  }

  if (purpose === "custom" && !note) {
    return { status: "skipped", clientId, clientName, reason: "Write what you'd like to say first." };
  }

  const today = atlanticISODate();
  const [settingsRes, recordsRes] = await Promise.all([
    supabase
      .from("user_settings")
      .select("display_name, brokerage_name, ai_voice_guide, text_footer, email_signature, mailing_address, phone")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("client_records")
      .select("id, client_id, address, close_date, side, condition_status")
      .eq("client_id", clientId)
      .eq("user_id", userId)
      .not("close_date", "is", null)
      .order("close_date", { ascending: false }),
  ]);

  const records = excludeCollapsedDeals(recordsRes.data ?? []);

  const { data: existing } = await supabase
    .from("outreach_queue")
    .select("id, status, ai_body, final_body")
    .eq("user_id", userId)
    .eq("client_id", clientId)
    .eq("opportunity_type", TEXT_OPPORTUNITY_TYPE)
    .eq("trigger_date", today)
    .maybeSingle();
  if (existing && (existing.status === "ready" || existing.status === "sent")) {
    return {
      status: "existing", clientId, clientName, phone,
      queueItemId: existing.id as string,
      body: (existing.final_body ?? existing.ai_body ?? undefined) as string | undefined,
      reason: existing.status === "sent" ? `You already texted ${clientName} today.` : undefined,
    };
  }

  const aiKey = process.env.ANTHROPIC_API_KEY || process.env.GROQ_API_KEY;
  if (!aiKey) {
    return { status: "skipped", clientId, clientName, reason: "The AI service isn't configured." };
  }

  const settings = settingsRes.data as {
    display_name?: string | null;
    brokerage_name?: string | null;
    ai_voice_guide?: string | null;
    text_footer?: boolean | null;
    email_signature?: string | null;
    mailing_address?: string | null;
    phone?: string | null;
  } | null;
  const agentName = settings?.display_name?.trim() || "";
  const agentFirst = extractFirstName(agentName || null);
  const brokerage = settings?.brokerage_name?.trim() || "";
  // Off in Settings → no name, brokerage or opt-out line (00180). Missing
  // (an older row read before the column existed) keeps the footer.
  const footer = settings?.text_footer !== false;
  const signOff = !footer ? null : agentName ? (brokerage ? `${agentName}, ${brokerage}` : agentName) : agentFirst;
  // A consent request carries the sender's name and mailing address
  // (SOR/2012-36 s.2, s.4). With the footer off it isn't drafted as a text.
  const consentSignOff = purpose === "consent_request"
    ? consentRequestTextSignOff({
        displayName: agentName, brokerage, phone: settings?.phone, mailingAddress: settings?.mailing_address,
        emailSignature: settings?.email_signature, textFooter: footer,
      })
    : null;
  if (consentSignOff && !consentSignOff.ok) {
    return { status: "call_only", clientId, clientName, reason: consentSignOff.reason };
  }
  const clientFirst = (client.first_name as string | null)?.trim() || clientName.split(/\s+/)[0] || clientName;
  const latest = records[0] as { address?: string | null; close_date?: string | null; side?: string | null } | undefined;

  const prompt = buildTextMessagePrompt({
    agentFirst,
    clientFirst,
    purpose,
    note,
    tone: ((client.communication_tone as Tone | null) ?? "friendly"),
    city: (client.city as string | null) ?? null,
    lastDeal: latest ? { address: latest.address ?? null, closeDate: latest.close_date ?? null, side: latest.side ?? null } : null,
    monthsSinceContact: monthsSince(client.last_contact_at as string | null, atlanticNoon()),
  });
  const clientNotes = (client.notes as string | null)?.trim();
  const tags = (client.tags as string[] | null) ?? [];
  const fullPrompt = [
    prompt,
    AGENT_RUNWAY_VOICE,
    clientNotes || tags.length
      ? `Client context (use it to keep the tone right; never quote it back): ${[tags.length ? `tags: ${tags.join(", ")}` : null, clientNotes ? `notes: "${clientNotes}"` : null].filter(Boolean).join("; ")}. If it signals a sensitive situation, keep the text gentle and make no assumptions.`
      : null,
    settings?.ai_voice_guide
      ? `AGENT VOICE GUIDE (the text must sound like the agent wrote it):\n${settings.ai_voice_guide}`
      : null,
    "Reminder: this is a TEXT MESSAGE. The TEXT MESSAGE RULES above win over any email guidance.",
  ].filter(Boolean).join("\n\n");

  const headers = aiCallHeaders({ userId, feature: "draft-text" });
  let raw = "";
  try {
    const { text } = await generateText({ model: models.default, prompt: fullPrompt, maxOutputTokens: 200, temperature: 0.8, headers });
    raw = text.trim();
    if (!raw) throw new Error("Empty response");
  } catch (primaryErr) {
    console.warn("[draft-text] Primary model failed, using fallback:", primaryErr);
    try {
      const { text } = await generateText({ model: models.fallback, prompt: fullPrompt, maxOutputTokens: 200, temperature: 0.8, headers });
      raw = text.trim();
    } catch (fallbackErr) {
      console.error("[draft-text] Fallback model failed:", fallbackErr);
    }
  }
  if (!raw) {
    return { status: "skipped", clientId, clientName, reason: "Flight Crew couldn't write this text. Try again in a minute." };
  }

  // A consent request states that they can say no or change their mind
  // (Regs SOR/2012-36 s.4(e)): part of the ask, so it is there whatever the
  // footer setting.
  const body = consentSignOff?.ok
    ? withTextFooter(withConsentLine(finalizeTextBody(raw, null, agentFirst)), consentSignOff.footer)
    : finalizeTextBody(raw, signOff, agentFirst);
  const row = {
    user_id: userId,
    client_id: clientId,
    opportunity_type: TEXT_OPPORTUNITY_TYPE,
    channel: "sms",
    trigger_date: today,
    context: { purpose, note, phone },
    status: "ready",
    ai_subject: null,
    ai_body: body,
    final_body: null,
    sent_at: null,
  };
  const { data: saved, error } = await supabase
    .from("outreach_queue")
    .upsert(row, { onConflict: "user_id,client_id,opportunity_type,trigger_date", ignoreDuplicates: false })
    .select("id")
    .single();
  if (error || !saved) {
    console.error("[draft-text] Queue write failed:", error);
    return { status: "skipped", clientId, clientName, reason: "The text was written but couldn't be saved. Try again." };
  }

  return { status: "created", clientId, clientName, phone, queueItemId: saved.id as string, body };
}
