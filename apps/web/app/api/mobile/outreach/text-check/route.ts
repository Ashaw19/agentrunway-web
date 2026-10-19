/**
 * POST /api/mobile/outreach/text-check
 *
 * Asked by the phone app right before iOS Messages opens with a queued text
 * (Flight Control → Texts). The text was drafted earlier; since then the
 * client may have unsubscribed from texts, their implied consent may have
 * lapsed, or they may have been archived. CASL consent is checked again here
 * (core consentStatus, sms channel) and a refused text is skipped, so it
 * can't be sent from the queue. Fails closed when consent can't be read.
 *
 * Body: { outreach_id: string }. Bearer token (phone) or cookie (web).
 * Returns { ok: true } or { ok: false, code, error } with the reason.
 */

import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabase/request-user";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { checkQueuedMessage } from "@/lib/crm/queued-message-check";

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await getRequestUser(req);
    if (!auth) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const rl = await checkRateLimit(auth.user.id, "outreach_text_check", 240, 60);
    if (!rl.allowed) {
      return NextResponse.json({ ok: false, error: "Too many requests" }, { status: 429, headers: rateLimitHeaders(rl) });
    }

    const payload = (await req.json().catch(() => ({}))) as { outreach_id?: unknown };
    const outreachId = typeof payload.outreach_id === "string" ? payload.outreach_id : null;
    if (!outreachId) return NextResponse.json({ ok: false, error: "Missing outreach_id" }, { status: 400 });

    const check = await checkQueuedMessage(auth.supabase, auth.user.id, outreachId, "sms");
    if (!check.ok) {
      return NextResponse.json({ ok: false, code: check.code, error: check.error }, { status: check.status });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[text-check] unexpected error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, code: "CONSENT_UNREADABLE", error: "Couldn't check consent. Try again." }, { status: 500 });
  }
}
