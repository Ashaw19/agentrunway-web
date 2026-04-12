/**
 * POST /api/mobile/outreach/send
 *
 * Mobile-native outreach send endpoint.
 * Accepts Bearer token auth (Supabase access token) instead of cookies.
 * Delegates to the unified email sender (Gmail → Microsoft → SMTP).
 *
 * Expects: { outreach_id: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient }         from "@/lib/supabase/admin";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { sendEmail } from "@/lib/email-sender";
import { markMemoryStale } from "@/lib/ai/client-memory-engine";

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
      return new NextResponse("Too many requests. Please wait before sending more messages.", {
        status: 429,
        headers: rateLimitHeaders(rl),
      });
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

    // ── 3. Fetch the outreach item (only if not already sent) ──────────
    const { data: item, error: itemErr } = await admin
      .from("outreach_queue")
      .select("*, clients(email, name)")
      .eq("id", outreachId)
      .eq("user_id", user.id)
      .neq("status", "sent")
      .single();

    if (itemErr || !item) {
      return NextResponse.json(
        { ok: false, error: "Outreach item not found or already sent" },
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

    // ── 4. Send via unified email sender (Gmail → Microsoft → SMTP) ──────
    const result = await sendEmail(admin, user.id, {
      to: toEmail,
      subject,
      body: messageBody,
    });

    if (!result.ok) {
      const isNoProvider = result.error?.includes("No email provider");
      return NextResponse.json(
        {
          ok: false,
          error: result.error ?? "Failed to send email",
          code: isNoProvider ? "NO_CONNECTION" : "SEND_FAILED",
        },
        { status: isNoProvider ? 422 : 500 },
      );
    }

    // ── 5. Mark as sent ───────────────────────────────────────────────────
    await admin
      .from("outreach_queue")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
      })
      .eq("id", outreachId)
      .eq("user_id", user.id);

    // ── 6. Mark client memory as stale (fire-and-forget) ────────────────
    if (item.client_id) {
      markMemoryStale(admin, user.id, item.client_id).catch(() => {});
    }

    return NextResponse.json({
      ok: true,
      provider: result.provider,
    });
  } catch (err) {
    console.error("[mobile/outreach/send] Error:", err);

    const rawMessage = err instanceof Error ? err.message : String(err);
    const isAuthError =
      rawMessage.includes("401") || rawMessage.includes("invalid_grant");

    return NextResponse.json(
      {
        ok: false,
        error: isAuthError
          ? "Email authentication expired — please reconnect your email provider"
          : "Failed to send email",
        code: isAuthError ? "AUTH_EXPIRED" : "SEND_FAILED",
      },
      { status: isAuthError ? 401 : 500 },
    );
  }
}
