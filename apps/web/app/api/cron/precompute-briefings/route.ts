/**
 * Nightly Cron: Pre-compute Morning Briefings
 *
 * Runs daily at 04:00 UTC (staggered ahead of the 05:00 AI knowledge audit
 * so the briefing cache is warm before agents log in). For each active
 * professional-tier user:
 *   1. Gathers CRM metrics (overdue follow-ups, pipeline, GCI, hot contacts)
 *   2. Calls generateMorningBriefing (Haiku — cheap & fast)
 *   3. Upserts result into precomputed_insights with 24h expiry
 *
 * Protected by CRON_SECRET Bearer token.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { generateMorningBriefing } from "@/lib/ai/precompute";
import {
  BRIEFING_USER_COLUMNS,
  briefingDateRanges,
  gatherBriefingMetrics,
  type AnySupabaseClient,
} from "@/lib/ai/briefing-metrics";
import {
  calculateEngagementScore,
  toEngagementActivities,
} from "@/lib/engines/engagement-engine";

export const maxDuration = 300; // 5 minutes for batch processing

const BATCH_SIZE = 5;

// Vercel cron jobs invoke the scheduled path with a GET request, so this
// handler is exported as GET to match its sibling cron routes
// (outreach-detector, calendar-sync, weekly-digest, db-health,
// ai-knowledge-audit). It has no other caller — the only consumer of the
// warmed cache is GET /api/briefing, which reads precomputed_insights.
export async function GET(req: NextRequest) {
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
    .select(BRIEFING_USER_COLUMNS)
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
      .select(BRIEFING_USER_COLUMNS)
      .in("user_id", missingBetaIds)
      .limit(500);
    betaUsers = extraUsers ?? [];
  }

  const users = [...(tierUsers ?? []), ...betaUsers];

  if (users.length === 0) {
    return NextResponse.json({ status: "no_users", processed: 0, errors: 0 });
  }

  const now = new Date();
  const dates = briefingDateRanges(now);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  let processed = 0;
  let errors = 0;

  // ── Process in batches to avoid API rate limits ─────────────────────────
  for (let i = 0; i < users.length; i += BATCH_SIZE) {
    const batch = users.slice(i, i + BATCH_SIZE);

    const _results = await Promise.allSettled(
      batch.map(async (user) => {
        try {
          // Refresh engagement scores FIRST so this run's hot-contacts
          // query (and every other consumer of clients.engagement_score)
          // reads today's values, not yesterday's.
          await updateEngagementScores(supabase, user.user_id, now);

          const data = await gatherBriefingMetrics(supabase, user, dates);

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

// ── Engagement Score Refresh ──────────────────────────────────────────────────
// Migration 00098 added clients.engagement_score ("Updated daily via cron")
// but no cron ever wrote it — hot contacts was silently empty for everyone.
// This pass is that missing cron: run the canonical engagement engine over
// each client's contact_activities and persist score + timestamp.

/** Activities older than this contribute <2% of their weight (longest
 *  half-life is 30d → 180d ≈ 6 half-lives). Bounds the query, not the math. */
const ENGAGEMENT_LOOKBACK_DAYS = 180;
const ENGAGEMENT_UPDATE_CHUNK = 20;

async function updateEngagementScores(
  supabase: AnySupabaseClient,
  userId: string,
  now: Date,
): Promise<void> {
  const lookbackIso = new Date(
    now.getTime() - ENGAGEMENT_LOOKBACK_DAYS * 86_400_000,
  ).toISOString();

  const [clientsResult, activitiesResult] = await Promise.all([
    supabase
      .from("clients")
      .select("id, engagement_score")
      .eq("user_id", userId)
      .limit(10000),
    supabase
      .from("contact_activities")
      .select("client_id, type, activity_date")
      .eq("user_id", userId)
      .gte("activity_date", lookbackIso)
      .limit(10000),
  ]);

  // Fail this user's pass loudly rather than writing zeros over real scores.
  if (clientsResult.error) throw clientsResult.error;
  if (activitiesResult.error) throw activitiesResult.error;

  const byClient = new Map<string, { type: string | null; activity_date: string | null }[]>();
  for (const act of activitiesResult.data ?? []) {
    if (!act.client_id) continue;
    const list = byClient.get(act.client_id) ?? [];
    list.push(act);
    byClient.set(act.client_id, list);
  }

  const nowIso = now.toISOString();
  const updates: { id: string; score: number }[] = [];
  for (const client of clientsResult.data ?? []) {
    const result = calculateEngagementScore(
      toEngagementActivities(byClient.get(client.id) ?? []),
      now,
    );
    // Skip no-op writes (score unchanged — common for dormant clients at 0).
    if (Math.abs(Number(client.engagement_score ?? 0) - result.score) < 0.01) continue;
    updates.push({ id: client.id, score: result.score });
  }

  for (let i = 0; i < updates.length; i += ENGAGEMENT_UPDATE_CHUNK) {
    const chunk = updates.slice(i, i + ENGAGEMENT_UPDATE_CHUNK);
    const results = await Promise.all(
      chunk.map((u) =>
        supabase
          .from("clients")
          .update({ engagement_score: u.score, engagement_updated_at: nowIso })
          .eq("id", u.id)
          .eq("user_id", userId),
      ),
    );
    for (const r of results) {
      if (r.error) {
        console.error(
          `[precompute-briefings] engagement update failed for user ${userId}:`,
          r.error,
        );
      }
    }
  }
}
