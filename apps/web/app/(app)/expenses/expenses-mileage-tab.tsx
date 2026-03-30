"use client";

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
  Car, Plus, Trash2, Download, Info, X, Check, Loader2, AlertTriangle, ShieldCheck,
} from "lucide-react";
import { fmtCurrency }         from "@/lib/formatters";
import { cn }                  from "@/lib/utils";
import { CRA_MILEAGE_RATES }   from "@/lib/types/database";
import type { MileageLog }     from "@/lib/types/database";
import Link                    from "next/link";

// ── CRA 2025 rates ────────────────────────────────────────────────────────────
const RATE_FIRST  = CRA_MILEAGE_RATES.first5000;    // $0.72/km
const RATE_BEYOND = CRA_MILEAGE_RATES.beyond5000;   // $0.66/km
const THRESHOLD   = CRA_MILEAGE_RATES.threshold;    // 5,000 km

// Common trip purpose suggestions
const PURPOSES = [
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
];

interface Props {
  mileageLogs: MileageLog[];
  year: number;
  settings: { display_name?: string; province?: string; vehicle_business_use_pct?: number } | null;
}

export function ExpensesMileageTab({ mileageLogs, year, settings }: Props) {
  const [logs,     setLogs]     = useState<MileageLog[]>(mileageLogs);
  const [adding,   setAdding]   = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  // ── New trip form state ────────────────────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    trip_date:     today,
    description:   "",
    from_location: "",
    to_location:   "",
    km:            "",
    purpose:       "",
    notes:         "",
  });

  // ── Aggregates ─────────────────────────────────────────────────────────────
  const { totalKm, totalDeduction, rateBreakdown } = useMemo(() => {
    const km = logs.reduce((s, l) => s + Number(l.km), 0);
    let deduction = 0;
    if (km <= THRESHOLD) {
      deduction = km * RATE_FIRST;
    } else {
      deduction = THRESHOLD * RATE_FIRST + (km - THRESHOLD) * RATE_BEYOND;
    }
    const firstKm  = Math.min(km, THRESHOLD);
    const beyondKm = Math.max(0, km - THRESHOLD);
    return { totalKm: km, totalDeduction: deduction, rateBreakdown: { firstKm, beyondKm } };
  }, [logs]);

  const currentMonth = new Date().getMonth() + 1; // 1–12
  const projectedKm  = currentMonth > 0 ? (totalKm / currentMonth) * 12 : 0;

  // ── Handlers ───────────────────────────────────────────────────────────────
  function resetForm() {
    setForm({ trip_date: today, description: "", from_location: "", to_location: "", km: "", purpose: "", notes: "" });
    setAdding(false);
  }

  async function handleAdd() {
    const kmNum = parseFloat(form.km);
    if (!form.description.trim() || isNaN(kmNum) || kmNum <= 0) {
      toast.error("Please enter a description and valid km distance.");
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }

    const ratePerKm = totalKm < THRESHOLD ? RATE_FIRST : RATE_BEYOND;

    const { data, error } = await supabase
      .from("mileage_logs")
      .insert({
        user_id:         user.id,
        trip_date:       form.trip_date,
        description:     form.description.trim(),
        from_location:   form.from_location.trim() || null,
        to_location:     form.to_location.trim()   || null,
        km:              kmNum,
        cra_rate_per_km: ratePerKm,
        purpose:         form.purpose || null,
        notes:           form.notes.trim() || null,
      })
      .select()
      .single();

    setSaving(false);
    if (error || !data) {
      toast.error("Couldn't save trip — please try again.");
      return;
    }
    setLogs((prev) => [data as MileageLog, ...prev].sort((a, b) => b.trip_date.localeCompare(a.trip_date)));
    toast.success("Trip logged ✓");
    resetForm();
  }

  async function handleDelete(id: string) {
    setDeleting(id);
    const supabase = createClient();
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
  }

  function downloadCsv() {
    const rows = [
      ["Date", "Description", "From", "To", "Purpose", "KM", "Rate ($/km)", "Deduction ($CAD)", "Notes"],
      ...logs.map((l) => [
        l.trip_date,
        l.description,
        l.from_location ?? "",
        l.to_location   ?? "",
        l.purpose       ?? "",
        String(l.km),
        String(l.cra_rate_per_km),
        Number(l.deduction).toFixed(2),
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

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* Sub-header + actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          CRA {year} allowance rates: ${RATE_FIRST}/km (first {THRESHOLD.toLocaleString()} km) · ${RATE_BEYOND}/km after
        </p>
        <div className="flex items-center gap-2">
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
              YTD Kilometres
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tracking-tight text-slate-800">
              {totalKm.toLocaleString("en-CA", { maximumFractionDigits: 0 })} km
            </div>
            <p className="mt-1 text-xs text-blue-600/80">
              {totalKm >= THRESHOLD
                ? `${THRESHOLD.toLocaleString()} @ $${RATE_FIRST} + ${(totalKm - THRESHOLD).toLocaleString()} @ $${RATE_BEYOND}`
                : `${(THRESHOLD - totalKm).toLocaleString()} km left at $${RATE_FIRST}/km`}
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border border-emerald-200 bg-emerald-50/70 shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
              Est. Deduction
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tracking-tight text-emerald-700">
              {fmtCurrency(totalDeduction)}
            </div>
            <p className="mt-1 text-xs text-emerald-600/80">Planning estimate at CRA allowance rates</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border border-slate-200 bg-slate-50/70 shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-semibold uppercase tracking-wide text-slate-600">
              Trips Logged
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tracking-tight text-slate-800">{logs.length}</div>
            <p className="mt-1 text-xs text-muted-foreground">
              {logs.length > 0
                ? `${(totalKm / logs.length).toFixed(1)} km avg per trip`
                : "No trips yet"}
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
            <p className="mt-1 text-xs text-violet-600/80">At current pace · {year}</p>
          </CardContent>
        </Card>
      </div>

      {/* Rate breakdown card */}
      {rateBreakdown.firstKm > 0 && (
        <Card className="border-l-4 border-l-blue-400">
          <CardContent className="flex flex-wrap items-center gap-6 py-3">
            <div className="flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full bg-blue-500" />
              <span className="text-sm">
                <span className="font-semibold text-blue-700">{rateBreakdown.firstKm.toLocaleString()} km</span>
                <span className="text-muted-foreground"> @ ${RATE_FIRST}/km = </span>
                <span className="font-semibold">{fmtCurrency(rateBreakdown.firstKm * RATE_FIRST)}</span>
              </span>
            </div>
            {rateBreakdown.beyondKm > 0 && (
              <div className="flex items-center gap-2">
                <span className="inline-block h-2 w-2 rounded-full bg-violet-400" />
                <span className="text-sm">
                  <span className="font-semibold text-violet-700">{rateBreakdown.beyondKm.toLocaleString()} km</span>
                  <span className="text-muted-foreground"> @ ${RATE_BEYOND}/km = </span>
                  <span className="font-semibold">{fmtCurrency(rateBreakdown.beyondKm * RATE_BEYOND)}</span>
                </span>
              </div>
            )}
            <div className="ml-auto text-sm">
              <span className="text-muted-foreground">Total deduction: </span>
              <span className="font-bold text-emerald-600">{fmtCurrency(totalDeduction)}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Business-use % comparison banner */}
      {(() => {
        const claimedPct = settings?.vehicle_business_use_pct ?? 0;
        // Estimate total annual km: Canadian average ~20,000 km/yr, prorated by months elapsed
        const estTotalAnnualKm = 20_000;
        const monthsElapsed = Math.max(1, new Date().getMonth() + 1);
        const estTotalKmSoFar = (estTotalAnnualKm / 12) * monthsElapsed;
        const loggedPct = estTotalKmSoFar > 0 ? totalKm / estTotalKmSoFar : 0;
        const hasMeaningfulLogs = totalKm > 100 && logs.length >= 3;
        const gap = claimedPct - loggedPct;
        const showGapWarning = claimedPct > 0 && hasMeaningfulLogs && gap > 0.15;
        const showOnTrack = claimedPct > 0 && hasMeaningfulLogs && gap <= 0.15;

        if (claimedPct === 0) return null;

        return (
          <>
            {showGapWarning && (
              <Card className="border-amber-300 bg-amber-50/70">
                <CardContent className="flex items-start gap-3 py-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-amber-900">
                      Mileage log doesn&apos;t yet support your claimed business-use %
                    </p>
                    <p className="text-xs text-amber-800 leading-relaxed">
                      Your Settings claim <strong>{Math.round(claimedPct * 100)}% business use</strong>, but
                      your logged trips so far ({totalKm.toLocaleString()} km across {logs.length} trips) suggest
                      roughly <strong>{Math.round(loggedPct * 100)}%</strong> of estimated total driving.
                      Keep logging business trips to close this gap — a CRA auditor would compare these numbers.
                    </p>
                    <p className="text-[10px] text-amber-700/80">
                      Estimate based on ~{estTotalAnnualKm.toLocaleString()} km/yr Canadian average.
                      Your actual total driving may differ.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
            {showOnTrack && (
              <Card className="border-emerald-200 bg-emerald-50/60">
                <CardContent className="flex items-start gap-3 py-3">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  <div>
                    <p className="text-sm font-semibold text-emerald-900">
                      Mileage log supports your claimed business-use %
                    </p>
                    <p className="text-xs text-emerald-800">
                      Your logged trips ({totalKm.toLocaleString()} km) align with your
                      claimed <strong>{Math.round(claimedPct * 100)}%</strong> business use.
                      Keep logging to maintain CRA-ready documentation.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        );
      })()}

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
                <Label className="text-xs font-semibold">Distance (km)</Label>
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  placeholder="e.g. 23.5"
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
                  {PURPOSES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
                <Label className="text-xs font-semibold">
                  Description <span className="font-normal text-muted-foreground">(required for CRA records)</span>
                </Label>
                <Input
                  placeholder="e.g. Client showing — 123 Oak St, Toronto"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">From <span className="font-normal text-muted-foreground">(optional)</span></Label>
                <Input
                  placeholder="Starting address"
                  value={form.from_location}
                  onChange={(e) => setForm((f) => ({ ...f, from_location: e.target.value }))}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">To <span className="font-normal text-muted-foreground">(optional)</span></Label>
                <Input
                  placeholder="Destination address"
                  value={form.to_location}
                  onChange={(e) => setForm((f) => ({ ...f, to_location: e.target.value }))}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Notes <span className="font-normal text-muted-foreground">(optional)</span></Label>
                <Input
                  placeholder="e.g. Buyer was John Smith"
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  className="h-8 text-sm"
                />
              </div>
            </div>

            {parseFloat(form.km) > 0 && (
              <div className="mt-3 flex items-center gap-2 rounded-md bg-emerald-100/60 px-3 py-2 text-sm">
                <Check className="h-3.5 w-3.5 text-emerald-600" />
                <span className="text-emerald-800">
                  {parseFloat(form.km).toFixed(1)} km × ${totalKm < THRESHOLD ? RATE_FIRST : RATE_BEYOND}/km ={" "}
                  <strong>{fmtCurrency(parseFloat(form.km) * (totalKm < THRESHOLD ? RATE_FIRST : RATE_BEYOND))}</strong> deduction
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

      {/* Onboarding tip */}
      {logs.length === 0 && !adding && (
        <Card className="border-blue-200 bg-blue-50/60">
          <CardContent className="flex items-start gap-3 py-4">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
            <div>
              <p className="text-sm font-semibold text-blue-900">
                CRA requires a contemporaneous mileage log.
              </p>
              <p className="mt-0.5 text-xs text-blue-700">
                Record each business drive with date, destination, km, and purpose. The CRA {year} deductible rates are{" "}
                <strong>${RATE_FIRST}/km</strong> for the first {THRESHOLD.toLocaleString()} km and{" "}
                <strong>${RATE_BEYOND}/km</strong> thereafter. Log trips regularly — the CRA can deny claims without records.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Vehicle business use % note */}
      <Card className="border-amber-200 bg-amber-50/40">
        <CardContent className="flex items-start gap-3 py-3">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div className="text-xs text-amber-800 space-y-1.5">
            <p>
              <strong>Important:</strong> The CRA per-km rates shown (${RATE_FIRST}/${RATE_BEYOND}) are <em>reasonable automobile allowance</em> benchmarks
              (employer-to-employee). Your actual T2125 vehicle deduction is based on your <strong>logged expenses</strong> (fuel,
              insurance, maintenance, CCA/lease) prorated by business-use percentage, not a per-km calculation.
            </p>
            <p>
              This mileage log helps substantiate your business-use percentage and provides a planning estimate.
              If you claim actual vehicle costs (insurance, fuel, depreciation), set your{" "}
              <Link href="/settings" className="underline underline-offset-2 font-medium">
                vehicle business use %
              </Link>{" "}
              in Settings. Discuss the best method with your accountant.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Trip log table */}
      {logs.length > 0 && (
        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Car className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-base font-semibold">Trip Log</CardTitle>
                <Badge variant="secondary" className="text-xs">{year}</Badge>
              </div>
              <span className="text-xs text-muted-foreground">
                {logs.length} trip{logs.length !== 1 ? "s" : ""} · {totalKm.toFixed(1)} km
              </span>
            </div>
            <CardDescription className="mt-0.5 text-xs">
              Click &ldquo;Log Trip&rdquo; above to add. Export CSV for your accountant.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Purpose</TableHead>
                    <TableHead className="text-right">KM</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead className="text-right">Deduction</TableHead>
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
                      <TableCell className="text-right font-medium tabular-nums">
                        {Number(log.km).toFixed(1)}
                      </TableCell>
                      <TableCell className={cn(
                        "text-right text-xs tabular-nums",
                        Number(log.cra_rate_per_km) === RATE_FIRST ? "text-blue-600" : "text-violet-600",
                      )}>
                        ${Number(log.cra_rate_per_km).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums text-emerald-700">
                        {fmtCurrency(Number(log.deduction))}
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
              <div className="flex items-center gap-8">
                <span>
                  <span className="text-muted-foreground">KM: </span>
                  <span className="font-bold">{totalKm.toFixed(1)}</span>
                </span>
                <span>
                  <span className="text-muted-foreground">Deduction: </span>
                  <span className="font-bold text-emerald-700">{fmtCurrency(totalDeduction)}</span>
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* CRA disclaimer */}
      <p className="text-center text-xs leading-relaxed text-muted-foreground/60 pb-2">
        CRA rates shown are for {year}. Always verify current rates at{" "}
        <a
          href="https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/payroll/benefits-allowances/automobile/automobile-motor-vehicle-allowances/reasonable-kilometre-rates.html"
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 hover:text-muted-foreground"
        >
          canada.ca
        </a>
        . This log is for planning purposes only — not tax advice. Consult a qualified accountant.
      </p>
    </div>
  );
}
