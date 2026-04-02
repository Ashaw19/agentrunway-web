/**
 * Email Unsubscribe Token Utilities
 *
 * Generates and verifies HMAC-SHA256 signed tokens for one-click email
 * unsubscribe links. Tokens encode the user_id and email type so they
 * can be verified without a database lookup.
 *
 * Requires env var: EMAIL_UNSUBSCRIBE_SECRET
 */

import { createHmac } from "crypto";

const SECRET_ENV = "EMAIL_UNSUBSCRIBE_SECRET";

function getSecret(): string {
  const secret = process.env[SECRET_ENV];
  if (!secret) throw new Error(`Missing env var: ${SECRET_ENV}`);
  return secret;
}

/**
 * Build the payload string that gets signed.
 * Format: "unsubscribe:<type>:<userId>"
 */
function payload(userId: string, type: string): string {
  return `unsubscribe:${type}:${userId}`;
}

/**
 * Generate a signed unsubscribe token.
 * Returns a URL-safe base64 string: <base64(payload)>.<base64(signature)>
 */
export function generateUnsubscribeToken(
  userId: string,
  type: string
): string {
  const data = payload(userId, type);
  const sig = createHmac("sha256", getSecret()).update(data).digest("base64url");
  const encodedData = Buffer.from(data).toString("base64url");
  return `${encodedData}.${sig}`;
}

/**
 * Verify a token and return the decoded { userId, type } or null if invalid.
 */
export function verifyUnsubscribeToken(
  token: string
): { userId: string; type: string } | null {
  try {
    const [encodedData, sig] = token.split(".");
    if (!encodedData || !sig) return null;

    const data = Buffer.from(encodedData, "base64url").toString("utf-8");
    const expectedSig = createHmac("sha256", getSecret())
      .update(data)
      .digest("base64url");

    // Constant-time comparison
    if (sig.length !== expectedSig.length) return null;
    const a = Buffer.from(sig);
    const b = Buffer.from(expectedSig);
    if (!a.equals(b)) return null;

    // Parse payload: "unsubscribe:<type>:<userId>"
    const parts = data.split(":");
    if (parts.length !== 3 || parts[0] !== "unsubscribe") return null;

    return { type: parts[1], userId: parts[2] };
  } catch {
    return null;
  }
}

/**
 * Build the full unsubscribe URL for inclusion in emails.
 */
export function buildUnsubscribeUrl(
  userId: string,
  type: string,
  baseUrl = "https://agentrunway.ca"
): string {
  const token = generateUnsubscribeToken(userId, type);
  return `${baseUrl}/api/email/unsubscribe?token=${encodeURIComponent(token)}&type=${encodeURIComponent(type)}`;
}
