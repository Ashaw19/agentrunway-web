/**
 * GET /api/cockpit/export-bundle?year=2026
 *
 * Generates and streams a ZIP download of the year-end accountant export
 * bundle for Agent Runway Inc. Allowlisted to Andrew's account.
 *
 * Bundle contents:
 *  reports/  — 5 reporting-view CSVs
 *  ledger/   — corp_transactions CSV for the year
 *  receipts/ — receipt images from corp_transactions
 *  documents/ — governance docs from corp_documents
 *  README.txt
 *
 * Errors per-section are tolerated (partial bundle rather than total failure).
 * The README.txt records any errors.
 */

import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildExportBundle } from "@/lib/cockpit/export-bundle";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const maxDuration = 120;

const ALLOWED_EMAILS = new Set(["andrew@andrewdshaw.ca"]);

export async function GET(req: NextRequest) {
  const requestId = crypto.randomUUID();

  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user || !user.email || !ALLOWED_EMAILS.has(user.email.toLowerCase())) {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
  }

  const yearParam = req.nextUrl.searchParams.get("year");
  const year = yearParam ? Number(yearParam) : new Date().getFullYear();
  if (!Number.isInteger(year) || year < 2020 || year > 2100) {
    return new Response(JSON.stringify({ error: "invalid year" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  try {
    const { zip, filenameBase, reportCount, txnCount, receiptCount, docCount, resolutionCount, sredCount, errors } =
      await buildExportBundle(supabase, user.id, year);

    if (errors.length > 0) {
      log.warn(
        { requestId, errors, year },
        "[cockpit/export-bundle] Bundle generated with errors",
      );
    } else {
      log.info(
        { requestId, year, reportCount, txnCount, receiptCount, docCount, resolutionCount, sredCount },
        "[cockpit/export-bundle] Bundle generated successfully",
      );
    }

    const buffer = await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });

    return new Response(buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filenameBase}.zip"`,
        "Content-Length": String(buffer.byteLength),
        "Cache-Control": "no-store",
        "x-report-count": String(reportCount),
        "x-txn-count": String(txnCount),
        "x-receipt-count": String(receiptCount),
        "x-doc-count": String(docCount),
        "x-resolution-count": String(resolutionCount),
        "x-sred-count": String(sredCount),
        "x-error-count": String(errors.length),
      },
    });
  } catch (err) {
    log.error(
      { requestId, message: err instanceof Error ? err.message : String(err) },
      "[cockpit/export-bundle] Fatal error",
    );
    return new Response(
      JSON.stringify({ error: "export failed — check server logs" }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }
}
