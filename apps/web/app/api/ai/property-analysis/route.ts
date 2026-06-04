/**
 * POST /api/ai/property-analysis
 *
 * Accepts a property image (MLS cut sheet screenshot, listing photo) and
 * optional context, then uses Claude Vision (Sonnet) to produce:
 * - Pricing assessment (current market value estimate)
 * - Offer strategy (recommended offer range + tactics)
 * - Leverage tips (non-price advantages)
 * - Market comparison (recent sales context)
 * - Risk factors
 *
 * Body: { image: string (base64), clientId?: string, showingId?: string, context?: string }
 * Returns: PropertyAnalysis-shaped response
 */

import { generateText } from "ai";
import { models, heliconeHeaders } from "@/lib/ai/provider";
import { NextRequest, NextResponse } from "next/server";
import { createClient }       from "@/lib/supabase/server";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { requirePro } from "@/lib/require-pro";

const EXTRACT_PROMPT = `You are a Canadian real estate market analyst AI.
Analyze this property listing image (MLS cut sheet, realtor.ca screenshot, or listing sheet).

First, extract key property data. Then provide a comprehensive market analysis.

Return ONLY a valid JSON object with this exact structure:

{
  "property_data": {
    "address": "full address or null",
    "city": "city or null",
    "province": "province or null",
    "mls_number": "MLS number or null",
    "listing_price": 599000,
    "property_type": "detached|semi|townhouse|condo|other",
    "bedrooms": 3,
    "bathrooms": 2.5,
    "square_feet": 1800,
    "lot_size": "lot dimensions or null",
    "year_built": 2005,
    "parking": "parking info or null",
    "taxes_annual": 4200,
    "days_on_market": 14,
    "previous_sale_price": null,
    "previous_sale_date": null
  },
  "analysis": {
    "pricing_assessment": "2-3 sentences assessing the listing price relative to the property characteristics, location, and typical Canadian market conditions. Note if it seems fairly priced, over-priced, or under-priced and why.",
    "offer_strategy": "2-3 sentences recommending an offer approach. Include a suggested offer range (e.g. 95-102% of asking). Consider days on market, market conditions, and property characteristics.",
    "leverage_tips": [
      "Specific non-price advantage tip 1 (e.g. flexible closing date)",
      "Specific tip 2 (e.g. pre-approval letter from major bank)",
      "Specific tip 3 (e.g. minimal conditions)"
    ],
    "market_comparison": "2-3 sentences providing context about the broader market for this type of property in this area. Reference general trends (spring market, rate environment, inventory levels).",
    "risk_factors": [
      "Specific risk or concern 1",
      "Specific risk or concern 2"
    ],
    "summary": "2-3 sentence executive summary a real estate agent can share with their buyer client."
  }
}

IMPORTANT:
- All number fields should be numbers, not strings
- Be specific to the property shown, not generic
- Consider Canadian real estate context (CMHC rules, provincial land transfer taxes, etc.)
- If the property previously sold, factor the price appreciation into your assessment
- If you can't determine certain details, use null and note it in your analysis`;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const proCheck = await requirePro(supabase, user.id);
  if (!proCheck.allowed) return proCheck.response!;

  const rl = await checkRateLimit(user.id, "property_analysis", 10, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limited — try again later" },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  if (!process.env.ANTHROPIC_API_KEY && !process.env.GROQ_API_KEY) {
    return NextResponse.json(
      { error: "AI analysis not configured" },
      { status: 503 },
    );
  }

  let body: {
    image:     string;
    clientId?: string;
    showingId?: string;
    context?:  string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const { image, clientId, showingId, context } = body;

  if (!image || typeof image !== "string") {
    return NextResponse.json(
      { error: "Missing image (base64)" },
      { status: 400 },
    );
  }

  // Reject images larger than ~5 MB
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
    // Add optional agent context to the prompt (capped to prevent prompt injection/overflow)
    const safeContext = typeof context === "string" ? context.slice(0, 500) : null;
    const fullPrompt = safeContext
      ? `${EXTRACT_PROMPT}\n\nAdditional context from the agent:\n${safeContext}`
      : EXTRACT_PROMPT;

    const { text: raw } = await generateText({
      model: models.default,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: fullPrompt },
            { type: "image", image: base64Data, mediaType: mimeType },
          ],
        },
      ],
      temperature: 0.3,
      maxOutputTokens: 2048,
      headers: heliconeHeaders({ userId: user.id, feature: "property-analysis" }),
    });

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};

    const propertyData = parsed.property_data ?? {};
    const analysis = parsed.analysis ?? {};

    // Save to property_analyses table
    const { data: saved, error: saveError } = await supabase
      .from("property_analyses")
      .insert({
        user_id:       user.id,
        client_id:     clientId ?? null,
        showing_id:    showingId ?? null,
        source_type:   "mls_cutsheet",
        property_data: propertyData,
        ai_analysis:   analysis,
      })
      .select("id")
      .single();

    if (saveError) {
      console.error("[property-analysis] Save error:", saveError);
    }

    return NextResponse.json(
      {
        id:            saved?.id ?? null,
        property_data: propertyData,
        analysis,
      },
      { headers: rateLimitHeaders(rl) },
    );
  } catch (err) {
    console.error("[property-analysis] AI error:", err);
    return NextResponse.json(
      { error: "AI analysis failed" },
      { status: 500, headers: rateLimitHeaders(rl) },
    );
  }
}
