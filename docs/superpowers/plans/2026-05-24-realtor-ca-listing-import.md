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

## Pre-Implementation: Verification Spike

**Purpose:** Confirm the unofficial realtor.ca API is reachable and the photo CDN hotlinks correctly BEFORE building production code. Outputs a captured fixture that Task 2's tests use as ground truth.

**This is a research step, not a commit.** Outputs go into the workspace but only the captured fixture file gets committed (as part of Task 2).

- [ ] **Spike Step 1: Pick a known live listing**

Open `https://www.realtor.ca/` in a browser and find any active listing. Copy the URL.
Note the listing ID (the digits between `/real-estate/` and the slug).

- [ ] **Spike Step 2: Probe the API directly**

Run from a terminal:

```bash
LISTING_ID="<paste-the-id-here>"
curl -i -H "Accept: application/json" \
  "https://api2.realtor.ca/Listing.svc/PropertyDetails?ApplicationId=1&CultureId=1&PropertyID=${LISTING_ID}"
```

Expected: HTTP 200 + a JSON body with property details (address, price, photos, description).

If 200 + JSON: continue. Save the body for Step 3.
If 4xx/5xx or HTML: STOP. The API is not directly accessible. Spike outcome 2 applies (fallback to HTML + JSON-LD scraping); pause and surface to Andrew before continuing.

- [ ] **Spike Step 3: Capture the fixture**

Save the JSON response body to:
`apps/web/lib/realtor-ca/__tests__/fixtures/sample-response.json`

Make the directory first if needed:
```bash
mkdir -p apps/web/lib/realtor-ca/__tests__/fixtures
curl -s -H "Accept: application/json" \
  "https://api2.realtor.ca/Listing.svc/PropertyDetails?ApplicationId=1&CultureId=1&PropertyID=${LISTING_ID}" \
  > apps/web/lib/realtor-ca/__tests__/fixtures/sample-response.json
```

Verify with:
```bash
head -c 300 apps/web/lib/realtor-ca/__tests__/fixtures/sample-response.json
```

Expected: First few hundred characters of valid JSON.

- [ ] **Spike Step 4: Identify field paths**

Open the fixture file and identify the JSON path for each field we need. Document them inline in a comment block in the fixture file's sibling `fetch-listing.ts` (will be created in Task 2). Expected paths (likely but verify):
- Address text: `Results[0].Property.Address.AddressText` (typically `"123 Main St|City, Province PostalCode"` — needs splitting)
- Price (numeric): `Results[0].Property.PriceUnformattedValue` OR `Results[0].Property.Price` (string with `$` and commas)
- Photos: `Results[0].Property.Photo` — array; pick `[0].HighResPath`
- Public remarks: `Results[0].PublicRemarks`

Write down the actual paths you observe — they will drive the normalizer in Task 2.

- [ ] **Spike Step 5: Verify photo hotlinking**

Take the first photo URL from the response. Test it loads from a non-realtor.ca origin:

```bash
PHOTO_URL="<paste-photo-url-here>"
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "Referer: https://agentrunway.ca/" \
  -H "User-Agent: Mozilla/5.0" \
  "${PHOTO_URL}"
```

Expected: `200`.

If `200`: hotlinking works. Proceed with Task 1.
If `403`/`404`: hotlinking is referer-blocked. STOP. Spec recommends pivoting to re-upload — surface to Andrew before proceeding.

- [ ] **Spike Step 6: Decision point**

If both Step 2 and Step 5 pass: proceed to Task 1.
If either fails: stop, document the failure mode, surface to Andrew, do not start Task 1.

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

## Task 2: Fetcher + Normalizer

**Files:**
- Create: `apps/web/lib/realtor-ca/fetch-listing.ts`
- Create: `apps/web/lib/realtor-ca/__tests__/fetch-listing.test.ts`
- Commit: `apps/web/lib/realtor-ca/__tests__/fixtures/sample-response.json` (captured in Spike Step 3)

**Goal:** Wrap the realtor.ca API call + response normalization in a typed function. Tests use the captured fixture for the happy path and mock `fetch` for failure paths.

**Important:** Confirm the field paths from Spike Step 4 before writing the normalizer. The code below assumes the standard shape (`Results[0].Property.*`) — adjust if the spike found something different.

- [ ] **Step 1: Write the failing test**

Create `apps/web/lib/realtor-ca/__tests__/fetch-listing.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import sampleResponse from "./fixtures/sample-response.json";
import { fetchRealtorListing, normalizeUpstream } from "../fetch-listing";

describe("normalizeUpstream", () => {
  it("extracts all fields from a real captured response", () => {
    const result = normalizeUpstream(sampleResponse);
    expect(result.ok).toBe(true);
    if (!result.ok) return; // type guard

    // These exact values come from whatever listing the spike captured.
    // Update them to match the fixture after Spike Step 3.
    expect(result.data.address).toBeTruthy();
    expect(result.data.city).toBeTruthy();
    expect(result.data.province).toBeTruthy();
    expect(result.data.price === null || typeof result.data.price === "number").toBe(true);
    expect(typeof result.data.photoUrl).toBe("string");
    expect(typeof result.data.description).toBe("string");
    expect(result.data.description.length).toBeLessThanOrEqual(600);
  });

  it("returns upstream_shape_changed for a non-object input", () => {
    const result = normalizeUpstream("not an object");
    expect(result).toEqual({
      ok: false,
      reason: "upstream_shape_changed",
      detail: expect.any(String),
    });
  });

  it("returns upstream_shape_changed when Results is missing", () => {
    const result = normalizeUpstream({ Paging: {} });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("upstream_shape_changed");
  });

  it("returns upstream_shape_changed when Results array is empty", () => {
    const result = normalizeUpstream({ Results: [] });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("upstream_shape_changed");
  });

  it("returns empty string for missing photo gracefully", () => {
    const minimal = {
      Results: [{
        Property: {
          Address: { AddressText: "123 Main St|Saint John, NB E2L 1A1" },
          PriceUnformattedValue: "450000",
          Photo: [],
        },
        PublicRemarks: "",
      }],
    };
    const result = normalizeUpstream(minimal);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.photoUrl).toBe("");
  });

  it("returns null price when price is missing", () => {
    const minimal = {
      Results: [{
        Property: {
          Address: { AddressText: "123 Main St|Saint John, NB E2L 1A1" },
          Photo: [{ HighResPath: "https://cdn.realtor.ca/abc.jpg" }],
        },
        PublicRemarks: "",
      }],
    };
    const result = normalizeUpstream(minimal);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.price).toBeNull();
  });

  it("truncates long descriptions to 600 chars", () => {
    const longRemarks = "A".repeat(800);
    const input = {
      Results: [{
        Property: {
          Address: { AddressText: "123 Main St|Saint John, NB E2L 1A1" },
          PriceUnformattedValue: "450000",
          Photo: [{ HighResPath: "https://cdn.realtor.ca/abc.jpg" }],
        },
        PublicRemarks: longRemarks,
      }],
    };
    const result = normalizeUpstream(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.description.length).toBe(600);
  });

  it("splits combined address text into address + city + province", () => {
    const input = {
      Results: [{
        Property: {
          Address: { AddressText: "123 Main St|Saint John, NB E2L 1A1" },
          PriceUnformattedValue: "450000",
          Photo: [{ HighResPath: "https://cdn.realtor.ca/abc.jpg" }],
        },
        PublicRemarks: "Nice house",
      }],
    };
    const result = normalizeUpstream(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.address).toBe("123 Main St");
    expect(result.data.city).toBe("Saint John");
    expect(result.data.province).toBe("NB");
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

  it("returns ok on a 200 + valid response", async () => {
    (globalThis.fetch as any).mockResolvedValue(
      new Response(JSON.stringify(sampleResponse), { status: 200 }),
    );
    const result = await fetchRealtorListing("27254789");
    expect(result.ok).toBe(true);
  });

  it("returns not_found on a 404", async () => {
    (globalThis.fetch as any).mockResolvedValue(
      new Response("", { status: 404 }),
    );
    const result = await fetchRealtorListing("27254789");
    expect(result).toEqual({ ok: false, reason: "not_found" });
  });

  it("returns upstream_unavailable on a 500", async () => {
    (globalThis.fetch as any).mockResolvedValue(
      new Response("", { status: 500 }),
    );
    const result = await fetchRealtorListing("27254789");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("upstream_unavailable");
  });

  it("returns upstream_unavailable when fetch throws (network error)", async () => {
    (globalThis.fetch as any).mockRejectedValue(new Error("network down"));
    const result = await fetchRealtorListing("27254789");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("upstream_unavailable");
  });

  it("returns upstream_shape_changed when body is not JSON", async () => {
    (globalThis.fetch as any).mockResolvedValue(
      new Response("<html>bot wall</html>", { status: 200 }),
    );
    const result = await fetchRealtorListing("27254789");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("upstream_shape_changed");
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
cd apps/web && pnpm vitest run lib/realtor-ca/__tests__/fetch-listing.test.ts
```

Expected: FAIL with `Failed to resolve import "../fetch-listing"` and/or `./fixtures/sample-response.json` (one or both missing). Confirm `sample-response.json` was captured in Spike Step 3.

- [ ] **Step 3: Implement the fetcher and normalizer**

Create `apps/web/lib/realtor-ca/fetch-listing.ts`:

```ts
/**
 * Fetches a single listing from realtor.ca's unofficial JSON API and
 * normalizes the response shape into a clean ListingData payload.
 *
 * The upstream endpoint is undocumented and may change without notice.
 * The normalizer treats every field path as optional and returns
 * `upstream_shape_changed` on unexpected structure rather than throwing —
 * the API route maps that to a 502 with a clear error to the user.
 *
 * Field paths confirmed by the spike (Pre-Implementation section of plan):
 *   Address (combined):  Results[0].Property.Address.AddressText
 *                        Format: "<street>|<city>, <province> <postal>"
 *   Price (numeric):     Results[0].Property.PriceUnformattedValue (string)
 *   Photo (high-res):    Results[0].Property.Photo[0].HighResPath
 *   Public remarks:      Results[0].PublicRemarks
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
  | { ok: false; reason: "not_found" | "upstream_unavailable" | "upstream_shape_changed"; detail?: string };

const REALTOR_API_BASE     = "https://api2.realtor.ca/Listing.svc/PropertyDetails";
const UPSTREAM_TIMEOUT_MS  = 5000;
const DESCRIPTION_MAX_CHARS = 600;

export async function fetchRealtorListing(listingId: string): Promise<FetchListingResult> {
  const url = `${REALTOR_API_BASE}?ApplicationId=1&CultureId=1&PropertyID=${encodeURIComponent(listingId)}`;

  let response: Response;
  try {
    response = await fetch(url, {
      signal:  AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      headers: { "Accept": "application/json" },
    });
  } catch (err) {
    return { ok: false, reason: "upstream_unavailable", detail: String(err) };
  }

  if (response.status === 404) {
    return { ok: false, reason: "not_found" };
  }
  if (!response.ok) {
    return { ok: false, reason: "upstream_unavailable", detail: `HTTP ${response.status}` };
  }

  let raw: unknown;
  try {
    raw = await response.json();
  } catch (err) {
    return { ok: false, reason: "upstream_shape_changed", detail: `JSON parse failed: ${String(err)}` };
  }

  return normalizeUpstream(raw);
}

export function normalizeUpstream(raw: unknown): FetchListingResult {
  if (!raw || typeof raw !== "object") {
    return { ok: false, reason: "upstream_shape_changed", detail: "Response is not an object" };
  }

  const root = raw as Record<string, unknown>;
  const results = root.Results;
  if (!Array.isArray(results) || results.length === 0) {
    return { ok: false, reason: "upstream_shape_changed", detail: "Missing or empty Results array" };
  }

  const first = results[0] as Record<string, unknown> | undefined;
  if (!first || typeof first !== "object") {
    return { ok: false, reason: "upstream_shape_changed", detail: "Results[0] is not an object" };
  }

  const property = (first.Property ?? {}) as Record<string, unknown>;
  const address  = (property.Address  ?? {}) as Record<string, unknown>;
  const photos   = Array.isArray(property.Photo) ? property.Photo : [];

  // Parse combined address text "123 Main St|Saint John, NB E2L 1A1"
  const addressText = typeof address.AddressText === "string" ? address.AddressText : "";
  const { street, city, province } = splitCombinedAddress(addressText);

  // Price — try numeric first, fall back to parsing the formatted string
  const price = parsePrice(property);

  // Photo — first high-res path if any
  const firstPhoto = photos[0] as Record<string, unknown> | undefined;
  const photoUrl   = typeof firstPhoto?.HighResPath === "string" ? firstPhoto.HighResPath : "";

  // Description — public remarks, truncated
  const remarks = typeof first.PublicRemarks === "string" ? first.PublicRemarks : "";
  const description = remarks.length > DESCRIPTION_MAX_CHARS
    ? remarks.slice(0, DESCRIPTION_MAX_CHARS)
    : remarks;

  return {
    ok: true,
    data: {
      address: street,
      city,
      province,
      price,
      photoUrl,
      description,
    },
  };
}

function splitCombinedAddress(text: string): { street: string; city: string; province: string } {
  // Expected: "123 Main St|Saint John, NB E2L 1A1"
  // Some responses use newline instead of pipe — handle both.
  const parts = text.split(/[|\n]/).map((p) => p.trim()).filter(Boolean);
  const street = parts[0] ?? "";
  const tail   = parts[1] ?? "";

  // "Saint John, NB E2L 1A1" → city = "Saint John", province = "NB"
  // (Postal code is dropped; we don't have a field for it.)
  const tailMatch = tail.match(/^(.+?),\s*([A-Z]{2})\b/);
  const city     = tailMatch?.[1]?.trim() ?? "";
  const province = tailMatch?.[2] ?? "";

  return { street, city, province };
}

function parsePrice(property: Record<string, unknown>): number | null {
  // Prefer the unformatted numeric field if present
  const unformatted = property.PriceUnformattedValue;
  if (typeof unformatted === "string" && /^\d+(\.\d+)?$/.test(unformatted)) {
    const n = Number(unformatted);
    return Number.isFinite(n) ? Math.round(n) : null;
  }
  if (typeof unformatted === "number" && Number.isFinite(unformatted)) {
    return Math.round(unformatted);
  }

  // Fall back to the formatted display string: "$450,000"
  const formatted = property.Price;
  if (typeof formatted === "string") {
    const cleaned = formatted.replace(/[$,]/g, "").trim();
    const n = Number(cleaned);
    return Number.isFinite(n) ? Math.round(n) : null;
  }

  return null;
}
```

- [ ] **Step 4: Update happy-path test assertions with real fixture values**

Open `apps/web/lib/realtor-ca/__tests__/fixtures/sample-response.json` and read the actual address, city, province, price, photo URL, and description for the listing the spike captured. Then update the FIRST test in `fetch-listing.test.ts` (the "extracts all fields from a real captured response" test) to assert exact values rather than just truthy/typeof. Example update:

```ts
it("extracts all fields from a real captured response", () => {
  const result = normalizeUpstream(sampleResponse);
  expect(result.ok).toBe(true);
  if (!result.ok) return;

  // Values are from the fixture captured by the spike for the listing
  // whose URL the spike used. Update to match the actual fixture content.
  expect(result.data.address).toBe("123 Main Street");
  expect(result.data.city).toBe("Saint John");
  expect(result.data.province).toBe("NB");
  expect(result.data.price).toBe(450000);
  expect(result.data.photoUrl).toMatch(/^https:\/\/cdn\.realtor\.ca\//);
  expect(result.data.description.length).toBeGreaterThan(0);
});
```

- [ ] **Step 5: Run the tests and confirm they pass**

```bash
cd apps/web && pnpm vitest run lib/realtor-ca/__tests__/fetch-listing.test.ts
```

Expected: PASS — 13 tests passed (8 normalizer + 5 fetcher).

If the happy-path test fails because the fixture's address shape differs from the assumed split-on-pipe format, inspect the actual `AddressText` value and adjust `splitCombinedAddress` accordingly. The other tests should pass without changes.

- [ ] **Step 6: Commit**

```bash
cd "/Users/b/Desktop/Agent Runway Website/Project Home/02 - Web App Code/agentrunway-web"
git add apps/web/lib/realtor-ca/fetch-listing.ts \
        apps/web/lib/realtor-ca/__tests__/fetch-listing.test.ts \
        apps/web/lib/realtor-ca/__tests__/fixtures/sample-response.json
git commit -m "$(cat <<'EOF'
feat(realtor-ca): add API fetcher and response normalizer

Calls realtor.ca's unofficial PropertyDetails endpoint with a 5s timeout
and normalizes the response to a clean ListingData shape. Returns a
discriminated union — never throws. Handles missing photo, missing price,
long descriptions, combined address text splitting, network errors, and
shape changes.

Fixture in __tests__/fixtures/ is a real captured response used for the
happy-path test; mocked fetch covers all failure paths.

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
  | "listing_not_found"
  | "upstream_unavailable"
  | "upstream_shape_changed";

const ERROR_MESSAGES: Record<ErrorCode, string> = {
  unauthenticated:        "Session expired — please refresh",
  invalid_url:            "Paste a realtor.ca listing URL",
  not_a_listing:          "That doesn't look like a listing page — paste the URL from the listing itself",
  listing_not_found:      "Listing not found — it may have been sold or removed",
  upstream_unavailable:   "Couldn't reach realtor.ca — enter details manually or try again",
  upstream_shape_changed: "Couldn't reach realtor.ca — enter details manually or try again",
};

const ERROR_STATUS: Record<ErrorCode, number> = {
  unauthenticated:        401,
  invalid_url:            400,
  not_a_listing:          400,
  listing_not_found:      404,
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

  // 3. Fetch + normalize
  const result = await fetchRealtorListing(parsed.listingId);
  if (!result.ok) {
    if (result.reason === "not_found") {
      return errorResponse("listing_not_found");
    }
    // upstream_unavailable | upstream_shape_changed — log for triage
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
