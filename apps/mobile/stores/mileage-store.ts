/**
 * Mileage on the phone: this year's logbook rows, saved places and recent
 * trips, and the writes the Mileage screen makes.
 *
 * Every read and write goes through core, the same code the web Mileage
 * tab, Flight Crew and the MCP server run:
 *   loadLogbookRows / loadMileagePlaces   core/lib/vehicle-logbook-rows
 *   logTrip (writeMileage)                core/lib/record-writers
 *   recordOdometerReading                 core/lib/vehicle-logbook-writes
 * Saving a place: saveMileagePlace           core/lib/vehicle-logbook-writes
 *
 * The logbook rows are also what the Expenses screen hands
 * `expenseTaxContext`, so the receipts' ITC split uses the same vehicle
 * share as the web (vehicle-logbook-engine).
 *
 * Nothing here reads `storage` at import time, so storage-bootstrap needs
 * no hydrate step for it: the screen fetches when it opens.
 *
 * A failed write keeps the form as typed and shows the reason in an error
 * toast (it stays until tapped). It is not queued offline.
 */

import { create } from "zustand";
import { supabase } from "../lib/supabase";
import { useToastStore } from "./toast-store";
import { atlanticYear } from "@agent-runway/core/lib/local-date";
import {
  loadLogbookRows,
  loadMileagePlaces,
  type LoadedLogbook,
} from "@agent-runway/core/lib/vehicle-logbook-rows";
import {
  saveMileagePlace as coreSaveMileagePlace,
  recordOdometerReading as coreRecordOdometerReading,
  type OdometerReadingInput,
  type TripInput,
} from "@agent-runway/core/lib/vehicle-logbook-writes";
import { logTrip as coreLogTrip } from "@agent-runway/core/lib/record-writers";
import type { MileagePlace } from "@agent-runway/core/types/database";

/** Trips shown under "Recent trips". The share is worked out from every trip, not this list. */
export const RECENT_TRIPS_SHOWN = 50;

export interface RecentTrip {
  id: string;
  trip_date: string;
  description: string;
  from_location: string | null;
  to_location: string | null;
  km: number;
  purpose: string | null;
  vehicle_id: string | null;
  odometer_start: number | null;
  odometer_end: number | null;
}

export interface NewPlace {
  name: string;
  address?: string | null;
  /** Left out: the saved trip's km. */
  defaultKm?: number | null;
}

interface MileageStore {
  /** The rows `vehicleBusinessUseFor` needs for `logbookYear`; null until loaded. */
  logbook: LoadedLogbook | null;
  logbookYear: number | null;
  places: MileagePlace[];
  trips: RecentTrip[];
  /** At least one full fetch has finished (whether or not every part loaded). */
  loaded: boolean;
  loading: boolean;
  /** What did not load on the last fetch, or null. */
  error: string | null;

  /** Logbook rows, places and recent trips for the current year. */
  fetch: () => Promise<boolean>;
  /** Logbook rows only (the Expenses screen). */
  fetchLogbook: () => Promise<boolean>;
  /** Save a trip, then (when `place` is given) save its destination as a place. */
  logTrip: (input: TripInput, place?: NewPlace | null) => Promise<boolean>;
  /** Save an odometer reading the engine listed as due. */
  recordReading: (reading: OdometerReadingInput) => Promise<boolean>;
}

// The tax year is the Atlantic calendar year, the same as the web pages and
// the server (a phone in another zone near midnight on Dec 31 would
// otherwise load the other year's logbook). Trip dates stay the phone's own day.
const currentYear = () => atlanticYear();

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** A refused or failed write, in words. A dropped connection says so. */
function writeFailure(what: string, error: string): string {
  if (/network|fetch|timed? ?out|offline/i.test(error)) return `Couldn't save the ${what}. Check your connection and try again.`;
  return `Couldn't save the ${what}: ${error}`;
}

async function signedInUserId(): Promise<string | null> {
  const { data: sess } = await supabase.auth.getSession();
  if (!sess.session) return null;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

const num = (v: unknown): number | null => (v == null || v === "" ? null : Number(v));

async function loadRecentTrips(userId: string, year: number): Promise<RecentTrip[]> {
  const { data, error } = await supabase
    .from("mileage_logs")
    .select("id, trip_date, description, from_location, to_location, km, purpose, vehicle_id, odometer_start, odometer_end")
    .eq("user_id", userId)
    .gte("trip_date", `${year}-01-01`)
    .lte("trip_date", `${year}-12-31`)
    .order("trip_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(RECENT_TRIPS_SHOWN);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: String(r.id),
    trip_date: String(r.trip_date),
    description: r.description ?? "",
    from_location: r.from_location ?? null,
    to_location: r.to_location ?? null,
    km: Number(r.km) || 0,
    purpose: r.purpose ?? null,
    vehicle_id: r.vehicle_id ?? null,
    odometer_start: num(r.odometer_start),
    odometer_end: num(r.odometer_end),
  }));
}

export const useMileageStore = create<MileageStore>((set, get) => ({
  logbook: null,
  logbookYear: null,
  places: [],
  trips: [],
  loaded: false,
  loading: false,
  error: null,

  fetch: async () => {
    const userId = await signedInUserId();
    if (!userId) return false;
    const year = currentYear();
    set({ loading: true });
    const [logbook, places, trips] = await Promise.allSettled([
      loadLogbookRows(supabase, userId, year),
      loadMileagePlaces(supabase, userId),
      loadRecentTrips(userId, year),
    ]);
    // A part that failed keeps what was there before; the screen says it did not load.
    const failed: string[] = [];
    const next: Partial<MileageStore> = { loaded: true, loading: false };
    if (logbook.status === "fulfilled") {
      next.logbook = logbook.value;
      next.logbookYear = year;
    } else failed.push(`logbook (${message(logbook.reason)})`);
    if (places.status === "fulfilled") next.places = places.value;
    else failed.push(`saved places (${message(places.reason)})`);
    if (trips.status === "fulfilled") next.trips = trips.value;
    else failed.push(`trips (${message(trips.reason)})`);
    next.error = failed.length ? `Couldn't load the ${failed.join(", ")}.` : null;
    if (failed.length) console.warn("[mileage] fetch:", next.error);
    set(next);
    return failed.length === 0;
  },

  fetchLogbook: async () => {
    const userId = await signedInUserId();
    if (!userId) return false;
    const year = currentYear();
    try {
      const logbook = await loadLogbookRows(supabase, userId, year);
      set({ logbook, logbookYear: year });
      return true;
    } catch (err) {
      // The Expenses screen then applies the declared share, as the web pages do.
      console.warn("[mileage] logbook rows not loaded:", message(err));
      return false;
    }
  },

  logTrip: async (input, place) => {
    const toast = useToastStore.getState();
    const userId = await signedInUserId();
    if (!userId) {
      toast.show("Sign in again to save trips.", "error");
      return false;
    }
    const saved = await coreLogTrip(supabase, userId, input);
    if (!saved.ok) {
      toast.show(writeFailure("trip", saved.error), "error");
      return false;
    }

    let placeError: string | null = null;
    if (place && place.name.trim()) {
      // Core writer (vehicle-logbook-writes): checks the name and km, and
      // skips a name already saved. Not given: the trip's own km as saved
      // (worked out from the odometer when typed that way).
      const km = place.defaultKm !== undefined ? place.defaultKm : num(saved.value.km);
      const res = await coreSaveMileagePlace(supabase, userId, {
        name: place.name.trim().slice(0, 80),
        address: place.address?.trim() ? place.address.trim().slice(0, 200) : null,
        defaultKm: km,
      });
      if (!res.ok) placeError = res.error;
    }

    await get().fetch();
    if (placeError) toast.show(`Trip saved. ${writeFailure("place", placeError)}`, "error");
    else toast.show("Trip saved ✓", "success");
    return true;
  },

  recordReading: async (reading) => {
    const toast = useToastStore.getState();
    const userId = await signedInUserId();
    if (!userId) {
      toast.show("Sign in again to save readings.", "error");
      return false;
    }
    const saved = await coreRecordOdometerReading(supabase, userId, reading);
    if (!saved.ok) {
      toast.show(writeFailure("reading", saved.error), "error");
      return false;
    }
    await get().fetch();
    toast.show("Odometer reading saved ✓", "success");
    return true;
  },
}));
