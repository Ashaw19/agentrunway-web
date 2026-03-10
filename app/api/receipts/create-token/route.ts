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

const IS_DEV = process.env.NODE_ENV === "development";

/** Generate a 64-character hex token using two UUIDs */
function generateToken(): string {
  return [crypto.randomUUID(), crypto.randomUUID()]
    .map((u) => u.replace(/-/g, ""))
    .join("");
}

export async function POST(
  _req: NextRequest,
): Promise<NextResponse> {
  try {
    // ── 1. Authenticate ────────────────────────────────────────────────────
    console.log("[create-token] 1: getting SSR client");
    const supabase = await createClient();

    console.log("[create-token] 2: getUser()");
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      console.error("[create-token] auth failed:", authError?.message);
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    console.log("[create-token] 3: user ok →", user.id);

    // ── 2. Create token row via admin client (bypasses RLS) ────────────────
    console.log("[create-token] 4: creating admin client");
    const admin = createAdminClient();
    const token = generateToken();

    console.log("[create-token] 5: inserting token row");
    const { data, error } = await admin
      .from("receipt_upload_tokens")
      .insert({
        user_id: user.id,
        token,
      })
      .select("id, token, expires_at")
      .single();

    if (error || !data) {
      console.error("[create-token] insert failed:", error?.message, error?.details);
      return NextResponse.json(
        { ok: false, error: IS_DEV ? `DB error: ${error?.message ?? "no data returned"}` : "Failed to create upload token" },
        { status: 500 },
      );
    }
    console.log("[create-token] 6: row created ok →", (data as Record<string, unknown>).id);

    return NextResponse.json({
      ok:        true,
      tokenId:   (data as Record<string, unknown>).id,
      token:     (data as Record<string, unknown>).token,
      expiresAt: (data as Record<string, unknown>).expires_at,
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[create-token] unhandled exception:", msg);
    // Expose real error in dev so it shows in the dialog — helps diagnose
    return NextResponse.json(
      { ok: false, error: IS_DEV ? msg : "Internal server error" },
      { status: 500 },
    );
  }
}
