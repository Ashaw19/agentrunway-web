"use client";

/**
 * Flight Control — AI-powered outreach inbox.
 *
 * Surfaces AI-drafted, personalised outreach messages for the agent to
 * review and send with one click. No templates, no campaign builder.
 */

import { useState, useCallback, useRef }   from "react";
import { Button }                          from "@/components/ui/button";
import { Badge }                           from "@/components/ui/badge";
import { Input }                           from "@/components/ui/input";
import { Textarea }                        from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { createClient }                    from "@/lib/supabase/client";
import { toast }                           from "sonner";
import { cn }                              from "@/lib/utils";
import {
  Sparkles, Calendar, Clock, Gift, Mail, Copy,
  ChevronRight, ChevronDown, Loader2, CheckCircle2, Pen,
} from "lucide-react";
import type { OutreachQueueItem, OutreachOpportunityType } from "@/lib/types/database";

// ── Extended type with joined client fields ────────────────────────────────────

type QueueItemWithClient = OutreachQueueItem & {
  clients: {
    name:             string;
    city:             string | null;
    province_region:  string | null;
    email:            string | null;
  } | null;
};

// ── Opportunity display config ────────────────────────────────────────────────

const OPTYPE_CONFIG: Record<
  OutreachOpportunityType,
  { label: string; icon: React.ElementType; ringCls: string; bgCls: string; textCls: string }
> = {
  closing_anniversary: {
    label:   "Closing Anniversary",
    icon:    Calendar,
    ringCls: "ring-violet-500/40",
    bgCls:   "bg-violet-500/10",
    textCls: "text-violet-400",
  },
  idle_client: {
    label:   "Overdue Check-In",
    icon:    Clock,
    ringCls: "ring-amber-500/40",
    bgCls:   "bg-amber-500/10",
    textCls: "text-amber-400",
  },
  birthday: {
    label:   "Birthday",
    icon:    Gift,
    ringCls: "ring-rose-500/40",
    bgCls:   "bg-rose-500/10",
    textCls: "text-rose-400",
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysUntilLabel(triggerDate: string): string {
  const target = new Date(triggerDate + "T12:00:00");
  const today  = new Date();
  today.setHours(12, 0, 0, 0);
  const days = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (days < 0)  return "Overdue";
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `In ${days} days`;
}

function contextLabel(item: QueueItemWithClient): string {
  const ctx = item.context as Record<string, string | number>;
  switch (item.opportunity_type) {
    case "closing_anniversary": {
      const years = Number(ctx.anniversary_year ?? 1);
      const addr  = (ctx.address as string) ?? item.clients?.city ?? "";
      return `${years}-year anniversary${addr ? ` · ${addr}` : ""}`;
    }
    case "idle_client":
      return `Last deal: ${ctx.last_deal ? String(ctx.last_deal).slice(0, 4) : "—"} · ${ctx.months_idle ?? "18+ months"} ago`;
    case "birthday":
      return "Upcoming birthday";
    default:
      return "";
  }
}

// ── Message card ──────────────────────────────────────────────────────────────

function MessageCard({
  item,
  onReview,
  onSkip,
}: {
  item:     QueueItemWithClient;
  onReview: (item: QueueItemWithClient) => void;
  onSkip:   (id: string) => void;
}) {
  const cfg    = OPTYPE_CONFIG[item.opportunity_type];
  const Icon   = cfg.icon;
  const isDraft = item.status === "draft";
  const subject = item.final_subject ?? item.ai_subject;
  const body    = item.final_body    ?? item.ai_body;

  return (
    <div className={cn(
      "rounded-xl border bg-card/60 backdrop-blur-sm p-4 flex flex-col gap-3",
      "ring-1", cfg.ringCls,
      "hover:bg-card/80 transition-colors",
    )}>
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-1",
            cfg.bgCls, cfg.ringCls,
          )}>
            <Icon className={cn("h-4 w-4", cfg.textCls)} />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={cn("text-[11px] font-semibold uppercase tracking-wide", cfg.textCls)}>
                {cfg.label}
              </span>
              {isDraft && (
                <Badge variant="outline" className="text-[10px] py-0 h-4 border-muted-foreground/30">
                  <Loader2 className="h-2.5 w-2.5 mr-1 animate-spin" />
                  Drafting…
                </Badge>
              )}
            </div>
            <p className="text-[12px] text-muted-foreground leading-tight mt-0.5">
              {contextLabel(item)}
            </p>
          </div>
        </div>
        <span className={cn(
          "shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-full",
          cfg.bgCls, cfg.textCls,
        )}>
          {daysUntilLabel(item.trigger_date)}
        </span>
      </div>

      {/* Client name */}
      <p className="font-semibold text-sm text-foreground leading-tight">
        {item.clients?.name ?? "Unknown client"}
      </p>

      {/* Message preview */}
      {!isDraft && subject && body ? (
        <div className="rounded-lg border border-border/50 bg-background/40 p-3 space-y-1">
          <p className="text-[12px] font-semibold text-foreground/90 truncate">
            {subject}
          </p>
          <p className="text-[12px] text-muted-foreground line-clamp-2 leading-snug">
            {body.slice(0, 160)}…
          </p>
        </div>
      ) : isDraft ? (
        <div className="rounded-lg border border-border/50 bg-muted/30 p-3 space-y-1.5 animate-pulse">
          <div className="h-3 w-3/4 rounded bg-muted-foreground/20" />
          <div className="h-3 w-full rounded bg-muted-foreground/15" />
          <div className="h-3 w-5/6 rounded bg-muted-foreground/10" />
        </div>
      ) : null}

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 pt-0.5">
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-foreground h-7 text-xs"
          onClick={() => onSkip(item.id)}
        >
          Skip
        </Button>
        <Button
          size="sm"
          variant="outline"
          className={cn("h-7 text-xs gap-1.5", isDraft && "opacity-50 cursor-not-allowed")}
          disabled={isDraft}
          onClick={() => !isDraft && onReview(item)}
        >
          Review & Send
          <ChevronRight className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

// ── Review drawer ─────────────────────────────────────────────────────────────

function ReviewDrawer({
  item,
  onClose,
  onSent,
}: {
  item:   QueueItemWithClient | null;
  onClose: () => void;
  onSent:  (id: string) => void;
}) {
  const [editSubject, setEditSubject] = useState(item?.final_subject ?? item?.ai_subject ?? "");
  const [editBody,    setEditBody]    = useState(item?.final_body    ?? item?.ai_body    ?? "");
  const [saving,      setSaving]      = useState(false);
  const [copied,      setCopied]      = useState(false);

  // Reset local state when item changes
  const prevId = item?.id;
  if (item?.id !== prevId) {
    setEditSubject(item?.final_subject ?? item?.ai_subject ?? "");
    setEditBody(item?.final_body    ?? item?.ai_body    ?? "");
  }

  const saveEdits = useCallback(async () => {
    if (!item) return;
    setSaving(true);
    try {
      await fetch(`/api/ai/outreach-queue/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ final_subject: editSubject, final_body: editBody }),
      });
    } catch {
      // Non-critical — user can still copy the text
    } finally {
      setSaving(false);
    }
  }, [item, editSubject, editBody]);

  const handleCopy = useCallback(async () => {
    if (!item) return;
    await saveEdits();
    const text = `Subject: ${editSubject}\n\n${editBody}`;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("Copied to clipboard — paste into your email client");
    setTimeout(() => setCopied(false), 2500);
    // Ask "mark as sent?"
    markAsSent();
  }, [item, editSubject, editBody, saveEdits]);

  const handleOpenGmail = useCallback(async () => {
    if (!item) return;
    await saveEdits();
    const to      = item.clients?.email ?? "";
    const subject = encodeURIComponent(editSubject);
    // mailto: body truncates at ~2000 chars — acceptable
    const body    = encodeURIComponent(editBody.slice(0, 1800));
    const url     = `mailto:${to}?subject=${subject}&body=${body}`;
    window.open(url, "_blank");
    markAsSent();
  }, [item, editSubject, editBody, saveEdits]);

  const markAsSent = useCallback(async () => {
    if (!item) return;
    try {
      await fetch(`/api/ai/outreach-queue/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status:  "sent",
          sent_at: new Date().toISOString(),
        }),
      });
      onSent(item.id);
      onClose();
      toast.success("Marked as sent ✓");
    } catch {
      toast.error("Couldn't mark as sent — try again");
    }
  }, [item, onSent, onClose]);

  if (!item) return null;

  const cfg = OPTYPE_CONFIG[item.opportunity_type];

  return (
    <Sheet open={!!item} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-lg flex flex-col gap-0 p-0 overflow-hidden">
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-border/40 shrink-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={cn(
              "flex h-6 w-6 items-center justify-center rounded-full ring-1 text-xs",
              cfg.bgCls, cfg.ringCls,
            )}>
              <cfg.icon className={cn("h-3.5 w-3.5", cfg.textCls)} />
            </span>
            <span className={cn("text-[11px] font-semibold uppercase tracking-wide", cfg.textCls)}>
              {cfg.label}
            </span>
          </div>
          <SheetTitle className="text-base">
            {item.clients?.name ?? "Client"} — {contextLabel(item)}
          </SheetTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            Review and personalise before sending. Edits are saved automatically.
          </p>
        </SheetHeader>

        {/* Editable message */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Subject
            </label>
            <Input
              value={editSubject}
              onChange={(e) => setEditSubject(e.target.value)}
              className="text-sm"
              placeholder="Subject line…"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Message
            </label>
            <Textarea
              value={editBody}
              onChange={(e) => setEditBody(e.target.value)}
              rows={12}
              className="text-sm font-mono leading-relaxed resize-none"
              placeholder="Message body…"
            />
          </div>
        </div>

        {/* Send actions */}
        <div className="px-6 pb-6 pt-4 border-t border-border/40 shrink-0 space-y-3">
          <p className="text-[11px] text-muted-foreground">
            Gmail OAuth coming in the next update — send directly from Agent Runway.
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1 gap-2"
              onClick={handleCopy}
              disabled={saving}
            >
              {copied ? (
                <><CheckCircle2 className="h-4 w-4 text-emerald-400" /> Copied!</>
              ) : (
                <><Copy className="h-4 w-4" /> Copy to Clipboard</>
              )}
            </Button>
            <Button
              className="flex-1 gap-2"
              onClick={handleOpenGmail}
              disabled={saving}
            >
              <Mail className="h-4 w-4" />
              Open in Gmail
            </Button>
          </div>
          <Button
            variant="ghost"
            className="w-full text-muted-foreground text-xs"
            onClick={markAsSent}
            disabled={saving}
          >
            Mark as sent without opening
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface FlightControlContentProps {
  initialQueue:     QueueItemWithClient[];
  sentThisMonth:    number;
  initialSignature: string;
}

export function FlightControlContent({
  initialQueue,
  sentThisMonth: initialSentThisMonth,
  initialSignature,
}: FlightControlContentProps) {
  const [queue,         setQueue]         = useState<QueueItemWithClient[]>(initialQueue);
  const [reviewItem,    setReviewItem]    = useState<QueueItemWithClient | null>(null);
  const [scanning,      setScanning]      = useState(false);
  const [sentThisMonth, setSentThisMonth] = useState(initialSentThisMonth);

  // ── Email signature ─────────────────────────────────────────────────────────
  const [signature,     setSignature]     = useState(initialSignature);
  const [sigOpen,       setSigOpen]       = useState(false);
  const [sigSaving,     setSigSaving]     = useState(false);
  const sigDebounce     = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveSignature = useCallback((value: string) => {
    setSignature(value);
    if (sigDebounce.current) clearTimeout(sigDebounce.current);
    sigDebounce.current = setTimeout(async () => {
      setSigSaving(true);
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await supabase
            .from("user_settings")
            .update({ email_signature: value })
            .eq("user_id", user.id);
        }
      } catch {
        // silent — non-critical
      } finally {
        setSigSaving(false);
      }
    }, 800);
  }, []);

  // ── Skip ──────────────────────────────────────────────────────────────────

  const handleSkip = useCallback(async (id: string) => {
    // Optimistic removal
    setQueue((prev) => prev.filter((i) => i.id !== id));
    try {
      await fetch(`/api/ai/outreach-queue/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "skipped" }),
      });
    } catch {
      toast.error("Couldn't skip — try again");
    }
  }, []);

  // ── Mark as sent ──────────────────────────────────────────────────────────

  const handleSent = useCallback((id: string) => {
    setQueue((prev) => prev.filter((i) => i.id !== id));
    setSentThisMonth((n) => n + 1);
  }, []);

  // ── Scan Now ──────────────────────────────────────────────────────────────

  const handleScan = useCallback(async () => {
    setScanning(true);
    try {
      const res  = await fetch("/api/ai/detect-opportunities", { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error ?? "Scan failed");
        return;
      }

      const newQueue = (data.queue ?? []) as QueueItemWithClient[];
      setQueue(newQueue);

      if (data.detected === 0) {
        toast.success("All caught up — no new opportunities found");
      } else {
        toast.success(`Found ${data.detected} new opportunit${data.detected === 1 ? "y" : "ies"} · ${data.drafted} drafted`);
      }
    } catch {
      toast.error("Scan failed — check your connection");
    } finally {
      setScanning(false);
    }
  }, []);

  // ── Stats ─────────────────────────────────────────────────────────────────

  const readyCount = queue.filter((i) => i.status === "ready").length;
  const draftCount = queue.filter((i) => i.status === "draft").length;

  return (
    <>
      <div className="flex flex-col h-full">
        {/* Page header */}
        <div className="px-6 pt-6 pb-4 border-b border-border/40 space-y-3 shrink-0">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-500/10 ring-1 ring-violet-500/30">
                <Sparkles className="h-4.5 w-4.5 text-violet-400" />
              </span>
              <div>
                <h1 className="text-xl font-bold tracking-tight text-foreground">
                  Flight Control
                </h1>
                <p className="text-xs text-muted-foreground">
                  Your intelligent outreach assistant
                </p>
              </div>
            </div>
            <Button
              onClick={handleScan}
              disabled={scanning}
              size="sm"
              className="gap-2 shrink-0"
            >
              {scanning ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Scanning…</>
              ) : (
                <><Sparkles className="h-3.5 w-3.5" /> Scan for Opportunities</>
              )}
            </Button>
          </div>

          {/* Stats strip */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
            {readyCount > 0 && (
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-violet-400 animate-pulse" />
                <span className="font-medium text-foreground">{readyCount}</span> ready to send
              </span>
            )}
            {draftCount > 0 && (
              <span className="flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin" />
                {draftCount} drafting…
              </span>
            )}
            {sentThisMonth > 0 && (
              <span>
                <span className="font-medium text-foreground">{sentThisMonth}</span> sent this month
              </span>
            )}
            {/* Phase B placeholder */}
            <span className="ml-auto flex items-center gap-1 text-muted-foreground/60 cursor-not-allowed" title="Coming soon">
              <Mail className="h-3 w-3" />
              Connect Gmail — coming soon
            </span>
          </div>

          {/* Email signature editor (collapsible) */}
          <div className="mt-2">
            <button
              onClick={() => setSigOpen(!sigOpen)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <Pen className="h-3 w-3" />
              <span>Email Signature</span>
              {signature && !sigOpen && (
                <span className="text-foreground/50 truncate max-w-[200px]">
                  — {signature.split("\n")[0]}
                </span>
              )}
              <ChevronDown className={cn("h-3 w-3 transition-transform", sigOpen && "rotate-180")} />
            </button>
            {sigOpen && (
              <div className="mt-2 space-y-1.5">
                <Textarea
                  value={signature}
                  onChange={(e) => saveSignature(e.target.value)}
                  rows={4}
                  className="text-xs font-mono resize-none"
                  placeholder={"Best regards,\nYour Name\nBrokerage Name\n(555) 123-4567"}
                />
                <p className="text-[10px] text-muted-foreground">
                  {sigSaving ? "Saving…" : "Appended to every AI-drafted message. Saves automatically."}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Queue list */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {queue.length === 0 ? (
            <EmptyState onScan={handleScan} scanning={scanning} />
          ) : (
            <div className="space-y-3 max-w-2xl">
              {/* Ready items first */}
              {queue
                .filter((i) => i.status === "ready")
                .map((item) => (
                  <MessageCard
                    key={item.id}
                    item={item}
                    onReview={setReviewItem}
                    onSkip={handleSkip}
                  />
                ))}
              {/* Draft / still generating */}
              {queue
                .filter((i) => i.status === "draft")
                .map((item) => (
                  <MessageCard
                    key={item.id}
                    item={item}
                    onReview={setReviewItem}
                    onSkip={handleSkip}
                  />
                ))}
            </div>
          )}
        </div>
      </div>

      {/* Review drawer */}
      <ReviewDrawer
        item={reviewItem}
        onClose={() => setReviewItem(null)}
        onSent={handleSent}
      />
    </>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({
  onScan,
  scanning,
}: {
  onScan:  () => void;
  scanning: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center max-w-sm mx-auto gap-4">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 ring-1 ring-emerald-500/30">
        <CheckCircle2 className="h-7 w-7 text-emerald-400" />
      </span>
      <div className="space-y-1">
        <h2 className="text-base font-semibold text-foreground">
          Your client relationships are all caught up
        </h2>
        <p className="text-sm text-muted-foreground">
          Flight Control checks for closing anniversaries, birthdays, and
          clients who haven't heard from you in a while.
        </p>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={onScan}
        disabled={scanning}
        className="gap-2"
      >
        {scanning ? (
          <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Scanning…</>
        ) : (
          <><Sparkles className="h-3.5 w-3.5" /> Scan Now</>
        )}
      </Button>
      <p className="text-[11px] text-muted-foreground/60">
        Scans run automatically every morning — or tap Scan Now anytime.
      </p>
    </div>
  );
}
