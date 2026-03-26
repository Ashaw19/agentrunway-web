// ============================================================================
// Agent Runway — Sandbox Mode API
// POST /api/sandbox
// Actions: activate | toggle | expire
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateSandboxData } from "@/lib/sandbox-data";
import { CREA_BOARDS, fetchBoardData } from "@/lib/crea-board";
import type { SandboxTier } from "@/lib/types/database";

const VALID_TIERS: SandboxTier[] = ["building", "established", "high_producer"];
const SANDBOX_DURATION_DAYS = 90;

export async function POST(request: NextRequest) {
  // Auth check via session client
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // All writes go through admin client — bypasses RLS sandbox guard policies
  // (which block ALL writes from authenticated users when sandbox is active)
  const admin = createAdminClient();

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const action = body.action as string;

  // ── ACTIVATE ────────────────────────────────────────────────────────────
  // First-time activation: user selects a tier, we generate the full dataset.
  if (action === "activate") {
    const tier = body.tier as SandboxTier;
    if (!tier || !VALID_TIERS.includes(tier)) {
      return NextResponse.json(
        { error: "Invalid tier. Must be: building, established, or high_producer" },
        { status: 400 },
      );
    }

    // Load user settings to get their board + province
    const { data: settings, error: settingsErr } = await supabase
      .from("user_settings")
      .select("board_code, board_subregion, province, display_name, market_board_name")
      .eq("user_id", user.id)
      .single();

    if (settingsErr || !settings) {
      return NextResponse.json({ error: "User settings not found" }, { status: 404 });
    }

    const boardCode = settings.board_code as string;
    const province = settings.province as string;
    const displayName = settings.display_name as string;
    const boardName = (settings.market_board_name as string) || boardCode;

    // Fetch live CREA board data for realistic generation
    const board = CREA_BOARDS.find((b) => b.slug === boardCode);
    let boardStats = null;
    if (board) {
      try {
        boardStats = await fetchBoardData(board);
      } catch {
        // Board data fetch failed — we'll use fallbacks in the generator
      }
    }

    // If no board data available (no board set, or fetch failed), use a reasonable default
    if (!boardStats) {
      boardStats = {
        boardSlug: boardCode || "default",
        boardName: boardName || "Canada",
        reportMonth: new Date().toISOString().slice(0, 7),
        subRegions: [],
        boardTotal: {
          name: "Board Total",
          sales: 1200,       // reasonable monthly sales
          newListings: 2000,
          dollarVolume: 600000000,
          averagePrice: 500000,
        },
        salesToNewListingsRatio: 0.6,
        marketCondition: "balanced" as const,
        marketConditionLabel: "Balanced Market",
        cachedAt: new Date().toISOString(),
      };
    }

    // Generate the full sandbox dataset
    const sandboxData = generateSandboxData(
      boardCode || "default",
      boardName || "Canada",
      province || "ontario",
      displayName || "Agent",
      tier,
      boardStats,
    );

    // Calculate expiry (90 days from now)
    const now = new Date();
    const expiresAt = new Date(now.getTime() + SANDBOX_DURATION_DAYS * 24 * 60 * 60 * 1000);

    // Write via admin client — bypasses RLS sandbox guard
    const { error: updateErr } = await admin
      .from("user_settings")
      .update({
        sandbox_mode: true,
        sandbox_activated_at: now.toISOString(),
        sandbox_expires_at: expiresAt.toISOString(),
        sandbox_tier: tier,
        sandbox_data: sandboxData,
      })
      .eq("user_id", user.id);

    if (updateErr) {
      return NextResponse.json({ error: "Failed to activate sandbox" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      action: "activated",
      tier,
      expiresAt: expiresAt.toISOString(),
      meta: sandboxData.meta,
    });
  }

  // ── TOGGLE ──────────────────────────────────────────────────────────────
  // Flip sandbox_mode on/off without regenerating data.
  if (action === "toggle") {
    // Read current state
    const { data: settings, error: readErr } = await supabase
      .from("user_settings")
      .select("sandbox_mode, sandbox_activated_at, sandbox_expires_at, sandbox_data")
      .eq("user_id", user.id)
      .single();

    if (readErr || !settings) {
      return NextResponse.json({ error: "User settings not found" }, { status: 404 });
    }

    // If never activated, reject toggle — must activate first
    if (!settings.sandbox_activated_at) {
      return NextResponse.json(
        { error: "Sandbox has not been activated. Use action: activate first." },
        { status: 400 },
      );
    }

    // Check expiry — if expired, can only view archive (not toggle on)
    if (settings.sandbox_expires_at) {
      const expiresAt = new Date(settings.sandbox_expires_at as string);
      if (expiresAt < new Date() && !settings.sandbox_mode) {
        return NextResponse.json(
          { error: "Sandbox has expired. Use /sandbox/archive to view historical data." },
          { status: 400 },
        );
      }
    }

    const newMode = !settings.sandbox_mode;
    const { error: updateErr } = await admin
      .from("user_settings")
      .update({ sandbox_mode: newMode })
      .eq("user_id", user.id);

    if (updateErr) {
      return NextResponse.json({ error: "Failed to toggle sandbox" }, { status: 500 });
    }

    return NextResponse.json({ success: true, action: "toggled", sandbox_mode: newMode });
  }

  // ── EXPIRE ──────────────────────────────────────────────────────────────
  // Called by the client when it detects the 90-day window has passed.
  // Turns off sandbox mode but preserves all data for archive access.
  if (action === "expire") {
    const { error: updateErr } = await admin
      .from("user_settings")
      .update({ sandbox_mode: false })
      .eq("user_id", user.id);

    if (updateErr) {
      return NextResponse.json({ error: "Failed to expire sandbox" }, { status: 500 });
    }

    return NextResponse.json({ success: true, action: "expired" });
  }

  // ── REGENERATE ──────────────────────────────────────────────────────────
  // Re-generate sandbox data with a new tier (resets the dataset, not the timer).
  if (action === "regenerate") {
    const tier = body.tier as SandboxTier;
    if (!tier || !VALID_TIERS.includes(tier)) {
      return NextResponse.json(
        { error: "Invalid tier. Must be: building, established, or high_producer" },
        { status: 400 },
      );
    }

    // Load settings
    const { data: settings, error: settingsErr } = await supabase
      .from("user_settings")
      .select("board_code, province, display_name, market_board_name, sandbox_activated_at, sandbox_expires_at")
      .eq("user_id", user.id)
      .single();

    if (settingsErr || !settings) {
      return NextResponse.json({ error: "User settings not found" }, { status: 404 });
    }

    const boardCode = settings.board_code as string;
    const province = settings.province as string;
    const displayName = settings.display_name as string;
    const boardName = (settings.market_board_name as string) || boardCode;

    // Fetch board data
    const board = CREA_BOARDS.find((b) => b.slug === boardCode);
    let boardStats = null;
    if (board) {
      try {
        boardStats = await fetchBoardData(board);
      } catch {
        // fall through to default
      }
    }

    if (!boardStats) {
      boardStats = {
        boardSlug: boardCode || "default",
        boardName: boardName || "Canada",
        reportMonth: new Date().toISOString().slice(0, 7),
        subRegions: [],
        boardTotal: {
          name: "Board Total",
          sales: 1200,
          newListings: 2000,
          dollarVolume: 600000000,
          averagePrice: 500000,
        },
        salesToNewListingsRatio: 0.6,
        marketCondition: "balanced" as const,
        marketConditionLabel: "Balanced Market",
        cachedAt: new Date().toISOString(),
      };
    }

    const sandboxData = generateSandboxData(
      boardCode || "default",
      boardName || "Canada",
      province || "ontario",
      displayName || "Agent",
      tier,
      boardStats,
    );

    const { error: updateErr } = await admin
      .from("user_settings")
      .update({
        sandbox_tier: tier,
        sandbox_data: sandboxData,
        sandbox_mode: true,
      })
      .eq("user_id", user.id);

    if (updateErr) {
      return NextResponse.json({ error: "Failed to regenerate sandbox" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      action: "regenerated",
      tier,
      meta: sandboxData.meta,
    });
  }

  return NextResponse.json(
    { error: "Invalid action. Must be: activate, toggle, expire, or regenerate" },
    { status: 400 },
  );
}
