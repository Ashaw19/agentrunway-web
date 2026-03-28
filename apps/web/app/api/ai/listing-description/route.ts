/**
 * POST /api/ai/listing-description
 *
 * Generates a polished property listing description from transaction specs.
 * Uses Groq (Llama) for fast generation.
 *
 * Input: { client_record_id } or { specs: { address, bedrooms, ... } }
 * Output: { description, social_post }
 */

import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 30;

interface PropertySpecs {
  address?: string | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  square_feet?: number | null;
  lot_acres?: number | null;
  garage?: boolean | null;
  waterfront?: boolean | null;
  listing_url?: string | null;
  gci?: number | null;
  side?: string | null;
  city?: string | null;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) {
    return NextResponse.json(
      { error: "AI service not configured" },
      { status: 503 },
    );
  }

  const body = await req.json();
  let specs: PropertySpecs;

  if (body.client_record_id) {
    // Fetch specs from the transaction record
    const { data: record } = await supabase
      .from("client_records")
      .select(
        "address, bedrooms, bathrooms, square_feet, lot_acres, garage, waterfront, listing_url, gci, side",
      )
      .eq("id", body.client_record_id)
      .eq("user_id", user.id)
      .single();

    if (!record) {
      return NextResponse.json(
        { error: "Transaction not found" },
        { status: 404 },
      );
    }
    specs = record;

    // Get client city if available
    if (body.client_id) {
      const { data: client } = await supabase
        .from("clients")
        .select("city")
        .eq("id", body.client_id)
        .single();
      if (client?.city) specs.city = client.city;
    }
  } else if (body.specs) {
    specs = body.specs;
  } else {
    return NextResponse.json(
      { error: "Provide client_record_id or specs" },
      { status: 400 },
    );
  }

  // Build the property features list
  const features: string[] = [];
  if (specs.address) features.push(`Address: ${specs.address}`);
  if (specs.city) features.push(`City/Area: ${specs.city}`);
  if (specs.bedrooms != null) features.push(`${specs.bedrooms} bedroom${specs.bedrooms !== 1 ? "s" : ""}`);
  if (specs.bathrooms != null) features.push(`${specs.bathrooms} bathroom${specs.bathrooms !== 1 ? "s" : ""}`);
  if (specs.square_feet != null) features.push(`${specs.square_feet.toLocaleString()} sq ft`);
  if (specs.lot_acres != null && specs.lot_acres > 0) features.push(`${specs.lot_acres} acre lot`);
  if (specs.garage) features.push("Garage");
  if (specs.waterfront) features.push("Waterfront property");

  if (features.length < 2) {
    return NextResponse.json(
      { error: "Not enough property details to generate a description. Add specs like bedrooms, bathrooms, and square footage first." },
      { status: 422 },
    );
  }

  // Get agent name for social post
  const { data: settings } = await supabase
    .from("user_settings")
    .select("display_name")
    .eq("user_id", user.id)
    .single();
  const agentName = settings?.display_name || "";

  const prompt = `You are a professional real estate copywriter in Canada. Generate TWO things from this property data:

PROPERTY DETAILS:
${features.join("\n")}

1. **LISTING DESCRIPTION** (2-3 paragraphs, ~150 words)
- Professional, warm, compelling
- Highlight key features naturally
- End with a call to action
- Do NOT fabricate features not in the data
- Canadian English spelling (colour, centre, etc.)

2. **SOCIAL MEDIA POST** (~80 words)
- Engaging, casual-professional tone
- Include relevant emojis (2-3 max)
- End with "DM for details" or similar CTA
${agentName ? `- Agent name: ${agentName}` : ""}

Respond in this exact JSON format:
{
  "description": "...",
  "social_post": "..."
}`;

  try {
    const groq = new OpenAI({
      apiKey: groqKey,
      baseURL: "https://api.groq.com/openai/v1",
    });

    const completion = await groq.chat.completions.create({
      model: "llama-3.1-70b-versatile",
      messages: [
        { role: "system", content: "You are a Canadian real estate copywriter. Always respond with valid JSON only." },
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 800,
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const result = JSON.parse(raw);

    return NextResponse.json({
      description: result.description || "",
      social_post: result.social_post || "",
    });
  } catch (err) {
    console.error("[listing-description] Groq error:", err);
    return NextResponse.json(
      { error: "Failed to generate description" },
      { status: 500 },
    );
  }
}
