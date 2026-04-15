/**
 * POST /api/outreach/send
 *
 * Sends an outreach email from the queue after verifying:
 * 1. User authentication
 * 2. CASL consent (valid, not expired, not withdrawn)
 * 3. Warm-up limits (daily send capacity)
 * 4. Email provider availability (Gmail/Microsoft/SMTP)
 *
 * Body: { queue_item_id: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email-sender";
import { canSendEmail, recordSend } from "@/lib/email/warm-up";
import { checkRateLimit } from "@/lib/rate-limit";
import { markMemoryStale } from "@/lib/ai/client-memory-engine";
import { requirePro } from "@/lib/require-pro";

export async function POST(req: NextRequest) {
  // ── Auth ────────────────────────────────────────────────────────────────
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Pro gate ───────────────────────────────────────────────────────────
  const proCheck = await requirePro(supabase, user.id);
  if (!proCheck.allowed) return proCheck.response!;

  // ── Rate limit (50 sends per hour) ──────────────────────────────────────
  const rl = await checkRateLimit(user.id, "outreach-send", 50, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Send limit reached — try again later", code: "RATE_LIMITED" },
      { status: 429 },
    );
  }

  // ── Parse body ──────────────────────────────────────────────────────────
  let body: { queue_item_id?: string; outreach_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Accept both queue_item_id (new) and outreach_id (legacy) for compat
  const queueItemId = body.queue_item_id || body.outreach_id;

  if (!queueItemId) {
    return NextResponse.json(
      { error: "Missing queue_item_id" },
      { status: 400 },
    );
  }

  try {
    // ── 1. Fetch the outreach queue item ──────────────────────────────────
    const { data: item, error: itemErr } = await supabase
      .from("outreach_queue")
      .select("*, clients(id, email, name)")
      .eq("id", queueItemId)
      .eq("user_id", user.id)
      .eq("status", "ready")
      .single();

    if (itemErr || !item) {
      return NextResponse.json(
        { error: "Outreach item not found or not in ready status" },
        { status: 404 },
      );
    }

    // Belt-and-suspenders: explicit app-level ownership check.
    // The .eq("user_id", user.id) filter above already guarantees this; this
    // assertion ensures correctness survives any future query refactor.
    if (item.user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // ── 2. Verify client has an email ─────────────────────────────────────
    const toEmail = item.clients?.email?.trim();
    if (!toEmail) {
      return NextResponse.json(
        { error: "Client has no email address on file" },
        { status: 400 },
      );
    }

    // ── 3. CASL consent check ─────────────────────────────────────────────
    const now = new Date().toISOString();
    const { data: consent, error: consentErr } = await supabase
      .from("consent_records")
      .select("id")
      .eq("user_id", user.id)
      .eq("client_id", item.client_id)
      .is("withdrawn_at", null)
      .or(`expires_at.is.null,expires_at.gt.${now}`)
      .limit(1)
      .maybeSingle();

    if (consentErr || !consent) {
      return NextResponse.json(
        {
          error: "Cannot send — no valid CASL consent for this contact",
          code: "NO_CONSENT",
        },
        { status: 403 },
      );
    }

    // ── 4. Warm-up limit check ────────────────────────────────────────────
    const warmupCheck = await canSendEmail(user.id);
    if (!warmupCheck.allowed) {
      return NextResponse.json(
        {
          error: warmupCheck.reason,
          code: "WARMUP_LIMIT",
          remaining_today: 0,
          daily_limit: warmupCheck.dailyLimit,
        },
        { status: 429 },
      );
    }

    // ── 5. Send the email ─────────────────────────────────────────────────
    const subject = item.final_subject || item.ai_subject || "Hello";
    const messageBody = item.final_body || item.ai_body || "";

    const result = await sendEmail(supabase, user.id, {
      to: toEmail,
      subject,
      body: messageBody,
    });

    if (!result.ok) {
      // Mark as failed so the user can see what happened
      await supabase
        .from("outreach_queue")
        .update({ status: "failed" })
        .eq("id", queueItemId)
        .eq("user_id", user.id);

      const isNoConnection = result.error?.includes("No email provider");
      return NextResponse.json(
        {
          error: result.error ?? "Failed to send email",
          code: isNoConnection ? "NO_CONNECTION" : "SEND_FAILED",
          provider: result.provider,
        },
        { status: isNoConnection ? 422 : 500 },
      );
    }

    // ── 6. Record success ─────────────────────────────────────────────────
    await supabase
      .from("outreach_queue")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
      })
      .eq("id", queueItemId)
      .eq("user_id", user.id);

    // Track warm-up send (fire-and-forget)
    await recordSend(user.id);

    // Mark client memory as stale (fire-and-forget)
    if (item.client_id) {
      markMemoryStale(supabase, user.id, item.client_id).catch(() => {});
    }

    return NextResponse.json({
      sent: true,
      provider: result.provider,
      remaining_today: warmupCheck.remaining - 1,
    });
  } catch (err) {
    const rawMessage = err instanceof Error ? err.message : String(err);
    console.error("[outreach/send] Error:", rawMessage);

    // Try to mark as failed if we have the ID
    if (queueItemId) {
      try {
        await supabase
          .from("outreach_queue")
          .update({ status: "failed" })
          .eq("id", queueItemId)
          .eq("user_id", user.id);
      } catch {
        /* swallow — best-effort */
      }
    }

    const isAuthError =
      rawMessage.includes("401") || rawMessage.includes("invalid_grant");

    return NextResponse.json(
      {
        error: isAuthError
          ? "Email authentication expired — please reconnect your email provider"
          : "Failed to send email",
        code: isAuthError ? "AUTH_EXPIRED" : "SEND_FAILED",
      },
      { status: isAuthError ? 401 : 500 },
    );
  }
}
