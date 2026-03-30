/**
 * GET /api/cron/market-snapshot
 *
 * Vercel Cron — runs on the 2nd of each month at 10:00 UTC.
 * Fetches current CREA board data for ALL 98 boards and upserts
 * a snapshot into market_data_snapshots.
 *
 * Protected by CRON_SECRET Bearer token.
 *
 * Schedule: "0 10 2 * *" (2nd of each month, gives CREA time to publish)
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { CREA_BOARDS, fetchBoardData } from "@/lib/crea-board";

export const maxDuration = 300; // 5 minutes — fetching all 98 boards

export async function GET(req: NextRequest) {
  // ── Auth: verify CRON_SECRET ─────────────────────────────────────────────
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const results: Array<{ board: string; status: string }> = [];

  try {
    // ── Fetch ALL boards — not just user-configured ones ─────────────────
    const boardsToFetch = CREA_BOARDS;

    console.log(`[market-snapshot] Starting fetch for ${boardsToFetch.length} boards`);

    for (const board of boardsToFetch) {
      try {
        const data = await fetchBoardData(board);

        if (!data) {
          results.push({ board: board.slug, status: "fetch_returned_null" });
        } else {
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
                sales_yoy_pct: data.salesYoYPct ?? null,
                avg_price_yoy_pct: data.avgPriceYoYPct ?? null,
                dollar_volume_yoy_pct: data.dollarVolumeYoYPct ?? null,
                new_listings_yoy_pct: data.newListingsYoYPct ?? null,
                ytd_sales: data.ytdSales ?? null,
                ytd_sales_yoy_pct: data.ytdSalesYoYPct ?? null,
                ytd_avg_price: data.ytdAvgPrice ?? null,
                ytd_avg_price_yoy_pct: data.ytdAvgPriceYoYPct ?? null,
                ytd_dollar_volume: data.ytdDollarVolume ?? null,
                historical_comparisons: data.historicalComparisons ?? [],
                sub_regions: data.subRegions ?? [],
                raw_payload: data as unknown as Record<string, unknown>,
              },
              { onConflict: "board_slug,report_month" },
            );

          if (error) {
            console.error(`[market-snapshot] Error upserting ${board.slug}:`, error);
            results.push({ board: board.slug, status: `error: ${error.message}` });
          } else {
            results.push({ board: board.slug, status: "ok" });
          }
        }
      } catch (err) {
        console.error(`[market-snapshot] Failed to fetch ${board.slug}:`, err);
        results.push({ board: board.slug, status: "fetch_failed" });
      }

      // Progress log every 10 boards
      if (results.length % 10 === 0) {
        console.log(`[market-snapshot] Progress: ${results.length}/${boardsToFetch.length}`);
      }

      // Small delay between boards to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    const okCount = results.filter((r) => r.status === "ok").length;
    console.log(`[market-snapshot] Complete: ${okCount}/${boardsToFetch.length} boards stored successfully`);

    return NextResponse.json({
      ok: true,
      message: `Stored ${okCount}/${boardsToFetch.length} board snapshots`,
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
