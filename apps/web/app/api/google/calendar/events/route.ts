/**
 * GET /api/google/calendar/events
 *
 * Returns upcoming calendar events for the authenticated user.
 * Fetches from the local calendar_events table (not directly from Google).
 * Run /api/google/calendar/sync first to populate.
 *
 * Query params:
 *  - days: number of days ahead (default 7, max 90)
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ── CASA shelf guard ─────────────────────────────────────────────────────
    return NextResponse.json(
      { error: "Google integration is temporarily unavailable." },
      { status: 503 }
    );

    const days = Math.min(
      parseInt(req.nextUrl.searchParams.get("days") ?? "7", 10) || 7,
      90
    );

    const now = new Date();
    const future = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    const { data: events, error } = await supabase
      .from("calendar_events")
      .select("*")
      .eq("user_id", user.id)
      .neq("sync_status", "deleted")
      .gte("start_at", now.toISOString())
      .lte("start_at", future.toISOString())
      .order("start_at", { ascending: true })
      .limit(50);

    if (error) {
      console.error("[calendar/events] Query failed:", error.message);
      return NextResponse.json(
        { error: "Failed to fetch events" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, events: events ?? [] });
  } catch (err) {
    console.error("[calendar/events] Unexpected error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
