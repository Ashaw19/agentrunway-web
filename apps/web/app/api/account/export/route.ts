// ─────────────────────────────────────────────────────────────────────────────
// POST /api/account/export
// ─────────────────────────────────────────────────────────────────────────────
// Self-serve data export per PIPEDA / Law 25 portability rights. Returns a
// ZIP of every user-owned row (CSV per table + manifest.json + README).
//
// • Auth: required (rejects anonymous requests with 401).
// • Rate limit: 1 export per user per 60 minutes — exports are expensive and
//   building one twice in quick succession is almost certainly a misclick.
// • Audit: every successful export is recorded in user_security_events as
//   `data_exported` (category: data) so the user can see when they pulled
//   their own data.
// • Errors: per-table failures are tolerated by the engine and surfaced in
//   manifest.json — we'd rather ship a partial export than fail the request.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { authenticateRequest, apiError } from "@/lib/api-helpers";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { buildUserExport } from "@/lib/data-export";
import { logAuditEvent } from "@/lib/audit-log";
import { log } from "@/lib/logger";

export const runtime = "nodejs"; // JSZip uses Buffer; not Edge-compatible.

export async function POST(request: Request) {
  const auth = await authenticateRequest();
  if (auth.error) return auth.error;

  const { supabase, userId } = auth;

  // ── Rate limit: 1 export / hour ─────────────────────────────────────────
  const limit = await checkRateLimit(userId, "account-export", 1, 60);
  if (!limit.allowed) {
    return NextResponse.json(
      {
        error:
          "You can only request one export per hour. Try again after the reset time.",
      },
      { status: 429, headers: rateLimitHeaders(limit) },
    );
  }

  // ── Resolve user email for the manifest (best-effort) ───────────────────
  let userEmail: string | null = null;
  try {
    const { data } = await supabase.auth.getUser();
    userEmail = data.user?.email ?? null;
  } catch {
    // Non-fatal — manifest will record null.
  }

  // ── Build the ZIP ───────────────────────────────────────────────────────
  let zipBuffer: Buffer;
  let manifest: Awaited<ReturnType<typeof buildUserExport>>["manifest"];
  try {
    const result = await buildUserExport(userId, userEmail);
    zipBuffer = result.zip;
    manifest = result.manifest;
  } catch (e) {
    log.error({ err: e, userId }, "[export] failed to build ZIP");
    return apiError("Failed to build export. Please try again in a few minutes.", 500);
  }

  // ── Audit (PII-free metadata only) ──────────────────────────────────────
  await logAuditEvent({
    userId,
    eventType: "data_exported",
    eventCategory: "data",
    metadata: {
      filesIncluded: manifest.files.length,
      tablesWithErrors: manifest.errors.length,
      bytes: zipBuffer.byteLength,
    },
    request,
  });

  // ── Return the ZIP ──────────────────────────────────────────────────────
  const filename = `agentrunway-export-${manifest.exported_at.split("T")[0]}.zip`;
  return new NextResponse(new Uint8Array(zipBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(zipBuffer.byteLength),
      "Cache-Control": "no-store",
    },
  });
}
