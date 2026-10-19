"use client";

/**
 * Expenses → Mileage.
 *
 * Trips, CRA's logbook (vehicles, base and sample periods, odometer readings,
 * expenses-logbook-card.tsx) and the vehicle business-use share they give.
 *
 * Changed 2026-10-18:
 *   - The km × CRA per-km figure was labelled as a deduction (a KPI card,
 *     the rate breakdown, the trip table and its footer). CRA's per-km rates are the
 *     reasonable allowance an employer pays an employee; a self-employed
 *     agent's T2125 vehicle deduction is the business part of actual vehicle
 *     costs. The figure is now "At CRA's per-km allowance rates", with that
 *     note, and per-trip amounts are gone.
 *   - The rates were 2025's under the current year's label
 *     (CRA_MILEAGE_RATES). They come from craAllowanceRates(year), which
 *     names the year of the rates it used.
 *   - The "claimed % vs logged %" banner compared the declared % with logged
 *     km over an assumed 20,000 km a year. The logbook replaces it: total km
 *     come from the odometer.
 */

import { useState, useMemo } from "react";
import { toast }              from "sonner";
import { createClient }       from "@/lib/supabase/client";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button }   from "@/components/ui/button";
import { Input }    from "@/components/ui/input";
import { Label }    from "@/components/ui/label";
import { Badge }    from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Car, Plus, Trash2, Download, Info, X, Check, Loader2, Repeat,
} from "lucide-react";
import { fmtCurrency }         from "@/lib/formatters";
import type { MileageLog, MileagePlace } from "@/lib/types/database";
import Link                    from "next/link";
import { CollapsibleCard }     from "@/components/collapsible-card";
import { localISODate } from "@agent-runway/core/lib/local-date";
import type { ExpenseTaxLogbook } from "@agent-runway/core/engines/expense-totals-engine";
import {
  allowanceRateFigure,
  defaultVehicleId,
  unassignedTripVehicleId,
  type LogbookRows,
  type VehicleBusinessUse,
} from "@agent-runway/core/engines/vehicle-logbook-engine";
import { loadLogbookRows } from "@agent-runway/core/lib/vehicle-logbook-rows";
import { MILEAGE_TRIP_PURPOSES, saveMileagePlace } from "@agent-runway/core/lib/vehicle-logbook-writes";
import { logTrip } from "@agent-runway/core/lib/record-writers";
import {
  ALLOWANCE_RATE_NOTE,
  CRA_MOTOR_VEHICLE_SOURCES,
  VEHICLE_BUSINESS_PART_RULE,
  VEHICLE_FULL_DEDUCTION_RULE,
  VEHICLE_LOGBOOK_RULE,
  allowanceRatesSentence,
} from "@agent-runway/core/tax-copy";
import { ExpensesLogbookCard } from "./expenses-logbook-card";

interface Props {
  /** This year's trips, newest first. */
  mileageLogs: MileageLog[];
  year: number;
  /** The year's logbook rows (loadVehicleLogbook), owned by ExpensesContent. */
  logbook: ExpenseTaxLogbook;
  /** Re-read rows after a logbook write, so the page's vehicle share moves. */
  onLogbookChange: (rows: LogbookRows | null) => void;
  /** The share the page applies (expenseTaxContext(...).vehicleBusinessUse). */
  vehicleUse: VehicleBusinessUse | null;
  /** user_settings.vehicle_business_use_pct, as currently saved. */
  declaredVehiclePct: number;
  mileagePlaces: MileagePlace[];
  /** The Trip Log's minimized state, kept with the rest of the Expenses page's sections. */
  tripLogSection?: { id: string; collapsed: boolean; onToggle: () => void };
}

const EMPTY_FORM = {
  trip_date:      "",
  description:    "",
  from_location:  "",
  to_location:    "",
  km:             "",
  odometer_start: "",
  odometer_end:   "",
  purpose:        "",
  notes:          "",
  vehicle_id:     "",
  save_place:     false,
};

const pctLabel = (p: number) => {
  const v = Math.round(p * 1000) / 10;
  return `${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)}%`;
};

const toNumber = (raw: string): number | null => {
  const t = raw.trim().replace(/,/g, "");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
};

export function ExpensesMileageTab({
  mileageLogs, year, logbook, onLogbookChange, vehicleUse, declaredVehiclePct, mileagePlaces, tripLogSection,
}: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [logs,     setLogs]     = useState<MileageLog[]>(mileageLogs);
  const [places,   setPlaces]   = useState<MileagePlace[]>(mileagePlaces);
  const [adding,   setAdding]   = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const vehicles = useMemo(
    () => [...(logbook.rows?.vehicles ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at)),
    [logbook.rows],
  );
  const activeVehicles = vehicles.filter((v) => v.is_active);
  // A new trip goes on the default vehicle (the oldest active one); a trip
  // saved with no vehicle counts for the oldest vehicle, active or not, as
  // the engine counts it, so it is named under that one.
  const defaultVehicle = defaultVehicleId(vehicles);
  const unassignedVehicle = unassignedTripVehicleId(vehicles);
  const vehicleName = (id: string | null) => vehicles.find((v) => v.id === (id ?? unassignedVehicle))?.name ?? null;

  // ── New trip form state ────────────────────────────────────────────────────
  const today = localISODate();
  const [form, setForm] = useState({ ...EMPTY_FORM, trip_date: today });

  // ── Aggregates ─────────────────────────────────────────────────────────────
  const totalKm = useMemo(() => logs.reduce((s, l) => s + Number(l.km), 0), [logs]);
  // km × CRA's per-km allowance rates: an employer-allowance benchmark, never a deduction.
  const allowance = useMemo(() => allowanceRateFigure(totalKm, year), [totalKm, year]);
  const ratesYear = allowance.rates.year;

  const currentMonth = new Date().getMonth() + 1; // 1–12
  const projectedKm  = currentMonth > 0 ? (totalKm / currentMonth) * 12 : 0;

  const odoStart = toNumber(form.odometer_start);
  const odoEnd   = toNumber(form.odometer_end);
  const odometerKm = odoStart != null && odoEnd != null && Number.isFinite(odoStart) && Number.isFinite(odoEnd) && odoEnd >= odoStart
    ? Math.round((odoEnd - odoStart) * 10) / 10
    : null;

  const placeSuggestions = useMemo(() => {
    const names = new Set<string>();
    for (const p of places) names.add(p.address ? `${p.name}, ${p.address}` : p.name);
    for (const l of logs.slice(0, 100)) {
      if (l.to_location) names.add(l.to_location);
      if (l.from_location) names.add(l.from_location);
    }
    return [...names].slice(0, 60);
  }, [places, logs]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  function resetForm() {
    setForm({ ...EMPTY_FORM, trip_date: today });
    setAdding(false);
  }

  function repeatLastTrip() {
    const last = logs[0];
    if (!last) return;
    setForm({
      ...EMPTY_FORM,
      trip_date: today,
      description: last.description,
      from_location: last.from_location ?? "",
      to_location: last.to_location ?? "",
      km: String(last.km),
      purpose: last.purpose ?? "",
      notes: "",
      vehicle_id: last.vehicle_id ?? "",
    });
    setAdding(true);
  }

  function pickPlace(value: string) {
    const place = places.find((p) => (p.address ? `${p.name}, ${p.address}` : p.name) === value);
    setForm((f) => ({
      ...f,
      to_location: value,
      km: place?.default_km != null && !f.km ? String(place.default_km) : f.km,
    }));
  }

  async function reloadLogbook(userId: string) {
    try {
      onLogbookChange(await loadLogbookRows(supabase, userId, year));
    } catch (err) {
      console.error("[mileage] logbook not reloaded:", err);
    }
  }

  async function handleAdd() {
    const km = toNumber(form.km);
    if (Number.isNaN(km) || Number.isNaN(odoStart) || Number.isNaN(odoEnd)) {
      toast.error("Distances and odometer readings are numbers of km.");
      return;
    }
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }

    // The trip's vehicle: the one picked, else the default (none before any exists).
    const vehicleId = form.vehicle_id || defaultVehicle || null;
    const result = await logTrip(supabase, user.id, {
      tripDate: form.trip_date,
      description: form.description,
      km,
      odometerStart: odoStart,
      odometerEnd: odoEnd,
      vehicleId,
      fromLocation: form.from_location,
      toLocation: form.to_location,
      purpose: form.purpose,
      notes: form.notes,
    });

    if (!result.ok) {
      setSaving(false);
      toast.error(result.error);
      return;
    }
    const saved = result.value;
    if (saved.trip_date.startsWith(String(year))) {
      setLogs((prev) => [saved, ...prev].sort((a, b) => b.trip_date.localeCompare(a.trip_date)));
    }

    const to = form.to_location.trim();
    if (form.save_place && to) {
      // Core writer (vehicle-logbook-writes), the one the phone uses.
      const placed = await saveMileagePlace(supabase, user.id, { name: to.slice(0, 80), defaultKm: Number(saved.km) || null });
      if (!placed.ok) toast.error(`Trip saved. The place was not saved: ${placed.error}`);
      else if (placed.value) {
        const place = placed.value;
        setPlaces((prev) => [...prev, place].sort((a, b) => a.name.localeCompare(b.name)));
      }
    }

    setSaving(false);
    toast.success("Trip logged ✓");
    resetForm();
    if ((logbook.rows?.periods.length ?? 0) > 0) await reloadLogbook(user.id);
  }

  async function handleDelete(id: string) {
    setDeleting(id);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setDeleting(null); return; }
    const { error } = await supabase.from("mileage_logs").delete().eq("id", id).eq("user_id", user.id);
    if (error) {
      setDeleting(null);
      toast.error("Failed to remove trip — please try again.");
      return;
    }
    setLogs((prev) => prev.filter((l) => l.id !== id));
    setDeleting(null);
    toast("Trip removed");
    if ((logbook.rows?.periods.length ?? 0) > 0) await reloadLogbook(user.id);
  }

  function downloadCsv() {
    const rows = [
      ["Date", "Description", "From", "To", "Purpose", "KM", "Vehicle", "Odometer start", "Odometer end", "Notes"],
      ...logs.map((l) => [
        l.trip_date,
        l.description,
        l.from_location ?? "",
        l.to_location   ?? "",
        l.purpose       ?? "",
        String(l.km),
        vehicleName(l.vehicle_id ?? null) ?? "",
        l.odometer_start == null ? "" : String(l.odometer_start),
        l.odometer_end == null ? "" : String(l.odometer_end),
        l.notes ?? "",
      ]),
    ];
    const csv  = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `agent-runway-mileage-${year}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Mileage log downloaded ✓");
  }

  const showVehicleColumn = vehicles.length > 1;
  const showOdometerColumn = logs.some((l) => l.odometer_start != null || l.odometer_end != null);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* Sub-header + actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          CRA&apos;s per-km allowance rates: {allowanceRatesSentence(year)}
        </p>
        <div className="flex items-center gap-2">
          {logs.length > 0 && (
            <Button size="sm" variant="outline" onClick={repeatLastTrip} className="gap-1.5">
              <Repeat className="h-3.5 w-3.5" />
              Repeat last trip
            </Button>
          )}
          <Button size="sm" onClick={() => setAdding(true)} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            Log Trip
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={downloadCsv}
            disabled={logs.length === 0}
            className="gap-1.5"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="rounded-2xl border border-blue-200 bg-blue-50/70 shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-semibold uppercase tracking-wide text-blue-700">
              YTD Business Kilometres
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tracking-tight text-slate-800">
              {totalKm.toLocaleString("en-CA", { maximumFractionDigits: 0 })} km
            </div>
            <p className="mt-1 text-xs text-blue-600/80">
              {logs.length} trip{logs.length !== 1 ? "s" : ""} logged
              {logs.length > 0 && ` · ${(totalKm / logs.length).toFixed(1)} km avg`}
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border border-slate-200 bg-slate-50/70 shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-semibold uppercase tracking-wide text-slate-600">
              At CRA&apos;s Per-km Allowance Rates
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tracking-tight text-slate-800">
              {fmtCurrency(allowance.amount)}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Employer allowance benchmark ({ratesYear} rates), not a T2125 deduction
            </p>
          </CardContent>
        </Card>

        <Card className={vehicleUse && vehicleUse.method !== "declared"
          ? "rounded-2xl border border-emerald-200 bg-emerald-50/70 shadow-sm"
          : "rounded-2xl border border-amber-200 bg-amber-50/60 shadow-sm"}>
          <CardHeader className="pb-2">
            <CardDescription className={vehicleUse && vehicleUse.method !== "declared"
              ? "text-xs font-semibold uppercase tracking-wide text-emerald-700"
              : "text-xs font-semibold uppercase tracking-wide text-amber-700"}>
              Vehicle Business Use
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tracking-tight text-slate-800">
              {pctLabel(vehicleUse?.pct ?? declaredVehiclePct)}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {vehicleUse?.method === "full" && `From the ${year} logbook`}
              {vehicleUse?.method === "simplified" && "From the logbook, CRA's simplified method"}
              {(!vehicleUse || vehicleUse.method === "declared") && (
                <>Declared in <Link href="/settings" className="underline underline-offset-2">Settings</Link>, not from a logbook</>
              )}
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border border-violet-200 bg-violet-50/70 shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-semibold uppercase tracking-wide text-violet-700">
              Projected Annual
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tracking-tight text-slate-800">
              {Math.round(projectedKm).toLocaleString()} km
            </div>
            <p className="mt-1 text-xs text-violet-600/80">Business km at the current pace · {year}</p>
          </CardContent>
        </Card>
      </div>

      {/* Allowance-rate breakdown */}
      {allowance.firstKm > 0 && (
        <Card className="border-l-4 border-l-slate-300">
          <CardContent className="flex flex-wrap items-center gap-6 py-3">
            <div className="flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full bg-blue-500" />
              <span className="text-sm">
                <span className="font-semibold text-blue-700">{allowance.firstKm.toLocaleString("en-CA")} km</span>
                <span className="text-muted-foreground"> @ ${allowance.rates.first5000.toFixed(2)}/km = </span>
                <span className="font-semibold">{fmtCurrency(allowance.firstKm * allowance.rates.first5000)}</span>
              </span>
            </div>
            {allowance.beyondKm > 0 && (
              <div className="flex items-center gap-2">
                <span className="inline-block h-2 w-2 rounded-full bg-violet-400" />
                <span className="text-sm">
                  <span className="font-semibold text-violet-700">{allowance.beyondKm.toLocaleString("en-CA")} km</span>
                  <span className="text-muted-foreground"> @ ${allowance.rates.beyond5000.toFixed(2)}/km = </span>
                  <span className="font-semibold">{fmtCurrency(allowance.beyondKm * allowance.rates.beyond5000)}</span>
                </span>
              </div>
            )}
            <div className="ml-auto text-sm">
              <span className="text-muted-foreground">At CRA&apos;s allowance rates ({ratesYear}): </span>
              <span className="font-bold text-slate-800">{fmtCurrency(allowance.amount)}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* CRA logbook: vehicles, periods, odometer readings, the share */}
      <ExpensesLogbookCard
        year={year}
        rows={logbook.rows}
        vehicleUse={vehicleUse}
        declaredVehiclePct={declaredVehiclePct}
        onChanged={async () => {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) await reloadLogbook(user.id);
        }}
      />

      {/* Add trip form */}
      {adding && (
        <Card className="border-emerald-200 bg-emerald-50/40">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Log a Trip</CardTitle>
              <button
                onClick={resetForm}
                className="rounded p-1 text-muted-foreground hover:bg-emerald-100 hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </CardHeader>
          <CardContent>
            <datalist id="mileage-places">
              {placeSuggestions.map((p) => <option key={p} value={p} />)}
            </datalist>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Date</Label>
                <Input
                  type="date"
                  value={form.trip_date}
                  onChange={(e) => setForm((f) => ({ ...f, trip_date: e.target.value }))}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">
                  Distance (km) <span className="font-normal text-muted-foreground">(or the odometer below)</span>
                </Label>
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  placeholder={odometerKm != null ? String(odometerKm) : "e.g. 23.5"}
                  value={form.km}
                  onChange={(e) => setForm((f) => ({ ...f, km: e.target.value }))}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Purpose</Label>
                <select
                  value={form.purpose}
                  onChange={(e) => setForm((f) => ({ ...f, purpose: e.target.value }))}
                  className="h-8 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="">Select purpose…</option>
                  {MILEAGE_TRIP_PURPOSES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
                <Label className="text-xs font-semibold">
                  Description <span className="font-normal text-muted-foreground">(where and why: CRA&apos;s logbook lists destination and purpose)</span>
                </Label>
                <Input
                  placeholder="e.g. Client showing, 123 Oak St"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">From <span className="font-normal text-muted-foreground">(optional)</span></Label>
                <Input
                  list="mileage-places"
                  placeholder="Starting address"
                  value={form.from_location}
                  onChange={(e) => setForm((f) => ({ ...f, from_location: e.target.value }))}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">To <span className="font-normal text-muted-foreground">(optional)</span></Label>
                <Input
                  list="mileage-places"
                  placeholder="Destination or a saved place"
                  value={form.to_location}
                  onChange={(e) => pickPlace(e.target.value)}
                  className="h-8 text-sm"
                />
                {form.to_location.trim() && !places.some((p) => p.name === form.to_location.trim() || `${p.name}, ${p.address}` === form.to_location.trim()) && (
                  <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={form.save_place}
                      onChange={(e) => setForm((f) => ({ ...f, save_place: e.target.checked }))}
                    />
                    Save as a place
                  </label>
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Notes <span className="font-normal text-muted-foreground">(optional)</span></Label>
                <Input
                  placeholder="e.g. Buyer consultation"
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Odometer at start <span className="font-normal text-muted-foreground">(optional)</span></Label>
                <Input
                  inputMode="decimal"
                  placeholder="km"
                  value={form.odometer_start}
                  onChange={(e) => setForm((f) => ({ ...f, odometer_start: e.target.value }))}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Odometer at end <span className="font-normal text-muted-foreground">(optional)</span></Label>
                <Input
                  inputMode="decimal"
                  placeholder="km"
                  value={form.odometer_end}
                  onChange={(e) => setForm((f) => ({ ...f, odometer_end: e.target.value }))}
                  className="h-8 text-sm"
                />
              </div>
              {activeVehicles.length > 1 && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Vehicle</Label>
                  <select
                    value={form.vehicle_id || defaultVehicle || ""}
                    onChange={(e) => setForm((f) => ({ ...f, vehicle_id: e.target.value }))}
                    className="h-8 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    {activeVehicles.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </div>
              )}
            </div>

            {(Number(form.km) > 0 || odometerKm != null) && (
              <div className="mt-3 flex items-center gap-2 rounded-md bg-emerald-100/60 px-3 py-2 text-sm">
                <Check className="h-3.5 w-3.5 text-emerald-600" />
                <span className="text-emerald-800">
                  {(Number(form.km) > 0 ? Number(form.km) : odometerKm ?? 0).toFixed(1)} km
                  {odometerKm != null && !form.km && " from the odometer"}
                </span>
              </div>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={resetForm}>Cancel</Button>
              <Button size="sm" onClick={handleAdd} disabled={saving} className="gap-1.5">
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                Save trip
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* What a logbook holds, when nothing is logged yet */}
      {logs.length === 0 && !adding && (
        <Card className="border-blue-200 bg-blue-50/60">
          <CardContent className="flex items-start gap-3 py-4">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
            <div>
              <p className="text-sm font-semibold text-blue-900">What CRA&apos;s logbook holds</p>
              <p className="mt-0.5 text-xs text-blue-700">{VEHICLE_LOGBOOK_RULE}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* What the per-km figure is, and how the T2125 deduction works */}
      <Card className="border-amber-200 bg-amber-50/40">
        <CardContent className="flex items-start gap-3 py-3">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div className="text-xs text-amber-800 space-y-1.5">
            <p>{ALLOWANCE_RATE_NOTE}</p>
            <p>
              {VEHICLE_BUSINESS_PART_RULE} {VEHICLE_FULL_DEDUCTION_RULE} The share Agent Runway applies to the other vehicle costs is the logbook&apos;s figure for a year it
              covers, and the{" "}
              <Link href="/settings" className="underline underline-offset-2 font-medium">
                declared vehicle business use %
              </Link>{" "}
              for any other year.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Trip log table */}
      {logs.length > 0 && (
        <CollapsibleCard
          id={tripLogSection?.id ?? "expenses-trip-log"}
          collapsed={tripLogSection?.collapsed ?? false}
          onToggle={tripLogSection?.onToggle ?? (() => {})}
          className="rounded-2xl shadow-sm"
          headerClassName="pb-3"
          icon={<Car className="h-4 w-4 text-muted-foreground" />}
          title={
            <span className="flex items-center gap-2">
              Trip Log
              <Badge variant="secondary" className="text-xs">{year}</Badge>
            </span>
          }
          titleClassName="font-semibold"
          description={<>Click &ldquo;Log Trip&rdquo; above to add. Export CSV for your accountant.</>}
          aside={
            <span className="text-xs text-muted-foreground">
              {logs.length} trip{logs.length !== 1 ? "s" : ""} · {totalKm.toFixed(1)} km
            </span>
          }
        >
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Purpose</TableHead>
                    {showVehicleColumn && <TableHead>Vehicle</TableHead>}
                    {showOdometerColumn && <TableHead className="text-right">Odometer</TableHead>}
                    <TableHead className="text-right">KM</TableHead>
                    <TableHead className="w-[40px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id} className="group">
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {new Date(log.trip_date + "T12:00:00").toLocaleDateString("en-CA", {
                          month: "short", day: "numeric",
                        })}
                      </TableCell>
                      <TableCell className="font-medium">
                        {log.description}
                        {(log.from_location || log.to_location) && (
                          <p className="text-[11px] text-muted-foreground truncate max-w-[200px]">
                            {[log.from_location, log.to_location].filter(Boolean).join(" → ")}
                          </p>
                        )}
                        {log.notes && (
                          <p className="text-[11px] text-muted-foreground truncate max-w-[200px]">{log.notes}</p>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {log.purpose ? (
                          <Badge variant="outline" className="text-xs font-normal">{log.purpose}</Badge>
                        ) : "—"}
                      </TableCell>
                      {showVehicleColumn && (
                        <TableCell className="text-sm text-muted-foreground">{vehicleName(log.vehicle_id ?? null) ?? "—"}</TableCell>
                      )}
                      {showOdometerColumn && (
                        <TableCell className="text-right text-xs tabular-nums text-muted-foreground">
                          {log.odometer_start != null || log.odometer_end != null
                            ? `${log.odometer_start ?? "?"} → ${log.odometer_end ?? "?"}`
                            : "—"}
                        </TableCell>
                      )}
                      <TableCell className="text-right font-medium tabular-nums">
                        {Number(log.km).toFixed(1)}
                      </TableCell>
                      <TableCell>
                        <button
                          onClick={() => handleDelete(log.id)}
                          disabled={deleting === log.id}
                          className="flex h-7 w-7 items-center justify-center rounded opacity-0 transition-opacity group-hover:opacity-100 hover:bg-red-50 hover:text-red-500 disabled:opacity-50"
                          title="Delete trip"
                        >
                          {deleting === log.id
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <Trash2 className="h-3.5 w-3.5" />}
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {/* Footer totals */}
            <div className="flex items-center justify-between border-t bg-muted/30 px-4 py-3 text-sm">
              <span className="font-semibold text-muted-foreground">Total {year}</span>
              <span>
                <span className="text-muted-foreground">Business km: </span>
                <span className="font-bold">{totalKm.toFixed(1)}</span>
              </span>
            </div>
          </CardContent>
        </CollapsibleCard>
      )}

      {/* CRA source and disclaimer */}
      <p className="text-center text-xs leading-relaxed text-muted-foreground/60 pb-2">
        Per-km rates shown are CRA&apos;s for {ratesYear}
        {!allowance.exactYear && ` (Agent Runway's table has no ${year} rates from CRA yet)`}. Source:{" "}
        <a
          href={CRA_MOTOR_VEHICLE_SOURCES.allowanceRates.url}
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 hover:text-muted-foreground"
        >
          canada.ca
        </a>
        . This log is for planning purposes only, not tax advice. Verify with your accountant.
      </p>
    </div>
  );
}
