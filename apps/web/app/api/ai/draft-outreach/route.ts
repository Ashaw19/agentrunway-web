/**
 * POST /api/ai/draft-outreach
 *
 * On-demand, single-client outreach drafting triggered from the CRM briefing
 * OR from the Flight Crew Dispatcher tool `draftOutreachForClient`.
 *
 * Accepts a { client_id, opportunity_type } pair, computes the appropriate
 * trigger_date and context, upserts an outreach_queue row, then immediately
 * calls Claude to draft the message. Returns the queue_item_id so the UI can
 * link directly to Flight Control.
 *
 * Status in response:
 *   "created"  — new item drafted and ready (201)
 *   "existing" — this opportunity was already drafted/sent; link returned (200)
 *   "queued"   — item created but Claude unavailable / errored; cron retries (202)
 *
 * Rate-limited to 20 calls/hour per user (endpoint key: "draft_outreach").
 *
 * Only the 7 briefing types that have genuine email value are accepted:
 *   birthday, closing_anniversary, mortgage_renewal_due,
 *   mortgage_renewal_window, past_client_check_in,
 *   timeframe_approaching, property_value_milestone
 *
 * Core drafting logic lives in @/lib/ai/draft-services. The Flight Crew
 * `draftOutreachForClient` tool calls the same service helper.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { requirePro } from "@/lib/require-pro";
import type { OutreachOpportunityType } from "@agent-runway/core/types/database";
import {
  DRAFTABLE_OUTREACH_TYPES,
  draftOutreachForClient,
} from "@/lib/ai/draft-services";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const proCheck = await requirePro(supabase, user.id);
  if (!proCheck.allowed) return proCheck.response!;

  // Rate limit: 20 on-demand drafts per hour
  const rl = await checkRateLimit(user.id, "draft_outreach", 20, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit reached. Try again in a few minutes." },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  // ── Parse and validate body ───────────────────────────────────────────────
  let body: { client_id?: string; opportunity_type?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { client_id, opportunity_type } = body;
  if (!client_id || !opportunity_type) {
    return NextResponse.json(
      { error: "client_id and opportunity_type are required" },
      { status: 400 },
    );
  }

  if (!DRAFTABLE_OUTREACH_TYPES.includes(opportunity_type as OutreachOpportunityType)) {
    return NextResponse.json(
      { error: "This opportunity type does not support on-demand drafting" },
      { status: 400 },
    );
  }

  // ── Delegate to shared service ────────────────────────────────────────────
  const result = await draftOutreachForClient({
    supabase,
    userId: user.id,
    clientId: client_id,
    opportunityType: opportunity_type as OutreachOpportunityType,
  });

  // Map service result → HTTP response shape (preserved for backwards compat
  // with the CRM briefing UI).
  if (result.status === "existing") {
    return NextResponse.json(
      { queue_item_id: result.queueItemId, status: "existing" },
      { headers: rateLimitHeaders(rl) },
    );
  }

  if (result.status === "queued") {
    if (result.reason && !result.queueItemId) {
      // Validation-style failure (no client found, no birthdate, etc.) —
      // surface as 400 so the UI can show a clear message.
      const isAuthIssue = result.reason === "Client not found or access denied";
      return NextResponse.json(
        { error: result.reason },
        { status: isAuthIssue ? 403 : 400 },
      );
    }
    // AI unavailable or transient draft failure — row is in queue, cron will retry
    return NextResponse.json(
      {
        queue_item_id: result.queueItemId,
        status: "queued",
        ...(result.error ? { error: result.error } : {}),
      },
      { status: 202, headers: rateLimitHeaders(rl) },
    );
  }

  return NextResponse.json(
    { queue_item_id: result.queueItemId, status: "created" },
    { status: 201, headers: rateLimitHeaders(rl) },
  );
}
