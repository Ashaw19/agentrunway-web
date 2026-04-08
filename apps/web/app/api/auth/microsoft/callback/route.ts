/**
 * GET /api/auth/microsoft/callback
 *
 * Handles the OAuth redirect from Microsoft. Exchanges the authorization code
 * for tokens, encrypts them, fetches the user's email, and upserts into
 * the email_connections table with provider = 'microsoft'.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { encrypt } from "@/lib/microsoft/token-manager";
import { MS_SCOPES } from "@/lib/microsoft/oauth-config";

const MS_TOKEN_URL =
  "https://login.microsoftonline.com/common/oauth2/v2.0/token";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code     = searchParams.get("code");
  const state    = searchParams.get("state");
  const errorMsg = searchParams.get("error");

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://agentrunway.ca";

  // User declined or error
  if (!code || errorMsg) {
    const reason = errorMsg ?? "declined";
    return NextResponse.redirect(
      `${siteUrl}/settings?ms_error=${encodeURIComponent(reason)}`
    );
  }

  // CSRF check
  const storedState = req.cookies.get("ms_oauth_state")?.value;
  if (!state || state !== storedState) {
    console.error("[microsoft/callback] State mismatch — possible CSRF");
    return NextResponse.redirect(
      `${siteUrl}/settings?ms_error=state_mismatch`
    );
  }

  // Authenticate the session
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(`${siteUrl}/login`);
  }

  const clientId     = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error("[microsoft/callback] Missing MICROSOFT_CLIENT_ID or MICROSOFT_CLIENT_SECRET");
    return NextResponse.redirect(
      `${siteUrl}/settings?ms_error=misconfigured`
    );
  }

  const redirectUri = `${siteUrl}/api/auth/microsoft/callback`;

  try {
    // Step 1: Exchange code for tokens
    const tokenRes = await fetch(MS_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id:     clientId,
        client_secret: clientSecret,
        code,
        grant_type:    "authorization_code",
        redirect_uri:  redirectUri,
        scope:         MS_SCOPES,
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      throw new Error(`Token exchange failed: ${tokenRes.status} — ${errText}`);
    }

    const tokenJson = (await tokenRes.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      scope: string;
    };

    if (!tokenJson.access_token) {
      throw new Error("No access_token returned from Microsoft");
    }

    if (!tokenJson.refresh_token) {
      throw new Error("No refresh_token returned from Microsoft");
    }

    // Step 2: Fetch user info from Microsoft Graph
    const meRes = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    });

    if (!meRes.ok) {
      throw new Error(`Failed to fetch user profile: ${meRes.status}`);
    }

    const meJson = (await meRes.json()) as {
      mail?: string;
      userPrincipalName?: string;
      displayName?: string;
    };

    const email = meJson.mail || meJson.userPrincipalName || "";
    if (!email) {
      throw new Error("Microsoft account has no email address — cannot connect");
    }

    // Step 3: Parse granted scopes and detect calendar access
    const grantedScopes = tokenJson.scope ? tokenJson.scope.split(" ") : [];
    const calendarEnabled = grantedScopes.some(
      (s) => s.toLowerCase() === "calendars.readwrite"
    );
    const mailSendEnabled = grantedScopes.some(
      (s) => s.toLowerCase() === "mail.send"
    );

    // Step 4: Encrypt tokens and upsert
    const accessTokenEnc  = encrypt(tokenJson.access_token);
    const refreshTokenEnc = encrypt(tokenJson.refresh_token);
    const expiresAt       = new Date(
      Date.now() + tokenJson.expires_in * 1000
    ).toISOString();

    const { error: upsertError } = await supabase
      .from("email_connections")
      .upsert(
        {
          user_id:                user.id,
          provider:               "microsoft",
          email_address:          email,
          display_name:           meJson.displayName ?? null,
          connection_name:        mailSendEnabled && calendarEnabled
            ? "Outlook (Mail + Calendar)"
            : mailSendEnabled
            ? "Outlook (Mail)"
            : calendarEnabled
            ? "Outlook (Calendar)"
            : "Outlook",
          access_token_enc:       accessTokenEnc,
          refresh_token_enc:      refreshTokenEnc,
          expires_at:             expiresAt,
          calendar_sync_enabled:  calendarEnabled,
          updated_at:             new Date().toISOString(),
        },
        { onConflict: "user_id,provider" }
      );

    if (upsertError) {
      throw new Error(`Failed to save connection: ${upsertError.message}`);
    }

    // Clear state cookie and redirect
    const response = NextResponse.redirect(
      `${siteUrl}/settings?ms_connected=true`
    );
    response.cookies.delete("ms_oauth_state");
    return response;
  } catch (err) {
    console.error("[microsoft/callback] Error:", err);
    // Sanitize error — don't leak internal details to URL bar
    return NextResponse.redirect(
      `${siteUrl}/settings?ms_error=connection_failed`
    );
  }
}
