/**
 * GET /api/ai/top-opportunities
 *
 * Returns the top 3-5 highest-value opportunities for the authenticated user.
 * Pure detection + scoring — NO database writes, NO Groq calls.
 * Fast, safe, read-only.
 */

import { NextResponse }  from "next/server";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { getTopOpportunities } from "@/app/api/ai/detect-opportunities/route";
import { authenticateRequest } from "@/lib/api-helpers";

export const maxDuration = 30;

export async function GET() {
  const auth = await authenticateRequest();
  if (auth.error) return auth.error;
  const { supabase, userId } = auth;

  // Rate limit: 20 reads/hour (lightweight, no writes)
  const rl = await checkRateLimit(userId, "top_opportunities", 20, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit reached. Try again in a few minutes." },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  try {
    const opportunities = await getTopOpportunities(userId, supabase);

    return NextResponse.json(
      { opportunities },
      { headers: rateLimitHeaders(rl) },
    );
  } catch (err) {
    console.error("[top-opportunities] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
