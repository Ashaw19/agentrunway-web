/**
 * POST /api/outreach/send
 *
 * Sends an outreach email via the user's connected email provider.
 * Supports Gmail, Outlook (Microsoft Graph), and SMTP.
 * Expects: { outreach_id: string }
 *
 * Flow:
 *  1. Fetch the outreach queue item (must be owned by user)
 *  2. Append email signature (if set)
 *  3. Route to the correct provider via email-sender.ts
 *  4. Mark the outreach item as "sent"
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email-sender";
import { checkRateLimit } from "@/lib/rate-limit";
import { markMemoryStale } from "@/lib/ai/client-memory-engine";

export async function POST(req: NextRequest) {
  // ── Auth ────────────────────────────────────────────────────────────────
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Rate limit (50 sends per hour) ──────────────────────────────────────
  const rl = await checkRateLimit(user.id, "outreach-send", 50, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Send limit reached — try again later", code: "RATE_LIMITED" },
      { status: 429 },
    );
  }

  // ── Sandbox guard ────────────────────────────────────────────────────────
  const { data: sandboxCheck } = await supabase.from("user_settings").select("sandbox_mode").eq("user_id", user.id).single();
  if (sandboxCheck?.sandbox_mode === true) {
    return NextResponse.json({ error: "Action blocked in Sandbox Mode" }, { status: 403 });
  }

  // ── Parse body ──────────────────────────────────────────────────────────
  const body = (await req.json()) as { outreach_id?: string };
  const outreachId = body.outreach_id;

  if (!outreachId) {
    return NextResponse.json(
      { error: "Missing outreach_id" },
      { status: 400 }
    );
  }

  try {
    // ── 1. Fetch the outreach item ──────────────────────────────────────
    const { data: item, error: itemErr } = await supabase
      .from("outreach_queue")
      .select("*, clients(email, name)")
      .eq("id", outreachId)
      .eq("user_id", user.id)
      .single();

    if (itemErr || !item) {
      return NextResponse.json(
        { error: "Outreach item not found" },
        { status: 404 }
      );
    }

    const toEmail = item.clients?.email?.trim();
    if (!toEmail) {
      return NextResponse.json(
        { error: "No email address on file for this client" },
        { status: 422 }
      );
    }

    // Use edited fields if present, fall back to AI-generated
    const subject = item.final_subject || item.ai_subject || "Hello";
    const messageBody  = item.final_body  || item.ai_body  || "";

    // Signature is already appended at draft time (detect-opportunities / draft-outreach).
    // Do NOT append again here to avoid duplication.

    // ── 2. Send via unified provider routing ─────────────────────────────
    const result = await sendEmail(supabase, user.id, {
      to: toEmail,
      subject,
      body: messageBody,
    });

    if (!result.ok) {
      const isNoConnection = result.error?.includes("No email provider");
      return NextResponse.json(
        {
          error: result.error ?? "Failed to send email",
          code: isNoConnection ? "NO_CONNECTION" : "SEND_FAILED",
          provider: result.provider,
        },
        { status: isNoConnection ? 422 : 500 }
      );
    }

    // ── 4. Mark as sent ─────────────────────────────────────────────────
    await supabase
      .from("outreach_queue")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
      })
      .eq("id", outreachId)
      .eq("user_id", user.id);

    // ── 5. Mark client memory as stale (fire-and-forget) ────────────────
    if (item.client_id) {
      markMemoryStale(supabase, user.id, item.client_id).catch(() => {});
    }

    return NextResponse.json({ ok: true, provider: result.provider });
  } catch (err) {
    console.error("[outreach/send] Error:", err);

    const message = err instanceof Error ? err.message : String(err);
    const isAuthError =
      message.includes("401") || message.includes("invalid_grant");

    return NextResponse.json(
      {
        error: "Failed to send email",
        message,
        code: isAuthError ? "AUTH_EXPIRED" : "SEND_FAILED",
      },
      { status: isAuthError ? 401 : 500 }
    );
  }
}
