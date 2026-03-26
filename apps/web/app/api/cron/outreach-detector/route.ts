/**
 * GET /api/cron/outreach-detector
 *
 * Vercel Cron endpoint — runs daily at 08:00 UTC (see vercel.json).
 * Protected by CRON_SECRET Bearer token.
 *
 * Responsibilities:
 *   1. Transition Landed → Cruising for clients 30+ days post-close (all users, once daily).
 *   2. For each distinct user, call detectAndDraftForUser() to queue AI outreach.
 *
 * Schedule: "0 8 * * *" — requires Vercel Pro.
 * If not on Pro, the "Scan Now" button in Flight Control handles detection
 * on demand via POST /api/ai/detect-opportunities.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient }          from "@/lib/supabase/admin";
import { detectAndDraftForUser }      from "@/app/api/ai/detect-opportunities/route";

// ── Landed → Cruising auto-transition ─────────────────────────────────────────
//
// Rules:
//   - Only clients with status = 'landed' are evaluated.
//   - The anchor date is the client's MOST RECENT close_date in client_records.
//   - If no close_date exists the client is left untouched (data entry gap — don't guess).
//   - If most_recent_close_date > 30 days ago → status = 'cruising'.
//   - A 'note' activity is logged so agents can see the automatic transition in the timeline.
//
async function transitionLandedClients(supabaseAdmin: SupabaseClient): Promise<number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const cutoffDate = cutoff.toISOString().slice(0, 10); // "YYYY-MM-DD"

  // Step 1: Get all landed clients across all users
  const { data: landedClients, error: lcErr } = await supabaseAdmin
    .from("clients")
    .select("id, user_id")
    .eq("status", "landed");

  if (lcErr || !landedClients?.length) return 0;

  const landedIds = landedClients.map((c: { id: string }) => c.id);

  // Step 2: Get the most recent close_date for each of those clients
  const { data: records, error: recErr } = await supabaseAdmin
    .from("client_records")
    .select("client_id, close_date")
    .in("client_id", landedIds)
    .not("close_date", "is", null);

  if (recErr || !records?.length) return 0;

  // Build map: client_id → most recent close_date
  const mostRecentClose = new Map<string, string>();
  for (const rec of records as { client_id: string; close_date: string }[]) {
    const existing = mostRecentClose.get(rec.client_id);
    if (!existing || rec.close_date > existing) {
      mostRecentClose.set(rec.client_id, rec.close_date);
    }
  }

  // Step 3: Filter to clients whose most recent close is older than 30 days
  const toTransition = landedClients.filter((c: { id: string; user_id: string }) => {
    const lastClose = mostRecentClose.get(c.id);
    return lastClose && lastClose <= cutoffDate;
  }) as { id: string; user_id: string }[];

  if (!toTransition.length) return 0;

  const ids = toTransition.map((c) => c.id);

  // Step 4: Update status to cruising
  const { error: updateErr } = await supabaseAdmin
    .from("clients")
    .update({ status: "cruising" })
    .in("id", ids);

  if (updateErr) {
    console.error("[cron/landed-transition] Update error:", updateErr);
    return 0;
  }

  // Step 5: Log an activity note on each client so the agent sees it in the timeline
  const today = new Date().toISOString().slice(0, 10);
  const activityRows = toTransition.map((c) => ({
    user_id:       c.user_id,
    client_id:     c.id,
    type:          "note",
    description:   "Status automatically moved from Landed to Cruising — 30 days post-close.",
    activity_date: today,
  }));

  await supabaseAdmin.from("contact_activities").insert(activityRows);

  console.log(`[cron/landed-transition] Transitioned ${ids.length} client(s) to Cruising`);
  return ids.length;
}

// Allow up to 120 seconds — iterates over all active users with AI detection
export const maxDuration = 120;

// ── Route handler ──────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabaseAdmin = createAdminClient();

  // ── 1. Landed → Cruising transitions (runs first, before outreach detection) ─
  let clientsTransitioned = 0;
  try {
    clientsTransitioned = await transitionLandedClients(supabaseAdmin);
  } catch (err) {
    console.error("[cron/landed-transition] Unexpected error:", err);
    // Non-fatal — continue with outreach detection
  }

  // ── 2. Outreach detection for all users ────────────────────────────────────
  const { data: rows, error } = await supabaseAdmin
    .from("clients")
    .select("user_id")
    .order("user_id");

  if (error) {
    console.error("[cron/outreach-detector] Failed to fetch user list:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Deduplicate user IDs
  const userIds = [...new Set((rows ?? []).map((r: { user_id: string }) => r.user_id))];

  let usersProcessed = 0;
  let totalDetected  = 0;

  for (const userId of userIds) {
    try {
      const { detected } = await detectAndDraftForUser(userId, supabaseAdmin);
      totalDetected += detected;
      usersProcessed++;
    } catch (err) {
      console.error("[cron/outreach-detector] Error for user", userId, err);
      // Continue processing remaining users
    }
  }

  console.log(`[cron/outreach-detector] Done — ${usersProcessed} users, ${totalDetected} opportunities detected, ${clientsTransitioned} clients transitioned to Cruising`);
  return NextResponse.json({ usersProcessed, totalDetected, clientsTransitioned });
}
