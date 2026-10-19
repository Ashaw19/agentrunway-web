// CRA vehicle logbook tools (2026-10-18): the logbook's status, and the three
// writes an agent makes while keeping one.
//
// NOT a mirror. The share and everything about it (method, the 10% test,
// progress, the readings due) is vehicle-logbook-engine's
// `vehicleBusinessUseFor`, over the rows `loadLogbookRows` reads, both from
// the Deno copy of packages/core (`pnpm build:mcp-shared`): the same call
// expenseTaxContext makes for the dashboard. The writes are core's shared
// writers (core/lib/vehicle-logbook-writes.ts), the ones the web Mileage tab,
// Flight Crew and the phone run, so their rules are tested once. This file
// checks the arguments' shape, that a vehicle id is the agent's own, and
// turns the writer's answer into a tool result: a short confirmation, or the
// writer's error with isError.
//
// CRA's wording is cra-rules.ts's, never retyped here. Information, not tax
// advice: the tools state CRA's rule and what the agent's records give; which
// kind of period to keep, and what to claim, is the agent's decision with
// their accountant.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { McpTool, McpToolResult } from "./index.ts";
import { CANONICAL_TAX_DISCLAIMER_SHORT } from "../lib/constants.ts";
import { expenseTaxContext } from "../../_shared/core/engines/expense-totals-engine.ts";
import {
  defaultVehicleId,
  unassignedTripVehicleId,
  logbookPeriodEnd,
  logbookPeriodProblem,
  vehicleBusinessUseFor,
  type LogbookPeriodKind,
  type ReadingDueKind,
} from "../../_shared/core/engines/vehicle-logbook-engine.ts";
import { addDaysISO, atlanticISODate, atlanticYear } from "../../_shared/core/lib/local-date.ts";
import { loadLogbookRows, loadVehicles } from "../../_shared/core/lib/vehicle-logbook-rows.ts";
import {
  DEFAULT_VEHICLE_NAME,
  recordOdometerReading,
  startLogbookPeriod,
} from "../../_shared/core/lib/vehicle-logbook-writes.ts";
import { logTrip } from "../../_shared/core/lib/record-writers.ts";
import {
  CRA_MOTOR_VEHICLE_SOURCES,
  SIMPLIFIED_LOGBOOK_FORMULA,
  SIMPLIFIED_LOGBOOK_OUTSIDE_RANGE_RULE,
  SIMPLIFIED_LOGBOOK_RANGE_RULE,
  SIMPLIFIED_LOGBOOK_RULE,
  VEHICLE_LOGBOOK_RULE,
} from "../../_shared/core/tax-copy/cra-rules.ts";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const isPeriodKind = (v: unknown): v is LogbookPeriodKind => v === "base" || v === "sample";
const isReadingKind = (v: unknown): v is ReadingDueKind =>
  v === "period_start" || v === "month_end" || v === "period_end";

/** Percent, one decimal: 0.54326 → 54.3. */
const pct1 = (fraction: number) => Math.round(fraction * 1000) / 10;
const pctOrNull = (fraction: number | null) => (fraction == null ? null : pct1(fraction));
const round1 = (n: number) => Math.round(n * 10) / 10;
const numOrNull = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const optionalString = (v: unknown): string | null => (typeof v === "string" ? v : null);
const optionalNumber = (v: unknown): number | null | undefined =>
  v === undefined || v === null ? null : typeof v === "number" ? v : undefined;

function ok(payload: Record<string, unknown>): McpToolResult {
  return { content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }] };
}

/** A refused or failed write: the reason, for the agent. */
function refuse(message: string): McpToolResult {
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

const VEHICLE_NOT_FOUND =
  "That vehicle_id is not one of the agent's vehicles. get_logbook_status lists the vehicles with their ids.";

/**
 * What is wrong with a period's kind and start date, or null: the engine's
 * own check (logbookPeriodProblem), run before the writer so a refused
 * period never adds the default vehicle first.
 */
function periodShapeProblem(kind: LogbookPeriodKind, start: unknown): string | null {
  if (typeof start !== "string" || !/^\d{4}-\d{2}-01$/.test(start)) {
    // "Dates are YYYY-MM-DD." or "A logbook period starts on the 1st of a month."
    const s = typeof start === "string" ? start : "";
    return logbookPeriodProblem({ kind, start_date: s, end_date: s });
  }
  return logbookPeriodProblem({ kind, start_date: start, end_date: logbookPeriodEnd(kind, start) });
}

export function getLogbookTools(supabase: SupabaseClient, userId: string): McpTool[] {
  /** Null when `vehicleId` is one of the agent's vehicles, else why not. */
  const vehicleProblem = async (vehicleId: string): Promise<string | null> => {
    try {
      const vehicles = await loadVehicles(supabase, userId);
      return vehicles.some((v) => v.id === vehicleId) ? null : VEHICLE_NOT_FOUND;
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    }
  };

  return [
    // ── get_logbook_status ───────────────────────────────────────────────
    {
      name: "get_logbook_status",
      description:
        "Returns the agent's CRA vehicle logbook for a year (default: the current year): the vehicles with their ids, the vehicle business-use share the app applies that year and how it was worked out (method full: a base-year logbook that is the tax year; simplified: CRA's three-month sample method, (sample % / base-year same-period %) x base-year annual %; declared: the share typed in Settings, used when the logbook does not cover the year), each vehicle's figure, CRA's 10% test when a sample period was compared with a base year, each logbook period's progress, and the odometer readings due, each with the kind, vehicle_id, period_id and date that record_odometer_reading takes. Percentages are 0 to 100. A progress entry's so_far is an unfinished base year's share to date, shown for information and not applied. Includes CRA's rule, formula and source. ESTIMATE ONLY — not tax advice.",
      inputSchema: {
        type: "object",
        properties: {
          year: { type: "number", description: "Tax year (default: current year)." },
        },
        additionalProperties: false,
      },
      annotations: {
        title: "Vehicle Logbook Status",
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
      handler: async (args) => {
        const { year = atlanticYear() } = args as { year?: number };
        if (!Number.isInteger(year) || year < 2000 || year > 2100) return refuse("year is a calendar year such as 2026.");
        const today = atlanticISODate();

        const [settingsRes, rows] = await Promise.all([
          // The expense context's slice (expenseTaxContext).
          supabase
            .from("user_settings")
            .select("gst_hst_registered, vehicle_business_use_pct, home_office_business_use_pct")
            .eq("user_id", userId)
            .maybeSingle(),
          // Throws on a failed read: an empty logbook here would read as
          // "no logbook" and look valid.
          loadLogbookRows(supabase, userId, year),
        ]);
        if (settingsRes.error) throw settingsRes.error;

        // The share the year's expense figures apply: expenseTaxContext's, as in
        // loadExpenseInputs (it always sets it; the fallback is the same call).
        const ctx = expenseTaxContext(settingsRes.data, { rows, year, today });
        const use = ctx.vehicleBusinessUse ?? vehicleBusinessUseFor(settingsRes.data, rows, year, today);
        const defaultId = defaultVehicleId(rows.vehicles);
        const unassignedId = unassignedTripVehicleId(rows.vehicles);
        const test = use.tenPercentTest;

        return ok({
          disclaimer: CANONICAL_TAX_DISCLAIMER_SHORT,
          year,
          as_of: today,
          vehicles: rows.vehicles.map((v) => ({
            id: v.id,
            name: v.name,
            model_year: v.model_year,
            make: v.make,
            model: v.model,
            is_active: v.is_active,
            // New trips and periods go on this one when none is given (the oldest active vehicle).
            is_default: v.id === defaultId,
            // Trips saved with no vehicle (before vehicles existed) count for this one: the oldest, active or not.
            has_unassigned_trips: v.id === unassignedId,
          })),
          business_use: {
            pct: pct1(use.pct),
            method: use.method,
            label: use.label,
            declared_pct: pct1(use.declaredPct),
            logbook_pct: pctOrNull(use.logbookPct),
            notes: use.notes,
          },
          by_vehicle: use.vehicles.map((v) => ({
            vehicle_id: v.vehicleId,
            vehicle_name: v.vehicleName,
            method: v.method,
            pct: pctOrNull(v.pct),
            business_km: round1(v.businessKm),
            total_km: v.totalKm == null ? null : round1(v.totalKm),
            reason: v.reason,
          })),
          ten_percent_test: test
            ? {
                vehicle_id: test.vehicleId,
                sample_pct: pct1(test.samplePct),
                base_same_period_pct: pct1(test.baseSamePeriodPct),
                base_annual_pct: pct1(test.baseAnnualPct),
                calculated_pct: pct1(test.calculatedPct),
                lower_pct: pct1(test.lowerPct),
                upper_pct: pct1(test.upperPct),
                passed: test.passed,
                sample_period: test.sample,
                base_year: test.base,
              }
            : null,
          progress: use.progress.map((p) => ({
            period_id: p.periodId,
            vehicle_id: p.vehicleId,
            vehicle_name: p.vehicleName,
            kind: p.kind,
            start_date: p.startDate,
            end_date: p.endDate,
            months_logged: p.monthsLogged,
            months_total: p.monthsTotal,
            complete: p.complete,
            so_far: p.soFar
              ? { through: p.soFar.through, business_km: round1(p.soFar.businessKm), total_km: round1(p.soFar.totalKm), pct: pct1(p.soFar.pct) }
              : null,
            label: p.label,
          })),
          readings_due: use.readingsDue.map((r) => ({
            kind: r.kind,
            vehicle_id: r.vehicleId,
            vehicle_name: r.vehicleName,
            period_id: r.periodId,
            date: r.date,
            label: r.label,
          })),
          // Two different odometer readings for the end of the same day: the
          // spans that need it are not worked out until one is corrected.
          odometer_conflicts: use.conflicts.map((c) => ({ vehicle_id: c.vehicleId, date: c.date, values_km: c.values })),
          cra_rule: {
            logbook: VEHICLE_LOGBOOK_RULE,
            simplified: SIMPLIFIED_LOGBOOK_RULE,
            formula: SIMPLIFIED_LOGBOOK_FORMULA,
            range: SIMPLIFIED_LOGBOOK_RANGE_RULE,
            ...(test && !test.passed ? { outside_range: SIMPLIFIED_LOGBOOK_OUTSIDE_RANGE_RULE } : {}),
            source: CRA_MOTOR_VEHICLE_SOURCES.records,
          },
        });
      },
    },

    // ── start_logbook_period ─────────────────────────────────────────────
    {
      name: "start_logbook_period",
      description: `Starts a CRA logbook period for one of the agent's vehicles. Call it only when the agent asks to start one. kind "base" is a base year: a full logbook for 12 months from the 1st of a month. kind "sample" is a three-month sample period from the 1st of a month, after a finished base year of the same vehicle. ${SIMPLIFIED_LOGBOOK_RULE} The end date follows from the kind. Without vehicle_id the period is for the agent's default vehicle (one named "${DEFAULT_VEHICLE_NAME}" is added when the agent has none). odometer_start is the odometer as the period begins; record_odometer_reading can add it later. Which kind of period to keep is the agent's decision with their accountant; this tool does not choose one.`,
      inputSchema: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["base", "sample"], description: "base: a 12-month base year. sample: a 3-month sample period." },
          start_date: { type: "string", description: "First day of the period, the 1st of a month (YYYY-MM-01)." },
          vehicle_id: { type: "string", description: "The vehicle (an id from get_logbook_status). Omit for the default vehicle." },
          odometer_start: { type: "number", description: "Odometer reading in km as the period begins, when the agent has it." },
          notes: { type: "string", description: "Free-text notes." },
        },
        required: ["kind", "start_date"],
        additionalProperties: false,
      },
      annotations: {
        title: "Start Logbook Period",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
      handler: async (args) => {
        const a = (args ?? {}) as Record<string, unknown>;
        const kind = a.kind;
        const startDate = a.start_date;
        if (!isPeriodKind(kind)) return refuse("kind is base (a 12-month base year) or sample (a 3-month sample period).");
        const shape = periodShapeProblem(kind, startDate);
        if (shape || typeof startDate !== "string") return refuse(shape ?? "Dates are YYYY-MM-DD.");
        const odometerStart = optionalNumber(a.odometer_start);
        if (odometerStart === undefined) return refuse("odometer_start is a number of km.");
        const vehicleId = optionalString(a.vehicle_id);
        if (vehicleId) {
          const problem = await vehicleProblem(vehicleId);
          if (problem) return refuse(problem);
        }

        const res = await startLogbookPeriod(supabase, userId, {
          vehicleId,
          kind,
          startDate,
          odometerStart,
          notes: optionalString(a.notes),
        });
        if (!res.ok) return refuse(res.error);
        const p = res.value;
        return ok({
          started: p.kind === "base" ? "base year" : "sample period",
          period_id: p.id,
          vehicle_id: p.vehicle_id,
          kind: p.kind,
          start_date: p.start_date,
          end_date: p.end_date,
          odometer_start: numOrNull(p.odometer_start),
          readings: "get_logbook_status lists the odometer readings due for this period: its start (when not given here), the end of each month of a base year, and its end.",
          disclaimer: CANONICAL_TAX_DISCLAIMER_SHORT,
        });
      },
    },

    // ── log_mileage ──────────────────────────────────────────────────────
    {
      name: "log_mileage",
      description:
        "Logs one business trip in the agent's mileage log: the date, a description (where and why), and the km driven, or the odometer at the trip's start and end (km is then worked out from them; when both are given they agree within 0.5 km). from_location, to_location, purpose and notes are optional. Without vehicle_id the trip is saved with the agent's default vehicle (the oldest active one). Only business trips belong in the log: total km come from the logbook's odometer readings (get_logbook_status). Returns the saved trip.",
      inputSchema: {
        type: "object",
        properties: {
          trip_date: { type: "string", description: "Trip date (YYYY-MM-DD). Default: today (Atlantic time)." },
          description: { type: "string", description: "Where and why, e.g. 'Showing at 12 Main St'." },
          km: { type: "number", description: "Km driven. Optional when odometer_start and odometer_end are given." },
          odometer_start: { type: "number", description: "Odometer in km at the start of the trip." },
          odometer_end: { type: "number", description: "Odometer in km at the end of the trip." },
          from_location: { type: "string", description: "Where the trip started." },
          to_location: { type: "string", description: "Where the trip went." },
          purpose: { type: "string", description: "Business purpose, e.g. 'Listing appointment'." },
          vehicle_id: { type: "string", description: "The vehicle (an id from get_logbook_status). Omit for the default vehicle." },
          notes: { type: "string", description: "Free-text notes." },
        },
        required: ["description"],
        additionalProperties: false,
      },
      annotations: {
        title: "Log Mileage",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
      handler: async (args) => {
        const a = (args ?? {}) as Record<string, unknown>;
        const km = optionalNumber(a.km);
        const odometerStart = optionalNumber(a.odometer_start);
        const odometerEnd = optionalNumber(a.odometer_end);
        if (km === undefined || odometerStart === undefined || odometerEnd === undefined) {
          return refuse("km, odometer_start and odometer_end are numbers of km.");
        }
        const tripDate = a.trip_date === undefined ? atlanticISODate() : optionalString(a.trip_date) ?? "";
        const vehicleId = optionalString(a.vehicle_id);
        if (vehicleId) {
          const problem = await vehicleProblem(vehicleId);
          if (problem) return refuse(problem);
        }

        const res = await logTrip(supabase, userId, {
          tripDate,
          description: optionalString(a.description) ?? "",
          km,
          odometerStart,
          odometerEnd,
          vehicleId,
          fromLocation: optionalString(a.from_location),
          toLocation: optionalString(a.to_location),
          purpose: optionalString(a.purpose),
          notes: optionalString(a.notes),
        });
        if (!res.ok) return refuse(res.error);
        const t = res.value;
        return ok({
          saved: "trip",
          id: t.id ?? null,
          trip_date: t.trip_date,
          description: t.description,
          km: numOrNull(t.km),
          km_from: km != null ? "km given" : "odometer",
          vehicle_id: t.vehicle_id ?? null,
          odometer_start: numOrNull(t.odometer_start),
          odometer_end: numOrNull(t.odometer_end),
        });
      },
    },

    // ── record_odometer_reading ──────────────────────────────────────────
    {
      name: "record_odometer_reading",
      description:
        "Saves an odometer reading the agent's logbook has due: the odometer as a logbook period begins (kind period_start, with period_id), at the end of a month of a base year (kind month_end, with vehicle_id and date, the last day of the month), or at the end of a period (kind period_end, with period_id). km is the odometer reading, not a distance. get_logbook_status lists the readings due, each with the kind, vehicle_id, period_id and date to pass here. A reading for a period or a day that already has one replaces it.",
      inputSchema: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["period_start", "month_end", "period_end"], description: "Which reading this is." },
          km: { type: "number", description: "The odometer reading in km." },
          period_id: { type: "string", description: "period_start and period_end: the logbook period (from get_logbook_status)." },
          vehicle_id: { type: "string", description: "month_end: the vehicle (from get_logbook_status)." },
          date: { type: "string", description: "month_end: the last day of the month the reading is the end of (YYYY-MM-DD)." },
        },
        required: ["kind", "km"],
        additionalProperties: false,
      },
      annotations: {
        title: "Record Odometer Reading",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
      handler: async (args) => {
        const a = (args ?? {}) as Record<string, unknown>;
        const kind = a.kind;
        if (!isReadingKind(kind)) return refuse("kind is period_start, month_end or period_end.");
        if (typeof a.km !== "number") return refuse("km is the odometer reading, a number of km.");
        const periodId = optionalString(a.period_id);
        const vehicleId = optionalString(a.vehicle_id);
        const date = optionalString(a.date);

        if (kind === "month_end") {
          if (!vehicleId) return refuse("A month-end reading is for one vehicle: pass vehicle_id (get_logbook_status lists the readings due with theirs).");
          if (!date || !ISO_DATE.test(date) || !addDaysISO(date, 1).endsWith("-01")) {
            return refuse("A month-end reading's date is the last day of a month (YYYY-MM-DD), for example 2026-03-31.");
          }
          const problem = await vehicleProblem(vehicleId);
          if (problem) return refuse(problem);
        }

        const res = await recordOdometerReading(supabase, userId, {
          kind,
          // Period readings are saved on the period row; the vehicle is the period's.
          vehicleId: vehicleId ?? "",
          periodId,
          date,
          km: a.km,
        });
        if (!res.ok) return refuse(res.error);
        return ok({
          recorded: kind,
          odometer_km: round1(a.km),
          ...(kind === "month_end" ? { vehicle_id: vehicleId, date } : { period_id: periodId }),
          next: "get_logbook_status shows what is still due and the business-use share once a period is complete.",
        });
      },
    },
  ];
}
