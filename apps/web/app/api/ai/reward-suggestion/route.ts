/**
 * POST /api/ai/reward-suggestion
 *
 * Returns a personalised client reward suggestion powered by Claude
 * (Haiku 4.5 via Vercel AI SDK).
 *
 * If no AI key is set the route returns a graceful rule-based
 * fallback so the rest of the app never breaks.
 *
 * Optional enrichment: if GOOGLE_PLACES_API_KEY is set, the route
 * queries the Places Nearby Search API for top-rated restaurants /
 * venues near the property address and passes the results to the AI
 * so it can recommend a real, named venue.
 */

import { generateText } from "ai";
import { models, heliconeHeaders } from "@/lib/ai/provider";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { requirePro } from "@/lib/require-pro";

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
  source:      "claude" | "fallback";
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

// ── Prompt ────────────────────────────────────────────────────────────────────

function buildPrompt(req: RewardSuggestionRequest, venues: PlacesVenue[]): string {
  const venueCtx = venues.length > 0
    ? `\nReal nearby venues (choose the best fit if appropriate):\n${venues.map((v) => `  - ${v.name} (${v.rating}★) at ${v.vicinity}`).join("\n")}`
    : "";

  return `You are a thoughtful gift suggestion tool helping a Canadian real estate agent thank a client.

Context:
- Client name: ${req.clientName}
- Property location: ${req.location}${req.province ? `, ${req.province}` : ""}
- GCI earned on this deal: $${req.dealGCI.toLocaleString("en-CA")} CAD
- Agent's average GCI per deal: $${req.avgGCI.toLocaleString("en-CA")} CAD
- Agent's gift style: ${GENEROSITY_COPY[req.generosity]}
- Suggested gift budget: ~$${req.budget} CAD${venueCtx}

Write a 2–3 sentence personalised gift recommendation for this client. Be specific, warm, and practical.
- If real venue names were provided above, mention one by name.
- If no venues are listed and the budget is modest, suggest a practical Canadian gift card (Canadian Tire, Home Depot, Amazon, Costco, or Tim Hortons) — new homeowners always have a list.
- Match the tone to the location (a Newfoundland agent shouldn't sound like Bay Street; a Toronto agent can lean a bit more upscale).
- Do NOT include a dollar amount — the agent already knows their budget.
- End with one brief "pro tip" line (practical, not generic).

Respond with ONLY the recommendation text — no labels, no JSON, no preamble.`;
}

// ── Gift card fallback tiers (nationwide, no venue lookup needed) ─────────────

function giftCardTier(budget: number): string {
  if (budget < 30) {
    return "a Tim Hortons or local coffee shop gift card with a handwritten note";
  }
  if (budget < 60) {
    return "a Canadian Tire or Amazon gift card — practical, universally appreciated by new homeowners";
  }
  if (budget < 100) {
    return "a Home Depot or Costco gift card — a new homeowner's wish list is never short";
  }
  if (budget < 180) {
    return "a The Keg, Boston Pizza, or local restaurant gift card for a nice dinner out";
  }
  return "a spa, experience, or premium restaurant gift card — something genuinely memorable";
}

// ── Rule-based fallback ───────────────────────────────────────────────────────

function fallbackSuggestion(req: RewardSuggestionRequest): RewardSuggestionResponse {
  const ratio = req.avgGCI > 0 ? req.dealGCI / req.avgGCI : 1;
  const giftCard = giftCardTier(req.budget);
  let suggestion: string;

  if (ratio >= 2) {
    suggestion = `This was an exceptional deal for ${req.clientName} — consider ${giftCard}, paired with a handwritten note that references the property. Something this specific shows you were paying attention. Pro tip: local is always more memorable than chain when you can find it.`;
  } else if (ratio >= 1) {
    suggestion = `${req.clientName} brought you a solid deal — ${giftCard} is a perfectly proportionate thank-you. Add a card that mentions one detail from the transaction; clients remember the personal touch far more than the gift itself. Pro tip: drop it off in person if you can — that visit plants the next referral.`;
  } else {
    suggestion = `A thoughtful gesture goes a long way with ${req.clientName} — ${giftCard} keeps it simple and genuinely useful. It's this kind of consistent follow-through that turns a one-time client into your best referral source. Pro tip: follow up in 6 months to ask how they're settling in.`;
  }

  return { suggestion, confidence: "low", source: "fallback" };
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Auth guard
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const proCheck = await requirePro(supabase, user.id);
  if (!proCheck.allowed) return proCheck.response!;

  // Rate limit: 20 suggestions per hour per user
  const rl = await checkRateLimit(user.id, "reward_suggestion", 20, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit reached. Try again later." },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  let body: RewardSuggestionRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const { clientName, location, province, dealGCI, avgGCI, generosity, budget } = body;

  if (!clientName || !dealGCI || !budget) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Optional: Google Places venue enrichment
  const venues = await fetchNearbyVenues(location ?? "", budget);

  // If no AI key, return rule-based fallback immediately
  if (!process.env.ANTHROPIC_API_KEY && !process.env.GROQ_API_KEY) {
    return NextResponse.json(
      fallbackSuggestion({ clientName, location, province, dealGCI, avgGCI, generosity, budget }),
      { headers: rateLimitHeaders(rl) },
    );
  }

  // Call Claude via Vercel AI SDK
  try {
    const { text: suggestion } = await generateText({
      model: models.fast,
      prompt: buildPrompt(body, venues),
      maxOutputTokens: 220,
      temperature: 0.7,
      headers: heliconeHeaders({ userId: user.id, feature: "reward-suggestion" }),
    });

    if (!suggestion) throw new Error("Empty response");

    return NextResponse.json(
      {
        suggestion,
        venueName:  venues[0]?.name,
        confidence: venues.length > 0 ? "high" : "medium",
        source:     "claude",
      } satisfies RewardSuggestionResponse,
      { headers: rateLimitHeaders(rl) },
    );
  } catch (err) {
    console.error("[reward-suggestion] AI error:", err);
    // Graceful fallback — never surface a 500 to the user
    return NextResponse.json(
      fallbackSuggestion(body),
      { headers: rateLimitHeaders(rl) },
    );
  }
}
