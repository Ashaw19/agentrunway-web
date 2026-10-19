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
import { countAIFailures } from "@agent-runway/core/lib/ai-activity-load";
import { AI_LEDGER_RETENTION_MONTHS, AI_WRITE_IMAGE_RETENTION_DAYS } from "@agent-runway/core/lib/ai-activity";

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
  /** AI run ledger (00182): failures across all users, last 24 hours. */
  aiLedger: {
    failedRuns: number | null;
    failedWrites: number | null;
    /** Before/after images cleared past the retention window this run. */
    imagesCleared: number | null;
    /** Ledger rows deleted past AI_LEDGER_RETENTION_MONTHS this run. */
    runsDeleted: number | null;
    writesDeleted: number | null;
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
    const cutoff = thirtyDaysAgo.toISOString();

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

  // 4. AI run ledger: failed AI calls and failed Flight Crew writes in the
  //    last 24 hours, across all users. A write path that breaks (every
  //    activity insert failed 2026-04-12 → 2026-10-06, found six months
  //    later) shows here, and in Sentry, the next morning.
  let aiLedger: HealthResult["aiLedger"] = { failedRuns: null, failedWrites: null, imagesCleared: null, runsDeleted: null, writesDeleted: null };
  try {
    const f = await countAIFailures(admin, null);
    aiLedger = { failedRuns: f.failedRuns, failedWrites: f.failedWrites, imagesCleared: null, runsDeleted: null, writesDeleted: null };
    if (f.unknown) {
      const msg = "AI ledger failure counts could not be read";
      anomalies.push(msg);
      console.error(`[db-health] ${msg}`);
    } else if (f.failedRuns + f.failedWrites > 0) {
      const msg = `AI ledger, last 24h: ${f.failedRuns} failed AI calls, ${f.failedWrites} failed Flight Crew writes`;
      anomalies.push(msg);
      console.error(`[db-health] ${msg}`);
    }

    // Housekeeping: a change's before/after images are kept for the undo
    // window only, so a record the AI deleted doesn't live on in the ledger.
    const cutoff = new Date(Date.now() - AI_WRITE_IMAGE_RETENTION_DAYS * 86_400_000).toISOString();
    const { data: cleared, error: clearError } = await admin
      .from("ai_run_writes")
      .update({ before_image: null, after_image: null })
      .lt("created_at", cutoff)
      .or("before_image.not.is.null,after_image.not.is.null")
      .select("id");
    if (clearError) {
      aiLedger.error = clearError.message;
      console.error(`[db-health] AI ledger image cleanup failed: ${clearError.message}`);
    } else {
      aiLedger.imagesCleared = (cleared ?? []).length;
    }

    // Retention: the ledger keeps 13 months (a year plus a month of overlap
    // for year-over-year cost), then the rows go.
    const keepFrom = new Date();
    keepFrom.setUTCMonth(keepFrom.getUTCMonth() - AI_LEDGER_RETENTION_MONTHS);
    for (const [table, key] of [["ai_runs", "runsDeleted"], ["ai_run_writes", "writesDeleted"]] as const) {
      const { data: gone, error: delError } = await admin
        .from(table)
        .delete()
        .lt("created_at", keepFrom.toISOString())
        .select("id");
      if (delError) {
        aiLedger.error = delError.message;
        console.error(`[db-health] ${table} retention delete failed: ${delError.message}`);
      } else {
        aiLedger[key] = (gone ?? []).length;
      }
    }
  } catch (e) {
    const msg = `AI ledger check threw: ${e instanceof Error ? e.message : String(e)}`;
    anomalies.push(msg);
    console.error(`[db-health] ${msg}`);
    aiLedger = { failedRuns: null, failedWrites: null, imagesCleared: null, runsDeleted: null, writesDeleted: null, error: msg };
  }

  // 5. Determine overall status
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
    aiLedger,
    anomalies,
  };

  if (status !== "healthy") {
    console.error(`[db-health] Overall status: ${status}`, JSON.stringify(result));
  }

  return NextResponse.json(result, { status: status === "unhealthy" ? 503 : 200 });
}
