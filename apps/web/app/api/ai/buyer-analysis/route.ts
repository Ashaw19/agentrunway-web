/**
 * POST /api/ai/buyer-analysis
 *
 * Generates a "Buyer DNA" profile for a client based on their property showings.
 * Requires 3+ showings to have meaningful data. Analyzes:
 * - Price range & budget drift (trending up/down/stable)
 * - Property type preferences
 * - Preferred areas (cities/neighbourhoods)
 * - Viewing velocity (showings per week)
 * - AI-generated narrative summary with conversation starters
 *
 * Body: { clientId: string }
 * Returns: BuyerDNA object
 */

import { generateText } from "ai";
import { models, heliconeHeaders } from "@/lib/ai/provider";
import { NextRequest, NextResponse } from "next/server";
import { createClient }       from "@/lib/supabase/server";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { requirePro } from "@/lib/require-pro";

const MIN_SHOWINGS = 3;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const proCheck = await requirePro(supabase, user.id);
  if (!proCheck.allowed) return proCheck.response!;

  const rl = await checkRateLimit(user.id, "buyer_analysis", 15, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limited — try again later" },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  let body: { clientId: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const { clientId } = body;
  if (!clientId) {
    return NextResponse.json({ error: "Missing clientId" }, { status: 400 });
  }

  // Fetch all showings for this client
  const { data: showings, error } = await supabase
    .from("property_showings")
    .select("*")
    .eq("user_id", user.id)
    .eq("client_id", clientId)
    .order("showing_date", { ascending: true });

  if (error) {
    console.error("[buyer-analysis] DB error:", error);
    return NextResponse.json({ error: "Failed to fetch showings" }, { status: 500 });
  }

  if (!showings || showings.length < MIN_SHOWINGS) {
    return NextResponse.json(
      { error: `Need at least ${MIN_SHOWINGS} showings for analysis (have ${showings?.length ?? 0})` },
      { status: 400 },
    );
  }

  // ── Compute statistics ─────────────────────────────────────────────────────

  const prices = showings
    .map((s) => Number(s.listing_price))
    .filter((p) => p > 0);
  const avgPrice = prices.length > 0
    ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length)
    : 0;
  const priceRange: [number, number] = prices.length > 0
    ? [Math.min(...prices), Math.max(...prices)]
    : [0, 0];

  // Budget drift: compare first half vs second half average price
  let budgetDrift: "stable" | "increasing" | "decreasing" = "stable";
  if (prices.length >= 4) {
    const mid = Math.floor(prices.length / 2);
    const firstHalf = prices.slice(0, mid);
    const secondHalf = prices.slice(mid);
    const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
    const change = (avgSecond - avgFirst) / avgFirst;
    if (change > 0.05) budgetDrift = "increasing";
    else if (change < -0.05) budgetDrift = "decreasing";
  }

  // Property type counts
  const typeCounts = new Map<string, number>();
  for (const s of showings) {
    const t = (s.property_type as string) ?? "other";
    typeCounts.set(t, (typeCounts.get(t) ?? 0) + 1);
  }
  const preferredType = [...typeCounts.entries()]
    .sort((a, b) => b[1] - a[1])[0]?.[0] ?? "unknown";

  // Bedrooms / bathrooms / sqft averages
  const beds = showings.map((s) => Number(s.bedrooms)).filter((n) => n > 0);
  const baths = showings.map((s) => Number(s.bathrooms)).filter((n) => n > 0);
  const sqfts = showings.map((s) => Number(s.square_feet)).filter((n) => n > 0);
  const avgBeds = beds.length > 0 ? +(beds.reduce((a, b) => a + b, 0) / beds.length).toFixed(1) : 0;
  const avgBaths = baths.length > 0 ? +(baths.reduce((a, b) => a + b, 0) / baths.length).toFixed(1) : 0;
  const avgSqft = sqfts.length > 0 ? Math.round(sqfts.reduce((a, b) => a + b, 0) / sqfts.length) : 0;

  // Preferred areas
  const areaCounts = new Map<string, number>();
  for (const s of showings) {
    const area = (s.city as string)?.trim();
    if (area) areaCounts.set(area, (areaCounts.get(area) ?? 0) + 1);
  }
  const preferredAreas = [...areaCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([area]) => area);

  // Viewing velocity (showings per week)
  const dates = showings.map((s) => new Date(s.showing_date).getTime());
  const span = (Math.max(...dates) - Math.min(...dates)) / (1000 * 60 * 60 * 24 * 7); // weeks
  const velocity = span > 0 ? +(showings.length / span).toFixed(1) : showings.length;

  // Date range
  const dateRange: [string, string] = [
    showings[0].showing_date,
    showings[showings.length - 1].showing_date,
  ];

  // Top-rated (4-5 star) showing notes
  const topRated = showings
    .filter((s) => (s.client_rating ?? 0) >= 4)
    .map((s) => `${s.property_address}: ${s.notes ?? "no notes"}`)
    .slice(0, 5);

  // ── AI summary via Claude ─────────────────────────────────────────────────

  let aiSummary = "";

  if (process.env.ANTHROPIC_API_KEY || process.env.GROQ_API_KEY) {
    try {
      // Fetch client name for personalisation
      const { data: client } = await supabase
        .from("clients")
        .select("name")
        .eq("id", clientId)
        .eq("user_id", user.id)
        .single();

      const prompt = `You are part of a Canadian real estate agent's Flight Crew. Based on the following buyer showings data, write a 3-4 sentence "Buyer DNA" summary that helps the agent understand their client's home search patterns and preferences. Include one actionable insight or conversation starter.

Client: ${client?.name ?? "Unknown"}
Total showings: ${showings.length} (over ${Math.ceil(span)} weeks)
Average price: $${avgPrice.toLocaleString()}
Price range: $${priceRange[0].toLocaleString()} – $${priceRange[1].toLocaleString()}
Budget trend: ${budgetDrift}
Preferred type: ${preferredType}
Average: ${avgBeds} bed / ${avgBaths} bath / ${avgSqft} sqft
Preferred areas: ${preferredAreas.join(", ") || "varied"}
Viewing pace: ${velocity} showings/week

Top-rated properties:
${topRated.join("\n") || "None rated 4+ yet"}

Showing history (most recent ${Math.min(showings.length, 20)}):
${showings.slice(-20).map((s) => `- ${s.showing_date}: ${s.property_address} (${s.city ?? "?"}) — $${Number(s.listing_price ?? 0).toLocaleString()} — ${s.client_rating ?? "?"}★ — ${s.property_type ?? "?"}`).join("\n")}

Write the summary in second person ("your client"). Be specific, not generic.`;

      const { text } = await generateText({
        model: models.default,
        prompt,
        temperature: 0.6,
        maxOutputTokens: 300,
        headers: heliconeHeaders({ userId: user.id, feature: "buyer-analysis" }),
      });

      aiSummary = text?.trim() ?? "";
    } catch (err) {
      console.error("[buyer-analysis] AI error:", err);
    }
  }

  // ── Return BuyerDNA ────────────────────────────────────────────────────────

  const dna = {
    preferred_type:     preferredType,
    avg_price:          avgPrice,
    price_range:        priceRange,
    avg_bedrooms:       avgBeds,
    avg_bathrooms:      avgBaths,
    avg_sqft:           avgSqft,
    preferred_areas:    preferredAreas,
    budget_drift:       budgetDrift,
    viewing_velocity:   velocity,
    top_rated_features: topRated,
    total_showings:     showings.length,
    date_range:         dateRange,
    ai_summary:         aiSummary,
  };

  return NextResponse.json(dna, { headers: rateLimitHeaders(rl) });
}
