/**
 * GET /api/cron/db-health
 *
 * Vercel Cron -- runs every hour.
 * Checks database table row counts, recent system activity,
 * and storage bucket accessibility. Logs anomalies to console.error
 * so Sentry captures them.
 *
 * Schedule: "0 * * * *" (see vercel.json)
 * Protected by CRON_SECRET Bearer token.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ── Auth ─────────────────────────────────────────────────────────────────────

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

// ── Types ────────────────────────────────────────────────────────────────────

interface TableCheck {
  table: string;
  count: number | null;
  ok: boolean;
  error?: string;
}

interface HealthResult {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  tables: TableCheck[];
  recentActivity: {
    transactionsLast30Days: number | null;
    ok: boolean;
    error?: string;
  };
  storage: {
    bucketAccessible: boolean;
    error?: string;
  };
  anomalies: string[];
}

// ── Critical tables to monitor ───────────────────────────────────────────────

const CRITICAL_TABLES = [
  "user_settings",
  "transactions",
  "clients",
  "outreach_queue",
] as const;

// ── Main ─────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const anomalies: string[] = [];

  // 1. Check row counts on critical tables
  const tableChecks: TableCheck[] = [];

  for (const table of CRITICAL_TABLES) {
    try {
      const { count, error } = await admin
        .from(table)
        .select("*", { count: "exact", head: true });

      if (error) {
        const msg = `Table "${table}" query failed: ${error.message}`;
        anomalies.push(msg);
        console.error(`[db-health] ${msg}`);
        tableChecks.push({ table, count: null, ok: false, error: error.message });
      } else {
        const rowCount = count ?? 0;
        // Flag if a critical table is completely empty
        if (rowCount === 0) {
          const msg = `Table "${table}" has 0 rows -- may indicate data loss`;
          anomalies.push(msg);
          console.error(`[db-health] ${msg}`);
        }
        tableChecks.push({ table, count: rowCount, ok: !error });
      }
    } catch (e) {
      const msg = `Table "${table}" check threw: ${e instanceof Error ? e.message : String(e)}`;
      anomalies.push(msg);
      console.error(`[db-health] ${msg}`);
      tableChecks.push({ table, count: null, ok: false, error: msg });
    }
  }

  // 2. Check recent system activity (transactions in the last 30 days)
  let recentActivity: HealthResult["recentActivity"] = {
    transactionsLast30Days: null,
    ok: false,
  };

  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const cutoff = thirtyDaysAgo.toISOString().slice(0, 10);

    const { count, error } = await admin
      .from("transactions")
      .select("*", { count: "exact", head: true })
      .gte("created_at", cutoff);

    if (error) {
      const msg = `Recent activity check failed: ${error.message}`;
      anomalies.push(msg);
      console.error(`[db-health] ${msg}`);
      recentActivity = { transactionsLast30Days: null, ok: false, error: error.message };
    } else {
      const txCount = count ?? 0;
      if (txCount === 0) {
        const msg = "No transactions created in the last 30 days -- system may be inactive or ingestion broken";
        anomalies.push(msg);
        console.error(`[db-health] ${msg}`);
      }
      recentActivity = { transactionsLast30Days: txCount, ok: !error };
    }
  } catch (e) {
    const msg = `Recent activity check threw: ${e instanceof Error ? e.message : String(e)}`;
    anomalies.push(msg);
    console.error(`[db-health] ${msg}`);
    recentActivity = { transactionsLast30Days: null, ok: false, error: msg };
  }

  // 3. Check storage bucket accessibility
  let storage: HealthResult["storage"] = { bucketAccessible: false };

  try {
    const { data: _data, error } = await admin.storage.from("receipts").list("", { limit: 1 });

    if (error) {
      const msg = `Storage bucket "receipts" inaccessible: ${error.message}`;
      anomalies.push(msg);
      console.error(`[db-health] ${msg}`);
      storage = { bucketAccessible: false, error: error.message };
    } else {
      storage = { bucketAccessible: true };
    }
  } catch (e) {
    const msg = `Storage check threw: ${e instanceof Error ? e.message : String(e)}`;
    anomalies.push(msg);
    console.error(`[db-health] ${msg}`);
    storage = { bucketAccessible: false, error: msg };
  }

  // 4. Determine overall status
  const allTablesOk = tableChecks.every((t) => t.ok);
  const status: HealthResult["status"] =
    !allTablesOk || !storage.bucketAccessible
      ? "unhealthy"
      : anomalies.length > 0
        ? "degraded"
        : "healthy";

  const result: HealthResult = {
    status,
    timestamp: new Date().toISOString(),
    tables: tableChecks,
    recentActivity,
    storage,
    anomalies,
  };

  if (status !== "healthy") {
    console.error(`[db-health] Overall status: ${status}`, JSON.stringify(result));
  }

  return NextResponse.json(result, { status: status === "unhealthy" ? 503 : 200 });
}
