/**
 * GET /api/health
 *
 * Lightweight health-check endpoint for Vercel, uptime monitors (Better
 * Uptime, Checkly, UptimeRobot, etc.), and future load balancers.
 *
 * Returns 200 { ok: true } if the service is healthy.
 * Returns 503 { ok: false } if the database is unreachable.
 *
 * Intentionally unauthenticated — monitors don't have user sessions.
 * No sensitive data is returned.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const timestamp = new Date().toISOString();

  // Ping the database with a minimal query to confirm connectivity.
  // Uses the admin client (service_role) to bypass RLS — this route
  // only checks reachability, it doesn't return any user data.
  try {
    const admin = createAdminClient();
    // SELECT 1 equivalent: count rows in a tiny system-managed table
    const { error } = await admin.from("user_settings").select("user_id").limit(1);
    if (error) throw error;
  } catch (err) {
    console.error("[health] DB check failed:", err);
    return NextResponse.json(
      { ok: false, timestamp, error: "Database unreachable" },
      { status: 503 },
    );
  }

  return NextResponse.json({ ok: true, timestamp });
}
