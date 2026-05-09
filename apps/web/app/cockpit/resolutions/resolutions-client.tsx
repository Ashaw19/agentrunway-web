"use client";

import { useState, useCallback, useRef } from "react";
import {
  Plus,
  Gavel,
  Loader2,
  AlertCircle,
  Printer,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  CorpResolution,
  CorpResolutionType,
  CorpResolutionStatus,
} from "@agent-runway/core/types/database";

// ── Constants ─────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<CorpResolutionType, string> = {
  salary_election:      "Salary Election",
  dividend_declaration: "Dividend Declaration",
  banking_authority:    "Banking Authority",
  officer_appointment:  "Officer Appointment",
  agm_waiver:           "AGM Waiver",
  general:              "General",
};

const TYPE_DESCRIPTIONS: Record<CorpResolutionType, string> = {
  salary_election:      "Authorize annual director compensation",
  dividend_declaration: "Declare a dividend on Class A shares",
  banking_authority:    "Designate signing officers for banking",
  officer_appointment:  "Appoint corporate officers",
  agm_waiver:           "Annual resolution in lieu of AGM",
  general:              "Free-form director resolution",
};

const TYPE_COLORS: Record<CorpResolutionType, string> = {
  salary_election:      "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
  dividend_declaration: "bg-violet-500/10 text-violet-300 border-violet-500/20",
  banking_authority:    "bg-cyan-500/10 text-cyan-300 border-cyan-500/20",
  officer_appointment:  "bg-blue-500/10 text-blue-300 border-blue-500/20",
  agm_waiver:           "bg-amber-500/10 text-amber-300 border-amber-500/20",
  general:              "bg-muted/40 text-muted-foreground border-muted/40",
};

const STATUS_COLORS: Record<CorpResolutionStatus, string> = {
  passed: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
  draft:  "bg-amber-500/10 text-amber-300 border-amber-500/20",
};

const today = new Date().toISOString().slice(0, 10);
const thisYear = new Date().getFullYear();

const TEMPLATES: Record<CorpResolutionType, { subject: string; body: string }> = {
  salary_election: {
    subject: `Director Compensation — Salary Authorization FY${thisYear}`,
    body: `BE IT RESOLVED THAT the Corporation pay Andrew Shaw, Director and President, a salary of $_______ per annum (or $_______ per month), effective _______, in consideration of services rendered to Agent Runway Inc.

BE IT FURTHER RESOLVED THAT the appropriate officer is authorized to execute all documents necessary to give effect to this resolution.

CERTIFIED a true copy of a Resolution of the Board of Directors of Agent Runway Inc. passed by written resolution on _______.


________________________________
Andrew Shaw, Sole Director`,
  },
  dividend_declaration: {
    subject: `Dividend Declaration — Class A Common Shares FY${thisYear}`,
    body: `BE IT RESOLVED THAT a dividend in the amount of $_______ per Class A Common Share be and is hereby declared payable to shareholders of record as of _______.

BE IT FURTHER RESOLVED THAT the payment date shall be _______.

BE IT FURTHER RESOLVED THAT the appropriate officer is authorized to execute all documents necessary to effect payment of this dividend.

CERTIFIED a true copy of a Resolution of the Board of Directors of Agent Runway Inc.


________________________________
Andrew Shaw, Sole Director`,
  },
  banking_authority: {
    subject: "Banking Resolution — Authorized Signatories",
    body: `BE IT RESOLVED THAT the Corporation maintain banking accounts and that Andrew Shaw is hereby authorized as the sole signing officer for all banking transactions on behalf of Agent Runway Inc.

BE IT FURTHER RESOLVED THAT the foregoing authority remains in effect until revoked by a subsequent resolution of the Board of Directors.

CERTIFIED a true copy of a Resolution of the Board of Directors of Agent Runway Inc.


________________________________
Andrew Shaw, Sole Director`,
  },
  officer_appointment: {
    subject: `Officers of the Corporation — Appointment Resolution FY${thisYear}`,
    body: `BE IT RESOLVED THAT the following officers of Agent Runway Inc. are hereby appointed to serve at the pleasure of the Board of Directors:

  President:   Andrew Shaw
  Secretary:   Andrew Shaw

BE IT FURTHER RESOLVED THAT any one officer is authorized to execute documents and instruments on behalf of the Corporation.

CERTIFIED a true copy of a Resolution of the Board of Directors of Agent Runway Inc.


________________________________
Andrew Shaw, Sole Director`,
  },
  agm_waiver: {
    subject: `Annual General Meeting — Written Resolution in Lieu FY${thisYear}`,
    body: `I, Andrew Shaw, being the sole shareholder of Agent Runway Inc., hereby waive notice of and consent to the holding of the Annual General Meeting of Shareholders for the fiscal year ended December 31, ${thisYear}.

BE IT RESOLVED THAT:

1. The financial statements of the Corporation for the fiscal year ended December 31, ${thisYear} are hereby approved.
2. The directors of the Corporation are elected for the ensuing year.
3. The appointment of an auditor is hereby waived (the Corporation qualifies as an exempt private corporation).


________________________________
Andrew Shaw, Sole Shareholder & Director
Date: _______`,
  },
  general: {
    subject: "",
    body: `BE IT RESOLVED THAT _______

CERTIFIED a true copy of a Resolution of the Board of Directors of Agent Runway Inc.


________________________________
Andrew Shaw, Sole Director`,
  },
};

// ── New Resolution Modal ───────────────────────────────────────────────────────

interface NewResolutionModalProps {
  onClose: () => void;
  onCreated: (res: CorpResolution) => void;
}

function NewResolutionModal({ onClose, onCreated }: NewResolutionModalProps) {
  const [step, setStep] = useState<"template" | "edit">("template");
  const [type, setType] = useState<CorpResolutionType>("salary_election");
  const [subject, setSubject] = useState("");
  const [bodyMd, setBodyMd] = useState("");
  const [passedDate, setPassedDate] = useState(today);
  const [status, setStatus] = useState<CorpResolutionStatus>("passed");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectTemplate = useCallback((t: CorpResolutionType) => {
    setType(t);
    setSubject(TEMPLATES[t].subject);
    setBodyMd(TEMPLATES[t].body);
    setStep("edit");
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setSaving(true);
      setError(null);
      try {
        const res = await fetch("/api/cockpit/resolutions", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            resolution_type: type,
            subject,
            body_md: bodyMd,
            passed_date: passedDate,
            status,
          }),
        });
        const json = (await res.json()) as {
          ok?: boolean;
          resolution?: CorpResolution;
          error?: string;
        };
        if (!res.ok || !json.ok) throw new Error(json.error ?? "Save failed");
        onCreated(json.resolution!);
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Save failed");
      } finally {
        setSaving(false);
      }
    },
    [type, subject, bodyMd, passedDate, status, onCreated, onClose],
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div className="relative z-10 w-full max-w-2xl rounded-xl border border-white/10 bg-[oklch(0.235_0.055_262)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <h2 className="text-sm font-semibold text-white">
            {step === "template" ? "Choose a resolution template" : "New resolution"}
          </h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {step === "template" ? (
          <div className="grid grid-cols-2 gap-3 p-6 sm:grid-cols-3">
            {(Object.keys(TEMPLATES) as CorpResolutionType[]).map((t) => (
              <button
                key={t}
                onClick={() => selectTemplate(t)}
                className="rounded-lg border border-white/10 bg-white/[0.03] p-4 text-left transition hover:border-white/20 hover:bg-white/[0.06]"
              >
                <span
                  className={cn(
                    "mb-2 inline-block rounded-full border px-2 py-0.5 text-[10px] font-medium",
                    TYPE_COLORS[t],
                  )}
                >
                  {TYPE_LABELS[t]}
                </span>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  {TYPE_DESCRIPTIONS[t]}
                </p>
              </button>
            ))}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 p-6">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setStep("template")}
                className="text-muted-foreground hover:text-foreground text-xs transition"
              >
                ← Change template
              </button>
              <span
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[10px] font-medium",
                  TYPE_COLORS[type],
                )}
              >
                {TYPE_LABELS[type]}
              </span>
            </div>

            {/* Subject */}
            <div>
              <label className="text-muted-foreground mb-1.5 block text-xs font-medium">
                Subject <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                required
                className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/25 focus:border-white/20 focus:outline-none"
              />
            </div>

            {/* Body */}
            <div>
              <label className="text-muted-foreground mb-1.5 block text-xs font-medium">
                Resolution text <span className="text-red-400">*</span>
              </label>
              <textarea
                value={bodyMd}
                onChange={(e) => setBodyMd(e.target.value)}
                required
                rows={14}
                className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 font-mono text-xs leading-relaxed text-white/90 placeholder:text-white/25 focus:border-white/20 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Date */}
              <div>
                <label className="text-muted-foreground mb-1.5 block text-xs font-medium">
                  Date passed <span className="text-red-400">*</span>
                </label>
                <input
                  type="date"
                  value={passedDate}
                  onChange={(e) => setPassedDate(e.target.value)}
                  required
                  className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-white/20 focus:outline-none [color-scheme:dark]"
                />
              </div>
              {/* Status */}
              <div>
                <label className="text-muted-foreground mb-1.5 block text-xs font-medium">
                  Status
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as CorpResolutionStatus)}
                  className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-white/20 focus:outline-none"
                >
                  <option value="passed" className="bg-[oklch(0.235_0.055_262)]">
                    Passed
                  </option>
                  <option value="draft" className="bg-[oklch(0.235_0.055_262)]">
                    Draft
                  </option>
                </select>
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
                className="inline-flex items-center gap-2 rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Gavel className="h-4 w-4" />
                )}
                {saving ? "Saving…" : "Save resolution"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ── Resolution Detail Modal ───────────────────────────────────────────────────

interface DetailModalProps {
  resolution: CorpResolution;
  onClose: () => void;
}

function DetailModal({ resolution, onClose }: DetailModalProps) {
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = useCallback(() => {
    const content = printRef.current?.innerHTML ?? "";
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${resolution.resolution_number} — ${resolution.subject}</title>
  <style>
    body { font-family: "Times New Roman", Times, serif; font-size: 12pt; margin: 2.5cm; color: #000; }
    .corp-header { text-align: center; margin-bottom: 2em; padding-bottom: 1em; border-bottom: 1px solid #000; }
    .corp-header h1 { font-size: 14pt; margin: 0 0 0.25em; }
    .corp-header p { margin: 0; font-size: 10pt; color: #444; }
    .meta { font-size: 10pt; color: #555; margin-bottom: 1.5em; }
    .subject { font-size: 13pt; font-weight: bold; margin: 0 0 1.5em; }
    pre { white-space: pre-wrap; font-family: inherit; font-size: 12pt; line-height: 1.7; margin: 0; }
  </style>
</head>
<body>
  <div class="corp-header">
    <h1>Agent Runway Inc.</h1>
    <p>Federal CCPC — Incorporated 2026-04-16 — New Brunswick</p>
  </div>
  ${content}
</body>
</html>`);
    win.document.close();
    win.focus();
    win.print();
    win.close();
  }, [resolution]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl border border-white/10 bg-[oklch(0.235_0.055_262)] shadow-2xl">
        {/* Sticky header */}
        <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs text-amber-300">
              {resolution.resolution_number}
            </span>
            <span
              className={cn(
                "rounded-full border px-2 py-0.5 text-[10px] font-medium",
                STATUS_COLORS[resolution.status],
              )}
            >
              {resolution.status}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 rounded-md border border-white/10 px-3 py-1.5 text-xs text-white/70 transition hover:border-white/20 hover:text-white"
            >
              <Printer className="h-3.5 w-3.5" />
              Print
            </button>
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground transition"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto px-6 py-5">
          <div ref={printRef}>
            <p className="meta text-muted-foreground mb-1 text-xs">
              {resolution.resolution_number} · {resolution.passed_date} ·{" "}
              {TYPE_LABELS[resolution.resolution_type]}
            </p>
            <h3 className="subject mb-4 text-base font-semibold text-white">
              {resolution.subject}
            </h3>
            <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-white/80">
              {resolution.body_md}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Resolution list row ───────────────────────────────────────────────────────

interface ResolutionRowProps {
  resolution: CorpResolution;
  onView: (r: CorpResolution) => void;
}

function ResolutionRow({ resolution, onView }: ResolutionRowProps) {
  return (
    <button
      onClick={() => onView(resolution)}
      className="group flex w-full items-center gap-4 py-3 text-left transition hover:bg-white/[0.02]"
    >
      <Gavel className="text-muted-foreground/50 h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="shrink-0 font-mono text-[11px] text-amber-300/80">
            {resolution.resolution_number}
          </span>
          <span className="truncate text-sm font-medium text-white">{resolution.subject}</span>
        </div>
        <p className="text-muted-foreground mt-0.5 text-xs">{resolution.passed_date}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span
          className={cn(
            "rounded-full border px-2 py-0.5 text-[10px] font-medium",
            TYPE_COLORS[resolution.resolution_type],
          )}
        >
          {TYPE_LABELS[resolution.resolution_type]}
        </span>
        <span
          className={cn(
            "rounded-full border px-2 py-0.5 text-[10px] font-medium",
            STATUS_COLORS[resolution.status],
          )}
        >
          {resolution.status}
        </span>
      </div>
    </button>
  );
}

// ── Root client component ─────────────────────────────────────────────────────

interface ResolutionsClientProps {
  initialResolutions: CorpResolution[];
}

export function ResolutionsClient({ initialResolutions }: ResolutionsClientProps) {
  const [resolutions, setResolutions] = useState<CorpResolution[]>(initialResolutions);
  const [showNew, setShowNew] = useState(false);
  const [viewing, setViewing] = useState<CorpResolution | null>(null);

  const handleCreated = useCallback((res: CorpResolution) => {
    setResolutions((prev) => [res, ...prev]);
  }, []);

  // Group by fiscal year, descending
  const byYear = resolutions.reduce<Record<number, CorpResolution[]>>((acc, r) => {
    const yr = r.fiscal_year;
    if (!acc[yr]) acc[yr] = [];
    acc[yr].push(r);
    return acc;
  }, {});
  const years = Object.keys(byYear)
    .map(Number)
    .sort((a, b) => b - a);

  return (
    <>
      {showNew && (
        <NewResolutionModal onClose={() => setShowNew(false)} onCreated={handleCreated} />
      )}
      {viewing && (
        <DetailModal resolution={viewing} onClose={() => setViewing(null)} />
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-sm">
          {resolutions.length === 0
            ? "No resolutions on record."
            : `${resolutions.length} resolution${resolutions.length === 1 ? "" : "s"} on record.`}
        </p>
        <button
          onClick={() => setShowNew(true)}
          className="inline-flex items-center gap-2 rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-500"
        >
          <Plus className="h-4 w-4" />
          New resolution
        </button>
      </div>

      {/* Empty state */}
      {resolutions.length === 0 ? (
        <div className="mt-12 flex flex-col items-center justify-center text-center">
          <Gavel className="text-muted-foreground/30 mb-3 h-10 w-10" />
          <p className="text-muted-foreground text-sm">No resolutions recorded yet.</p>
          <p className="text-muted-foreground/60 mt-1 text-xs">
            Start with a salary election or AGM waiver for FY{thisYear}.
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {years.map((yr) => (
            <section key={yr}>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-white/40">
                FY{yr}
              </h2>
              <div className="divide-y divide-white/5 rounded-lg border border-white/10 bg-white/[0.03] px-5">
                {byYear[yr].map((r) => (
                  <ResolutionRow key={r.id} resolution={r} onView={setViewing} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
