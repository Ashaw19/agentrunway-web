/**
 * GET /api/cron/outreach-detector
 *
 * Vercel Cron endpoint — runs daily at 08:00 UTC (see vercel.json).
 * Protected by CRON_SECRET Bearer token.
 *
 * Responsibilities:
 *   - For each distinct user, call detectAndDraftForUser() to queue AI outreach.
 *
 * IMPORTANT — CASL COMPLIANCE:
 * This cron ONLY creates drafts in the outreach_queue. It NEVER sends
 * emails. Users must review and explicitly click "Send" for every message.
 *
 * Schedule: "0 8 * * *" — requires Vercel Pro.
 * If not on Pro, the "Scan Now" button in Flight Control handles detection
 * on demand via POST /api/ai/detect-opportunities.
 *
 * NOTE: The Landed→Cruising auto-transition (formerly here) was removed in
 * migration 00102 when the status model collapsed from 6 stages to 4.
 * "Landed" is no longer a status — clients transition straight to Cruising
 * on close.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient }          from "@/lib/supabase/admin";
import { detectAndDraftForUser }      from "@/app/api/ai/detect-opportunities/route";

// Allow up to 120 seconds — iterates over all active users with AI detection
export const maxDuration = 120;

// ── Route handler ──────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabaseAdmin = createAdminClient();

  // ── Outreach detection for all users ───────────────────────────────────────
  const { data: rows, error } = await supabaseAdmin
    .from("clients")
    .select("user_id")
    .order("user_id");

  if (error) {
    console.error("[cron/outreach-detector] Failed to fetch user list:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
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

  console.log(`[cron/outreach-detector] Done — ${usersProcessed} users, ${totalDetected} opportunities detected`);
  return NextResponse.json({ usersProcessed, totalDetected });
}
