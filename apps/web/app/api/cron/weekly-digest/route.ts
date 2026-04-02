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
} from "@/lib/types/database";
import { buildUnsubscribeUrl } from "@/lib/email-tokens";

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

function gradeFromScore(score: number): string {
  if (score >= 93) return "A+";
  if (score >= 85) return "A";
  if (score >= 80) return "A-";
  if (score >= 77) return "B+";
  if (score >= 73) return "B";
  if (score >= 70) return "B-";
  if (score >= 67) return "C+";
  if (score >= 63) return "C";
  if (score >= 60) return "C-";
  if (score >= 55) return "D+";
  if (score >= 50) return "D";
  if (score >= 45) return "D-";
  return "F";
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

  // Find all professional-tier users (active or trialing)
  const { data: proUsers, error: usersErr } = await admin
    .from("user_settings")
    .select("user_id, display_name, goal_gci, province, subscription_tier, subscription_status")
    .in("subscription_tier", ["professional", "team"])
    .in("subscription_status", ["active", "trialing"]);

  if (usersErr || !proUsers?.length) {
    return NextResponse.json({
      sent: 0,
      error: usersErr?.message ?? "No professional subscribers found",
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

      // Check if user has opted out of the weekly digest
      const { data: prefs } = await admin
        .from("notification_preferences")
        .select("weekly_digest_enabled")
        .eq("user_id", user.user_id)
        .maybeSingle();

      // If a row exists and weekly_digest_enabled is explicitly false, skip
      if (prefs && prefs.weekly_digest_enabled === false) continue;

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
      const pipelineValue = pipeline.reduce(
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

      // Simple pace vs goal calculation
      const goalGCI = user.goal_gci ?? 0;
      // Use month-based fraction (simple) since we don't have seasonality weights server-side
      const monthFraction = (now.getMonth() + now.getDate() / 30) / 12;
      const expectedGCI = goalGCI * monthFraction;
      const paceVsGoalPct =
        expectedGCI > 0 ? Math.round((ytdGCI / expectedGCI) * 100) : 0;

      // Simple runway score estimate (goal pace weighted heavily)
      const paceScore = Math.min(100, paceVsGoalPct);
      const pipelineScore =
        goalGCI > 0
          ? Math.min(100, Math.round((pipelineValue / (goalGCI * 0.3)) * 100))
          : 50;
      const runwayScore = Math.round(paceScore * 0.5 + pipelineScore * 0.3 + 60 * 0.2);

      // Build digest data
      const digestData: WeeklyDigestData = {
        firstName: user.display_name?.split(" ")[0] ?? null,
        weekLabel: weekLabel(),
        ytdGCI,
        goalGCI,
        paceVsGoalPct,
        dealsClosedThisWeek: recentDeals.length,
        ytdDealsClosed: transactions.length,
        pipelineValue,
        pipelineCount: pipeline.length,
        outreachReady: outreachReady ?? 0,
        upcomingTaskCount: upcomingTaskCount ?? 0,
        monthlyExpenses,
        runwayGrade: gradeFromScore(runwayScore),
        runwayScore,
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
