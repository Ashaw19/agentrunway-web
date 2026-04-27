/**
 * Unified Email Sender
 *
 * Gmail and Microsoft Graph paths were CASA-shelved (see
 * memory/project_google_integrations.md). Until CASL compliance and a
 * sending-domain policy land, only SMTP is supported. Restoring the
 * Google / Microsoft branches will require restoring the imports and
 * the dispatch logic, not just flipping a flag.
 */

import { type SupabaseClient } from "@supabase/supabase-js";
import { decrypt } from "@/lib/google/token-manager";
import { isPrivateHost } from "@/lib/ssrf-guard";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface SendEmailInput {
  to: string;
  subject: string;
  body: string;
  /** Optional plain-text version. Falls back to stripping HTML from body. */
  bodyText?: string;
}

export interface SendEmailResult {
  ok: boolean;
  provider?: "gmail" | "microsoft" | "smtp";
  error?: string;
}

// ── Main ───────────────────────────────────────────────────────────────────────

export async function sendEmail(
  supabase: SupabaseClient,
  userId: string,
  input: SendEmailInput
): Promise<SendEmailResult> {
  // SMTP only — see file header. Belt-and-suspenders defence even if a
  // future caller bypasses this dispatcher: the Gmail/Microsoft branches
  // were stripped, the imports removed, and the unauthenticated routes
  // were already taken down (commits 3a7aea5 / 2304040).

  const { data: smtpConn } = await supabase
    .from("email_connections")
    .select("id, email_address, smtp_host, smtp_port, smtp_username, smtp_password_enc, provider")
    .eq("user_id", userId)
    .eq("provider", "smtp")
    .maybeSingle();

  if (smtpConn?.smtp_host) {
    try {
      // SSRF check at send time (not just save time) to prevent DNS rebinding
      if (await isPrivateHost(smtpConn.smtp_host)) {
        return { ok: false, provider: "smtp", error: "SMTP host resolves to a private/internal address" };
      }
      const result = await sendSmtpEmail(smtpConn, {
        to: input.to,
        subject: input.subject,
        body: input.body,
      });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, provider: "smtp", error: `SMTP send failed: ${message}` };
    }
  }

  // ── No provider connected ────────────────────────────────────────────────────
  return {
    ok: false,
    error: "No email provider connected. Connect SMTP in Settings.",
  };
}

// ── SMTP via nodemailer ───────────────────────────────────────────────────────

async function sendSmtpEmail(
  conn: {
    email_address: string;
    smtp_host: string;
    smtp_port: number | null;
    smtp_username: string | null;
    smtp_password_enc: string | null;
  },
  input: { to: string; subject: string; body: string }
): Promise<SendEmailResult> {
  // Dynamic import to avoid bundling nodemailer in the main chunk
  const nodemailer = await import("nodemailer").catch(() => null);
  if (!nodemailer) {
    throw new Error("nodemailer is not installed. Run: pnpm add nodemailer @types/nodemailer");
  }

  // Decrypt the stored password before use
  let smtpPassword = "";
  if (conn.smtp_password_enc) {
    try {
      smtpPassword = decrypt(conn.smtp_password_enc);
    } catch {
      throw new Error("Failed to decrypt SMTP password — connection may be corrupted");
    }
  }

  const transporter = nodemailer.default.createTransport({
    host: conn.smtp_host,
    port: conn.smtp_port ?? 587,
    secure: (conn.smtp_port ?? 587) === 465,
    auth: conn.smtp_username
      ? {
          user: conn.smtp_username,
          pass: smtpPassword,
        }
      : undefined,
  });

  await transporter.sendMail({
    from: conn.email_address,
    to: input.to,
    subject: input.subject,
    html: input.body,
    text: input.body.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]*>/g, ""),
  });

  return { ok: true, provider: "smtp" };
}
