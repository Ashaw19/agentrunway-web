import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { decrypt } from "@/lib/google/token-manager";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Fetch the connection to revoke the token at Google before deleting locally
  const { data: conn } = await supabase
    .from("google_connections")
    .select("access_token_enc")
    .eq("user_id", user.id)
    .maybeSingle();

  if (conn?.access_token_enc) {
    try {
      const accessToken = decrypt(conn.access_token_enc);
      // Google OAuth revocation endpoint — best-effort, non-fatal
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(accessToken)}`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });
    } catch (err) {
      // Non-fatal: proceed with local deletion even if revocation fails
      console.warn("[google/disconnect] Token revocation failed (non-fatal):", err);
    }
  }

  const { error } = await supabase
    .from("google_connections")
    .delete()
    .eq("user_id", user.id);

  if (error) {
    console.error("[google/disconnect] Error:", error.message);
    return NextResponse.json({ error: "Failed to disconnect Google account." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
