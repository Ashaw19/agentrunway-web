"use client";

/**
 * ClientConversationPanel
 *
 * Phase 2.4 of the HML gap-closure plan: a per-client communication
 * timeline panel ("Message History") for the CRM client detail.
 *
 * Email integration is CASA-shelved (see
 * memory/project_google_integrations.md). We cannot read inbound replies
 * automatically. Instead we assemble a timeline from data AR already owns,
 * plus a manual "Log reply" flow:
 *
 *   1. workflow_drafts          — outbound drafts from Phase 2.3 Flight
 *                                 Plan Templates (status pending/sent/
 *                                 dismissed).
 *   2. outreach_queue           — drafts produced by the Flight Control
 *                                 briefing flow (`/api/ai/draft-outreach`)
 *                                 and the Dispatcher tool. status draft/
 *                                 ready/sent/skipped.
 *   3. client_communication_log — agent-pasted inbound replies and manual
 *                                 notes (this panel's "Log reply" form).
 *
 * Rendered reverse-chronologically, with direction arrows and status
 * badges. Item bodies are truncated to ~2 lines and expand on click. No
 * email integration. No auto-send. CASL-clean (note-taking, not
 * automated commercial messages).
 *
 * Visual language matches workflow-suggestions-panel.tsx (Phase 2.3) — same
 * slate background variant used by the Notes panel below it on the client
 * detail surface, since this is a historical-record view rather than an
 * action panel.
 */

import { useEffect, useMemo, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  MessageSquare,
  ArrowUpRight,
  ArrowDownLeft,
  StickyNote,
  Plus,
  X,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { toast } from "sonner";
import type {
  ClientCommunicationLog,
  CommunicationDirection,
  WorkflowDraft,
  OutreachQueueItem,
} from "@agent-runway/core/types/database";

interface Props {
  clientId: string;
  clientName: string;
}

/**
 * A single normalized timeline entry. We collapse the three sources into
 * one shape for rendering. `source` is kept so the UI can show provenance
 * (e.g. "Flight Plan Template" vs "Flight Control briefing" vs "Logged").
 */
interface TimelineEntry {
  id: string;                            // unique per source row, prefixed
  source: "workflow_draft" | "outreach_queue" | "log";
  direction: CommunicationDirection;
  subject: string | null;
  body: string;
  occurredAt: string;                    // ISO timestamp
  /** Free-form sub-label (status badge) — e.g. "draft", "sent", "Flight Plan Template". */
  badge: string | null;
  /** Tone hint for the badge color. */
  badgeTone: "neutral" | "active" | "muted";
}

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const now = new Date();
    const sameYear = d.getFullYear() === now.getFullYear();
    const dateStr = d.toLocaleDateString("en-CA", {
      month: "short",
      day: "numeric",
      ...(sameYear ? {} : { year: "numeric" }),
    });
    const timeStr = d.toLocaleTimeString("en-CA", {
      hour: "numeric",
      minute: "2-digit",
    });
    return `${dateStr} · ${timeStr}`;
  } catch {
    return iso;
  }
}

function previewLines(text: string, lineCount: number = 2): string {
  if (!text) return "";
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  return lines.slice(0, lineCount).join(" ");
}

function directionIcon(direction: CommunicationDirection) {
  switch (direction) {
    case "outbound":
      return <ArrowUpRight className="h-3 w-3" />;
    case "inbound":
      return <ArrowDownLeft className="h-3 w-3" />;
    case "note":
      return <StickyNote className="h-3 w-3" />;
  }
}

function directionLabel(direction: CommunicationDirection): string {
  switch (direction) {
    case "outbound":
      return "Sent";
    case "inbound":
      return "Received";
    case "note":
      return "Note";
  }
}

/** Map the workflow_drafts.status enum to a timeline-entry badge. */
function workflowDraftBadge(status: WorkflowDraft["status"]): {
  label: string;
  tone: TimelineEntry["badgeTone"];
} {
  switch (status) {
    case "sent":
      return { label: "Sent", tone: "active" };
    case "dismissed":
      return { label: "Dismissed", tone: "muted" };
    case "pending":
    default:
      return { label: "Draft pending", tone: "neutral" };
  }
}

/** Map the outreach_queue.status enum to a timeline-entry badge. */
function outreachStatusBadge(status: OutreachQueueItem["status"]): {
  label: string;
  tone: TimelineEntry["badgeTone"];
} {
  switch (status) {
    case "sent":
      return { label: "Sent", tone: "active" };
    case "skipped":
      return { label: "Skipped", tone: "muted" };
    case "ready":
      return { label: "Ready to send", tone: "neutral" };
    case "draft":
    default:
      return { label: "Draft", tone: "neutral" };
  }
}

export function ClientConversationPanel({ clientId, clientName }: Props) {
  const supabase = useMemo(() => createClient(), []);

  const [entries, setEntries] = useState<TimelineEntry[] | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Compose form state
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerDirection, setComposerDirection] = useState<CommunicationDirection>("inbound");
  const [composerSubject, setComposerSubject] = useState("");
  const [composerBody, setComposerBody] = useState("");
  const [composerSaving, setComposerSaving] = useState(false);

  const loadTimeline = useCallback(async () => {
    // Fan out to the three sources in parallel. RLS scopes everything to
    // the authenticated user; we additionally filter by client_id.
    const [draftsRes, outreachRes, logRes] = await Promise.all([
      supabase
        .from("workflow_drafts")
        .select("id, subject, body, status, generated_at")
        .eq("client_id", clientId)
        .order("generated_at", { ascending: false })
        .limit(50),
      supabase
        .from("outreach_queue")
        .select("id, opportunity_type, ai_subject, ai_body, final_subject, final_body, status, created_at, sent_at")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("client_communication_log")
        .select("*")
        .eq("client_id", clientId)
        .order("logged_at", { ascending: false })
        .limit(100),
    ]);

    const next: TimelineEntry[] = [];

    if (draftsRes.error) {
      console.error("[ClientConversationPanel] drafts load error:", draftsRes.error);
    } else if (draftsRes.data) {
      for (const row of draftsRes.data as Array<
        Pick<WorkflowDraft, "id" | "subject" | "body" | "status" | "generated_at">
      >) {
        const badge = workflowDraftBadge(row.status);
        next.push({
          id: `wd:${row.id}`,
          source: "workflow_draft",
          direction: "outbound",
          subject: row.subject,
          body: row.body,
          occurredAt: row.generated_at,
          badge: `Flight Plan Template · ${badge.label}`,
          badgeTone: badge.tone,
        });
      }
    }

    if (outreachRes.error) {
      console.error("[ClientConversationPanel] outreach load error:", outreachRes.error);
    } else if (outreachRes.data) {
      for (const row of outreachRes.data as Array<
        Pick<
          OutreachQueueItem,
          "id" | "opportunity_type" | "ai_subject" | "ai_body" | "final_subject" | "final_body" | "status" | "created_at" | "sent_at"
        >
      >) {
        const subject = row.final_subject ?? row.ai_subject;
        const body = row.final_body ?? row.ai_body ?? "";
        // Skip rows with no body content at all — these are placeholder
        // queue items that haven't been drafted yet.
        if (!body.trim()) continue;
        const badge = outreachStatusBadge(row.status);
        const occurredAt = row.sent_at ?? row.created_at;
        next.push({
          id: `oq:${row.id}`,
          source: "outreach_queue",
          direction: "outbound",
          subject,
          body,
          occurredAt,
          badge: `Briefing · ${badge.label}`,
          badgeTone: badge.tone,
        });
      }
    }

    if (logRes.error) {
      console.error("[ClientConversationPanel] log load error:", logRes.error);
    } else if (logRes.data) {
      for (const row of logRes.data as ClientCommunicationLog[]) {
        next.push({
          id: `cl:${row.id}`,
          source: "log",
          direction: row.direction,
          subject: row.subject,
          body: row.body,
          occurredAt: row.logged_at,
          badge: row.direction === "note" ? "Logged note" : "Logged",
          badgeTone: "neutral",
        });
      }
    }

    next.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
    setEntries(next);
  }, [supabase, clientId]);

  useEffect(() => {
    let cancelled = false;
    setEntries(null);
    setExpandedIds(new Set());
    (async () => {
      await loadTimeline();
      if (cancelled) {
        // Stale load — nothing to undo, the state setter is harmless if
        // unmounted, but the next effect run will overwrite anyway.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadTimeline]);

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const resetComposer = () => {
    setComposerOpen(false);
    setComposerDirection("inbound");
    setComposerSubject("");
    setComposerBody("");
    setComposerSaving(false);
  };

  const handleSaveLog = async () => {
    const trimmedBody = composerBody.trim();
    if (!trimmedBody) {
      toast.error("Add the message text before saving");
      return;
    }
    setComposerSaving(true);
    try {
      const res = await fetch("/api/crm/communication-log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: clientId,
          direction: composerDirection,
          subject: composerSubject.trim() || undefined,
          body: trimmedBody,
        }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        toast.error(payload.error || "Couldn't save the entry");
        setComposerSaving(false);
        return;
      }
      toast.success(
        composerDirection === "note"
          ? `Note logged for ${clientName}`
          : `Reply logged for ${clientName}`,
      );
      resetComposer();
      await loadTimeline();
    } catch (err) {
      console.error("[ClientConversationPanel] save error:", err);
      toast.error("Couldn't save the entry");
      setComposerSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200/60 bg-slate-50/40 dark:bg-slate-900/20 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 flex items-center gap-2">
          <div className="h-5 w-5 rounded-md bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
            <MessageSquare className="h-3 w-3 text-slate-500 dark:text-slate-400" />
          </div>
          Message History
        </h3>
        <span className="ml-auto text-[10px] font-normal text-muted-foreground normal-case tracking-normal">
          {entries === null
            ? "loading…"
            : `${entries.length} ${entries.length === 1 ? "entry" : "entries"}`}
        </span>
        {!composerOpen && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[11px] gap-1.5"
            onClick={() => setComposerOpen(true)}
          >
            <Plus className="h-3 w-3" />
            Log reply
          </Button>
        )}
      </div>

      {composerOpen && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-card p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-semibold">Log a message</div>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0"
              onClick={resetComposer}
              aria-label="Cancel"
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
          <div className="space-y-2">
            <div>
              <label
                htmlFor="comm-log-direction"
                className="text-[10px] text-muted-foreground uppercase tracking-wider"
              >
                Type
              </label>
              <Select
                value={composerDirection}
                onValueChange={(v) => setComposerDirection(v as CommunicationDirection)}
              >
                <SelectTrigger id="comm-log-direction" className="h-8 text-xs mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="inbound">Inbound reply</SelectItem>
                  <SelectItem value="outbound">Outbound message I sent</SelectItem>
                  <SelectItem value="note">Manual note (call / in person / text)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {composerDirection !== "note" && (
              <div>
                <label
                  htmlFor="comm-log-subject"
                  className="text-[10px] text-muted-foreground uppercase tracking-wider"
                >
                  Subject (optional)
                </label>
                <Input
                  id="comm-log-subject"
                  value={composerSubject}
                  onChange={(e) => setComposerSubject(e.target.value)}
                  placeholder="Subject line, if any"
                  className="h-8 text-xs mt-1"
                  maxLength={500}
                />
              </div>
            )}

            <div>
              <label
                htmlFor="comm-log-body"
                className="text-[10px] text-muted-foreground uppercase tracking-wider"
              >
                {composerDirection === "note" ? "Note" : "Message body"}
              </label>
              <Textarea
                id="comm-log-body"
                value={composerBody}
                onChange={(e) => setComposerBody(e.target.value)}
                placeholder={
                  composerDirection === "inbound"
                    ? "Paste the reply you received…"
                    : composerDirection === "outbound"
                    ? "Paste the message you sent…"
                    : "What did you talk about? Key points to remember."
                }
                rows={5}
                className="text-xs resize-none bg-white/60 dark:bg-slate-900/40 mt-1"
              />
            </div>

            <div className="flex items-center justify-end gap-1.5 pt-1">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-[11px]"
                onClick={resetComposer}
                disabled={composerSaving}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                variant="default"
                className="h-7 text-[11px] gap-1.5"
                onClick={handleSaveLog}
                disabled={composerSaving || !composerBody.trim()}
              >
                {composerSaving ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Plus className="h-3 w-3" />
                )}
                Save
              </Button>
            </div>
          </div>
        </div>
      )}

      {entries === null ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Loading message history…
        </div>
      ) : entries.length === 0 ? (
        <div className="text-xs text-muted-foreground italic">
          No messages logged yet. Drafts you generate from Flight Plan Templates
          will show up here, plus any replies you log manually.
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => {
            const expanded = expandedIds.has(entry.id);
            const preview = previewLines(entry.body, 2);
            const hasMore = entry.body.length > preview.length;
            return (
              <div
                key={entry.id}
                className="rounded-xl border border-slate-100 dark:border-slate-800/60 bg-card p-3 space-y-1.5"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <div
                    className={
                      "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium " +
                      (entry.direction === "outbound"
                        ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
                        : entry.direction === "inbound"
                        ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                        : "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300")
                    }
                  >
                    {directionIcon(entry.direction)}
                    {directionLabel(entry.direction)}
                  </div>
                  {entry.badge && (
                    <span
                      className={
                        "text-[10px] " +
                        (entry.badgeTone === "active"
                          ? "text-emerald-700 dark:text-emerald-300"
                          : entry.badgeTone === "muted"
                          ? "text-muted-foreground line-through"
                          : "text-muted-foreground")
                      }
                    >
                      {entry.badge}
                    </span>
                  )}
                  <span className="ml-auto text-[10px] text-muted-foreground">
                    {formatTimestamp(entry.occurredAt)}
                  </span>
                </div>

                {entry.subject && (
                  <div className="text-xs font-medium break-words">
                    {entry.subject}
                  </div>
                )}

                <div
                  className={
                    "text-xs text-foreground/80 break-words " +
                    (expanded ? "whitespace-pre-wrap" : "line-clamp-2")
                  }
                >
                  {expanded ? entry.body : preview}
                </div>

                {hasMore && (
                  <button
                    type="button"
                    onClick={() => toggleExpanded(entry.id)}
                    className="text-[10px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                  >
                    {expanded ? (
                      <>
                        <ChevronUp className="h-3 w-3" />
                        Collapse
                      </>
                    ) : (
                      <>
                        <ChevronDown className="h-3 w-3" />
                        Expand
                      </>
                    )}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
