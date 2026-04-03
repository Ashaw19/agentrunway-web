/**
 * GET /api/auth/google/callback
 *
 * Handles the OAuth redirect from Google. Exchanges the authorization code
 * for tokens, encrypts them, fetches the user's email, and upserts into
 * the google_connections table.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { encrypt } from "@/lib/google/token-manager";

const GOOGLE_TOKEN_URL    = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code        = searchParams.get("code");
  const state       = searchParams.get("state");
  const errorMsg    = searchParams.get("error");

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://agentrunway.ca";

  // ── User declined or error ──────────────────────────────────────────────
  if (!code || errorMsg) {
    const reason = errorMsg ?? "declined";
    return NextResponse.redirect(
      `${siteUrl}/settings?google_error=${encodeURIComponent(reason)}`
    );
  }

  // ── CSRF check ──────────────────────────────────────────────────────────
  const storedState = req.cookies.get("google_oauth_state")?.value;
  if (!state || state !== storedState) {
    console.error("[google/callback] State mismatch — possible CSRF");
    return NextResponse.redirect(
      `${siteUrl}/settings?google_error=state_mismatch`
    );
  }

  // ── Authenticate the session ────────────────────────────────────────────
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(`${siteUrl}/login`);
  }

  // ── Check env vars ──────────────────────────────────────────────────────
  const clientId     = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error("[google/callback] Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET");
    return NextResponse.redirect(
      `${siteUrl}/settings?google_error=misconfigured`
    );
  }

  const redirectUri = `${siteUrl}/api/auth/google/callback`;

  try {
    // ── Step 1: Exchange code for tokens ─────────────────────────────────
    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id:     clientId,
        client_secret: clientSecret,
        code,
        grant_type:    "authorization_code",
        redirect_uri:  redirectUri,
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      throw new Error(`Token exchange failed: ${tokenRes.status} — ${errText}`);
    }

    const tokenJson = (await tokenRes.json()) as {
      access_token:   string;
      refresh_token?: string;
      expires_in:     number;
      scope:          string;
      token_type:     string;
    };

    if (!tokenJson.access_token) {
      throw new Error("No access_token returned from Google");
    }

    if (!tokenJson.refresh_token) {
      throw new Error(
        "No refresh_token returned — user may need to revoke access at " +
        "https://myaccount.google.com/permissions and reconnect"
      );
    }

    // ── Step 2: Fetch user info ─────────────────────────────────────────
    const meRes = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    });

    if (!meRes.ok) {
      throw new Error(`Failed to fetch userinfo: ${meRes.status}`);
    }

    const meJson = (await meRes.json()) as {
      email?: string;
      name?: string;
    };

    const email = meJson.email ?? "";
    if (!email) {
      throw new Error("Google account has no email address — cannot connect");
    }

    // ── Step 3: Parse granted scopes ────────────────────────────────────
    const grantedScopes = tokenJson.scope ? tokenJson.scope.split(" ") : [];
    const gmailEnabled    = grantedScopes.includes("https://www.googleapis.com/auth/gmail.send");
    const calendarEnabled = grantedScopes.includes("https://www.googleapis.com/auth/calendar.events");
    const driveEnabled    = grantedScopes.includes("https://www.googleapis.com/auth/drive");

    // ── Step 4: Encrypt tokens and upsert ───────────────────────────────
    const accessTokenEnc  = encrypt(tokenJson.access_token);
    const refreshTokenEnc = encrypt(tokenJson.refresh_token);
    const expiresAt       = new Date(
      Date.now() + tokenJson.expires_in * 1000
    ).toISOString();

    const { error: upsertError } = await supabase
      .from("google_connections")
      .upsert(
        {
          user_id:               user.id,
          email_address:         email,
          display_name:          meJson.name ?? null,
          access_token_enc:      accessTokenEnc,
          refresh_token_enc:     refreshTokenEnc,
          expires_at:            expiresAt,
          granted_scopes:        grantedScopes,
          gmail_send_enabled:    gmailEnabled,
          calendar_sync_enabled: calendarEnabled,
          drive_read_enabled:    driveEnabled,
          updated_at:            new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

    if (upsertError) {
      throw new Error(`Failed to save connection: ${upsertError.message}`);
    }

    // ── Clear state cookie and redirect ─────────────────────────────────
    const response = NextResponse.redirect(
      `${siteUrl}/settings?google_connected=true`
    );
    response.cookies.delete("google_oauth_state");
    return response;
  } catch (err) {
    console.error("[google/callback] Error:", err);
    // Sanitize error — don't leak internal details to URL bar
    return NextResponse.redirect(
      `${siteUrl}/settings?google_error=connection_failed`
    );
  }
}
