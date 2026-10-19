/**
 * Vehicle business use from the logbook, CRA's way (2026-10-18).
 *
 * Until this date every surface multiplied vehicle costs by a typed setting,
 * `user_settings.vehicle_business_use_pct` ("User-declared %" on the T2125
 * PDF), and `mileage_logs` held business trips only, with no odometer and no
 * total kilometres, so the log could not support the percentage beside it.
 *
 * This engine works the share out from the agent's own records, by CRA's
 * rules ("Motor vehicle records", canada.ca, page dated 2026-08-31; the
 * wording the app prints is in tax-copy/cra-rules.ts):
 *
 *   full        A base period that IS the tax year (January 1 to December 31,
 *               the fiscal period of a sole proprietor's T2125), finished,
 *               with the odometer at its start and end:
 *               business km in the year ÷ total km (odometer end − start).
 *   simplified  A finished three-month sample period in the tax year, after
 *               a finished 12-month base year of the same vehicle:
 *               (sample % ÷ base-year same-period %) × base-year annual %,
 *               applied only when that is within 10 percentage points of the
 *               base year's annual figure (CRA's example: 49% → 39% to 59%,
 *               both ends included).
 *   declared    Anything else. The setting, labelled as declared. A computed
 *               share replaces the typed one only for a year the logbook
 *               covers, so no past estimate moves without a logbook behind it.
 *
 * Periods start on the 1st of a month: a base year runs 12 months, a sample
 * 3. Total km for any run of months come from odometer readings at its
 * edges: the period's own start and end readings, and month-end readings
 * (`vehicle_odometer_readings`). The base year's month-end readings are what
 * let a later sample be compared with the same months of the base year.
 *
 * A reading is the odometer at the END of its date. A period's start reading
 * is the odometer as the period begins, so it stands at the end of the day
 * before.
 *
 * Several vehicles: CRA keeps a record per vehicle and works each vehicle's
 * expenses out separately. Agent Runway's vehicle expenses are not split by
 * vehicle, so one share is applied to all of them: each vehicle's share,
 * weighted by its total km (the year's for a full logbook, the base year's
 * for the simplified method). Until every vehicle with business trips in the
 * year has its own figure, the declared setting stays.
 *
 * A trip with no vehicle (every trip logged before 2026-10-18) counts for the
 * default vehicle: the first active one added. Nothing rewrites those rows.
 *
 * ESTIMATE ONLY. Not tax advice: the app states CRA's rule and the figure
 * the agent's records give; what to claim is the agent's and their
 * accountant's decision.
 */

import { addDaysISO, atlanticISODate } from "../lib/local-date";
import { craAllowanceRates, type AllowanceRates } from "../tax-copy/cra-rules";

// ── Inputs ─────────────────────────────────────────────────────────────────

export type LogbookPeriodKind = "base" | "sample";

/** CRA: a full logbook for one complete year; a three-month sample after it. */
export const LOGBOOK_PERIOD_MONTHS: Readonly<Record<LogbookPeriodKind, number>> = { base: 12, sample: 3 };

/** CRA's range: within 10 percentage points of the base year's annual figure. */
export const SIMPLIFIED_LOGBOOK_RANGE = 0.1;

/** The column default (migration 00015), for a settings row that isn't loaded. */
export const DEFAULT_VEHICLE_BUSINESS_USE_PCT = 0.8;

const EPS = 1e-9;

export interface LogbookVehicle {
  id: string;
  name: string;
  is_active: boolean;
  created_at: string;
}

export interface LogbookPeriod {
  id: string;
  vehicle_id: string;
  kind: LogbookPeriodKind;
  /** YYYY-MM-DD, the 1st of a month. */
  start_date: string;
  /** YYYY-MM-DD, the last day of the period's last month. */
  end_date: string;
  /** Odometer as the period begins. */
  odometer_start: number | string | null;
  /** Odometer at the end of `end_date`. */
  odometer_end: number | string | null;
}

export interface LogbookReading {
  vehicle_id: string;
  /** The odometer at the end of this day. */
  reading_date: string;
  odometer_km: number | string;
}

export interface LogbookTrip {
  trip_date: string;
  km: number | string | null;
  /** Null for trips logged before vehicles existed: the default vehicle's. */
  vehicle_id: string | null;
}

/** What `loadLogbookRows` (core/lib/vehicle-logbook-rows.ts) reads. */
export interface LogbookRows {
  vehicles: readonly LogbookVehicle[];
  periods: readonly LogbookPeriod[];
  readings: readonly LogbookReading[];
  trips: readonly LogbookTrip[];
}

export interface VehicleBusinessUseInput extends LogbookRows {
  /** The tax year. */
  year: number;
  /** `user_settings.vehicle_business_use_pct`, 0–1 (declaredVehicleBusinessUsePct). */
  declaredPct: number;
  /** YYYY-MM-DD, Atlantic. Defaults to today. */
  today?: string;
}

// ── Results ────────────────────────────────────────────────────────────────

export type VehicleBusinessUseMethod = "full" | "simplified" | "declared";

export interface TenPercentTest {
  vehicleId: string;
  /** Business share of the sample period. */
  samplePct: number;
  /** Business share of the same months in the base year. */
  baseSamePeriodPct: number;
  /** Business share of the whole base year. */
  baseAnnualPct: number;
  /** (sample ÷ base same period) × base annual. */
  calculatedPct: number;
  /** base annual − 10 points. */
  lowerPct: number;
  /** base annual + 10 points. */
  upperPct: number;
  passed: boolean;
  sample: { start: string; end: string };
  base: { start: string; end: string };
}

export interface VehicleYearUse {
  vehicleId: string;
  vehicleName: string;
  /** How this vehicle's share was worked out, or null when it has none for the year. */
  method: "full" | "simplified" | null;
  /** 0–1, or null. */
  pct: number | null;
  /** Business km measured: the year (full) or the sample period (simplified). */
  businessKm: number;
  /** Total km over the same span, from the odometer. */
  totalKm: number | null;
  /** What this vehicle's share counts for when several are combined. */
  weightKm: number | null;
  tenPercentTest: TenPercentTest | null;
  /** Why there is no figure, in plain words. */
  reason: string | null;
}

export type ReadingDueKind = "period_start" | "month_end" | "period_end";

export interface ReadingDue {
  vehicleId: string;
  vehicleName: string;
  periodId: string;
  kind: ReadingDueKind;
  /** period_start: the period's first day; otherwise the day the reading is the end of. */
  date: string;
  label: string;
}

export interface LogbookProgress {
  periodId: string;
  vehicleId: string;
  vehicleName: string;
  kind: LogbookPeriodKind;
  startDate: string;
  endDate: string;
  monthsTotal: number;
  /** Base year: months logged through the latest month-end reading. Sample: months elapsed. */
  monthsLogged: number;
  /** Finished, with both odometer readings. */
  complete: boolean;
  /** An unfinished base year's share so far. Shown, never applied. */
  soFar: { through: string; businessKm: number; totalKm: number; pct: number } | null;
  label: string;
}

export interface VehicleBusinessUse {
  year: number;
  /** The share every surface applies, 0–1: the logbook's when it covers the year, else declared. */
  pct: number;
  method: VehicleBusinessUseMethod;
  declaredPct: number;
  /** The logbook's figure when it covers the year; null otherwise. */
  logbookPct: number | null;
  /** One entry per vehicle used in the year. */
  vehicles: VehicleYearUse[];
  /** The first simplified-method test this year (one per vehicle in `vehicles`). */
  tenPercentTest: TenPercentTest | null;
  progress: LogbookProgress[];
  readingsDue: ReadingDue[];
  /** One line: what the share is and where it comes from. */
  label: string;
  notes: string[];
}

// ── Dates ──────────────────────────────────────────────────────────────────

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function isISODate(iso: string): boolean {
  const m = ISO.exec(iso);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toISOString().slice(0, 10) === iso;
}

function addMonthsISO(firstOfMonth: string, n: number): string {
  const [y, m] = firstOfMonth.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 10);
}

/** "Jan 2026". */
function monthLabel(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

/** "Jan 5, 2026". */
export function logbookDateLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

/** The last day of a period that starts on `start` (the 1st of a month). */
export function logbookPeriodEnd(kind: LogbookPeriodKind, start: string): string {
  return addDaysISO(addMonthsISO(start, LOGBOOK_PERIOD_MONTHS[kind]), -1);
}

/** The months of a period, each as its first and last day. */
function monthsOf(start: string, months: number): { start: string; end: string }[] {
  return Array.from({ length: months }, (_, i) => {
    const s = addMonthsISO(start, i);
    return { start: s, end: addDaysISO(addMonthsISO(s, 1), -1) };
  });
}

const monthOfYear = (iso: string) => Number(iso.slice(5, 7));

/** "Base year (Jan 2026 to Dec 2026)". */
function periodName(p: Pick<LogbookPeriod, "kind" | "start_date" | "end_date">): string {
  return `${p.kind === "base" ? "Base year" : "Sample period"} (${monthLabel(p.start_date)} to ${monthLabel(p.end_date)})`;
}

// ── Validation (writers call it before saving a period) ────────────────────

/**
 * What is wrong with a period, or null. With `existing`, also a period of the
 * same vehicle it overlaps, and (for a sample) a base year that ends before
 * it. The web form, Flight Crew, MCP and the phone all check with this.
 */
export function logbookPeriodProblem(
  p: Pick<LogbookPeriod, "kind" | "start_date" | "end_date"> & { vehicle_id?: string; id?: string },
  existing?: readonly LogbookPeriod[],
): string | null {
  if (p.kind !== "base" && p.kind !== "sample") return "A logbook period is a base year or a sample period.";
  if (!isISODate(p.start_date) || !isISODate(p.end_date)) return "Dates are YYYY-MM-DD.";
  if (!p.start_date.endsWith("-01")) return "A logbook period starts on the 1st of a month.";
  const expected = logbookPeriodEnd(p.kind, p.start_date);
  if (p.end_date !== expected) {
    return p.kind === "base"
      ? `A base year runs 12 months: ${p.start_date} to ${expected}.`
      : `A sample period runs 3 months: ${p.start_date} to ${expected}.`;
  }
  if (!existing || !p.vehicle_id) return null;
  const same = existing.filter((e) => e.vehicle_id === p.vehicle_id && e.id !== p.id);
  const overlap = same.find((e) => e.start_date <= p.end_date && e.end_date >= p.start_date);
  if (overlap) return `It overlaps this vehicle's ${periodName(overlap)}.`;
  if (p.kind === "sample" && !same.some((e) => e.kind === "base" && e.end_date < p.start_date)) {
    return "CRA's simplified method compares a sample period with a base year kept before it, and this vehicle has no base year ending before this sample.";
  }
  return null;
}

// ── The declared setting ───────────────────────────────────────────────────

/** `user_settings.vehicle_business_use_pct` as every surface has read it: 0–1, 0.8 when unset. */
export function declaredVehicleBusinessUsePct(
  settings: { vehicle_business_use_pct?: number | string | null } | null | undefined,
): number {
  const raw = settings?.vehicle_business_use_pct;
  const pct = raw == null || raw === "" ? DEFAULT_VEHICLE_BUSINESS_USE_PCT : Number(raw);
  return Number.isFinite(pct) ? Math.min(1, Math.max(0, pct)) : DEFAULT_VEHICLE_BUSINESS_USE_PCT;
}

// ── Helpers over the rows ──────────────────────────────────────────────────

/** The vehicle a trip with no vehicle belongs to: the first active one added (else the first). */
export function defaultVehicleId(vehicles: readonly LogbookVehicle[]): string | null {
  const byAge = [...vehicles].sort((a, b) => a.created_at.localeCompare(b.created_at));
  return (byAge.find((v) => v.is_active) ?? byAge[0])?.id ?? null;
}

/** The trips `vehicleBusinessUse` needs for `year`: the year, and every base year on or before it. */
export function logbookTripRange(periods: readonly Pick<LogbookPeriod, "kind" | "start_date" | "end_date">[], year: number): { from: string; to: string } {
  let from = `${year}-01-01`;
  let to = `${year}-12-31`;
  for (const p of periods) {
    if (p.kind !== "base" || p.start_date > `${year}-12-31`) continue;
    if (p.start_date < from) from = p.start_date;
    if (p.end_date >= `${year}-01-01` && p.end_date > to) to = p.end_date;
  }
  return { from, to };
}

const num = (v: number | string | null | undefined): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const round4 = (n: number) => Math.round(n * 10_000) / 10_000;

/** The odometer readings of each vehicle: boundary day (end of) → km. */
function odometerIndex(periods: readonly LogbookPeriod[], readings: readonly LogbookReading[]) {
  const idx = new Map<string, Map<string, number>>();
  const put = (vehicle: string, day: string, km: number | null, overwrite: boolean) => {
    if (km == null) return;
    let m = idx.get(vehicle);
    if (!m) idx.set(vehicle, (m = new Map()));
    if (overwrite || !m.has(day)) m.set(day, km);
  };
  for (const r of readings) put(r.vehicle_id, r.reading_date, num(r.odometer_km), false);
  // A period's own readings win over a separate reading for the same moment.
  for (const p of periods) {
    put(p.vehicle_id, addDaysISO(p.start_date, -1), num(p.odometer_start), true);
    put(p.vehicle_id, p.end_date, num(p.odometer_end), true);
  }
  return (vehicle: string, endOfDay: string): number | null => idx.get(vehicle)?.get(endOfDay) ?? null;
}

interface SpanUse {
  businessKm: number;
  totalKm: number | null;
  pct: number | null;
  problem: string | null;
}

// ── The engine ─────────────────────────────────────────────────────────────

export function vehicleBusinessUse(input: VehicleBusinessUseInput): VehicleBusinessUse {
  const { year } = input;
  const today = input.today ?? atlanticISODate();
  const declaredPct = Math.min(1, Math.max(0, Number.isFinite(input.declaredPct) ? input.declaredPct : DEFAULT_VEHICLE_BUSINESS_USE_PCT));
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;

  const vehicles = [...input.vehicles].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const nameOf = (id: string) => vehicles.find((v) => v.id === id)?.name ?? "Vehicle";
  const fallbackVehicle = defaultVehicleId(vehicles);
  const vehicleOf = (t: LogbookTrip) => t.vehicle_id ?? fallbackVehicle;
  const periods = input.periods.filter((p) => logbookPeriodProblem(p) === null);
  const odometer = odometerIndex(periods, input.readings);

  const businessKm = (vehicle: string, from: string, to: string) =>
    input.trips.reduce((s, t) => (vehicleOf(t) === vehicle && t.trip_date >= from && t.trip_date <= to ? s + (num(t.km) ?? 0) : s), 0);

  /** Business and total km between two days, both included. */
  const span = (vehicle: string, from: string, to: string, what: string): SpanUse => {
    const biz = businessKm(vehicle, from, to);
    const before = addDaysISO(from, -1);
    const a = odometer(vehicle, before);
    const b = odometer(vehicle, to);
    const missing = [a == null ? before : null, b == null ? to : null].filter((d): d is string => d !== null);
    if (missing.length) {
      return { businessKm: biz, totalKm: null, pct: null, problem: `No odometer reading at the end of ${missing.join(" or ")} (${what}).` };
    }
    const total = (b as number) - (a as number);
    if (total <= 0) return { businessKm: biz, totalKm: total, pct: null, problem: `The odometer shows no driving for ${what}.` };
    if (biz > total + EPS) {
      return { businessKm: biz, totalKm: total, pct: null, problem: `The trips show more business km (${fmtKm(biz)}) than the odometer's total (${fmtKm(total)}) for ${what}.` };
    }
    return { businessKm: biz, totalKm: total, pct: biz / total, problem: null };
  };

  const complete = (p: LogbookPeriod) => num(p.odometer_start) != null && num(p.odometer_end) != null && p.end_date <= today;

  /** One vehicle's figure for the year. */
  const forVehicle = (vehicle: string): VehicleYearUse => {
    const out: VehicleYearUse = {
      vehicleId: vehicle, vehicleName: nameOf(vehicle), method: null, pct: null,
      businessKm: businessKm(vehicle, yearStart, yearEnd), totalKm: null, weightKm: null,
      tenPercentTest: null, reason: null,
    };
    const own = periods.filter((p) => p.vehicle_id === vehicle);

    // Full logbook: a base year that is this tax year.
    const fullYear = own.find((p) => p.kind === "base" && p.start_date === yearStart && p.end_date === yearEnd);
    if (fullYear && complete(fullYear)) {
      const use = span(vehicle, yearStart, yearEnd, `the ${year} logbook`);
      out.businessKm = use.businessKm;
      out.totalKm = use.totalKm;
      if (use.pct == null) return { ...out, reason: use.problem };
      return { ...out, method: "full", pct: use.pct, weightKm: use.totalKm };
    }

    // Simplified: a sample period in this year after a finished base year.
    const samples = own
      .filter((p) => p.kind === "sample" && p.start_date >= yearStart && p.end_date <= yearEnd)
      .sort((a, b) => b.start_date.localeCompare(a.start_date));
    const sample = samples.find(complete);
    if (!sample) {
      if (fullYear) return { ...out, reason: `The ${year} base year is not finished, or its odometer reading at the start or end is missing.` };
      return {
        ...out,
        reason: samples.length
          ? `The ${year} sample period is not finished, or its odometer reading at the start or end is missing.`
          : own.length
            ? `No completed sample period in ${year}, and no base year that runs January to December ${year}.`
            : "No logbook period for this vehicle.",
      };
    }
    const base = own
      .filter((p) => p.kind === "base" && complete(p) && p.end_date < sample.start_date)
      .sort((a, b) => b.end_date.localeCompare(a.end_date))[0];
    if (!base) return { ...out, reason: "No completed base year before the sample period." };

    const sampleUse = span(vehicle, sample.start_date, sample.end_date, "the sample period");
    const baseAnnual = span(vehicle, base.start_date, base.end_date, "the base year");
    // The sample's months inside the base year (each month of a 12-month base
    // year is there once), as runs of consecutive months.
    const baseMonths = monthsOf(base.start_date, 12);
    const matched = monthsOf(sample.start_date, 3)
      .map((m) => baseMonths.find((b) => monthOfYear(b.start) === monthOfYear(m.start))!)
      .sort((a, b) => a.start.localeCompare(b.start));
    const runs: { start: string; end: string }[] = [];
    for (const m of matched) {
      const last = runs[runs.length - 1];
      if (last && addDaysISO(last.end, 1) === m.start) last.end = m.end;
      else runs.push({ ...m });
    }
    const runUses = runs.map((r) => span(vehicle, r.start, r.end, "the same months of the base year"));
    const runProblem = runUses.find((u) => u.totalKm == null || u.problem)?.problem ?? null;
    const sameBiz = runUses.reduce((s, u) => s + u.businessKm, 0);
    const sameTotal = runUses.reduce((s, u) => s + (u.totalKm ?? 0), 0);

    out.businessKm = sampleUse.businessKm;
    out.totalKm = sampleUse.totalKm;
    const problem = sampleUse.problem ?? baseAnnual.problem ?? runProblem;
    if (problem) return { ...out, reason: problem };
    if (sameBiz <= 0 || sameTotal <= 0) {
      return { ...out, reason: "The base year has no business km in the sample's months, so CRA's formula cannot be worked out." };
    }
    const samplePct = sampleUse.pct as number;
    const baseAnnualPct = baseAnnual.pct as number;
    const baseSamePeriodPct = sameBiz / sameTotal;
    const calculatedPct = (samplePct / baseSamePeriodPct) * baseAnnualPct;
    const lowerPct = baseAnnualPct - SIMPLIFIED_LOGBOOK_RANGE;
    const upperPct = baseAnnualPct + SIMPLIFIED_LOGBOOK_RANGE;
    const passed = Math.abs(calculatedPct - baseAnnualPct) <= SIMPLIFIED_LOGBOOK_RANGE + EPS;
    const test: TenPercentTest = {
      vehicleId: vehicle, samplePct, baseSamePeriodPct, baseAnnualPct, calculatedPct, lowerPct, upperPct, passed,
      sample: { start: sample.start_date, end: sample.end_date },
      base: { start: base.start_date, end: base.end_date },
    };
    if (!passed) {
      return {
        ...out,
        tenPercentTest: test,
        reason: `The calculated ${fmtPctShort(calculatedPct)} is more than 10 percentage points from the base year's ${fmtPctShort(baseAnnualPct)}, so per CRA the base year does not indicate ${year}'s use.`,
      };
    }
    return { ...out, method: "simplified", pct: Math.min(1, Math.max(0, calculatedPct)), weightKm: baseAnnual.totalKm, tenPercentTest: test };
  };

  // Vehicles used in the year: business trips in it, or a period touching it.
  const used = vehicles
    .map((v) => v.id)
    .filter((id) =>
      input.trips.some((t) => vehicleOf(t) === id && t.trip_date >= yearStart && t.trip_date <= yearEnd) ||
      periods.some((p) => p.vehicle_id === id && p.start_date <= yearEnd && p.end_date >= yearStart),
    );
  const perVehicle = used.map(forVehicle);
  const covered = perVehicle.filter((v) => v.pct != null);
  const notes = perVehicle.filter((v) => v.reason).map((v) => `${v.vehicleName}: ${v.reason}`);

  let logbookPct: number | null = null;
  let method: VehicleBusinessUseMethod = "declared";
  if (covered.length > 0 && covered.length === perVehicle.length) {
    if (covered.every((v) => v.method === "full")) {
      const biz = covered.reduce((s, v) => s + v.businessKm, 0);
      const total = covered.reduce((s, v) => s + (v.totalKm ?? 0), 0);
      logbookPct = round4(biz / total);
      method = "full";
    } else {
      const weight = covered.reduce((s, v) => s + (v.weightKm ?? 0), 0);
      logbookPct = round4(weight > 0
        ? covered.reduce((s, v) => s + (v.pct as number) * (v.weightKm ?? 0), 0) / weight
        : (covered[0].pct as number));
      method = "simplified";
    }
  } else if (covered.length > 0) {
    notes.unshift(`The logbook covers ${covered.length} of ${perVehicle.length} vehicles used in ${year}, so the declared setting applies.`);
  }

  const { progress, readingsDue } = progressOf(periods, vehicles, nameOf, odometer, span, complete, today, yearStart, yearEnd);

  const pct = logbookPct ?? declaredPct;
  return {
    year,
    pct,
    method,
    declaredPct,
    logbookPct,
    vehicles: perVehicle,
    tenPercentTest: perVehicle.find((v) => v.tenPercentTest)?.tenPercentTest ?? null,
    progress,
    readingsDue,
    label: vehicleBusinessUseLabel({ method, pct, year, vehicleCount: perVehicle.length }),
    notes,
  };
}

function progressOf(
  periods: readonly LogbookPeriod[],
  vehicles: readonly LogbookVehicle[],
  nameOf: (id: string) => string,
  odometer: (vehicle: string, endOfDay: string) => number | null,
  span: (vehicle: string, from: string, to: string, what: string) => SpanUse,
  complete: (p: LogbookPeriod) => boolean,
  today: string,
  yearStart: string,
  yearEnd: string,
): { progress: LogbookProgress[]; readingsDue: ReadingDue[] } {
  const progress: LogbookProgress[] = [];
  const readingsDue: ReadingDue[] = [];
  const known = new Set(vehicles.map((v) => v.id));
  const shown = periods
    .filter((p) => known.has(p.vehicle_id) && (!complete(p) || (p.start_date <= yearEnd && p.end_date >= yearStart)))
    .sort((a, b) => a.start_date.localeCompare(b.start_date));

  for (const p of shown) {
    const vehicleName = nameOf(p.vehicle_id);
    const months = monthsOf(p.start_date, LOGBOOK_PERIOD_MONTHS[p.kind]);
    const startKnown = num(p.odometer_start) != null;
    const endKnown = num(p.odometer_end) != null;
    const done = complete(p);
    const due = (kind: ReadingDueKind, date: string, label: string) =>
      readingsDue.push({ vehicleId: p.vehicle_id, vehicleName, periodId: p.id, kind, date, label });

    let monthsLogged: number;
    let soFar: LogbookProgress["soFar"] = null;
    if (p.kind === "base") {
      monthsLogged = 0;
      if (startKnown) {
        months.forEach((m, i) => {
          if (odometer(p.vehicle_id, m.end) != null) monthsLogged = i + 1;
        });
      }
      if (!done && monthsLogged > 0) {
        const through = months[monthsLogged - 1].end;
        const use = span(p.vehicle_id, p.start_date, through, "the base year so far");
        if (use.pct != null && use.totalKm != null) soFar = { through, businessKm: use.businessKm, totalKm: use.totalKm, pct: round4(use.pct) };
      }
    } else {
      monthsLogged = months.filter((m) => m.end <= today).length;
    }

    const parts: string[] = [];
    if (done) parts.push("complete");
    else if (p.kind === "base") parts.push(`${monthsLogged} of 12 months logged`);
    else parts.push(`${monthsLogged} of 3 months elapsed`);
    if (!startKnown && today >= p.start_date) parts.push("odometer at the start not entered");
    if (!endKnown && today >= p.end_date) parts.push("odometer at the end not entered");

    progress.push({
      periodId: p.id, vehicleId: p.vehicle_id, vehicleName, kind: p.kind, startDate: p.start_date, endDate: p.end_date,
      monthsTotal: months.length, monthsLogged, complete: done, soFar,
      label: `${periodName(p)}: ${parts.join(", ")}`,
    });

    if (done) continue;
    if (!startKnown && today >= p.start_date) due("period_start", p.start_date, `Odometer at the start of ${logbookDateLabel(p.start_date)}`);
    if (p.kind === "base") {
      for (const m of months.slice(0, -1)) {
        if (m.end <= today && odometer(p.vehicle_id, m.end) == null) due("month_end", m.end, `Odometer at the end of ${logbookDateLabel(m.end)}`);
      }
    }
    if (!endKnown && today >= p.end_date) due("period_end", p.end_date, `Odometer at the end of ${logbookDateLabel(p.end_date)}`);
  }
  readingsDue.sort((a, b) => a.date.localeCompare(b.date) || a.vehicleName.localeCompare(b.vehicleName));
  return { progress, readingsDue };
}

function fmtKm(km: number): string {
  return `${Math.round(km).toLocaleString("en-CA")} km`;
}

function fmtPctShort(p: number): string {
  const v = Math.round(p * 1000) / 10;
  return `${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)}%`;
}

/** The one-line label every surface prints beside the share. */
export function vehicleBusinessUseLabel(r: Pick<VehicleBusinessUse, "method" | "pct" | "year"> & { vehicleCount?: number }): string {
  const pct = fmtPctShort(r.pct);
  const several = (r.vehicleCount ?? 1) > 1 ? ", combined across vehicles by km driven" : "";
  if (r.method === "full") return `${pct}, computed from the ${r.year} logbook${several}`;
  if (r.method === "simplified") return `${pct}, computed from the logbook by CRA's simplified method${several}`;
  return `${pct}, declared in Settings (not computed from a logbook)`;
}

// ── The resolver ───────────────────────────────────────────────────────────

/**
 * THE vehicle business-use share for a year. Every surface gets it through
 * here (expense-totals-engine's `expenseTaxContext` calls it), so the
 * T2125 lines and PDF, expense totals, the GST/HST return's vehicle ITC
 * limit, the tax estimate, Flight Crew and MCP all apply the same figure.
 * No logbook rows (null): the declared setting.
 */
export function vehicleBusinessUseFor(
  settings: { vehicle_business_use_pct?: number | string | null } | null | undefined,
  rows: LogbookRows | null | undefined,
  year: number,
  today?: string,
): VehicleBusinessUse {
  return vehicleBusinessUse({
    vehicles: rows?.vehicles ?? [],
    periods: rows?.periods ?? [],
    readings: rows?.readings ?? [],
    trips: rows?.trips ?? [],
    year,
    declaredPct: declaredVehicleBusinessUsePct(settings),
    today,
  });
}

// ── CRA's per-km allowance rates ───────────────────────────────────────────

export interface AllowanceRateFigure {
  /** km × CRA's tiered allowance rates. An employer-allowance benchmark, not a T2125 deduction. */
  amount: number;
  firstKm: number;
  beyondKm: number;
  rates: AllowanceRates;
  /** False when CRA has not published `year`'s rates and the latest year's were used. */
  exactYear: boolean;
}

/**
 * Business km × CRA's reasonable per-km allowance rates (first 5,000 km,
 * then the lower rate). What an employer could pay an employee for the same
 * driving. Labels say so (ALLOWANCE_RATE_NOTE); they never call it a
 * deduction.
 */
export function allowanceRateFigure(km: number, year: number): AllowanceRateFigure {
  const { rates, exactYear } = craAllowanceRates(year);
  const total = Math.max(0, Number.isFinite(km) ? km : 0);
  const firstKm = Math.min(total, rates.threshold);
  const beyondKm = Math.max(0, total - rates.threshold);
  return { amount: firstKm * rates.first5000 + beyondKm * rates.beyond5000, firstKm, beyondKm, rates, exactYear };
}
