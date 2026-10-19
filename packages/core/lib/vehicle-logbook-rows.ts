/**
 * The rows the vehicle business-use share is worked out from
 * (engines/vehicle-logbook-engine.ts), read the same way on every surface:
 * the web pages, Flight Crew, the phone and the MCP server all call this.
 *
 *   vehicles                   every vehicle, oldest first (trips with no
 *                              vehicle count for the oldest, active or not:
 *                              unassignedTripVehicleId; new trips go on the
 *                              oldest active one: defaultVehicleId)
 *   vehicle_logbook_periods    every period
 *   vehicle_odometer_readings  every reading
 *   mileage_logs               trip_date, km, vehicle_id over
 *                              logbookTripRange(periods, year): the year and
 *                              any base year on or before it
 *
 * An agent with no logbook period reads three short lists and no trips: the
 * share is then the declared setting whatever the trips say, so they are not
 * fetched. Lists are read in pages of 1,000 (the API's cap), so a year with
 * more trips than that is read whole.
 *
 * A failed read throws. Without the rows the share would quietly fall back
 * to the declared setting and look valid.
 *
 * The client is typed by the calls made, not imported from supabase-js: the
 * MCP server (Deno, no import map) imports this file through _shared/core.
 */

import { logbookTripRange, type LogbookRows } from "../engines/vehicle-logbook-engine";
import type { MileagePlace, Vehicle, VehicleLogbookPeriod, VehicleOdometerReading } from "../types/database";

interface Result<T> {
  data: T[] | null;
  error: { message: string; code?: string } | null;
}

/** The slice of the query builder this file uses. */
interface Query<T> extends PromiseLike<Result<T>> {
  select(columns: string): Query<T>;
  eq(column: string, value: unknown): Query<T>;
  gte(column: string, value: unknown): Query<T>;
  lte(column: string, value: unknown): Query<T>;
  order(column: string, options?: { ascending?: boolean }): Query<T>;
  range(from: number, to: number): Query<T>;
}

/** Anything with supabase-js's `from()`: the web, phone and MCP clients. */
export interface LogbookClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from(table: string): any;
}

const PAGE = 1000;

async function allRows<T>(page: (from: number, to: number) => PromiseLike<Result<T>>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(`logbook read failed: ${error.message}`);
    const got = data ?? [];
    rows.push(...got);
    if (got.length < PAGE) return rows;
  }
}

/** Every vehicle, oldest first. */
export function loadVehicles(supabase: LogbookClient, userId: string): Promise<Vehicle[]> {
  return allRows<Vehicle>((from, to) =>
    (supabase.from("vehicles") as Query<Vehicle>)
      .select("id, user_id, name, model_year, make, model, is_active, created_at, updated_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to),
  );
}

/** Every logbook period, earliest first. */
export function loadLogbookPeriods(supabase: LogbookClient, userId: string): Promise<VehicleLogbookPeriod[]> {
  return allRows<VehicleLogbookPeriod>((from, to) =>
    (supabase.from("vehicle_logbook_periods") as Query<VehicleLogbookPeriod>)
      .select("id, user_id, vehicle_id, kind, start_date, end_date, odometer_start, odometer_end, notes, created_at, updated_at")
      .eq("user_id", userId)
      .order("start_date", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to),
  );
}

/** Every odometer reading, earliest first. */
export function loadOdometerReadings(supabase: LogbookClient, userId: string): Promise<VehicleOdometerReading[]> {
  return allRows<VehicleOdometerReading>((from, to) =>
    (supabase.from("vehicle_odometer_readings") as Query<VehicleOdometerReading>)
      .select("id, user_id, vehicle_id, reading_date, odometer_km, created_at, updated_at")
      .eq("user_id", userId)
      .order("reading_date", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to),
  );
}

/** Saved places, by name. */
export function loadMileagePlaces(supabase: LogbookClient, userId: string): Promise<MileagePlace[]> {
  return allRows<MileagePlace>((from, to) =>
    (supabase.from("mileage_places") as Query<MileagePlace>)
      .select("id, user_id, name, address, default_km, created_at, updated_at")
      .eq("user_id", userId)
      .order("name", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to),
  );
}

export interface LoadedLogbook extends LogbookRows {
  vehicles: Vehicle[];
  periods: VehicleLogbookPeriod[];
  readings: VehicleOdometerReading[];
}

/** The rows `vehicleBusinessUseFor(settings, rows, year)` needs for `year`. */
export async function loadLogbookRows(supabase: LogbookClient, userId: string, year: number): Promise<LoadedLogbook> {
  const [vehicles, periods, readings] = await Promise.all([
    loadVehicles(supabase, userId),
    loadLogbookPeriods(supabase, userId),
    loadOdometerReadings(supabase, userId),
  ]);
  if (periods.length === 0) return { vehicles, periods, readings, trips: [] };
  const range = logbookTripRange(periods, year);
  type TripRow = { trip_date: string; km: number | string | null; vehicle_id: string | null };
  const trips = await allRows<TripRow>((from, to) =>
    (supabase.from("mileage_logs") as Query<TripRow>)
      .select("id, trip_date, km, vehicle_id")
      .eq("user_id", userId)
      .gte("trip_date", range.from)
      .lte("trip_date", range.to)
      .order("trip_date", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to),
  );
  return { vehicles, periods, readings, trips };
}

/**
 * The same rows, or null when they cannot be read: the share then falls back
 * to the declared setting, and the error is logged. For surfaces that would
 * rather show the declared figure than fail (the dashboard and other pages);
 * a tax figure that names its basis still says "declared".
 */
export async function loadLogbookRowsOrNull(supabase: LogbookClient, userId: string, year: number): Promise<LoadedLogbook | null> {
  try {
    return await loadLogbookRows(supabase, userId, year);
  } catch (err) {
    console.error("[vehicle-logbook] rows not loaded:", err instanceof Error ? err.message : String(err));
    return null;
  }
}
