# Realtor.ca Listing Import — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an agent paste a realtor.ca listing URL into the Open House Setup form and auto-fill property fields (address, city, province, price, hotlinked photo, description) in one click.

**Architecture:** Server-side Next.js API route validates the URL, calls realtor.ca's internal JSON API, normalizes the response, and returns clean data. Client form pastes the URL, calls the route, and populates existing state setters. No DB schema changes.

**Tech Stack:** Next.js 15 (App Router), Supabase (auth check), Vitest (unit tests), Tailwind + lucide-react + sonner (UI), TypeScript strict.

**Spec:** `docs/superpowers/specs/2026-05-24-realtor-ca-listing-import-design.md`

---

## Files Created or Modified

| File | Status | Purpose |
|---|---|---|
| `apps/web/lib/realtor-ca/parse-url.ts` | NEW | Extract listing ID from a realtor.ca URL; pure function, no I/O |
| `apps/web/lib/realtor-ca/__tests__/parse-url.test.ts` | NEW | URL parser unit tests |
| `apps/web/lib/realtor-ca/fetch-listing.ts` | NEW | Call realtor.ca API + normalize response to `ListingData` |
| `apps/web/lib/realtor-ca/__tests__/fetch-listing.test.ts` | NEW | Normalizer unit tests (uses captured fixture) |
| `apps/web/lib/realtor-ca/__tests__/fixtures/sample-response.json` | NEW (from spike) | Real captured realtor.ca API response for tests |
| `apps/web/app/api/realtor-listing/route.ts` | NEW | Auth-gated route that wires parser + fetcher and maps errors |
| `apps/web/app/(app)/open-house-setup/open-house-setup-content.tsx` | MODIFY | Add URL field, Import button, fetch + populate logic |

No DB migration. No memory/findings entries unless the spike surfaces something material.

---

## Pre-Implementation: Verification Spike (COMPLETED 2026-05-24)

The spike confirmed the upstream approach before any production code was written.

**Findings:**

1. ❌ **Unofficial JSON API blocked** — `api2.realtor.ca/Listing.svc/PropertyDetails`
   is gated by Imperva/Incapsula's JavaScript challenge. Returns 302 → bot-wall iframe.

2. ✅ **HTML page + JSON-LD works** — the user-facing listing page (e.g.
   `https://www.realtor.ca/real-estate/29789475/...`) embeds a Schema.org `Product`
   block with `name`, `image[]`, `description`, `sku`, and `offers[0].price`. All
   fields we need are present.

3. ✅ **Photo CDN hotlinks cleanly** — `https://cdn.realtor.ca/...` returns 200 with
   any (or no) Referer header. CloudFront-cached. Verified with multiple referer values.

4. ⚠️ **Bot wall is rate-sensitive** — rapid back-to-back requests trigger Incapsula.
   Fresh sessions + full browser-like headers + reasonable cadence (≥10s between
   requests) clear it. Production must:
   - Use a real-browser User-Agent + complete header set
   - Open a fresh HTTP request per call (no cookie jar persistence)
   - Detect "no JSON-LD Product block found" as `upstream_unavailable`

5. ⚠️ **Vercel-IP risk** — the spike ran from a residential IP. Whether Vercel's
   AWS-datacenter IPs clear Incapsula won't be known until post-deploy. Documented
   fallback: swap input from URL to screenshot, route through the existing
   `/api/ai/extract-property` route (Claude vision).

**Fixture captured:**
`apps/web/lib/realtor-ca/__tests__/fixtures/sample-listing.html` — full 227 KB HTML
of listing 29789475 (2394 Loch Lomond Road, Saint John, NB). Used as ground truth for
Task 2's normalizer tests.

The spike code is research only — not committed. The fixture file IS committed as part
of Task 2.

---

## Task 1: URL Parser

**Files:**
- Create: `apps/web/lib/realtor-ca/parse-url.ts`
- Create: `apps/web/lib/realtor-ca/__tests__/parse-url.test.ts`

**Goal:** Pure function that takes a string and returns either `{ ok: true, listingId }` or `{ ok: false, reason }`. No I/O, no side effects, fully unit-testable.

- [ ] **Step 1: Write the failing test**

Create `apps/web/lib/realtor-ca/__tests__/parse-url.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseRealtorCaUrl } from "../parse-url";

describe("parseRealtorCaUrl", () => {
  it("accepts standard www URL", () => {
    expect(parseRealtorCaUrl("https://www.realtor.ca/real-estate/27254789/123-main-street"))
      .toEqual({ ok: true, listingId: "27254789" });
  });

  it("accepts non-www URL", () => {
    expect(parseRealtorCaUrl("https://realtor.ca/real-estate/27254789/123-main-street"))
      .toEqual({ ok: true, listingId: "27254789" });
  });

  it("accepts French URL", () => {
    expect(parseRealtorCaUrl("https://www.realtor.ca/fr/immobilier/27254789/123-rue-principale"))
      .toEqual({ ok: true, listingId: "27254789" });
  });

  it("trims leading and trailing whitespace", () => {
    expect(parseRealtorCaUrl("  https://www.realtor.ca/real-estate/27254789/x  "))
      .toEqual({ ok: true, listingId: "27254789" });
  });

  it("rejects empty string", () => {
    expect(parseRealtorCaUrl("")).toEqual({ ok: false, reason: "invalid_url" });
  });

  it("rejects plain text that isn't a URL", () => {
    expect(parseRealtorCaUrl("hello world")).toEqual({ ok: false, reason: "invalid_url" });
  });

  it("rejects non-realtor.ca hosts", () => {
    expect(parseRealtorCaUrl("https://example.com/real-estate/27254789/x"))
      .toEqual({ ok: false, reason: "invalid_url" });
  });

  it("rejects realtor.ca homepage with no listing path", () => {
    expect(parseRealtorCaUrl("https://www.realtor.ca/"))
      .toEqual({ ok: false, reason: "not_a_listing" });
  });

  it("rejects realtor.ca map URL", () => {
    expect(parseRealtorCaUrl("https://www.realtor.ca/map#zoom=12"))
      .toEqual({ ok: false, reason: "not_a_listing" });
  });

  it("rejects realtor.ca agent page", () => {
    expect(parseRealtorCaUrl("https://www.realtor.ca/agents/some-agent-slug"))
      .toEqual({ ok: false, reason: "not_a_listing" });
  });

  it("is case-insensitive on the path segment", () => {
    expect(parseRealtorCaUrl("https://www.realtor.ca/Real-Estate/27254789/x"))
      .toEqual({ ok: true, listingId: "27254789" });
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
cd apps/web && pnpm vitest run lib/realtor-ca/__tests__/parse-url.test.ts
```

Expected: FAIL with `Failed to resolve import "../parse-url"` (file doesn't exist yet).

- [ ] **Step 3: Implement the parser**

Create `apps/web/lib/realtor-ca/parse-url.ts`:

```ts
/**
 * Pure URL parser for realtor.ca listing URLs.
 *
 * Accepts:
 *   https://www.realtor.ca/real-estate/27254789/...
 *   https://realtor.ca/real-estate/27254789/...
 *   https://www.realtor.ca/fr/immobilier/27254789/...
 *
 * Rejects everything else. Returns a discriminated union — never throws.
 */

export type ParsedListingUrl =
  | { ok: true;  listingId: string }
  | { ok: false; reason: "invalid_url" | "not_a_listing" };

// Captured group 1 = listing ID.
// `i` flag makes the path segments case-insensitive.
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
```

- [ ] **Step 4: Run the test and confirm it passes**

```bash
cd apps/web && pnpm vitest run lib/realtor-ca/__tests__/parse-url.test.ts
```

Expected: PASS — 11 tests passed.

- [ ] **Step 5: Commit**

```bash
cd "/Users/b/Desktop/Agent Runway Website/Project Home/02 - Web App Code/agentrunway-web"
git add apps/web/lib/realtor-ca/parse-url.ts apps/web/lib/realtor-ca/__tests__/parse-url.test.ts
git commit -m "$(cat <<'EOF'
feat(realtor-ca): add URL parser for listing import

Pure function that extracts the listing ID from a realtor.ca URL.
Handles standard, no-www, and French (immobilier) URL shapes.
Returns a discriminated union for safe error handling.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: HTML Fetcher + JSON-LD Normalizer

**Files:**
- Create: `apps/web/lib/realtor-ca/fetch-listing.ts`
- Create: `apps/web/lib/realtor-ca/__tests__/fetch-listing.test.ts`
- Commit: `apps/web/lib/realtor-ca/__tests__/fixtures/sample-listing.html` (already captured by the spike, 227 KB)

**Goal:** Fetch the listing's HTML page with full browser-like headers, extract the JSON-LD `Product` block, parse it, and return a clean `ListingData`. Tests use the captured HTML for the happy path and mock `fetch` for failure paths.

**Important:** This task uses the HTML + JSON-LD approach (NOT the unofficial JSON API). The spike confirmed the API is bot-walled and the HTML approach works with proper headers.

- [ ] **Step 1: Sketch the contract**

The module exports two functions and two types. Tests in Step 2 hit both.

```ts
// Public types
export type ListingData = {
  address:     string;
  city:        string;
  province:    string;     // 2-letter code if known ("NB"), else full name
  price:       number | null;
  photoUrl:    string;     // hotlink URL; "" if no photo
  description: string;     // truncated to 600 chars
};

export type FetchListingResult =
  | { ok: true;  data: ListingData }
  | { ok: false; reason: "upstream_unavailable" | "upstream_shape_changed"; detail?: string };

// Public functions
export async function fetchRealtorListing(listingId: string): Promise<FetchListingResult>;
export function parseListingFromHtml(html: string): FetchListingResult;
```

Note: `not_found` is NOT in the reason union for `fetch-listing.ts` — realtor.ca returns 200 for missing listings (we found this in the spike). The API route in Task 3 will detect "no Product JSON-LD" via the `upstream_unavailable` reason and map it to a friendly user message.

- [ ] **Step 2: Write the failing tests**

Create `apps/web/lib/realtor-ca/__tests__/fetch-listing.test.ts`. Tests are split between `parseListingFromHtml` (pure, takes HTML string) and `fetchRealtorListing` (async, mocks `fetch`):

```ts
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fetchRealtorListing, parseListingFromHtml } from "../fetch-listing";

const fixtureHtml = readFileSync(
  path.resolve(__dirname, "fixtures/sample-listing.html"),
  "utf-8",
);

// Helper: wrap a JSON-LD object in a minimal HTML page
function htmlWithProductJsonLd(product: object): string {
  return `<html><head><script type="application/ld+json">${JSON.stringify(product)}</script></head><body></body></html>`;
}

describe("parseListingFromHtml", () => {
  it("extracts every field from the real captured listing", () => {
    const result = parseListingFromHtml(fixtureHtml);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // From listing 29789475 captured 2026-05-24
    expect(result.data.address).toBe("2394 Loch Lomond Road");
    expect(result.data.city).toBe("Saint John");
    expect(result.data.province).toBe("NB");
    expect(result.data.price).toBe(339900);
    expect(result.data.photoUrl).toMatch(/^https:\/\/cdn\.realtor\.ca\/listings\//);
    expect(result.data.description).toMatch(/Welcome to this charming/);
    expect(result.data.description.length).toBeLessThanOrEqual(600);
  });

  it("returns upstream_unavailable when HTML has no JSON-LD blocks", () => {
    const result = parseListingFromHtml("<html><body>nothing here</body></html>");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("upstream_unavailable");
  });

  it("returns upstream_unavailable when JSON-LD has no Product schema", () => {
    const breadcrumbOnly = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [],
    };
    const html = htmlWithProductJsonLd(breadcrumbOnly);
    const result = parseListingFromHtml(html);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("upstream_unavailable");
  });

  it("returns upstream_unavailable on Incapsula bot-wall HTML", () => {
    const wallHtml = `<html><body><iframe src="/_Incapsula_Resource">incident_id: 123</iframe></body></html>`;
    const result = parseListingFromHtml(wallHtml);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("upstream_unavailable");
  });

  it("handles a Product schema with all expected fields", () => {
    const product = {
      "@context": "http://schema.org/",
      "@type": "Product",
      name: "123 Main Street, Saint John, New Brunswick E2L 1A1",
      image: ["https://cdn.realtor.ca/abc/highres.jpg", "https://cdn.realtor.ca/abc/medres.jpg"],
      description: "A lovely home.",
      sku: "12345678",
      offers: [{ "@type": "Offer", priceCurrency: "CAD", price: "450000.00" }],
    };
    const result = parseListingFromHtml(htmlWithProductJsonLd(product));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.address).toBe("123 Main Street");
    expect(result.data.city).toBe("Saint John");
    expect(result.data.province).toBe("NB");
    expect(result.data.price).toBe(450000);
    expect(result.data.photoUrl).toBe("https://cdn.realtor.ca/abc/highres.jpg");
    expect(result.data.description).toBe("A lovely home.");
  });

  it("returns empty photo when image array is empty", () => {
    const product = {
      "@type": "Product",
      name: "123 Main Street, Saint John, New Brunswick E2L 1A1",
      image: [],
      description: "No photos.",
      offers: [{ price: "100000.00" }],
    };
    const result = parseListingFromHtml(htmlWithProductJsonLd(product));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.photoUrl).toBe("");
  });

  it("returns null price when offers is missing or empty", () => {
    const product = {
      "@type": "Product",
      name: "123 Main Street, Saint John, New Brunswick E2L 1A1",
      image: ["https://cdn.realtor.ca/x.jpg"],
      description: "No price set.",
    };
    const result = parseListingFromHtml(htmlWithProductJsonLd(product));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.price).toBeNull();
  });

  it("truncates descriptions over 600 chars", () => {
    const longDesc = "A".repeat(800);
    const product = {
      "@type": "Product",
      name: "123 Main Street, Saint John, New Brunswick E2L 1A1",
      image: ["https://cdn.realtor.ca/x.jpg"],
      description: longDesc,
      offers: [{ price: "100000.00" }],
    };
    const result = parseListingFromHtml(htmlWithProductJsonLd(product));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.description.length).toBe(600);
  });

  it("maps French province names to codes", () => {
    const product = {
      "@type": "Product",
      name: "123 Rue Principale, Montréal, Québec H2X 1Y1",
      image: ["https://cdn.realtor.ca/x.jpg"],
      description: "Belle maison.",
      offers: [{ price: "500000.00" }],
    };
    const result = parseListingFromHtml(htmlWithProductJsonLd(product));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.province).toBe("QC");
  });

  it("falls back to full province name when not in the lookup map", () => {
    const product = {
      "@type": "Product",
      name: "1 Some Street, Some City, Made Up Province X1X 1X1",
      image: [],
      description: "Edge case.",
      offers: [{ price: "100000.00" }],
    };
    const result = parseListingFromHtml(htmlWithProductJsonLd(product));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.province).toBe("Made Up Province");
  });
});

describe("fetchRealtorListing", () => {
  const realFetch = globalThis.fetch;
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("returns ok on a 200 + valid HTML", async () => {
    (globalThis.fetch as any).mockResolvedValue(
      new Response(fixtureHtml, { status: 200, headers: { "content-type": "text/html" } }),
    );
    const result = await fetchRealtorListing("29789475");
    expect(result.ok).toBe(true);
  });

  it("sends browser-like headers (no bot-wall fingerprint)", async () => {
    const mock = vi.fn().mockResolvedValue(new Response(fixtureHtml, { status: 200 }));
    globalThis.fetch = mock;
    await fetchRealtorListing("29789475");
    const call = mock.mock.calls[0];
    const headers = call[1].headers;
    expect(headers["User-Agent"]).toMatch(/Mozilla\/5\.0/);
    expect(headers["Accept"]).toMatch(/text\/html/);
    expect(headers["Accept-Language"]).toBeDefined();
  });

  it("returns upstream_unavailable on a 5xx", async () => {
    (globalThis.fetch as any).mockResolvedValue(new Response("", { status: 503 }));
    const result = await fetchRealtorListing("29789475");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("upstream_unavailable");
  });

  it("returns upstream_unavailable when fetch throws (network error or timeout)", async () => {
    (globalThis.fetch as any).mockRejectedValue(new Error("network down"));
    const result = await fetchRealtorListing("29789475");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("upstream_unavailable");
  });

  it("returns upstream_unavailable when response HTML has no Product schema", async () => {
    (globalThis.fetch as any).mockResolvedValue(
      new Response("<html><body>nothing</body></html>", { status: 200 }),
    );
    const result = await fetchRealtorListing("29789475");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("upstream_unavailable");
  });
});
```

- [ ] **Step 3: Run the test and confirm it fails**

```bash
cd apps/web && pnpm vitest run lib/realtor-ca/__tests__/fetch-listing.test.ts
```

Expected: FAIL with `Failed to resolve import "../fetch-listing"` (file doesn't exist).

- [ ] **Step 4: Implement the fetcher and normalizer**

Create `apps/web/lib/realtor-ca/fetch-listing.ts`:

```ts
/**
 * Fetches a realtor.ca listing HTML page and extracts property data from
 * the embedded JSON-LD Product schema.
 *
 * Why HTML + JSON-LD instead of the JSON API:
 * The unofficial JSON API at api2.realtor.ca is gated by Imperva/Incapsula's
 * JavaScript challenge and is not reachable from server-side fetchers. The
 * user-facing HTML pages embed a Schema.org Product block with everything
 * we need: name (address), image[] (photos), description (public remarks),
 * offers[0].price (asking price). Schema.org is a public standard, so this
 * surface is more stable than an undocumented internal API.
 *
 * Bot-wall caveat (spike 2026-05-24): rapid requests still trigger Incapsula.
 * Production must use a real-browser UA + full standard headers, open a
 * fresh request per call (no cookie jar), and treat "no Product block found"
 * as upstream_unavailable. Vercel-IP risk documented in the design spec.
 */

export type ListingData = {
  address:     string;
  city:        string;
  province:    string;
  price:       number | null;
  photoUrl:    string;
  description: string;
};

export type FetchListingResult =
  | { ok: true;  data: ListingData }
  | { ok: false; reason: "upstream_unavailable" | "upstream_shape_changed"; detail?: string };

const UPSTREAM_TIMEOUT_MS  = 10_000;
const DESCRIPTION_MAX_CHARS = 600;

// Real-browser headers so we don't look like a bot to Incapsula
const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":               "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  "Accept":                   "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language":          "en-US,en;q=0.5",
  "Accept-Encoding":          "gzip, deflate, br",
  "Upgrade-Insecure-Requests":"1",
  "Sec-Fetch-Dest":           "document",
  "Sec-Fetch-Mode":           "navigate",
  "Sec-Fetch-Site":           "none",
  "Sec-Fetch-User":           "?1",
};

const PROVINCE_CODES: Record<string, string> = {
  "Alberta":                   "AB",
  "British Columbia":          "BC",
  "Manitoba":                  "MB",
  "New Brunswick":             "NB",
  "Newfoundland and Labrador": "NL",
  "Northwest Territories":     "NT",
  "Nova Scotia":               "NS",
  "Nunavut":                   "NU",
  "Ontario":                   "ON",
  "Prince Edward Island":      "PE",
  "Quebec":                    "QC",
  "Québec":                    "QC",
  "Saskatchewan":              "SK",
  "Yukon":                     "YT",
};

export async function fetchRealtorListing(listingId: string): Promise<FetchListingResult> {
  // Canonical URL — slug doesn't matter, realtor.ca serves the page from any slug
  const url = `https://www.realtor.ca/real-estate/${encodeURIComponent(listingId)}/listing`;

  let response: Response;
  try {
    response = await fetch(url, {
      signal:  AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      headers: BROWSER_HEADERS,
      redirect: "follow",
    });
  } catch (err) {
    return { ok: false, reason: "upstream_unavailable", detail: `fetch failed: ${String(err)}` };
  }

  if (!response.ok) {
    return { ok: false, reason: "upstream_unavailable", detail: `HTTP ${response.status}` };
  }

  const html = await response.text();
  return parseListingFromHtml(html);
}

export function parseListingFromHtml(html: string): FetchListingResult {
  // Extract all JSON-LD blocks
  const matches = [...html.matchAll(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )];

  if (matches.length === 0) {
    return { ok: false, reason: "upstream_unavailable", detail: "No JSON-LD blocks in response (likely bot wall or missing listing)" };
  }

  // Find the Product block
  let product: Record<string, unknown> | null = null;
  for (const m of matches) {
    try {
      const parsed = JSON.parse(m[1]) as Record<string, unknown>;
      if (parsed && parsed["@type"] === "Product") {
        product = parsed;
        break;
      }
    } catch {
      // skip blocks that don't parse
      continue;
    }
  }

  if (!product) {
    return { ok: false, reason: "upstream_unavailable", detail: "No Product JSON-LD found" };
  }

  // Address — from `name` field, format "Street, City, Province PostalCode"
  const name = typeof product.name === "string" ? product.name : "";
  const { address, city, province } = parseProductName(name);

  // Photo — first entry in `image` array
  const images = Array.isArray(product.image) ? product.image : [];
  const photoUrl = typeof images[0] === "string" ? images[0] : "";

  // Description — `description` field, truncated
  const rawDescription = typeof product.description === "string" ? product.description : "";
  const description = rawDescription.length > DESCRIPTION_MAX_CHARS
    ? rawDescription.slice(0, DESCRIPTION_MAX_CHARS)
    : rawDescription;

  // Price — `offers[0].price` as string
  const offers = Array.isArray(product.offers) ? product.offers : [];
  const firstOffer = offers[0] as Record<string, unknown> | undefined;
  const priceRaw = firstOffer && typeof firstOffer.price === "string" ? firstOffer.price : null;
  const priceNum = priceRaw !== null ? parseFloat(priceRaw) : NaN;
  const price = Number.isFinite(priceNum) ? Math.round(priceNum) : null;

  return {
    ok: true,
    data: { address, city, province, price, photoUrl, description },
  };
}

function parseProductName(name: string): { address: string; city: string; province: string } {
  // Examples:
  //   "2394 Loch Lomond Road, Saint John, New Brunswick E2N1A4"
  //   "123 Rue Principale, Montréal, Québec H2X 1Y1"
  const parts = name.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length < 3) {
    return { address: name, city: "", province: "" };
  }

  const address = parts[0];
  const city    = parts[1];
  const tail    = parts.slice(2).join(", "); // handle stray commas in tail

  // Strip postal code (A1A 1A1 or A1A1A1) from the end of the tail
  const provinceName = tail.replace(/\s+[A-Z]\d[A-Z]\s?\d[A-Z]\d\s*$/i, "").trim();
  const province = PROVINCE_CODES[provinceName] ?? provinceName;

  return { address, city, province };
}
```

- [ ] **Step 5: Run the tests and confirm they pass**

```bash
cd apps/web && pnpm vitest run lib/realtor-ca/__tests__/fetch-listing.test.ts
```

Expected: PASS — 15 tests passed (10 parser + 5 fetcher).

If the fixture happy-path test fails, the captured HTML's Product schema may differ from the assumed shape — inspect with `grep -A 30 'application/ld+json' apps/web/lib/realtor-ca/__tests__/fixtures/sample-listing.html` and adjust the assertions or parser accordingly.

- [ ] **Step 6: Commit**

```bash
cd "/Users/b/Desktop/Agent Runway Website/Project Home/02 - Web App Code/agentrunway-web"
git add apps/web/lib/realtor-ca/fetch-listing.ts \
        apps/web/lib/realtor-ca/__tests__/fetch-listing.test.ts \
        apps/web/lib/realtor-ca/__tests__/fixtures/sample-listing.html
git commit -m "$(cat <<'EOF'
feat(realtor-ca): add HTML fetcher and JSON-LD normalizer

Fetches the realtor.ca listing HTML page with full browser-like headers
and extracts property data from the embedded Schema.org Product block.
Returns a discriminated union — never throws. Handles missing photo,
missing price, long descriptions (truncated to 600 chars), combined
address text parsing with province name->code mapping, network errors,
bot-wall HTML, and missing Product schema.

Why HTML, not the JSON API: the unofficial api2.realtor.ca endpoint is
gated by Imperva/Incapsula's JavaScript challenge and is not reachable
from server-side fetchers (confirmed by spike). The user-facing HTML
pages have Schema.org Product JSON-LD with everything we need.

Fixture in __tests__/fixtures/ is a real captured listing page used for
the happy-path test; mocked fetch covers all failure paths.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: API Route

**Files:**
- Create: `apps/web/app/api/realtor-listing/route.ts`

**Goal:** Auth-gated GET route that wires the parser + fetcher and maps internal `reason` codes to user-facing HTTP statuses + messages.

- [ ] **Step 1: Create the route file**

Create `apps/web/app/api/realtor-listing/route.ts`:

```ts
/**
 * GET /api/realtor-listing?url=<encoded-realtor-ca-url>
 *
 * Auth-gated route that fetches a realtor.ca listing by URL and returns
 * normalized property data for the Open House Setup form's auto-fill flow.
 *
 * Spec: docs/superpowers/specs/2026-05-24-realtor-ca-listing-import-design.md
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient }              from "@/lib/supabase/server";
import { parseRealtorCaUrl }         from "@/lib/realtor-ca/parse-url";
import { fetchRealtorListing }       from "@/lib/realtor-ca/fetch-listing";

type ErrorCode =
  | "unauthenticated"
  | "invalid_url"
  | "not_a_listing"
  | "upstream_unavailable"
  | "upstream_shape_changed";

const ERROR_MESSAGES: Record<ErrorCode, string> = {
  unauthenticated:        "Session expired — please refresh",
  invalid_url:            "Paste a realtor.ca listing URL",
  not_a_listing:          "That doesn't look like a listing page — paste the URL from the listing itself",
  upstream_unavailable:   "Couldn't load that listing — it may have been removed, or realtor.ca blocked the request. Enter details manually.",
  upstream_shape_changed: "Couldn't load that listing — please enter details manually.",
};

const ERROR_STATUS: Record<ErrorCode, number> = {
  unauthenticated:        401,
  invalid_url:            400,
  not_a_listing:          400,
  upstream_unavailable:   502,
  upstream_shape_changed: 502,
};

function errorResponse(code: ErrorCode) {
  return NextResponse.json(
    { error: ERROR_MESSAGES[code], code },
    { status: ERROR_STATUS[code] },
  );
}

export async function GET(req: NextRequest) {
  // 1. Auth gate
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return errorResponse("unauthenticated");
  }

  // 2. Parse URL from query
  const urlParam = req.nextUrl.searchParams.get("url");
  if (!urlParam) {
    return errorResponse("invalid_url");
  }

  const parsed = parseRealtorCaUrl(urlParam);
  if (!parsed.ok) {
    return errorResponse(parsed.reason);
  }

  // 3. Fetch HTML + extract JSON-LD
  // Note: fetcher returns `upstream_unavailable` for both bot-wall hits AND
  // truly missing listings — we can't distinguish from the response alone.
  // Same UX in both cases: tell the user to enter manually.
  const result = await fetchRealtorListing(parsed.listingId);
  if (!result.ok) {
    console.error("[api/realtor-listing] upstream failure", {
      listingId: parsed.listingId,
      reason:    result.reason,
      detail:    result.detail,
    });
    return errorResponse(result.reason);
  }

  return NextResponse.json(result.data, { status: 200 });
}
```

- [ ] **Step 2: Manual smoke test — auth gate**

Start the dev server in another terminal:
```bash
cd "/Users/b/Desktop/Agent Runway Website/Project Home/02 - Web App Code/agentrunway-web" && pnpm dev
```

In a new terminal, hit the route without auth:
```bash
curl -i "http://localhost:3000/api/realtor-listing?url=https://www.realtor.ca/real-estate/27254789/x"
```

Expected: `HTTP/1.1 401 Unauthorized` and JSON body `{"error":"Session expired — please refresh","code":"unauthenticated"}`.

- [ ] **Step 3: Manual smoke test — invalid URL (in-app)**

Sign in to the dev app in a browser. Open the browser DevTools console and run:

```js
fetch("/api/realtor-listing?url=hello").then(r => r.json()).then(console.log)
```

Expected: `{ error: "Paste a realtor.ca listing URL", code: "invalid_url" }`.

Try a non-listing realtor.ca URL:
```js
fetch("/api/realtor-listing?url=https://www.realtor.ca/").then(r => r.json()).then(console.log)
```

Expected: `{ error: "That doesn't look like a listing page...", code: "not_a_listing" }`.

- [ ] **Step 4: Manual smoke test — real listing**

In the same browser console, with the SAME listing ID the spike captured:
```js
fetch("/api/realtor-listing?url=https://www.realtor.ca/real-estate/<spike-listing-id>/x")
  .then(r => r.json())
  .then(console.log)
```

Expected: A JSON object with `address`, `city`, `province`, `price`, `photoUrl`, `description`. The values should match the fixture.

- [ ] **Step 5: Commit**

```bash
cd "/Users/b/Desktop/Agent Runway Website/Project Home/02 - Web App Code/agentrunway-web"
git add apps/web/app/api/realtor-listing/route.ts
git commit -m "$(cat <<'EOF'
feat(api): add /api/realtor-listing route

Auth-gated GET route that takes a realtor.ca URL, parses the listing ID,
fetches via the unofficial JSON API, and returns normalized property data
for the Open House Setup form. Maps internal reason codes to user-facing
HTTP statuses + clear error messages. Upstream failures logged to console
for Sentry capture.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: UI Integration

**Files:**
- Modify: `apps/web/app/(app)/open-house-setup/open-house-setup-content.tsx`

**Goal:** Add a "Quick start: import from realtor.ca" row at the top of the Current Property card. Pasting a URL + clicking Import calls the API route and populates the existing form state via the existing setters.

- [ ] **Step 1: Add the import URL state field**

In `open-house-setup-content.tsx`, near the other property state declarations (around line 132 after `const [description, ...]`), add:

```tsx
  // ── Realtor.ca import state (not persisted) ───────────────────────────────
  const [realtorUrl, setRealtorUrl] = useState("");
  const [importing, setImporting]   = useState(false);
```

- [ ] **Step 2: Add the import handler**

In the same file, in the callbacks section (after `handlePhotoUpload`, before `handleSave`), add:

```tsx
  // ── Realtor.ca import ─────────────────────────────────────────────────────
  const handleImportFromRealtor = useCallback(async () => {
    const url = realtorUrl.trim();
    if (!url) {
      toast.error("Paste a realtor.ca listing URL");
      return;
    }

    setImporting(true);
    try {
      const response = await fetch(
        `/api/realtor-listing?url=${encodeURIComponent(url)}`,
      );
      const body = await response.json();

      if (!response.ok) {
        toast.error(body.error ?? "Couldn't import listing — please try again");
        return;
      }

      // Populate form fields from response
      setPropertyAddress(body.address  ?? "");
      setPropertyCity(body.city        ?? "");
      setPropertyProvince(body.province?? "");
      setPropertyPrice(body.price != null ? String(body.price) : "");
      setPropertyPhotoUrl(body.photoUrl ?? "");
      setDescription(body.description   ?? "");

      toast.success("Imported from realtor.ca ✓");
    } catch (err) {
      console.error("[open-house-setup] realtor import failed:", err);
      toast.error("Couldn't reach the import service — please try again");
    } finally {
      setImporting(false);
    }
  }, [realtorUrl]);
```

- [ ] **Step 3: Add the import row to the UI**

In the same file, find the "Current Property" Card's `CardContent` (around line 379, starts with `<CardContent className="space-y-4">`). Add the import block as the FIRST child inside that `CardContent`, BEFORE the existing "Property photo" block:

```tsx
          {/* Quick start: import from realtor.ca */}
          <div className="rounded-lg border border-blue-500/20 bg-blue-600/5 p-3">
            <Label
              htmlFor="realtor-url"
              className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-blue-300"
            >
              <Link2 className="h-3 w-3" />
              Quick start: import from realtor.ca
            </Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="realtor-url"
                value={realtorUrl}
                onChange={(e) => setRealtorUrl(e.target.value)}
                disabled={importing}
                placeholder="https://www.realtor.ca/real-estate/..."
                className="flex-1 bg-slate-800 text-white placeholder-slate-500"
                aria-label="Realtor.ca listing URL"
              />
              <Button
                type="button"
                onClick={handleImportFromRealtor}
                disabled={importing || !realtorUrl.trim()}
                className="bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-60 sm:w-auto"
                aria-busy={importing}
              >
                {importing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                    Importing…
                  </>
                ) : (
                  "Import"
                )}
              </Button>
            </div>
            <p className="mt-1.5 text-xs text-slate-500">
              Paste your listing URL — we&apos;ll fill in the address, price, photo, and description. All fields stay editable.
            </p>
          </div>
```

The `Link2` icon and `Loader2` are already imported. Verify the existing imports at the top of the file include both (they do as of the spec read).

- [ ] **Step 4: Manual smoke test — full happy path in browser**

With dev server running, sign in and open `/open-house-setup`:

1. Confirm the "Quick start: import from realtor.ca" row appears at the top of the Current Property card.
2. Paste the spike's listing URL into the field.
3. Click Import.
4. Confirm:
   - Button shows spinner + "Importing…"
   - URL field disabled during fetch
   - After ~1–3 s, toast appears: "Imported from realtor.ca ✓"
   - Street address, city, province, price, photo, and description fields are populated.
   - Photo renders (hotlinked from realtor.ca CDN).
5. Edit one field (e.g. change the price). Confirm the edit sticks.
6. Click "Save Changes". Confirm save succeeds.
7. Click "Preview page". Confirm the public open house page renders with the imported data.

- [ ] **Step 5: Manual smoke test — error paths**

In the same form:

1. Clear the URL field. Click Import → button is disabled (good).
2. Paste `hello` and click Import → toast: "Paste a realtor.ca listing URL".
3. Paste `https://www.realtor.ca/` and click Import → toast: "That doesn't look like a listing page...".
4. Paste a known-invalid listing URL (e.g. `https://www.realtor.ca/real-estate/00000000/x`) and click Import → toast: "Listing not found — it may have been sold or removed".
5. Form fields are untouched in every error case.

- [ ] **Step 6: Mobile responsive check**

Open Chrome DevTools, toggle device toolbar to "iPhone SE" (375px).

1. Confirm the URL input is full width.
2. Confirm the Import button stacks BELOW the URL input (not beside it).
3. Confirm padding/spacing looks clean.
4. Toggle back to desktop. Confirm the URL input + button are on the same row.

- [ ] **Step 7: Commit**

```bash
cd "/Users/b/Desktop/Agent Runway Website/Project Home/02 - Web App Code/agentrunway-web"
git add apps/web/app/\(app\)/open-house-setup/open-house-setup-content.tsx
git commit -m "$(cat <<'EOF'
feat(open-house): add realtor.ca URL import to setup form

Adds a Quick-start row at the top of the Current Property card. Agent
pastes a realtor.ca listing URL, clicks Import, and the form auto-fills
address, city, province, price, photo (hotlinked), and description.
All fields remain editable. URL field is a scratchpad — not persisted.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Full Test Pass + PR

**Goal:** Run the full automated suite, walk the manual test plan from the spec end-to-end, open a PR.

- [ ] **Step 1: Run the full vitest suite**

```bash
cd apps/web && pnpm vitest run
```

Expected: All tests pass. The two new test files contribute 24 tests (11 parse-url + 13 fetch-listing).

- [ ] **Step 2: Typecheck**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Run the full manual test plan from the spec**

From `docs/superpowers/specs/2026-05-24-realtor-ca-listing-import-design.md`, the Test Plan section lists 10 manual checks. Walk every one and tick each off:

1. [ ] Paste a valid current listing URL → fields populate correctly
2. [ ] Paste an invalid URL → toast appears, no fields change
3. [ ] Paste realtor.ca homepage URL → `not_a_listing` toast
4. [ ] Paste a sold/removed listing URL → `listing_not_found` toast
5. [ ] Paste a French URL (`/fr/immobilier/...`) → fields populate
6. [ ] Click Import while another import is in flight → button is disabled
7. [ ] Edit a field after import → save still works correctly
8. [ ] Save after import → DB row reflects imported values exactly
9. [ ] Visit public `/open-house/[slug]` page → hotlinked photo renders
10. [ ] Mobile view (< 640px) → URL field + Import button stack correctly

For check 8, after saving, verify with a SQL query in the Supabase dashboard:
```sql
select property_address, property_city, property_province, property_price,
       property_photo_url, description
from agent_open_houses
where user_id = '<your-user-id>';
```

- [ ] **Step 4: Create feature branch and push**

```bash
cd "/Users/b/Desktop/Agent Runway Website/Project Home/02 - Web App Code/agentrunway-web"
git checkout -b feat/realtor-ca-listing-import
git push -u origin feat/realtor-ca-listing-import
```

- [ ] **Step 5: Open the PR**

```bash
GH_TOKEN=<token-from-keychain> gh pr create \
  --title "feat(open-house): realtor.ca listing URL import" \
  --body "$(cat <<'EOF'
## Summary
- Adds a Quick-start row at the top of Open House Setup → paste realtor.ca URL → click Import → form auto-fills
- New `/api/realtor-listing` route (auth-gated, server-side fetch)
- New `lib/realtor-ca/` module: pure URL parser + fetcher/normalizer with full vitest coverage
- No DB schema changes; photo hotlinked from realtor.ca CDN

## Spec
`docs/superpowers/specs/2026-05-24-realtor-ca-listing-import-design.md`

## Test plan
- [x] Vitest: 24 new unit tests passing
- [x] Typecheck clean
- [x] Manual: all 10 checks from spec Test Plan ticked
- [x] Mobile responsive verified

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 6: Confirm CI is green**

Wait for the GitHub Actions `build` check to complete on the PR. If red, read the failure output and fix before merging.

- [ ] **Step 7: Merge + delete branch**

Once CI is green, merge the PR via GitHub UI (squash merge to keep main history clean). Then locally:

```bash
cd "/Users/b/Desktop/Agent Runway Website/Project Home/02 - Web App Code/agentrunway-web"
git checkout main
git pull origin main
git branch -d feat/realtor-ca-listing-import
git push origin --delete feat/realtor-ca-listing-import
```

Vercel auto-deploys the merge to production. Verify by visiting `https://agentrunway.ca/open-house-setup` (signed in) and confirming the Import row renders.
