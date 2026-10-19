// The agent's vehicle logbook for a year, for server pages, routes and
// Flight Crew: the rows `expenseTaxContext(settings, logbook)` resolves the
// vehicle business-use share from (vehicle-logbook-engine). One loader, so
// every surface reads the same tables, columns and filters
// (core/lib/vehicle-logbook-rows.ts).
//
// A failed read gives `rows: null`: the share is then the declared setting,
// and every label says "declared". It never rejects, so a page still renders
// (and does before migration 00184 is applied).

import { loadLogbookRowsOrNull, type LogbookClient } from "@agent-runway/core/lib/vehicle-logbook-rows";
import type { ExpenseTaxLogbook } from "@agent-runway/core/engines/expense-totals-engine";
import { atlanticISODate, atlanticYear } from "@agent-runway/core/lib/local-date";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRows } from "@/lib/supabase/fetch-all";

export async function loadVehicleLogbook(
  supabase: LogbookClient,
  userId: string,
  year: number = atlanticYear(),
): Promise<ExpenseTaxLogbook> {
  const rows = await loadLogbookRowsOrNull(supabase, userId, year);
  return { rows, year, today: atlanticISODate() };
}

/** Business km and trips logged in a year. */
export interface YearMileageTotals {
  km: number;
  tripCount: number;
}

/**
 * Business km and trips logged in `year` (every trip, read in pages). The
 * dashboard, Forecast, Overhead and Reports tax cards and the T2125 PDF read
 * this. Until 2026-10-18 the first three summed every trip ever logged (no
 * year filter, and at most 1,000 rows) as the year's km. Never rejects: a
 * failed read is 0 km, logged.
 */
export async function loadYearMileageTotals(
  supabase: SupabaseClient,
  userId: string,
  year: number = atlanticYear(),
): Promise<YearMileageTotals> {
  const { data, error } = await fetchAllRows<{ km: number | string | null }>((from, to) =>
    supabase
      .from("mileage_logs")
      .select("id, km")
      .eq("user_id", userId)
      .gte("trip_date", `${year}-01-01`)
      .lte("trip_date", `${year}-12-31`)
      .order("id", { ascending: true })
      .range(from, to),
  );
  if (error) console.error("[vehicle-logbook] year km not loaded:", error.message);
  return { km: data.reduce((sum, r) => sum + (Number(r.km) || 0), 0), tripCount: data.length };
}

/** Business km logged in `year`. */
export async function loadYearBusinessKm(
  supabase: SupabaseClient,
  userId: string,
  year: number = atlanticYear(),
): Promise<number> {
  return (await loadYearMileageTotals(supabase, userId, year)).km;
}
