/**
 * POST /api/email-connections/smtp/test
 *
 * Tests an SMTP connection by attempting to verify the transport.
 * Does NOT send any email — just checks host/port/auth connectivity.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { smtp_host, smtp_port, smtp_username, smtp_password } = body as {
    smtp_host: string;
    smtp_port?: number;
    smtp_username?: string;
    smtp_password?: string;
  };

  if (!smtp_host) {
    return NextResponse.json({ error: "smtp_host is required." }, { status: 400 });
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
