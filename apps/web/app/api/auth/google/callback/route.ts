/**
 * GET /api/auth/google/callback
 *
 * CASA-shelved: Google integration paused pending CASA security audit.
 * Full implementation preserved in git history (commit before db8af86).
 */

import { NextResponse } from "next/server";

export async function GET() {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://agentrunway.ca";
  return NextResponse.redirect(
    `${siteUrl}/settings?google_error=integration_unavailable`
  );
}
