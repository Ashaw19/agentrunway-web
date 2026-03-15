/**
 * /api/auth/meta/callback
 *
 * Instagram Business Login OAuth callback.
 * Uses the Instagram Business Login product (api.instagram.com + graph.instagram.com).
 *
 * Required env vars:
 *   META_APP_ID          — Instagram app ID (from the Instagram product in Meta Developer)
 *   META_APP_SECRET      — Instagram app secret
 *   NEXT_PUBLIC_SITE_URL — e.g. https://agentrunway.ca
 *
 * Docs:
 *   https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const IG_TOKEN_URL = "https://api.instagram.com/oauth/access_token";
const IG_GRAPH     = "https://graph.instagram.com";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code     = searchParams.get("code");
  const errorMsg = searchParams.get("error_description");

  const siteUrl     = process.env.NEXT_PUBLIC_SITE_URL ?? "https://agentrunway.ca";
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
    const tokenRes = await fetch(IG_TOKEN_URL, {
      method:  "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body:    new URLSearchParams({
        client_id:     appId,
        client_secret: appSecret,
        grant_type:    "authorization_code",
        redirect_uri:  redirectUri,
        code,
      }),
    });
    const tokenJson = await tokenRes.json() as {
      access_token?:  string;
      token_type?:    string;
      expires_in?:    number;
      error?:         { message: string };
      error_message?: string;
    };

    if (!tokenJson.access_token) {
      throw new Error(
        tokenJson.error?.message ?? tokenJson.error_message ?? "No access token returned",
      );
    }

    // ── Step 2: Exchange short-lived → long-lived token (60-day expiry) ─────
    const longRes = await fetch(
      `${IG_GRAPH}/access_token?` +
        new URLSearchParams({
          grant_type:    "ig_exchange_token",
          client_id:     appId,
          client_secret: appSecret,
          access_token:  tokenJson.access_token,
        }),
    );
    const longJson = await longRes.json() as {
      access_token?: string;
      token_type?:   string;
      expires_in?:   number;
      error?:        { message: string };
    };

    if (!longJson.access_token) {
      throw new Error(longJson.error?.message ?? "Long-lived token exchange failed");
    }

    const expiresAt = longJson.expires_in
      ? new Date(Date.now() + longJson.expires_in * 1000).toISOString()
      : null;

    // ── Step 3: Fetch Instagram profile (id + username) ────────────────────
    const meRes = await fetch(
      `${IG_GRAPH}/v21.0/me?fields=id,username,name&access_token=${longJson.access_token}`,
    );
    const meJson = await meRes.json() as {
      id?:       string;
      username?: string;
      name?:     string;
    };

    // ── Step 4: Upsert into social_connections ──────────────────────────────
    await supabase.from("social_connections").upsert(
      {
        user_id:          user.id,
        platform:         "instagram",
        account_id:       meJson.id       ?? null,
        account_name:     meJson.username ?? meJson.name ?? null,
        access_token:     longJson.access_token,
        token_expires_at: expiresAt,
      },
      { onConflict: "user_id,platform" },
    );

    return NextResponse.redirect(`${siteUrl}/social?connected=instagram`);
  } catch (err) {
    console.error("[meta/callback] Error:", err);
    return NextResponse.redirect(
      `${siteUrl}/social?error=${encodeURIComponent(String(err))}`,
    );
  }
}
