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
import { generateMorningBriefing, type BriefingData } from "@/lib/ai/precompute";
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
    .single();

  if (cached) {
    return NextResponse.json({
      briefing: cached.content,
      generated_at: cached.generated_at,
      source: "cached",
    });
  }

  // ── Generate on-demand (stale or missing) ───────────────────────────────
  try {
    const data = await gatherUserMetricsFromSession(supabase, user.id);
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

// ── Metric Gathering (session-scoped, respects RLS) ───────────────────────────

async function gatherUserMetricsFromSession(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<BriefingData> {
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const yearStart = `${now.getFullYear()}-01-01`;
  const fourteenDaysAgo = new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10);
  const fourteenDaysAhead = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);

  const [settingsResult, overdueResult, pipelineResult, transactionsResult, upcomingClosesResult, hotContactsResult] =
    await Promise.all([
      supabase
        .from("user_settings")
        .select("display_name, gci_goal")
        .eq("user_id", userId)
        .single(),

      supabase
        .from("clients")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .in("status", ["boarding", "in_flight"])
        .lt("last_contact_at", fourteenDaysAgo),

      supabase
        .from("pipeline_deals")
        .select("projected_gci, status")
        .eq("user_id", userId)
        .in("status", ["prospect", "pre_listing", "listed", "under_contract"]),

      supabase
        .from("transactions")
        .select("gci")
        .eq("user_id", userId)
        .eq("status", "closed")
        .gte("date", yearStart),

      supabase
        .from("pipeline_deals")
        .select("address, projected_close_date")
        .eq("user_id", userId)
        .eq("status", "under_contract")
        .gte("projected_close_date", todayStr)
        .lte("projected_close_date", fourteenDaysAhead)
        .order("projected_close_date", { ascending: true })
        .limit(5),

      supabase
        .from("clients")
        .select("name, engagement_score")
        .eq("user_id", userId)
        .gt("engagement_score", 0)
        .order("engagement_score", { ascending: false })
        .limit(5),
    ]);

  const settings = settingsResult.data;
  const pipelineDeals = pipelineResult.data ?? [];
  const pipelineValue = pipelineDeals.reduce((sum, d) => sum + Number(d.projected_gci ?? 0), 0);
  const ytdGci = (transactionsResult.data ?? []).reduce((sum, t) => sum + Number(t.gci ?? 0), 0);
  const goalGci = Number(settings?.gci_goal ?? 0);

  const dayOfYear = Math.ceil(
    (Date.now() - new Date(`${now.getFullYear()}-01-01`).getTime()) / 86_400_000,
  );
  const expectedPace = goalGci > 0 ? (dayOfYear / 365) * goalGci : 0;
  const pacePercent = expectedPace > 0 ? Math.round((ytdGci / expectedPace) * 100) : 0;

  const overdueCount = overdueResult.count ?? 0;
  const anomalies: string[] = [];
  if (overdueCount > 5) {
    anomalies.push(`${overdueCount} clients haven't been contacted in 14+ days`);
  }
  if (pacePercent > 0 && pacePercent < 80) {
    anomalies.push(`GCI pace is ${pacePercent}% — falling behind annual goal`);
  }

  return {
    userName: settings?.display_name || "there",
    todayDate: todayStr,
    overdueFollowUps: overdueCount,
    pipelineDeals: pipelineDeals.length,
    pipelineValue,
    goalGci,
    ytdGci,
    pacePercent,
    upcomingCloses: (upcomingClosesResult.data ?? []).map((d) => ({
      address: d.address ?? "TBD",
      date: d.projected_close_date ?? "",
    })),
    recentAnomalies: anomalies,
    hotContacts: (hotContactsResult.data ?? []).map((c) => ({
      name: c.name ?? "Unknown",
      score: Number(c.engagement_score ?? 0),
    })),
  };
}
