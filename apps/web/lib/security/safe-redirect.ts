/**
 * lib/security/safe-redirect.ts
 *
 * Sanitizes a user-supplied redirect parameter to prevent open redirect
 * attacks. Returns a safe same-origin pathname, or the provided fallback
 * if the input is missing, invalid, or points off-origin.
 *
 * Uses `new URL()` parsing (rather than string-prefix checks like
 * `startsWith("/") && !startsWith("//")`) so URL-encoded or otherwise
 * malformed payloads can't bypass validation. The parsed URL's origin
 * and pathname are both checked.
 *
 * Usage:
 *
 *   // Server-side (middleware, route handlers)
 *   const next = sanitizeRedirect(
 *     request.nextUrl.searchParams.get("redirect"),
 *     request.nextUrl.origin,
 *   );
 *
 *   // Client-side
 *   const next = sanitizeRedirect(
 *     new URLSearchParams(window.location.search).get("redirect"),
 *     window.location.origin,
 *   );
 */

export function sanitizeRedirect(
  param: string | null | undefined,
  origin: string,
  fallback = "/dashboard",
): string {
  if (!param) return fallback;
  try {
    const resolved = new URL(param, origin);
    if (
      resolved.origin === origin &&
      resolved.pathname.startsWith("/") &&
      !resolved.pathname.startsWith("//")
    ) {
      return resolved.pathname;
    }
  } catch {
    // Invalid URL — fall through to fallback
  }
  return fallback;
}
