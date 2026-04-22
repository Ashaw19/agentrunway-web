/**
 * GET /api/cron/weekly-digest
 *
 * Vercel Cron — runs every Monday at 12:00 UTC (8 AM ET).
 * Sends a weekly business digest email to Professional-tier subscribers via Resend.
 *
 * Schedule: "0 12 * * 1" (see vercel.json)
 * Protected by CRON_SECRET Bearer token.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resend, FROM_ADDRESS } from "@/lib/resend";
import { weeklyDigestEmail, type WeeklyDigestData } from "@/lib/emails/weekly-digest";
import {
  computeGCI,
  computeWeightedGCI,
  type Transaction,
  type PipelineDeal,
  type UserSettings,
} from "@/lib/types/database";
import { buildUnsubscribeUrl } from "@/lib/email-tokens";
import { seasonalFractionElapsed, paceVsGoalPercent, projectedYearEndGCI } from "@agent-runway/core/engines/projection-engine";
import { buildHealthReport } from "@agent-runway/core/engines/health-report";
import { compute as computeRunwayScore } from "@agent-runway/core/engines/runway-score-engine";
import { compare as benchmarkCompare } from "@agent-runway/core/engines/benchmark-engine";
import { survivalResult } from "@agent-runway/core/engines/survival-engine";
import { computeEffectiveCashForSurvival, computePipelineMonthlyIncome } from "@agent-runway/core/engines/effective-cash";
import { projectedYearEndTransactions } from "@agent-runway/core/engines/projection-engine";
import { totalRecurringYTD } from "@agent-runway/core/engines/recurring-expense-engine";
import type { RecurringExpense } from "@/lib/types/database";
import { generateText } from "ai";
import { models } from "@/lib/ai/provider";

export const maxDuration = 300; // 5 minutes max

// ── Auth ─────────────────────────────────────────────────────────────────────

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function weekLabel(): string {
  const now = new Date();
  const end = new Date(now);
  end.setDate(end.getDate() - 1); // Yesterday (Sunday)
  const start = new Date(end);
  start.setDate(start.getDate() - 6); // Last Monday

  const fmt = (d: Date) =>
    d.toLocaleDateString("en-CA", { month: "short", day: "numeric" });
  return `${fmt(start)} – ${fmt(end)}, ${end.getFullYear()}`;
}

// ── Main ─────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!resend) {
    return NextResponse.json(
      { error: "Resend not configured" },
      { status: 503 }
    );
  }

  const admin = createAdminClient();
  const year = new Date().getFullYear();
  const now = new Date();
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const sevenDaysAgoISO = sevenDaysAgo.toISOString().slice(0, 10);
  const monthStart = `${year}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

  // Find all professional-tier users (active or trialing).
  // Select * so we have every field computeEffectiveCashForSurvival needs
  // (split_preset, tx fee config, HST flags, is_incorporated, compensation_method, etc.)
  // — required for Survival/Runway Score parity with dashboard + chat.
  const userSelectCols = "*";

  const { data: tierUsers, error: usersErr } = await admin
    .from("user_settings")
    .select(userSelectCols)
    .in("subscription_tier", ["professional", "team"])
    .in("subscription_status", ["active", "trialing"]);

  if (usersErr) {
    return NextResponse.json({
      sent: 0,
      error: usersErr.message,
    });
  }

  // Also include members of beta orgs (is_beta = true) or orgs with active subscriptions
  const { data: betaOrgMembers } = await admin
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
    const { data: extraUsers } = await admin
      .from("user_settings")
      .select(userSelectCols)
      .in("user_id", missingBetaIds);
    betaUsers = extraUsers ?? [];
  }

  const proUsers = [...(tierUsers ?? []), ...betaUsers];

  if (!proUsers.length) {
    return NextResponse.json({
      sent: 0,
      error: "No professional subscribers found",
    });
  }

  let sent = 0;
  let errors = 0;

  for (const user of proUsers) {
    try {
      // Get user email from auth
      const { data: authUser } = await admin.auth.admin.getUserById(user.user_id);
      const email = authUser?.user?.email;
      if (!email) continue;

      // Check if user has explicitly opted IN to the weekly digest.
      // CASL compliance: never send unless user has given express consent.
      const { data: prefs } = await admin
        .from("notification_preferences")
        .select("weekly_digest_enabled")
        .eq("user_id", user.user_id)
        .maybeSingle();

      // Only send if user has explicitly opted in (row exists AND enabled)
      if (!prefs || prefs.weekly_digest_enabled !== true) continue;

      // Fetch closed transactions for this year
      const { data: txRows } = await admin
        .from("transactions")
        .select("date, sale_price, commission_pct, team_split_pct, gci_override, status")
        .eq("user_id", user.user_id)
        .eq("status", "closed")
        .gte("date", `${year}-01-01`)
        .order("date", { ascending: false })
        .limit(1000);

      const transactions = (txRows ?? []) as Transaction[];

      // Deals closed in last 7 days
      const recentDeals = transactions.filter(
        (tx) => tx.date >= sevenDaysAgoISO
      );

      // YTD GCI (using the same computeGCI helper the dashboard uses)
      const ytdGCI = transactions.reduce(
        (sum, tx) => sum + computeGCI(tx),
        0
      );

      // Pipeline deals
      const { data: pipelineRows } = await admin
        .from("pipeline_deals")
        .select("estimated_price, estimated_commission_pct, probability_override, stage")
        .eq("user_id", user.user_id)
        .limit(1000);

      const pipeline = (pipelineRows ?? []) as PipelineDeal[];
      const pipelineWeightedGCI = pipeline.reduce(
        (sum, d) => sum + computeWeightedGCI(d),
        0
      );

      // Outreach ready count
      const { count: outreachReady } = await admin
        .from("outreach_queue")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.user_id)
        .in("status", ["ready", "draft"]);

      // Upcoming tasks due in next 7 days
      const nextWeek = new Date(now);
      nextWeek.setDate(nextWeek.getDate() + 7);
      const { count: upcomingTaskCount } = await admin
        .from("contact_tasks")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.user_id)
        .is("completed_at", null)
        .lte("due_date", nextWeek.toISOString().slice(0, 10));

      // Monthly expenses (receipt_expenses for current month)
      const { data: monthlyReceipts } = await admin
        .from("receipt_expenses")
        .select("total_amount")
        .eq("user_id", user.user_id)
        .gte("expense_date", monthStart);

      const monthlyExpenses = (monthlyReceipts ?? []).reduce(
        (sum, r) => sum + Number(r.total_amount ?? 0),
        0
      );

      // ── Seasonal weights (agent-specific > national > flat) ──────────
      // Fetch annual history for agent-specific quarter_gci weights
      const { data: historyRows } = await admin
        .from("history_items")
        .select("year, quarter_gci")
        .eq("user_id", user.user_id)
        .order("year", { ascending: false })
        .limit(100);

      const historyItems = historyRows ?? [];

      // Compute agent-specific seasonal weights (same logic as dashboard)
      const agentSeasonalWeights = (() => {
        const withData = historyItems.filter((h: { quarter_gci: number[] }) =>
          (h.quarter_gci as number[]).some((v) => (v ?? 0) > 0),
        );
        if (withData.length < 2) return null;
        const avgQ = [0, 1, 2, 3].map((q) =>
          withData.reduce((sum: number, h: { quarter_gci: number[] }) =>
            sum + ((h.quarter_gci as number[])[q] ?? 0), 0,
          ) / withData.length,
        );
        const total = avgQ.reduce((a, b) => a + b, 0);
        return total > 0 ? avgQ.map((v) => v / total) : null;
      })();

      const seasonalWeights: number[] =
        agentSeasonalWeights ??
        (user.use_national_seasonality
          ? ((user.national_quarter_pcts as number[] | null) ?? [0.25, 0.25, 0.25, 0.25])
          : [0.25, 0.25, 0.25, 0.25]);

      // ── Canonical pace, score, and grade ─────────────────────────────
      const goalGCI = user.goal_gci ?? 0;
      const fraction = seasonalFractionElapsed(seasonalWeights);
      const paceVsGoalPct =
        goalGCI > 0 && fraction > 0
          ? Math.round(paceVsGoalPercent(goalGCI, ytdGCI, fraction) + 100)
          : 0;

      // YTD expenses for health report: receipt total + recurring estimate
      const { data: expenseCatRows } = await admin
        .from("expense_categories")
        .select("name, expense_items(ytd_amount, monthly_recurring)")
        .eq("user_id", user.user_id);

      const monthlyRecurring = (expenseCatRows ?? []).reduce(
        (sum: number, cat: { expense_items?: { monthly_recurring?: number | string }[] }) =>
          sum + (cat.expense_items ?? []).reduce(
            (s: number, i: { monthly_recurring?: number | string }) => s + Number(i.monthly_recurring ?? 0), 0,
          ),
        0,
      );
      const receiptYTDQuery = await admin
        .from("receipt_expenses")
        .select("total_amount")
        .eq("user_id", user.user_id)
        .gte("expense_date", `${year}-01-01`);
      const receiptYTD = (receiptYTDQuery.data ?? []).reduce(
        (sum: number, r: { total_amount?: number | string }) => sum + Number(r.total_amount ?? 0), 0,
      );
      const expMonthsElapsed = now.getMonth() + (now.getDate() / 30);
      const recurringYTDEstimate = monthlyRecurring * expMonthsElapsed;
      // Also include new recurring_expenses table (matches dashboard canonical formula)
      const { data: recurringExpRows } = await admin
        .from("recurring_expenses")
        .select("*")
        .eq("user_id", user.user_id)
        .eq("is_active", true);
      const recurringExpYTD = totalRecurringYTD((recurringExpRows ?? []) as RecurringExpense[]);
      const expensesYTD = Math.max(receiptYTD, recurringYTDEstimate) + recurringExpYTD;

      // Health report (canonical 3 sub-scores: pace, pipeline, expenses)
      const healthReport = buildHealthReport(
        ytdGCI, goalGCI, fraction, pipelineWeightedGCI, expensesYTD,
      );

      // Benchmark percentile
      const projectedGCI = projectedYearEndGCI(ytdGCI, pipelineWeightedGCI, fraction, goalGCI);
      const benchmark = benchmarkCompare(projectedGCI, user.experience_years ?? null);

      // Survival months — cash input MUST be cashPosition.effectiveCash (not
      // raw cash_reserve) to match dashboard + chat. The weekly digest emails
      // the Runway Score to every professional subscriber, so a wrong number
      // here is the loudest possible version of the 2026-04-17 incident.
      // See memory/feedback_data_consistency_protocol.md.
      // Pipeline monthly income via canonical helper (D-1, Audit 1 2026-04-22).
      const pipelineMonthlyEst = computePipelineMonthlyIncome(pipelineWeightedGCI, fraction);
      const projectedDealCount = projectedYearEndTransactions(
        transactions.length, pipeline.length, fraction,
      );
      const { cashPosition: digestCashPosition } = computeEffectiveCashForSurvival({
        settings: user as UserSettings,
        ytdGCI,
        expensesYTD,
        monthlyRecurring,
        projectedGCI,
        projectedDealCount,
        fraction,
        now,
      });
      const survival = survivalResult(
        user.monthly_brokerage_fee ?? 0,
        monthlyRecurring,
        digestCashPosition.effectiveCash,
        pipelineMonthlyEst,
      );

      // Canonical 5-component Runway Score (35% pace + 30% pipeline + 15% expenses + 5% benchmark + 15% survival)
      const runwayResult = computeRunwayScore(
        healthReport,
        benchmark.percentile,
        survival.months,
      );

      // ── AI Insight — 2-sentence data-backed observation for this agent ──
      let aiInsight: string | undefined;
      try {
        const firstName = user.display_name?.split(" ")[0] ?? "there";
        const paceStatus = paceVsGoalPct >= 100 ? "ahead of pace" : paceVsGoalPct >= 85 ? "on pace" : "behind pace";
        const { text } = await generateText({
          model: models.fast,
          system: `You are a concise business coach for a Canadian real estate agent. Write exactly 2 sentences. Be specific with numbers. No fluff. No greetings. No sign-off. Use Canadian spelling.`,
          prompt: `Generate a 2-sentence personalized business insight for ${firstName} based on their weekly data:
- Runway Score: ${runwayResult.score}/100 — ${runwayResult.stateLabel}
- YTD GCI: $${Math.round(ytdGCI).toLocaleString()} of $${Math.round(goalGCI).toLocaleString()} goal (${paceStatus})
- Pipeline: ${pipeline.length} active deals worth $${Math.round(pipelineWeightedGCI).toLocaleString()} weighted
- Deals closed this week: ${recentDeals.length}
- Outreach items ready: ${outreachReady ?? 0}
- Tasks due this week: ${upcomingTaskCount ?? 0}

Focus on the most actionable observation — what should they prioritize or watch closely this week? Be direct.`,
        });
        aiInsight = text.trim();
      } catch {
        // Non-critical — digest sends without insight if generation fails
      }

      // Build digest data
      const digestData: WeeklyDigestData = {
        firstName: user.display_name?.split(" ")[0] ?? null,
        weekLabel: weekLabel(),
        ytdGCI,
        goalGCI,
        paceVsGoalPct,
        dealsClosedThisWeek: recentDeals.length,
        ytdDealsClosed: transactions.length,
        pipelineValue: pipelineWeightedGCI,
        pipelineCount: pipeline.length,
        outreachReady: outreachReady ?? 0,
        upcomingTaskCount: upcomingTaskCount ?? 0,
        monthlyExpenses,
        runwayGrade: runwayResult.grade,
        runwayStateLabel: runwayResult.stateLabel,
        runwayScore: runwayResult.score,
        aiInsight,
        dashboardUrl: "https://agentrunway.ca/dashboard",
        unsubscribeUrl: buildUnsubscribeUrl(user.user_id, "weekly-digest"),
      };

      const { subject, html, text, unsubscribeUrl } = weeklyDigestEmail(digestData);

      await resend.emails.send({
        from: FROM_ADDRESS,
        to: email,
        subject,
        html,
        text,
        headers: {
          ...(unsubscribeUrl
            ? {
                "List-Unsubscribe": `<${unsubscribeUrl}>`,
                "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
              }
            : {}),
        },
      });

      sent++;
    } catch (e) {
      errors++;
      console.error(`[weekly-digest] Error for user ${user.user_id}:`, e);
    }
  }

  return NextResponse.json({
    sent,
    errors,
    totalProUsers: proUsers.length,
  });
}
