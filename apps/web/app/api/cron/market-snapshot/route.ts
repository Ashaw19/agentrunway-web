/**
 * GET /api/cron/market-snapshot
 *
 * Vercel Cron — runs on the 2nd of each month at 10:00 UTC.
 * Fetches current CREA board data for every board that at least one user
 * has configured, and upserts a snapshot into market_data_snapshots.
 *
 * Protected by CRON_SECRET Bearer token.
 *
 * Schedule: "0 10 2 * *" (2nd of each month, gives CREA time to publish)
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { CREA_BOARDS, fetchBoardData } from "@/lib/crea-board";

export const maxDuration = 120; // 2 minutes — fetching multiple boards

export async function GET(req: NextRequest) {
  // ── Auth: verify CRON_SECRET ─────────────────────────────────────────────
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const results: Array<{ board: string; status: string }> = [];

  try {
    // ── 1. Find all boards that users have configured ────────────────────
    const { data: boardCodes } = await supabase
      .from("user_settings")
      .select("board_code")
      .not("board_code", "is", null)
      .not("board_code", "eq", "");

    const uniqueBoardSlugs = [...new Set(
      (boardCodes ?? [])
        .map((r) => r.board_code as string)
        .filter(Boolean)
    )];

    if (uniqueBoardSlugs.length === 0) {
      return NextResponse.json({
        ok: true,
        message: "No boards configured by any user",
        results: [],
      });
    }

    // ── 2. Fetch & store each board's data ───────────────────────────────
    for (const slug of uniqueBoardSlugs) {
      const board = CREA_BOARDS.find((b) => b.slug === slug);
      if (!board) {
        results.push({ board: slug, status: "unknown_board" });
        continue;
      }

      try {
        const data = await fetchBoardData(board);

        // Upsert into market_data_snapshots
        const { error } = await supabase
          .from("market_data_snapshots")
          .upsert(
            {
              board_slug: data.boardSlug,
              board_name: data.boardName,
              report_month: data.reportMonth,
              snapshot_date: new Date().toISOString().slice(0, 10),
              total_sales: data.boardTotal?.sales ?? null,
              total_new_listings: data.boardTotal?.newListings ?? null,
              total_dollar_volume: data.boardTotal?.dollarVolume ?? null,
              average_price: data.boardTotal?.averagePrice ?? null,
              sales_to_new_listings_ratio: data.salesToNewListingsRatio ?? null,
              market_condition: data.marketCondition ?? null,
              quarterly_unit_sales: data.quarterlyUnitSales ?? null,
              quarterly_unit_sales_yoy: data.quarterlyUnitSalesYoY ?? null,
              median_sale_price: data.medianSalePrice ?? null,
              median_sale_price_yoy: data.medianSalePriceYoY ?? null,
              sub_regions: data.subRegions ?? [],
              raw_payload: data as unknown as Record<string, unknown>,
            },
            { onConflict: "board_slug,report_month" },
          );

        if (error) {
          console.error(`[market-snapshot] Error upserting ${slug}:`, error);
          results.push({ board: slug, status: `error: ${error.message}` });
        } else {
          results.push({ board: slug, status: "ok" });
        }
      } catch (err) {
        console.error(`[market-snapshot] Failed to fetch ${slug}:`, err);
        results.push({ board: slug, status: "fetch_failed" });
      }

      // Small delay between boards to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    const okCount = results.filter((r) => r.status === "ok").length;
    return NextResponse.json({
      ok: true,
      message: `Stored ${okCount}/${uniqueBoardSlugs.length} board snapshots`,
      results,
    });
  } catch (err) {
    console.error("[market-snapshot] Fatal error:", err);
    return NextResponse.json(
      { ok: false, error: "Market snapshot cron failed" },
      { status: 500 },
    );
  }
}
