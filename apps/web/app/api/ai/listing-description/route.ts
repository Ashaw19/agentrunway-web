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
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { requirePro } from "@/lib/require-pro";
import { AGENT_RUNWAY_VOICE } from "@/lib/outreach-prompts";

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

  const proCheck = await requirePro(supabase, user.id);
  if (!proCheck.allowed) return proCheck.response!;

  const rl = await checkRateLimit(user.id, "listing_description", 20, 60);
  if (!rl.allowed) {
    return new Response("Too many requests. Please wait before sending more messages.", {
      status: 429,
      headers: rateLimitHeaders(rl),
    });
  }

  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) {
    return NextResponse.json(
      { error: "AI service not configured" },
      { status: 503 },
    );
  }

  const body = await req.json();
  const noEmoji = body.no_emoji === true;
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

  const prompt = `You are writing property copy for a Canadian real estate agent. Generate TWO things from this property data.

${AGENT_RUNWAY_VOICE}

PROPERTY DETAILS:
${features.join("\n")}

1. **LISTING DESCRIPTION** (2-3 short paragraphs, ~120-150 words)
- Write like a person who walked through the house and is telling a friend about it. Not like a brochure.
- Lead with what makes this property actually interesting — not generic praise.
- Describe what's there. Let the reader decide it's great. Don't announce it.
- Do NOT fabricate features not listed above. If you only have basics, keep it brief and honest.
- Canadian English spelling (colour, centre, neighbourhood, etc.)
- No stacked adjectives. "Bright kitchen with a gas range" beats "beautiful, spacious, updated chef's kitchen."
- End with something specific the agent can offer — not "contact me today!"

2. **SOCIAL MEDIA POST** (~60-80 words)
- Write like a real person sharing something they're genuinely proud of — not a marketing template.
- ${noEmoji ? "Do NOT use any emojis." : "Use 1-2 emojis maximum, only if they feel natural. Skip them entirely if the tone doesn't call for it."}
- Don't open with "Just listed!" or "Exciting news!" — find a more interesting hook.
- End with a natural CTA, not "Don't miss out!" Something like "Send me a message if you want the details."
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
        { role: "system", content: "You write property copy that sounds like a real person, not a marketing team. You avoid AI-sounding language — no 'stunning', 'nestled', 'dream home', 'don't miss out'. You describe what's actually there and let quality speak for itself. Canadian English. Always respond with valid JSON only." },
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
