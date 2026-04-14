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
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { generateMorningBriefing, type BriefingData } from "@/lib/ai/precompute";
import {
  computeGCI,
  computeWeightedGCI,
  type PipelineDeal,
} from "@/lib/types/database";
import { seasonalFractionElapsed } from "@/lib/engines/projection-engine";

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

  // ── Fetch eligible users (active professional+ tier OR beta org members) ──
  const { data: tierUsers, error: tierError } = await supabase
    .from("user_settings")
    .select("user_id, display_name, goal_gci, subscription_tier, use_national_seasonality, national_quarter_pcts")
    .in("subscription_tier", ["professional", "team"])
    .limit(500);

  if (tierError) {
    console.error("[precompute-briefings] Failed to fetch tier users:", tierError);
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
  }

  // Also include members of beta orgs (is_beta = true) or orgs with active subscriptions
  const { data: betaOrgMembers } = await supabase
    .from("organization_members")
    .select("user_id, organizations!inner(is_beta, subscription_status)")
    .eq("status", "active");

  const betaUserIds = new Set(
    (betaOrgMembers ?? [])
      .filter((m: Record<string, unknown>) => {
        const org = m.organizations as Record<string, unknown> | null;
        return (
          org?.is_beta === true ||
          org?.subscription_status === "active" ||
          org?.subscription_status === "trialing"
        );
      })
      .map((m: Record<string, unknown>) => m.user_id as string),
  );

  // Fetch settings for beta org members not already in tierUsers
  const tierUserIds = new Set((tierUsers ?? []).map((u) => u.user_id));
  const missingBetaIds = [...betaUserIds].filter((id) => !tierUserIds.has(id));

  let betaUsers: typeof tierUsers = [];
  if (missingBetaIds.length > 0) {
    const { data: extraUsers } = await supabase
      .from("user_settings")
      .select("user_id, display_name, goal_gci, subscription_tier, use_national_seasonality, national_quarter_pcts")
      .in("user_id", missingBetaIds)
      .limit(500);
    betaUsers = extraUsers ?? [];
  }

  const users = [...(tierUsers ?? []), ...betaUsers];

  if (users.length === 0) {
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

    const _results = await Promise.allSettled(
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = SupabaseClient<any, any, any>;

async function gatherUserMetrics(
  supabase: AnySupabaseClient,
  user: {
    user_id: string;
    display_name: string | null;
    goal_gci: number | null;
    subscription_tier: string;
    use_national_seasonality: boolean | null;
    national_quarter_pcts: number[] | null;
  },
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
    historyResult,
  ] = await Promise.all([
    // Overdue follow-ups: clients with active status not contacted in 14+ days
    supabase
      .from("clients")
      .select("id", { count: "exact", head: true })
      .eq("user_id", uid)
      .in("status", ["boarding", "in_flight"])
      .lt("last_contact_at", dates.fourteenDaysAgo),

    // Pipeline deals (select columns needed for computeWeightedGCI)
    supabase
      .from("pipeline_deals")
      .select("estimated_price, estimated_commission_pct, probability_override, stage")
      .eq("user_id", uid)
      .in("stage", ["lead", "showing", "offer", "conditional", "firm"]),

    // YTD closed transactions for GCI (select columns needed for computeGCI)
    supabase
      .from("transactions")
      .select("sale_price, commission_pct, team_split_pct, gci_override")
      .eq("user_id", uid)
      .eq("status", "closed")
      .gte("date", dates.yearStart),

    // Upcoming closes (pipeline deals closing within 14 days)
    supabase
      .from("pipeline_deals")
      .select("address, expected_close_date")
      .eq("user_id", uid)
      .eq("stage", "firm")
      .gte("expected_close_date", dates.todayStr)
      .lte("expected_close_date", dates.fourteenDaysAhead)
      .order("expected_close_date", { ascending: true })
      .limit(5),

    // Hot contacts (highest engagement score)
    supabase
      .from("clients")
      .select("name, engagement_score")
      .eq("user_id", uid)
      .gt("engagement_score", 0)
      .order("engagement_score", { ascending: false })
      .limit(5),

    // Annual history for agent-specific seasonal weights
    supabase
      .from("history_items")
      .select("year, quarter_gci")
      .eq("user_id", uid),
  ]);

  // ── Compute agent-specific seasonal weights (same logic as dashboard) ──
  const agentSeasonalWeights = (() => {
    const withData = (historyResult.data ?? []).filter(
      (h: Record<string, unknown>) =>
        (h.quarter_gci as number[] | null)?.some((v: number) => (v ?? 0) > 0),
    );
    if (withData.length < 2) return null;
    const avgQ = [0, 1, 2, 3].map((q) =>
      withData.reduce(
        (sum: number, h: Record<string, unknown>) =>
          sum + (((h.quarter_gci as number[])?.[q]) ?? 0),
        0,
      ) / withData.length,
    );
    const total = avgQ.reduce((a, b) => a + b, 0);
    return total > 0 ? avgQ.map((v) => v / total) : null;
  })();

  const seasonalWeights =
    agentSeasonalWeights ??
    (user.use_national_seasonality
      ? (user.national_quarter_pcts ?? [0.25, 0.25, 0.25, 0.25])
      : [0.25, 0.25, 0.25, 0.25]);

  // Compute derived values
  const pipelineDeals = (pipelineResult.data ?? []) as PipelineDeal[];
  const pipelineValue = pipelineDeals.reduce(
    (sum, d) => sum + computeWeightedGCI(d),
    0,
  );

  const ytdGci = (transactionsResult.data ?? []).reduce(
    (sum, t) => sum + computeGCI(t as Parameters<typeof computeGCI>[0]),
    0,
  );

  const goalGci = Number(user.goal_gci ?? 0);
  const fraction = seasonalFractionElapsed(seasonalWeights);
  const expectedPace = goalGci > 0 ? fraction * goalGci : 0;
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
      date: d.expected_close_date ?? "",
    })),
    recentAnomalies: anomalies,
    hotContacts: (hotContactsResult.data ?? []).map((c) => ({
      name: c.name ?? "Unknown",
      score: Number(c.engagement_score ?? 0),
    })),
  };
}
