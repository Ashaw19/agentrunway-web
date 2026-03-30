/**
 * POST /api/mobile/outreach/send
 *
 * Mobile-native outreach send endpoint.
 * Accepts Bearer token auth (Supabase access token) instead of cookies.
 * Delegates to the same Gmail send logic as the web endpoint.
 *
 * Expects: { outreach_id: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient }         from "@/lib/supabase/admin";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import {
  getValidAccessToken,
  encrypt,
  type GoogleConnection,
} from "@/lib/google/token-manager";
import { sendGmail } from "@/lib/google/gmail-client";

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    // ── 1. Authenticate via Bearer token ──────────────────────────────────
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { ok: false, error: "Missing Authorization header" },
        { status: 401 },
      );
    }

    const accessToken = authHeader.slice(7);
    const admin = createAdminClient();

    const { data: { user }, error: authError } = await admin.auth.getUser(accessToken);

    if (authError || !user) {
      return NextResponse.json(
        { ok: false, error: "Invalid or expired token" },
        { status: 401 },
      );
    }

    const rl = await checkRateLimit(user.id, "outreach_send", 50, 60);
    if (!rl.allowed) {
      return new Response("Too many requests. Please wait before sending more messages.", {
        status: 429,
        headers: rateLimitHeaders(rl),
      });
    }

    // ── Sandbox guard ───────────────────────────────────────────────────────
    const { data: sandboxCheck } = await admin.from("user_settings").select("sandbox_mode").eq("user_id", user.id).single();
    if (sandboxCheck?.sandbox_mode === true) {
      return NextResponse.json({ ok: false, error: "Action blocked in Sandbox Mode" }, { status: 403 });
    }

    // ── 2. Parse body ─────────────────────────────────────────────────────
    const body = (await req.json()) as { outreach_id?: string };
    const outreachId = body.outreach_id;

    if (!outreachId) {
      return NextResponse.json(
        { ok: false, error: "Missing outreach_id" },
        { status: 400 },
      );
    }

    // ── 3. Fetch the outreach item ────────────────────────────────────────
    const { data: item, error: itemErr } = await admin
      .from("outreach_queue")
      .select("*, clients(email, name)")
      .eq("id", outreachId)
      .eq("user_id", user.id)
      .single();

    if (itemErr || !item) {
      return NextResponse.json(
        { ok: false, error: "Outreach item not found" },
        { status: 404 },
      );
    }

    const toEmail = item.clients?.email?.trim();
    if (!toEmail) {
      return NextResponse.json(
        { ok: false, error: "No email address on file for this client" },
        { status: 422 },
      );
    }

    const subject = item.final_subject || item.ai_subject || "Hello";
    const messageBody = item.final_body || item.ai_body || "";

    // ── 4. Fetch Google connection ────────────────────────────────────────
    const { data: conn, error: connErr } = await admin
      .from("google_connections")
      .select(
        "id, access_token_enc, refresh_token_enc, expires_at, email_address, display_name, gmail_send_enabled"
      )
      .eq("user_id", user.id)
      .single();

    if (connErr || !conn) {
      return NextResponse.json(
        {
          ok: false,
          error: "No Gmail connection found",
          code: "NO_CONNECTION",
        },
        { status: 422 },
      );
    }

    if (!conn.gmail_send_enabled) {
      return NextResponse.json(
        {
          ok: false,
          error: "Gmail send permission not granted",
          code: "NO_GMAIL_SCOPE",
        },
        { status: 403 },
      );
    }

    // ── 5. Get valid access token ─────────────────────────────────────────
    const tokenResult = await getValidAccessToken(conn as GoogleConnection);

    if (tokenResult.refreshed && tokenResult.newAccessTokenEnc) {
      await admin
        .from("google_connections")
        .update({
          access_token_enc: tokenResult.newAccessTokenEnc,
          expires_at: tokenResult.newExpiresAt!.toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", conn.id);
    }

    // Signature is already appended at draft time — do NOT append again here.
    const fullBody = messageBody;

    // ── 7. Send via Gmail ─────────────────────────────────────────────────
    const gmailMessageId = await sendGmail({
      accessToken: tokenResult.accessToken,
      to: toEmail,
      subject,
      body: fullBody,
      fromName: conn.display_name ?? undefined,
      fromEmail: conn.email_address,
    });

    // ── 8. Mark as sent ───────────────────────────────────────────────────
    await admin
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
    console.error("[mobile/outreach/send] Error:", err);

    const message = err instanceof Error ? err.message : String(err);
    const isAuthError =
      message.includes("401") || message.includes("invalid_grant");

    return NextResponse.json(
      {
        ok: false,
        error: "Failed to send email",
        message,
        code: isAuthError ? "AUTH_EXPIRED" : "SEND_FAILED",
      },
      { status: isAuthError ? 401 : 500 },
    );
  }
}
