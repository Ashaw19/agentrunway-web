/**
 * POST /api/ai/team-insights
 *
 * Returns a brief AI-generated insight for a team report card.
 * Uses Haiku 4.5 (models.fast) for quick, cheap generation.
 */

import { generateText } from "ai";
import { models, heliconeHeaders } from "@/lib/ai/provider";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";

const SYSTEM_PROMPT =
  "You are part of the Flight Crew for a Canadian real estate brokerage. Given the team report data below, provide a brief 2-3 sentence insight highlighting the most actionable finding. Be specific with numbers. Focus on what the team leader should do next.";

export async function POST(req: NextRequest) {
  // Auth guard
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  // Verify org admin/owner/team_leader
  let body: { org_id: string; report_type: string; report_data: object };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const { org_id, report_type, report_data } = body;

  if (!org_id || !report_type || !report_data) {
    return NextResponse.json(
      { error: "Missing required fields: org_id, report_type, report_data" },
      { status: 400 },
    );
  }

  const { data: membership } = await supabase
    .from("organization_members")
    .select("role, status")
    .eq("org_id", org_id)
    .eq("user_id", user.id)
    .eq("status", "active")
    .single();

  if (
    !membership ||
    !["owner", "admin", "team_leader"].includes(membership.role)
  ) {
    return NextResponse.json(
      { error: "Forbidden: requires org admin, owner, or team leader role" },
      { status: 403 },
    );
  }

  // Rate limit: 30 insight requests per hour per user
  const rl = await checkRateLimit(user.id, "team_insights", 30, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit reached. Try again later." },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  // If no AI key, return a graceful fallback
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { insight: "AI insights are temporarily unavailable. Review the report data above to identify key trends." },
      { headers: rateLimitHeaders(rl) },
    );
  }

  try {
    const { text: insight } = await generateText({
      model: models.fast,
      system: SYSTEM_PROMPT,
      prompt: `Report type: ${report_type}\n\nReport data:\n${JSON.stringify(report_data, null, 2)}`,
      maxOutputTokens: 200,
      temperature: 0.4,
      headers: heliconeHeaders({
        userId: user.id,
        feature: "team-insights",
      }),
    });

    if (!insight) throw new Error("Empty response");

    return NextResponse.json(
      { insight },
      { headers: rateLimitHeaders(rl) },
    );
  } catch (err) {
    console.error("[team-insights] AI error:", err);
    return NextResponse.json(
      { insight: "Unable to generate insight at this time. Please review the report data directly." },
      { headers: rateLimitHeaders(rl) },
    );
  }
}
