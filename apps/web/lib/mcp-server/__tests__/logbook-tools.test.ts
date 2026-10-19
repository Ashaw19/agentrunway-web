/**
 * The MCP server's vehicle logbook tools (2026-10-18).
 *
 * Until this date the vehicle business-use share behind every MCP figure was
 * the typed setting (`user_settings.vehicle_business_use_pct`), and
 * get_mileage_summary reported `total_deduction`: the stored km × the per-km
 * rate saved on each trip (2025's $0.72 whatever the year), described as the
 * "CRA deduction amount". That rate is CRA's reasonable per-km ALLOWANCE an
 * employer can pay an employee, a benchmark, not the T2125 motor vehicle
 * deduction (the business part of the vehicle's actual costs).
 *
 * What these prove, on the real handlers (tool-harness.ts) and made-up rows:
 *   1. get_logbook_status works CRA's example out the way CRA does:
 *      base year 2025, 11,760 of 24,000 km = 49%; April to June 2025 46%;
 *      an April to June 2026 sample of 51%; (51% ÷ 46%) × 49% = 54%, within
 *      39% to 59%. It lists the odometer readings due.
 *   2. get_mileage_summary has no deduction figure: the allowance-rate
 *      benchmark is km × CRA's rates for the year, labelled as such, beside
 *      the year's vehicle share. A year of more than 1,000 trips is read whole.
 *   3. The write tools call core's shared writers: log_mileage takes the km
 *      from the odometer, start_logbook_period refuses a start that is not
 *      the 1st (and adds no vehicle first), record_odometer_reading lands on
 *      the right row.
 *   4. get_hst_status, get_dashboard_kpis and get_tax_estimate take the
 *      logbook's share when it covers the year, and the declared one when it
 *      does not (or cannot be read).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  allowanceRateFigure,
  vehicleBusinessUseFor,
  type LogbookRows,
} from "@agent-runway/core/engines/vehicle-logbook-engine";
import {
  ALLOWANCE_RATE_NOTE,
  CRA_MOTOR_VEHICLE_SOURCES,
  SIMPLIFIED_LOGBOOK_FORMULA,
  SIMPLIFIED_LOGBOOK_RANGE_RULE,
  SIMPLIFIED_LOGBOOK_RULE,
} from "@agent-runway/core/tax-copy/cra-rules";
import { CANONICAL_TAX_DISCLAIMER_SHORT } from "../../../supabase/functions/mcp-server/lib/constants";
import { readRegisteredTools } from "./registry-source";
import { callTool, fakeSupabase, loadTools, type FakeSupabase, type LoadedTool, type Row } from "./tool-harness";

const USER = "user-under-test";
const OTHER = "someone-else";

/** Noon Atlantic on Sunday 18 Oct 2026. */
const OCT_18 = new Date("2026-10-18T15:00:00Z");

// ── Fixtures ───────────────────────────────────────────────────────────────

function settingsRow(vehiclePct = 0.8): Row {
  return {
    user_id: USER,
    province: "newBrunswick",
    gst_hst_registered: true,
    vehicle_business_use_pct: vehiclePct,
    home_office_business_use_pct: 0,
    brokerage_withholds_hst: false,
    filing_frequency: "quarterly",
    business_number: null,
    goal_gci: 0,
    split_preset: "p100_0",
  };
}

function vehicle(id: string, user = USER, created = "2024-06-01T12:00:00Z"): Row {
  return { id, user_id: user, name: id === "car" ? "Crossover" : `Vehicle ${id}`, model_year: 2022, make: "Mazda", model: "CX-5", is_active: true, created_at: created, updated_at: created };
}

function period(id: string, kind: "base" | "sample", start: string, end: string, odoStart: number | null, odoEnd: number | null, vehicleId = "car"): Row {
  return { id, user_id: USER, vehicle_id: vehicleId, kind, start_date: start, end_date: end, odometer_start: odoStart, odometer_end: odoEnd, notes: null, created_at: "2025-01-01T12:00:00Z", updated_at: "2025-01-01T12:00:00Z" };
}

function reading(date: string, km: number, vehicleId = "car"): Row {
  return { id: `r-${vehicleId}-${date}`, user_id: USER, vehicle_id: vehicleId, reading_date: date, odometer_km: km, created_at: "2025-01-01T12:00:00Z", updated_at: "2025-01-01T12:00:00Z" };
}

/** A mileage_logs row, with the stored `deduction` column that no output may carry. */
function trip(date: string, km: number, vehicleId: string | null = "car", user = USER, extra: Row = {}): Row {
  return {
    id: `t-${user}-${date}-${km}`, user_id: user, trip_date: date, description: "Showing", from_location: "Office", to_location: "12 Main St",
    km, cra_rate_per_km: 0.72, deduction: Math.round(km * 0.72 * 100) / 100, purpose: "Showing", notes: null,
    vehicle_id: vehicleId, odometer_start: null, odometer_end: null, ...extra,
  };
}

/**
 * CRA's example (made-up rows). Base year, calendar 2025, odometer 10,000 to
 * 34,000:
 *   Q1  2,600 business            Q2  5,000 km, 2,300 business (46%)
 *   Q3  3,510 business            Q4  3,350 business
 *   Year 24,000 km, 11,760 business = 49%
 * The odometer at the end of Mar 31 and Jun 30, 2025 gives Q2's 5,000 km.
 * Sample, April to June 2026: odometer 40,000 to 46,000, 3,060 business = 51%.
 * The Jan 15 trip has no vehicle (logged before vehicles existed): it counts
 * for the default vehicle, the car.
 */
function craExample(): Record<string, Row[]> {
  return {
    user_settings: [settingsRow(0.8), { ...settingsRow(0.3), user_id: OTHER }],
    vehicles: [vehicle("car"), vehicle("their-car", OTHER)],
    vehicle_logbook_periods: [
      period("base-2025", "base", "2025-01-01", "2025-12-31", 10_000, 34_000),
      period("sample-2026", "sample", "2026-04-01", "2026-06-30", 40_000, 46_000),
    ],
    vehicle_odometer_readings: [reading("2025-03-31", 15_000), reading("2025-06-30", 20_000)],
    mileage_logs: [
      trip("2025-01-15", 1_600, null), trip("2025-03-02", 1_000),
      trip("2025-04-10", 1_000), trip("2025-06-20", 1_300),
      trip("2025-08-01", 3_510),
      trip("2025-11-11", 3_350),
      trip("2026-04-03", 1_500), trip("2026-05-19", 1_000),
      trip("2026-06-30", 560, "car", USER, { odometer_start: 45_440, odometer_end: 46_000 }),
      // Another account's: never counted.
      trip("2026-05-01", 9_999, "their-car", OTHER),
    ],
  };
}

/** One fuel receipt this year: $230 with $30 HST. A registrant claims the vehicle share of the $30. */
function withFuelReceipt(tables: Record<string, Row[]>): Record<string, Row[]> {
  return {
    ...tables,
    receipt_expenses: [{ user_id: USER, expense_date: "2026-07-04", category_key: "vehicle_fuel", total_amount: 230, tax_amount: 30 }],
    transactions: [
      { user_id: USER, status: "closed", date: "2026-03-10", sale_price: 400_000, commission_pct: 0.025, gci_override: null, team_split_pct: null, commission_paid_date: null },
    ],
  };
}

/** An account that has never kept a logbook. */
function noLogbook(vehiclePct = 0.8): Record<string, Row[]> {
  return { user_settings: [settingsRow(vehiclePct)] };
}

type Status = {
  disclaimer: string;
  year: number;
  vehicles: Array<{ id: string; name: string; is_default: boolean }>;
  business_use: { pct: number; method: string; label: string; declared_pct: number; logbook_pct: number | null; notes: string[] };
  by_vehicle: Array<{ vehicle_id: string; method: string | null; pct: number | null; business_km: number; total_km: number | null; reason: string | null }>;
  ten_percent_test: null | {
    sample_pct: number; base_same_period_pct: number; base_annual_pct: number; calculated_pct: number;
    lower_pct: number; upper_pct: number; passed: boolean;
    sample_period: { start: string; end: string }; base_year: { start: string; end: string };
  };
  progress: Array<{ period_id: string; kind: string; months_logged: number; complete: boolean; so_far: null | { through: string; pct: number }; label: string }>;
  readings_due: Array<{ kind: string; vehicle_id: string; period_id: string; date: string; label: string }>;
  cra_rule: { simplified: string; formula: string; range: string; outside_range?: string; source: { label: string; url: string } };
};

type Mileage = {
  disclaimer: string;
  year: number;
  total_km: number;
  trip_count: number;
  vehicle_business_use: { pct: number; method: string; label: string };
  allowance_rate_figure: number;
  allowance_rates_year: number;
  allowance_rate_note: string;
  trips?: Array<Record<string, unknown>>;
};

const logbookTools = (db: FakeSupabase) => loadTools("logbook.ts", "getLogbookTools", db, USER);
const expenseTools = (db: FakeSupabase) => loadTools("expenses.ts", "getExpenseTools", db, USER);
const analyticsTools = (db: FakeSupabase) => loadTools("analytics.ts", "getAnalyticsTools", db, USER);

/** The tool's result as returned: a refusal is plain text with isError. */
async function callRaw(tools: LoadedTool[], name: string, args: Record<string, unknown> = {}) {
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`tool "${name}" is not registered`);
  return tool.handler(args);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(OCT_18);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ── get_logbook_status ─────────────────────────────────────────────────────

describe("get_logbook_status — CRA's simplified logbook example", () => {
  it("2026: (51% ÷ 46%) × 49% = 54%, by CRA's simplified method", async () => {
    const out = await callTool<Status>(await logbookTools(fakeSupabase(craExample())), "get_logbook_status");

    expect(out.year).toBe(2026);
    expect(out.business_use).toMatchObject({ method: "simplified", pct: 54.3, declared_pct: 80, logbook_pct: 54.3 });
    expect(out.business_use.label).toBe("54.3%, computed from the logbook by CRA's simplified method");
    expect(Math.round(out.business_use.pct)).toBe(54);
    expect(out.ten_percent_test).toMatchObject({
      sample_pct: 51,
      base_same_period_pct: 46,
      base_annual_pct: 49,
      calculated_pct: 54.3,
      lower_pct: 39,
      upper_pct: 59,
      passed: true,
      sample_period: { start: "2026-04-01", end: "2026-06-30" },
      base_year: { start: "2025-01-01", end: "2025-12-31" },
    });
    expect(out.by_vehicle).toEqual([
      { vehicle_id: "car", vehicle_name: "Crossover", method: "simplified", pct: 54.3, business_km: 3_060, total_km: 6_000, reason: null },
    ]);
    // Nothing is due: both periods are finished, with their readings.
    expect(out.readings_due).toEqual([]);
    expect(out.progress).toEqual([
      expect.objectContaining({ period_id: "sample-2026", kind: "sample", complete: true, label: "Sample period (Apr 2026 to Jun 2026): complete" }),
    ]);
  });

  it("is the engine's own figure over the same rows", async () => {
    const tables = craExample();
    const out = await callTool<Status>(await logbookTools(fakeSupabase(tables)), "get_logbook_status");
    const own = (t: string) => tables[t].filter((r) => r.user_id === USER);
    const str = (v: unknown) => String(v);
    const numOrNull = (v: unknown) => (v == null ? null : Number(v));
    const rows: LogbookRows = {
      vehicles: own("vehicles").map((v) => ({ id: str(v.id), name: str(v.name), is_active: v.is_active === true, created_at: str(v.created_at) })),
      periods: own("vehicle_logbook_periods").map((p) => ({
        id: str(p.id), vehicle_id: str(p.vehicle_id), kind: p.kind === "base" ? "base" : "sample",
        start_date: str(p.start_date), end_date: str(p.end_date),
        odometer_start: numOrNull(p.odometer_start), odometer_end: numOrNull(p.odometer_end),
      })),
      readings: own("vehicle_odometer_readings").map((r) => ({ vehicle_id: str(r.vehicle_id), reading_date: str(r.reading_date), odometer_km: Number(r.odometer_km) })),
      trips: own("mileage_logs").map((t) => ({ trip_date: str(t.trip_date), km: Number(t.km), vehicle_id: t.vehicle_id == null ? null : str(t.vehicle_id) })),
    };
    const engine = vehicleBusinessUseFor({ vehicle_business_use_pct: 0.8 }, rows, 2026, "2026-10-18");
    expect(engine.pct).toBeCloseTo((0.51 / 0.46) * 0.49, 4);
    expect(out.business_use.pct).toBe(Math.round(engine.pct * 1000) / 10);
    expect(out.business_use.label).toBe(engine.label);
  });

  it("2025, the base year itself: the full logbook's 11,760 of 24,000 km = 49%", async () => {
    const out = await callTool<Status>(await logbookTools(fakeSupabase(craExample())), "get_logbook_status", { year: 2025 });
    expect(out.business_use).toMatchObject({ method: "full", pct: 49 });
    expect(out.business_use.label).toBe("49%, computed from the 2025 logbook");
    // The trip logged with no vehicle counts for the default vehicle.
    expect(out.by_vehicle[0]).toMatchObject({ vehicle_id: "car", business_km: 11_760, total_km: 24_000 });
    expect(out.ten_percent_test).toBeNull();
  });

  it("states CRA's rule, formula and range, with the source and the disclaimer", async () => {
    const out = await callTool<Status>(await logbookTools(fakeSupabase(craExample())), "get_logbook_status");
    expect(out.cra_rule).toMatchObject({
      simplified: SIMPLIFIED_LOGBOOK_RULE,
      formula: SIMPLIFIED_LOGBOOK_FORMULA,
      range: SIMPLIFIED_LOGBOOK_RANGE_RULE,
      source: CRA_MOTOR_VEHICLE_SOURCES.records,
    });
    expect(out.cra_rule.source.url).toMatch(/^https:\/\/www\.canada\.ca\//);
    // The outside-the-range rule only when the test failed.
    expect(out.cra_rule).not.toHaveProperty("outside_range");
    expect(out.disclaimer).toBe(CANONICAL_TAX_DISCLAIMER_SHORT);
  });

  it("lists the agent's own vehicles only, the default one marked", async () => {
    const out = await callTool<Status>(await logbookTools(fakeSupabase(craExample())), "get_logbook_status");
    expect(out.vehicles).toEqual([
      expect.objectContaining({ id: "car", name: "Crossover", is_default: true }),
    ]);
  });

  it("no logbook: the declared setting, labelled as declared, and no 10% test", async () => {
    const out = await callTool<Status>(await logbookTools(fakeSupabase(noLogbook(0.65))), "get_logbook_status");
    expect(out.business_use).toMatchObject({ method: "declared", pct: 65, declared_pct: 65, logbook_pct: null });
    expect(out.business_use.label).toBe("65%, declared in Settings (not computed from a logbook)");
    expect(out.ten_percent_test).toBeNull();
    expect(out.vehicles).toEqual([]);
    expect(out.readings_due).toEqual([]);
  });

  it("a base year under way: the readings due, its progress, and the declared share until it is finished", async () => {
    // Base year 2026 from 50,000 km, month ends read through March; 1,200 of
    // the 3,000 km to Mar 31 were business (40% so far, shown, not applied).
    const tables: Record<string, Row[]> = {
      user_settings: [settingsRow(0.8)],
      vehicles: [vehicle("car")],
      vehicle_logbook_periods: [period("base-2026", "base", "2026-01-01", "2026-12-31", 50_000, null)],
      vehicle_odometer_readings: [reading("2026-01-31", 51_000), reading("2026-02-28", 52_000), reading("2026-03-31", 53_000)],
      mileage_logs: [trip("2026-01-20", 500), trip("2026-03-05", 700), trip("2026-08-01", 400)],
    };
    const out = await callTool<Status>(await logbookTools(fakeSupabase(tables)), "get_logbook_status");

    expect(out.business_use).toMatchObject({ method: "declared", pct: 80 });
    expect(out.readings_due.map((r) => [r.kind, r.date])).toEqual([
      ["month_end", "2026-04-30"], ["month_end", "2026-05-31"], ["month_end", "2026-06-30"],
      ["month_end", "2026-07-31"], ["month_end", "2026-08-31"], ["month_end", "2026-09-30"],
    ]);
    expect(out.readings_due[0]).toEqual({
      kind: "month_end", vehicle_id: "car", vehicle_name: "Crossover", period_id: "base-2026",
      date: "2026-04-30", label: "Odometer at the end of Apr 30, 2026",
    });
    expect(out.progress[0]).toMatchObject({
      period_id: "base-2026", months_logged: 3, complete: false,
      so_far: { through: "2026-03-31", pct: 40 },
      label: "Base year (Jan 2026 to Dec 2026): 3 of 12 months logged",
    });

    // A due reading saved through record_odometer_reading comes off the list.
    const db = fakeSupabase(tables);
    const tools = await logbookTools(db);
    const saved = await callRaw(tools, "record_odometer_reading", { kind: "month_end", vehicle_id: "car", date: "2026-04-30", km: 54_000 });
    expect(saved.isError).toBeUndefined();
    const after = await callTool<Status>(tools, "get_logbook_status");
    expect(after.readings_due.map((r) => r.date)).toEqual(["2026-05-31", "2026-06-30", "2026-07-31", "2026-08-31", "2026-09-30"]);
    expect(after.progress[0]).toMatchObject({ months_logged: 4 });
  });

  it("a sample more than 10 points from the base year: the declared share, and CRA's rule for that case", async () => {
    // The same base year; a 2026 sample at 90% business: (90 ÷ 46) × 49 = 95.9%.
    const tables = craExample();
    tables.mileage_logs = tables.mileage_logs
      .filter((t) => !String(t.trip_date).startsWith("2026"))
      .concat([trip("2026-05-01", 5_400)]);
    const out = await callTool<Status>(await logbookTools(fakeSupabase(tables)), "get_logbook_status");
    expect(out.business_use.method).toBe("declared");
    expect(out.ten_percent_test).toMatchObject({ sample_pct: 90, passed: false });
    expect(out.cra_rule.outside_range).toMatch(/^Per CRA, when the calculated annual business use/);
  });

  it("reads the logbook in pages, the agent's rows only", async () => {
    const db = fakeSupabase(craExample());
    await callTool(await logbookTools(db), "get_logbook_status");
    for (const table of ["vehicles", "vehicle_logbook_periods", "vehicle_odometer_readings", "mileage_logs"]) {
      const [q] = db.queriesFor(table);
      expect(q.filters, table).toContain(`eq(user_id,${USER})`);
      expect(q.range, table).toEqual([0, 999]);
    }
  });

  it("a failed logbook read is an error, not an empty logbook", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const db = fakeSupabase(craExample(), { failTables: ["vehicle_logbook_periods"] });
    await expect(callTool(await logbookTools(db), "get_logbook_status")).rejects.toThrow(/logbook read failed/);
  });
});

// ── get_mileage_summary ────────────────────────────────────────────────────

describe("get_mileage_summary — km × CRA's allowance rates is a benchmark, never a deduction", () => {
  it("the description and the output carry no deduction figure", async () => {
    const tools = await expenseTools(fakeSupabase(craExample()));
    const tool = tools.find((t) => t.name === "get_mileage_summary")!;
    expect(tool.description).not.toMatch(/deduction amount/i);
    expect(tool.description).not.toMatch(/deduction/i);

    const out = await callTool<Mileage>(tools, "get_mileage_summary", { include_trips: true });
    const keys = JSON.stringify(out).match(/"[a-z_]+":/g) ?? [];
    expect(keys).not.toContain('"deduction":');
    expect(keys).not.toContain('"total_deduction":');
    expect(out).not.toHaveProperty("cra_rate_per_km");
    // The only "deduction" in the text is CRA's note saying what the figure is NOT.
    const { allowance_rate_note: note, ...rest } = out;
    expect(note).toBe(ALLOWANCE_RATE_NOTE);
    expect(JSON.stringify(rest)).not.toMatch(/deduction/i);
  });

  it("2026: 3,060 km at CRA's 2026 rate ($0.73/km under 5,000 km), beside the logbook's 54% share", async () => {
    const out = await callTool<Mileage>(await expenseTools(fakeSupabase(craExample())), "get_mileage_summary");
    expect(out).toMatchObject({ year: 2026, total_km: 3_060, trip_count: 3, allowance_rates_year: 2026 });
    expect(out.allowance_rate_figure).toBe(2_233.8); // 3,060 × 0.73
    expect(out.allowance_rate_figure).toBe(Math.round(allowanceRateFigure(3_060, 2026).amount * 100) / 100);
    expect(out.vehicle_business_use).toEqual({
      pct: 54.3, method: "simplified", label: "54.3%, computed from the logbook by CRA's simplified method",
    });
    expect(out.disclaimer).toBe(CANONICAL_TAX_DISCLAIMER_SHORT);
  });

  it("2025: the lower rate after 5,000 km, at 2025's rates, and the full logbook's 49%", async () => {
    const out = await callTool<Mileage>(await expenseTools(fakeSupabase(craExample())), "get_mileage_summary", { year: 2025 });
    // 5,000 × 0.72 + 6,760 × 0.66 = 3,600 + 4,461.60
    expect(out).toMatchObject({ total_km: 11_760, allowance_rate_figure: 8_061.6, allowance_rates_year: 2025 });
    expect(out.vehicle_business_use).toMatchObject({ pct: 49, method: "full" });
  });

  it("a year CRA has not published rates for uses the latest year's, and says which", async () => {
    const out = await callTool<Mileage>(await expenseTools(fakeSupabase(craExample())), "get_mileage_summary", { year: 2027 });
    expect(out).toMatchObject({ year: 2027, total_km: 0, allowance_rate_figure: 0, allowance_rates_year: 2026 });
  });

  it("no logbook: the declared share", async () => {
    const tables = { ...noLogbook(0.6), mileage_logs: [trip("2026-02-02", 100)] };
    const out = await callTool<Mileage>(await expenseTools(fakeSupabase(tables)), "get_mileage_summary");
    expect(out.vehicle_business_use).toEqual({ pct: 60, method: "declared", label: "60%, declared in Settings (not computed from a logbook)" });
  });

  it("trips: newest first, with the vehicle and odometer, and never the stored deduction", async () => {
    const db = fakeSupabase(craExample());
    const out = await callTool<Mileage>(await expenseTools(db), "get_mileage_summary", { include_trips: true });
    expect(out.trips?.map((t) => t.date)).toEqual(["2026-06-30", "2026-05-19", "2026-04-03"]);
    expect(out.trips?.[0]).toEqual({
      date: "2026-06-30", description: "Showing", from_location: "Office", to_location: "12 Main St",
      km: 560, purpose: "Showing", vehicle_id: "car", odometer_start: 45_440, odometer_end: 46_000,
    });
    const own = db.queriesFor("mileage_logs").filter((q) => q.columns.includes("description"));
    expect(own).toHaveLength(1);
    expect(own[0].columns).not.toMatch(/\bdeduction\b/);
    expect(own[0].filters).toEqual([`eq(user_id,${USER})`, "gte(trip_date,2026-01-01)", "lte(trip_date,2026-12-31)"]);
  });

  it("a year of 2,500 trips is read whole, a page of 1,000 at a time", async () => {
    const trips = Array.from({ length: 2_500 }, (_, i) =>
      trip(`2026-${String(1 + (i % 12)).padStart(2, "0")}-${String(1 + (i % 28)).padStart(2, "0")}`, 1, "car", USER, { id: `bulk-${i}` }),
    );
    const db = fakeSupabase({ ...noLogbook(), mileage_logs: trips });
    // The harness caps a response at 1,000 rows, as PostgREST does.
    expect(((await db.client.from("mileage_logs").select("id")).data as Row[]).length).toBe(1_000);

    const out = await callTool<Mileage>(await expenseTools(db), "get_mileage_summary");
    expect(out).toMatchObject({ total_km: 2_500, trip_count: 2_500 });
    const pages = db.queriesFor("mileage_logs").filter((q) => q.columns.includes("description")).map((q) => q.range);
    expect(pages).toEqual([[0, 999], [1_000, 1_999], [2_000, 2_999]]);
  });

  it("refuses a year that is not one", async () => {
    const res = await callRaw(await expenseTools(fakeSupabase(craExample())), "get_mileage_summary", { year: 26.5 });
    expect(res.isError).toBe(true);
  });
});

// ── log_mileage ────────────────────────────────────────────────────────────

describe("log_mileage — core's trip writer", () => {
  it("odometer readings only: the km are the difference, saved with CRA's rate for the trip's year", async () => {
    const db = fakeSupabase(craExample());
    const res = await callRaw(await logbookTools(db), "log_mileage", {
      trip_date: "2026-10-17", description: "Showing at 12 Main St", odometer_start: 51_234.5, odometer_end: 51_277, vehicle_id: "car",
    });
    expect(res.isError).toBeUndefined();
    expect(JSON.parse(res.content[0].text)).toMatchObject({ saved: "trip", trip_date: "2026-10-17", km: 42.5, km_from: "odometer", vehicle_id: "car" });

    const writes = db.writesTo("mileage_logs");
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ op: "insert" });
    expect(writes[0].rows[0]).toMatchObject({
      user_id: USER, trip_date: "2026-10-17", description: "Showing at 12 Main St",
      km: 42.5, odometer_start: 51_234.5, odometer_end: 51_277, vehicle_id: "car", cra_rate_per_km: 0.73,
    });

    // The saved trip is in the year's summary.
    const summary = await callTool<Mileage>(await expenseTools(db), "get_mileage_summary");
    expect(summary.total_km).toBe(3_060 + 42.5);
  });

  it("no date: today, Atlantic time; no vehicle: none sent (the trip counts for the default vehicle)", async () => {
    const db = fakeSupabase(craExample());
    const res = await callRaw(await logbookTools(db), "log_mileage", { description: "Open house", km: 18 });
    expect(JSON.parse(res.content[0].text)).toMatchObject({ trip_date: "2026-10-18", km: 18, km_from: "km given", vehicle_id: null });
    expect(db.writesTo("mileage_logs")[0].rows[0]).not.toHaveProperty("vehicle_id", expect.anything());
  });

  it("km that disagree with the odometer, no description, or another account's vehicle: refused, nothing saved", async () => {
    const db = fakeSupabase(craExample());
    const tools = await logbookTools(db);
    const disagree = await callRaw(tools, "log_mileage", { trip_date: "2026-10-17", description: "Showing", km: 10, odometer_start: 100, odometer_end: 142.5 });
    expect(disagree).toMatchObject({ isError: true });
    expect(disagree.content[0].text).toMatch(/do not agree/);

    const noDescription = await callRaw(tools, "log_mileage", { trip_date: "2026-10-17", km: 10 });
    expect(noDescription).toMatchObject({ isError: true });

    const theirs = await callRaw(tools, "log_mileage", { trip_date: "2026-10-17", description: "Showing", km: 10, vehicle_id: "their-car" });
    expect(theirs).toMatchObject({ isError: true });
    expect(theirs.content[0].text).toMatch(/not one of the agent's vehicles/);

    expect(db.writes).toEqual([]);
  });

  it("a failed save is the writer's error, with isError", async () => {
    const db = fakeSupabase(craExample(), { failWrites: ["mileage_logs"] });
    const res = await callRaw(await logbookTools(db), "log_mileage", { trip_date: "2026-10-17", description: "Showing", km: 10 });
    expect(res).toMatchObject({ isError: true });
    // record-writers' writeMileage words it ("Couldn't log the trip: ...").
    expect(res.content[0].text).toBe("Couldn't log the trip: simulated write failure on mileage_logs.");
  });
});

// ── start_logbook_period ───────────────────────────────────────────────────

describe("start_logbook_period — core's period writer", () => {
  it("refuses a start that is not the 1st of a month, before adding any vehicle", async () => {
    const db = fakeSupabase(noLogbook(), { columnDefaults: { vehicles: { is_active: true } } });
    const res = await callRaw(await logbookTools(db), "start_logbook_period", { kind: "base", start_date: "2026-11-15" });
    expect(res).toMatchObject({ isError: true });
    expect(res.content[0].text).toBe("A logbook period starts on the 1st of a month.");
    expect(db.writes).toEqual([]);

    const notADate = await callRaw(await logbookTools(db), "start_logbook_period", { kind: "sample", start_date: "next month" });
    expect(notADate.content[0].text).toBe("Dates are YYYY-MM-DD.");
    const badKind = await callRaw(await logbookTools(db), "start_logbook_period", { kind: "quarter", start_date: "2026-11-01" });
    expect(badKind).toMatchObject({ isError: true });
    expect(db.writes).toEqual([]);
  });

  it("a base year: 12 months from the 1st, the end date worked out", async () => {
    const db = fakeSupabase(craExample());
    const res = await callRaw(await logbookTools(db), "start_logbook_period", {
      kind: "base", start_date: "2027-01-01", vehicle_id: "car", odometer_start: 60_000,
    });
    expect(res.isError).toBeUndefined();
    const out = JSON.parse(res.content[0].text);
    expect(out).toMatchObject({ started: "base year", vehicle_id: "car", start_date: "2027-01-01", end_date: "2027-12-31", odometer_start: 60_000 });
    expect(out.disclaimer).toBe(CANONICAL_TAX_DISCLAIMER_SHORT);
    expect(db.writesTo("vehicle_logbook_periods")[0].rows[0]).toMatchObject({
      user_id: USER, vehicle_id: "car", kind: "base", start_date: "2027-01-01", end_date: "2027-12-31", odometer_start: 60_000, notes: null,
    });
  });

  it("an agent with no vehicle: the default one is added once, then the period", async () => {
    const db = fakeSupabase(noLogbook(), { columnDefaults: { vehicles: { is_active: true } } });
    const res = await callRaw(await logbookTools(db), "start_logbook_period", { kind: "base", start_date: "2026-11-01" });
    expect(res.isError).toBeUndefined();
    expect(db.writes.map((w) => [w.table, w.op])).toEqual([["vehicles", "insert"], ["vehicle_logbook_periods", "insert"]]);
    const vehicleId = db.writesTo("vehicles")[0].rows[0].id;
    expect(db.writesTo("vehicles")[0].rows[0]).toMatchObject({ user_id: USER, name: "My vehicle" });
    expect(JSON.parse(res.content[0].text)).toMatchObject({ vehicle_id: vehicleId, end_date: "2027-10-31" });
  });

  it("the writer's rules: a sample with no base year before it, or an overlap, is refused", async () => {
    const db = fakeSupabase({ ...noLogbook(), vehicles: [vehicle("car")] });
    const sample = await callRaw(await logbookTools(db), "start_logbook_period", { kind: "sample", start_date: "2026-11-01", vehicle_id: "car" });
    expect(sample).toMatchObject({ isError: true });
    expect(sample.content[0].text).toMatch(/simplified method compares a sample period with a base year/);

    const overlap = await callRaw(await logbookTools(fakeSupabase(craExample())), "start_logbook_period", { kind: "base", start_date: "2026-06-01", vehicle_id: "car" });
    expect(overlap.content[0].text).toMatch(/overlaps this vehicle's/);
    expect(db.writes).toEqual([]);
  });
});

// ── record_odometer_reading ────────────────────────────────────────────────

describe("record_odometer_reading — core's reading writer", () => {
  const baseYear2026 = () => ({
    ...noLogbook(),
    vehicles: [vehicle("car"), vehicle("their-car", OTHER)],
    vehicle_logbook_periods: [period("base-2026", "base", "2026-01-01", "2026-12-31", 50_000, null)],
  });

  it("a month end: one reading per vehicle and day (upsert)", async () => {
    const db = fakeSupabase(baseYear2026());
    const res = await callRaw(await logbookTools(db), "record_odometer_reading", { kind: "month_end", vehicle_id: "car", date: "2026-04-30", km: 54_000.04 });
    expect(JSON.parse(res.content[0].text)).toMatchObject({ recorded: "month_end", odometer_km: 54_000, vehicle_id: "car", date: "2026-04-30" });
    expect(db.writesTo("vehicle_odometer_readings")).toEqual([
      expect.objectContaining({
        op: "upsert", onConflict: "vehicle_id,reading_date",
        rows: [expect.objectContaining({ user_id: USER, vehicle_id: "car", reading_date: "2026-04-30", odometer_km: 54_000 })],
      }),
    ]);
  });

  it("a period's end: saved on the period row", async () => {
    const db = fakeSupabase(baseYear2026());
    const res = await callRaw(await logbookTools(db), "record_odometer_reading", { kind: "period_end", period_id: "base-2026", km: 62_000 });
    expect(res.isError).toBeUndefined();
    expect(db.writesTo("vehicle_logbook_periods")).toEqual([
      expect.objectContaining({ op: "update", rows: [{ odometer_end: 62_000 }], filters: ["eq(id,base-2026)", `eq(user_id,${USER})`] }),
    ]);
    expect(db.tables.vehicle_logbook_periods[0]).toMatchObject({ odometer_start: 50_000, odometer_end: 62_000 });
  });

  it("refused, nothing saved: no period, an end below the start, a date that is not a month end, another account's vehicle", async () => {
    const db = fakeSupabase(baseYear2026());
    const tools = await logbookTools(db);
    const cases: Array<[Record<string, unknown>, RegExp]> = [
      [{ kind: "period_start", km: 49_000 }, /Which logbook period/],
      [{ kind: "period_end", period_id: "base-2026", km: 49_000 }, /at least the reading at its start/],
      [{ kind: "period_end", period_id: "not-mine", km: 70_000 }, /not found/],
      [{ kind: "month_end", vehicle_id: "car", date: "2026-04-15", km: 54_000 }, /last day of a month/],
      [{ kind: "month_end", date: "2026-04-30", km: 54_000 }, /vehicle_id/],
      [{ kind: "month_end", vehicle_id: "their-car", date: "2026-04-30", km: 54_000 }, /not one of the agent's vehicles/],
      [{ kind: "year_end", km: 54_000 }, /period_start, month_end or period_end/],
      [{ kind: "month_end", vehicle_id: "car", date: "2026-04-30", km: -5 }, /0 or more/],
    ];
    for (const [args, message] of cases) {
      const res = await callRaw(tools, "record_odometer_reading", args);
      expect(res, JSON.stringify(args)).toMatchObject({ isError: true });
      expect(res.content[0].text, JSON.stringify(args)).toMatch(message);
    }
    expect(db.writes).toEqual([]);
  });
});

// ── The share behind the tax figures ───────────────────────────────────────

/**
 * An 8% logbook: base year 2025, 800 of 10,000 km (April to June 200 of
 * 2,500); a 2026 sample of 200 of 2,500. (8 ÷ 8) × 8 = 8%. Per CRA's ITC
 * table a vehicle cost used 10% or less for business gets no ITC, so the
 * fuel receipt's $30 of HST stays in the expense.
 */
function eightPercentLogbook(): Record<string, Row[]> {
  return {
    user_settings: [settingsRow(0.8)],
    vehicles: [vehicle("car")],
    vehicle_logbook_periods: [
      period("base-2025", "base", "2025-01-01", "2025-12-31", 10_000, 20_000),
      period("sample-2026", "sample", "2026-04-01", "2026-06-30", 30_000, 32_500),
    ],
    vehicle_odometer_readings: [reading("2025-03-31", 12_500), reading("2025-06-30", 15_000)],
    mileage_logs: [trip("2025-02-01", 300), trip("2025-05-05", 200), trip("2025-10-10", 300), trip("2026-05-05", 200)],
  };
}

describe("get_hst_status, get_dashboard_kpis and get_tax_estimate take the logbook's share", () => {
  it("get_hst_status: the ITC on a $30 fuel HST is 54% of it with the logbook, 80% without", async () => {
    const withLogbook = await callTool(await analyticsTools(fakeSupabase(withFuelReceipt(craExample()))), "get_hst_status");
    const without = await callTool(await analyticsTools(fakeSupabase(withFuelReceipt(noLogbook(0.8)))), "get_hst_status");

    expect(withLogbook.itcs_paid_on_expenses).toBe(16); // 30 × 54.33% = 16.30
    expect(without.itcs_paid_on_expenses).toBe(24); //     30 × 80%
    expect(withLogbook.vehicle_business_use).toEqual({
      pct: 54.3, method: "simplified", label: "54.3%, computed from the logbook by CRA's simplified method",
    });
    expect(without.vehicle_business_use).toMatchObject({ pct: 80, method: "declared" });
    // Collected is the same: 10,000 GCI × 15%.
    expect(withLogbook.ytd_collected).toBe(1_500);
    expect(withLogbook.net_owing).toBe(1_484);
    expect(without.net_owing).toBe(1_476);
  });

  it("an 8% logbook: no ITC on the fuel, so its HST is an expense in the KPIs and the tax estimate", async () => {
    const tables = withFuelReceipt(eightPercentLogbook());
    const declared = withFuelReceipt(noLogbook(0.8));

    const hst = await callTool(await analyticsTools(fakeSupabase(tables)), "get_hst_status");
    expect(hst.vehicle_business_use).toMatchObject({ pct: 8, method: "simplified" });
    expect(hst.itcs_paid_on_expenses).toBe(0);

    const kpis = await callTool(await analyticsTools(fakeSupabase(tables)), "get_dashboard_kpis");
    const kpisDeclared = await callTool(await analyticsTools(fakeSupabase(declared)), "get_dashboard_kpis");
    expect(kpisDeclared.ytd_expenses).toBe(200); // 230 less the 30 of HST claimed back
    expect(kpis.ytd_expenses).toBe(230);

    const tax = await callTool(await analyticsTools(fakeSupabase(tables)), "get_tax_estimate");
    const taxDeclared = await callTool(await analyticsTools(fakeSupabase(declared)), "get_tax_estimate");
    expect((taxDeclared.projected_net_income as number) - (tax.projected_net_income as number)).toBe(30);
  });

  it("a logbook that does not cover the year changes nothing: the same figures as no logbook at all", async () => {
    // A base year under way in 2026 (not finished): the declared share applies.
    const underWay = withFuelReceipt({
      user_settings: [settingsRow(0.8)],
      vehicles: [vehicle("car")],
      vehicle_logbook_periods: [period("base-2026", "base", "2026-01-01", "2026-12-31", 50_000, null)],
      mileage_logs: [trip("2026-03-03", 400)],
    });
    const none = withFuelReceipt(noLogbook(0.8));
    for (const name of ["get_hst_status", "get_dashboard_kpis", "get_tax_estimate"]) {
      const a = await callTool(await analyticsTools(fakeSupabase(underWay)), name);
      const b = await callTool(await analyticsTools(fakeSupabase(none)), name);
      expect(a, name).toEqual(b);
    }
  });

  it("a logbook that cannot be read: the declared share, labelled declared, and the tools still answer", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const db = fakeSupabase(withFuelReceipt(craExample()), { failTables: ["vehicles"] });
    const hst = await callTool(await analyticsTools(db), "get_hst_status");
    expect(hst.itcs_paid_on_expenses).toBe(24);
    expect(hst.vehicle_business_use).toMatchObject({ pct: 80, method: "declared" });
  });

  it("the expense tools read the dashboard's logbook rows for the Atlantic year", async () => {
    const db = fakeSupabase(withFuelReceipt(craExample()));
    await callTool(await analyticsTools(db), "get_hst_status");
    const trips = db.queriesFor("mileage_logs");
    expect(trips).toHaveLength(1);
    expect(trips[0]).toMatchObject({
      columns: "id, trip_date, km, vehicle_id",
      // logbookTripRange: the year, and the base year before it.
      filters: [`eq(user_id,${USER})`, "gte(trip_date,2025-01-01)", "lte(trip_date,2026-12-31)"],
      range: [0, 999],
    });
  });
});

// ── The registry ───────────────────────────────────────────────────────────

describe("the logbook tools are registered with the right hints", () => {
  const registry = new Map(readRegisteredTools().map((t) => [t.name, t]));

  it("one read tool, three non-destructive write tools", () => {
    expect(registry.get("get_logbook_status")).toEqual({ name: "get_logbook_status", readOnly: true, destructive: false });
    for (const name of ["start_logbook_period", "log_mileage", "record_odometer_reading"]) {
      expect(registry.get(name), name).toEqual({ name, readOnly: false, destructive: false });
    }
  });

  it("no tool description or logbook output gives tax advice", async () => {
    const tools = [...(await logbookTools(fakeSupabase(craExample()))), ...(await expenseTools(fakeSupabase(craExample())))];
    const forbidden = /\b(should|must|recommend|need to|ought to)\b/i;
    for (const t of tools) expect(t.description, t.name).not.toMatch(forbidden);
    const status = await callRaw(tools, "get_logbook_status");
    const mileage = await callRaw(tools, "get_mileage_summary");
    expect(status.content[0].text).not.toMatch(forbidden);
    expect(mileage.content[0].text).not.toMatch(forbidden);
  });
});
