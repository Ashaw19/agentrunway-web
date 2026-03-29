/**
 * GET /api/cron/auto-transition
 *
 * Backup Vercel Cron trigger for the Landed -> Cruising auto-transition.
 * The primary schedule runs via pg_cron inside Supabase at 03:00 UTC daily.
 * This endpoint provides a redundant trigger and returns the count of
 * transitioned clients for monitoring.
 *
 * Schedule: "0 3 * * *" (see vercel.json)
 * Protected by CRON_SECRET Bearer token.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  // ── Auth ─────────────────────────────────────────────────────────────────
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }

  const provided =
    req.headers.get("authorization")?.replace("Bearer ", "") ??
    req.headers.get("x-cron-secret") ??
    req.nextUrl.searchParams.get("secret");

  if (provided !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Call the Supabase RPC function ───────────────────────────────────────
  const admin = createAdminClient();

  const { data, error } = await admin.rpc("fn_auto_transition_landed_to_cruising");

  if (error) {
    console.error("[auto-transition cron] RPC error:", error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 },
    );
  }

  const transitioned = typeof data === "number" ? data : 0;

  console.log(`[auto-transition] Transitioned ${transitioned} clients from Landed to Cruising`);

  return NextResponse.json({
    ok: true,
    transitioned,
    timestamp: new Date().toISOString(),
  });
}
