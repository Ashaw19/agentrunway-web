/**
 * GET /api/email/unsubscribe?token=...&type=weekly-digest
 *
 * One-click email unsubscribe handler. Verifies an HMAC-signed token,
 * then sets the corresponding preference to false in notification_preferences.
 *
 * Returns a simple HTML page confirming the action.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyUnsubscribeToken } from "@/lib/email-tokens";
import { createAdminClient } from "@/lib/supabase/admin";

// Supported unsubscribe types and their column names
const TYPE_COLUMN_MAP: Record<string, string> = {
  "weekly-digest": "weekly_digest_enabled",
};

function htmlResponse(title: string, message: string, status = 200): NextResponse {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title} — Agent Runway</title>
  <style>
    body {
      margin: 0; padding: 0;
      min-height: 100vh;
      display: flex; align-items: center; justify-content: center;
      background-color: #f3f4f8;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #334155;
    }
    .card {
      max-width: 480px;
      background: #fff;
      border-radius: 12px;
      padding: 40px;
      box-shadow: 0 2px 12px rgba(0,0,0,0.08);
      text-align: center;
    }
    h1 { font-size: 22px; color: #0f172a; margin: 0 0 16px; }
    p { font-size: 15px; line-height: 1.6; margin: 0 0 20px; }
    a { color: #1E72F2; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .logo { width: 44px; height: 44px; margin-bottom: 16px; }
  </style>
</head>
<body>
  <div class="card">
    <img src="https://agentrunway.ca/logo-email.png" alt="Agent Runway" class="logo" />
    <h1>${title}</h1>
    <p>${message}</p>
    <p><a href="https://agentrunway.ca/settings">Manage email preferences</a></p>
  </div>
</body>
</html>`;

  return new NextResponse(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const token = searchParams.get("token");
  const type = searchParams.get("type");

  // Validate inputs
  if (!token || !type) {
    return htmlResponse(
      "Invalid Link",
      "This unsubscribe link is missing required parameters. Please use the link directly from your email.",
      400
    );
  }

  const column = TYPE_COLUMN_MAP[type];
  if (!column) {
    return htmlResponse(
      "Unknown Email Type",
      `The email type "${type}" is not recognized. Please contact support if you need help.`,
      400
    );
  }

  // Verify the HMAC token
  const result = verifyUnsubscribeToken(token);
  if (!result || result.type !== type) {
    return htmlResponse(
      "Invalid or Expired Link",
      "This unsubscribe link is invalid or has expired. Please use the most recent email link, or manage your preferences in Settings.",
      403
    );
  }

  // Update the preference using admin client (bypasses RLS)
  const admin = createAdminClient();

  const { error } = await admin
    .from("notification_preferences")
    .upsert(
      {
        user_id: result.userId,
        [column]: false,
      },
      { onConflict: "user_id" }
    );

  if (error) {
    console.error("[unsubscribe] DB error:", error);
    return htmlResponse(
      "Something Went Wrong",
      "We couldn't process your unsubscribe request right now. Please try again later or manage your preferences in Settings.",
      500
    );
  }

  return htmlResponse(
    "Unsubscribed",
    "You've been unsubscribed from the weekly digest. You can re-enable it anytime in your <a href=\"https://agentrunway.ca/settings\">Settings</a>."
  );
}
