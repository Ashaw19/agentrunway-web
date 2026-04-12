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
import { isPrivateHost } from "@/lib/ssrf-guard";

// ── POST: Add / update SMTP connection ───────────────────────────────────────

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

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

  // SSRF: block private/internal hosts at save time (not just test time)
  if (await isPrivateHost(smtp_host)) {
    return NextResponse.json(
      { error: "SMTP host resolves to a private/internal address." },
      { status: 400 }
    );
  }

  // Port validation
  const port = smtp_port ?? 587;
  if (port < 1 || port > 65535) {
    return NextResponse.json(
      { error: "SMTP port must be between 1 and 65535." },
      { status: 400 }
    );
  }

  // Build upsert payload — only include password if provided (don't wipe existing on update)
  const upsertPayload: Record<string, unknown> = {
    user_id: user.id,
    provider: "smtp",
    email_address,
    connection_name: connection_name || `SMTP (${smtp_host})`,
    smtp_host,
    smtp_port: port,
    smtp_username: smtp_username || null,
    updated_at: new Date().toISOString(),
  };

  if (smtp_password) {
    upsertPayload.smtp_password_enc = encrypt(smtp_password);
  }

  const { error } = await supabase
    .from("email_connections")
    .upsert(upsertPayload, { onConflict: "user_id,provider" });

  if (error) {
    console.error("[smtp/save] Upsert error:", error.message);
    return NextResponse.json({ error: "Failed to save SMTP connection." }, { status: 500 });
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

  const { error } = await supabase
    .from("email_connections")
    .delete()
    .eq("user_id", user.id)
    .eq("provider", "smtp");

  if (error) {
    console.error("[smtp/delete] Error:", error.message);
    return NextResponse.json({ error: "Failed to remove SMTP connection." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
