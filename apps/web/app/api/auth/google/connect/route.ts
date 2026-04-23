/**
 * GET /api/auth/google/connect
 *
 * Initiates the Google OAuth consent flow. Redirects the user to Google's
 * authorization screen requesting Gmail send, Calendar events, and Drive
 * read/write scopes. On completion Google redirects back to /api/auth/google/callback.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import crypto from "crypto";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";

const SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/drive",
].join(" ");

export async function GET() {
  // ── Require authentication ────────────────────────────────────────────────
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  // ── CASA shelf guard ─────────────────────────────────────────────────────
  // Google integration is shelved pending CASA security audit. Block new
  // connections unconditionally until the audit is complete.
  return NextResponse.json(
    { error: "Google integration is temporarily unavailable." },
    { status: 503 }
  );

  // ── Check env vars ────────────────────────────────────────────────────────
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    console.error("[google/connect] Missing GOOGLE_CLIENT_ID");
    return NextResponse.json(
      { error: "Google integration is not yet configured." },
      { status: 503 }
    );
  }

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://agentrunway.ca";
  const redirectUri = `${siteUrl}/api/auth/google/callback`;

  // ── CSRF protection via state param ───────────────────────────────────────
  const state = crypto.randomBytes(32).toString("hex");

  // Store state in a short-lived cookie so we can verify it on callback
  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPES);
  url.searchParams.set("access_type", "offline");   // get refresh_token
  url.searchParams.set("prompt", "consent");          // always show consent to get refresh_token
  url.searchParams.set("state", state);
  url.searchParams.set("include_granted_scopes", "true");

  const response = NextResponse.redirect(url.toString());

  // Set state cookie (5 min TTL, httpOnly, secure, sameSite=lax for redirect)
  response.cookies.set("google_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 300,
    path: "/",
  });

  return response;
}
