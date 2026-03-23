/**
 * Unified Email Sender
 *
 * Routes outbound email to the correct provider based on the user's
 * connected accounts. Priority order:
 *   1. Gmail (google_connections with gmail_send_enabled = true)
 *   2. Outlook / Microsoft Graph (email_connections with provider = 'microsoft')
 *   3. SMTP (email_connections with provider = 'smtp')
 *
 * Usage:
 *   const result = await sendEmail(supabase, userId, {
 *     to: "client@example.com",
 *     subject: "Following up",
 *     body: "Hi Jane, just wanted to check in...",
 *   });
 */

import { type SupabaseClient } from "@supabase/supabase-js";
import { sendGmail } from "@/lib/google/gmail-client";
import { getValidAccessToken, type GoogleConnection } from "@/lib/google/token-manager";

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

  // ── 1. Try Gmail ─────────────────────────────────────────────────────────────
  const { data: googleConn } = await supabase
    .from("google_connections")
    .select(
      "id, email_address, access_token_enc, refresh_token_enc, expires_at, gmail_send_enabled"
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (googleConn?.gmail_send_enabled) {
    try {
      const tokenResult = await getValidAccessToken(
        googleConn as unknown as GoogleConnection
      );

      // Persist refreshed token if needed
      if (tokenResult.refreshed && tokenResult.newAccessTokenEnc) {
        await supabase
          .from("google_connections")
          .update({
            access_token_enc: tokenResult.newAccessTokenEnc,
            expires_at: tokenResult.newExpiresAt!.toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", googleConn.id);
      }

      await sendGmail({
        accessToken: tokenResult.accessToken,
        to: input.to,
        fromEmail: googleConn.email_address,
        subject: input.subject,
        body: input.bodyText ?? input.body,
      });

      return { ok: true, provider: "gmail" };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, provider: "gmail", error: `Gmail send failed: ${message}` };
    }
  }

  // ── 2. Try Microsoft / Outlook ───────────────────────────────────────────────
  const { data: msConn } = await supabase
    .from("email_connections")
    .select("id, email_address, access_token, provider")
    .eq("user_id", userId)
    .eq("provider", "microsoft")
    .maybeSingle();

  if (msConn?.access_token) {
    try {
      const result = await sendMicrosoftEmail(msConn.access_token, {
        to: input.to,
        subject: input.subject,
        body: input.body,
      });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, provider: "microsoft", error: `Outlook send failed: ${message}` };
    }
  }

  // ── 3. Try SMTP ───────────────────────────────────────────────────────────────
  const { data: smtpConn } = await supabase
    .from("email_connections")
    .select("id, email_address, smtp_host, smtp_port, smtp_username, smtp_password_enc, provider")
    .eq("user_id", userId)
    .eq("provider", "smtp")
    .maybeSingle();

  if (smtpConn?.smtp_host) {
    try {
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
    error: "No email provider connected. Connect Gmail, Outlook, or SMTP in Settings.",
  };
}

// ── Microsoft Graph ───────────────────────────────────────────────────────────

async function sendMicrosoftEmail(
  accessToken: string,
  input: { to: string; subject: string; body: string }
): Promise<SendEmailResult> {
  const res = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: {
        subject: input.subject,
        body: {
          contentType: "HTML",
          content: input.body,
        },
        toRecipients: [
          {
            emailAddress: { address: input.to },
          },
        ],
      },
      saveToSentItems: true,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.status.toString());
    throw new Error(`Microsoft Graph API returned ${res.status}: ${text}`);
  }

  return { ok: true, provider: "microsoft" };
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

  const transporter = nodemailer.default.createTransport({
    host: conn.smtp_host,
    port: conn.smtp_port ?? 587,
    secure: (conn.smtp_port ?? 587) === 465,
    auth: conn.smtp_username
      ? {
          user: conn.smtp_username,
          pass: conn.smtp_password_enc ?? "",
        }
      : undefined,
  });

  await transporter.sendMail({
    from: conn.email_address,
    to: input.to,
    subject: input.subject,
    html: input.body,
  });

  return { ok: true, provider: "smtp" };
}
