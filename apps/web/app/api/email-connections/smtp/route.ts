/**
 * POST /api/email-connections/smtp — Add or update an SMTP email connection
 * DELETE /api/email-connections/smtp — Remove an SMTP connection
 *
 * Supports any email provider that offers SMTP access (Yahoo, custom domains,
 * ISP email, etc.). Passwords are encrypted at rest using AES-256-GCM.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { encrypt } from "@/lib/google/token-manager";

// ── POST: Add / update SMTP connection ───────────────────────────────────────

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Block in sandbox mode
  const { data: sbCheck } = await supabase
    .from("user_settings")
    .select("sandbox_mode")
    .eq("user_id", user.id)
    .single();
  if (sbCheck?.sandbox_mode === true) {
    return NextResponse.json({ error: "Blocked in sandbox mode." }, { status: 403 });
  }

  const body = await req.json();
  const {
    email_address,
    connection_name,
    smtp_host,
    smtp_port,
    smtp_username,
    smtp_password,
  } = body as {
    email_address: string;
    connection_name?: string;
    smtp_host: string;
    smtp_port?: number;
    smtp_username?: string;
    smtp_password?: string;
  };

  // Validate required fields
  if (!email_address || !smtp_host) {
    return NextResponse.json(
      { error: "email_address and smtp_host are required." },
      { status: 400 }
    );
  }

  // Basic email validation
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email_address)) {
    return NextResponse.json(
      { error: "Invalid email address format." },
      { status: 400 }
    );
  }

  // Encrypt password if provided
  const passwordEnc = smtp_password ? encrypt(smtp_password) : null;

  const { error } = await supabase
    .from("email_connections")
    .upsert(
      {
        user_id: user.id,
        provider: "smtp",
        email_address,
        connection_name: connection_name || `SMTP (${smtp_host})`,
        smtp_host,
        smtp_port: smtp_port ?? 587,
        smtp_username: smtp_username || null,
        smtp_password_enc: passwordEnc,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,provider" }
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

// ── DELETE: Remove SMTP connection ───────────────────────────────────────────

export async function DELETE() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Block in sandbox mode
  const { data: sbCheck } = await supabase
    .from("user_settings")
    .select("sandbox_mode")
    .eq("user_id", user.id)
    .single();
  if (sbCheck?.sandbox_mode === true) {
    return NextResponse.json({ error: "Blocked in sandbox mode." }, { status: 403 });
  }

  const { error } = await supabase
    .from("email_connections")
    .delete()
    .eq("user_id", user.id)
    .eq("provider", "smtp");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
