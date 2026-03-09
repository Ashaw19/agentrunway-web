/**
 * POST /api/receipts/create-token
 *
 * Creates a one-time upload token for the desktop → phone QR handoff mode.
 * - Requires an authenticated session.
 * - Token is a 64-char hex string, valid for 5 minutes, single-use.
 * - Returns { ok: true, tokenId, token, expiresAt } or { ok: false, error }.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient }              from "@/lib/supabase/server";
import { createAdminClient }         from "@/lib/supabase/admin";

/** Generate a 64-character hex token using two UUIDs */
function generateToken(): string {
  return [crypto.randomUUID(), crypto.randomUUID()]
    .map((u) => u.replace(/-/g, ""))
    .join("");
}

export async function POST(
  _req: NextRequest,
): Promise<NextResponse> {
  // ── 1. Authenticate ──────────────────────────────────────────────────────
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // ── 2. Create token row (admin client to bypass RLS INSERT check edge-cases)
  const admin = createAdminClient();
  const token = generateToken();

  const { data, error } = await admin
    .from("receipt_upload_tokens")
    .insert({
      user_id: user.id,
      token,
    })
    .select("id, token, expires_at")
    .single();

  if (error || !data) {
    console.error("[create-token] Insert failed:", error?.message);
    return NextResponse.json(
      { ok: false, error: "Failed to create upload token" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok:        true,
    tokenId:   data.id,
    token:     data.token,
    expiresAt: data.expires_at,
  });
}
