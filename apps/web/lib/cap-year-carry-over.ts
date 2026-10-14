// The REAL cap year's carry-over, for loaders whose transactions start on
// January 1 (2026-10-14).
//
// REAL's cap resets on the anniversary of `real_join_date`, not on January 1,
// so the per-deal waterfall needs the closed deals from the start of the
// anniversary year that contains January 1 (`planDealsStart`,
// real-compensation-engine). The dashboard and most loaders query this year's
// closed transactions only; this fetches the rows before January 1 that the
// waterfall still needs, without widening the year's own query (its rows feed
// ytdGCI and every "year to date" figure). Pass the result as `carryOverTx`
// to `toPlanDeals(carryOverTx, ytdTx)`.

import type { SupabaseClient } from "@supabase/supabase-js";
import { capYearCarryOver, planDealsStart } from "@agent-runway/core/engines/real-compensation-engine";
import type { Transaction, UserSettings } from "@/lib/types/database";

/**
 * Closed transactions in [planDealsStart(settings, year), January 1 of
 * `year`). No query, and an empty list, unless the agent is on REAL with an
 * anniversary year that spans January 1. A failed query gives an empty list
 * (the year's figures then restart the cap on January 1, as before
 * 2026-10-14) and is logged; it never rejects.
 */
export async function loadCapYearCarryOver(
  supabase: SupabaseClient,
  userId: string,
  settings: Pick<UserSettings, "comp_plan" | "real_join_date"> | null | undefined,
  year: number,
): Promise<Transaction[]> {
  const from = planDealsStart(settings, year);
  const yearStart = `${year}-01-01`;
  if (from >= yearStart) return [];
  try {
    const { data, error } = await supabase
      .from("transactions")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "closed")
      .gte("date", from)
      .lt("date", yearStart)
      .limit(10000);
    if (error) {
      console.error("[cap-year-carry-over] load failed:", error.message);
      return [];
    }
    const rows: Transaction[] = data ?? [];
    return capYearCarryOver(settings, rows, year);
  } catch (err) {
    console.error("[cap-year-carry-over] load failed:", err instanceof Error ? err.message : String(err));
    return [];
  }
}
