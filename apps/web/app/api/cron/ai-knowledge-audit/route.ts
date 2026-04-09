/**
 * Daily AI Knowledge Audit Cron
 *
 * Runs daily at 05:00 UTC. Analyzes chat analytics from the past 24 hours to:
 * 1. Identify topics where users aren't getting good answers (high follow-up count)
 * 2. Find questions that don't match any topic (classifier gaps)
 * 3. Track which topics are most frequently asked (trending)
 * 4. Flag topics where diagnostics weren't available (data gaps)
 *
 * Results are stored in ai_knowledge_audit_log for the daily scheduled task
 * (Claude Code) to read and act on.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 30;

export async function GET(req: NextRequest) {
  // ── Auth guard ──────────────────────────────────────────────────────────
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Use service role to read all analytics
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // ── Fetch last 24 hours of chat analytics ───────────────────────────────
  const { data: analytics, error } = await supabase
    .from("chat_analytics")
    .select("primary_topic, secondary_topic, classifier_score, had_diagnostics, had_playbook, follow_up_count, session_message_count, message_preview, current_page")
    .gte("created_at", since)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[ai-knowledge-audit] Failed to fetch analytics:", error);
    return NextResponse.json({ error: "Failed to fetch analytics" }, { status: 500 });
  }

  if (!analytics || analytics.length === 0) {
    return NextResponse.json({
      status: "no_data",
      message: "No chat interactions in the last 24 hours",
      audit: null,
    });
  }

  // ── Compute audit metrics ───────────────────────────────────────────────

  // 1. Topic frequency
  const topicCounts: Record<string, number> = {};
  for (const a of analytics) {
    topicCounts[a.primary_topic] = (topicCounts[a.primary_topic] ?? 0) + 1;
  }
  const trendingTopics = Object.entries(topicCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  // 2. Unresolved questions (3+ follow-ups on same topic)
  const unresolvedQuestions = analytics
    .filter((a) => a.follow_up_count >= 3)
    .map((a) => ({
      topic: a.primary_topic,
      preview: a.message_preview,
      followUps: a.follow_up_count,
      hadPlaybook: a.had_playbook,
      hadDiagnostics: a.had_diagnostics,
      page: a.current_page,
    }));

  // 3. Classifier gaps (matched "general" with low score or score = 0)
  const classifierGaps = analytics
    .filter((a) => a.primary_topic === "general" && a.classifier_score < 3)
    .map((a) => ({
      preview: a.message_preview,
      score: a.classifier_score,
      page: a.current_page,
    }));

  // 4. Missing diagnostics (playbook fired but no diagnostic data)
  const missingDiagnostics = analytics
    .filter((a) => a.had_playbook && !a.had_diagnostics)
    .map((a) => ({
      topic: a.primary_topic,
      preview: a.message_preview,
    }));

  // 5. Per-topic resolution quality
  const topicQuality: Record<string, { total: number; unresolved: number; noDiagnostics: number }> = {};
  for (const a of analytics) {
    if (!topicQuality[a.primary_topic]) {
      topicQuality[a.primary_topic] = { total: 0, unresolved: 0, noDiagnostics: 0 };
    }
    topicQuality[a.primary_topic].total++;
    if (a.follow_up_count >= 3) topicQuality[a.primary_topic].unresolved++;
    if (!a.had_diagnostics && a.primary_topic !== "general") topicQuality[a.primary_topic].noDiagnostics++;
  }

  const audit = {
    period: { since, until: new Date().toISOString() },
    totalInteractions: analytics.length,
    uniqueTopics: Object.keys(topicCounts).length,
    trendingTopics,
    unresolvedQuestions: unresolvedQuestions.slice(0, 20),
    classifierGaps: classifierGaps.slice(0, 20),
    missingDiagnostics: missingDiagnostics.slice(0, 10),
    topicQuality,
    // Summary scores
    overallResolutionRate: analytics.length > 0
      ? ((analytics.length - unresolvedQuestions.length) / analytics.length * 100).toFixed(1) + "%"
      : "N/A",
    classifierCoverageRate: analytics.length > 0
      ? ((analytics.length - classifierGaps.length) / analytics.length * 100).toFixed(1) + "%"
      : "N/A",
    diagnosticCoverageRate: analytics.filter((a) => a.primary_topic !== "general").length > 0
      ? ((analytics.filter((a) => a.had_diagnostics).length) / analytics.filter((a) => a.primary_topic !== "general").length * 100).toFixed(1) + "%"
      : "N/A",
  };

  // ── Store audit results ─────────────────────────────────────────────────
  try {
    const { error } = await supabase.from("ai_knowledge_audit_log").insert({
      audit_date: new Date().toISOString().slice(0, 10),
      total_interactions: audit.totalInteractions,
      resolution_rate: parseFloat(audit.overallResolutionRate) || 0,
      classifier_coverage: parseFloat(audit.classifierCoverageRate) || 0,
      diagnostic_coverage: parseFloat(audit.diagnosticCoverageRate) || 0,
      trending_topics: audit.trendingTopics,
      unresolved_previews: audit.unresolvedQuestions.map((q) => q.preview).slice(0, 10),
      classifier_gaps: audit.classifierGaps.map((g) => g.preview).slice(0, 10),
      topic_quality: audit.topicQuality,
    });
    if (error) {
      console.error("[ai-knowledge-audit] Failed to store audit:", error);
    }
  } catch (err) {
    console.error("[ai-knowledge-audit] Failed to store audit:", err);
  }

  return NextResponse.json({ status: "ok", audit });
}
