# Design: Realtor.ca Listing Import for Open House Setup

**Date:** 2026-05-24
**Surface:** Open House Setup (`/open-house-setup`)
**Status:** Approved by Andrew Shaw (section-by-section, 2026-05-24)

---

## Purpose

Let an agent paste a realtor.ca listing URL into the Open House Setup form and auto-fill
the property fields (address, city, province, price, photo, description) in one click —
eliminating the most tedious part of preparing the open house page before each event.
All imported fields remain editable so the agent can tune anything before publishing.

The open house URL itself never changes (it's keyed to the agent's persistent slug). This
feature only accelerates the per-event property-detail refresh.

---

## What Is NOT in Scope

- **Date/time auto-fill** — open house scheduling is event-level, never in the listing data.
  These fields stay manual.
- **Agent card auto-fill** — pre-populated from the agent's AR profile, untouched by this feature.
- **Listing search** — no in-app search of realtor.ca. The agent brings the URL of their own
  listing.
- **Storing the realtor.ca URL** — the URL is a scratchpad in the form only. It is not
  persisted to `agent_open_houses`. No schema change.
- **Bedroom/bathroom/square-footage capture** — `agent_open_houses` has no columns for these
  and we're not adding any in this PR. Could be a follow-up if value emerges.
- **Re-import on edit** — agent can re-paste the URL at any time and click Import again. We
  don't auto-detect URL changes or persist the URL between sessions.
- **Multi-listing batch import** — one URL per Import action.

---

## Architecture

Three pieces, all within existing patterns:

### 1. API route — `apps/web/app/api/realtor-listing/route.ts` (NEW)

- `GET /api/realtor-listing?url=<encoded>` — single endpoint
- Requires authenticated session (returns 401 otherwise)
- Validates the URL, extracts the listing ID, calls the realtor.ca internal API
- Normalizes the upstream response to a clean `ListingData` shape
- Returns 200 + JSON on success, structured errors otherwise (see error matrix below)
- Runs on the standard Vercel Node runtime (not Edge) — keeps the spike + fallback simple

### 2. Form update — `apps/web/app/(app)/open-house-setup/open-house-setup-content.tsx`

- New `realtorUrl` state field (string, **not persisted**)
- At the top of the "Current Property" card, a compact row: URL input + "Import" button
- On click: validate URL client-side, fetch the API route, populate form state via the
  existing setters (`setPropertyAddress`, `setPropertyCity`, `setPropertyProvince`,
  `setPropertyPrice`, `setPropertyPhotoUrl`, `setDescription`)
- Success toast: "Imported from realtor.ca ✓"
- All fields remain editable after import — standard save flow takes it from there

### 3. No DB changes

`property_photo_url` is already `TEXT` — hotlinked URLs are structurally identical to the
Supabase Storage URLs we use today. The form's existing save path serializes whatever URL
is in state.

---

## Data Flow

```
[Agent pastes URL]
   ↓
[Client: validate format → enable Import button]
   ↓
[Agent clicks Import → loading state]
   ↓
GET /api/realtor-listing?url=<encoded>
   ↓
[Server: validate session → 401 if anon]
   ↓
[Server: parse listing ID from URL → 400 if not a listing URL]
   ↓
[Server: fetch realtor.ca internal API]
   ↓ (or fallback to HTML + JSON-LD if internal API unavailable)
[Server: normalize → { address, city, province, price, photoUrl, description }]
   ↓
[Server: 200 + JSON]
   ↓
[Client: setPropertyAddress(...), setPropertyCity(...), ... ]
   ↓
[Toast: "Imported from realtor.ca ✓"]
   ↓
[Agent reviews, edits if needed, clicks Save → existing save flow]
```

---

## API Contract

**Endpoint:** `GET /api/realtor-listing?url=<encoded-realtor-ca-url>`

**Auth:** Requires authenticated Supabase session. Returns 401 if absent.

**Success — 200:**

```ts
type ListingImportResponse = {
  address:     string;     // street address only, e.g. "123 Main Street"
  city:        string;
  province:    string;     // 2-letter code, e.g. "NB"
  price:       number | null;   // integer dollars, null if not listed
  photoUrl:    string;     // hotlink URL, "" if no photo on listing
  description: string;     // public remarks, trimmed to 600 chars
};
```

**Errors:**

```ts
type ErrorResponse = {
  error: string;  // user-safe message; full details only in Sentry
  code:  "unauthenticated"
       | "invalid_url"
       | "not_a_listing"
       | "listing_not_found"
       | "upstream_unavailable"
       | "upstream_shape_changed";
};
```

| Failure | HTTP | `code` | `error` (user-facing) |
|---|---|---|---|
| No session | 401 | `unauthenticated` | "Session expired — please refresh" |
| Empty / malformed / not-realtor.ca URL | 400 | `invalid_url` | "Paste a realtor.ca listing URL" |
| Realtor.ca URL but no listing ID (map, homepage) | 400 | `not_a_listing` | "That doesn't look like a listing page — paste the URL from the listing itself" |
| Realtor.ca returns 404 | 404 | `listing_not_found` | "Listing not found — it may have been sold or removed" |
| Realtor.ca returns 5xx or times out (>5 s) | 502 | `upstream_unavailable` | "Couldn't reach realtor.ca — enter details manually or try again" |
| Realtor.ca returns 200 but shape is wrong | 502 | `upstream_shape_changed` | Same as `upstream_unavailable` |

**Partial-data behaviour:**
If realtor.ca returns the listing but a field is missing (no photo, no public remarks),
we fill what we have and leave the rest as `""` / `null`. No error — agent fills the gap.

---

## URL Parsing Rules

Accept these URL shapes:
- `https://www.realtor.ca/real-estate/27254789/...`
- `https://realtor.ca/real-estate/27254789/...` (no www)
- `https://www.realtor.ca/fr/immobilier/27254789/...` (French)

Reject (with `not_a_listing`):
- `https://www.realtor.ca/map#...` (map URL — no ID)
- `https://www.realtor.ca/` (homepage)
- Any realtor.ca path without `/real-estate/<digits>/` or `/immobilier/<digits>/`

Reject (with `invalid_url`):
- Empty string
- Non-URL strings
- URLs from any host other than `realtor.ca` or `www.realtor.ca`

**Listing-ID regex** (server-side):
```
/realtor\.ca\/(?:fr\/)?(?:real-estate|immobilier)\/(\d+)\//i
```

Captured group 1 is the listing ID.

---

## Photo Hotlinking — Risk and Fallback

**Known risk:** realtor.ca's CDN may serve images only when the `Referer` request header
is `realtor.ca`. If true, our hotlinked `<img src="...">` tags will 404 in the browser
(browsers send the open house page's URL as Referer, not realtor.ca's).

**Verification step at start of implementation (spike):**
1. Fetch a real listing's photo URL via the unofficial API or page scrape.
2. Render it in a test page on agentrunway.ca.
3. Confirm in DevTools Network tab that the image loads with 200, not 403/404.

**If hotlinking works:** ship as designed. No further action.

**If hotlinking is referer-blocked:** stop. Surface the finding to Andrew before pivoting.
Recommended pivot is to re-upload to Supabase Storage (matches existing upload flow,
adds ~1–2s to import latency, reliable forever). Alternative (image proxy through our own
API route that strips Referer) is technically possible but adds a permanent hot-path we'd
have to maintain — not recommended unless storage costs become a real concern.

---

## UI/UX Details

**Placement:** Top of the "Current Property" card in `open-house-setup-content.tsx`, above
the property photo upload section. Visually framed as "Quick start" — agent can ignore
it entirely and fill the form manually if they prefer.

**Layout:**
```
┌─────────────────────────────────────────────────────────────────┐
│ Quick start: import from realtor.ca                              │
│ ┌─────────────────────────────────────────────────┐ ┌────────┐  │
│ │ https://www.realtor.ca/real-estate/...           │ │ Import │  │
│ └─────────────────────────────────────────────────┘ └────────┘  │
│ Paste your listing URL — we'll fill in the address, price,       │
│ photo, and description.                                          │
└─────────────────────────────────────────────────────────────────┘
```

**Loading state:**
- URL input disabled
- Import button shows spinner + "Importing…" text
- ~1.5–3 s expected wait

**Success state:**
- Toast: "Imported from realtor.ca ✓"
- Form fields populated, all editable
- URL field retains the URL (in case user wants to re-import)

**Error states:**
- Each error from the matrix shows its corresponding toast
- URL field stays populated so the user can fix/retry
- Form fields untouched on error

**Mobile (< 640px):**
- URL input full width
- Import button stacks below, full width

**Accessibility:**
- URL input has visible label
- Import button has `aria-busy` during loading
- Toast announcements via existing `sonner` library (already a11y-friendly)

---

## Auth + Rate Limiting

**Auth:** Standard Supabase session check at the top of the route. Pattern:

```ts
const supabase = await createServerClient();
const { data: { user } } = await supabase.auth.getUser();
if (!user) {
  return NextResponse.json(
    { error: "Session expired — please refresh", code: "unauthenticated" },
    { status: 401 }
  );
}
```

**Rate limiting:** None for v1. The natural UX (one import per page edit) makes abuse
unlikely from real users. If abuse surfaces (Sentry sees a single user hitting the route
dozens of times in a minute), add a simple in-memory or Redis per-user rate limit later.
Not building it preemptively.

---

## Observability (Sentry)

**Log to Sentry:**
- All `upstream_unavailable` errors with the URL, listing ID, and HTTP status from realtor.ca
- All `upstream_shape_changed` errors with the URL, raw upstream response body (first 2 KB),
  and a stack trace — this is the canary for realtor.ca changing their API on us

**Do NOT log to Sentry:**
- 401, 400 errors (user input issues, not bugs)
- 404 `listing_not_found` (legitimate listing-removed cases)

---

## Implementation Spike (First Commit)

Before building the full route, a research spike to answer two questions:

1. **Is realtor.ca's unofficial API reachable from Vercel?**
   Candidate endpoint: `https://api2.realtor.ca/Listing.svc/PropertyDetails?ApplicationId=1&CultureId=1&PropertyID={id}`
   Test: from a local Next.js dev server AND from a deployed Vercel preview, call the
   endpoint with a known listing ID. Confirm 200 + JSON response with usable fields.

2. **Does the photo URL hotlink correctly?**
   Test: take the first photo URL from the response, render `<img src="...">` on an
   agentrunway.ca page, confirm it loads (Network tab shows 200).

**Spike outcomes:**
- **Both pass:** proceed with unofficial-API approach as designed.
- **API blocked, photo OK:** swap to HTML + JSON-LD scraping for the data; keep hotlink for photo.
- **API works, photo blocked:** keep API for data; surface finding to Andrew, recommend
  re-upload pivot, await direction.
- **Both blocked:** stop and reassess feasibility with Andrew before continuing.

---

## Test Plan

**Manual (in-app):**
1. Paste a valid current listing URL → confirm fields populate correctly
2. Paste an invalid URL → confirm toast appears, no fields change
3. Paste a realtor.ca homepage URL → confirm `not_a_listing` toast
4. Paste a sold/removed listing URL → confirm `listing_not_found` toast
5. Paste a French URL (`/fr/immobilier/...`) → confirm fields populate
6. Click Import while another import is in flight → confirm button is disabled
7. Edit a field after import → confirm save still works correctly
8. Save the form after import → confirm DB row reflects imported values exactly
9. Visit the public `/open-house/[slug]` page → confirm hotlinked photo renders
10. Mobile view (< 640px) → confirm URL field + Import button stack correctly

**Automated (vitest):**
- Unit test the URL-parsing regex against all valid + invalid shapes listed above
- Unit test the upstream-response normalizer against a captured realtor.ca response
- Unit test the partial-data path (response missing optional fields)

**Not automated (acceptable gap):**
- End-to-end test against live realtor.ca (would be flaky + ToS-adjacent)
- Photo hotlinking integration test (covered by manual + spike verification)

---

## Files Changed

| File | Change |
|---|---|
| `apps/web/app/api/realtor-listing/route.ts` | NEW — the API route |
| `apps/web/lib/realtor-ca/parse-url.ts` | NEW — URL → listing-ID parser (separately testable) |
| `apps/web/lib/realtor-ca/fetch-listing.ts` | NEW — realtor.ca call + normalizer (separately testable) |
| `apps/web/app/(app)/open-house-setup/open-house-setup-content.tsx` | MODIFY — add URL field, Import button, fetch+populate logic |
| `apps/web/lib/realtor-ca/__tests__/parse-url.test.ts` | NEW — URL parser unit tests |
| `apps/web/lib/realtor-ca/__tests__/fetch-listing.test.ts` | NEW — normalizer unit tests |

No migrations. No memory/findings updates needed at design time (will be added if the
spike surfaces something material).

---

## Open Questions

None at design time. Spike will resolve the two technical unknowns (API reachability +
photo hotlinking) before full implementation begins.
