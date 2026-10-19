/**
 * Logbook writes, shared by every client: the web Mileage tab, Flight Crew
 * (logMileage, startLogbookPeriod), the MCP server and the phone. Lives in
 * core so the rules are tested once (lib/__tests__/vehicle-logbook-writes.test.ts)
 * and each client runs this same code with its own signed-in client (RLS
 * applies to all of them).
 *
 *   ensureDefaultVehicle   the vehicle a trip or period belongs to when the
 *                          agent has not picked one: the first active
 *                          vehicle, or a new "My vehicle" the first time.
 *                          Existing trips are never rewritten; a trip with no
 *                          vehicle counts for this one (defaultVehicleId).
 *   startLogbookPeriod     a base year or a sample period, checked with
 *                          logbookPeriodProblem (shape, overlap, a base year
 *                          before a sample).
 *   recordOdometerReading  a reading the engine lists as due: a period's
 *                          start or end (on the period row) or a base year's
 *                          month end (vehicle_odometer_readings).
 *   mileageTripRow         a mileage_logs insert: km from the odometer when
 *                          only the readings are given, CRA's allowance rate
 *                          for the trip's year, vehicle and odometer columns
 *                          only when set. The one trip writer that inserts it
 *                          is record-writers' `writeMileage` (Flight Crew,
 *                          voice capture, MCP, the web Mileage tab, the phone).
 *
 * The client is typed by the calls made, not imported from supabase-js (the
 * MCP server imports this through _shared/core, with no import map).
 */

import {
  defaultVehicleId,
  logbookPeriodEnd,
  logbookPeriodProblem,
  type LogbookPeriodKind,
  type ReadingDueKind,
} from "../engines/vehicle-logbook-engine";
import { craAllowanceRates } from "../tax-copy/cra-rules";
import type { MileagePlace, Vehicle, VehicleLogbookPeriod } from "../types/database";
import { loadLogbookPeriods, loadMileagePlaces, loadVehicles, type LogbookClient } from "./vehicle-logbook-rows";

export type WriteResult<T> = { ok: true; value: T } | { ok: false; error: string };

/** Trip purposes offered as quick picks (web Mileage tab, phone). Free text is allowed too. */
export const MILEAGE_TRIP_PURPOSES = [
  "Client showing",
  "Open house",
  "Client meeting",
  "Board / MLS office",
  "Property inspection",
  "Listing appointment",
  "Stager / photographer",
  "Office supply run",
  "Professional development",
  "Other business",
] as const;

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** The name a vehicle gets when the agent has not named one. */
export const DEFAULT_VEHICLE_NAME = "My vehicle";

/**
 * The vehicle a new trip is stamped with when none is picked
 * (`defaultVehicleId`), or null when the agent has no vehicle or the list
 * can't be read (before migration 00184; the trip is then saved with no
 * vehicle and counts for the oldest one later).
 */
export async function defaultVehicleFor(supabase: LogbookClient, userId: string): Promise<string | null> {
  try {
    return defaultVehicleId(await loadVehicles(supabase, userId));
  } catch {
    return null;
  }
}

/** The default vehicle's id, adding "My vehicle" when the agent has none. */
export async function ensureDefaultVehicle(supabase: LogbookClient, userId: string): Promise<WriteResult<string>> {
  let vehicles: Vehicle[];
  try {
    vehicles = await loadVehicles(supabase, userId);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  const existing = defaultVehicleId(vehicles);
  if (existing) return { ok: true, value: existing };
  const { data, error } = await supabase
    .from("vehicles")
    .insert({ user_id: userId, name: DEFAULT_VEHICLE_NAME })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "The vehicle was not saved." };
  return { ok: true, value: (data as { id: string }).id };
}

export interface NewPlace {
  name: string;
  address?: string | null;
  /** The usual km for a trip there. */
  defaultKm?: number | null;
}

/**
 * Save a place for quick trip entry (web Mileage tab, phone). A name already
 * saved (any case) is not saved again: `value` is null then.
 */
export async function saveMileagePlace(supabase: LogbookClient, userId: string, p: NewPlace): Promise<WriteResult<MileagePlace | null>> {
  const name = p.name?.trim() ?? "";
  if (name.length < 1 || name.length > 80) return { ok: false, error: "A place needs a name of 1 to 80 characters." };
  const address = p.address?.trim() || null;
  if (address && address.length > 200) return { ok: false, error: "The address is at most 200 characters." };
  const km = p.defaultKm != null && Number.isFinite(p.defaultKm) && p.defaultKm > 0 && p.defaultKm <= 5_000 ? Math.round(p.defaultKm * 10) / 10 : null;
  let places: MileagePlace[];
  try {
    places = await loadMileagePlaces(supabase, userId);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  if (places.some((x) => x.name.trim().toLowerCase() === name.toLowerCase())) return { ok: true, value: null };
  const { data, error } = await supabase
    .from("mileage_places")
    .insert({ user_id: userId, name, address, default_km: km })
    .select("*")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "The place was not saved." };
  return { ok: true, value: data as MileagePlace };
}

export interface NewVehicle {
  name: string;
  model_year?: number | null;
  make?: string | null;
  model?: string | null;
}

/** What is wrong with a vehicle, or null. */
export function vehicleProblem(v: NewVehicle): string | null {
  const name = v.name?.trim() ?? "";
  if (name.length < 1 || name.length > 80) return "A vehicle needs a name of 1 to 80 characters.";
  if (v.model_year != null && (!Number.isInteger(v.model_year) || v.model_year < 1900 || v.model_year > 2100)) return "The model year is a year such as 2024.";
  return null;
}

export async function addVehicle(supabase: LogbookClient, userId: string, v: NewVehicle): Promise<WriteResult<Vehicle>> {
  const problem = vehicleProblem(v);
  if (problem) return { ok: false, error: problem };
  const { data, error } = await supabase
    .from("vehicles")
    .insert({
      user_id: userId,
      name: v.name.trim(),
      model_year: v.model_year ?? null,
      make: v.make?.trim() || null,
      model: v.model?.trim() || null,
    })
    .select("*")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "The vehicle was not saved." };
  return { ok: true, value: data as Vehicle };
}

export interface NewLogbookPeriod {
  /** Omitted: the default vehicle (added if the agent has none). */
  vehicleId?: string | null;
  kind: LogbookPeriodKind;
  /** YYYY-MM-DD, the 1st of a month. */
  startDate: string;
  /** The odometer as the period begins, when the agent has it. */
  odometerStart?: number | null;
  notes?: string | null;
}

/** Start a base year or a sample period. The end date follows from the kind. */
export async function startLogbookPeriod(
  supabase: LogbookClient,
  userId: string,
  p: NewLogbookPeriod,
): Promise<WriteResult<VehicleLogbookPeriod>> {
  if (p.odometerStart != null && (!Number.isFinite(p.odometerStart) || p.odometerStart < 0)) {
    return { ok: false, error: "The odometer reading is a number of km, 0 or more." };
  }
  // The period's own shape first, so a refused period never adds a vehicle.
  if (!ISO.test(p.startDate)) return { ok: false, error: "Dates are YYYY-MM-DD." };
  const shape = logbookPeriodProblem({ kind: p.kind, start_date: p.startDate, end_date: p.startDate.endsWith("-01") ? logbookPeriodEnd(p.kind, p.startDate) : p.startDate });
  if (shape) return { ok: false, error: shape };
  let vehicleId = p.vehicleId ?? null;
  if (vehicleId) {
    const owned = await ownsVehicle(supabase, userId, vehicleId);
    if (!owned.ok) return owned;
  } else {
    const v = await ensureDefaultVehicle(supabase, userId);
    if (!v.ok) return v;
    vehicleId = v.value;
  }
  let existing: VehicleLogbookPeriod[];
  try {
    existing = await loadLogbookPeriods(supabase, userId);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  const row = {
    vehicle_id: vehicleId,
    kind: p.kind,
    start_date: p.startDate,
    end_date: p.startDate.endsWith("-01") ? logbookPeriodEnd(p.kind, p.startDate) : p.startDate,
  };
  const problem = logbookPeriodProblem(row, existing);
  if (problem) return { ok: false, error: problem };
  const { data, error } = await supabase
    .from("vehicle_logbook_periods")
    .insert({
      user_id: userId,
      ...row,
      odometer_start: p.odometerStart ?? null,
      notes: p.notes?.trim() || null,
    })
    .select("*")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "The logbook period was not saved." };
  return { ok: true, value: data as VehicleLogbookPeriod };
}

export interface OdometerReadingInput {
  kind: ReadingDueKind;
  vehicleId: string;
  /** period_start and period_end: the period. */
  periodId?: string | null;
  /** month_end: the day the reading is the end of. */
  date?: string | null;
  km: number;
}

/** Save a reading the engine listed as due (`VehicleBusinessUse.readingsDue`). */
export async function recordOdometerReading(
  supabase: LogbookClient,
  userId: string,
  r: OdometerReadingInput,
): Promise<WriteResult<null>> {
  if (!Number.isFinite(r.km) || r.km < 0 || r.km > 9_999_999) return { ok: false, error: "The odometer reading is a number of km, 0 or more." };
  const km = Math.round(r.km * 10) / 10;
  if (r.kind === "period_start" || r.kind === "period_end") {
    if (!r.periodId) return { ok: false, error: "Which logbook period is this reading for?" };
    const column = r.kind === "period_start" ? "odometer_start" : "odometer_end";
    const { data: period, error: readErr } = await supabase
      .from("vehicle_logbook_periods")
      .select("odometer_start, odometer_end")
      .eq("id", r.periodId)
      .eq("user_id", userId)
      .maybeSingle();
    if (readErr) return { ok: false, error: readErr.message };
    if (!period) return { ok: false, error: "That logbook period was not found." };
    const other = r.kind === "period_start" ? period.odometer_end : period.odometer_start;
    if (other != null && (r.kind === "period_start" ? km > Number(other) : km < Number(other))) {
      return { ok: false, error: "The odometer at the end of a period is at least the reading at its start." };
    }
    const { error } = await supabase
      .from("vehicle_logbook_periods")
      .update({ [column]: km })
      .eq("id", r.periodId)
      .eq("user_id", userId);
    return error ? { ok: false, error: error.message } : { ok: true, value: null };
  }
  if (!r.date || !ISO.test(r.date)) return { ok: false, error: "Dates are YYYY-MM-DD." };
  const { error } = await supabase
    .from("vehicle_odometer_readings")
    .upsert(
      { user_id: userId, vehicle_id: r.vehicleId, reading_date: r.date, odometer_km: km },
      { onConflict: "vehicle_id,reading_date" },
    );
  return error ? { ok: false, error: error.message } : { ok: true, value: null };
}

export interface TripInput {
  tripDate: string;
  description: string;
  /** Km driven. Optional when both odometer readings are given. */
  km?: number | null;
  odometerStart?: number | null;
  odometerEnd?: number | null;
  vehicleId?: string | null;
  fromLocation?: string | null;
  toLocation?: string | null;
  purpose?: string | null;
  notes?: string | null;
}

/**
 * A mileage_logs insert, or what is wrong with the trip. Km come from the
 * odometer when only the two readings are given; with both, they have to
 * agree (within 0.5 km). `cra_rate_per_km` is CRA's first-tier allowance
 * rate for the trip's year: the column's own default was 2025's $0.72.
 */
export function mileageTripRow(
  userId: string,
  t: TripInput,
  /**
   * allowBlankDescription: record-writers' writeMileage and updateMileage,
   * which accept a blank purpose as the Flight Crew tool always did (#364).
   * The web and phone forms and MCP log_mileage ask for one.
   */
  options: { allowBlankDescription?: boolean } = {},
): WriteResult<Record<string, unknown>> {
  if (!ISO.test(t.tripDate)) return { ok: false, error: "The trip date is YYYY-MM-DD." };
  const description = t.description?.trim() ?? "";
  if (!description && !options.allowBlankDescription) return { ok: false, error: "A trip needs a description (where and why)." };
  const start = t.odometerStart ?? null;
  const end = t.odometerEnd ?? null;
  if ((start != null && (!Number.isFinite(start) || start < 0)) || (end != null && (!Number.isFinite(end) || end < 0))) {
    return { ok: false, error: "Odometer readings are numbers of km, 0 or more." };
  }
  if (start != null && end != null && end < start) return { ok: false, error: "The odometer at the end of a trip is at least the reading at its start." };
  const fromOdometer = start != null && end != null ? Math.round((end - start) * 10) / 10 : null;
  let km = t.km ?? fromOdometer;
  if (km == null || !Number.isFinite(km) || km <= 0) return { ok: false, error: "A trip needs its km, or the odometer at its start and end." };
  if (fromOdometer != null && Math.abs(fromOdometer - km) > 0.5) {
    return { ok: false, error: `The km (${km}) and the odometer (${fromOdometer} km) do not agree.` };
  }
  km = Math.round(km * 10) / 10;
  if (km > 5_000) return { ok: false, error: "A single trip of more than 5,000 km is not accepted; check the figure." };
  const { rates } = craAllowanceRates(Number(t.tripDate.slice(0, 4)));
  const row: Record<string, unknown> = {
    user_id: userId,
    trip_date: t.tripDate,
    description,
    from_location: t.fromLocation?.trim() || null,
    to_location: t.toLocation?.trim() || null,
    km,
    cra_rate_per_km: rates.first5000,
    purpose: t.purpose?.trim() || null,
    notes: t.notes?.trim() || null,
  };
  // Only when set, so a write works the same before and after migration 00184.
  if (t.vehicleId) row.vehicle_id = t.vehicleId;
  if (start != null) row.odometer_start = start;
  if (end != null) row.odometer_end = end;
  return { ok: true, value: row };
}

/**
 * The vehicle is the agent's own. RLS hides other agents' vehicles, so a
 * vehicle that does not come back is not theirs (mileage_logs' foreign key
 * alone would accept any vehicle id).
 */
export async function ownsVehicle(supabase: LogbookClient, userId: string, vehicleId: string): Promise<WriteResult<null>> {
  const { data, error } = await supabase.from("vehicles").select("id").eq("id", vehicleId).eq("user_id", userId).maybeSingle();
  if (error) return { ok: false, error: error.message };
  return data ? { ok: true, value: null } : { ok: false, error: "That vehicle was not found." };
}
