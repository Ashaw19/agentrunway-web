"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Circle, Inbox, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

type Severity = "low" | "medium" | "high";

interface InboxItem {
  id: string;
  title: string;
  body: string | null;
  source: string;
  source_ref_id: string | null;
  severity: Severity;
  resolved_at: string | null;
  resolved_note: string | null;
  created_at: string;
  updated_at: string;
}

const SEVERITY_LABEL: Record<Severity, string> = {
  high:   "High",
  medium: "Medium",
  low:    "Low",
};

const SEVERITY_STYLE: Record<Severity, string> = {
  high:   "bg-rose-500/10 text-rose-300 ring-rose-500/20",
  medium: "bg-amber-500/10 text-amber-300 ring-amber-500/20",
  low:    "bg-white/[0.04] text-white/40 ring-white/10",
};

const SOURCE_LABEL: Record<string, string> = {
  manual:           "Manual",
  hugo:             "Hugo (daily brief)",
  "allocation-ui":  "Allocation",
  "pre-incorp-ui":  "Pre-incorp",
  "founder-comp":   "Founder comp",
  "director-persona": "Director",
  marcus:           "Marcus (SR&ED)",
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", {
    month: "short",
    day:   "numeric",
    year:  "numeric",
  });
}

function ResolveModal({
  item,
  onResolve,
  onClose,
}: {
  item: InboxItem;
  onResolve: (id: string, note: string) => Promise<void>;
  onClose: () => void;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    await onResolve(item.id, note);
    setBusy(false);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-md rounded-xl border border-white/[0.08] bg-[oklch(0.26_0.055_262)] p-6 shadow-2xl">
        <h2 className="text-foreground mb-1 text-base font-semibold">Resolve item</h2>
        <p className="text-muted-foreground/80 mb-4 text-sm">{item.title}</p>
        <label className="text-muted-foreground/70 mb-1.5 block text-[11px] tracking-[0.08em] uppercase">
          Resolution note <span className="text-white/30">(optional)</span>
        </label>
        <textarea
          className="bg-white/[0.04] text-foreground placeholder-muted-foreground/40 focus:ring-blue-500/40 w-full rounded-lg border border-white/[0.08] p-3 text-sm focus:ring-2 focus:outline-none"
          rows={3}
          placeholder="What did you do / decide?"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          autoFocus
        />
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="text-muted-foreground/80 hover:text-foreground rounded-lg px-4 py-2 text-sm transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy}
            className="bg-blue-600 hover:bg-blue-500 rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors disabled:opacity-50"
          >
            {busy ? "Resolving…" : "Mark resolved"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function InboxPage() {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showResolved, setShowResolved] = useState(false);
  const [resolving, setResolving] = useState<InboxItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (includeResolved: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/cockpit/inbox?resolved=${includeResolved}&limit=100`);
      const json = await res.json() as { ok: boolean; items?: InboxItem[]; error?: string };
      if (!json.ok) throw new Error(json.error ?? "Load failed");
      setItems(json.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(showResolved); }, [load, showResolved]);

  async function handleResolve(id: string, note: string) {
    const res = await fetch(`/api/cockpit/inbox/${id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ resolved_note: note }),
    });
    const json = await res.json() as { ok: boolean };
    if (json.ok) {
      setResolving(null);
      void load(showResolved);
    }
  }

  const unresolved = items.filter((i) => !i.resolved_at);
  const resolved   = items.filter((i) =>  i.resolved_at);

  return (
    <>
      {resolving && (
        <ResolveModal
          item={resolving}
          onResolve={handleResolve}
          onClose={() => setResolving(null)}
        />
      )}

      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-foreground font-[var(--font-cockpit-display)] text-4xl font-normal leading-none tracking-tight">
              Inbox
            </h1>
            <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">
              Actionable items from cockpit surfaces — allocation questions, pre-incorp reviews, deadline flags.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowResolved((v) => !v)}
              className={cn(
                "rounded-full border px-3 py-1 text-[11px] font-medium tracking-wide transition-colors",
                showResolved
                  ? "border-blue-500/30 bg-blue-500/10 text-blue-300"
                  : "border-white/[0.08] bg-white/[0.03] text-white/50 hover:text-white/70",
              )}
            >
              {showResolved ? "Hide resolved" : "Show resolved"}
            </button>
            <button
              onClick={() => load(showResolved)}
              className="text-muted-foreground/60 hover:text-foreground rounded-lg p-1.5 transition-colors"
              title="Refresh"
            >
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-rose-500/20 bg-rose-500/[0.06] p-4 text-sm text-rose-300">
            {error}
          </div>
        )}

        {/* Unresolved */}
        {!loading && unresolved.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <Inbox className="text-muted-foreground/30 h-10 w-10" />
            <p className="text-muted-foreground/60 text-sm">No open items — inbox is clear.</p>
          </div>
        )}

        {unresolved.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-muted-foreground/60 text-[11px] tracking-[0.08em] uppercase">
              Open · {unresolved.length}
            </h2>
            <ul className="space-y-2">
              {unresolved.map((item) => (
                <ItemRow key={item.id} item={item} onResolve={() => setResolving(item)} />
              ))}
            </ul>
          </section>
        )}

        {/* Resolved */}
        {showResolved && resolved.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-muted-foreground/40 text-[11px] tracking-[0.08em] uppercase">
              Resolved · {resolved.length}
            </h2>
            <ul className="space-y-2 opacity-60">
              {resolved.map((item) => (
                <ItemRow key={item.id} item={item} onResolve={undefined} />
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}

function ItemRow({
  item,
  onResolve,
}: {
  item: InboxItem;
  onResolve?: () => void;
}) {
  const resolved = !!item.resolved_at;

  return (
    <li className="group flex items-start gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3.5 transition-colors hover:border-white/[0.10] hover:bg-white/[0.03]">
      {/* Resolve button / resolved indicator */}
      <div className="mt-0.5 flex-shrink-0">
        {resolved ? (
          <CheckCircle2 className="text-emerald-400/60 h-4.5 w-4.5" aria-label="Resolved" />
        ) : onResolve ? (
          <button
            onClick={onResolve}
            className="text-muted-foreground/40 hover:text-emerald-400 transition-colors"
            title="Mark resolved"
            aria-label="Mark resolved"
          >
            <Circle className="h-4.5 w-4.5" />
          </button>
        ) : (
          <Circle className="text-muted-foreground/20 h-4.5 w-4.5" />
        )}
      </div>

      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <p className={cn("text-sm font-medium", resolved ? "text-foreground/50 line-through" : "text-foreground/90")}>
            {item.title}
          </p>
          <div className="flex flex-shrink-0 items-center gap-1.5">
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 text-[10px] font-medium tracking-wide ring-1 ring-inset uppercase",
                SEVERITY_STYLE[item.severity] ?? SEVERITY_STYLE.medium,
              )}
            >
              {SEVERITY_LABEL[item.severity] ?? item.severity}
            </span>
            <span className="text-muted-foreground/40 text-[10px]">
              {SOURCE_LABEL[item.source] ?? item.source}
            </span>
          </div>
        </div>

        {item.body && (
          <p className="text-muted-foreground/70 text-xs leading-relaxed">{item.body}</p>
        )}

        <div className="flex flex-wrap items-center gap-3 pt-0.5 text-[10px]">
          <span className="text-muted-foreground/40 font-mono">{fmtDate(item.created_at)}</span>
          {resolved && item.resolved_at && (
            <span className="text-emerald-400/50">
              Resolved {fmtDate(item.resolved_at)}
              {item.resolved_note ? ` · ${item.resolved_note}` : ""}
            </span>
          )}
          {item.source_ref_id && (
            <span className="text-muted-foreground/30 font-mono">{item.source_ref_id}</span>
          )}
        </div>
      </div>
    </li>
  );
}
