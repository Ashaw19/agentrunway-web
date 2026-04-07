/**
 * Resend → ParsedInboundEmail adapter.
 *
 * Resend inbound webhooks are intentionally metadata-only — the body, headers,
 * and attachment bytes live behind the Received Emails API. This file handles
 * both halves: parse the webhook event, then enrich it with the full email
 * body fetched via `resend.emails.receiving.get(email_id)`.
 */
import type { EmailReceivedEvent, GetReceivingEmailResponseSuccess } from "resend";
import {
  buildPreview,
  extractDisplayName,
  extractEmailAddress,
  parseReferences,
  type ParsedInboundEmail,
} from "./inbound-types";
import { resend } from "../resend";

/**
 * Parse a Resend `email.received` webhook event into a ParsedInboundEmail.
 *
 * The webhook delivers *metadata only*. If body/headers are needed (e.g. to
 * extract In-Reply-To for thread matching), call `enrichWithReceivingEmail()`
 * afterwards to pull the full email from Resend's Received Emails API.
 */
export function parseResendWebhook(
  event: EmailReceivedEvent,
  matchedRecipient: string,
): ParsedInboundEmail {
  const { data } = event;
  return {
    vendorEventId: data.email_id,
    messageId: data.message_id ?? null,
    inReplyTo: null,          // not in webhook payload — populated by enrich step
    references: [],           // not in webhook payload — populated by enrich step
    fromAddress: extractEmailAddress(data.from),
    fromName: extractDisplayName(data.from),
    toAddress: matchedRecipient.toLowerCase(),
    ccAddresses: (data.cc ?? []).map((c) => extractEmailAddress(c)),
    subject: data.subject || null,
    preview: null,            // populated by enrich step
    hasAttachments: (data.attachments?.length ?? 0) > 0,
    attachmentCount: data.attachments?.length ?? 0,
    attachmentSummary: (data.attachments ?? []).map((a) => ({
      id: a.id,
      filename: a.filename,
      content_type: a.content_type,
    })),
    receivedAt: data.created_at,
    rawWebhook: event,
  };
}

/**
 * Fetch the full inbound email from Resend's Received Emails API and merge
 * body/header-derived fields into the ParsedInboundEmail.
 *
 * Returns the input unchanged if the API call fails — the webhook handler
 * should still persist the metadata so we never drop an event.
 */
export async function enrichWithReceivingEmail(
  parsed: ParsedInboundEmail,
): Promise<ParsedInboundEmail> {
  if (!resend) return parsed;

  try {
    const res = await resend.emails.receiving.get(parsed.vendorEventId);
    const full = res.data as GetReceivingEmailResponseSuccess | null;
    if (!full) return parsed;

    // Header lookup is case-insensitive
    const headers = full.headers ?? {};
    const headerGet = (name: string): string | null => {
      const lower = name.toLowerCase();
      for (const [k, v] of Object.entries(headers)) {
        if (k.toLowerCase() === lower) return v;
      }
      return null;
    };

    const inReplyTo = headerGet("in-reply-to");
    const referencesRaw = headerGet("references");

    return {
      ...parsed,
      messageId: full.message_id ?? parsed.messageId,
      inReplyTo: inReplyTo ?? null,
      references: parseReferences(referencesRaw),
      preview: buildPreview(full.text, full.html),
    };
  } catch (err) {
    console.error("[resend-inbound] failed to fetch full email", {
      vendorEventId: parsed.vendorEventId,
      error: err instanceof Error ? err.message : String(err),
    });
    return parsed;
  }
}
