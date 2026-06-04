/**
 * POST /api/ai/extract-property
 *
 * Accepts a screenshot or MLS listing image (base64), sends it to Claude
 * (Haiku 4.5 via Vercel AI SDK), and returns structured property data
 * extracted from the image. Used by the Showings Ledger to auto-fill
 * property details from a realtor.ca screenshot or MLS cut sheet photo.
 *
 * Body: { image: string (base64), showingId?: string }
 * Returns: { extracted: { ... }, showingId?: string }
 */

import { generateText } from "ai";
import { models, heliconeHeaders } from "@/lib/ai/provider";
import { NextRequest, NextResponse } from "next/server";
import { createClient }       from "@/lib/supabase/server";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { requirePro } from "@/lib/require-pro";

const VISION_PROMPT = `You are a Canadian real estate data extraction assistant.
Analyze this property listing image (screenshot from realtor.ca, MLS cut sheet, or listing photo).

Extract ALL available property details and return ONLY a valid JSON object with these fields (use null for any field not found):

{
  "property_address": "full street address",
  "city": "city name",
  "province_region": "province or region",
  "postal_code": "postal code",
  "mls_number": "MLS® number if visible",
  "listing_price": 599000,
  "property_type": "detached|semi|townhouse|condo|other",
  "bedrooms": 3,
  "bathrooms": 2.5,
  "square_feet": 1800,
  "lot_size": "50 x 120 ft",
  "year_built": 2005,
  "parking": "2 car garage",
  "taxes_annual": 4200,
  "days_on_market": 14,
  "description": "brief 1-2 sentence summary of the property"
}

IMPORTANT:
- listing_price, square_feet, taxes_annual must be numbers (no $ or commas)
- bathrooms can be a decimal (e.g. 2.5 for 2 full + 1 half)
- Return ONLY the JSON object, no markdown, no explanation`;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const proCheck = await requirePro(supabase, user.id);
  if (!proCheck.allowed) return proCheck.response!;

  // Rate limit: 20 extractions/hour
  const rl = await checkRateLimit(user.id, "extract_property", 20, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limited — try again later" },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  if (!process.env.ANTHROPIC_API_KEY && !process.env.GROQ_API_KEY) {
    return NextResponse.json(
      { error: "AI extraction not configured" },
      { status: 503 },
    );
  }

  let body: { image: string; showingId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const { image, showingId } = body;

  if (!image || typeof image !== "string") {
    return NextResponse.json(
      { error: "Missing image (base64)" },
      { status: 400 },
    );
  }

  // Reject images larger than ~5 MB (base64 is ~4/3× raw size, so 7 MB string ≈ 5 MB image)
  if (image.length > 7_000_000) {
    return NextResponse.json(
      { error: "Image too large. Please use an image under 5 MB." },
      { status: 413 },
    );
  }

  // Extract raw base64 and mime type for Vercel AI SDK format
  let mimeType = "image/jpeg";
  let base64Data = image;
  if (image.startsWith("data:")) {
    const match = image.match(/^data:(image\/\w+);base64,(.+)$/);
    if (match) {
      mimeType = match[1];
      base64Data = match[2];
    }
  }

  try {
    const { text: raw } = await generateText({
      model: models.fast,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: VISION_PROMPT },
            { type: "image", image: base64Data, mediaType: mimeType },
          ],
        },
      ],
      temperature: 0.1,
      maxOutputTokens: 1024,
      headers: heliconeHeaders({ userId: user.id, feature: "extract-property" }),
    });

    // Parse JSON from response (may have markdown code fences)
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const extracted = jsonMatch ? JSON.parse(jsonMatch[0]) : {};

    // If showingId provided, update the showing record with extracted data
    if (showingId) {
      const updates: Record<string, unknown> = { extracted_data: extracted };
      // Map extracted fields to table columns (only if they were extracted)
      if (extracted.property_address) updates.property_address = extracted.property_address;
      if (extracted.city)             updates.city             = extracted.city;
      if (extracted.province_region)  updates.province_region  = extracted.province_region;
      if (extracted.postal_code)      updates.postal_code      = extracted.postal_code;
      if (extracted.mls_number)       updates.mls_number       = extracted.mls_number;
      if (extracted.listing_price)    updates.listing_price    = extracted.listing_price;
      if (extracted.property_type)    updates.property_type    = extracted.property_type;
      if (extracted.bedrooms)         updates.bedrooms         = extracted.bedrooms;
      if (extracted.bathrooms)        updates.bathrooms        = extracted.bathrooms;
      if (extracted.square_feet)      updates.square_feet      = extracted.square_feet;
      if (extracted.lot_size)         updates.lot_size         = extracted.lot_size;
      if (extracted.year_built)       updates.year_built       = extracted.year_built;

      await supabase
        .from("property_showings")
        .update(updates)
        .eq("id", showingId)
        .eq("user_id", user.id);
    }

    return NextResponse.json({ extracted, showingId }, { headers: rateLimitHeaders(rl) });
  } catch (err) {
    console.error("[extract-property] AI vision error:", err);
    return NextResponse.json(
      { error: "AI extraction failed" },
      { status: 500, headers: rateLimitHeaders(rl) },
    );
  }
}
