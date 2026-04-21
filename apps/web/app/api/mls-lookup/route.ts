/**
 * POST /api/mls-lookup
 *
 * Accepts a Realtor.ca listing URL and extracts property specifications
 * by fetching the listing page and parsing structured data from it.
 *
 * Returns: { bedrooms, bathrooms, square_feet, lot_acres, garage, waterfront, address }
 *
 * This is a best-effort extraction — Realtor.ca may change their markup at
 * any time. The UI always lets users correct the values after auto-fill.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requirePro } from "@/lib/require-pro";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";

export const maxDuration = 30;

interface PropertySpecs {
  bedrooms: number | null;
  bathrooms: number | null;
  square_feet: number | null;
  lot_acres: number | null;
  garage: boolean | null;
  waterfront: boolean | null;
  address: string | null;
}

export async function POST(req: NextRequest) {
  // Auth check
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const proCheck = await requirePro(supabase, user.id);
  if (!proCheck.allowed) return proCheck.response!;

  const rl = await checkRateLimit(user.id, "mls_lookup", 20, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please wait before trying again." },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  let body: { url?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const url = body.url as string | undefined;

  if (!url || typeof url !== "string") {
    return NextResponse.json({ error: "Missing listing URL" }, { status: 400 });
  }

  // Validate it's a Realtor.ca URL
  const isRealtorCa =
    url.includes("realtor.ca") || url.includes("realtors.ca");
  if (!isRealtorCa) {
    return NextResponse.json(
      { error: "Only Realtor.ca listing URLs are supported" },
      { status: 400 },
    );
  }

  try {
    const specs = await fetchRealtorCaSpecs(url);
    return NextResponse.json(specs);
  } catch (err) {
    console.error("[mls-lookup] Error fetching listing:", err);
    return NextResponse.json(
      { error: "Could not extract property data from that URL. Please enter details manually." },
      { status: 422 },
    );
  }
}

/**
 * Fetch a Realtor.ca listing page and extract property specs.
 *
 * Strategy:
 * 1. Try the Realtor.ca API endpoint (propertyDetails) if we can extract the listing ID
 * 2. Fall back to HTML scraping with JSON-LD or meta tags
 */
async function fetchRealtorCaSpecs(listingUrl: string): Promise<PropertySpecs> {
  // Try to extract the property ID from the URL
  // Realtor.ca URLs look like: https://www.realtor.ca/real-estate/12345678/123-main-st-city
  const idMatch = listingUrl.match(/\/real-estate\/(\d+)/);

  if (idMatch) {
    const propertyId = idMatch[1];
    try {
      return await fetchFromRealtorApi(propertyId);
    } catch {
      // Fall back to HTML parsing
    }
  }

  // Fall back to HTML fetch + parse
  return await fetchFromHtml(listingUrl);
}

/**
 * Use the Realtor.ca property details API endpoint.
 * This is an undocumented but well-known API that returns structured JSON.
 */
async function fetchFromRealtorApi(propertyId: string): Promise<PropertySpecs> {
  const apiUrl = `https://api2.realtor.ca/Listing.svc/PropertyDetails?PropertyID=${propertyId}&CultureId=1&ApplicationId=1&HashCode=0`;

  const res = await fetch(apiUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "application/json",
      Referer: "https://www.realtor.ca/",
      Origin: "https://www.realtor.ca",
    },
  });

  if (!res.ok) {
    throw new Error(`Realtor.ca API returned ${res.status}`);
  }

  const data = await res.json();

  // Navigate the API response structure
  const building = data?.Building ?? {};
  const land = data?.Land ?? {};
  const property = data?.Property ?? {};

  // Extract bedrooms
  let bedrooms: number | null = null;
  if (building.Bedrooms) {
    bedrooms = parseInt(String(building.Bedrooms), 10);
    if (isNaN(bedrooms)) bedrooms = null;
  } else if (building.BathroomTotal) {
    // Sometimes in RoomSummary
    const bedroomStr = building.RoomSummary?.find?.((r: Record<string, string>) =>
      r.Type?.toLowerCase().includes("bedroom"),
    )?.Count;
    if (bedroomStr) bedrooms = parseInt(bedroomStr, 10) || null;
  }

  // Extract bathrooms
  let bathrooms: number | null = null;
  if (building.BathroomTotal) {
    bathrooms = parseFloat(String(building.BathroomTotal));
    if (isNaN(bathrooms)) bathrooms = null;
  }

  // Extract square feet
  let square_feet: number | null = null;
  const sizeStr =
    building.SizeInterior ?? building.FloorArea ?? building.SizeExterior;
  if (sizeStr) {
    // Often comes as "1500 sqft" or "139.35 m2"
    const sqftMatch = String(sizeStr).match(/([\d,]+)\s*(?:sq\.?\s*ft|sqft)/i);
    const m2Match = String(sizeStr).match(/([\d,.]+)\s*m/i);
    if (sqftMatch) {
      square_feet = parseInt(sqftMatch[1].replace(/,/g, ""), 10) || null;
    } else if (m2Match) {
      const m2 = parseFloat(m2Match[1].replace(/,/g, ""));
      square_feet = Math.round(m2 * 10.7639) || null;
    }
  }

  // Extract lot size (convert to acres)
  let lot_acres: number | null = null;
  const lotStr = land?.SizeTotal ?? land?.SizeFrontage ?? property?.LotSize;
  if (lotStr) {
    const acreMatch = String(lotStr).match(/([\d,.]+)\s*acre/i);
    const sqftLotMatch = String(lotStr).match(/([\d,]+)\s*(?:sq\.?\s*ft|sqft)/i);
    const hectMatch = String(lotStr).match(/([\d,.]+)\s*(?:ha|hect)/i);
    if (acreMatch) {
      lot_acres = parseFloat(acreMatch[1].replace(/,/g, "")) || null;
    } else if (sqftLotMatch) {
      const sqft = parseInt(sqftLotMatch[1].replace(/,/g, ""), 10);
      lot_acres = sqft > 0 ? Math.round((sqft / 43560) * 10000) / 10000 : null;
    } else if (hectMatch) {
      const hect = parseFloat(hectMatch[1].replace(/,/g, ""));
      lot_acres = hect > 0 ? Math.round(hect * 2.4711 * 10000) / 10000 : null;
    }
  }

  // Detect garage
  let garage: boolean | null = null;
  const parkingStr = JSON.stringify(property?.Parking ?? building?.Parking ?? "").toLowerCase();
  if (parkingStr.includes("garage") || parkingStr.includes("attached") || parkingStr.includes("detached garage")) {
    garage = true;
  } else if (parkingStr.length > 2) {
    garage = false;
  }

  // Detect waterfront
  let waterfront: boolean | null = null;
  const featuresStr = JSON.stringify(data).toLowerCase();
  if (
    featuresStr.includes("waterfront") ||
    featuresStr.includes("water front") ||
    featuresStr.includes("lakefront") ||
    featuresStr.includes("oceanfront") ||
    featuresStr.includes("riverfront")
  ) {
    waterfront = true;
  }

  // Address
  let address: string | null = null;
  const addr = property?.Address ?? data?.Address;
  if (addr) {
    const parts = [
      addr.AddressText ?? addr.StreetAddress,
      addr.CityDistrict ?? addr.City,
      addr.Province,
    ].filter(Boolean);
    address = parts.join(", ") || null;
  }

  return { bedrooms, bathrooms, square_feet, lot_acres, garage, waterfront, address };
}

/**
 * Fallback: fetch HTML and parse JSON-LD or meta tags.
 */
async function fetchFromHtml(listingUrl: string): Promise<PropertySpecs> {
  const res = await fetch(listingUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "text/html",
    },
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} fetching listing page`);
  }

  const html = await res.text();

  // Try JSON-LD first (Realtor.ca embeds structured data)
  const jsonLdMatch = html.match(
    /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i,
  );

  const specs: PropertySpecs = {
    bedrooms: null,
    bathrooms: null,
    square_feet: null,
    lot_acres: null,
    garage: null,
    waterfront: null,
    address: null,
  };

  if (jsonLdMatch) {
    try {
      const ld = JSON.parse(jsonLdMatch[1]);
      // Schema.org SingleFamilyResidence or RealEstateListing
      const listing = ld["@type"] === "RealEstateListing" ? ld : ld;
      if (listing.numberOfBedrooms) specs.bedrooms = parseInt(String(listing.numberOfBedrooms), 10) || null;
      if (listing.numberOfBathroomsTotal) specs.bathrooms = parseFloat(String(listing.numberOfBathroomsTotal)) || null;
      if (listing.floorSize?.value) {
        specs.square_feet = parseInt(String(listing.floorSize.value), 10) || null;
      }
      if (listing.address) {
        specs.address = [listing.address.streetAddress, listing.address.addressLocality, listing.address.addressRegion]
          .filter(Boolean)
          .join(", ") || null;
      }
    } catch {
      // JSON-LD parsing failed, continue
    }
  }

  // Supplement with meta tag parsing
  const bedMatch = html.match(/(\d+)\s*(?:bed(?:room)?s?)/i);
  if (!specs.bedrooms && bedMatch) specs.bedrooms = parseInt(bedMatch[1], 10) || null;

  const bathMatch = html.match(/([\d.]+)\s*(?:bath(?:room)?s?)/i);
  if (!specs.bathrooms && bathMatch) specs.bathrooms = parseFloat(bathMatch[1]) || null;

  const sqftMatch = html.match(/([\d,]+)\s*(?:sq\.?\s*ft|sqft|square\s*feet)/i);
  if (!specs.square_feet && sqftMatch) specs.square_feet = parseInt(sqftMatch[1].replace(/,/g, ""), 10) || null;

  // Garage detection
  if (html.toLowerCase().includes("garage")) specs.garage = true;

  // Waterfront detection
  if (
    html.toLowerCase().includes("waterfront") ||
    html.toLowerCase().includes("lakefront") ||
    html.toLowerCase().includes("oceanfront")
  ) {
    specs.waterfront = true;
  }

  return specs;
}
