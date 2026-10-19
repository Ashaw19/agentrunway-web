"use client";

/**
 * AI activity page: what Flight Crew changed (with Undo) and which AI calls
 * ran, from the AI run ledger. Undo posts to /api/ai-activity/undo, which
 * runs packages/core/lib/ai-undo.ts with the agent's own client.
 */

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Bot, CheckCircle2, ChevronDown, ChevronRight, Loader2, RotateCcw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import {
  formatAiActivityTime,
  type AIActionView,
  type AIFailureCounts,
  type AiRunListRow,
} from "@agent-runway/core/lib/ai-activity-load";
import { featureLabel, formatAiCost, type AiRunSummary } from "@agent-runway/core/lib/ai-activity";

const SOURCE_LABEL: Record<AIActionView["source"], string> = {
  approval: "after you approved it",
  chat: "in chat",
  mcp: "from the connector",
  other: "",
};

export function AiActivityContent({
  actions: initialActions,
  runs,
  summary,
  failures,
  truncated,
  loadFailed,
  windowDays,
}: {
  actions: AIActionView[];
  runs: AiRunListRow[];
  summary: AiRunSummary;
  failures: AIFailureCounts;
  truncated: boolean;
  loadFailed: boolean;
  windowDays: number;
}) {
  const router = useRouter();
  const [actions, setActions] = useState(initialActions);
  const [undoing, setUndoing] = useState<string | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  // The change on the confirm step. It stays set while the dialog closes, so
  // the closing dialog keeps its words.
  const [confirming, setConfirming] = useState<AIActionView | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function undo(action: AIActionView) {
    setUndoing(action.toolCallId);
    try {
      const res = await fetch("/api/ai-activity/undo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // The fingerprint of what this page showed: the undo refuses if the
        // change moved on since.
        body: JSON.stringify({ toolCallId: action.toolCallId, expected: action.fingerprint }),
      });
      const body = (await res.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
      const message = body?.message ?? "Couldn't undo that change. Try again.";
      if (res.ok && body?.ok) {
        toast.success(message);
        setActions((prev) =>
          prev.map((a) => (a.toolCallId === action.toolCallId ? { ...a, undone: true, canUndo: false, status: "Undone" } : a)),
        );
        router.refresh();
      } else {
        toast.error(message, { duration: 8000 });
      }
    } catch {
      toast.error("Couldn't reach Agent Runway. Check your connection and try again.");
    } finally {
      setUndoing(null);
    }
  }

  const failed24 = failures.failedRuns + failures.failedWrites;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
          <Bot className="h-5 w-5 text-primary" aria-hidden />
          AI activity
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          What Flight Crew changed in your records, and every AI call Agent Runway made for you, over the last {windowDays} days.
          Undo puts a record back the way it was before Flight Crew changed it.
        </p>
      </div>

      {loadFailed && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          Part of your AI activity didn&apos;t load. Refresh the page to try again.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="AI calls" value={summary.calls.toLocaleString("en-CA")} />
        <Tile label="Calls that failed" value={summary.failed.toLocaleString("en-CA")} tone={summary.failed > 0 ? "warn" : undefined} />
        <Tile label="Estimated cost" value={formatAiCost(summary.costUsd)} hint="At list prices" />
        <Tile
          label="Failed, last 24 hours"
          value={failures.unknown ? "?" : failed24.toLocaleString("en-CA")}
          hint={failures.unknown ? "Couldn't be counted" : `${plural(failures.failedRuns, "call")}, ${plural(failures.failedWrites, "change")}`}
          tone={failed24 > 0 ? "warn" : undefined}
        />
      </div>

      <section aria-labelledby="ai-changes">
        <h2 id="ai-changes" className="text-sm font-semibold mb-2">
          Changes Flight Crew made <span className="font-normal text-muted-foreground">· {actions.length}</span>
        </h2>
        {actions.length === 0 ? (
          <p className="rounded-xl border border-border/60 bg-card px-4 py-6 text-sm text-muted-foreground text-center">
            Flight Crew hasn&apos;t changed any of your records in the last {windowDays} days.
          </p>
        ) : (
          <ul className="divide-y divide-border/60 rounded-xl border border-border/60 bg-card">
            {actions.map((a) => {
              const expanded = open[a.toolCallId] ?? false;
              return (
                <li key={a.toolCallId} className="px-3 py-2.5">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 shrink-0" aria-hidden>
                      {a.undone ? (
                        <RotateCcw className="h-4 w-4 text-muted-foreground" />
                      ) : a.failed && !a.canUndo ? (
                        <TriangleAlert className="h-4 w-4 text-amber-600" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className={cn("text-sm font-medium", a.undone && "text-muted-foreground line-through")}>{a.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatAiActivityTime(a.createdAt)}
                        {SOURCE_LABEL[a.source] ? `, ${SOURCE_LABEL[a.source]}` : ""}
                        {" · "}
                        {a.status}
                      </p>
                      {a.details.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setOpen((o) => ({ ...o, [a.toolCallId]: !expanded }))}
                          className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                          aria-expanded={expanded}
                        >
                          {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                          {a.details.length === 1 ? "1 record" : `${a.details.length} records`}
                        </button>
                      )}
                      {expanded && (
                        <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                          {a.details.map((d, i) => (
                            <li key={i}>{d}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                    {a.canUndo && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="shrink-0"
                        disabled={undoing !== null}
                        onClick={() => {
                          setConfirming(a);
                          setConfirmOpen(true);
                        }}
                      >
                        {undoing === a.toolCallId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                        Undo
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {truncated && (
          <p className="mt-2 text-xs text-muted-foreground">Only the most recent changes and calls are listed.</p>
        )}
      </section>

      <section aria-labelledby="ai-calls">
        <h2 id="ai-calls" className="text-sm font-semibold mb-2">AI calls by feature</h2>
        {summary.byFeature.length === 0 ? (
          <p className="rounded-xl border border-border/60 bg-card px-4 py-6 text-sm text-muted-foreground text-center">
            No AI calls in the last {windowDays} days.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border/60 bg-card">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b border-border/60">
                  <th className="px-3 py-2 text-left font-medium">Feature</th>
                  <th className="px-3 py-2 text-right font-medium">Calls</th>
                  <th className="px-3 py-2 text-right font-medium">Failed</th>
                  <th className="px-3 py-2 text-right font-medium">Est. cost</th>
                </tr>
              </thead>
              <tbody>
                {summary.byFeature.map((f) => (
                  <tr key={f.feature} className="border-b border-border/40 last:border-0">
                    <td className="px-3 py-2">{featureLabel(f.feature)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{f.calls}</td>
                    <td className={cn("px-3 py-2 text-right tabular-nums", f.failed > 0 && "text-amber-700 dark:text-amber-300")}>{f.failed}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatAiCost(f.costUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {runs.length > 0 && (
        <section aria-labelledby="ai-recent-calls">
          <h2 id="ai-recent-calls" className="text-sm font-semibold mb-2">Recent AI calls</h2>
          <div className="overflow-x-auto rounded-xl border border-border/60 bg-card">
            <table className="w-full text-xs">
              <thead className="text-muted-foreground">
                <tr className="border-b border-border/60">
                  <th className="px-3 py-2 text-left font-medium">Time</th>
                  <th className="px-3 py-2 text-left font-medium">Feature</th>
                  <th className="px-3 py-2 text-left font-medium">Outcome</th>
                  <th className="px-3 py-2 text-right font-medium">Seconds</th>
                  <th className="px-3 py-2 text-right font-medium">Est. cost</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id} className="border-b border-border/40 last:border-0">
                    <td className="px-3 py-1.5 whitespace-nowrap">{formatAiActivityTime(r.created_at)}</td>
                    <td className="px-3 py-1.5">{featureLabel(r.feature)}</td>
                    <td className={cn("px-3 py-1.5", r.outcome === "error" && "text-amber-700 dark:text-amber-300")}>
                      {r.outcome === "ok" ? "OK" : r.outcome === "aborted" ? "Stopped" : `Failed${r.error_class ? ` (${r.error_class})` : ""}`}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{r.latency_ms !== null ? (r.latency_ms / 1000).toFixed(1) : ""}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{formatAiCost(Number(r.estimated_cost_usd ?? 0))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Undo this change?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">{confirming?.label}</p>
                {confirming && confirming.consequences.length > 0 && (
                  <ul className="list-disc pl-5 space-y-0.5">
                    {confirming.consequences.map((c, i) => (
                      <li key={i}>{c}.</li>
                    ))}
                  </ul>
                )}
                {confirming?.deletesClient ? (
                  <p className="text-destructive">
                    This deletes the client and can&apos;t be undone. Their profile, notes and activity history go with them.
                  </p>
                ) : (
                  <p>Everything in the list is put back together, or nothing is if a record changed since.</p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmOpen(false);
                if (confirming) void undo(confirming);
              }}
              className={confirming?.deletesClient ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined}
            >
              {confirming?.deletesClient ? "Delete client" : "Undo"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <p className="text-xs text-muted-foreground">
        The ledger keeps how each AI call went (feature, size, time, cost), never what was asked or written.
        Ask Flight Crew &ldquo;what did you change today?&rdquo; for the same list in chat. <Link href="/settings" className="underline">Back to Settings</Link>
      </p>
    </div>
  );
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function Tile({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "warn" }) {
  return (
    <div className={cn("rounded-xl border bg-card px-3 py-2.5", tone === "warn" ? "border-amber-300 dark:border-amber-700" : "border-border/60")}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("text-lg font-semibold tabular-nums", tone === "warn" && "text-amber-700 dark:text-amber-300")}>{value}</p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
