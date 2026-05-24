/**
 * Fetches a realtor.ca listing HTML page and extracts property data from
 * the embedded JSON-LD Product schema.
 *
 * Why HTML + JSON-LD instead of the JSON API:
 * The unofficial JSON API at api2.realtor.ca is gated by Imperva/Incapsula's
 * JavaScript challenge and is not reachable from server-side fetchers
 * (confirmed by spike 2026-05-24). The user-facing HTML pages embed a
 * Schema.org Product block with everything we need: name (address),
 * image[] (photos), description (public remarks), offers[0].price (asking
 * price). Schema.org is a public standard, so this surface is more stable
 * than an undocumented internal API.
 *
 * Bot-wall caveat: rapid requests still trigger Incapsula even on the HTML
 * pages. Production must use a real-browser UA + full standard headers and
 * open a fresh request per call (no cookie jar). Bot-wall hits and truly
 * missing listings both surface as `upstream_unavailable` — we can't
 * distinguish them from the response alone, and the UX is the same in
 * both cases (the agent enters details manually).
 *
 * Vercel-IP risk: AWS datacenter IPs are flagged more aggressively by
 * Incapsula than residential IPs. Whether Vercel-originated requests clear
 * the wall consistently is a post-deploy unknown. Documented fallback in
 * the design spec is to pivot to the existing /api/ai/extract-property
 * route (Claude vision on a listing screenshot).
 *
 * See:
 *   docs/superpowers/specs/2026-05-24-realtor-ca-listing-import-design.md
 *   docs/superpowers/plans/2026-05-24-realtor-ca-listing-import.md
 */

export type ListingData = {
  address: string;
  city: string;
  province: string;
  price: number | null;
  photoUrl: string;
  description: string;
};

export type FetchListingResult =
  | { ok: true; data: ListingData }
  | {
      ok: false;
      reason: "upstream_unavailable" | "upstream_shape_changed";
      detail?: string;
    };

const UPSTREAM_TIMEOUT_MS = 10_000;
const DESCRIPTION_MAX_CHARS = 600;

// Real-browser headers so we don't trip Incapsula's bot fingerprinting.
// These match what a fresh Chrome session sends on a top-level navigation.
const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.5",
  "Accept-Encoding": "gzip, deflate, br",
  "Upgrade-Insecure-Requests": "1",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
};

const PROVINCE_CODES: Record<string, string> = {
  Alberta: "AB",
  "British Columbia": "BC",
  Manitoba: "MB",
  "New Brunswick": "NB",
  "Newfoundland and Labrador": "NL",
  "Northwest Territories": "NT",
  "Nova Scotia": "NS",
  Nunavut: "NU",
  Ontario: "ON",
  "Prince Edward Island": "PE",
  Quebec: "QC",
  Québec: "QC",
  Saskatchewan: "SK",
  Yukon: "YT",
};

/**
 * Fetches the realtor.ca listing page for the given listing ID and extracts
 * property data from the JSON-LD Product schema embedded in the HTML.
 *
 * The slug after the listing ID doesn't matter — realtor.ca serves the page
 * from any slug. We use a canonical "listing" slug to keep the URL stable.
 */
export async function fetchRealtorListing(
  listingId: string,
): Promise<FetchListingResult> {
  const url = `https://www.realtor.ca/real-estate/${encodeURIComponent(listingId)}/listing`;

  let response: Response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      headers: BROWSER_HEADERS,
      redirect: "follow",
    });
  } catch (err) {
    return {
      ok: false,
      reason: "upstream_unavailable",
      detail: `fetch failed: ${String(err)}`,
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      reason: "upstream_unavailable",
      detail: `HTTP ${response.status}`,
    };
  }

  const html = await response.text();
  return parseListingFromHtml(html);
}

/**
 * Pure HTML → ListingData parser. Exported for unit testing without a real
 * network call. Looks for a Schema.org Product JSON-LD block, parses it,
 * and maps the fields. Returns upstream_unavailable if no Product block is
 * found (covers both bot-wall hits and truly missing listings).
 */
export function parseListingFromHtml(html: string): FetchListingResult {
  // Extract all JSON-LD blocks (a listing page has Product + BreadcrumbList).
  const matches = [
    ...html.matchAll(
      /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
    ),
  ];

  if (matches.length === 0) {
    return {
      ok: false,
      reason: "upstream_unavailable",
      detail:
        "No JSON-LD blocks in response (likely bot wall or missing listing)",
    };
  }

  // Find the Product block among the JSON-LD scripts
  let product: Record<string, unknown> | null = null;
  for (const m of matches) {
    try {
      const parsed = JSON.parse(m[1]) as Record<string, unknown>;
      if (parsed && parsed["@type"] === "Product") {
        product = parsed;
        break;
      }
    } catch {
      // Skip blocks that don't parse as JSON
      continue;
    }
  }

  if (!product) {
    return {
      ok: false,
      reason: "upstream_unavailable",
      detail: "No Product JSON-LD found",
    };
  }

  // Address — from `name` field, format "Street, City, Province PostalCode"
  const name = typeof product.name === "string" ? product.name : "";
  const { address, city, province } = parseProductName(name);

  // Photo — first entry in `image` array
  const images = Array.isArray(product.image) ? product.image : [];
  const photoUrl = typeof images[0] === "string" ? images[0] : "";

  // Description — `description` field, truncated
  const rawDescription =
    typeof product.description === "string" ? product.description : "";
  const description =
    rawDescription.length > DESCRIPTION_MAX_CHARS
      ? rawDescription.slice(0, DESCRIPTION_MAX_CHARS)
      : rawDescription;

  // Price — `offers[0].price` as string
  const offers = Array.isArray(product.offers) ? product.offers : [];
  const firstOffer = offers[0] as Record<string, unknown> | undefined;
  const priceRaw =
    firstOffer && typeof firstOffer.price === "string"
      ? firstOffer.price
      : null;
  const priceNum = priceRaw !== null ? parseFloat(priceRaw) : NaN;
  const price = Number.isFinite(priceNum) ? Math.round(priceNum) : null;

  return {
    ok: true,
    data: { address, city, province, price, photoUrl, description },
  };
}

/**
 * Parses the Schema.org Product `name` field into address / city / province.
 *
 * Examples:
 *   "2394 Loch Lomond Road, Saint John, New Brunswick E2N1A4"
 *     → { address: "2394 Loch Lomond Road", city: "Saint John", province: "NB" }
 *   "123 Rue Principale, Montréal, Québec H2X 1Y1"
 *     → { address: "123 Rue Principale", city: "Montréal", province: "QC" }
 *
 * Postal code (A1A 1A1 or A1A1A1) is stripped from the tail. Province name
 * is mapped to 2-letter code via PROVINCE_CODES; falls back to the full
 * name if unrecognized.
 */
function parseProductName(name: string): {
  address: string;
  city: string;
  province: string;
} {
  const parts = name
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  if (parts.length < 3) {
    return { address: name, city: "", province: "" };
  }

  const address = parts[0];
  const city = parts[1];
  // Handle stray commas after the province by re-joining anything past the city
  const tail = parts.slice(2).join(", ");

  // Strip postal code (A1A 1A1 or A1A1A1) from the end of the tail
  const provinceName = tail
    .replace(/\s+[A-Z]\d[A-Z]\s?\d[A-Z]\d\s*$/i, "")
    .trim();
  const province = PROVINCE_CODES[provinceName] ?? provinceName;

  return { address, city, province };
}
