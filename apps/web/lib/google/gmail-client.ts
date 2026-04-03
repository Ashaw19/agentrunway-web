/**
 * Gmail API client — send emails via the authenticated user's Gmail account.
 *
 * Uses the Gmail REST API v1 to send RFC 2822 formatted messages.
 */

const GMAIL_SEND_URL =
  "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

export interface GmailSendParams {
  accessToken: string;
  to: string;
  subject: string;
  body: string;
  fromName?: string;
  fromEmail?: string;
  replyTo?: string;
}

/**
 * Build an RFC 2822 email and send it via Gmail API.
 * Returns the Gmail message ID on success.
 */
/** Strip CRLF characters to prevent email header injection */
function sanitizeHeader(value: string): string {
  return value.replace(/[\r\n]/g, "");
}

export async function sendGmail(params: GmailSendParams): Promise<string> {
  const { accessToken, to, subject, body, fromName, fromEmail, replyTo } =
    params;

  // Sanitize all header values to prevent CRLF injection
  const safeTo      = sanitizeHeader(to);
  const safeSubject = sanitizeHeader(subject);

  // Build MIME headers — send as HTML so formatting matches Outlook/SMTP
  const headers = [
    `To: ${safeTo}`,
    `Subject: ${safeSubject}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/html; charset="UTF-8"`,
  ];

  if (fromEmail) {
    const safeFromEmail = sanitizeHeader(fromEmail);
    const safeFromName  = fromName ? sanitizeHeader(fromName) : undefined;
    headers.unshift(
      safeFromName ? `From: ${safeFromName} <${safeFromEmail}>` : `From: ${safeFromEmail}`
    );
  }

  if (replyTo) {
    headers.push(`Reply-To: ${sanitizeHeader(replyTo)}`);
  }

  const raw = `${headers.join("\r\n")}\r\n\r\n${body}`;

  // Gmail API requires web-safe base64 encoding
  const encoded = Buffer.from(raw)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const res = await fetch(GMAIL_SEND_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw: encoded }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gmail send failed: ${res.status} — ${errText}`);
  }

  const json = (await res.json()) as { id: string };
  return json.id;
}
