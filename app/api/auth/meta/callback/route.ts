/**
 * /api/auth/meta/callback
 *
 * Meta (Facebook / Instagram) OAuth callback.
 * After the user authorises Agent Runway in the Meta dialog, Meta redirects here
 * with a short-lived `code` that we exchange for a long-lived user access token.
 *
 * Required env vars (add to Vercel + .env.local):
 *   META_APP_ID         — from developers.facebook.com → App Settings → Basic
 *   META_APP_SECRET     — same location (keep secret!)
 *   NEXT_PUBLIC_SITE_URL — e.g. https://agentrunway.ca
 *
 * Meta Graph API docs:
 *   https://developers.facebook.com/docs/facebook-login/guides/access-tokens/get-long-lived
 *   https://developers.facebook.com/docs/instagram-api/getting-started
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const GRAPH = "https://graph.facebook.com/v19.0";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code     = searchParams.get("code");
  const errorMsg = searchParams.get("error_description");
  const state    = searchParams.get("state"); // "instagram" | "facebook"

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://agentrunway.ca";
  const redirectUri = `${siteUrl}/api/auth/meta/callback`;

  // ── User declined ──────────────────────────────────────────────────────────
  if (!code) {
    const reason = errorMsg ? encodeURIComponent(errorMsg) : "declined";
    return NextResponse.redirect(`${siteUrl}/social?error=${reason}`);
  }

  // ── Authenticate the server-side Supabase session ─────────────────────────
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(`${siteUrl}/login`);
  }

  const appId     = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;

  if (!appId || !appSecret) {
    console.error("[meta/callback] Missing META_APP_ID or META_APP_SECRET");
    return NextResponse.redirect(`${siteUrl}/social?error=misconfigured`);
  }

  try {
    // ── Step 1: Exchange code for short-lived token ─────────────────────────
    const tokenRes = await fetch(
      `${GRAPH}/oauth/access_token?` +
        new URLSearchParams({
          client_id:     appId,
          client_secret: appSecret,
          redirect_uri:  redirectUri,
          code,
        }),
    );
    const tokenJson = await tokenRes.json() as {
      access_token?: string;
      error?: { message: string };
    };

    if (!tokenJson.access_token) {
      throw new Error(tokenJson.error?.message ?? "No access token returned");
    }

    // ── Step 2: Exchange for long-lived token (60-day expiry) ───────────────
    const longRes = await fetch(
      `${GRAPH}/oauth/access_token?` +
        new URLSearchParams({
          grant_type:        "fb_exchange_token",
          client_id:         appId,
          client_secret:     appSecret,
          fb_exchange_token: tokenJson.access_token,
        }),
    );
    const longJson = await longRes.json() as {
      access_token?: string;
      expires_in?: number;
      error?: { message: string };
    };

    if (!longJson.access_token) {
      throw new Error(longJson.error?.message ?? "Long-lived token exchange failed");
    }

    const expiresAt = longJson.expires_in
      ? new Date(Date.now() + longJson.expires_in * 1000).toISOString()
      : null;

    // ── Step 3: Fetch the user's Meta profile (id + name) ──────────────────
    const meRes = await fetch(
      `${GRAPH}/me?fields=id,name&access_token=${longJson.access_token}`,
    );
    const meJson = await meRes.json() as { id?: string; name?: string };

    const platform = (state === "facebook" ? "facebook" : "instagram") as
      | "instagram"
      | "facebook";

    // ── Step 4: Upsert into social_connections ──────────────────────────────
    await supabase.from("social_connections").upsert(
      {
        user_id:         user.id,
        platform,
        account_id:      meJson.id ?? null,
        account_name:    meJson.name ?? null,
        access_token:    longJson.access_token,
        token_expires_at: expiresAt,
      },
      { onConflict: "user_id,platform" },
    );

    return NextResponse.redirect(`${siteUrl}/social?connected=${platform}`);
  } catch (err) {
    console.error("[meta/callback] Error:", err);
    return NextResponse.redirect(
      `${siteUrl}/social?error=${encodeURIComponent(String(err))}`,
    );
  }
}
