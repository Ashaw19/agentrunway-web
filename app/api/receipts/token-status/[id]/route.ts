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
import { createClient }              from "@/lib/supabase/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;

  // ── 1. Authenticate ──────────────────────────────────────────────────────
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // ── 2. Fetch token row (RLS ensures user can only read their own) ─────────
  const { data, error } = await supabase
    .from("receipt_upload_tokens")
    .select("id, user_id, status, receipt_path, extraction_result, error_message, expires_at")
    .eq("id", id)
    .eq("user_id", user.id)   // extra guard — belt + suspenders
    .single();

  if (error || !data) {
    return NextResponse.json({ ok: false, error: "Token not found" }, { status: 404 });
  }

  // ── 3. Check expiry ───────────────────────────────────────────────────────
  if (new Date(data.expires_at) < new Date() && data.status === "pending") {
    return NextResponse.json({ ok: true, status: "expired" });
  }

  // ── 4. Return status ──────────────────────────────────────────────────────
  if (data.status === "complete") {
    return NextResponse.json({
      ok:          true,
      status:      "complete",
      receiptPath: data.receipt_path,
      extraction:  data.extraction_result,
    });
  }

  if (data.status === "error") {
    return NextResponse.json({
      ok:           true,
      status:       "error",
      errorMessage: data.error_message ?? "Upload failed on phone",
    });
  }

  // still pending
  return NextResponse.json({ ok: true, status: "pending" });
}
