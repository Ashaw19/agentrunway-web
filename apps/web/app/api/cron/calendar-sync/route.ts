/**
 * GET /api/cron/calendar-sync
 *
 * Incremental Google Calendar sync for all users with calendar_sync_enabled.
 *
 * Called by Vercel Cron (see vercel.json) every 15 minutes.
 * Protected by CRON_SECRET — unauthorized requests are rejected.
 *
 * Flow:
 *   1. Verify CRON_SECRET header
 *   2. Find all google_connections with calendar_sync_enabled = true
 *   3. Run syncUserCalendar() for each
 *   4. Return summary
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncUserCalendar } from "@/lib/actions/calendar-actions";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 min — enough for ~100 users

export async function GET(req: NextRequest) {
  // ── Auth ─────────────────────────────────────────────────────────────────
  const secret = req.headers.get("x-cron-secret") ??
    req.nextUrl.searchParams.get("secret");

  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // ── Find users with calendar sync enabled ─────────────────────────────────
  const { data: connections, error } = await admin
    .from("google_connections")
    .select("user_id")
    .eq("calendar_sync_enabled", true);

  if (error) {
    console.error("[calendar-sync cron] Failed to fetch connections:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!connections || connections.length === 0) {
    return NextResponse.json({ ok: true, users: 0, synced: 0, errors: 0 });
  }

  // ── Sync each user ────────────────────────────────────────────────────────
  let totalSynced = 0;
  let totalErrors = 0;
  const results: Array<{ userId: string; synced: number; errors: number }> = [];

  // Process in batches of 10 to avoid overwhelming the Calendar API
  const BATCH = 10;
  for (let i = 0; i < connections.length; i += BATCH) {
    const batch = connections.slice(i, i + BATCH);
    const batchResults = await Promise.all(
      batch.map((c) =>
        syncUserCalendar(c.user_id).then((r) => ({
          userId: c.user_id,
          ...r,
        }))
      )
    );

    for (const r of batchResults) {
      totalSynced += r.synced;
      totalErrors += r.errors;
      results.push(r);
    }
  }

  console.log(
    `[calendar-sync] Done. Users: ${connections.length}, Synced: ${totalSynced}, Errors: ${totalErrors}`
  );

  return NextResponse.json({
    ok: true,
    users:  connections.length,
    synced: totalSynced,
    errors: totalErrors,
  });
}
