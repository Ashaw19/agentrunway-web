/**
 * GET /api/cron/auto-transition
 *
 * Deprecated in migration 00102 when the client-status model collapsed from
 * 6 stages to 4. "Landed" is no longer a status — clients transition straight
 * to Cruising on close, so there is nothing to auto-transition.
 *
 * This endpoint is kept as a no-op so the existing vercel.json cron entry
 * doesn't 404. Remove the vercel.json entry in a future cleanup.
 *
 * Protected by CRON_SECRET Bearer token.
 */

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }

  const provided =
    req.headers.get("authorization")?.replace("Bearer ", "") ??
    req.headers.get("x-cron-secret");

  if (provided !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    ok: true,
    deprecated: true,
    message: "Landed→Cruising auto-transition removed in migration 00102.",
    transitioned: 0,
    timestamp: new Date().toISOString(),
  });
}
