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

const CRITICAL_TABLES = ["user_settings", "transactions", "contacts"] as const;

export async function GET() {
  const start = performance.now();
  const timestamp = new Date().toISOString();

  const checks: Record<string, string> = {
    database: "pending",
    tables: "pending",
  };

  try {
    const admin = createAdminClient();

    // 1. Database connectivity — HEAD-only count query is the lightest
    //    round-trip we can do through the Supabase JS client.
    const { error: pingError } = await admin
      .from("user_settings")
      .select("user_id", { count: "exact", head: true })
      .limit(1);

    if (pingError) {
      checks.database = "error";
      checks.tables = "skipped";
      return respond("unhealthy", checks, start, timestamp, pingError.message);
    }

    checks.database = "ok";

    // 2. Verify critical tables exist by querying each with head: true
    const missingTables: string[] = [];

    await Promise.all(
      CRITICAL_TABLES.map(async (table) => {
        const { error } = await admin
          .from(table)
          .select("*", { count: "exact", head: true })
          .limit(0);
        if (error) missingTables.push(table);
      }),
    );

    if (missingTables.length > 0) {
      checks.tables = "error";
      return respond(
        "unhealthy",
        checks,
        start,
        timestamp,
        `Missing or inaccessible tables: ${missingTables.join(", ")}`,
      );
    }

    checks.tables = "ok";

    return respond("healthy", checks, start, timestamp);
  } catch (err) {
    console.error("[health] Unexpected error:", err);
    checks.database = checks.database === "ok" ? checks.database : "error";
    checks.tables = checks.tables === "ok" ? checks.tables : "skipped";

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
