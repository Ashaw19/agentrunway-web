"use client";

/**
 * Newsletter Section — shown on the "Newsletters" tab of Flight Control.
 *
 * Lets the agent:
 *   1. Draft a new newsletter (BoC Rate Change / Market Update / Custom)
 *   2. Review + edit the AI-generated copy
 *   3. Copy to clipboard and mark as sent
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { Button }    from "@/components/ui/button";
import { Input }     from "@/components/ui/input";
import { Textarea }  from "@/components/ui/textarea";
import { Badge }     from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Label }     from "@/components/ui/label";
import { toast }     from "sonner";
import { cn }        from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import {
  Newspaper, Landmark, Pen, Plus,
  Loader2, Copy, CheckCircle2, Mail, ChevronRight,
  Send, Sparkles, Users,
} from "lucide-react";
import type { NewsletterQueue } from "@/lib/types/database";

// ── Template config ───────────────────────────────────────────────────────────

const TEMPLATE_CONFIG = {
  boc_rate_change: {
    label:   "BoC Rate Change",
    icon:    Landmark,
    ringCls: "ring-blue-500/40",
    bgCls:   "bg-blue-500/10",
    textCls: "text-blue-400",
    desc:    "Bank of Canada rate announcement",
  },
  custom: {
    label:   "Custom Topic",
    icon:    Pen,
    ringCls: "ring-violet-500/40",
    bgCls:   "bg-violet-500/10",
    textCls: "text-violet-400",
    desc:    "Any topic you want to write about",
  },
} as const;

type TemplateType = keyof typeof TEMPLATE_CONFIG;

// ── Draft Newsletter Drawer ───────────────────────────────────────────────────

function DraftNewsletterDrawer({
  open,
  onClose,
  onDrafted,
}: {
  open:      boolean;
  onClose:   () => void;
  onDrafted: (item: NewsletterQueue) => void;
}) {
  const [templateType, setTemplateType] = useState<TemplateType>("boc_rate_change");
  const [drafting,     setDrafting]     = useState(false);

  // boc_rate_change fields
  const [oldRate,       setOldRate]       = useState("");
  const [newRate,       setNewRate]       = useState("");
  const [effectiveDate, setEffectiveDate] = useState(
    new Date().toISOString().slice(0, 10),
  );

  // custom fields
  const [topic, setTopic] = useState("");

  // shared
  const [notes, setNotes] = useState("");

  // Reset form when drawer opens
  useEffect(() => {
    if (open) {
      setTemplateType("boc_rate_change");
      setOldRate("");
      setNewRate("");
      setEffectiveDate(new Date().toISOString().slice(0, 10));
      setTopic("");
      setNotes("");
      setDrafting(false);
    }
  }, [open]);

  const isValid = useCallback(() => {
    if (templateType === "boc_rate_change") {
      return oldRate.trim() !== "" && newRate.trim() !== "" &&
        !isNaN(Number(oldRate)) && !isNaN(Number(newRate));
    }
    if (templateType === "custom") {
      return topic.trim().length >= 3;
    }
    return true;
  }, [templateType, oldRate, newRate, topic]);

  const handleDraft = useCallback(async () => {
    if (!isValid() || drafting) return;
    setDrafting(true);

    try {
      const bodyPayload: Record<string, unknown> = { template_type: templateType };

      if (templateType === "boc_rate_change") {
        bodyPayload.old_rate       = Number(oldRate);
        bodyPayload.new_rate       = Number(newRate);
        bodyPayload.effective_date = new Date(effectiveDate + "T12:00:00")
          .toLocaleDateString("en-CA", { month: "long", day: "numeric", year: "numeric" });
      }

      if (templateType === "custom") {
        bodyPayload.topic = topic.trim();
      }

      if (notes.trim()) bodyPayload.notes = notes.trim();

      const res  = await fetch("/api/ai/draft-newsletter", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(bodyPayload),
      });

      const data = await res.json() as { newsletter_id?: string; status?: string; error?: string };

      if (!res.ok) {
        toast.error(data.error ?? "Draft failed — try again");
        return;
      }

      if (data.status === "queued") {
        toast.info("Queued for drafting", {
          description: "Groq is temporarily unavailable. Your newsletter will be ready shortly.",
        });
      } else {
        toast.success("Newsletter drafted", {
          description: `Your ${TEMPLATE_CONFIG[templateType].label} newsletter is ready to review.`,
        });
      }

      // Fetch the new newsletter item to add to the list
      if (data.newsletter_id) {
        const supabase = createClient();
        const { data: item } = await supabase
          .from("newsletter_queue")
          .select("*")
          .eq("id", data.newsletter_id)
          .single();
        if (item) onDrafted(item as NewsletterQueue);
      }

      onClose();
    } catch {
      toast.error("Network error — try again");
    } finally {
      setDrafting(false);
    }
  }, [templateType, oldRate, newRate, effectiveDate, topic, notes, isValid, drafting, onDrafted, onClose]);

  const _cfg = TEMPLATE_CONFIG[templateType];

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-md flex flex-col gap-0 p-0 overflow-hidden">
        {/* Header */}
        <SheetHeader className="relative px-6 pt-6 pb-4 shrink-0 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-violet-600/8 via-indigo-500/5 to-transparent pointer-events-none" />
          <div className="relative">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500/20 to-indigo-500/20 ring-1 ring-violet-500/30 shadow-sm">
                <Newspaper className="h-3.5 w-3.5 text-violet-400" />
              </span>
              <span className="text-[11px] font-bold uppercase tracking-wider text-violet-400">
                Draft Newsletter
              </span>
            </div>
            <SheetTitle className="text-base font-bold">
              New Client Newsletter
            </SheetTitle>
            <p className="text-xs text-muted-foreground mt-1">
              AI drafts a broadcast email for your entire client list.
            </p>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-border/60 to-transparent" />
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Template selector */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Newsletter Type
            </Label>
            <div className="grid grid-cols-1 gap-2">
              {(Object.keys(TEMPLATE_CONFIG) as TemplateType[]).map((key) => {
                const c      = TEMPLATE_CONFIG[key];
                const Icon   = c.icon;
                const active = templateType === key;
                return (
                  <button
                    key={key}
                    onClick={() => setTemplateType(key)}
                    className={cn(
                      "flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all",
                      active
                        ? cn("ring-2", c.ringCls, c.bgCls, "border-transparent")
                        : "border-border/50 hover:border-border hover:bg-muted/30",
                    )}
                  >
                    <span className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1",
                      c.bgCls, c.ringCls,
                    )}>
                      <Icon className={cn("h-4 w-4", c.textCls)} />
                    </span>
                    <div className="min-w-0">
                      <p className={cn("text-xs font-semibold", active ? c.textCls : "text-foreground")}>
                        {c.label}
                      </p>
                      <p className="text-[11px] text-muted-foreground">{c.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Context fields */}
          {templateType === "boc_rate_change" && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Previous Rate (%)</Label>
                  <Input
                    type="number"
                    step="0.25"
                    min="0"
                    max="25"
                    placeholder="e.g. 4.75"
                    value={oldRate}
                    onChange={(e) => setOldRate(e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">New Rate (%)</Label>
                  <Input
                    type="number"
                    step="0.25"
                    min="0"
                    max="25"
                    placeholder="e.g. 4.50"
                    value={newRate}
                    onChange={(e) => setNewRate(e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Effective Date</Label>
                <Input
                  type="date"
                  value={effectiveDate}
                  onChange={(e) => setEffectiveDate(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
            </div>
          )}

          {templateType === "custom" && (
            <div className="space-y-1.5">
              <Label className="text-xs">Newsletter Topic</Label>
              <Input
                placeholder="e.g. Preparing your home for spring"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                className="h-8 text-sm"
              />
              <p className="text-[11px] text-muted-foreground">
                Be specific — the more context you give, the better the draft.
              </p>
            </div>
          )}

          {/* Notes — shared across all types */}
          <div className="space-y-1.5">
            <Label className="text-xs">
              Additional Notes{" "}
              <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Textarea
              placeholder="Key points, angles, or specific insights you want included…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="text-sm resize-none"
            />
          </div>

          {/* Recipient note */}
          <div className="flex items-start gap-2 rounded-lg border border-border/40 bg-muted/20 px-3 py-2.5">
            <Users className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Newsletter will be addressed to your entire active client list.
              Copy the finished email into your preferred sending tool.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 pt-4 shrink-0 border-t border-border/30">
          <Button
            className="w-full gap-2 h-10 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white border-0 shadow-md shadow-violet-500/20"
            onClick={handleDraft}
            disabled={!isValid() || drafting}
          >
            {drafting ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Drafting with AI…</>
            ) : (
              <><Sparkles className="h-4 w-4" /> Draft with AI</>
            )}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── Newsletter Review Drawer ──────────────────────────────────────────────────

function NewsletterReviewDrawer({
  item,
  onClose,
  onSent,
  signature,
}: {
  item:      NewsletterQueue | null;
  onClose:   () => void;
  onSent:    (id: string) => void;
  signature: string;
}) {
  const [editSubject, setEditSubject] = useState("");
  const [editBody,    setEditBody]    = useState("");
  const [saving,      setSaving]      = useState(false);
  const [copied,      setCopied]      = useState(false);
  const prevIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (item && item.id !== prevIdRef.current) {
      prevIdRef.current = item.id;
      setEditSubject(item.final_subject ?? item.ai_subject ?? "");
      setEditBody(item.final_body ?? item.ai_body ?? "");
      setCopied(false);
    }
    if (!item) prevIdRef.current = null;
  }, [item]);

  const saveEdits = useCallback(async () => {
    if (!item) return;
    setSaving(true);
    try {
      await fetch(`/api/ai/newsletters/${item.id}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ final_subject: editSubject, final_body: editBody }),
      });
    } catch {
      // Non-critical
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
    toast.success("Copied to clipboard — paste into your email tool");
    setTimeout(() => setCopied(false), 2500);
    markAsSent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item, editSubject, editBody, saveEdits]);

  const markAsSent = useCallback(async () => {
    if (!item) return;
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("newsletter_queue")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", item.id);
      if (error) throw error;
      onSent(item.id);
      onClose();
      toast.success("Newsletter marked as sent ✓");
    } catch {
      toast.error("Couldn't mark as sent — try again");
    }
  }, [item, onSent, onClose]);

  if (!item) return null;

  const cfg  = TEMPLATE_CONFIG[item.template_type as TemplateType] ?? TEMPLATE_CONFIG.custom;
  const Icon = cfg.icon;
  const isDraft = item.status === "draft";

  return (
    <Sheet open={!!item} onOpenChange={(open: boolean) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-lg flex flex-col gap-0 p-0 overflow-hidden">
        {/* Header */}
        <SheetHeader className="relative px-6 pt-6 pb-4 shrink-0 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-violet-600/8 via-indigo-500/5 to-transparent pointer-events-none" />
          <div className="relative">
            <div className="flex items-center gap-2 mb-1.5">
              <span className={cn(
                "flex h-7 w-7 items-center justify-center rounded-lg ring-1 shadow-sm",
                cfg.bgCls, cfg.ringCls,
              )}>
                <Icon className={cn("h-3.5 w-3.5", cfg.textCls)} />
              </span>
              <span className={cn("text-[11px] font-bold uppercase tracking-wider", cfg.textCls)}>
                {cfg.label}
              </span>
            </div>
            <SheetTitle className="text-base font-bold">
              Review Newsletter
            </SheetTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Review and edit before copying to your email tool. Edits save automatically.
            </p>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-border/60 to-transparent" />
        </SheetHeader>

        {/* Editable content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {isDraft ? (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-4 space-y-3 animate-pulse">
              <p className="text-xs font-semibold text-amber-600 flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                AI is drafting your newsletter…
              </p>
              <div className="h-3 w-3/4 rounded-full bg-muted-foreground/15" />
              <div className="h-3 w-full rounded-full bg-muted-foreground/10" />
              <div className="h-3 w-5/6 rounded-full bg-muted-foreground/8" />
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Subject
                </label>
                <Input
                  value={editSubject}
                  onChange={(e) => setEditSubject(e.target.value)}
                  className="text-sm font-medium"
                  placeholder="Subject line…"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Message
                </label>
                <Textarea
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  rows={14}
                  className="text-sm leading-relaxed resize-none"
                  placeholder="Newsletter body…"
                />
              </div>
            </>
          )}

          {/* Recipients + signature */}
          <div className="rounded-lg border border-border/40 bg-muted/20 px-3 py-2.5 space-y-1.5">
            <div className="flex items-center gap-2">
              <Users className="h-3.5 w-3.5 text-muted-foreground" />
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                Recipients
              </p>
            </div>
            <p className="text-[11px] text-muted-foreground">
              All active clients — paste into your email tool&apos;s recipient field or BCC list.
            </p>
            {signature && (
              <p className="text-[11px] text-muted-foreground/70 whitespace-pre-line line-clamp-2 mt-1 border-t border-border/30 pt-1.5">
                {signature}
              </p>
            )}
          </div>
        </div>

        {/* Send actions */}
        <div className="px-6 pb-6 pt-4 shrink-0 space-y-3 border-t border-border/30">
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1 gap-2 h-10"
              onClick={handleCopy}
              disabled={saving || isDraft}
            >
              {copied ? (
                <><CheckCircle2 className="h-4 w-4 text-emerald-400" /> Copied!</>
              ) : (
                <><Copy className="h-4 w-4" /> Copy to Clipboard</>
              )}
            </Button>
            <Button
              className="flex-1 gap-2 h-10 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white border-0 shadow-md shadow-violet-500/20"
              onClick={() => {
                const subject = encodeURIComponent(editSubject);
                const body    = encodeURIComponent(editBody.slice(0, 1800));
                // Newsletter is sent to your full client list — open the
                // user's default email client with subject/body pre-filled.
                // The recipient (BCC list) must be added manually.
                window.open(`mailto:?subject=${subject}&body=${body}`, "_blank");
                markAsSent();
              }}
              disabled={saving || isDraft}
            >
              <Mail className="h-4 w-4" />
              Open in Email
            </Button>
          </div>
          <Button
            variant="ghost"
            className="w-full text-muted-foreground text-xs h-8"
            onClick={markAsSent}
            disabled={saving || isDraft}
          >
            Mark as sent without opening
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── Newsletter Card ───────────────────────────────────────────────────────────

function NewsletterCard({
  item,
  onReview,
  onSkip,
}: {
  item:     NewsletterQueue;
  onReview: (item: NewsletterQueue) => void;
  onSkip:   (id: string) => void;
}) {
  const cfg   = TEMPLATE_CONFIG[item.template_type as TemplateType] ?? TEMPLATE_CONFIG.custom;
  const Icon  = cfg.icon;
  const isDraft = item.status === "draft";
  const subject = item.final_subject ?? item.ai_subject;
  const body    = item.final_body    ?? item.ai_body;

  const sentDate = item.sent_at
    ? new Date(item.sent_at).toLocaleDateString("en-CA", { month: "short", day: "numeric" })
    : null;

  const createdDate = new Date(item.created_at).toLocaleDateString("en-CA", {
    month: "short", day: "numeric",
  });

  return (
    <div className={cn(
      "group/card rounded-xl border bg-card/80 backdrop-blur-sm p-4 flex flex-col gap-3",
      "ring-1 transition-all duration-200",
      cfg.ringCls,
      "hover:shadow-lg hover:shadow-black/5 hover:bg-card hover:ring-2",
    )}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1 shadow-sm",
            cfg.bgCls, cfg.ringCls,
          )}>
            <Icon className={cn("h-4 w-4", cfg.textCls)} />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={cn("text-[11px] font-bold uppercase tracking-wider", cfg.textCls)}>
                {cfg.label}
              </span>
              {isDraft && (
                <Badge variant="outline" className="text-[10px] py-0 h-4 border-muted-foreground/30 animate-pulse">
                  <Loader2 className="h-2.5 w-2.5 mr-1 animate-spin" />
                  Drafting…
                </Badge>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {sentDate ? `Sent ${sentDate}` : `Created ${createdDate}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Users className="h-3 w-3 text-muted-foreground" />
          <span className="text-[11px] text-muted-foreground">All clients</span>
        </div>
      </div>

      {/* Message preview */}
      {!isDraft && subject && body ? (
        <div className={cn("rounded-lg p-3 space-y-1.5 border", cfg.bgCls, "border-transparent")}>
          <p className="text-[12px] font-semibold text-foreground/90 truncate">{subject}</p>
          <p className="text-[12px] text-muted-foreground line-clamp-2 leading-relaxed">
            {body.slice(0, 200)}…
          </p>
        </div>
      ) : isDraft ? (
        <div className="rounded-lg border border-border/30 bg-muted/20 p-3 space-y-2 animate-pulse">
          <div className="h-3 w-3/4 rounded-full bg-muted-foreground/15" />
          <div className="h-3 w-full rounded-full bg-muted-foreground/10" />
          <div className="h-3 w-5/6 rounded-full bg-muted-foreground/8" />
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
          Remove
        </Button>
        <Button
          size="sm"
          className={cn(
            "h-8 text-xs gap-1.5 font-semibold",
            "bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white border-0 shadow-sm",
            isDraft && "opacity-40 cursor-not-allowed",
          )}
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

// ── Empty state ───────────────────────────────────────────────────────────────

function NewsletterEmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center max-w-md mx-auto gap-5">
      <div className="relative">
        <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-400/20 to-emerald-600/10 ring-1 ring-blue-500/30 shadow-lg shadow-blue-500/10">
          <Newspaper className="h-8 w-8 text-blue-400" />
        </span>
        <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-violet-500 shadow-sm">
          <Sparkles className="h-3 w-3 text-white" />
        </span>
      </div>
      <div className="space-y-2">
        <h2 className="text-lg font-bold text-foreground">No newsletters yet</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Draft a personalised newsletter for your entire client list — BoC rate changes,
          monthly market updates, or any topic you want to share.
        </p>
      </div>
      <Button
        onClick={onNew}
        size="sm"
        className="gap-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white border-0 shadow-md shadow-violet-500/20"
      >
        <Plus className="h-3.5 w-3.5" />
        Draft Your First Newsletter
      </Button>
    </div>
  );
}

// ── Main exported section ─────────────────────────────────────────────────────

export function NewsletterSection({
  initialNewsletters,
  signature,
}: {
  initialNewsletters: NewsletterQueue[];
  signature:          string;
}) {
  const [newsletters,  setNewsletters]  = useState<NewsletterQueue[]>(initialNewsletters);
  const [draftOpen,    setDraftOpen]    = useState(false);
  const [reviewItem,   setReviewItem]   = useState<NewsletterQueue | null>(null);
  const [sentThisMonth, setSentThisMonth] = useState(
    initialNewsletters.filter((n) => n.status === "sent").length,
  );

  const handleDrafted = useCallback((item: NewsletterQueue) => {
    setNewsletters((prev) => [item, ...prev]);
  }, []);

  const handleSkip = useCallback(async (id: string) => {
    setNewsletters((prev) => prev.filter((n) => n.id !== id));
    try {
      const supabase = createClient();
      await supabase.from("newsletter_queue").delete().eq("id", id);
    } catch {
      toast.error("Couldn't remove newsletter — try again");
    }
  }, []);

  const handleSent = useCallback((id: string) => {
    setNewsletters((prev) => prev.filter((n) => n.id !== id));
    setSentThisMonth((c) => c + 1);
  }, []);

  const pending = newsletters.filter((n) => n.status !== "sent");

  return (
    <>
      {/* ── Header strip ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 pt-1 pb-4">
        <div className="flex items-center gap-2 flex-wrap">
          {pending.length > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-violet-500/10 ring-1 ring-violet-500/20 text-xs">
              <span className="h-2 w-2 rounded-full bg-violet-400 animate-pulse" />
              <span className="font-semibold text-violet-600 dark:text-violet-400">{pending.length}</span>
              <span className="text-muted-foreground">ready to send</span>
            </span>
          )}
          {sentThisMonth > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 ring-1 ring-emerald-500/20 text-xs">
              <Send className="h-3 w-3 text-emerald-500" />
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">{sentThisMonth}</span>
              <span className="text-muted-foreground">sent</span>
            </span>
          )}
        </div>
        <Button
          size="sm"
          onClick={() => setDraftOpen(true)}
          className="gap-2 shrink-0 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white shadow-md shadow-violet-500/20 border-0"
        >
          <Plus className="h-3.5 w-3.5" />
          New Newsletter
        </Button>
      </div>

      {/* ── List ─────────────────────────────────────────────────────── */}
      {pending.length === 0 ? (
        <NewsletterEmptyState onNew={() => setDraftOpen(true)} />
      ) : (
        <div className="space-y-3 max-w-2xl">
          {pending.map((item) => (
            <NewsletterCard
              key={item.id}
              item={item}
              onReview={setReviewItem}
              onSkip={handleSkip}
            />
          ))}
        </div>
      )}

      {/* ── Drawers ───────────────────────────────────────────────────── */}
      <DraftNewsletterDrawer
        open={draftOpen}
        onClose={() => setDraftOpen(false)}
        onDrafted={handleDrafted}
      />
      <NewsletterReviewDrawer
        item={reviewItem}
        onClose={() => setReviewItem(null)}
        onSent={handleSent}
        signature={signature}
      />
    </>
  );
}
