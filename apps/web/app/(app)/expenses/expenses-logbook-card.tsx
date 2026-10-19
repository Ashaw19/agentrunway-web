"use client";

/**
 * Logbook mode on the Mileage tab (2026-10-18): vehicles, CRA logbook
 * periods, odometer readings, and the vehicle business-use share they give.
 *
 * The share and every figure here come from vehicle-logbook-engine
 * (`vehicleUse`, resolved by the page through expenseTaxContext), the same
 * figure the T2125 lines, the GST/HST return, expense totals and the tax
 * estimate use. Writes go through core/lib/vehicle-logbook-writes.ts, the
 * writers Flight Crew, MCP and the phone use. Configuration (vehicles and
 * periods) lives here on the web; the phone captures trips and readings.
 *
 * Copy states CRA's rule (tax-copy/cra-rules.ts) and what the records give.
 * It never says which method or period to use.
 */

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Car, Check, ChevronDown, Gauge, Loader2, Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { TaxDisclaimer } from "@/components/tax-disclaimer";
import { cn } from "@/lib/utils";
import {
  defaultVehicleId,
  unassignedTripVehicleId,
  logbookDateLabel,
  logbookPeriodEnd,
  logbookPeriodProblem,
  type LogbookPeriod,
  type LogbookPeriodKind,
  type LogbookReading,
  type LogbookRows,
  type LogbookVehicle,
  type VehicleBusinessUse,
} from "@agent-runway/core/engines/vehicle-logbook-engine";
import {
  addVehicle,
  recordOdometerReading,
  startLogbookPeriod,
} from "@agent-runway/core/lib/vehicle-logbook-writes";
import {
  CRA_MOTOR_VEHICLE_SOURCES,
  MULTIPLE_VEHICLES_RULE,
  SIMPLIFIED_LOGBOOK_EXAMPLE,
  SIMPLIFIED_LOGBOOK_FORMULA,
  SIMPLIFIED_LOGBOOK_OUTSIDE_RANGE_RULE,
  SIMPLIFIED_LOGBOOK_RANGE_RULE,
  SIMPLIFIED_LOGBOOK_RULE,
  VEHICLE_LOGBOOK_RETENTION_RULE,
  VEHICLE_LOGBOOK_RULE,
} from "@agent-runway/core/tax-copy";
import { addDaysISO, localISODate } from "@agent-runway/core/lib/local-date";

interface Props {
  year: number;
  rows: LogbookRows | null;
  vehicleUse: VehicleBusinessUse | null;
  declaredVehiclePct: number;
  /** Re-read the logbook after a write (the page's share follows). */
  onChanged: () => Promise<void>;
}

const pct = (p: number) => {
  const v = Math.round(p * 1000) / 10;
  return `${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)}%`;
};
const km = (n: number) => `${Math.round(n).toLocaleString("en-CA")} km`;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The last day of each month of a period (display only: which reading goes where). */
function monthEnds(start: string, months: number): string[] {
  const [y, m] = start.split("-").map(Number);
  return Array.from({ length: months }, (_, i) => {
    const next = (m - 1) + i + 1; // months after January of `y`, 0-based, of the following month
    const firstOfNext = `${y + Math.floor(next / 12)}-${String((next % 12) + 1).padStart(2, "0")}-01`;
    return addDaysISO(firstOfNext, -1);
  });
}

const shortDay = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`;

export function ExpensesLogbookCard({ year, rows, vehicleUse, declaredVehiclePct, onChanged }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const today = localISODate();
  const vehicles = useMemo(
    () => [...(rows?.vehicles ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at)),
    [rows],
  );
  const periods = useMemo(
    () => [...(rows?.periods ?? [])].sort((a, b) => a.start_date.localeCompare(b.start_date)),
    [rows],
  );
  const readings = rows?.readings ?? [];
  const [open, setOpen] = useState(periods.length > 0);
  const [busy, setBusy] = useState<string | null>(null);

  async function userId(): Promise<string | null> {
    const { data: { user } } = await supabase.auth.getUser();
    return user?.id ?? null;
  }

  // ── Add a vehicle ────────────────────────────────────────────────────────
  const [vehicleForm, setVehicleForm] = useState<{ name: string; year: string; make: string; model: string } | null>(null);
  async function saveVehicle() {
    if (!vehicleForm) return;
    const uid = await userId();
    if (!uid) return;
    setBusy("vehicle");
    const yr = vehicleForm.year.trim() ? Number(vehicleForm.year) : null;
    const r = await addVehicle(supabase, uid, { name: vehicleForm.name, model_year: yr, make: vehicleForm.make, model: vehicleForm.model });
    setBusy(null);
    if (!r.ok) { toast.error(r.error); return; }
    setVehicleForm(null);
    toast.success(`${r.value.name} added`);
    await onChanged();
  }

  async function setActive(v: LogbookVehicle, active: boolean) {
    const uid = await userId();
    if (!uid) return;
    setBusy(`active-${v.id}`);
    const { error } = await supabase.from("vehicles").update({ is_active: active }).eq("id", v.id).eq("user_id", uid);
    setBusy(null);
    if (error) { toast.error("The vehicle was not updated. Please try again."); return; }
    await onChanged();
  }

  // ── Start a period ───────────────────────────────────────────────────────
  const thisMonth = today.slice(0, 7);
  const [periodForm, setPeriodForm] = useState<{ vehicleId: string; kind: LogbookPeriodKind; month: string; odometer: string } | null>(null);
  const formStart = periodForm ? `${periodForm.month}-01` : "";
  const formProblem = periodForm && periodForm.month
    ? logbookPeriodProblem(
        { kind: periodForm.kind, start_date: formStart, end_date: logbookPeriodEnd(periodForm.kind, formStart), vehicle_id: periodForm.vehicleId || defaultVehicleId(vehicles) || "new" },
        periods,
      )
    : null;

  async function savePeriod() {
    if (!periodForm) return;
    const uid = await userId();
    if (!uid) return;
    setBusy("period");
    const odo = periodForm.odometer.trim() ? Number(periodForm.odometer.replace(/,/g, "")) : null;
    const r = await startLogbookPeriod(supabase, uid, {
      vehicleId: periodForm.vehicleId || null,
      kind: periodForm.kind,
      startDate: formStart,
      odometerStart: odo,
    });
    setBusy(null);
    if (!r.ok) { toast.error(r.error); return; }
    setPeriodForm(null);
    toast.success(`${r.value.kind === "base" ? "Base year" : "Sample period"} started: ${logbookDateLabel(r.value.start_date)} to ${logbookDateLabel(r.value.end_date)}`);
    await onChanged();
  }

  async function removePeriod(p: LogbookPeriod) {
    if (!window.confirm(`Remove this ${p.kind === "base" ? "base year" : "sample period"} (${logbookDateLabel(p.start_date)} to ${logbookDateLabel(p.end_date)}) and its start and end odometer readings? Trips stay in the trip log.`)) return;
    const uid = await userId();
    if (!uid) return;
    setBusy(`remove-${p.id}`);
    const { error } = await supabase.from("vehicle_logbook_periods").delete().eq("id", p.id).eq("user_id", uid);
    setBusy(null);
    if (error) { toast.error("The period was not removed. Please try again."); return; }
    await onChanged();
  }

  // ── Odometer readings ────────────────────────────────────────────────────
  async function saveReading(input: { kind: "period_start" | "month_end" | "period_end"; vehicleId: string; periodId?: string; date?: string }, raw: string, current: number | null) {
    const value = raw.trim() === "" ? null : Number(raw.replace(/,/g, ""));
    if (value == null || value === current) return;
    if (!Number.isFinite(value)) { toast.error("The odometer reading is a number of km."); return; }
    const uid = await userId();
    if (!uid) return;
    const key = `${input.kind}-${input.periodId ?? input.date}`;
    setBusy(key);
    const r = await recordOdometerReading(supabase, uid, { ...input, km: value });
    setBusy(null);
    if (!r.ok) { toast.error(r.error); return; }
    toast.success("Odometer reading saved");
    await onChanged();
  }

  const readingAt = (vehicleId: string, endOfDay: string): number | null => {
    const r = readings.find((x: LogbookReading) => x.vehicle_id === vehicleId && x.reading_date === endOfDay);
    return r ? Number(r.odometer_km) : null;
  };

  const nameOf = (id: string) => vehicles.find((v) => v.id === id)?.name ?? "Vehicle";
  const test = vehicleUse?.tenPercentTest ?? null;

  return (
    <Card className="rounded-2xl border-slate-200 shadow-sm">
      <CardHeader className="pb-3">
        <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-start justify-between gap-3 text-left">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Gauge className="h-4 w-4 text-muted-foreground" />
              CRA logbook
              {vehicleUse && (
                <Badge variant="secondary" className={cn("text-xs", vehicleUse.method !== "declared" && "bg-emerald-100 text-emerald-800")}>
                  {pct(vehicleUse.pct)} {vehicleUse.method === "declared" ? "declared" : "from the logbook"}
                </Badge>
              )}
            </CardTitle>
            <CardDescription className="mt-1 text-xs">{SIMPLIFIED_LOGBOOK_RULE}</CardDescription>
          </div>
          <ChevronDown className={cn("mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
        </button>
      </CardHeader>

      {open && (
        <CardContent className="space-y-5 pt-0">
          {/* ── The share for the year ─────────────────────────────────── */}
          {vehicleUse && (
            <div className={cn("rounded-xl border p-4", vehicleUse.method === "declared" ? "border-amber-200 bg-amber-50/50" : "border-emerald-200 bg-emerald-50/50")}>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Vehicle business use, {year}</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-slate-800">{pct(vehicleUse.pct)}</p>
              <p className="text-sm text-slate-700">{vehicleUse.label}</p>
              {test && (
                <div className="mt-3 space-y-1 text-xs text-slate-700">
                  <p className="font-medium">{SIMPLIFIED_LOGBOOK_FORMULA}</p>
                  <p className="tabular-nums">
                    ({pct(test.samplePct)} ÷ {pct(test.baseSamePeriodPct)}) × {pct(test.baseAnnualPct)} = {pct(test.calculatedPct)}
                    <span className="text-muted-foreground">
                      {" "}(sample {shortDay(test.sample.start)} to {shortDay(test.sample.end)} {test.sample.start.slice(0, 4)}; base year {logbookDateLabel(test.base.start)} to {logbookDateLabel(test.base.end)})
                    </span>
                  </p>
                  <p>
                    CRA&apos;s range for this base year: {pct(Math.max(0, test.lowerPct))} to {pct(Math.min(1, test.upperPct))}.{" "}
                    {test.passed ? "The calculated figure is inside it." : "The calculated figure is outside it."}
                  </p>
                  {!test.passed && <p className="text-amber-800">{SIMPLIFIED_LOGBOOK_OUTSIDE_RANGE_RULE}</p>}
                </div>
              )}
              {vehicleUse.method === "declared" && (
                <p className="mt-2 text-xs text-amber-900/80">
                  The declared {pct(declaredVehiclePct)} applies to {year} until the logbook covers it: a finished base year that
                  runs January to December {year}, or a finished sample period in {year} after a finished base year.
                </p>
              )}
              {vehicleUse.vehicles.length > 1 && (
                <ul className="mt-2 space-y-0.5 text-xs text-slate-600">
                  {vehicleUse.vehicles.map((v) => (
                    <li key={v.vehicleId}>
                      {v.vehicleName}: {v.pct != null ? `${pct(v.pct)} (${v.method === "full" ? "full logbook" : "simplified method"})` : "no figure for this year"}
                    </li>
                  ))}
                </ul>
              )}
              {vehicleUse.notes.length > 0 && (
                <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
                  {vehicleUse.notes.map((n) => <li key={n}>{n}</li>)}
                </ul>
              )}
            </div>
          )}

          {/* ── Vehicles ───────────────────────────────────────────────── */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold">Vehicles</p>
              {!vehicleForm && (
                <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => setVehicleForm({ name: "", year: "", make: "", model: "" })}>
                  <Plus className="h-3 w-3" /> Add vehicle
                </Button>
              )}
            </div>
            {vehicles.length === 0 && !vehicleForm && (
              <p className="text-xs text-muted-foreground">
                No vehicles yet. Starting a logbook period adds &ldquo;My vehicle&rdquo;; trips logged before then count for it, and new trips are saved with it.
              </p>
            )}
            <ul className="space-y-1">
              {vehicles.map((v) => (
                <li key={v.id} className="flex items-center justify-between rounded-lg border px-3 py-1.5 text-sm">
                  <span className="flex items-center gap-2">
                    <Car className="h-3.5 w-3.5 text-muted-foreground" />
                    {v.name}
                    {v.id === defaultVehicleId(vehicles) && (
                      <Badge variant="outline" className="text-[10px] font-normal">new trips go here</Badge>
                    )}
                    {vehicles.length > 1 && v.id === unassignedTripVehicleId(vehicles) && (
                      <Badge variant="outline" className="text-[10px] font-normal">trips logged before vehicles count here</Badge>
                    )}
                    {!v.is_active && <Badge variant="secondary" className="text-[10px]">inactive</Badge>}
                  </span>
                  <button
                    type="button"
                    className="text-xs text-muted-foreground underline-offset-2 hover:underline disabled:opacity-50"
                    disabled={busy === `active-${v.id}`}
                    onClick={() => setActive(v, !v.is_active)}
                  >
                    {v.is_active ? "Mark inactive" : "Mark active"}
                  </button>
                </li>
              ))}
            </ul>
            {vehicleForm && (
              <div className="mt-2 grid gap-2 rounded-lg border bg-muted/30 p-3 sm:grid-cols-5">
                <div className="space-y-1 sm:col-span-2">
                  <Label className="text-xs">Name</Label>
                  <Input className="h-8 text-sm" placeholder="e.g. Crossover" value={vehicleForm.name} onChange={(e) => setVehicleForm({ ...vehicleForm, name: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Year <span className="text-muted-foreground">(optional)</span></Label>
                  <Input className="h-8 text-sm" inputMode="numeric" value={vehicleForm.year} onChange={(e) => setVehicleForm({ ...vehicleForm, year: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Make <span className="text-muted-foreground">(optional)</span></Label>
                  <Input className="h-8 text-sm" value={vehicleForm.make} onChange={(e) => setVehicleForm({ ...vehicleForm, make: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Model <span className="text-muted-foreground">(optional)</span></Label>
                  <Input className="h-8 text-sm" value={vehicleForm.model} onChange={(e) => setVehicleForm({ ...vehicleForm, model: e.target.value })} />
                </div>
                <div className="flex justify-end gap-2 sm:col-span-5">
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setVehicleForm(null)}>Cancel</Button>
                  <Button size="sm" className="h-7 gap-1 text-xs" disabled={busy === "vehicle" || !vehicleForm.name.trim()} onClick={saveVehicle}>
                    {busy === "vehicle" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} Save vehicle
                  </Button>
                </div>
              </div>
            )}
            {vehicles.length > 1 && <p className="mt-2 text-[11px] text-muted-foreground">{MULTIPLE_VEHICLES_RULE} Agent Runway&apos;s vehicle expenses are not split by vehicle, so one share is applied to all of them: each vehicle&apos;s share weighted by its total km.</p>}
          </div>

          {/* ── Periods and readings ───────────────────────────────────── */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold">Logbook periods</p>
              {!periodForm && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1 text-xs"
                  onClick={() => setPeriodForm({ vehicleId: defaultVehicleId(vehicles) ?? "", kind: "base", month: thisMonth, odometer: "" })}
                >
                  <Plus className="h-3 w-3" /> Start a period
                </Button>
              )}
            </div>

            {periodForm && (
              <div className="mb-3 grid gap-2 rounded-lg border bg-muted/30 p-3 sm:grid-cols-4">
                <div className="space-y-1">
                  <Label className="text-xs">Kind</Label>
                  <select
                    className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
                    value={periodForm.kind}
                    onChange={(e) => setPeriodForm({ ...periodForm, kind: e.target.value as LogbookPeriodKind })}
                  >
                    <option value="base">Base year (12 months)</option>
                    <option value="sample">Sample period (3 months)</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Starts</Label>
                  <Input type="month" className="h-8 text-sm" value={periodForm.month} onChange={(e) => setPeriodForm({ ...periodForm, month: e.target.value })} />
                </div>
                {vehicles.length > 1 && (
                  <div className="space-y-1">
                    <Label className="text-xs">Vehicle</Label>
                    <select
                      className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
                      value={periodForm.vehicleId}
                      onChange={(e) => setPeriodForm({ ...periodForm, vehicleId: e.target.value })}
                    >
                      {vehicles.filter((v) => v.is_active).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                    </select>
                  </div>
                )}
                <div className="space-y-1">
                  <Label className="text-xs">Odometer at the start <span className="text-muted-foreground">(optional now)</span></Label>
                  <Input className="h-8 text-sm" inputMode="decimal" placeholder="km" value={periodForm.odometer} onChange={(e) => setPeriodForm({ ...periodForm, odometer: e.target.value })} />
                </div>
                <p className="text-xs text-muted-foreground sm:col-span-4">
                  {periodForm.month && !formProblem
                    ? `Runs ${logbookDateLabel(formStart)} to ${logbookDateLabel(logbookPeriodEnd(periodForm.kind, formStart))}.`
                    : formProblem}
                  {periodForm.kind === "base" && " A base year that runs January to December also gives that year's business use from the full logbook."}
                </p>
                <div className="flex justify-end gap-2 sm:col-span-4">
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setPeriodForm(null)}>Cancel</Button>
                  <Button size="sm" className="h-7 gap-1 text-xs" disabled={busy === "period" || !periodForm.month || !!formProblem} onClick={savePeriod}>
                    {busy === "period" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} Start
                  </Button>
                </div>
              </div>
            )}

            {periods.length === 0 && !periodForm && (
              <p className="text-xs text-muted-foreground">
                No logbook periods yet. Until a period covers a year, that year uses the declared {pct(declaredVehiclePct)}.
              </p>
            )}

            <div className="space-y-3">
              {periods.map((p) => {
                const progress = vehicleUse?.progress.find((x) => x.periodId === p.id);
                const ends = monthEnds(p.start_date, p.kind === "base" ? 12 : 3);
                const startOdo = p.odometer_start == null ? null : Number(p.odometer_start);
                const endOdo = p.odometer_end == null ? null : Number(p.odometer_end);
                const finished = startOdo != null && endOdo != null && p.end_date <= today;
                const name = `${p.kind === "base" ? "Base year" : "Sample period"} (${MONTHS[Number(p.start_date.slice(5, 7)) - 1]} ${p.start_date.slice(0, 4)} to ${MONTHS[Number(p.end_date.slice(5, 7)) - 1]} ${p.end_date.slice(0, 4)})`;
                const cells: { key: string; label: string; date: string; value: number | null; kind: "period_start" | "month_end" | "period_end" }[] = [
                  { key: "start", label: `Start (${shortDay(p.start_date)})`, date: p.start_date, value: startOdo, kind: "period_start" },
                  ...(p.kind === "base"
                    ? ends.slice(0, -1).map((d) => ({ key: d, label: `End of ${shortDay(d)}`, date: d, value: readingAt(p.vehicle_id, d), kind: "month_end" as const }))
                    : []),
                  { key: "end", label: `End (${shortDay(p.end_date)})`, date: p.end_date, value: endOdo, kind: "period_end" },
                ];
                return (
                  <div key={p.id} className="rounded-lg border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium">
                        {progress?.label ?? `${name}${finished ? ": complete" : ""}`}
                        {vehicles.length > 1 && <span className="text-muted-foreground"> · {nameOf(p.vehicle_id)}</span>}
                      </p>
                      <button
                        type="button"
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-red-600 disabled:opacity-50"
                        disabled={busy === `remove-${p.id}`}
                        onClick={() => removePeriod(p)}
                      >
                        <Trash2 className="h-3 w-3" /> Remove
                      </button>
                    </div>
                    {progress?.soFar && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        So far ({logbookDateLabel(p.start_date)} to {logbookDateLabel(progress.soFar.through)}): {km(progress.soFar.businessKm)} business of {km(progress.soFar.totalKm)} ({pct(progress.soFar.pct)}). Shown for information; not applied until the base year is finished.
                      </p>
                    )}
                    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
                      {cells.map((c) => {
                        const due = today >= c.date;
                        return (
                          <div key={`${c.key}-${c.value ?? ""}`} className="space-y-0.5">
                            <Label className="text-[10px] text-muted-foreground">{c.label}</Label>
                            <Input
                              className={cn("h-7 text-xs tabular-nums", c.value == null && due && !finished && "border-amber-300")}
                              inputMode="decimal"
                              placeholder={due ? "km" : "later"}
                              disabled={!due || busy === `${c.kind}-${c.kind === "month_end" ? c.date : p.id}`}
                              defaultValue={c.value ?? ""}
                              onBlur={(e) =>
                                saveReading(
                                  c.kind === "month_end"
                                    ? { kind: "month_end", vehicleId: p.vehicle_id, date: c.date }
                                    : { kind: c.kind, vehicleId: p.vehicle_id, periodId: p.id },
                                  e.target.value,
                                  c.value,
                                )
                              }
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            {periods.some((p) => p.kind === "base") && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                Each reading is the odometer at the end of that day; the start reading is the odometer as the period begins.
                CRA&apos;s simplified method compares a later sample with the same months of the base year, so the base
                year&apos;s month-end readings are what that comparison is worked out from.
              </p>
            )}
          </div>

          {/* ── CRA's rule ─────────────────────────────────────────────── */}
          <details className="rounded-lg border bg-muted/20 p-3 text-xs text-slate-700">
            <summary className="cursor-pointer font-medium">CRA&apos;s logbook rules</summary>
            <div className="mt-2 space-y-2">
              <p>{VEHICLE_LOGBOOK_RULE}</p>
              <p>{SIMPLIFIED_LOGBOOK_RULE}</p>
              <p className="font-medium">{SIMPLIFIED_LOGBOOK_FORMULA}</p>
              <p>{SIMPLIFIED_LOGBOOK_RANGE_RULE}</p>
              <p>{SIMPLIFIED_LOGBOOK_OUTSIDE_RANGE_RULE}</p>
              <p>{SIMPLIFIED_LOGBOOK_EXAMPLE}</p>
              <p>{VEHICLE_LOGBOOK_RETENTION_RULE}</p>
              <p>
                Source:{" "}
                <a href={CRA_MOTOR_VEHICLE_SOURCES.records.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                  {CRA_MOTOR_VEHICLE_SOURCES.records.label}
                </a>
              </p>
            </div>
          </details>
          <TaxDisclaimer />
        </CardContent>
      )}
    </Card>
  );
}
