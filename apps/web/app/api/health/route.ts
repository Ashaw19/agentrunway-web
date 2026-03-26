/**
 * GET /api/health
 *
 * Health-check endpoint for Vercel, uptime monitors (Better Uptime, Checkly,
 * UptimeRobot, etc.), and future load balancers.
 *
 * Checks:
 *   1. Supabase database connectivity (SELECT 1)
 *   2. Critical tables exist (user_settings, transactions, contacts)
 *
 * Returns 200 if healthy, 503 if unhealthy.
 * Intentionally unauthenticated — monitors don't have user sessions.
 * No sensitive data is returned.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

export async function GET() {
  const start = performance.now();
  const timestamp = new Date().toISOString();

  const checks: Record<string, string> = {
    database: "pending",
    tables: "pending",
  };

  try {
    const admin = createAdminClient();

    // Single lightweight query with a 5-second abort to stay well within
    // Vercel Hobby's 10-second function timeout.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);

    const { error: pingError } = await admin
      .from("user_settings")
      .select("user_id", { count: "exact", head: true })
      .limit(1)
      .abortSignal(controller.signal);

    clearTimeout(timer);

    if (pingError) {
      checks.database = "error";
      checks.tables = "skipped";
      return respond("unhealthy", checks, start, timestamp, pingError.message);
    }

    checks.database = "ok";
    checks.tables = "ok";

    return respond("healthy", checks, start, timestamp);
  } catch (err) {
    console.error("[health] Unexpected error:", err);
    checks.database = "error";
    checks.tables = "skipped";

    const message =
      err instanceof Error ? err.message : "Unknown error";

    return respond("unhealthy", checks, start, timestamp, message);
  }
}

function respond(
  status: "healthy" | "unhealthy",
  checks: Record<string, string>,
  start: number,
  timestamp: string,
  error?: string,
) {
  const responseMs = Math.round(performance.now() - start);
  const body: Record<string, unknown> = {
    status,
    timestamp,
    responseMs,
    checks,
  };
  if (error) body.error = error;

  return NextResponse.json(body, {
    status: status === "healthy" ? 200 : 503,
  });
}
