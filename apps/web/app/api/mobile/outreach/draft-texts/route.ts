/**
 * POST /api/mobile/outreach/draft-texts
 *
 * Text queue (00179): Flight Crew drafts one short text per chosen client and
 * queues each as a "ready" outreach_queue row (channel "sms"). The phone app
 * then opens iOS Messages prefilled for each one; the agent taps Send.
 *
 * Bearer token auth (Supabase access token). Pro feature, like every drafter.
 * Body: { client_ids: string[] (1–10), purpose: "check_in" | "market_update" | "custom", note?: string }
 * Returns: { results: DraftTextResult[] } in the order the ids were sent.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { requirePro } from "@/lib/require-pro";
import {
  type DraftTextResult,
  MAX_TEXT_DRAFTS_PER_REQUEST,
  draftTextForClient,
  isTextPurpose,
} from "@/lib/ai/draft-text";

export const maxDuration = 60;

/** Draft a few at a time: each is an AI call, and the request has 60 s. */
const CONCURRENCY = 4;

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Missing Authorization header" }, { status: 401 });
    }
    const admin = createAdminClient();
    const { data: { user }, error: authError } = await admin.auth.getUser(authHeader.slice(7));
    if (authError || !user) {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
    }

    const pro = await requirePro(admin, user.id);
    if (!pro.allowed) return pro.response!;

    const rl = await checkRateLimit(user.id, "draft_texts", 20, 60);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "You've drafted a lot of texts this hour. Please wait a bit and try again." },
        { status: 429, headers: rateLimitHeaders(rl) },
      );
    }

    const body = (await req.json().catch(() => ({}))) as { client_ids?: unknown; purpose?: unknown; note?: unknown };
    const ids = Array.isArray(body.client_ids)
      ? [...new Set(body.client_ids.filter((v): v is string => typeof v === "string" && v.length > 0))]
      : [];
    if (ids.length === 0) {
      return NextResponse.json({ error: "Choose at least one client." }, { status: 400 });
    }
    if (ids.length > MAX_TEXT_DRAFTS_PER_REQUEST) {
      return NextResponse.json(
        { error: `Choose up to ${MAX_TEXT_DRAFTS_PER_REQUEST} clients at a time.` },
        { status: 400 },
      );
    }
    if (!isTextPurpose(body.purpose)) {
      return NextResponse.json({ error: "purpose must be check_in, market_update or custom" }, { status: 400 });
    }
    const purpose = body.purpose;
    const note = typeof body.note === "string" ? body.note : null;
    if (purpose === "custom" && !note?.trim()) {
      return NextResponse.json({ error: "Write what you'd like to say." }, { status: 400 });
    }

    const results: DraftTextResult[] = new Array(ids.length);
    let next = 0;
    async function worker() {
      while (next < ids.length) {
        const i = next++;
        try {
          results[i] = await draftTextForClient({ supabase: admin, userId: user!.id, clientId: ids[i], purpose, note });
        } catch (err) {
          console.error("[draft-texts] draft failed:", err);
          results[i] = { status: "skipped", clientId: ids[i], clientName: "This client", reason: "Something went wrong drafting this text." };
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, ids.length) }, worker));

    return NextResponse.json({ results });
  } catch (err) {
    console.error("[draft-texts] unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
