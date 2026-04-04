/**
 * Nightly Cron: Pre-compute Morning Briefings
 *
 * Runs daily at ~05:00 UTC. For each active professional-tier user:
 *   1. Gathers CRM metrics (overdue follow-ups, pipeline, GCI, hot contacts)
 *   2. Calls generateMorningBriefing (Haiku — cheap & fast)
 *   3. Upserts result into precomputed_insights with 24h expiry
 *
 * Protected by CRON_SECRET Bearer token.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { generateMorningBriefing, type BriefingData } from "@/lib/ai/precompute";

export const maxDuration = 300; // 5 minutes for batch processing

const BATCH_SIZE = 5;

export async function POST(req: NextRequest) {
  // ── Auth guard ──────────────────────────────────────────────────────────
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // ── Fetch eligible users (active, professional+ tier) ───────────────────
  const { data: users, error: usersError } = await supabase
    .from("user_settings")
    .select("user_id, display_name, gci_goal, subscription_tier")
    .in("subscription_tier", ["professional", "teams"])
    .limit(500);

  if (usersError) {
    console.error("[precompute-briefings] Failed to fetch users:", usersError);
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
  }

  if (!users || users.length === 0) {
    return NextResponse.json({ status: "no_users", processed: 0, errors: 0 });
  }

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const yearStart = `${now.getFullYear()}-01-01`;
  const fourteenDaysAgo = new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10);
  const fourteenDaysAhead = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  let processed = 0;
  let errors = 0;

  // ── Process in batches to avoid API rate limits ─────────────────────────
  for (let i = 0; i < users.length; i += BATCH_SIZE) {
    const batch = users.slice(i, i + BATCH_SIZE);

    const results = await Promise.allSettled(
      batch.map(async (user) => {
        try {
          const data = await gatherUserMetrics(supabase, user, {
            todayStr,
            yearStart,
            fourteenDaysAgo,
            fourteenDaysAhead,
          });

          const briefing = await generateMorningBriefing(data, user.user_id);

          // Upsert into precomputed_insights
          const { error: upsertError } = await supabase
            .from("precomputed_insights")
            .upsert(
              {
                user_id: user.user_id,
                insight_type: "morning_briefing",
                content: briefing,
                generated_at: now.toISOString(),
                expires_at: expiresAt,
              },
              { onConflict: "user_id,insight_type" },
            );

          if (upsertError) throw upsertError;
          processed++;
        } catch (err) {
          console.error(`[precompute-briefings] Error for user ${user.user_id}:`, err);
          errors++;
        }
      }),
    );

    // Brief pause between batches to respect rate limits
    if (i + BATCH_SIZE < users.length) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  return NextResponse.json({ status: "ok", processed, errors, total: users.length });
}

// ── Metric Gathering ──────────────────────────────────────────────────────────

interface DateRanges {
  todayStr: string;
  yearStart: string;
  fourteenDaysAgo: string;
  fourteenDaysAhead: string;
}

async function gatherUserMetrics(
  supabase: ReturnType<typeof createClient>,
  user: { user_id: string; display_name: string | null; gci_goal: number | null; subscription_tier: string },
  dates: DateRanges,
): Promise<BriefingData> {
  const uid = user.user_id;

  // Run all queries in parallel
  const [
    overdueResult,
    pipelineResult,
    transactionsResult,
    upcomingClosesResult,
    hotContactsResult,
  ] = await Promise.all([
    // Overdue follow-ups: clients with active status not contacted in 14+ days
    supabase
      .from("clients")
      .select("id", { count: "exact", head: true })
      .eq("user_id", uid)
      .in("status", ["boarding", "taxiing", "approach", "in_flight"])
      .lt("last_contacted_at", dates.fourteenDaysAgo),

    // Pipeline deals
    supabase
      .from("pipeline_deals")
      .select("projected_gci, status")
      .eq("user_id", uid)
      .in("status", ["prospect", "pre_listing", "listed", "under_contract"]),

    // YTD closed transactions for GCI
    supabase
      .from("transactions")
      .select("gci")
      .eq("user_id", uid)
      .eq("status", "closed")
      .gte("date", dates.yearStart),

    // Upcoming closes (pipeline deals closing within 14 days)
    supabase
      .from("pipeline_deals")
      .select("address, projected_close_date")
      .eq("user_id", uid)
      .eq("status", "under_contract")
      .gte("projected_close_date", dates.todayStr)
      .lte("projected_close_date", dates.fourteenDaysAhead)
      .order("projected_close_date", { ascending: true })
      .limit(5),

    // Hot contacts (highest engagement score)
    supabase
      .from("clients")
      .select("name, engagement_score")
      .eq("user_id", uid)
      .gt("engagement_score", 0)
      .order("engagement_score", { ascending: false })
      .limit(5),
  ]);

  // Compute derived values
  const pipelineDeals = pipelineResult.data ?? [];
  const pipelineValue = pipelineDeals.reduce(
    (sum, d) => sum + Number(d.projected_gci ?? 0),
    0,
  );

  const ytdGci = (transactionsResult.data ?? []).reduce(
    (sum, t) => sum + Number(t.gci ?? 0),
    0,
  );

  const goalGci = Number(user.gci_goal ?? 0);
  const dayOfYear = Math.ceil(
    (Date.now() - new Date(`${new Date().getFullYear()}-01-01`).getTime()) / 86_400_000,
  );
  const expectedPace = goalGci > 0 ? (dayOfYear / 365) * goalGci : 0;
  const pacePercent = expectedPace > 0 ? Math.round((ytdGci / expectedPace) * 100) : 0;

  // Build anomalies from data
  const anomalies: string[] = [];
  const overdueCount = overdueResult.count ?? 0;
  if (overdueCount > 5) {
    anomalies.push(`${overdueCount} clients haven't been contacted in 14+ days`);
  }
  if (pacePercent > 0 && pacePercent < 80) {
    anomalies.push(`GCI pace is ${pacePercent}% — falling behind annual goal`);
  }

  return {
    userName: user.display_name || "there",
    todayDate: dates.todayStr,
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
