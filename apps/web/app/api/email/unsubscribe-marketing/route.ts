/**
 * GET /api/email/unsubscribe-marketing?token=...
 *
 * Marketing-list unsubscribe handler for the email-keyed audience (cheat-sheet
 * delivery, charter welcome, future lead magnets). The product weekly digest
 * uses the user_id-keyed handler at /api/email/unsubscribe.
 *
 * Verifies an HMAC-signed token (see lib/email-tokens.ts) then sets
 * email_signups.unsubscribed_at = now() for the corresponding email.
 *
 * Returns a confirmation HTML page. Required by CASL §11 (functional
 * unsubscribe mechanism, no cost to recipient, takes effect within 10
 * business days). The flag is honoured by any future broadcast loop that
 * filters on `unsubscribed_at IS NULL`.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyMarketingUnsubscribeToken } from "@/lib/email-tokens";
import { createAdminClient } from "@/lib/supabase/admin";

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
    <p><a href="https://agentrunway.ca">Return to Agent Runway</a></p>
  </div>
</body>
</html>`;

  return new NextResponse(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");

  if (!token) {
    return htmlResponse(
      "Invalid Link",
      "This unsubscribe link is missing a token. Please use the link directly from the email.",
      400
    );
  }

  const email = verifyMarketingUnsubscribeToken(token);
  if (!email) {
    return htmlResponse(
      "Invalid or Expired Link",
      "This unsubscribe link is invalid. Please use the most recent email link, or reply to any Agent Runway email and we'll remove you manually.",
      403
    );
  }

  const admin = createAdminClient();

  const { error } = await admin
    .from("email_signups")
    .update({ unsubscribed_at: new Date().toISOString() })
    .eq("email", email);

  if (error) {
    console.error("[unsubscribe-marketing] DB error:", error.message);
    return htmlResponse(
      "Something Went Wrong",
      "We couldn't process your unsubscribe right now. Please try again later, or reply to any Agent Runway email and we'll remove you manually.",
      500
    );
  }

  return htmlResponse(
    "Unsubscribed",
    "You've been removed from the Agent Runway marketing list. You will not receive any further emails from us at this address."
  );
}

// POST handler for List-Unsubscribe-Post (RFC 8058) — some mail clients fire
// a POST when the user clicks the inbox-level "unsubscribe" affordance.
export async function POST(req: NextRequest) {
  return GET(req);
}
