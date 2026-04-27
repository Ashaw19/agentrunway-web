/**
 * GET /api/recruit?token=xxx — Fetch recruitment page data (public)
 * POST /api/recruit — Submit an application (public)
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkPublicRateLimit, ipKey, rateLimitHeaders } from "@/lib/rate-limit";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: page, error } = await admin
    .from("recruitment_pages")
    .select("*, organizations(name, type)")
    .eq("token", token)
    .eq("is_active", true)
    .single();

  if (error || !page) {
    return NextResponse.json(
      { error: "Recruitment page not found" },
      { status: 404 }
    );
  }

  // Increment view count (cosmetic counter — minor race on concurrent GETs is acceptable)
  await admin
    .from("recruitment_pages")
    .update({
      view_count: (page.view_count ?? 0) + 1,
      last_viewed_at: new Date().toISOString(),
    })
    .eq("id", page.id);

  // Get team stats if enabled
  let teamStats = null;
  if (page.show_team_stats) {
    const { count: memberCount } = await admin
      .from("organization_members")
      .select("id", { count: "exact", head: true })
      .eq("org_id", page.org_id);

    teamStats = {
      memberCount: memberCount ?? 0,
    };
  }

  return NextResponse.json({
    headline: page.headline,
    description: page.description,
    teamPhotoUrl: page.team_photo_url,
    showTeamStats: page.show_team_stats,
    showValueProps: page.show_value_props,
    customValues: page.custom_values ?? [],
    orgName: page.organizations?.name ?? "Our Team",
    teamStats,
    requireResume: page.require_resume,
  });
}

export async function POST(req: NextRequest) {
  try {
    // Rate-limit by IP — use public_rate_limits because /api/recruit is an
    // unauthenticated endpoint (auth-keyed rate_limits has a UUID FK that
    // rejects IP strings, silently failing open).
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const rl = await checkPublicRateLimit(await ipKey(ip), "recruit_apply", 5, 60);
    if (!rl.allowed) {
      return new Response("Too many requests. Please wait before sending more messages.", {
        status: 429,
        headers: rateLimitHeaders(rl),
      });
    }

    const body = await req.json();
    const {
      token,
      applicant_name,
      applicant_email,
      applicant_phone,
      years_experience,
      current_brokerage,
      message,
    } = body as {
      token: string;
      applicant_name: string;
      applicant_email: string;
      applicant_phone?: string;
      years_experience?: number;
      current_brokerage?: string;
      message?: string;
    };

    if (!token || !applicant_name?.trim() || !applicant_email?.trim()) {
      return NextResponse.json(
        { error: "Name and email are required" },
        { status: 400 }
      );
    }

    // Basic email format check
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(applicant_email.trim())) {
      return NextResponse.json(
        { error: "A valid email address is required" },
        { status: 400 }
      );
    }

    if (applicant_name.length > 255 || applicant_email.length > 320 ||
        (applicant_phone && applicant_phone.length > 30) ||
        (current_brokerage && current_brokerage.length > 255) ||
        (message && message.length > 5000)) {
      return NextResponse.json(
        { error: "One or more fields exceed maximum length" },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    // Validate token
    const { data: page } = await admin
      .from("recruitment_pages")
      .select("id")
      .eq("token", token)
      .eq("is_active", true)
      .single();

    if (!page) {
      return NextResponse.json(
        { error: "Invalid recruitment page" },
        { status: 404 }
      );
    }

    // Insert application
    const { error: insertErr } = await admin
      .from("recruitment_applications")
      .insert({
        recruitment_page_id: page.id,
        applicant_name: applicant_name.trim(),
        applicant_email: applicant_email.trim(),
        applicant_phone: applicant_phone?.trim() ?? "",
        years_experience: years_experience ?? 0,
        current_brokerage: current_brokerage?.trim() ?? "",
        message: message?.trim() ?? "",
      });

    if (insertErr) {
      console.error("[recruit] Insert error:", insertErr);
      return NextResponse.json(
        { error: "Failed to submit application" },
        { status: 500 }
      );
    }

    // Increment application count (atomic via RPC-style count query)
    const { count: appCount } = await admin
      .from("recruitment_applications")
      .select("id", { count: "exact", head: true })
      .eq("recruitment_page_id", page.id);

    await admin
      .from("recruitment_pages")
      .update({ application_count: appCount ?? 0 })
      .eq("id", page.id);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Invalid request" },
      { status: 400 }
    );
  }
}
