/**
 * POST /api/ai/reward-suggestion
 *
 * Returns a personalised client reward suggestion powered by Groq
 * (llama-3.1-8b-instant via OpenAI-compatible endpoint).
 *
 * If GROQ_API_KEY is not set the route returns a graceful rule-based
 * fallback so the rest of the app never breaks.
 *
 * Optional enrichment: if GOOGLE_PLACES_API_KEY is set, the route
 * queries the Places Nearby Search API for top-rated restaurants /
 * venues near the property address and passes the results to the AI
 * so it can recommend a real, named venue.
 */

import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RewardSuggestionRequest {
  clientName:   string;
  /** City or full address used for venue search */
  location:     string;
  /** Province / state for market context */
  province?:    string;
  /** GCI earned on the most recent or highest deal, in CAD */
  dealGCI:      number;
  /** Agent's average GCI per deal — sets market context */
  avgGCI:       number;
  /** Generosity level chosen by the agent */
  generosity:   "thoughtful" | "generous" | "lavish";
  /** Pre-calculated budget in CAD */
  budget:       number;
}

export interface RewardSuggestionResponse {
  suggestion:  string;        // 2–3 sentence personalised recommendation
  venueName?:  string;        // Specific venue name if Places enrichment found one
  confidence:  "high" | "medium" | "low"; // "high" if real venue data used
  source:      "groq" | "fallback";
}

// ── Generosity labels ─────────────────────────────────────────────────────────

const GENEROSITY_COPY = {
  thoughtful: "a heartfelt, modest gesture",
  generous:   "a genuinely generous gift",
  lavish:     "an over-the-top, memorable experience",
};

// ── Google Places enrichment (optional) ───────────────────────────────────────

interface PlacesVenue {
  name:    string;
  rating:  number;
  types:   string[];
  vicinity: string;
}

async function fetchNearbyVenues(location: string, budget: number): Promise<PlacesVenue[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey || !location) return [];

  try {
    // Geocode the location string to lat/lng
    const geoRes = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(location + " Canada")}&key=${apiKey}`,
    );
    const geoData = await geoRes.json();
    const latLng = geoData.results?.[0]?.geometry?.location;
    if (!latLng) return [];

    // Choose venue type by budget tier
    const type  = budget >= 200 ? "restaurant" : budget >= 75 ? "cafe" : "cafe";
    const radius = 5000; // 5 km

    const placesRes = await fetch(
      `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${latLng.lat},${latLng.lng}&radius=${radius}&type=${type}&minprice=${budget >= 200 ? 3 : 1}&key=${apiKey}`,
    );
    const placesData = await placesRes.json();

    return ((placesData.results ?? []) as PlacesVenue[])
      .filter((p) => p.rating >= 4.0)
      .slice(0, 3);
  } catch {
    return [];
  }
}

// ── Groq prompt ───────────────────────────────────────────────────────────────

function buildPrompt(req: RewardSuggestionRequest, venues: PlacesVenue[]): string {
  const venueCtx = venues.length > 0
    ? `\nReal nearby venues (choose the best fit if appropriate):\n${venues.map((v) => `  - ${v.name} (${v.rating}★) at ${v.vicinity}`).join("\n")}`
    : "";

  return `You are a thoughtful real estate gifting advisor helping a Canadian real estate agent thank a client.

Context:
- Client name: ${req.clientName}
- Property location: ${req.location}${req.province ? `, ${req.province}` : ""}
- GCI earned on this deal: $${req.dealGCI.toLocaleString("en-CA")} CAD
- Agent's average GCI per deal: $${req.avgGCI.toLocaleString("en-CA")} CAD
- Agent's gift style: ${GENEROSITY_COPY[req.generosity]}
- Suggested gift budget: ~$${req.budget} CAD${venueCtx}

Write a 2–3 sentence personalised gift recommendation for this client. Be specific, warm, and practical. If real venue names were provided above, mention one by name. Match the tone to the location (a Newfoundland agent shouldn't sound like Bay Street; a Toronto agent can lean a bit more upscale). Do NOT include a dollar amount — the agent already knows their budget. End with one brief "pro tip" line.

Respond with ONLY the recommendation text — no labels, no JSON, no preamble.`;
}

// ── Rule-based fallback ───────────────────────────────────────────────────────

function fallbackSuggestion(req: RewardSuggestionRequest): RewardSuggestionResponse {
  const ratio = req.avgGCI > 0 ? req.dealGCI / req.avgGCI : 1;
  let suggestion: string;

  if (ratio >= 2) {
    suggestion = `This was an exceptional deal for ${req.clientName} — a polished experience like a restaurant gift card or curated gift basket would feel as special as the transaction itself. Consider adding a handwritten note referencing the property — it makes the gesture personal. Pro tip: local is always better than chain for gifting in smaller markets.`;
  } else if (ratio >= 1) {
    suggestion = `${req.clientName} had a solid deal with you — a warm, personal thank-you goes a long way. A gift card to a well-reviewed local restaurant or a quality bottle of wine with a note is perfectly proportionate. Pro tip: mention a detail from the transaction in your card — clients remember that more than the gift itself.`;
  } else {
    suggestion = `A heartfelt handwritten card with a local coffee shop or bakery gift card is the right scale for this transaction with ${req.clientName}. It's the personal touch that turns a one-time client into a referral source. Pro tip: follow up in 6 months to ask how they're settling in — that call often leads to referrals.`;
  }

  return { suggestion, confidence: "low", source: "fallback" };
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Auth guard
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  // Rate limit: 20 suggestions per hour per user
  const rl = await checkRateLimit(user.id, "reward_suggestion", 20, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit reached. Try again later." },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  const body: RewardSuggestionRequest = await req.json();
  const { clientName, location, province, dealGCI, avgGCI, generosity, budget } = body;

  if (!clientName || !dealGCI || !budget) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Optional: Google Places venue enrichment
  const venues = await fetchNearbyVenues(location ?? "", budget);

  // If no Groq key, return rule-based fallback immediately
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) {
    return NextResponse.json(
      fallbackSuggestion({ clientName, location, province, dealGCI, avgGCI, generosity, budget }),
      { headers: rateLimitHeaders(rl) },
    );
  }

  // Call Groq via OpenAI-compatible SDK
  try {
    const ai = new OpenAI({
      apiKey:  groqKey,
      baseURL: "https://api.groq.com/openai/v1",
    });

    const completion = await ai.chat.completions.create({
      model:       "llama-3.1-8b-instant",   // fast + cheap; swap for llama-3.3-70b-versatile for richer output
      max_tokens:  220,
      temperature: 0.7,
      messages: [
        { role: "user", content: buildPrompt(body, venues) },
      ],
    });

    const suggestion = completion.choices[0]?.message?.content?.trim() ?? "";
    if (!suggestion) throw new Error("Empty response");

    return NextResponse.json(
      {
        suggestion,
        venueName:  venues[0]?.name,
        confidence: venues.length > 0 ? "high" : "medium",
        source:     "groq",
      } satisfies RewardSuggestionResponse,
      { headers: rateLimitHeaders(rl) },
    );
  } catch (err) {
    console.error("[reward-suggestion] Groq error:", err);
    // Graceful fallback — never surface a 500 to the user
    return NextResponse.json(
      fallbackSuggestion(body),
      { headers: rateLimitHeaders(rl) },
    );
  }
}
