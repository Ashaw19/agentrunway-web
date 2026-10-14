/**
 * POST /api/mobile/outreach/texted
 *
 * Text queue (00179): the agent tapped Send in iOS Messages for a queued text
 * (the composer reported "sent"). Marks the outreach_queue row sent and logs
 * a "text" activity on the client, which moves last_contact_at forward via
 * the contact_activities trigger. One request, so the queue and the client's
 * history can't disagree about whether the text went out.
 *
 * Bearer token auth. Body: { outreach_id: string, body?: string } where body
 * is the text as sent (the agent may have edited it in Messages' composer
 * before sending; when absent, the queued text is used).
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { markMemoryStale } from "@/lib/ai/client-memory-engine";

/** contact_activities.description holds the text itself, capped. */
const DESCRIPTION_MAX = 1000;

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ ok: false, error: "Missing Authorization header" }, { status: 401 });
    }
    const admin = createAdminClient();
    const { data: { user }, error: authError } = await admin.auth.getUser(authHeader.slice(7));
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: "Invalid or expired token" }, { status: 401 });
    }

    const rl = await checkRateLimit(user.id, "outreach_texted", 120, 60);
    if (!rl.allowed) {
      return NextResponse.json({ ok: false, error: "Too many requests" }, { status: 429, headers: rateLimitHeaders(rl) });
    }

    const payload = (await req.json().catch(() => ({}))) as { outreach_id?: unknown; body?: unknown };
    const outreachId = typeof payload.outreach_id === "string" ? payload.outreach_id : null;
    if (!outreachId) {
      return NextResponse.json({ ok: false, error: "Missing outreach_id" }, { status: 400 });
    }

    const { data: item } = await admin
      .from("outreach_queue")
      .select("id, client_id, status, channel, ai_body, final_body")
      .eq("id", outreachId)
      .eq("user_id", user.id)
      .eq("channel", "sms")
      .maybeSingle();
    if (!item) {
      return NextResponse.json({ ok: false, error: "Text not found" }, { status: 404 });
    }
    if (item.status === "sent") {
      return NextResponse.json({ ok: true, already: true });
    }

    const sentText = (typeof payload.body === "string" && payload.body.trim()
      ? payload.body.trim()
      : ((item.final_body ?? item.ai_body ?? "") as string).trim());
    const sentAt = new Date().toISOString();

    const { data: updated, error: updateErr } = await admin
      .from("outreach_queue")
      .update({ status: "sent", sent_at: sentAt, final_body: sentText || null })
      .eq("id", item.id)
      .eq("user_id", user.id)
      .neq("status", "sent")
      .select("id");
    if (updateErr) {
      console.error("[texted] queue update failed:", updateErr);
      return NextResponse.json({ ok: false, error: "Couldn't mark the text as sent" }, { status: 500 });
    }
    if (!updated || updated.length === 0) {
      // Another request marked it first: that one logged the activity.
      return NextResponse.json({ ok: true, already: true });
    }

    if (item.client_id) {
      const { error: activityErr } = await admin.from("contact_activities").insert({
        user_id: user.id,
        client_id: item.client_id,
        type: "text",
        description: sentText.slice(0, DESCRIPTION_MAX),
        activity_date: sentAt,
      });
      if (activityErr) {
        // The text went out; say so, and leave the queue row as sent.
        console.error("[texted] activity insert failed:", activityErr);
        return NextResponse.json({ ok: true, logged: false });
      }
      markMemoryStale(admin, user.id, item.client_id as string).catch(() => {});
    }

    return NextResponse.json({ ok: true, logged: true });
  } catch (err) {
    console.error("[texted] unexpected error:", err);
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 });
  }
}
