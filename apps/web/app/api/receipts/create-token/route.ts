/**
 * POST /api/receipts/create-token
 *
 * Creates a one-time upload token for the desktop → phone QR handoff mode.
 * - Requires an authenticated session.
 * - Token is a 64-char hex string, valid for 5 minutes, single-use.
 * - Returns { ok: true, tokenId, token, expiresAt, phoneOrigin } or { ok: false, error }.
 *
 * phoneOrigin: when the request comes from localhost, we return the machine's
 * LAN IP so the QR code encodes a URL the phone can actually reach.
 * On a real deployment (Vercel etc.) we just echo back the request origin.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient }              from "@/lib/supabase/server";
import { createAdminClient }         from "@/lib/supabase/admin";
import os                            from "os";

/**
 * Returns the first non-internal IPv4 address on this machine, or null.
 * Used so the QR code URL points to an address reachable by the phone.
 */
function getLocalNetworkIP(): string | null {
  for (const iface of Object.values(os.networkInterfaces())) {
    if (!iface) continue;
    for (const addr of iface) {
      if (addr.family === "IPv4" && !addr.internal) return addr.address;
    }
  }
  return null;
}

/**
 * Build the base URL the phone should use to open the receipt-upload page.
 *
 * Priority order:
 *  1. PHONE_BASE_URL env var — set this to an ngrok / tunnel URL in .env.local
 *     when your router uses AP isolation (phones can't reach the Mac directly).
 *     e.g. PHONE_BASE_URL=https://abc123.ngrok-free.app
 *  2. localhost → swap in the LAN IP so phones on the same Wi-Fi can reach it.
 *  3. Any other host (production domain) → use as-is.
 */
function resolvePhoneOrigin(req: NextRequest): string {
  // 1. Explicit tunnel override (ngrok, cloudflared, localtunnel, etc.)
  const override = process.env.PHONE_BASE_URL;
  if (override) return override.replace(/\/$/, "");

  const host  = req.headers.get("host") ?? "localhost:3000";
  const proto = req.headers.get("x-forwarded-proto") ?? "http";

  const isLocal =
    host.startsWith("localhost") || host.startsWith("127.0.0.1");

  if (isLocal) {
    const ip   = getLocalNetworkIP();
    const port = host.includes(":") ? host.split(":")[1] : "3000";
    return ip ? `http://${ip}:${port}` : `${proto}://${host}`;
  }

  return `${proto}://${host}`;
}

/** Generate a 64-character hex token using two UUIDs */
function generateToken(): string {
  return [crypto.randomUUID(), crypto.randomUUID()]
    .map((u) => u.replace(/-/g, ""))
    .join("");
}

export async function POST(
  req: NextRequest,
): Promise<NextResponse> {
  try {
    // ── 0. Resolve the origin the phone should use ─────────────────────────
    const phoneOrigin = resolvePhoneOrigin(req);

    // ── 1. Authenticate ────────────────────────────────────────────────────
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      console.error("[create-token] auth failed:", authError?.message);
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    // ── 2. Create token row via admin client (bypasses RLS) ────────────────
    let admin;
    try {
      admin = createAdminClient();
    } catch (adminErr) {
      const msg = adminErr instanceof Error ? adminErr.message : String(adminErr);
      console.error("[create-token] createAdminClient failed:", msg);
      return NextResponse.json({ ok: false, error: "Service unavailable" }, { status: 500 });
    }

    const token = generateToken();

    const { data, error } = await admin
      .from("receipt_upload_tokens")
      .insert({
        user_id: user.id,
        token,
      })
      .select("id, token, expires_at")
      .single();

    if (error || !data) {
      const msg = error?.message ?? "no data returned";
      console.error("[create-token] insert failed:", msg, error?.details, error?.hint);
      return NextResponse.json(
        { ok: false, error: "Failed to create upload token" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok:          true,
      tokenId:     (data as Record<string, unknown>).id,
      token:       (data as Record<string, unknown>).token,
      expiresAt:   (data as Record<string, unknown>).expires_at,
      phoneOrigin, // LAN IP on localhost, real domain in production
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[create-token] unhandled exception:", msg);
    return NextResponse.json(
      { ok: false, error: "An unexpected error occurred" },
      { status: 500 },
    );
  }
}
