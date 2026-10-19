/**
 * GET /api/ai/top-opportunities
 *
 * Web Flight Control's Scan: the day's handful (lib/crm/next-up-handful.ts),
 * up to 5 of the highest-value opportunities for the authenticated user, the
 * same people the phone's Next up shows. Detection + scoring, NO AI calls.
 * Its only writes are the handful's own bookkeeping (next_up_handful pins,
 * and a handled client's unsent Next up text marked skipped).
 */

import { NextResponse }  from "next/server";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { loadNextUpHandful } from "@/lib/crm/next-up-handful";
import { authenticateRequest } from "@/lib/api-helpers";

export const maxDuration = 30;

export async function GET() {
  const auth = await authenticateRequest();
  if (auth.error) return auth.error;
  const { supabase, userId } = auth;

  // Rate limit: 20 reads/hour (lightweight)
  const rl = await checkRateLimit(userId, "top_opportunities", 20, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit reached. Try again in a few minutes." },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  try {
    const { opportunities } = await loadNextUpHandful(userId, supabase);

    return NextResponse.json(
      { opportunities },
      { headers: rateLimitHeaders(rl) },
    );
  } catch (err) {
    console.error("[top-opportunities] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
