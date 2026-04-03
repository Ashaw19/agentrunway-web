/**
 * Microsoft OAuth token management — refresh expired access tokens.
 *
 * Tokens are encrypted at rest using the same AES-256-GCM key as Google tokens
 * (GOOGLE_TOKEN_ENCRYPTION_KEY). Encryption/decryption functions are imported
 * from the shared google/token-manager module.
 */

import { encrypt, decrypt } from "@/lib/google/token-manager";

// ── Environment ──────────────────────────────────────────────────────────────

const MS_CLIENT_ID     = process.env.MICROSOFT_CLIENT_ID ?? "";
const MS_CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET ?? "";
const MS_TOKEN_URL     = "https://login.microsoftonline.com/common/oauth2/v2.0/token";

// ── Token refresh ────────────────────────────────────────────────────────────

export interface MicrosoftTokenPair {
  access_token: string;
  expires_at: Date;
  new_refresh_token?: string; // Microsoft may rotate refresh tokens
}

/**
 * Use a refresh token to obtain a new access token from Microsoft.
 */
export async function refreshMicrosoftToken(
  refreshTokenEnc: string
): Promise<MicrosoftTokenPair> {
  const refreshToken = decrypt(refreshTokenEnc);

  const res = await fetch(MS_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id:     MS_CLIENT_ID,
      client_secret: MS_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type:    "refresh_token",
      scope:         "openid email Mail.Send Calendars.ReadWrite offline_access",
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Microsoft token refresh failed: ${res.status} — ${err}`);
  }

  const json = (await res.json()) as {
    access_token: string;
    expires_in: number;
    refresh_token?: string;
  };

  return {
    access_token: json.access_token,
    expires_at: new Date(Date.now() + json.expires_in * 1000),
    new_refresh_token: json.refresh_token, // may be rotated
  };
}

// ── Convenience: get a valid access token ────────────────────────────────────

export interface MicrosoftConnection {
  id: string;
  access_token_enc: string;
  refresh_token_enc: string;
  expires_at: string; // ISO timestamp from DB
}

/**
 * Returns a valid (non-expired) access token. If the stored token is
 * expired or within 5 minutes of expiry, refreshes it first and returns
 * updated encrypted values for the caller to persist.
 */
export async function getValidMicrosoftToken(conn: MicrosoftConnection): Promise<{
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
  const result = await refreshMicrosoftToken(conn.refresh_token_enc);

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

// Re-export encrypt/decrypt for convenience
export { encrypt, decrypt };
