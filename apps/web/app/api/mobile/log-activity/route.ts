/**
 * POST /api/mobile/log-activity
 *
 * Mobile-native contact activity logging endpoint.
 * Accepts Bearer token auth (Supabase access token) instead of cookies.
 *
 * Body: { client_id: string, activity_type: string, notes?: string }
 * Inserts into contact_activities table.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient }         from "@/lib/supabase/admin";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";

const VALID_TYPES = new Set(["call", "text", "email", "meeting", "showing", "note", "offer"]);

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    // ── 1. Authenticate via Bearer token ──────────────────────────────────
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { logged: false, error: "Missing Authorization header" },
        { status: 401 },
      );
    }

    const accessToken = authHeader.slice(7);
    const admin = createAdminClient();

    const { data: { user }, error: authError } = await admin.auth.getUser(accessToken);

    if (authError || !user) {
      return NextResponse.json(
        { logged: false, error: "Invalid or expired token" },
        { status: 401 },
      );
    }

    // ── 2. Rate limit ─────────────────────────────────────────────────────
    const rl = await checkRateLimit(user.id, "log_activity", 60, 60);
    if (!rl.allowed) {
      return NextResponse.json(
        { logged: false, error: "Too many requests. Please wait before trying again." },
        { status: 429, headers: rateLimitHeaders(rl) },
      );
    }

    // ── 3. Parse & validate body ──────────────────────────────────────────
    const body = await req.json();
    const { client_id, activity_type, notes } = body;

    if (!client_id || typeof client_id !== "string") {
      return NextResponse.json(
        { logged: false, error: "client_id is required" },
        { status: 400 },
      );
    }

    if (!activity_type || !VALID_TYPES.has(activity_type)) {
      return NextResponse.json(
        { logged: false, error: `activity_type must be one of: ${[...VALID_TYPES].join(", ")}` },
        { status: 400 },
      );
    }

    // ── 4. Verify client belongs to user + capture prior status ───────────
    // We read status here so the response can tell the mobile client whether
    // the DB trigger (migration 00105) auto-promoted the client — lets the
    // mobile UI show a "auto-promoted to Boarding" toast and refresh its
    // local state without a full re-fetch.
    const { data: client, error: clientErr } = await admin
      .from("clients")
      .select("id, status")
      .eq("id", client_id)
      .eq("user_id", user.id)
      .single();

    if (clientErr || !client) {
      return NextResponse.json(
        { logged: false, error: "Client not found" },
        { status: 404 },
      );
    }
    const priorStatus = client.status as string;

    // ── 5. Insert activity ────────────────────────────────────────────────
    const { error: insertErr } = await admin
      .from("contact_activities")
      .insert({
        user_id:       user.id,
        client_id,
        type:          activity_type,
        description:   typeof notes === "string" ? notes.trim() : "",
        activity_date: new Date().toISOString(),
      });

    if (insertErr) {
      console.error("log-activity insert error:", insertErr);
      return NextResponse.json(
        { logged: false, error: "Failed to log activity" },
        { status: 500 },
      );
    }

    // ── 6. Detect auto-promotion (Phase 3 Wave A) ─────────────────────────
    // Only re-read when prior status was one the trigger could have flipped.
    let promoted = false;
    let newStatus: string | null = null;
    if (priorStatus === "cruising" || priorStatus === "scheduled") {
      const { data: updated } = await admin
        .from("clients")
        .select("status")
        .eq("id", client_id)
        .single();
      if (updated && updated.status !== priorStatus) {
        newStatus = updated.status as string;
        promoted = true;
      }
    }

    return NextResponse.json({
      logged: true,
      promoted,
      old_status: priorStatus,
      new_status: newStatus ?? priorStatus,
    });
  } catch (err) {
    console.error("log-activity unexpected error:", err);
    return NextResponse.json(
      { logged: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
