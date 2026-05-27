/**
 * GET /api/mobile/briefing
 *
 * Mobile-native Today's Focus briefing endpoint.
 *
 * Calls the canonical `computeIntelligenceBriefing` engine
 * (`packages/core/engines/crm-analytics-engine.ts`) — the same engine the
 * web dashboard and CRM dashboard tab use. Closes audit red flag #3 /
 * parity gap #9: mobile was previously running its own narrower
 * 5-type detection in `apps/mobile/stores/data-store.ts`. Mobile now
 * inherits the full 15-type briefing every time the engine emits a
 * new category.
 *
 * Auth: Bearer token (Supabase access token) — mirrors
 * `/api/mobile/log-activity` and `/api/chat`.
 *
 * Returns: `IntelligenceBriefingResult` from the engine
 * (`{ items, urgentCount, attentionCount, upcomingCount, totalCount }`).
 *
 * Query inputs match the dashboard's per
 * `apps/web/app/(app)/dashboard/page.tsx` (clients ×10000, last-500
 * activities, all client_records, active listing appointments). Same
 * RLS-scoped admin pattern as the log-activity route.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { computeIntelligenceBriefing } from "@/lib/engines/crm-analytics-engine";
import type {
  Client,
  ContactActivity,
  ClientRecord,
  ListingAppointment,
} from "@agent-runway/core/types/database";

export const maxDuration = 15;

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    // ── 1. Authenticate via Bearer token ──────────────────────────────────
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Missing Authorization header" },
        { status: 401 },
      );
    }

    const accessToken = authHeader.slice(7);
    const admin = createAdminClient();

    const { data: { user }, error: authError } =
      await admin.auth.getUser(accessToken);

    if (authError || !user) {
      return NextResponse.json(
        { error: "Invalid or expired token" },
        { status: 401 },
      );
    }

    // ── 2. Rate limit ─────────────────────────────────────────────────────
    // Briefing is a read-only fetch; mobile typically pulls it once per
    // foregrounding + pull-to-refresh, so a generous bucket is fine.
    const rl = await checkRateLimit(user.id, "mobile_briefing", 60, 60);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please wait before trying again." },
        { status: 429, headers: rateLimitHeaders(rl) },
      );
    }

    // ── 3. Fetch engine inputs (RLS-scoped via user_id filter) ─────────────
    // Query shapes match `apps/web/app/(app)/dashboard/page.tsx` so mobile
    // and web see identical briefings for the same user.
    const [clientsResult, activitiesResult, recordsResult, listingsResult] =
      await Promise.all([
        admin
          .from("clients")
          .select("*")
          .eq("user_id", user.id)
          .limit(10000),
        admin
          .from("contact_activities")
          .select("*")
          .eq("user_id", user.id)
          .order("activity_date", { ascending: false })
          .limit(500),
        admin
          .from("client_records")
          .select("*")
          .eq("user_id", user.id)
          .limit(10000),
        admin
          .from("listing_appointments")
          .select("*")
          .eq("user_id", user.id)
          .in("status", ["scheduled", "active"])
          .limit(10000),
      ]);

    if (clientsResult.error || activitiesResult.error || recordsResult.error) {
      console.error("[mobile/briefing] fetch error:", {
        clients: clientsResult.error,
        activities: activitiesResult.error,
        records: recordsResult.error,
      });
      return NextResponse.json(
        { error: "Failed to load briefing inputs" },
        { status: 500 },
      );
    }

    // ── 4. Compute briefing via canonical engine ───────────────────────────
    const result = computeIntelligenceBriefing(
      (clientsResult.data ?? []) as Client[],
      (activitiesResult.data ?? []) as ContactActivity[],
      (recordsResult.data ?? []) as ClientRecord[],
      (listingsResult.data ?? []) as ListingAppointment[],
    );

    // Sort items by severity (urgent → attention → upcoming), then return.
    // The web dashboard does the same sort + slice client-side; mobile
    // mirrors that here so the wire response is render-ready.
    const sevOrder: Record<string, number> = {
      urgent: 0,
      attention: 1,
      upcoming: 2,
    };
    const sortedItems = [...result.items].sort(
      (a, b) => (sevOrder[a.severity] ?? 3) - (sevOrder[b.severity] ?? 3),
    );

    return NextResponse.json({
      items: sortedItems,
      urgentCount: result.urgentCount,
      attentionCount: result.attentionCount,
      upcomingCount: result.upcomingCount,
      totalCount: result.totalCount,
      generated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[mobile/briefing] unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
