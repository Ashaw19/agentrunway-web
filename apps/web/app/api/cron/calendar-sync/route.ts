/**
 * GET /api/cron/calendar-sync
 *
 * Bidirectional calendar sync for both Google and Outlook.
 *
 * Called by Vercel Cron (see vercel.json) every 15 minutes.
 * Protected by CRON_SECRET — unauthorized requests are rejected.
 *
 * Flow:
 *   1. Verify CRON_SECRET header
 *   2. Find all google_connections with calendar_sync_enabled = true → sync
 *   3. Find all email_connections (microsoft) with calendar_sync_enabled = true → sync
 *   4. Return summary
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncUserCalendar } from "@/lib/actions/calendar-actions";
import { syncUserOutlookCalendar } from "@/lib/actions/outlook-calendar-actions";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 min — enough for ~100 users

export async function GET(req: NextRequest) {
  // ── Auth ─────────────────────────────────────────────────────────────────
  const secret =
    req.headers.get("authorization")?.replace("Bearer ", "") ??
    req.headers.get("x-cron-secret");

  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // ── Google Calendar sync ──────────────────────────────────────────────────
  const { data: googleConns, error: gError } = await admin
    .from("google_connections")
    .select("user_id")
    .eq("calendar_sync_enabled", true);

  if (gError) {
    console.error("[calendar-sync cron] Failed to fetch Google connections:", gError);
  }

  // ── Outlook Calendar sync ─────────────────────────────────────────────────
  const { data: msConns, error: msError } = await admin
    .from("email_connections")
    .select("user_id")
    .eq("provider", "microsoft")
    .eq("calendar_sync_enabled", true);

  if (msError) {
    console.error("[calendar-sync cron] Failed to fetch Microsoft connections:", msError);
  }

  const allGoogle = googleConns ?? [];
  const allMs = msConns ?? [];

  if (allGoogle.length === 0 && allMs.length === 0) {
    return NextResponse.json({ ok: true, google_users: 0, outlook_users: 0, synced: 0, errors: 0 });
  }

  let totalSynced = 0;
  let totalErrors = 0;

  // ── Sync Google Calendar users (batches of 10) ────────────────────────────
  const BATCH = 10;
  for (let i = 0; i < allGoogle.length; i += BATCH) {
    const batch = allGoogle.slice(i, i + BATCH);
    const batchResults = await Promise.all(
      batch.map((c) =>
        syncUserCalendar(c.user_id).then((r) => r).catch(() => ({ synced: 0, errors: 1 }))
      )
    );
    for (const r of batchResults) {
      totalSynced += r.synced;
      totalErrors += r.errors;
    }
  }

  // ── Sync Outlook Calendar users (batches of 10) ───────────────────────────
  for (let i = 0; i < allMs.length; i += BATCH) {
    const batch = allMs.slice(i, i + BATCH);
    const batchResults = await Promise.all(
      batch.map((c) =>
        syncUserOutlookCalendar(c.user_id).then((r) => r).catch(() => ({ synced: 0, errors: 1 }))
      )
    );
    for (const r of batchResults) {
      totalSynced += r.synced;
      totalErrors += r.errors;
    }
  }

  console.log(
    `[calendar-sync] Done. Google: ${allGoogle.length}, Outlook: ${allMs.length}, Synced: ${totalSynced}, Errors: ${totalErrors}`
  );

  return NextResponse.json({
    ok: true,
    google_users:  allGoogle.length,
    outlook_users: allMs.length,
    synced: totalSynced,
    errors: totalErrors,
  });
}
