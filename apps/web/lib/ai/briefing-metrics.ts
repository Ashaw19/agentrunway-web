/**
 * Canonical morning-briefing metric gathering.
 *
 * ONE implementation, two callers:
 *   - `app/api/cron/precompute-briefings/route.ts` (nightly, service role)
 *   - `app/api/briefing/route.ts`                  (on-demand, session/RLS)
 *
 * These used to be two hand-written copies. The on-demand copy drifted and
 * queried FIVE columns that do not exist (`user_settings.gci_goal`,
 * `pipeline_deals.projected_gci`, `pipeline_deals.status`,
 * `transactions.gci`, `pipeline_deals.projected_close_date`). supabase-js
 * RESOLVES `{data: null, error}` rather than rejecting, the caller never read
 * `error`, and `?? []` coerced every failure to empty — so the AI was handed
 * all zeros and confidently told the agent they had $0 pipeline and $0 GCI.
 *
 * Keeping a single implementation is the fix. Do not re-derive these metrics
 * anywhere else — import from here, or from the engines it calls.
 * See `memory/feedback_data_consistency_protocol.md`.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { BriefingData } from "@/lib/ai/precompute";
import {
  ACTIVE_PIPELINE_STAGES,
  computeGCI,
  computeWeightedGCI,
  type PipelineDeal,
} from "@/lib/types/database";
import { seasonalFractionElapsed } from "@/lib/engines/projection-engine";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnySupabaseClient = SupabaseClient<any, any, any>;

/** The `user_settings` columns the briefing needs. Verified against schema. */
export const BRIEFING_USER_COLUMNS =
  "user_id, display_name, goal_gci, subscription_tier, use_national_seasonality, national_quarter_pcts";

export interface BriefingUser {
  user_id: string;
  display_name: string | null;
  goal_gci: number | null;
  subscription_tier: string;
  use_national_seasonality: boolean | null;
  national_quarter_pcts: number[] | null;
}

export interface BriefingDateRanges {
  todayStr: string;
  yearStart: string;
  fourteenDaysAgo: string;
  fourteenDaysAhead: string;
}

/** Derive the date windows the briefing queries use. */
export function briefingDateRanges(now: Date = new Date()): BriefingDateRanges {
  return {
    todayStr: now.toISOString().slice(0, 10),
    yearStart: `${now.getFullYear()}-01-01`,
    fourteenDaysAgo: new Date(now.getTime() - 14 * 86_400_000)
      .toISOString()
      .slice(0, 10),
    fourteenDaysAhead: new Date(now.getTime() + 14 * 86_400_000)
      .toISOString()
      .slice(0, 10),
  };
}

/**
 * Fetch the settings row the briefing needs for `userId`.
 *
 * Throws on query error rather than returning a zeroed user — a briefing built
 * from a failed settings read is worse than no briefing, because the agent
 * cannot tell the difference.
 */
export async function fetchBriefingUser(
  supabase: AnySupabaseClient,
  userId: string,
): Promise<BriefingUser> {
  const { data, error } = await supabase
    .from("user_settings")
    .select(BRIEFING_USER_COLUMNS)
    .eq("user_id", userId)
    .single();

  if (error) throw error;
  if (!data) throw new Error(`No user_settings row for user ${userId}`);

  return data as unknown as BriefingUser;
}

/**
 * Gather every metric the morning briefing renders.
 *
 * All money is computed by the canonical engines (`computeGCI`,
 * `computeWeightedGCI`), never re-derived here. Pace uses the dashboard's
 * seasonal-weight cascade, not a flat day-of-year fraction.
 *
 * Every query's `error` is checked. A partial briefing built on a silently
 * failed query is the exact bug this module exists to prevent.
 */
export async function gatherBriefingMetrics(
  supabase: AnySupabaseClient,
  user: BriefingUser,
  dates: BriefingDateRanges,
): Promise<BriefingData> {
  const uid = user.user_id;

  const [
    overdueResult,
    pipelineResult,
    transactionsResult,
    upcomingClosesResult,
    hotContactsResult,
    historyResult,
  ] = await Promise.all([
    // Overdue follow-ups: active clients not contacted in 14+ days.
    // Archiving writes only `clients.archived_at` — it never changes `status`,
    // so an archived client stays in this count forever unless excluded here.
    supabase
      .from("clients")
      .select("id", { count: "exact", head: true })
      .eq("user_id", uid)
      .is("archived_at", null)
      .in("status", ["boarding", "in_flight"])
      .lt("last_contact_at", dates.fourteenDaysAgo),

    // Active pipeline only — a `closed` deal is already counted in GCI YTD via
    // `transactions`, and a `lost` deal is dead (#258).
    supabase
      .from("pipeline_deals")
      .select("estimated_price, estimated_commission_pct, probability_override, stage")
      .eq("user_id", uid)
      .in("stage", ACTIVE_PIPELINE_STAGES as unknown as string[]),

    // YTD closed transactions — columns feed canonical computeGCI.
    supabase
      .from("transactions")
      .select("sale_price, commission_pct, team_split_pct, gci_override")
      .eq("user_id", uid)
      .eq("status", "closed")
      .gte("date", dates.yearStart),

    supabase
      .from("pipeline_deals")
      .select("address, expected_close_date")
      .eq("user_id", uid)
      .eq("stage", "firm")
      .gte("expected_close_date", dates.todayStr)
      .lte("expected_close_date", dates.fourteenDaysAhead)
      .order("expected_close_date", { ascending: true })
      .limit(5),

    supabase
      .from("clients")
      .select("name, engagement_score")
      .eq("user_id", uid)
      .gt("engagement_score", 0)
      .order("engagement_score", { ascending: false })
      .limit(5),

    // Annual history for agent-specific seasonal weights.
    supabase.from("history_items").select("year, quarter_gci").eq("user_id", uid),
  ]);

  // Fail loudly. supabase-js resolves rather than rejects on a query error, so
  // without these the briefing silently reports zeros as if they were real.
  if (overdueResult.error) throw overdueResult.error;
  if (pipelineResult.error) throw pipelineResult.error;
  if (transactionsResult.error) throw transactionsResult.error;
  if (upcomingClosesResult.error) throw upcomingClosesResult.error;
  if (hotContactsResult.error) throw hotContactsResult.error;
  if (historyResult.error) throw historyResult.error;

  // ── Agent-specific seasonal weights (same cascade as the dashboard) ──
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
  const pacePercent =
    expectedPace > 0 ? Math.round((ytdGci / expectedPace) * 100) : 0;

  const overdueCount = overdueResult.count ?? 0;
  const anomalies: string[] = [];
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
    upcomingCloses: (upcomingClosesResult.data ?? []).map(
      (d: Record<string, unknown>) => ({
        address: (d.address as string | null) ?? "TBD",
        date: (d.expected_close_date as string | null) ?? "",
      }),
    ),
    recentAnomalies: anomalies,
    hotContacts: (hotContactsResult.data ?? []).map(
      (c: Record<string, unknown>) => ({
        name: (c.name as string | null) ?? "Unknown",
        score: Number(c.engagement_score ?? 0),
      }),
    ),
  };
}
