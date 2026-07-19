/**
 * GET /api/briefing
 *
 * Returns the current user's morning briefing. Serves a cached
 * pre-computed briefing when fresh, or generates on-demand and caches
 * when stale/missing.
 *
 * Auth required — uses the session cookie.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { generateMorningBriefing } from "@/lib/ai/precompute";
import {
  briefingDateRanges,
  fetchBriefingUser,
  gatherBriefingMetrics,
} from "@/lib/ai/briefing-metrics";
import { requirePro } from "@/lib/require-pro";

export const maxDuration = 30;

export async function GET() {
  // ── Auth guard ──────────────────────────────────────────────────────────
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Pro gate ───────────────────────────────────────────────────────────
  const proCheck = await requirePro(supabase, user.id);
  if (!proCheck.allowed) return proCheck.response!;

  // ── Check for fresh pre-computed briefing ───────────────────────────────
  const { data: cached } = await supabase
    .from("precomputed_insights")
    .select("content, generated_at, expires_at")
    .eq("user_id", user.id)
    .eq("insight_type", "morning_briefing")
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (cached) {
    return NextResponse.json({
      briefing: cached.content,
      generated_at: cached.generated_at,
      source: "cached",
    });
  }

  // ── Generate on-demand (stale or missing) ───────────────────────────────
  try {
    // Shared with the nightly cron — see lib/ai/briefing-metrics.ts. This path
    // previously had its own copy that queried five nonexistent columns and
    // silently produced an all-zero briefing.
    const briefingUser = await fetchBriefingUser(supabase, user.id);
    const data = await gatherBriefingMetrics(
      supabase,
      briefingUser,
      briefingDateRanges(),
    );
    const briefing = await generateMorningBriefing(data, user.id);

    // Cache using service role (RLS only allows SELECT for users)
    const serviceClient = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    await serviceClient.from("precomputed_insights").upsert(
      {
        user_id: user.id,
        insight_type: "morning_briefing",
        content: briefing,
        generated_at: now,
        expires_at: expiresAt,
      },
      { onConflict: "user_id,insight_type" },
    );

    return NextResponse.json({
      briefing,
      generated_at: now,
      source: "generated",
    });
  } catch (err) {
    console.error("[briefing] On-demand generation failed:", err);
    return NextResponse.json(
      { error: "Failed to generate briefing" },
      { status: 500 },
    );
  }
}
