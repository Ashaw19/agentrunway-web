"use client";

import { useState, useCallback } from "react";
import {
  FlaskConical,
  Plus,
  Download,
  Loader2,
  AlertCircle,
  X,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  CorpSredEntry,
  CorpSredAnnualSummary,
  SredWeight,
} from "@agent-runway/core/types/database";
import { SRED_WEIGHT_FACTORS } from "@agent-runway/core/types/database";

// ── Constants ─────────────────────────────────────────────────────────────────

const WEIGHT_LABELS: Record<SredWeight, string> = {
  high:   "High",
  medium: "Medium",
  low:    "Low",
  none:   "None",
};

const WEIGHT_DESCRIPTIONS: Record<SredWeight, string> = {
  high:   "Direct SR&ED — novel design, resolving tech uncertainty (×1.00)",
  medium: "Mixed — some SR&ED, some routine work (×0.50)",
  low:    "Support activity — docs, project mgmt, testing (×0.15)",
  none:   "Non-SR&ED — marketing, admin, sales (×0.00)",
};

const WEIGHT_COLORS: Record<SredWeight, string> = {
  high:   "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
  medium: "bg-blue-500/10 text-blue-300 border-blue-500/20",
  low:    "bg-amber-500/10 text-amber-300 border-amber-500/20",
  none:   "bg-muted/40 text-muted-foreground border-muted/40",
};

const today = new Date().toISOString().slice(0, 10);
const thisYear = new Date().getFullYear();

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt2(n: number) {
  return n.toFixed(2).replace(/\.00$/, "");
}

function monthLabel(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleString("en-CA", { month: "long", year: "numeric" });
}

// ── New Entry Modal ───────────────────────────────────────────────────────────

interface NewEntryModalProps {
  onClose: () => void;
  onCreated: (entry: CorpSredEntry) => void;
}

function NewEntryModal({ onClose, onCreated }: NewEntryModalProps) {
  const [entryDate, setEntryDate] = useState(today);
  const [hours, setHours] = useState("8");
  const [workSummary, setWorkSummary] = useState("");
  const [techChallenges, setTechChallenges] = useState("");
  const [sredNote, setSredNote] = useState("");
  const [weight, setWeight] = useState<SredWeight>("high");
  const [commitsCount, setCommitsCount] = useState("");
  const [prRefs, setPrRefs] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const parsedHours = parseFloat(hours);
      if (isNaN(parsedHours) || parsedHours <= 0) {
        setError("Hours must be a positive number");
        return;
      }
      setSaving(true);
      setError(null);
      try {
        const res = await fetch("/api/cockpit/sred", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            entry_date: entryDate,
            hours: parsedHours,
            work_summary: workSummary,
            tech_challenges: techChallenges || null,
            sred_note: sredNote || null,
            sred_weight: weight,
            commits_count: commitsCount ? parseInt(commitsCount, 10) : null,
            pr_refs: prRefs || null,
          }),
        });
        const json = (await res.json()) as {
          ok?: boolean;
          entry?: CorpSredEntry;
          error?: string;
        };
        if (!res.ok || !json.ok) throw new Error(json.error ?? "Save failed");
        onCreated(json.entry!);
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Save failed");
      } finally {
        setSaving(false);
      }
    },
    [entryDate, hours, workSummary, techChallenges, sredNote, weight, commitsCount, prRefs, onCreated, onClose],
  );

  const eligibleHours = (parseFloat(hours) || 0) * SRED_WEIGHT_FACTORS[weight];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div className="relative z-10 w-full max-w-2xl rounded-xl border border-white/10 bg-[oklch(0.235_0.055_262)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <h2 className="text-sm font-semibold text-white">Log SR&amp;ED work session</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-6">
          <div className="grid grid-cols-2 gap-4">
            {/* Date */}
            <div>
              <label className="text-muted-foreground mb-1.5 block text-xs font-medium">
                Date <span className="text-red-400">*</span>
              </label>
              <input
                type="date"
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
                required
                className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-white/20 focus:outline-none [color-scheme:dark]"
              />
            </div>
            {/* Hours */}
            <div>
              <label className="text-muted-foreground mb-1.5 block text-xs font-medium">
                Hours worked <span className="text-red-400">*</span>
              </label>
              <input
                type="number"
                min="0.25"
                max="24"
                step="0.25"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                required
                className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-white/20 focus:outline-none"
              />
            </div>
          </div>

          {/* SR&ED Weight */}
          <div>
            <label className="text-muted-foreground mb-1.5 block text-xs font-medium">
              SR&amp;ED weight <span className="text-red-400">*</span>
            </label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(["high", "medium", "low", "none"] as SredWeight[]).map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => setWeight(w)}
                  className={cn(
                    "rounded-md border p-2 text-left transition",
                    weight === w
                      ? WEIGHT_COLORS[w] + " ring-1 ring-inset ring-white/20"
                      : "border-white/10 bg-white/[0.03] text-white/50 hover:border-white/20",
                  )}
                >
                  <span className="block text-xs font-semibold">{WEIGHT_LABELS[w]}</span>
                  <span className="mt-0.5 block text-[10px] leading-relaxed opacity-70">
                    {WEIGHT_DESCRIPTIONS[w]}
                  </span>
                </button>
              ))}
            </div>
            {!isNaN(parseFloat(hours)) && (
              <p className="text-muted-foreground mt-1.5 text-xs">
                Eligible hours:{" "}
                <span className="text-emerald-300 font-medium">
                  {fmt2(eligibleHours)} hrs
                </span>{" "}
                (at {(SRED_WEIGHT_FACTORS[weight] * 100).toFixed(0)}% of {hours} hrs)
              </p>
            )}
          </div>

          {/* Work summary */}
          <div>
            <label className="text-muted-foreground mb-1.5 block text-xs font-medium">
              Work performed (T661 narrative) <span className="text-red-400">*</span>
            </label>
            <textarea
              value={workSummary}
              onChange={(e) => setWorkSummary(e.target.value)}
              required
              rows={4}
              placeholder="Describe what you built, investigated, or designed today…"
              className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm leading-relaxed text-white/90 placeholder:text-white/25 focus:border-white/20 focus:outline-none"
            />
          </div>

          {/* Tech challenges */}
          <div>
            <label className="text-muted-foreground mb-1.5 block text-xs font-medium">
              Technological uncertainty / advances
            </label>
            <textarea
              value={techChallenges}
              onChange={(e) => setTechChallenges(e.target.value)}
              rows={3}
              placeholder="What wasn't known at the start? What did you have to figure out?"
              className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm leading-relaxed text-white/90 placeholder:text-white/25 focus:border-white/20 focus:outline-none"
            />
          </div>

          {/* SR&ED note */}
          <div>
            <label className="text-muted-foreground mb-1.5 block text-xs font-medium">
              SR&amp;ED characterization / weight rationale
            </label>
            <input
              type="text"
              value={sredNote}
              onChange={(e) => setSredNote(e.target.value)}
              placeholder="e.g. 'Novel algorithm design — SR&ED weight: high'"
              className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/90 placeholder:text-white/25 focus:border-white/20 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Commits */}
            <div>
              <label className="text-muted-foreground mb-1.5 block text-xs font-medium">
                Commits (optional)
              </label>
              <input
                type="number"
                min="0"
                value={commitsCount}
                onChange={(e) => setCommitsCount(e.target.value)}
                placeholder="e.g. 4"
                className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/25 focus:border-white/20 focus:outline-none"
              />
            </div>
            {/* PR refs */}
            <div>
              <label className="text-muted-foreground mb-1.5 block text-xs font-medium">
                PR / branch refs (optional)
              </label>
              <input
                type="text"
                value={prRefs}
                onChange={(e) => setPrRefs(e.target.value)}
                placeholder="e.g. #103, #104"
                className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/25 focus:border-white/20 focus:outline-none"
              />
            </div>
          </div>

          {error && (
            <p className="flex items-center gap-1.5 text-xs text-red-400">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {error}
            </p>
          )}

          <div className="flex justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-white/10 px-4 py-2 text-sm text-white/70 transition hover:border-white/20 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FlaskConical className="h-4 w-4" />
              )}
              {saving ? "Saving…" : "Log session"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Summary strip ─────────────────────────────────────────────────────────────

interface SummaryStripProps {
  summary: CorpSredAnnualSummary | null;
  year: number;
}

function SummaryStrip({ summary, year }: SummaryStripProps) {
  if (!summary) {
    return (
      <p className="text-muted-foreground text-sm">
        No SR&amp;ED entries logged for FY{year} yet.
      </p>
    );
  }

  // Conservative NB CCPC federal SR&ED ITC estimate:
  // eligible_hours × $80/hr = qualifying expenditures × 35% refundable ITC
  const HOURLY_RATE = 80;
  const ITC_RATE = 0.35;
  const expenditure = summary.eligible_hours * HOURLY_RATE;
  const itcEstimate = expenditure * ITC_RATE;

  const cards = [
    {
      label: "Total hours logged",
      value: fmt2(summary.total_hours) + " hrs",
      sub: `${summary.entry_count} sessions`,
    },
    {
      label: "Eligible hours (weighted)",
      value: fmt2(summary.eligible_hours) + " hrs",
      sub: `High ${fmt2(summary.high_hours)} · Med ${fmt2(summary.medium_hours * 0.5)} · Low ${fmt2(summary.low_hours * 0.15)}`,
    },
    {
      label: "Est. qualifying expenditures",
      value: "$" + expenditure.toLocaleString("en-CA", { maximumFractionDigits: 0 }),
      sub: `at $${HOURLY_RATE}/hr · for accountant review`,
    },
    {
      label: "Est. refundable ITC (35%)",
      value: "$" + itcEstimate.toLocaleString("en-CA", { maximumFractionDigits: 0 }),
      sub: "Federal CCPC SR&ED · NB CCPC",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {cards.map((c) => (
        <div
          key={c.label}
          className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3"
        >
          <p className="text-muted-foreground mb-1 text-xs">{c.label}</p>
          <p className="text-base font-semibold text-white">{c.value}</p>
          <p className="text-muted-foreground/60 mt-0.5 text-[10px]">{c.sub}</p>
        </div>
      ))}
    </div>
  );
}

// ── Entry row ─────────────────────────────────────────────────────────────────

interface EntryRowProps {
  entry: CorpSredEntry;
}

function EntryRow({ entry }: EntryRowProps) {
  const [expanded, setExpanded] = useState(false);
  const eligible = entry.hours * SRED_WEIGHT_FACTORS[entry.sred_weight];

  return (
    <div className="border-b border-white/5 last:border-0">
      <button
        onClick={() => setExpanded((p) => !p)}
        className="flex w-full items-start gap-4 py-3 text-left transition hover:bg-white/[0.02]"
      >
        <div className="mt-0.5 shrink-0 text-muted-foreground/50 w-4">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="shrink-0 font-mono text-[11px] text-white/60">{entry.entry_date}</span>
            <span
              className={cn(
                "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium",
                WEIGHT_COLORS[entry.sred_weight],
              )}
            >
              {WEIGHT_LABELS[entry.sred_weight]}
            </span>
            <span className="truncate text-sm font-medium text-white">{entry.work_summary.slice(0, 100)}{entry.work_summary.length > 100 ? "…" : ""}</span>
          </div>
          <p className="text-muted-foreground mt-0.5 text-xs">
            {fmt2(entry.hours)} hrs logged · {fmt2(eligible)} eligible
            {entry.pr_refs ? ` · ${entry.pr_refs}` : ""}
            {entry.commits_count ? ` · ${entry.commits_count} commits` : ""}
          </p>
        </div>
      </button>

      {expanded && (
        <div className="ml-8 mb-4 space-y-3 text-xs">
          <div>
            <p className="text-muted-foreground mb-1 font-medium uppercase tracking-wide text-[10px]">Work performed</p>
            <p className="whitespace-pre-wrap text-white/80 leading-relaxed">{entry.work_summary}</p>
          </div>
          {entry.tech_challenges && (
            <div>
              <p className="text-muted-foreground mb-1 font-medium uppercase tracking-wide text-[10px]">Technological challenges / advances</p>
              <p className="whitespace-pre-wrap text-white/80 leading-relaxed">{entry.tech_challenges}</p>
            </div>
          )}
          {entry.sred_note && (
            <div>
              <p className="text-muted-foreground mb-1 font-medium uppercase tracking-wide text-[10px]">SR&amp;ED characterization</p>
              <p className="text-white/70">{entry.sred_note}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Root client component ─────────────────────────────────────────────────────

interface SredClientProps {
  initialEntries: CorpSredEntry[];
  initialSummary: CorpSredAnnualSummary | null;
  year: number;
}

export function SredClient({ initialEntries, initialSummary, year }: SredClientProps) {
  const [entries, setEntries] = useState<CorpSredEntry[]>(initialEntries);
  const [summary, setSummary] = useState<CorpSredAnnualSummary | null>(initialSummary);
  const [showNew, setShowNew] = useState(false);
  const [exporting, setExporting] = useState(false);

  const handleCreated = useCallback((entry: CorpSredEntry) => {
    setEntries((prev) => [entry, ...prev]);
    // Optimistically update summary
    setSummary((prev) => {
      const factor = SRED_WEIGHT_FACTORS[entry.sred_weight];
      const addEligible = entry.hours * factor;
      const base: CorpSredAnnualSummary = prev ?? {
        user_id: entry.user_id,
        fiscal_year: year,
        entry_count: 0,
        total_hours: 0,
        eligible_hours: 0,
        high_hours: 0,
        medium_hours: 0,
        low_hours: 0,
        none_hours: 0,
      };
      return {
        ...base,
        entry_count: base.entry_count + 1,
        total_hours: base.total_hours + entry.hours,
        eligible_hours: base.eligible_hours + addEligible,
        high_hours:   base.high_hours   + (entry.sred_weight === "high"   ? entry.hours : 0),
        medium_hours: base.medium_hours + (entry.sred_weight === "medium" ? entry.hours : 0),
        low_hours:    base.low_hours    + (entry.sred_weight === "low"    ? entry.hours : 0),
        none_hours:   base.none_hours   + (entry.sred_weight === "none"   ? entry.hours : 0),
      };
    });
  }, [year]);

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      const res = await fetch(`/api/cockpit/sred/export?year=${year}`);
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `AR-Inc-SRED-FY${year}-working-paper.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // silent — could show toast
    } finally {
      setExporting(false);
    }
  }, [year]);

  // Group by month descending
  const byMonth = entries.reduce<Record<string, CorpSredEntry[]>>((acc, e) => {
    const key = e.entry_date.slice(0, 7); // YYYY-MM
    if (!acc[key]) acc[key] = [];
    acc[key].push(e);
    return acc;
  }, {});
  const months = Object.keys(byMonth).sort((a, b) => (a < b ? 1 : -1));

  return (
    <>
      {showNew && (
        <NewEntryModal onClose={() => setShowNew(false)} onCreated={handleCreated} />
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          {entries.length === 0
            ? `No SR&ED sessions logged for FY${year}.`
            : `${entries.length} session${entries.length === 1 ? "" : "s"} logged for FY${year}.`}
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            disabled={exporting || entries.length === 0}
            className="inline-flex items-center gap-1.5 rounded-md border border-white/10 px-3 py-2 text-xs text-white/70 transition hover:border-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            Export T661 CSV
          </button>
          <button
            onClick={() => setShowNew(true)}
            className="inline-flex items-center gap-2 rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-600"
          >
            <Plus className="h-4 w-4" />
            Log session
          </button>
        </div>
      </div>

      {/* Summary */}
      <SummaryStrip summary={summary} year={year} />

      {/* Disclaimer */}
      <p className="text-muted-foreground/50 text-[10px]">
        SR&amp;ED estimates are for working-paper purposes only. Qualifying expenditures, labour rates, and ITC amounts must be verified by a qualified SR&amp;ED specialist before filing T661.
        The $80/hr rate and 35% ITC rate shown are illustrative defaults. Actual eligible amounts may differ.
      </p>

      {/* Entry list */}
      {entries.length === 0 ? (
        <div className="mt-8 flex flex-col items-center text-center">
          <FlaskConical className="text-muted-foreground/30 mb-3 h-10 w-10" />
          <p className="text-muted-foreground text-sm">No sessions logged yet.</p>
          <p className="text-muted-foreground/60 mt-1 text-xs">
            Log your first SR&amp;ED work session above to start building your T661 record.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {months.map((month) => (
            <section key={month}>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-white/40">
                {monthLabel(month + "-01")}
                <span className="ml-2 normal-case text-white/25">
                  ({byMonth[month].reduce((s, e) => s + e.hours, 0).toFixed(1)} hrs)
                </span>
              </h2>
              <div className="rounded-lg border border-white/10 bg-white/[0.03] px-5">
                {byMonth[month].map((e) => (
                  <EntryRow key={e.id} entry={e} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
