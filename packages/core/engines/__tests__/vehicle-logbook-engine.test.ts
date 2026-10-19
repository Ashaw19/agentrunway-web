/**
 * CRA's simplified logbook (2026-10-18).
 *
 * Until this date the vehicle business-use share on every surface (T2125 line
 * 9281, the GST/HST return's vehicle ITC limit, expense totals, the tax
 * estimate) was a typed setting, `user_settings.vehicle_business_use_pct`.
 * `mileage_logs` held business trips only, with no odometer, so nothing could
 * compute the share from driving.
 *
 * CRA, "Motor vehicle records" (canada.ca, page dated 2026-08-31, read
 * 2026-10-18):
 *   - a full logbook for one complete year establishes a base year;
 *   - after it, a three-month sample logbook gives a later year's business
 *     use, "as long as the usage is within the same range (within 10%) of the
 *     results of the base year";
 *   - (Sample year period % ÷ Base year period %) × Base year annual %
 *     = Calculated annual business use;
 *   - CRA's example: (51% ÷ 46%) × 49% = 54%, accepted because it "is within
 *     10% of the annual business use in the base year – it is not lower than
 *     39% or higher than 59%" (so 10 percentage points, both ends included);
 *   - total kilometres come from the odometer at the start and end of the
 *     fiscal period, with a separate record for each vehicle.
 *
 * Fixtures are made up. The base year below reproduces CRA's example: four
 * quarters at 52 / 46 / 39 / 67% business use and 49% for the year.
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_VEHICLE_BUSINESS_USE_PCT,
  SIMPLIFIED_LOGBOOK_RANGE,
  allowanceRateFigure,
  declaredVehicleBusinessUsePct,
  defaultVehicleId,
  logbookPeriodEnd,
  logbookPeriodProblem,
  logbookTripRange,
  vehicleBusinessUse,
  vehicleBusinessUseFor,
  type LogbookPeriod,
  type LogbookReading,
  type LogbookTrip,
  type LogbookVehicle,
} from "../vehicle-logbook-engine";
import { expenseTaxContext } from "../expense-totals-engine";

// ── Fixtures ───────────────────────────────────────────────────────────────

const CAR: LogbookVehicle = { id: "car", name: "Crossover", is_active: true, created_at: "2024-06-01T12:00:00Z" };
const TRUCK: LogbookVehicle = { id: "truck", name: "Pickup", is_active: true, created_at: "2025-02-01T12:00:00Z" };

function period(p: Partial<LogbookPeriod> & Pick<LogbookPeriod, "kind" | "start_date">): LogbookPeriod {
  return {
    id: `${p.vehicle_id ?? "car"}-${p.kind}-${p.start_date}`,
    vehicle_id: "car",
    end_date: logbookPeriodEnd(p.kind, p.start_date),
    odometer_start: null,
    odometer_end: null,
    ...p,
  };
}

function trip(date: string, km: number, vehicle: string | null = "car"): LogbookTrip {
  return { trip_date: date, km, vehicle_id: vehicle };
}

function reading(date: string, km: number, vehicle = "car"): LogbookReading {
  return { vehicle_id: vehicle, reading_date: date, odometer_km: km };
}

/**
 * CRA's base year, calendar 2025. Odometer 10,000 on Jan 1.
 *   Q1 5,000 km, 2,600 business (52%)
 *   Q2 5,000 km, 2,300 business (46%)
 *   Q3 9,000 km, 3,510 business (39%)
 *   Q4 5,000 km, 3,350 business (67%)
 *   Year 24,000 km, 11,760 business = 49%
 */
const BASE_2025 = period({ kind: "base", start_date: "2025-01-01", odometer_start: 10_000, odometer_end: 34_000 });
const BASE_2025_READINGS = [reading("2025-03-31", 15_000), reading("2025-06-30", 20_000), reading("2025-09-30", 29_000)];
const BASE_2025_TRIPS = [
  trip("2025-01-15", 1_600), trip("2025-03-02", 1_000),
  trip("2025-04-10", 1_000), trip("2025-06-20", 1_300),
  trip("2025-08-01", 3_510),
  trip("2025-11-11", 3_350),
];

/** A later year's sample, April to June 2026: 6,000 km, 3,060 business = 51%. */
const SAMPLE_2026 = period({ kind: "sample", start_date: "2026-04-01", odometer_start: 40_000, odometer_end: 46_000 });
const SAMPLE_2026_TRIPS = [trip("2026-04-03", 1_500), trip("2026-05-19", 1_000), trip("2026-06-30", 560)];

const TODAY = "2026-10-18";

// ── CRA's worked example ───────────────────────────────────────────────────

describe("CRA's simplified logbook example", () => {
  const result = vehicleBusinessUse({
    vehicles: [CAR],
    periods: [BASE_2025, SAMPLE_2026],
    readings: BASE_2025_READINGS,
    trips: [...BASE_2025_TRIPS, ...SAMPLE_2026_TRIPS],
    year: 2026,
    declaredPct: 0.8,
    today: TODAY,
  });

  it("is (51% ÷ 46%) × 49% = 54%", () => {
    expect(result.method).toBe("simplified");
    expect(Math.round(result.pct * 100)).toBe(54);
    expect(result.pct).toBeCloseTo((0.51 / 0.46) * 0.49, 4);
    expect(result.logbookPct).toBe(result.pct);
  });

  it("reads each figure from the logbook: sample, base same period, base year", () => {
    const test = result.tenPercentTest;
    expect(test).not.toBeNull();
    expect(test!.samplePct).toBeCloseTo(0.51, 10);
    expect(test!.baseSamePeriodPct).toBeCloseTo(0.46, 10);
    expect(test!.baseAnnualPct).toBeCloseTo(0.49, 10);
    expect(test!.calculatedPct).toBeCloseTo(0.54326, 4);
  });

  it("passes CRA's range: not lower than 39% or higher than 59%", () => {
    expect(result.tenPercentTest!.lowerPct).toBeCloseTo(0.39, 10);
    expect(result.tenPercentTest!.upperPct).toBeCloseTo(0.59, 10);
    expect(result.tenPercentTest!.passed).toBe(true);
  });

  it("the base year itself is the full logbook's figure: 11,760 of 24,000 km = 49%", () => {
    const base = vehicleBusinessUse({
      vehicles: [CAR], periods: [BASE_2025, SAMPLE_2026], readings: BASE_2025_READINGS,
      trips: [...BASE_2025_TRIPS, ...SAMPLE_2026_TRIPS], year: 2025, declaredPct: 0.8, today: TODAY,
    });
    expect(base.method).toBe("full");
    expect(base.pct).toBe(0.49);
    expect(base.vehicles[0].businessKm).toBe(11_760);
    expect(base.vehicles[0].totalKm).toBe(24_000);
  });
});

// ── The 10% test, at its edges ─────────────────────────────────────────────

describe("CRA's 10% range, both ends included", () => {
  /**
   * A base year at 50% for the year and 50% for April to June, so the
   * calculated figure equals the sample's own percentage.
   */
  const base = period({ kind: "base", start_date: "2025-01-01", odometer_start: 0, odometer_end: 4_000 });
  const baseReadings = [reading("2025-03-31", 1_000), reading("2025-06-30", 2_000)];
  const baseTrips = [trip("2025-02-01", 500), trip("2025-05-01", 500), trip("2025-08-01", 500), trip("2025-11-01", 500)];

  function withSample(businessKm: number) {
    const sample = period({ kind: "sample", start_date: "2026-04-01", odometer_start: 10_000, odometer_end: 11_000 });
    return vehicleBusinessUse({
      vehicles: [CAR], periods: [base, sample], readings: baseReadings,
      trips: [...baseTrips, trip("2026-05-05", businessKm)], year: 2026, declaredPct: 0.8, today: TODAY,
    });
  }

  it("the range is 10 percentage points", () => {
    expect(SIMPLIFIED_LOGBOOK_RANGE).toBe(0.1);
  });

  it("60% against a 50% base year is inside (upper edge)", () => {
    const r = withSample(600);
    expect(r.tenPercentTest!.passed).toBe(true);
    expect(r.method).toBe("simplified");
    expect(r.pct).toBe(0.6);
  });

  it("60.1% is outside, so the declared setting stays", () => {
    const r = withSample(601);
    expect(r.tenPercentTest!.passed).toBe(false);
    expect(r.method).toBe("declared");
    expect(r.pct).toBe(0.8);
    expect(r.logbookPct).toBeNull();
    expect(r.vehicles[0].reason).toMatch(/more than 10/);
  });

  it("40% is inside (lower edge), 39.9% is outside", () => {
    expect(withSample(400).tenPercentTest!.passed).toBe(true);
    expect(withSample(400).pct).toBe(0.4);
    expect(withSample(399).tenPercentTest!.passed).toBe(false);
    expect(withSample(399).method).toBe("declared");
  });
});

// ── Years the logbook does not cover ───────────────────────────────────────

describe("a computed % applies only to years with logbook coverage", () => {
  const rows = {
    vehicles: [CAR],
    periods: [BASE_2025],
    readings: BASE_2025_READINGS,
    trips: BASE_2025_TRIPS,
  };

  it("no logbook at all: the declared setting, labelled as declared", () => {
    const r = vehicleBusinessUse({ vehicles: [], periods: [], readings: [], trips: [], year: 2026, declaredPct: 0.8, today: TODAY });
    expect(r.method).toBe("declared");
    expect(r.pct).toBe(0.8);
    expect(r.label).toMatch(/declared/i);
  });

  it("the year before the base year keeps the declared setting", () => {
    expect(vehicleBusinessUse({ ...rows, year: 2024, declaredPct: 0.7, today: TODAY }).method).toBe("declared");
    expect(vehicleBusinessUse({ ...rows, year: 2024, declaredPct: 0.7, today: TODAY }).pct).toBe(0.7);
  });

  it("a later year with no sample period keeps the declared setting", () => {
    const r = vehicleBusinessUse({ ...rows, trips: [...BASE_2025_TRIPS, trip("2026-02-02", 40)], year: 2026, declaredPct: 0.7, today: TODAY });
    expect(r.method).toBe("declared");
    expect(r.pct).toBe(0.7);
    expect(r.vehicles[0].reason).toMatch(/no completed sample period/i);
  });

  it("a base year still in progress gives no figure for its year", () => {
    const open = period({ kind: "base", start_date: "2026-01-01", odometer_start: 50_000 });
    const r = vehicleBusinessUse({
      vehicles: [CAR], periods: [open], readings: [reading("2026-09-30", 62_000)],
      trips: [trip("2026-03-03", 5_000)], year: 2026, declaredPct: 0.8, today: TODAY,
    });
    expect(r.method).toBe("declared");
    expect(r.progress[0].monthsLogged).toBe(9);
    expect(r.progress[0].label).toBe("Base year (Jan 2026 to Dec 2026): 9 of 12 months logged");
  });

  it("a sample period still in progress gives no figure", () => {
    const open = period({ kind: "sample", start_date: "2026-08-01", odometer_start: 40_000 });
    const r = vehicleBusinessUse({ ...rows, periods: [BASE_2025, open], year: 2026, declaredPct: 0.8, today: TODAY });
    expect(r.method).toBe("declared");
    expect(r.progress.find((p) => p.kind === "sample")!.label).toBe("Sample period (Aug 2026 to Oct 2026): 2 of 3 months elapsed");
  });

  it("a base year that does not run January to December gives no full-year figure", () => {
    const offset = period({ kind: "base", start_date: "2025-11-01", odometer_start: 0, odometer_end: 20_000 });
    const r = vehicleBusinessUse({
      vehicles: [CAR], periods: [offset], readings: [], trips: [trip("2026-02-02", 9_000)],
      year: 2026, declaredPct: 0.8, today: "2027-01-15",
    });
    expect(r.method).toBe("declared");
  });

  it("the sample is compared with the same months inside a November-to-October base year", () => {
    // Base Nov 2025 to Oct 2026. Its April to June 2026: 3,000 km, 1,500 business (50%).
    // Its year: 12,000 km, 6,000 business (50%). Sample Apr to Jun 2027 at 55%.
    const offset = period({ kind: "base", start_date: "2025-11-01", odometer_start: 0, odometer_end: 12_000 });
    const sample = period({ kind: "sample", start_date: "2027-04-01", odometer_start: 20_000, odometer_end: 21_000 });
    const r = vehicleBusinessUse({
      vehicles: [CAR],
      periods: [offset, sample],
      readings: [reading("2026-03-31", 5_000), reading("2026-06-30", 8_000)],
      trips: [trip("2025-12-01", 2_500), trip("2026-05-01", 1_500), trip("2026-09-01", 2_000), trip("2027-05-01", 550)],
      year: 2027, declaredPct: 0.8, today: "2027-10-01",
    });
    expect(r.tenPercentTest!.baseSamePeriodPct).toBeCloseTo(0.5, 10);
    expect(r.tenPercentTest!.baseAnnualPct).toBeCloseTo(0.5, 10);
    expect(r.method).toBe("simplified");
    expect(r.pct).toBeCloseTo(0.55, 10);
  });

  it("without the base year's odometer at the sample months' edges, nothing is computed", () => {
    const r = vehicleBusinessUse({
      vehicles: [CAR], periods: [BASE_2025, SAMPLE_2026], readings: [],
      trips: [...BASE_2025_TRIPS, ...SAMPLE_2026_TRIPS], year: 2026, declaredPct: 0.8, today: TODAY,
    });
    expect(r.method).toBe("declared");
    expect(r.vehicles[0].reason).toMatch(/odometer.*2025-03-31/);
  });

  it("business km over the odometer's total is not applied", () => {
    const broken = period({ kind: "base", start_date: "2025-01-01", odometer_start: 0, odometer_end: 1_000 });
    const r = vehicleBusinessUse({ vehicles: [CAR], periods: [broken], readings: [], trips: [trip("2025-05-05", 1_200)], year: 2025, declaredPct: 0.8, today: TODAY });
    expect(r.method).toBe("declared");
    expect(r.vehicles[0].reason).toMatch(/more business km/i);
  });
});

// ── Several vehicles ───────────────────────────────────────────────────────

describe("several vehicles", () => {
  const carBase = period({ kind: "base", start_date: "2026-01-01", odometer_start: 0, odometer_end: 20_000 });
  const truckBase = period({ vehicle_id: "truck", kind: "base", start_date: "2026-01-01", odometer_start: 100_000, odometer_end: 105_000 });

  it("each vehicle has its own figure; the share applied is the km-weighted one", () => {
    // Car 12,000 of 20,000 (60%), truck 1,000 of 5,000 (20%): 13,000 of 25,000 = 52%.
    const r = vehicleBusinessUse({
      vehicles: [CAR, TRUCK],
      periods: [carBase, truckBase],
      readings: [],
      trips: [trip("2026-03-01", 12_000, "car"), trip("2026-03-02", 1_000, "truck")],
      year: 2026, declaredPct: 0.8, today: "2027-01-05",
    });
    expect(r.method).toBe("full");
    expect(r.vehicles.map((v) => [v.vehicleId, v.pct])).toEqual([["car", 0.6], ["truck", 0.2]]);
    expect(r.pct).toBe(0.52);
  });

  it("a trip with no vehicle counts for the default vehicle (the first one added)", () => {
    expect(defaultVehicleId([TRUCK, CAR])).toBe("car");
    const r = vehicleBusinessUse({
      vehicles: [CAR, TRUCK], periods: [carBase, truckBase], readings: [],
      trips: [trip("2026-03-01", 12_000, null), trip("2026-03-02", 1_000, "truck")],
      year: 2026, declaredPct: 0.8, today: "2027-01-05",
    });
    expect(r.vehicles.find((v) => v.vehicleId === "car")!.businessKm).toBe(12_000);
  });

  it("an inactive first vehicle is not the default", () => {
    expect(defaultVehicleId([{ ...CAR, is_active: false }, TRUCK])).toBe("truck");
  });

  it("one vehicle driven for business without a logbook: the declared setting stays", () => {
    const r = vehicleBusinessUse({
      vehicles: [CAR, TRUCK], periods: [carBase], readings: [],
      trips: [trip("2026-03-01", 12_000, "car"), trip("2026-03-02", 1_000, "truck")],
      year: 2026, declaredPct: 0.8, today: "2027-01-05",
    });
    expect(r.method).toBe("declared");
    expect(r.pct).toBe(0.8);
    expect(r.notes.join(" ")).toMatch(/1 of 2 vehicles/);
  });

  it("another vehicle's trips and readings never count", () => {
    const r = vehicleBusinessUse({
      vehicles: [CAR, TRUCK], periods: [carBase], readings: [reading("2026-06-30", 999_999, "truck")],
      trips: [trip("2026-03-01", 12_000, "car")],
      year: 2026, declaredPct: 0.8, today: "2027-01-05",
    });
    expect(r.method).toBe("full");
    expect(r.pct).toBe(0.6);
  });
});

// ── Readings and progress ──────────────────────────────────────────────────

describe("odometer readings due and progress", () => {
  it("a base year lists its start, each month end and its end, once each is due", () => {
    const open = period({ kind: "base", start_date: "2026-08-01" });
    const r = vehicleBusinessUse({ vehicles: [CAR], periods: [open], readings: [reading("2026-08-31", 1_000)], trips: [], year: 2026, declaredPct: 0.8, today: "2026-10-18" });
    expect(r.readingsDue.map((d) => [d.kind, d.date])).toEqual([
      ["period_start", "2026-08-01"],
      ["month_end", "2026-09-30"],
    ]);
  });

  it("a finished sample period asks for its end reading", () => {
    const s = period({ kind: "sample", start_date: "2026-04-01", odometer_start: 1 });
    const r = vehicleBusinessUse({ vehicles: [CAR], periods: [BASE_2025, s], readings: BASE_2025_READINGS, trips: BASE_2025_TRIPS, year: 2026, declaredPct: 0.8, today: TODAY });
    expect(r.readingsDue.map((d) => [d.kind, d.date])).toEqual([["period_end", "2026-06-30"]]);
  });

  it("a base year's share so far is shown, never applied", () => {
    const open = period({ kind: "base", start_date: "2026-01-01", odometer_start: 0 });
    const r = vehicleBusinessUse({
      vehicles: [CAR], periods: [open], readings: [reading("2026-06-30", 10_000)],
      trips: [trip("2026-02-02", 6_000), trip("2026-08-08", 3_000)], year: 2026, declaredPct: 0.8, today: TODAY,
    });
    expect(r.progress[0].soFar).toEqual({ through: "2026-06-30", businessKm: 6_000, totalKm: 10_000, pct: 0.6 });
    expect(r.pct).toBe(0.8);
  });
});

// ── Period shapes ──────────────────────────────────────────────────────────

describe("period shapes", () => {
  it("a base year is 12 months from the 1st, a sample 3", () => {
    expect(logbookPeriodEnd("base", "2026-11-01")).toBe("2027-10-31");
    expect(logbookPeriodEnd("sample", "2027-04-01")).toBe("2027-06-30");
    expect(logbookPeriodEnd("sample", "2027-12-01")).toBe("2028-02-29");
  });

  it("names what is wrong with a period", () => {
    expect(logbookPeriodProblem({ kind: "base", start_date: "2026-11-01", end_date: "2027-10-31" })).toBeNull();
    expect(logbookPeriodProblem({ kind: "base", start_date: "2026-11-15", end_date: "2027-11-14" })).toMatch(/1st/);
    expect(logbookPeriodProblem({ kind: "sample", start_date: "2026-04-01", end_date: "2026-05-31" })).toMatch(/3 months/);
  });

  it("a sample period needs a completed base year before it", () => {
    const sample = period({ kind: "sample", start_date: "2026-04-01", odometer_start: 1, odometer_end: 2 });
    const r = vehicleBusinessUse({ vehicles: [CAR], periods: [sample], readings: [], trips: [], year: 2026, declaredPct: 0.8, today: TODAY });
    expect(r.method).toBe("declared");
    expect(r.vehicles[0].reason).toMatch(/base year/);
  });

  it("the trips the year needs start at the earliest base year", () => {
    expect(logbookTripRange([BASE_2025, SAMPLE_2026], 2026)).toEqual({ from: "2025-01-01", to: "2026-12-31" });
    expect(logbookTripRange([], 2026)).toEqual({ from: "2026-01-01", to: "2026-12-31" });
  });
});

// ── The declared setting and the one resolver ──────────────────────────────

describe("the declared setting and the resolver", () => {
  it("reads the setting the way expense totals always have", () => {
    expect(declaredVehicleBusinessUsePct(null)).toBe(DEFAULT_VEHICLE_BUSINESS_USE_PCT);
    expect(declaredVehicleBusinessUsePct({ vehicle_business_use_pct: "0.6500" })).toBe(0.65);
    expect(declaredVehicleBusinessUsePct({ vehicle_business_use_pct: 1.4 })).toBe(1);
  });

  it("expense totals, ITCs and the T2125 get the logbook's figure through expenseTaxContext", () => {
    const rows = { vehicles: [CAR], periods: [BASE_2025, SAMPLE_2026], readings: BASE_2025_READINGS, trips: [...BASE_2025_TRIPS, ...SAMPLE_2026_TRIPS] };
    const settings = { gst_hst_registered: true, vehicle_business_use_pct: 0.8, home_office_business_use_pct: 0 };
    const ctx = expenseTaxContext(settings, { rows, year: 2026, today: TODAY });
    const direct = vehicleBusinessUseFor(settings, rows, 2026, TODAY);
    expect(ctx.vehicleBusinessUsePct).toBe(direct.pct);
    expect(ctx.vehicleBusinessUse?.method).toBe("simplified");
    expect(Math.round(ctx.vehicleBusinessUsePct * 100)).toBe(54);
  });

  it("with no logbook rows the context is the declared setting, as before", () => {
    const ctx = expenseTaxContext({ vehicle_business_use_pct: 0.8, home_office_business_use_pct: 0 }, null);
    expect(ctx.vehicleBusinessUsePct).toBe(0.8);
    expect(ctx.vehicleBusinessUse?.method).toBe("declared");
  });
});

// ── CRA's per-km allowance rates ───────────────────────────────────────────

describe("the per-km allowance-rate figure", () => {
  it("2026: 5,000 km at $0.73 and the rest at $0.67", () => {
    const f = allowanceRateFigure(6_000, 2026);
    expect(f.amount).toBeCloseTo(4_320, 6);
    expect(f.rates.year).toBe(2026);
    expect(f.exactYear).toBe(true);
  });

  it("2025: $0.72 and $0.66", () => {
    expect(allowanceRateFigure(6_000, 2025).amount).toBeCloseTo(4_260, 6);
  });

  it("a year CRA has not published uses the latest published year, and says so", () => {
    const f = allowanceRateFigure(100, 2027);
    expect(f.rates.year).toBe(2026);
    expect(f.exactYear).toBe(false);
  });
});
