/**
 * GET /api/realtor-listing?url=<encoded-realtor-ca-url>
 *
 * Auth-gated route that fetches a realtor.ca listing by URL and returns
 * normalized property data for the Open House Setup form's auto-fill flow.
 *
 * Flow:
 *   1. Verify Supabase session (401 if anon)
 *   2. Validate URL is a realtor.ca listing URL (400 if not)
 *   3. Fetch the listing HTML page server-side (502 if blocked or missing)
 *   4. Extract JSON-LD Product schema, return normalized ListingData
 *
 * Bot-wall caveat: the fetcher returns `upstream_unavailable` for both
 * real bot-wall hits AND truly missing listings — we can't distinguish
 * them from the response. UX is identical in both cases: tell the user
 * to enter details manually. Errors logged to console for triage.
 *
 * Spec: docs/superpowers/specs/2026-05-24-realtor-ca-listing-import-design.md
 * Plan: docs/superpowers/plans/2026-05-24-realtor-ca-listing-import.md
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseRealtorCaUrl } from "@/lib/realtor-ca/parse-url";
import { fetchRealtorListing } from "@/lib/realtor-ca/fetch-listing";

type ErrorCode =
  | "unauthenticated"
  | "invalid_url"
  | "not_a_listing"
  | "upstream_unavailable"
  | "upstream_shape_changed";

const ERROR_MESSAGES: Record<ErrorCode, string> = {
  unauthenticated: "Session expired — please refresh",
  invalid_url: "Paste a realtor.ca listing URL",
  not_a_listing:
    "That doesn't look like a listing page — paste the URL from the listing itself",
  upstream_unavailable:
    "Couldn't load that listing — it may have been removed, or realtor.ca blocked the request. Enter details manually.",
  upstream_shape_changed:
    "Couldn't load that listing — please enter details manually.",
};

const ERROR_STATUS: Record<ErrorCode, number> = {
  unauthenticated: 401,
  invalid_url: 400,
  not_a_listing: 400,
  upstream_unavailable: 502,
  upstream_shape_changed: 502,
};

function errorResponse(code: ErrorCode) {
  return NextResponse.json(
    { error: ERROR_MESSAGES[code], code },
    { status: ERROR_STATUS[code] },
  );
}

export async function GET(req: NextRequest) {
  // 1. Auth gate — must be a signed-in agent
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return errorResponse("unauthenticated");
  }

  // 2. Validate URL param
  const urlParam = req.nextUrl.searchParams.get("url");
  if (!urlParam) {
    return errorResponse("invalid_url");
  }

  const parsed = parseRealtorCaUrl(urlParam);
  if (!parsed.ok) {
    return errorResponse(parsed.reason);
  }

  // 3. Fetch HTML + extract JSON-LD Product schema
  const result = await fetchRealtorListing(parsed.listingId);
  if (!result.ok) {
    // Log for triage — upstream_unavailable covers both bot-wall hits and
    // truly missing listings (can't distinguish from the response alone)
    console.error("[api/realtor-listing] upstream failure", {
      listingId: parsed.listingId,
      reason: result.reason,
      detail: result.detail,
      userId: user.id,
    });
    return errorResponse(result.reason);
  }

  // 4. Return normalized ListingData
  return NextResponse.json(result.data, { status: 200 });
}
