/**
 * POST /api/plaid/webhook
 *
 * Receives Plaid webhook events (TRANSACTIONS_SYNC_UPDATES_AVAILABLE,
 * ITEM_ERROR, etc.) and triggers incremental sync when new transaction
 * data is available.
 *
 * SECURITY: Every request is verified using Plaid's JWT webhook signature
 * before any processing occurs. Unverified requests are rejected with 401.
 *
 * Plaid webhook verification reference:
 * https://plaid.com/docs/api/webhooks/webhook-verification/
 */

import { NextRequest, NextResponse } from "next/server";
import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";
import { createAdminClient } from "@/lib/supabase/admin";
import { withRetry } from "@/lib/retry";
import { log } from "@/lib/logger";
import crypto from "crypto";

// ── Plaid client factory ──────────────────────────────────────────────────────
function buildPlaidClient() {
  const env = (process.env.PLAID_ENV ?? "sandbox") as keyof typeof PlaidEnvironments;
  const config = new Configuration({
    basePath: PlaidEnvironments[env],
    baseOptions: {
      headers: {
        "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID ?? "",
        "PLAID-SECRET": process.env.PLAID_SECRET ?? "",
      },
    },
  });
  return new PlaidApi(config);
}

// ── JWK cache (Plaid rotates keys periodically; cache for 5 min) ─────────────
// Bridge Node.js webcrypto.CryptoKey and global CryptoKey for @types/node ≥ 25
type SubtleCryptoKey = Awaited<ReturnType<typeof crypto.subtle.importKey>>;

interface JWKCacheEntry {
  keys: Record<string, { key: SubtleCryptoKey; alg: string }>;
  fetchedAt: number;
}
let jwkCache: JWKCacheEntry | null = null;
const JWK_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Fetches Plaid's public JWK set and returns a map of kid → CryptoKey.
 * Keys are cached for 5 minutes to avoid repeated round-trips.
 */
async function getPlaidJWKs(): Promise<Record<string, { key: SubtleCryptoKey; alg: string }>> {
  const now = Date.now();
  if (jwkCache && now - jwkCache.fetchedAt < JWK_CACHE_TTL_MS) {
    return jwkCache.keys;
  }

  const env = process.env.PLAID_ENV ?? "sandbox";
  // Plaid's JWK endpoint differs per environment
  const jwkUrl =
    env === "production"
      ? "https://production.plaid.com/openid/certs"
      : env === "development"
        ? "https://development.plaid.com/openid/certs"
        : "https://sandbox.plaid.com/openid/certs";

  const res = await fetch(jwkUrl, { next: { revalidate: 0 } });
  if (!res.ok) {
    throw new Error(`Failed to fetch Plaid JWKs: ${res.status}`);
  }

  // Use a wider type to access JWK fields not present in TypeScript's JsonWebKey
  type RawJWK = JsonWebKey & { kid?: string; alg?: string };
  const { keys } = (await res.json()) as { keys: RawJWK[] };
  const result: Record<string, { key: SubtleCryptoKey; alg: string }> = {};

  for (const jwk of keys) {
    const kid = jwk.kid;
    if (!kid) continue;
    const alg = jwk.alg ?? "ES256";
    const cryptoAlg =
      alg === "ES256"
        ? { name: "ECDSA", namedCurve: "P-256" }
        : alg === "RS256"
          ? { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }
          : null;
    if (!cryptoAlg) continue;
    try {
      const key = await crypto.subtle.importKey(
        "jwk",
        jwk as JsonWebKey,
        cryptoAlg,
        false,
        ["verify"],
      );
      result[kid] = { key, alg };
    } catch {
      // skip keys we can't import
    }
  }

  jwkCache = { keys: result, fetchedAt: now };
  return result;
}

/**
 * Decodes a base64url string to a Uint8Array without adding padding.
 */
function base64urlDecode(s: string): Uint8Array {
  const base64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

/**
 * Verifies the Plaid webhook signature JWT.
 *
 * Plaid sends a JWT in the `Plaid-Verification` header. The JWT payload
 * contains a SHA-256 hash of the raw request body. We must:
 * 1. Decode the JWT header to find the signing key (kid).
 * 2. Fetch the corresponding public key from Plaid's JWK endpoint.
 * 3. Verify the JWT signature.
 * 4. Compare the body hash in the JWT payload with the actual request body.
 *
 * @returns true if the webhook is authentic; false otherwise.
 */
async function verifyPlaidWebhook(
  verificationHeader: string,
  rawBody: string,
): Promise<boolean> {
  try {
    // 1. Split the JWT
    const parts = verificationHeader.split(".");
    if (parts.length !== 3) return false;
    const [headerB64, payloadB64, signatureB64] = parts;

    // 2. Decode the header to get kid and alg
    const headerJson = JSON.parse(new TextDecoder().decode(base64urlDecode(headerB64)));
    const kid: string | undefined = headerJson.kid;
    if (!kid) return false;

    // 3. Fetch JWKs and find the matching key
    const jwks = await getPlaidJWKs();
    const jwkEntry = jwks[kid];
    if (!jwkEntry) {
      // Key not found — refresh cache once and retry
      jwkCache = null;
      const freshJwks = await getPlaidJWKs();
      if (!freshJwks[kid]) return false;
    }
    const { key, alg } = jwkEntry ?? (await getPlaidJWKs())[kid];

    // 4. Verify the JWT signature
    const signingInput = `${headerB64}.${payloadB64}`;
    const signature = base64urlDecode(signatureB64);
    const data = new TextEncoder().encode(signingInput);

    const cryptoAlg =
      alg === "ES256"
        ? { name: "ECDSA", hash: "SHA-256" }
        : { name: "RSASSA-PKCS1-v1_5" };

    const valid = await crypto.subtle.verify(
      cryptoAlg,
      key,
      signature as unknown as ArrayBuffer,
      data as unknown as ArrayBuffer,
    );
    if (!valid) return false;

    // 5. Decode the payload and verify the body hash
    const payload = JSON.parse(new TextDecoder().decode(base64urlDecode(payloadB64)));
    const claimedBodyHash: string | undefined = payload.request_body_sha256;
    if (!claimedBodyHash) return false;

    const actualBodyHash = crypto
      .createHash("sha256")
      .update(rawBody, "utf8")
      .digest("hex");

    return claimedBodyHash === actualBodyHash;
  } catch (err) {
    log.error({ err }, "[plaid/webhook] Verification error");
    return false;
  }
}

// ── Webhook handler ───────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();

  // ── 1. Guard: Plaid not configured ─────────────────────────────────────────
  if (!process.env.PLAID_CLIENT_ID || process.env.PLAID_CLIENT_ID === "your_plaid_client_id_here") {
    return NextResponse.json({ error: "Plaid not configured" }, { status: 503 });
  }

  // ── 2. Read raw body (must be read before any other parsing) ───────────────
  const rawBody = await req.text();

  // ── 3. Verify webhook signature ────────────────────────────────────────────
  const verificationHeader = req.headers.get("Plaid-Verification");
  if (!verificationHeader) {
    log.warn({ requestId }, "[plaid/webhook] Missing Plaid-Verification header — rejecting");
    return NextResponse.json({ error: "Missing verification header" }, { status: 401 });
  }

  const isAuthentic = await verifyPlaidWebhook(verificationHeader, rawBody);
  if (!isAuthentic) {
    log.warn({ requestId }, "[plaid/webhook] Signature verification FAILED — rejecting");
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
  }

  // ── 4. Parse webhook payload ───────────────────────────────────────────────
  let payload: {
    webhook_type: string;
    webhook_code: string;
    item_id: string;       // Plaid's item_id (not our DB UUID)
    error?: unknown;
  };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { webhook_type, webhook_code, item_id: plaid_item_id } = payload;
  log.info({ webhook_type, webhook_code, plaid_item_id, requestId }, "[plaid/webhook] event received");

  const admin = createAdminClient();

  // ── 5. Idempotency guard ───────────────────────────────────────────────────
  // Plaid guarantees at-least-once delivery. Deduplicate using a SHA-256 hash
  // of the raw body as the event key (duplicate webhooks are byte-identical).
  // Reuses the stripe_events table with a "plaid:" prefix to avoid a new migration.
  const bodyHash = crypto.createHash("sha256").update(rawBody, "utf8").digest("hex");
  const idempotencyKey = `plaid:${bodyHash}`;

  const { error: idempotencyError } = await admin
    .from("stripe_events")
    .insert({ event_id: idempotencyKey });

  if (idempotencyError) {
    if (idempotencyError.code === "23505") {
      // Duplicate webhook — already processed
      log.info({ key: idempotencyKey.slice(0, 20), requestId }, "[plaid/webhook] duplicate event ignored");
      return NextResponse.json({ received: true });
    }
    // Unexpected DB error — log but continue rather than silently dropping the event
    log.error({ error: idempotencyError.message, requestId }, "[plaid/webhook] failed to record idempotency key");
  }

  // ── 5. Handle TRANSACTIONS webhooks ────────────────────────────────────────
  if (webhook_type === "TRANSACTIONS") {
    if (
      webhook_code === "SYNC_UPDATES_AVAILABLE" ||
      webhook_code === "INITIAL_UPDATE" ||
      webhook_code === "HISTORICAL_UPDATE"
    ) {
      // Look up our DB UUID for this Plaid item_id
      const { data: item } = await admin
        .from("plaid_items")
        .select("id, user_id, access_token, sync_cursor")
        .eq("plaid_item_id", plaid_item_id)
        .single();

      if (item) {
        try {
          const plaid = buildPlaidClient();
          let cursor = item.sync_cursor ?? undefined;
          let addedCount = 0, modifiedCount = 0, removedCount = 0;

          // Paginated incremental sync
          while (true) {
            const syncResp = await withRetry(
              () => plaid.transactionsSync({ access_token: item.access_token, cursor, count: 500 }),
              { label: "plaid/webhook/transactionsSync", attempts: 3 },
            );
            const { added, modified, removed, next_cursor, has_more } = syncResp.data;

            if (added.length > 0) {
              const rows = added.map((tx) => ({
                user_id: item.user_id,
                plaid_item_id: item.id,
                plaid_transaction_id: tx.transaction_id,
                plaid_account_id: tx.account_id,
                transaction_date: tx.date,
                merchant_name: tx.merchant_name ?? null,
                description: tx.name,
                amount: tx.amount,
                review_status: "pending" as const,
                suggested_category: null,
                suggestion_confidence: null,
              }));
              await admin
                .from("plaid_transactions")
                .upsert(rows, { onConflict: "user_id,plaid_transaction_id", ignoreDuplicates: true });
              addedCount += added.length;
            }

            if (modified.length > 0) {
              for (const tx of modified) {
                await admin
                  .from("plaid_transactions")
                  .update({
                    merchant_name: tx.merchant_name ?? null,
                    description: tx.name,
                    amount: tx.amount,
                  })
                  .eq("plaid_transaction_id", tx.transaction_id)
                  .eq("user_id", item.user_id);
              }
              modifiedCount += modified.length;
            }

            if (removed.length > 0) {
              const removedIds = removed.map((r) => r.transaction_id);
              await admin
                .from("plaid_transactions")
                .delete()
                .in("plaid_transaction_id", removedIds)
                .eq("user_id", item.user_id);
              removedCount += removed.length;
            }

            cursor = next_cursor;
            if (!has_more) break;
          }

          await admin
            .from("plaid_items")
            .update({ sync_cursor: cursor, last_synced_at: new Date().toISOString() })
            .eq("id", item.id);

          log.info({ addedCount, modifiedCount, removedCount, requestId }, "[plaid/webhook] sync complete");
        } catch (err) {
          log.error({ err, plaid_item_id, requestId }, "[plaid/webhook] sync error");
          // Return 200 so Plaid doesn't retry — we'll resync on next user action
        }
      }
    }
  }

  // ── 6. Handle ITEM webhooks ────────────────────────────────────────────────
  if (webhook_type === "ITEM" && webhook_code === "ERROR") {
    const plaidErr = payload.error as { error_code?: string; error_message?: string } | undefined;
    log.error({ plaid_item_id, error: plaidErr, requestId }, "[plaid/webhook] ITEM ERROR");

    await admin
      .from("plaid_items")
      .update({
        error_code: plaidErr?.error_code ?? "UNKNOWN_ERROR",
        error_message: plaidErr?.error_message ?? "An error occurred with this bank connection.",
      })
      .eq("plaid_item_id", plaid_item_id);
  }

  // Always return 200 to acknowledge receipt
  return NextResponse.json({ received: true });
}
