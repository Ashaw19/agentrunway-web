/**
 * GET /api/google/drive/files
 *
 * List files from the user's Google Drive.
 *
 * Query params:
 *  - q: search query (e.g., "listing agreement", "CMA")
 *  - pageToken: for pagination
 *  - pageSize: number of results (default 20, max 50)
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getValidAccessToken,
  type GoogleConnection,
} from "@/lib/google/token-manager";
import { listFiles } from "@/lib/google/drive-client";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── CASA shelf guard ─────────────────────────────────────────────────────
  return NextResponse.json(
    { error: "Google integration is temporarily unavailable." },
    { status: 503 }
  );

  // ── Fetch Google connection ─────────────────────────────────────────────
  const { data: conn, error: connErr } = await supabase
    .from("google_connections")
    .select(
      "id, access_token_enc, refresh_token_enc, expires_at, drive_read_enabled"
    )
    .eq("user_id", user.id)
    .single();

  if (connErr || !conn) {
    return NextResponse.json(
      { error: "No Google connection found", code: "NO_CONNECTION" },
      { status: 422 }
    );
  }

  if (!conn.drive_read_enabled) {
    return NextResponse.json(
      { error: "Drive access not enabled", code: "NO_DRIVE_SCOPE" },
      { status: 403 }
    );
  }

  try {
    const tokenResult = await getValidAccessToken(conn as GoogleConnection);

    if (tokenResult.refreshed && tokenResult.newAccessTokenEnc) {
      await supabase
        .from("google_connections")
        .update({
          access_token_enc: tokenResult.newAccessTokenEnc,
          expires_at: tokenResult.newExpiresAt!.toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", conn.id);
    }

    const searchQ = req.nextUrl.searchParams.get("q");
    const pageToken = req.nextUrl.searchParams.get("pageToken") ?? undefined;
    const pageSize = Math.min(
      parseInt(req.nextUrl.searchParams.get("pageSize") ?? "20", 10) || 20,
      50
    );

    // Build Drive query — sanitize to prevent query injection
    let driveQuery: string | undefined;
    if (searchQ) {
      const safe = searchQ.replace(/[\\'"]/g, "").slice(0, 200);
      if (safe) driveQuery = `name contains '${safe}'`;
    }

    const result = await listFiles(tokenResult.accessToken, {
      query: driveQuery,
      pageToken,
      pageSize,
      orderBy: "modifiedTime desc",
    });

    return NextResponse.json({
      ok: true,
      files: result.files,
      nextPageToken: result.nextPageToken ?? null,
    });
  } catch (err) {
    console.error("[drive/files] Error:", err);
    const message = err instanceof Error ? err.message : String(err);

    return NextResponse.json(
      { error: "Failed to list Drive files", message },
      { status: 500 }
    );
  }
}
