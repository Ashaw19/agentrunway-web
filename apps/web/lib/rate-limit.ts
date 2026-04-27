/**
 * lib/rate-limit.ts
 *
 * Fixed-window rate limiter backed by Supabase (rate_limits table).
 *
 * One row per (user_id, endpoint) tracks the current window's start time
 * and request count. On each call we either:
 *   • Reset the window (if the previous window has expired) and allow
 *   • Increment the count and allow (if under the limit)
 *   • Return { allowed: false } (if at or over the limit)
 *
 * Uses the admin (service_role) client so RLS doesn't interfere.
 *
 * Race-condition tolerance: under very high concurrent load two simultaneous
 * requests near the limit boundary may both be allowed. This is acceptable
 * for abuse-prevention rate limiting (a handful of extra requests getting
 * through is far better than the complexity of distributed locks).
 */

import { createAdminClient } from "@/lib/supabase/admin";

export interface RateLimitResult {
  /** Whether the request is allowed to proceed */
  allowed: boolean;
  /** Requests remaining in the current window */
  remaining: number;
  /** When the current window resets (for Retry-After / X-RateLimit-Reset) */
  resetAt: Date;
}

/**
 * Check and increment the rate limit for a user/endpoint pair.
 *
 * @param userId       - Supabase auth user ID
 * @param endpoint     - Stable identifier for the route (e.g. "chat", "import-history")
 * @param maxRequests  - Maximum requests allowed per window
 * @param windowMinutes - Window length in minutes (default: 60)
 */
export async function checkRateLimit(
  userId: string,
  endpoint: string,
  maxRequests: number,
  windowMinutes = 60,
): Promise<RateLimitResult> {
  const admin = createAdminClient();

  // Align window to fixed boundaries (e.g. 60-min window → top of each hour)
  const now = Date.now();
  const windowMs = windowMinutes * 60 * 1000;
  const windowStart = new Date(Math.floor(now / windowMs) * windowMs);
  const resetAt = new Date(windowStart.getTime() + windowMs);

  // Read the current record for this user + endpoint
  const { data: existing, error: selectError } = await admin
    .from("rate_limits")
    .select("window_start, request_count")
    .eq("user_id", userId)
    .eq("endpoint", endpoint)
    .maybeSingle();

  if (selectError) {
    // On DB error, fail open: let the request through rather than blocking
    // legitimate users because of an infrastructure hiccup.
    console.error("[rate-limit] select error:", selectError.message);
    return { allowed: true, remaining: maxRequests, resetAt };
  }

  const isNewWindow =
    !existing || new Date(existing.window_start) < windowStart;

  if (isNewWindow) {
    // Start a fresh window with count = 1
    const { error: upsertError } = await admin.from("rate_limits").upsert(
      {
        user_id: userId,
        endpoint,
        window_start: windowStart.toISOString(),
        request_count: 1,
      },
      { onConflict: "user_id,endpoint" },
    );
    if (upsertError) {
      console.error("[rate-limit] upsert error:", upsertError.message);
    }
    return { allowed: true, remaining: maxRequests - 1, resetAt };
  }

  // Still in the current window
  const newCount = existing.request_count + 1;

  if (newCount > maxRequests) {
    // Over limit — don't increment (avoid unnecessary writes)
    return { allowed: false, remaining: 0, resetAt };
  }

  // Under limit — increment and allow
  const { error: updateError } = await admin
    .from("rate_limits")
    .update({ request_count: newCount })
    .eq("user_id", userId)
    .eq("endpoint", endpoint);

  if (updateError) {
    console.error("[rate-limit] update error:", updateError.message);
  }

  return { allowed: true, remaining: maxRequests - newCount, resetAt };
}

/**
 * Check and increment a rate limit for an unauthenticated identifier
 * (e.g. hashed IP). Stored in `public_rate_limits` (key TEXT primary key)
 * because the auth-keyed `rate_limits` table has a UUID FK to auth.users
 * that cannot accept arbitrary IP strings.
 *
 * @param key           - Stable string identifier (hash of IP)
 * @param endpoint      - Stable identifier for the route
 * @param maxRequests   - Maximum requests allowed per window
 * @param windowMinutes - Window length in minutes (default: 60)
 */
export async function checkPublicRateLimit(
  key: string,
  endpoint: string,
  maxRequests: number,
  windowMinutes = 60,
): Promise<RateLimitResult> {
  const admin = createAdminClient();

  const now = Date.now();
  const windowMs = windowMinutes * 60 * 1000;
  const windowStart = new Date(Math.floor(now / windowMs) * windowMs);
  const resetAt = new Date(windowStart.getTime() + windowMs);

  const { data: existing, error: selectError } = await admin
    .from("public_rate_limits")
    .select("window_start, request_count")
    .eq("key", key)
    .eq("endpoint", endpoint)
    .maybeSingle();

  if (selectError) {
    console.error("[rate-limit:public] select error:", selectError.message);
    return { allowed: true, remaining: maxRequests, resetAt };
  }

  const isNewWindow =
    !existing || new Date(existing.window_start) < windowStart;

  if (isNewWindow) {
    const { error: upsertError } = await admin.from("public_rate_limits").upsert(
      {
        key,
        endpoint,
        window_start: windowStart.toISOString(),
        request_count: 1,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key,endpoint" },
    );
    if (upsertError) {
      console.error("[rate-limit:public] upsert error:", upsertError.message);
    }
    return { allowed: true, remaining: maxRequests - 1, resetAt };
  }

  const newCount = existing.request_count + 1;

  if (newCount > maxRequests) {
    return { allowed: false, remaining: 0, resetAt };
  }

  const { error: updateError } = await admin
    .from("public_rate_limits")
    .update({ request_count: newCount, updated_at: new Date().toISOString() })
    .eq("key", key)
    .eq("endpoint", endpoint);

  if (updateError) {
    console.error("[rate-limit:public] update error:", updateError.message);
  }

  return { allowed: true, remaining: maxRequests - newCount, resetAt };
}

/**
 * Hash a request IP into a short opaque key for use with
 * checkPublicRateLimit. SHA-256 is overkill but cheap; we slice to 16
 * hex chars (64 bits) to keep rows small without meaningfully reducing
 * collision resistance for limiter purposes.
 */
export async function ipKey(ip: string): Promise<string> {
  const data = new TextEncoder().encode(ip);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Build standard rate-limit response headers for 429 responses.
 * Helps clients (and the browser) know when to retry.
 */
export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.floor(result.resetAt.getTime() / 1000)),
    "Retry-After": String(Math.ceil((result.resetAt.getTime() - Date.now()) / 1000)),
  };
}
