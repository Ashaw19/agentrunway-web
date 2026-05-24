/**
 * Pure URL parser for realtor.ca listing URLs.
 *
 * Accepts:
 *   https://www.realtor.ca/real-estate/27254789/...
 *   https://realtor.ca/real-estate/27254789/...
 *   https://www.realtor.ca/fr/immobilier/27254789/...
 *
 * Rejects everything else. Returns a discriminated union — never throws.
 *
 * Used by the /api/realtor-listing route to validate user-pasted URLs
 * before fetching the listing HTML page. See:
 *   - docs/superpowers/specs/2026-05-24-realtor-ca-listing-import-design.md
 *   - apps/web/lib/realtor-ca/fetch-listing.ts (downstream consumer)
 */

export type ParsedListingUrl =
  | { ok: true; listingId: string }
  | { ok: false; reason: "invalid_url" | "not_a_listing" };

// Captured group 1 = listing ID.
// `i` flag makes the path segments case-insensitive (some pasted URLs
// from email or CMS may have inconsistent casing on /Real-Estate/).
const LISTING_ID_RE = /realtor\.ca\/(?:fr\/)?(?:real-estate|immobilier)\/(\d+)\//i;

export function parseRealtorCaUrl(input: string): ParsedListingUrl {
  if (typeof input !== "string" || input.trim().length === 0) {
    return { ok: false, reason: "invalid_url" };
  }

  const trimmed = input.trim();

  // URL constructor throws on malformed input
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, reason: "invalid_url" };
  }

  const host = url.hostname.toLowerCase();
  if (host !== "realtor.ca" && host !== "www.realtor.ca") {
    return { ok: false, reason: "invalid_url" };
  }

  const match = trimmed.match(LISTING_ID_RE);
  if (!match) {
    return { ok: false, reason: "not_a_listing" };
  }

  return { ok: true, listingId: match[1] };
}
