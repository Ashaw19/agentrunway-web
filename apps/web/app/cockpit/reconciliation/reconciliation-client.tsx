"use client";

import { useState, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import type {
  CorpBankReconciliationSummaryRow,
  CorpBankLine,
} from "@agent-runway/core/types/database";

// ── helpers ───────────────────────────────────────────────────────────────────

const fmtDate = (iso: string) =>
  new Date(iso + "T12:00:00").toLocaleDateString("en-CA", {
    month: "short", day: "numeric", year: "numeric",
  });

const fmtAmt = (n: number) => {
  const abs = Math.abs(n).toFixed(2);
  return n < 0 ? `-$${abs}` : `+$${abs}`;
};

const fmtPct = (n: number | null) =>
  n == null ? "—" : `${n.toFixed(1)}%`;

function MatchPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    matched:   "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    manual:    "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
    unmatched: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    split:     "bg-blue-500/15 text-blue-400 border-blue-500/30",
  };
  const label: Record<string, string> = {
    matched: "Matched", manual: "Skipped", unmatched: "Unmatched", split: "Split",
  };
  return (
    <span className={cn("inline-block text-xs px-2 py-0.5 rounded-full border font-medium",
      styles[status] ?? styles.unmatched)}>
      {label[status] ?? status}
    </span>
  );
}

// ── Upload form ───────────────────────────────────────────────────────────────

function UploadForm({ onUploaded }: { onUploaded: (s: CorpBankReconciliationSummaryRow) => void }) {
  const [bankName, setBankName] = useState("RBC Business Chequing");
  const [accountLabel, setAccountLabel] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ row_count: number; matched_count: number; unmatched_count: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !bankName.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);

    const fd = new FormData();
    fd.append("file", file);
    fd.append("bank_name", bankName.trim());
    if (accountLabel.trim()) fd.append("account_label", accountLabel.trim());

    try {
      const res = await fetch("/api/cockpit/bank-statements", { method: "POST", body: fd });
      const json = await res.json();
      if (!json.ok) { setError(json.error ?? "Upload failed"); return; }
      setResult({ row_count: json.row_count, matched_count: json.matched_count, unmatched_count: json.unmatched_count });
      // Refresh the statements list by fetching the new row
      const listRes = await fetch("/api/cockpit/bank-statements?limit=1");
      const listJson = await listRes.json();
      if (listJson.ok && listJson.statements?.[0]) {
        onUploaded(listJson.statements[0]);
      }
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
      <h2 className="text-sm font-semibold text-white mb-4">Upload Bank Statement</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Bank / Account Name</label>
            <input
              value={bankName}
              onChange={e => setBankName(e.target.value)}
              placeholder="RBC Business Chequing"
              className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-amber-500/60"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Account Number (optional)</label>
            <input
              value={accountLabel}
              onChange={e => setAccountLabel(e.target.value)}
              placeholder="****1234"
              className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-amber-500/60"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs text-zinc-400 mb-1">CSV File</label>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            onChange={e => setFile(e.target.files?.[0] ?? null)}
            className="w-full text-sm text-zinc-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-zinc-700 file:text-zinc-200 file:text-xs file:font-medium hover:file:bg-zinc-600 cursor-pointer"
          />
          <p className="text-xs text-zinc-500 mt-1">
            Supports RBC, TD, BMO, and most Canadian bank CSV exports. Must have a Date column and Debit/Credit or signed Amount column.
          </p>
        </div>

        {error && (
          <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>
        )}

        {result && (
          <div className="flex gap-4 text-xs bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
            <span className="text-emerald-400 font-medium">Parsed {result.row_count} lines</span>
            <span className="text-emerald-300">{result.matched_count} auto-matched</span>
            {result.unmatched_count > 0 && (
              <span className="text-amber-400">{result.unmatched_count} need review</span>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={!file || !bankName.trim() || loading}
          className="px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-black text-sm font-semibold rounded-lg transition-colors"
        >
          {loading ? "Uploading…" : "Upload & Match"}
        </button>
      </form>
    </div>
  );
}

// ── Statement summary card ────────────────────────────────────────────────────

function StatementCard({
  stmt,
  selected,
  onSelect,
}: {
  stmt: CorpBankReconciliationSummaryRow;
  selected: boolean;
  onSelect: () => void;
}) {
  const rate = stmt.match_rate_pct ?? 0;
  const rateColor = rate >= 95 ? "text-emerald-400" : rate >= 80 ? "text-amber-400" : "text-red-400";

  return (
    <button
      onClick={onSelect}
      className={cn(
        "w-full text-left rounded-xl border p-4 transition-colors",
        selected
          ? "border-amber-500/50 bg-amber-500/5"
          : "border-zinc-800 bg-zinc-900/60 hover:border-zinc-700"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-white">{stmt.bank_name}</p>
          {stmt.account_label && (
            <p className="text-xs text-zinc-500">{stmt.account_label}</p>
          )}
        </div>
        <span className={cn("text-lg font-bold tabular-nums", rateColor)}>
          {fmtPct(stmt.match_rate_pct)}
        </span>
      </div>
      <p className="text-xs text-zinc-400 mt-1">
        {fmtDate(stmt.period_start)} – {fmtDate(stmt.period_end)}
      </p>
      <div className="flex gap-3 mt-2 text-xs">
        <span className="text-zinc-300">{stmt.row_count} lines</span>
        <span className="text-emerald-400">{stmt.matched_count} matched</span>
        {stmt.manual_count > 0 && <span className="text-zinc-400">{stmt.manual_count} skipped</span>}
        {stmt.unmatched_count > 0 && <span className="text-amber-400">{stmt.unmatched_count} unmatched</span>}
      </div>
    </button>
  );
}

// ── Line detail row ───────────────────────────────────────────────────────────

function LineRow({
  line,
  onSkip,
  onReopen,
  onMatch,
}: {
  line: CorpBankLine;
  onSkip: (id: string) => void;
  onReopen: (id: string) => void;
  onMatch: (line: CorpBankLine) => void;
}) {
  const isDebit = line.amount_cad < 0;

  return (
    <div className={cn(
      "flex items-center gap-3 px-4 py-3 border-b border-zinc-800/60 last:border-0",
      line.match_status === "unmatched" ? "bg-amber-500/5" : ""
    )}>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-zinc-200 truncate">{line.description_raw}</p>
        <p className="text-xs text-zinc-500 mt-0.5">{fmtDate(line.line_date)}</p>
        {line.skip_reason && (
          <p className="text-xs text-zinc-500 italic">{line.skip_reason}</p>
        )}
      </div>
      <span className={cn("text-sm font-mono tabular-nums font-medium",
        isDebit ? "text-red-400" : "text-emerald-400")}>
        {fmtAmt(line.amount_cad)}
      </span>
      <MatchPill status={line.match_status} />
      {line.match_status === "unmatched" && (
        <>
          <button
            onClick={() => onMatch(line)}
            className="text-xs text-emerald-400 hover:text-emerald-200 transition-colors shrink-0"
          >
            Match
          </button>
          <span className="text-zinc-600">·</span>
          <button
            onClick={() => onSkip(line.id)}
            className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors shrink-0"
          >
            Skip
          </button>
        </>
      )}
      {line.match_status === "manual" && (
        <button
          onClick={() => onReopen(line.id)}
          className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors shrink-0"
        >
          Reopen
        </button>
      )}
      {line.match_status === "matched" && (
        <button
          onClick={() => onReopen(line.id)}
          className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors shrink-0"
        >
          Unmatch
        </button>
      )}
    </div>
  );
}

// ── Manual-match modal ────────────────────────────────────────────────────────

interface CandidateRow {
  id: string;
  date: string;
  amount_total: number;
  amount_pretax: number;
  gst_hst: number;
  vendor_name_raw: string | null;
  description: string | null;
  account_code: string | null;
  source_channel: string;
  date_distance_days: number;
  amount_diff: number;
}

function MatchModal({
  line,
  onClose,
  onMatched,
}: {
  line: CorpBankLine;
  onClose: () => void;
  onMatched: (matched_tx_id: string) => void;
}) {
  const [candidates, setCandidates] = useState<CandidateRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [searchWindow, setSearchWindow] = useState<{
    start: string;
    end: string;
    amount_min: number;
    amount_max: number;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/cockpit/bank-lines/${line.id}/candidates`);
      const json = await res.json();
      if (!json.ok) {
        setError(json.error ?? "Failed to load candidates");
        setLoading(false);
        return;
      }
      setCandidates(json.candidates ?? []);
      setSearchWindow(json.search_window ?? null);
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }, [line.id]);

  // Load on mount
  const loadedRef = useRef<string | null>(null);
  if (loadedRef.current !== line.id) {
    loadedRef.current = line.id;
    void load();
  }

  const pick = async (txId: string) => {
    setSubmitting(txId);
    try {
      const res = await fetch("/api/cockpit/bank-lines", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: line.id,
          match_status: "matched",
          matched_tx_id: txId,
        }),
      });
      const json = await res.json();
      if (!json.ok) {
        setError(json.error ?? "Match failed");
        setSubmitting(null);
        return;
      }
      onMatched(txId);
    } catch {
      setError("Network error.");
      setSubmitting(null);
    }
  };

  const isDebit = line.amount_cad < 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 p-4 pt-[8vh]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-xl border border-zinc-800 bg-zinc-950 p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-medium text-zinc-100">Match bank line to ledger</h2>
            <p className="mt-1 text-xs text-zinc-400">
              {fmtDate(line.line_date)}
              <span className="mx-1.5 text-zinc-600">·</span>
              <span className={cn("font-mono tabular-nums", isDebit ? "text-red-400" : "text-emerald-400")}>
                {fmtAmt(line.amount_cad)}
              </span>
              <span className="mx-1.5 text-zinc-600">·</span>
              <span className="text-zinc-300">{line.description_raw}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {searchWindow && (
          <p className="mb-3 text-[11px] text-zinc-500">
            Searching ±14 days ({searchWindow.start} → {searchWindow.end}) and ${searchWindow.amount_min.toFixed(2)} – ${searchWindow.amount_max.toFixed(2)}.
            Already-matched transactions hidden.
          </p>
        )}

        {error && (
          <p className="mb-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
            {error}
          </p>
        )}

        {loading && <p className="px-2 py-4 text-sm text-zinc-500">Searching for candidates…</p>}

        {!loading && candidates && candidates.length === 0 && (
          <div className="rounded-md border border-zinc-800 bg-zinc-900/40 p-4 text-center">
            <p className="text-sm text-zinc-400">No matching transactions in the search window.</p>
            <p className="mt-1 text-xs text-zinc-500">
              Either the corp_transaction wasn&apos;t logged yet, or the date / amount drifted outside ±14d / ±5%.
              Add the receipt via /cockpit/expenses, then re-match.
            </p>
          </div>
        )}

        {!loading && candidates && candidates.length > 0 && (
          <div className="max-h-[60vh] overflow-y-auto rounded-md border border-zinc-800">
            {candidates.map((c) => (
              <CandidateLine
                key={c.id}
                candidate={c}
                disabled={submitting !== null}
                submitting={submitting === c.id}
                onPick={() => pick(c.id)}
              />
            ))}
          </div>
        )}

        <div className="mt-4 flex items-center justify-end border-t border-zinc-800 pt-3">
          <button
            onClick={onClose}
            disabled={submitting !== null}
            className="rounded-md px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-200"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function CandidateLine({
  candidate,
  disabled,
  submitting,
  onPick,
}: {
  candidate: CandidateRow;
  disabled: boolean;
  submitting: boolean;
  onPick: () => void;
}) {
  const exact = candidate.date_distance_days === 0 && candidate.amount_diff === 0;
  const closeEnough = candidate.date_distance_days <= 1 && Math.abs(candidate.amount_diff) <= 0.5;

  return (
    <div className="flex items-center gap-3 border-b border-zinc-800/60 px-3 py-2.5 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="truncate text-sm text-zinc-200">
          {candidate.vendor_name_raw ?? candidate.description ?? "(no vendor)"}
        </p>
        <p className="mt-0.5 text-[11px] text-zinc-500">
          {fmtDate(candidate.date)}
          {candidate.date_distance_days > 0 && (
            <span className="ml-1 text-amber-500/70">
              · {candidate.date_distance_days}d off
            </span>
          )}
          <span className="mx-1.5 text-zinc-600">·</span>
          {candidate.account_code ?? "(no account)"}
          <span className="mx-1.5 text-zinc-600">·</span>
          {candidate.source_channel}
        </p>
      </div>
      <div className="flex flex-col items-end whitespace-nowrap">
        <span className="font-mono text-sm tabular-nums text-zinc-200">
          ${candidate.amount_total.toFixed(2)}
        </span>
        {candidate.amount_diff !== 0 && (
          <span className="text-[10px] text-amber-500/70">
            {candidate.amount_diff > 0 ? "+" : ""}${candidate.amount_diff.toFixed(2)} off
          </span>
        )}
      </div>
      <button
        onClick={onPick}
        disabled={disabled}
        className={cn(
          "shrink-0 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50",
          exact
            ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25"
            : closeEnough
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
              : "border-zinc-700 bg-zinc-800/50 text-zinc-300 hover:bg-zinc-800",
        )}
      >
        {submitting ? "Matching…" : exact ? "Exact match" : "Match"}
      </button>
    </div>
  );
}

// ── Lines panel ───────────────────────────────────────────────────────────────

function LinesPanel({ statementId }: { statementId: string }) {
  const [lines, setLines] = useState<CorpBankLine[] | null>(null);
  const [filter, setFilter] = useState<"all" | "unmatched" | "matched" | "manual">("unmatched");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [matchingLine, setMatchingLine] = useState<CorpBankLine | null>(null);
  const loadedRef = useRef<string | null>(null);

  const loadLines = useCallback(async (f: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/cockpit/bank-lines?statement_id=${statementId}&status=${f}&limit=500`);
      const json = await res.json();
      if (!json.ok) { setError(json.error ?? "Load failed"); return; }
      setLines(json.lines);
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }, [statementId]);

  // Load on first render or filter change
  if (loadedRef.current !== `${statementId}:${filter}`) {
    loadedRef.current = `${statementId}:${filter}`;
    loadLines(filter);
  }

  const handleSkip = async (id: string) => {
    const reason = prompt("Reason for skipping (optional):", "Bank transfer / not a ledger entry") ?? "";
    if (reason === null) return; // cancelled
    await fetch("/api/cockpit/bank-lines", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, match_status: "manual", skip_reason: reason }),
    });
    setLines(prev => prev?.map(l => l.id === id ? { ...l, match_status: "manual", skip_reason: reason } : l) ?? null);
  };

  const handleReopen = async (id: string) => {
    await fetch("/api/cockpit/bank-lines", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, match_status: "unmatched", skip_reason: null }),
    });
    setLines(prev =>
      prev?.map(l =>
        l.id === id
          ? { ...l, match_status: "unmatched", skip_reason: null, matched_tx_id: null, match_method: null, match_confidence: null }
          : l,
      ) ?? null,
    );
  };

  const handleMatched = (lineId: string, matched_tx_id: string) => {
    setLines(prev =>
      prev?.map(l =>
        l.id === lineId
          ? { ...l, match_status: "matched", matched_tx_id, match_method: "manual", match_confidence: 1.0 }
          : l,
      ) ?? null,
    );
    setMatchingLine(null);
  };

  const FILTERS: { key: "all" | "unmatched" | "matched" | "manual"; label: string }[] = [
    { key: "unmatched", label: "Unmatched" },
    { key: "matched",   label: "Matched" },
    { key: "manual",    label: "Skipped" },
    { key: "all",       label: "All" },
  ];

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 overflow-hidden">
      <div className="flex items-center gap-1 px-4 py-3 border-b border-zinc-800 bg-zinc-900">
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              "px-3 py-1 rounded-full text-xs font-medium transition-colors",
              filter === f.key
                ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                : "text-zinc-400 hover:text-zinc-200"
            )}
          >
            {f.label}
          </button>
        ))}
        {loading && <span className="text-xs text-zinc-500 ml-2">Loading…</span>}
      </div>

      {error && (
        <p className="text-xs text-red-400 px-4 py-3">{error}</p>
      )}

      {!loading && lines?.length === 0 && (
        <p className="text-sm text-zinc-500 px-4 py-6 text-center">
          {filter === "unmatched" ? "All lines reconciled." : "No lines in this category."}
        </p>
      )}

      <div className="max-h-[60vh] overflow-y-auto">
        {lines?.map(line => (
          <LineRow
            key={line.id}
            line={line}
            onSkip={handleSkip}
            onReopen={handleReopen}
            onMatch={(l) => setMatchingLine(l)}
          />
        ))}
      </div>

      {matchingLine && (
        <MatchModal
          line={matchingLine}
          onClose={() => setMatchingLine(null)}
          onMatched={(txId) => handleMatched(matchingLine.id, txId)}
        />
      )}
    </div>
  );
}

// ── Main client component ─────────────────────────────────────────────────────

export function ReconciliationClient({
  initialStatements,
}: {
  initialStatements: CorpBankReconciliationSummaryRow[];
}) {
  const [statements, setStatements] = useState<CorpBankReconciliationSummaryRow[]>(initialStatements);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialStatements[0]?.statement_id ?? null
  );

  const handleUploaded = (stmt: CorpBankReconciliationSummaryRow) => {
    setStatements(prev => [stmt, ...prev.filter(s => s.statement_id !== stmt.statement_id)]);
    setSelectedId(stmt.statement_id);
  };

  return (
    <div className="space-y-6">
      <UploadForm onUploaded={handleUploaded} />

      {statements.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Statement list */}
          <div className="space-y-3">
            <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Statements</h2>
            {statements.map(s => (
              <StatementCard
                key={s.statement_id}
                stmt={s}
                selected={s.statement_id === selectedId}
                onSelect={() => setSelectedId(s.statement_id)}
              />
            ))}
          </div>

          {/* Lines panel */}
          <div className="lg:col-span-2">
            {selectedId && (
              <>
                <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
                  Statement Lines
                </h2>
                <LinesPanel key={selectedId} statementId={selectedId} />
              </>
            )}
          </div>
        </div>
      )}

      {statements.length === 0 && (
        <div className="rounded-xl border border-dashed border-zinc-700 p-10 text-center">
          <p className="text-sm text-zinc-400">No statements uploaded yet.</p>
          <p className="text-xs text-zinc-600 mt-1">
            Export a CSV from your bank and upload it above to begin reconciliation.
          </p>
        </div>
      )}
    </div>
  );
}
