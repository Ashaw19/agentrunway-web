/**
 * POST /api/email-connections/smtp/test
 *
 * Tests an SMTP connection by attempting to verify the transport.
 * Does NOT send any email — just checks host/port/auth connectivity.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";

// Block SSRF — reject private/internal/localhost hostnames
function isPrivateHost(host: string): boolean {
  const lower = host.toLowerCase().trim();
  if (lower === "localhost" || lower === "0.0.0.0" || lower === "[::]") return true;
  if (lower.endsWith(".local") || lower.endsWith(".internal")) return true;
  // IPv4 private ranges
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const m = lower.match(ipv4);
  if (m) {
    const [, a, b] = m.map(Number);
    if (a === 10) return true;                          // 10.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31) return true;   // 172.16.0.0/12
    if (a === 192 && b === 168) return true;             // 192.168.0.0/16
    if (a === 127) return true;                          // 127.0.0.0/8
    if (a === 169 && b === 254) return true;             // link-local
    if (a === 0) return true;                            // 0.0.0.0/8
  }
  return false;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Rate limit: 5 tests per hour
  const rl = await checkRateLimit(user.id, "smtp_test", 5, 60);
  if (!rl.allowed) {
    return new Response("Too many SMTP test requests. Please wait.", {
      status: 429,
      headers: rateLimitHeaders(rl),
    });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { smtp_host, smtp_port, smtp_username, smtp_password } = body as {
    smtp_host: string;
    smtp_port?: number;
    smtp_username?: string;
    smtp_password?: string;
  };

  if (!smtp_host) {
    return NextResponse.json({ error: "smtp_host is required." }, { status: 400 });
  }

  // Block private/internal hosts (SSRF protection)
  if (isPrivateHost(smtp_host)) {
    return NextResponse.json(
      { error: "Invalid SMTP host — private/internal addresses are not allowed." },
      { status: 400 }
    );
  }

  // Validate port range
  const port = smtp_port ?? 587;
  if (port < 1 || port > 65535) {
    return NextResponse.json({ error: "Invalid port number." }, { status: 400 });
  }

  try {
    const nodemailer = await import("nodemailer").catch(() => null);
    if (!nodemailer) {
      return NextResponse.json(
        { error: "SMTP support is not available." },
        { status: 503 }
      );
    }

    const port = smtp_port ?? 587;
    const transporter = nodemailer.default.createTransport({
      host: smtp_host,
      port,
      secure: port === 465,
      auth: smtp_username
        ? { user: smtp_username, pass: smtp_password ?? "" }
        : undefined,
      connectionTimeout: 10000, // 10s
      greetingTimeout: 10000,
    });

    await transporter.verify();

    return NextResponse.json({ ok: true, message: "SMTP connection verified successfully." });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, error: `SMTP test failed: ${message}` },
      { status: 422 }
    );
  }
}
