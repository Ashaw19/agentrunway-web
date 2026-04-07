/**
 * Resend Inbound Webhook
 *
 * POST /api/email/inbound/resend
 *
 * Receives `email.received` events from Resend's inbound domain
 * (`inbox.agentrunway.ca`). The webhook is signed using Svix — we verify the
 * signature via `resend.webhooks.verify()` before trusting anything.
 *
 * Flow per event:
 *   1. Svix-verify the raw body + headers against RESEND_WEBHOOK_SECRET
 *   2. Skip anything that isn't type === 'email.received'
 *   3. Find the recipient address on our inbound domain → extract alias token
 *   4. Resolve alias → user_id via the `resolve_inbound_alias` RPC (SECURITY DEFINER)
 *   5. Normalise the event into our vendor-agnostic ParsedInboundEmail shape
 *   6. Enrich with body + In-Reply-To/References headers via Received Emails API
 *   7. Run reply detection to link the email to a client + sent outreach
 *   8. Upsert into `inbound_emails` (idempotent on resend_email_id)
 *   9. If matched to a client:
 *        - Log a `reply` contact_activity (+15 engagement points via engine)
 *        - Pause any active nurture_sequences for that client
 *  10. Return 200 OK
 *
 * We always return 200 unless the signature itself fails verification. Any
 * downstream error is logged but the event is still marked delivered so
 * Resend doesn't retry storms over a transient DB hiccup — the raw webhook
 * payload is persisted in `inbound_emails.raw_webhook` for replay.
 */
import { NextResponse, type NextRequest } from "next/server";
import { resend } from "@/lib/resend";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  extractInboundAlias,
  findInboundRecipient,
  type ParsedInboundEmail,
} from "@/lib/email/inbound-types";
import {
  parseResendWebhook,
  enrichWithReceivingEmail,
} from "@/lib/email/resend-inbound";
import {
  matchInboundToOutreach,
  pauseActiveNurtureForClient,
  logReplyActivity,
} from "@/lib/outreach/reply-detector";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // ── 1. Guard: SDK + secret must be configured ───────────────────────────
  if (!resend) {
    console.error("[inbound-webhook] Resend SDK not initialised");
    return NextResponse.json({ error: "email service not configured" }, { status: 503 });
  }
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[inbound-webhook] RESEND_WEBHOOK_SECRET not set");
    return NextResponse.json({ error: "webhook not configured" }, { status: 503 });
  }

  // ── 2. Extract Svix signature headers ───────────────────────────────────
  const svixId = req.headers.get("svix-id");
  const svixTimestamp = req.headers.get("svix-timestamp");
  const svixSignature = req.headers.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: "missing signature headers" }, { status: 400 });
  }

  // ── 3. Read raw body (must be the untouched string for signature check) ─
  const rawBody = await req.text();

  // ── 4. Verify signature ─────────────────────────────────────────────────
  let event;
  try {
    event = resend.webhooks.verify({
      payload: rawBody,
      headers: {
        id: svixId,
        timestamp: svixTimestamp,
        signature: svixSignature,
      },
      webhookSecret,
    });
  } catch (err) {
    console.warn("[inbound-webhook] signature verification failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  // ── 5. Only handle email.received; ack everything else ──────────────────
  if (event.type !== "email.received") {
    return NextResponse.json({ ok: true, ignored: event.type });
  }

  // ── 6. Find the recipient on our inbound domain ─────────────────────────
  const allRecipients = [
    ...(event.data.to ?? []),
    ...(event.data.cc ?? []),
    ...(event.data.bcc ?? []),
  ];
  const matchedRecipient = findInboundRecipient(allRecipients);
  if (!matchedRecipient) {
    console.warn("[inbound-webhook] no matching inbound recipient", {
      to: event.data.to,
      emailId: event.data.email_id,
    });
    return NextResponse.json({ ok: true, ignored: "no-match" });
  }

  const alias = extractInboundAlias(matchedRecipient);
  if (!alias) {
    return NextResponse.json({ ok: true, ignored: "no-alias" });
  }

  // ── 7. Resolve alias → user_id via SECURITY DEFINER RPC ─────────────────
  const admin = createAdminClient();
  const { data: userIdData, error: rpcErr } = await admin.rpc(
    "resolve_inbound_alias",
    { alias_token: alias },
  );
  if (rpcErr || !userIdData) {
    console.warn("[inbound-webhook] unknown inbound alias", {
      alias,
      error: rpcErr?.message,
    });
    // Return 200 so Resend doesn't retry — the alias doesn't exist, retrying
    // won't help.
    return NextResponse.json({ ok: true, ignored: "unknown-alias" });
  }
  const userId = userIdData as string;

  // ── 8. Parse + enrich ───────────────────────────────────────────────────
  let parsed: ParsedInboundEmail = parseResendWebhook(event, matchedRecipient);
  parsed = await enrichWithReceivingEmail(parsed);

  // ── 9. Reply detection (client + outreach linking) ──────────────────────
  const match = await matchInboundToOutreach(admin, userId, parsed);

  // ── 10. Upsert inbound_emails (idempotent on resend_email_id) ───────────
  const { error: insertErr } = await admin
    .from("inbound_emails")
    .upsert(
      {
        user_id: userId,
        resend_email_id: parsed.vendorEventId,
        message_id: parsed.messageId,
        in_reply_to: parsed.inReplyTo,
        email_references: parsed.references,
        from_address: parsed.fromAddress,
        from_name: parsed.fromName,
        to_address: parsed.toAddress,
        cc_addresses: parsed.ccAddresses,
        subject: parsed.subject,
        preview: parsed.preview,
        has_attachments: parsed.hasAttachments,
        attachment_count: parsed.attachmentCount,
        attachment_summary: parsed.attachmentSummary,
        status: match.clientId ? "linked" : "unresolved",
        client_id: match.clientId,
        matched_outreach_id: match.outreachId,
        raw_webhook: parsed.rawWebhook as object,
        received_at: parsed.receivedAt,
      },
      { onConflict: "resend_email_id", ignoreDuplicates: true },
    );

  if (insertErr) {
    console.error("[inbound-webhook] failed to upsert inbound_email", {
      userId,
      emailId: parsed.vendorEventId,
      error: insertErr.message,
    });
    // Still return 200 — the signature was valid, retrying won't fix a schema
    // or constraint bug. Surface via logs instead.
    return NextResponse.json({ ok: true, persisted: false });
  }

  // ── 11. Side effects when we know the client ───────────────────────────
  if (match.clientId) {
    // Log the reply activity — feeds engagement engine (+15, 30-day half-life)
    await logReplyActivity(admin, userId, match.clientId, parsed.subject);
    // Pause active nurture sequences so we stop drip-sending to an engaged client
    const paused = await pauseActiveNurtureForClient(admin, userId, match.clientId);
    if (paused > 0) {
      console.info("[inbound-webhook] paused nurture sequences", {
        userId,
        clientId: match.clientId,
        paused,
      });
    }
  }

  return NextResponse.json({
    ok: true,
    linked: Boolean(match.clientId),
    matchedOutreach: Boolean(match.outreachId),
  });
}
