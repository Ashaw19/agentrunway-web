/**
 * GET /api/next-up[?persist=0][&draft=0]
 *
 * The phone dashboard's day: today's handful of clients (Flight Control's
 * picks, pinned per client), each card's CASL-checked text status, the
 * handful clients on Later, and the always-on-top counts. Built by
 * lib/crm/next-up-payload.ts; Flight Crew and the MCP server read the same
 * payload (they pass persist=0&draft=0).
 *
 *   persist=0  read only: the handful isn't synced (no pins written)
 *   draft=0    don't draft the handful's texts
 *
 * Otherwise, after the response, each draftable card gets its text drafted,
 * one at a time, through draftTextForClient (which checks consent again).
 * A draft is queued as "ready" for Andrew to send from Messages; nothing is
 * ever sent here. Drafting can't hold up or fail the response.
 *
 * Web session cookie or the phone's Bearer token (getRequestUser). Pro, the
 * same gate as the phone's other drafting route (/api/mobile/outreach/
 * draft-texts). 60 requests an hour.
 */

import { NextResponse, after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getRequestUser } from "@/lib/supabase/request-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePro } from "@/lib/require-pro";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { buildNextUpPayload } from "@/lib/crm/next-up-payload";
import { draftTextForClient } from "@/lib/ai/draft-text";
import { textPurposeFor } from "@agent-runway/core/lib/next-up/rules";
import type { HandfulItem } from "@agent-runway/core/lib/next-up/types";

export const maxDuration = 60;

export async function GET(req: Request): Promise<NextResponse> {
  try {
    const auth = await getRequestUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { user, supabase } = auth;

    const pro = await requirePro(createAdminClient(), user.id);
    if (!pro.allowed) return pro.response!;

    const rl = await checkRateLimit(user.id, "next_up", 60, 60);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Next up was refreshed a lot this hour. Try again in a few minutes." },
        { status: 429, headers: rateLimitHeaders(rl) },
      );
    }

    const params = new URL(req.url).searchParams;
    const persist = params.get("persist") !== "0";
    const draft = params.get("draft") !== "0";

    const payload = await buildNextUpPayload(user.id, supabase, { persist, now: new Date() });

    const toDraft = draft ? payload.handful.filter((h) => h.text.status === "draftable") : [];
    if (toDraft.length > 0) after(() => draftHandfulTexts(supabase, user.id, toDraft));

    return NextResponse.json(payload, { headers: rateLimitHeaders(rl) });
  } catch (err) {
    console.error("[next-up] unexpected error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * Draft each card's text, one at a time: each is an AI call. The card's
 * label (Flight Control's reason) is the drafter's note; source "next_up"
 * lets the handful skip the text if the client is handled before it's sent.
 * Never throws.
 */
async function draftHandfulTexts(supabase: SupabaseClient, userId: string, items: readonly HandfulItem[]): Promise<void> {
  for (const item of items) {
    try {
      await draftTextForClient({
        supabase,
        userId,
        clientId: item.client_id,
        purpose:  textPurposeFor(item.opportunity_type),
        note:     item.label,
        source:   "next_up",
      });
    } catch (err) {
      console.error("[next-up] text not drafted:", err instanceof Error ? err.message : err);
    }
  }
}
