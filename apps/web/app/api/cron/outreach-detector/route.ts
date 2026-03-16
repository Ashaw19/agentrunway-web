/**
 * GET /api/cron/outreach-detector
 *
 * Vercel Cron endpoint — runs daily at 08:00 UTC (see vercel.json).
 * Protected by CRON_SECRET Bearer token.
 *
 * For each distinct user who has clients in the database it calls
 * detectAndDraftForUser() to queue AI-drafted outreach messages.
 *
 * Schedule: "0 8 * * *" — requires Vercel Pro.
 * If not on Pro, the "Scan Now" button in Flight Control handles detection
 * on demand via POST /api/ai/detect-opportunities.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient }          from "@/lib/supabase/admin";
import { detectAndDraftForUser }      from "@/app/api/ai/detect-opportunities/route";

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabaseAdmin = createAdminClient();

  // Get distinct user_ids from clients table (admin client bypasses RLS)
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

  console.log(`[cron/outreach-detector] Done — ${usersProcessed} users, ${totalDetected} opportunities detected`);
  return NextResponse.json({ usersProcessed, totalDetected });
}
