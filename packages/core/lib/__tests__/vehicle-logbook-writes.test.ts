/**
 * Logbook writes every client shares (2026-10-18): the web Mileage tab,
 * Flight Crew, the MCP server and the phone.
 *
 * What these prove:
 *   1. A trip's km come from the odometer when only the readings are given,
 *      and a typed km that disagrees with them is refused.
 *   2. The allowance rate stored on a trip is CRA's for the trip's year (the
 *      column default was 2025's $0.72 whatever the year).
 *   3. The vehicle and odometer columns are sent only when set, so a write
 *      works the same before and after migration 00184.
 *   4. A period is checked with the engine's rules before it is written, and
 *      the default vehicle is added once, the first time it is needed.
 *   5. A reading lands on the right row: a period's start or end, or a month
 *      end in vehicle_odometer_readings.
 *
 * The client is a small in-memory stand-in (no database).
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_VEHICLE_NAME,
  ensureDefaultVehicle,
  mileageTripRow,
  recordOdometerReading,
  startLogbookPeriod,
} from "../vehicle-logbook-writes";

type Row = Record<string, unknown>;

/** Enough of supabase-js for these writers: select / insert / update / upsert with eq, order, range, single. */
function fakeClient(tables: Record<string, Row[]>) {
  const writes: { table: string; op: string; row: Row }[] = [];
  let nextId = 1;
  const client = {
    from(table: string) {
      const rows = (tables[table] ??= []);
      const filters: [string, unknown][] = [];
      let op: "select" | "insert" | "update" | "upsert" = "select";
      let payload: Row | null = null;
      const matching = () => rows.filter((r) => filters.every(([c, v]) => r[c] === v));
      const builder = {
        select: () => builder,
        eq: (c: string, v: unknown) => (filters.push([c, v]), builder),
        order: () => builder,
        range: () => builder,
        insert: (row: Row) => {
          op = "insert";
          payload = { id: `id-${nextId++}`, created_at: `2026-10-18T12:00:0${nextId}Z`, ...row };
          return builder;
        },
        update: (row: Row) => ((op = "update"), (payload = row), builder),
        upsert: (row: Row) => ((op = "upsert"), (payload = row), builder),
        single: async () => {
          if (op === "insert" && payload) {
            rows.push(payload);
            writes.push({ table, op, row: payload });
            return { data: payload, error: null };
          }
          return { data: matching()[0] ?? null, error: null };
        },
        maybeSingle: async () => ({ data: matching()[0] ?? null, error: null }),
        then(resolve: (v: { data: Row[] | null; error: null }) => unknown) {
          if (op === "update" && payload) {
            for (const r of matching()) Object.assign(r, payload);
            writes.push({ table, op, row: payload });
            return Promise.resolve(resolve({ data: null, error: null }));
          }
          if (op === "upsert" && payload) {
            rows.push(payload);
            writes.push({ table, op, row: payload });
            return Promise.resolve(resolve({ data: null, error: null }));
          }
          return Promise.resolve(resolve({ data: matching(), error: null }));
        },
      };
      return builder;
    },
  };
  return { client, writes, tables };
}

describe("mileageTripRow", () => {
  it("works the km out from the odometer when only the readings are given", () => {
    const r = mileageTripRow("u", { tripDate: "2026-10-18", description: "Showing, 12 Elm St", odometerStart: 45_210.4, odometerEnd: 45_233.9 });
    expect(r.ok && r.value.km).toBe(23.5);
    expect(r.ok && r.value.odometer_start).toBe(45_210.4);
  });

  it("refuses km that disagree with the odometer", () => {
    const r = mileageTripRow("u", { tripDate: "2026-10-18", description: "Showing", km: 40, odometerStart: 100, odometerEnd: 120 });
    expect(r.ok).toBe(false);
  });

  it("stores CRA's allowance rate for the trip's year", () => {
    const y2026 = mileageTripRow("u", { tripDate: "2026-03-01", description: "Board office", km: 10 });
    const y2025 = mileageTripRow("u", { tripDate: "2025-03-01", description: "Board office", km: 10 });
    expect(y2026.ok && y2026.value.cra_rate_per_km).toBe(0.73);
    expect(y2025.ok && y2025.value.cra_rate_per_km).toBe(0.72);
  });

  it("sends vehicle and odometer columns only when they are set", () => {
    const r = mileageTripRow("u", { tripDate: "2026-03-01", description: "Board office", km: 10 });
    expect(r.ok && Object.keys(r.value)).not.toContain("vehicle_id");
    expect(r.ok && Object.keys(r.value)).not.toContain("odometer_start");
  });

  it("needs a description and a distance", () => {
    expect(mileageTripRow("u", { tripDate: "2026-03-01", description: " ", km: 10 }).ok).toBe(false);
    expect(mileageTripRow("u", { tripDate: "2026-03-01", description: "x" }).ok).toBe(false);
    expect(mileageTripRow("u", { tripDate: "2026-3-1", description: "x", km: 5 }).ok).toBe(false);
  });
});

describe("periods, the default vehicle and readings", () => {
  it("a refused period adds no vehicle", async () => {
    const db = fakeClient({ vehicles: [], vehicle_logbook_periods: [] });
    expect((await startLogbookPeriod(db.client, "u", { kind: "base", startDate: "2026-11-15" })).ok).toBe(false);
    expect(db.tables.vehicles).toHaveLength(0);
  });

  it("adds 'My vehicle' once, the first time a vehicle is needed", async () => {
    const db = fakeClient({ vehicles: [] });
    const first = await ensureDefaultVehicle(db.client, "u");
    const second = await ensureDefaultVehicle(db.client, "u");
    expect(first.ok && second.ok && first.value === second.value).toBe(true);
    expect(db.tables.vehicles).toHaveLength(1);
    expect(db.tables.vehicles[0].name).toBe(DEFAULT_VEHICLE_NAME);
  });

  it("starts a base year with its end date worked out", async () => {
    const db = fakeClient({ vehicles: [{ id: "car", user_id: "u", name: "Car", is_active: true, created_at: "2026-01-01" }], vehicle_logbook_periods: [] });
    const r = await startLogbookPeriod(db.client, "u", { kind: "base", startDate: "2026-11-01", odometerStart: 45_000 });
    expect(r.ok).toBe(true);
    expect(db.tables.vehicle_logbook_periods[0]).toMatchObject({ vehicle_id: "car", kind: "base", start_date: "2026-11-01", end_date: "2027-10-31", odometer_start: 45_000 });
  });

  it("refuses a period that is not on the 1st, overlaps, or is a sample with no base year before it", async () => {
    const db = fakeClient({
      vehicles: [
        { id: "car", user_id: "u", name: "Car", is_active: true, created_at: "2026-01-01" },
        { id: "truck", user_id: "u", name: "Truck", is_active: true, created_at: "2026-02-01" },
      ],
      vehicle_logbook_periods: [{ id: "p1", user_id: "u", vehicle_id: "car", kind: "base", start_date: "2026-11-01", end_date: "2027-10-31" }],
    });
    expect((await startLogbookPeriod(db.client, "u", { kind: "base", startDate: "2026-11-15" })).ok).toBe(false);
    const someoneElses = await startLogbookPeriod(db.client, "u", { vehicleId: "not-mine", kind: "base", startDate: "2027-01-01" });
    expect(someoneElses.ok === false && someoneElses.error).toMatch(/not found/);
    const overlap = await startLogbookPeriod(db.client, "u", { kind: "sample", startDate: "2027-04-01" });
    expect(overlap.ok === false && overlap.error).toMatch(/overlaps/);
    const noBase = await startLogbookPeriod(db.client, "u", { vehicleId: "truck", kind: "sample", startDate: "2028-04-01" });
    expect(noBase.ok === false && noBase.error).toMatch(/base year/);
  });

  it("puts a period's start and end readings on the period, and a month end in readings", async () => {
    const db = fakeClient({
      vehicle_logbook_periods: [{ id: "p1", user_id: "u", vehicle_id: "car", kind: "base", start_date: "2026-11-01", end_date: "2027-10-31", odometer_start: null, odometer_end: null }],
      vehicle_odometer_readings: [],
    });
    expect((await recordOdometerReading(db.client, "u", { kind: "period_start", vehicleId: "car", periodId: "p1", km: 45_000 })).ok).toBe(true);
    expect(db.tables.vehicle_logbook_periods[0].odometer_start).toBe(45_000);
    expect((await recordOdometerReading(db.client, "u", { kind: "month_end", vehicleId: "car", date: "2026-11-30", km: 46_210 })).ok).toBe(true);
    expect(db.tables.vehicle_odometer_readings[0]).toMatchObject({ vehicle_id: "car", reading_date: "2026-11-30", odometer_km: 46_210 });
    const backwards = await recordOdometerReading(db.client, "u", { kind: "period_end", vehicleId: "car", periodId: "p1", km: 44_000 });
    expect(backwards.ok).toBe(false);
  });
});
