/**
 * GET /api/receipts/token-status/[id]
 *
 * Authenticated polling endpoint — the desktop checks this every 3 seconds.
 *
 * Returns:
 *   { ok: true, status: 'pending' }
 *   { ok: true, status: 'complete', receiptPath, extraction }
 *   { ok: true, status: 'error',    errorMessage }
 *   { ok: false, error: '...' }  — auth or not-found errors
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest }       from "@/lib/api-helpers";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id } = await params;

    // ── 1. Authenticate ──────────────────────────────────────────────────────
    const auth = await authenticateRequest();
    if (auth.error) return auth.error;
    const { supabase, userId } = auth;

    // ── 2. Fetch token row (RLS ensures user can only read their own) ─────────
    const { data, error } = await supabase
      .from("receipt_upload_tokens")
      .select("id, user_id, status, receipt_path, extraction_result, error_message, expires_at")
      .eq("id", id)
      .eq("user_id", userId)
      .single();

    if (error || !data) {
      return NextResponse.json({ ok: false, error: "Token not found" }, { status: 404 });
    }

    const row = data as Record<string, unknown>;

    // ── 3. Check expiry ───────────────────────────────────────────────────────
    if (new Date(row.expires_at as string) < new Date() && row.status === "pending") {
      return NextResponse.json({ ok: true, status: "expired" });
    }

    // ── 4. Return status ──────────────────────────────────────────────────────
    if (row.status === "complete") {
      return NextResponse.json({
        ok:          true,
        status:      "complete",
        receiptPath: row.receipt_path,
        extraction:  row.extraction_result,
      });
    }

    if (row.status === "error") {
      return NextResponse.json({
        ok:           true,
        status:       "error",
        errorMessage: (row.error_message as string | null) ?? "Upload failed on phone",
      });
    }

    // still pending
    return NextResponse.json({ ok: true, status: "pending" });

  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[token-status] Unhandled error:", msg);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
