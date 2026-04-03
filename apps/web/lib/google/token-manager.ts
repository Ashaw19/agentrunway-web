/**
 * Google OAuth token management — encryption, decryption, and auto-refresh.
 *
 * Tokens are encrypted at rest using AES-256-GCM. The encryption key is
 * stored in GOOGLE_TOKEN_ENCRYPTION_KEY (64-char hex = 32 bytes).
 */

import crypto from "crypto";

// ── Environment ──────────────────────────────────────────────────────────────

const GOOGLE_CLIENT_ID     = process.env.GOOGLE_CLIENT_ID ?? "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? "";
const ENCRYPTION_KEY_HEX   = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY ?? "";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

// ── Encryption helpers ───────────────────────────────────────────────────────

function getKey(): Buffer {
  if (!ENCRYPTION_KEY_HEX || ENCRYPTION_KEY_HEX.length !== 64) {
    throw new Error(
      "GOOGLE_TOKEN_ENCRYPTION_KEY must be a 64-char hex string (32 bytes)."
    );
  }
  return Buffer.from(ENCRYPTION_KEY_HEX, "hex");
}

/**
 * Encrypt a plaintext string → "iv:ciphertext:tag" (all hex-encoded).
 */
export function encrypt(plaintext: string): string {
  if (!ENCRYPTION_KEY_HEX) throw new Error("GOOGLE_TOKEN_ENCRYPTION_KEY is not configured");
  const key = getKey();
  const iv  = crypto.randomBytes(12); // 96-bit IV for GCM
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const tag = cipher.getAuthTag().toString("hex");

  return `${iv.toString("hex")}:${encrypted}:${tag}`;
}

/**
 * Decrypt an "iv:ciphertext:tag" string back to plaintext.
 */
export function decrypt(encoded: string): string {
  if (!ENCRYPTION_KEY_HEX) throw new Error("GOOGLE_TOKEN_ENCRYPTION_KEY is not configured");
  const key = getKey();
  const [ivHex, cipherHex, tagHex] = encoded.split(":");

  if (!ivHex || !cipherHex || !tagHex) {
    throw new Error("Malformed encrypted token — expected iv:ciphertext:tag");
  }

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(ivHex, "hex")
  );
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));

  let decrypted = decipher.update(cipherHex, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

// ── Token refresh ────────────────────────────────────────────────────────────

export interface TokenPair {
  access_token: string;
  expires_at: Date;
  new_refresh_token?: string; // Google may rotate refresh tokens
}

/**
 * Use a refresh token to obtain a new access token from Google.
 */
export async function refreshAccessToken(
  refreshTokenEnc: string
): Promise<TokenPair> {
  const refreshToken = decrypt(refreshTokenEnc);

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id:     GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type:    "refresh_token",
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google token refresh failed: ${res.status} — ${err}`);
  }

  const json = (await res.json()) as {
    access_token: string;
    expires_in: number;
    refresh_token?: string; // Google may rotate refresh tokens
  };

  return {
    access_token: json.access_token,
    expires_at: new Date(Date.now() + json.expires_in * 1000),
    new_refresh_token: json.refresh_token, // may be rotated
  };
}

// ── Convenience: get a valid access token ────────────────────────────────────

export interface GoogleConnection {
  id: string;
  access_token_enc: string;
  refresh_token_enc: string;
  expires_at: string; // ISO timestamp from DB
}

/**
 * Returns a valid (non-expired) access token. If the stored token is
 * expired or within 5 minutes of expiry, refreshes it first and returns
 * the new encrypted token + expiry for the caller to persist.
 */
export async function getValidAccessToken(conn: GoogleConnection): Promise<{
  accessToken: string;
  refreshed: boolean;
  newAccessTokenEnc?: string;
  newRefreshTokenEnc?: string;
  newExpiresAt?: Date;
}> {
  const expiresAt = new Date(conn.expires_at);
  const fiveMinFromNow = new Date(Date.now() + 5 * 60 * 1000);

  // Still valid — decrypt and return
  if (expiresAt > fiveMinFromNow) {
    return {
      accessToken: decrypt(conn.access_token_enc),
      refreshed: false,
    };
  }

  // Expired or expiring soon — refresh
  const result = await refreshAccessToken(conn.refresh_token_enc);

  return {
    accessToken: result.access_token,
    refreshed: true,
    newAccessTokenEnc: encrypt(result.access_token),
    newRefreshTokenEnc: result.new_refresh_token
      ? encrypt(result.new_refresh_token)
      : undefined,
    newExpiresAt: result.expires_at,
  };
}
