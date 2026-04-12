import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { decrypt } from "@/lib/microsoft/token-manager";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Fetch the connection to revoke the refresh token at Microsoft before deleting locally
  const { data: conn } = await supabase
    .from("email_connections")
    .select("refresh_token_enc")
    .eq("user_id", user.id)
    .eq("provider", "microsoft")
    .maybeSingle();

  if (conn?.refresh_token_enc) {
    try {
      const refreshToken = decrypt(conn.refresh_token_enc);
      // Microsoft OAuth revocation endpoint — best-effort, non-fatal
      // Microsoft's logout endpoint invalidates the session; for token revocation
      // we POST to the OAuth2 v2.0 logout endpoint
      const clientId = process.env.MICROSOFT_CLIENT_ID;
      if (clientId) {
        await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/logout", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: clientId,
            token: refreshToken,
            token_type_hint: "refresh_token",
          }).toString(),
        });
      }
    } catch (err) {
      // Non-fatal: proceed with local deletion even if revocation fails
      console.warn("[microsoft/disconnect] Token revocation failed (non-fatal):", err);
    }
  }

  const { error } = await supabase
    .from("email_connections")
    .delete()
    .eq("user_id", user.id)
    .eq("provider", "microsoft");

  if (error) {
    console.error("[microsoft/disconnect] Error:", error.message);
    return NextResponse.json({ error: "Failed to disconnect Microsoft account." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
