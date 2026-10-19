// A cash-method agent's carry-in: commissions paid this year on deals that
// closed before January 1 (2026-10-14).
//
// CRA lets a self-employed commission agent report income in the year it is
// received (the cash method, T4002 ch. 1). For that agent a deal closed on
// December 17 and paid in January is income of the year it was paid
// (core/engines/tax-year.ts). The dashboard and most loaders query this
// year's closed transactions only (their rows feed ytdGCI and every
// production figure); this fetches the earlier closings paid this year,
// without widening that query. Pass the rows with the year's own to
// `taxYearGCIAdjustment([...ytdTx, ...carryIn], method, year)`.
//
// Production figures (deal counts, GCI by closing year, History, the Runway
// Score, the cash runway) never read these rows.

import type { SupabaseClient } from "@supabase/supabase-js";
import { incomeReportingMethod } from "@agent-runway/core/engines/tax-year";
import { gstHstCommissionTiming } from "@agent-runway/core/engines/commission-hst-engine";
import type { Transaction, UserSettings } from "@/lib/types/database";

/**
 * Closed transactions dated before January 1 of `year` whose commission paid
 * date is in `year`. No query, and an empty list, unless the agent uses the
 * cash method. A failed query gives an empty list (the year's tax figures
 * then leave the carry-in out, as before 2026-10-14) and is logged; it never
 * rejects.
 */
export async function loadTaxYearCarryIn(
  supabase: SupabaseClient,
  userId: string,
  settings: Pick<UserSettings, "income_reporting_method"> | null | undefined,
  year: number,
): Promise<Transaction[]> {
  if (incomeReportingMethod(settings) !== "cash") return [];
  return loadClosedBeforePaidIn(supabase, userId, year);
}

/**
 * The same rows for the GST/HST return card when the agent places
 * commissions by the date paid (user_settings.gst_hst_commission_timing,
 * commission-hst-engine): a December closing paid in January belongs on a
 * return of January's year. That setting is separate from the income
 * reporting method. Empty, with no query, under closing-date timing.
 */
export async function loadGstHstCarryIn(
  supabase: SupabaseClient,
  userId: string,
  settings: Pick<UserSettings, "gst_hst_commission_timing"> | null | undefined,
  year: number,
): Promise<Transaction[]> {
  if (gstHstCommissionTiming(settings) !== "paid") return [];
  return loadClosedBeforePaidIn(supabase, userId, year);
}

async function loadClosedBeforePaidIn(
  supabase: SupabaseClient,
  userId: string,
  year: number,
): Promise<Transaction[]> {
  try {
    const { data, error } = await supabase
      .from("transactions")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "closed")
      .lt("date", `${year}-01-01`)
      .gte("commission_paid_date", `${year}-01-01`)
      .lte("commission_paid_date", `${year}-12-31`)
      .limit(10000);
    if (error) {
      console.error("[tax-year-carry-in] load failed:", error.message);
      return [];
    }
    return data ?? [];
  } catch (err) {
    console.error("[tax-year-carry-in] load failed:", err instanceof Error ? err.message : String(err));
    return [];
  }
}
