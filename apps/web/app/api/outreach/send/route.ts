/**
 * POST /api/outreach/send
 *
 * Sends an outreach email via the user's connected Gmail account.
 * Expects: { outreach_id: string }
 *
 * Flow:
 *  1. Fetch the outreach queue item (must be owned by user)
 *  2. Fetch the user's Google connection
 *  3. Get a valid access token (auto-refresh if expired)
 *  4. Send via Gmail API
 *  5. Mark the outreach item as "sent"
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getValidAccessToken,
  encrypt,
  type GoogleConnection,
} from "@/lib/google/token-manager";
import { sendGmail } from "@/lib/google/gmail-client";

export async function POST(req: NextRequest) {
  // ── Auth ────────────────────────────────────────────────────────────────
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
    const messageBody = item.final_body || item.ai_body || "";

    // ── 2. Fetch Google connection ──────────────────────────────────────
    const { data: conn, error: connErr } = await supabase
      .from("google_connections")
      .select("id, access_token_enc, refresh_token_enc, expires_at, email_address, display_name, gmail_send_enabled")
      .eq("user_id", user.id)
      .single();

    if (connErr || !conn) {
      return NextResponse.json(
        {
          error: "No Gmail connection found",
          code: "NO_CONNECTION",
          message: "Connect your Gmail account in Settings to send directly.",
        },
        { status: 422 }
      );
    }

    if (!conn.gmail_send_enabled) {
      return NextResponse.json(
        {
          error: "Gmail send permission not granted",
          code: "NO_GMAIL_SCOPE",
          message: "Reconnect your Google account and grant Gmail send permission.",
        },
        { status: 403 }
      );
    }

    // ── 3. Get valid access token ───────────────────────────────────────
    const tokenResult = await getValidAccessToken(conn as GoogleConnection);

    // Persist refreshed token if it changed
    if (tokenResult.refreshed && tokenResult.newAccessTokenEnc) {
      await supabase
        .from("google_connections")
        .update({
          access_token_enc: tokenResult.newAccessTokenEnc,
          expires_at: tokenResult.newExpiresAt!.toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", conn.id);
    }

    // ── 4. Send via Gmail ───────────────────────────────────────────────
    // Append email signature if available
    const { data: settings } = await supabase
      .from("user_settings")
      .select("email_signature")
      .eq("user_id", user.id)
      .single();

    let fullBody = messageBody;
    if (settings?.email_signature) {
      fullBody += `\n\n${settings.email_signature}`;
    }

    const gmailMessageId = await sendGmail({
      accessToken: tokenResult.accessToken,
      to: toEmail,
      subject,
      body: fullBody,
      fromName: conn.display_name ?? undefined,
      fromEmail: conn.email_address,
    });

    // ── 5. Mark as sent ─────────────────────────────────────────────────
    await supabase
      .from("outreach_queue")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
      })
      .eq("id", outreachId)
      .eq("user_id", user.id);

    return NextResponse.json({
      ok: true,
      gmail_message_id: gmailMessageId,
    });
  } catch (err) {
    console.error("[outreach/send] Error:", err);

    // Check for auth errors so frontend can prompt reconnection
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
