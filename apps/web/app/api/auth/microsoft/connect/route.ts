/**
 * GET /api/auth/microsoft/connect
 *
 * Initiates the Microsoft OAuth consent flow for Outlook email sending.
 * Redirects to Microsoft's authorization screen requesting Mail.Send scope.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { MS_AUTH_URL, MS_SCOPES } from "@/lib/microsoft/oauth-config";
import crypto from "crypto";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const clientId = process.env.MICROSOFT_CLIENT_ID;
  if (!clientId) {
    console.error("[microsoft/connect] Missing MICROSOFT_CLIENT_ID");
    return NextResponse.json(
      { error: "Microsoft integration is not yet configured." },
      { status: 503 }
    );
  }

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://agentrunway.ca";
  const redirectUri = `${siteUrl}/api/auth/microsoft/callback`;

  // CSRF protection
  const state = crypto.randomBytes(32).toString("hex");

  const url = new URL(MS_AUTH_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", MS_SCOPES);
  url.searchParams.set("response_mode", "query");
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "consent"); // always show consent

  const response = NextResponse.redirect(url.toString());

  response.cookies.set("ms_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 300,
    path: "/",
  });

  return response;
}
