"use client";

/**
 * Flight Control — AI-powered outreach inbox.
 *
 * Surfaces AI-drafted, personalised outreach messages for the agent to
 * review and send with one click. No templates, no campaign builder.
 */

import { useState, useCallback, useRef, useEffect } from "react";
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
  Send, Radar, TrendingUp,
  Home, MessageCircle, Star, Users,
  Handshake, Heart, Repeat2,
  Flower2, Leaf, PartyPopper, Receipt,
  RefreshCw, Timer,
} from "lucide-react";
import type { OutreachQueueItem, OutreachOpportunityType, NewsletterQueue } from "@/lib/types/database";
import { NewsletterSection } from "./newsletter-section";

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
  // Phase A
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
  // Batch 1: Post-Close Nurture
  post_close_3: {
    label:   "Move-In Thanks",
    icon:    Home,
    ringCls: "ring-emerald-500/40",
    bgCls:   "bg-emerald-500/10",
    textCls: "text-emerald-400",
  },
  post_close_14: {
    label:   "2-Week Check-In",
    icon:    MessageCircle,
    ringCls: "ring-teal-500/40",
    bgCls:   "bg-teal-500/10",
    textCls: "text-teal-400",
  },
  post_close_90: {
    label:   "3-Month Check-In",
    icon:    TrendingUp,
    ringCls: "ring-blue-500/40",
    bgCls:   "bg-blue-500/10",
    textCls: "text-blue-400",
  },
  review_request: {
    label:   "Review Request",
    icon:    Star,
    ringCls: "ring-yellow-500/40",
    bgCls:   "bg-yellow-500/10",
    textCls: "text-yellow-400",
  },
  referral_ask: {
    label:   "Referral Ask",
    icon:    Users,
    ringCls: "ring-purple-500/40",
    bgCls:   "bg-purple-500/10",
    textCls: "text-purple-400",
  },
  // Batch 2: Relationship Milestones
  new_client_welcome: {
    label:   "New Client Welcome",
    icon:    Handshake,
    ringCls: "ring-cyan-500/40",
    bgCls:   "bg-cyan-500/10",
    textCls: "text-cyan-400",
  },
  contact_anniversary: {
    label:   "Relationship Milestone",
    icon:    Heart,
    ringCls: "ring-pink-500/40",
    bgCls:   "bg-pink-500/10",
    textCls: "text-pink-400",
  },
  multi_deal_milestone: {
    label:   "Repeat Client",
    icon:    Repeat2,
    ringCls: "ring-indigo-500/40",
    bgCls:   "bg-indigo-500/10",
    textCls: "text-indigo-400",
  },
  // Batch 3: Seasonal
  seasonal_spring: {
    label:   "Spring Market",
    icon:    Flower2,
    ringCls: "ring-green-500/40",
    bgCls:   "bg-green-500/10",
    textCls: "text-green-400",
  },
  seasonal_fall: {
    label:   "Fall Market",
    icon:    Leaf,
    ringCls: "ring-orange-500/40",
    bgCls:   "bg-orange-500/10",
    textCls: "text-orange-400",
  },
  seasonal_yearend: {
    label:   "Year-End",
    icon:    PartyPopper,
    ringCls: "ring-violet-500/40",
    bgCls:   "bg-violet-500/10",
    textCls: "text-violet-400",
  },
  seasonal_tax: {
    label:   "Tax Season Tip",
    icon:    Receipt,
    ringCls: "ring-slate-500/40",
    bgCls:   "bg-slate-500/10",
    textCls: "text-slate-400",
  },
  // Batch 4: Intelligent Outreach (briefing-triggered)
  mortgage_renewal_due: {
    label:   "Mortgage Renewal",
    icon:    RefreshCw,
    ringCls: "ring-red-500/40",
    bgCls:   "bg-red-500/10",
    textCls: "text-red-400",
  },
  mortgage_renewal_window: {
    label:   "Renewal Window",
    icon:    RefreshCw,
    ringCls: "ring-blue-500/40",
    bgCls:   "bg-blue-500/10",
    textCls: "text-blue-400",
  },
  past_client_check_in: {
    label:   "Past Client Check-In",
    icon:    Clock,
    ringCls: "ring-slate-500/40",
    bgCls:   "bg-slate-500/10",
    textCls: "text-slate-400",
  },
  timeframe_approaching: {
    label:   "Timeframe Approaching",
    icon:    Timer,
    ringCls: "ring-amber-500/40",
    bgCls:   "bg-amber-500/10",
    textCls: "text-amber-400",
  },
  property_value_milestone: {
    label:   "Property Milestone",
    icon:    Home,
    ringCls: "ring-emerald-500/40",
    bgCls:   "bg-emerald-500/10",
    textCls: "text-emerald-400",
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
    // Phase A
    case "closing_anniversary": {
      const years = Number(ctx.anniversary_year ?? 1);
      const addr  = (ctx.address as string) ?? item.clients?.city ?? "";
      return `${years}-year anniversary${addr ? ` · ${addr}` : ""}`;
    }
    case "idle_client":
      return `Last deal: ${ctx.last_deal ? String(ctx.last_deal).slice(0, 4) : "—"} · ${ctx.months_idle ?? "18+ months"} ago`;
    case "birthday":
      return "Upcoming birthday";
    // Batch 1: Post-Close Nurture
    case "post_close_3": {
      const addr = (ctx.address as string) ?? item.clients?.city ?? "";
      return `3 days after closing${addr ? ` · ${addr}` : ""}`;
    }
    case "post_close_14": {
      const addr = (ctx.address as string) ?? item.clients?.city ?? "";
      return `2-week check-in${addr ? ` · ${addr}` : ""}`;
    }
    case "post_close_90": {
      const addr = (ctx.address as string) ?? item.clients?.city ?? "";
      return `3-month mark${addr ? ` · ${addr}` : ""}`;
    }
    case "review_request": {
      const addr = (ctx.address as string) ?? item.clients?.city ?? "";
      return `21 days after closing${addr ? ` · ${addr}` : ""}`;
    }
    case "referral_ask": {
      const addr = (ctx.address as string) ?? item.clients?.city ?? "";
      return `45 days after closing${addr ? ` · ${addr}` : ""}`;
    }
    // Batch 2: Relationship Milestones
    case "new_client_welcome":
      return "7 days since first contact";
    case "contact_anniversary": {
      const yr = Number(ctx.anniversary_year ?? 1);
      return `${yr}-year working relationship`;
    }
    case "multi_deal_milestone": {
      const n = Number(ctx.deal_count ?? 2);
      const ordinal = n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`;
      return `${ordinal} deal together`;
    }
    // Batch 3: Seasonal
    case "seasonal_spring":
      return `Spring ${ctx.year ?? new Date().getFullYear()} market update`;
    case "seasonal_fall":
      return `Fall ${ctx.year ?? new Date().getFullYear()} market update`;
    case "seasonal_yearend":
      return `Year-end ${ctx.year ?? new Date().getFullYear()} check-in`;
    case "seasonal_tax":
      return `Tax season ${ctx.year ?? new Date().getFullYear()} tips`;
    // Batch 4: Intelligent Outreach
    case "mortgage_renewal_due": {
      const days = Number(ctx.days_until_renewal ?? 0);
      const addr = (ctx.address as string) ?? item.clients?.city ?? "";
      const timing = days <= 0 ? "overdue" : days <= 90 ? `${days}d away` : `~${Math.round(days / 30)}mo away`;
      return `5-yr renewal ${timing}${addr ? ` · ${addr}` : ""}`;
    }
    case "mortgage_renewal_window": {
      const months = Number(ctx.months_until_renewal ?? 12);
      const addr   = (ctx.address as string) ?? item.clients?.city ?? "";
      return `Renewal in ~${months}mo${addr ? ` · ${addr}` : ""}`;
    }
    case "past_client_check_in": {
      const months = Number(ctx.months_idle ?? 6);
      return `${months} month${months !== 1 ? "s" : ""} since last contact`;
    }
    case "timeframe_approaching": {
      const label = (ctx.timeframe_label as string) ?? "upcoming";
      const days  = Number(ctx.days_remaining ?? 0);
      return `${label} window · ~${days}d remaining`;
    }
    case "property_value_milestone": {
      const yr   = Number(ctx.milestone_year ?? 1);
      const addr = (ctx.address as string) ?? item.clients?.city ?? "";
      return `${yr}-year property anniversary${addr ? ` · ${addr}` : ""}`;
    }
    default:
      return "";
  }
}

// ── Message card ──────────────────────────────────────────────────────────────

function MessageCard({
  item,
  onReview,
  onSkip,
  onGenerate,
}: {
  item:       QueueItemWithClient;
  onReview:   (item: QueueItemWithClient) => void;
  onSkip:     (id: string) => void;
  onGenerate: () => void;
}) {
  const cfg    = OPTYPE_CONFIG[item.opportunity_type];
  const Icon   = cfg.icon;
  const isDraft = item.status === "draft";
  const subject = item.final_subject ?? item.ai_subject;
  const body    = item.final_body    ?? item.ai_body;

  return (
    <div className={cn(
      "group/card rounded-xl border bg-card/80 backdrop-blur-sm p-4 flex flex-col gap-3",
      "ring-1 transition-all duration-200",
      cfg.ringCls,
      "hover:shadow-lg hover:shadow-black/5 hover:bg-card hover:ring-2",
    )}>
      {/* Header row */}
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
            <p className="text-[12px] text-muted-foreground leading-tight mt-0.5">
              {contextLabel(item)}
            </p>
          </div>
        </div>
        <span className={cn(
          "shrink-0 text-[11px] font-semibold px-2.5 py-1 rounded-full",
          cfg.bgCls, cfg.textCls,
        )}>
          {daysUntilLabel(item.trigger_date)}
        </span>
      </div>

      {/* Client name */}
      <p className="font-semibold text-sm text-foreground leading-tight pl-0.5">
        {item.clients?.name ?? "Unknown client"}
      </p>

      {/* Message preview */}
      {!isDraft && subject && body ? (
        <div className={cn("rounded-lg p-3 space-y-1.5 border", cfg.bgCls, "border-transparent")}>
          <p className="text-[12px] font-semibold text-foreground/90 truncate">
            {subject}
          </p>
          <p className="text-[12px] text-muted-foreground line-clamp-2 leading-relaxed">
            {body.slice(0, 180)}…
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
          Skip
        </Button>
        {isDraft ? (
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs gap-1.5 font-semibold border-violet-500/40 text-violet-400 hover:text-violet-300 hover:bg-violet-500/10"
            onClick={onGenerate}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Generate Message
          </Button>
        ) : (
        <Button
          size="sm"
          className={cn(
            "h-8 text-xs gap-1.5 font-semibold",
            "bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white border-0 shadow-sm",
          )}
          onClick={() => onReview(item)}
        >
          Review & Send
          <ChevronRight className="h-3 w-3" />
        </Button>
        )}
      </div>
    </div>
  );
}

// ── Review drawer ─────────────────────────────────────────────────────────────

function ReviewDrawer({
  item,
  onClose,
  onSent,
  signature,
}: {
  item:      QueueItemWithClient | null;
  onClose:   () => void;
  onSent:    (id: string) => void;
  signature: string;
}) {
  const [editSubject, setEditSubject] = useState("");
  const [editBody,    setEditBody]    = useState("");
  const [saving,      setSaving]      = useState(false);
  const [copied,      setCopied]      = useState(false);

  // Sync local state when a new item is opened in the drawer
  const prevIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (item && item.id !== prevIdRef.current) {
      prevIdRef.current = item.id;
      setEditSubject(item.final_subject ?? item.ai_subject ?? "");
      setEditBody(item.final_body ?? item.ai_body ?? "");
      setCopied(false);
    }
    if (!item) {
      prevIdRef.current = null;
    }
  }, [item]);

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
        {/* Header with gradient */}
        <SheetHeader className="relative px-6 pt-6 pb-4 shrink-0 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-violet-600/8 via-indigo-500/5 to-transparent pointer-events-none" />
          <div className="relative">
            <div className="flex items-center gap-2 mb-1.5">
              <span className={cn(
                "flex h-7 w-7 items-center justify-center rounded-lg ring-1 shadow-sm",
                cfg.bgCls, cfg.ringCls,
              )}>
                <cfg.icon className={cn("h-3.5 w-3.5", cfg.textCls)} />
              </span>
              <span className={cn("text-[11px] font-bold uppercase tracking-wider", cfg.textCls)}>
                {cfg.label}
              </span>
            </div>
            <SheetTitle className="text-base font-bold">
              {item.clients?.name ?? "Client"} — {contextLabel(item)}
            </SheetTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Review and personalise before sending. Edits are saved automatically.
            </p>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-border/60 to-transparent" />
        </SheetHeader>

        {/* Editable message */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
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
              rows={12}
              className="text-sm leading-relaxed resize-none"
              placeholder="Message body…"
            />
          </div>

          {/* Signature status */}
          <div className="rounded-lg border border-border/40 bg-muted/20 px-3 py-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                  Your Signature
                </p>
                {signature ? (
                  <p className="text-[11px] text-muted-foreground leading-relaxed whitespace-pre-line line-clamp-3">
                    {signature}
                  </p>
                ) : (
                  <p className="text-[11px] text-muted-foreground/60 italic">
                    No signature set — add one in Settings so it appears in your drafted messages.
                  </p>
                )}
              </div>
              <a
                href="/settings"
                className="shrink-0 text-[10px] text-violet-400 hover:text-violet-300 underline underline-offset-2 transition-colors mt-0.5"
              >
                Edit →
              </a>
            </div>
          </div>
        </div>

        {/* Send actions */}
        <div className="px-6 pb-6 pt-4 shrink-0 space-y-3 border-t border-border/30">
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1 gap-2 h-10"
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
              className="flex-1 gap-2 h-10 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white border-0 shadow-md shadow-violet-500/20"
              onClick={handleOpenGmail}
              disabled={saving}
            >
              <Mail className="h-4 w-4" />
              Open in Gmail
            </Button>
          </div>
          <Button
            variant="ghost"
            className="w-full text-muted-foreground text-xs h-8"
            onClick={markAsSent}
            disabled={saving}
          >
            Mark as sent without opening
          </Button>
          <p className="text-[10px] text-center text-muted-foreground/50">
            Gmail &amp; Outlook direct-send coming in the next update.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

type Tab = "outreach" | "newsletters";

interface FlightControlContentProps {
  initialQueue:        QueueItemWithClient[];
  sentThisMonth:       number;
  initialSignature:    string;
  initialVoiceGuide:   string;
  initialNewsletters:  NewsletterQueue[];
}

export function FlightControlContent({
  initialQueue,
  sentThisMonth: initialSentThisMonth,
  initialSignature,
  initialVoiceGuide,
  initialNewsletters,
}: FlightControlContentProps) {
  const [activeTab, setActiveTab] = useState<Tab>("outreach");
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

  // ── AI Voice Guide ───────────────────────────────────────────────────────────
  const [voiceGuide,    setVoiceGuide]    = useState(initialVoiceGuide);
  const [guideOpen,     setGuideOpen]     = useState(false);
  const [guideSaving,   setGuideSaving]   = useState(false);
  const guideDebounce   = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveVoiceGuide = useCallback((value: string) => {
    setVoiceGuide(value);
    if (guideDebounce.current) clearTimeout(guideDebounce.current);
    guideDebounce.current = setTimeout(async () => {
      setGuideSaving(true);
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await supabase
            .from("user_settings")
            .update({ ai_voice_guide: value })
            .eq("user_id", user.id);
        }
      } catch {
        // silent — non-critical
      } finally {
        setGuideSaving(false);
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

  // ── Generate messages for stuck draft items ───────────────────────────────

  const handleGenerate = useCallback(async () => {
    try {
      const res  = await fetch("/api/ai/detect-opportunities?draft_only=true", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        const newQueue = (data.queue ?? []) as QueueItemWithClient[];
        setQueue(newQueue);
        if (data.drafted > 0) {
          toast.success(`${data.drafted} message${data.drafted === 1 ? "" : "s"} generated`);
        }
      }
    } catch {
      toast.error("Couldn't generate message — try again");
    }
  }, []);

  // ── Stats ─────────────────────────────────────────────────────────────────

  const readyCount = queue.filter((i) => i.status === "ready").length;
  const draftCount = queue.filter((i) => i.status === "draft").length;

  return (
    <>
      <div className="flex flex-col h-full">
        {/* ── Hero header with gradient ─────────────────────────────────── */}
        <div className="shrink-0 relative overflow-hidden">
          {/* Gradient background */}
          <div className="absolute inset-0 bg-gradient-to-br from-violet-600/8 via-indigo-500/5 to-transparent pointer-events-none" />
          <div className="relative px-6 pt-6 pb-5 space-y-4">
            {/* Title row */}
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 shadow-lg shadow-violet-500/20">
                  <Sparkles className="h-5 w-5 text-white" />
                </span>
                <div>
                  <h1 className="text-xl font-bold tracking-tight text-foreground">
                    Flight Control
                  </h1>
                  <p className="text-xs text-muted-foreground">
                    AI-powered outreach that feels human
                  </p>
                </div>
              </div>
              <Button
                onClick={handleScan}
                disabled={scanning}
                size="sm"
                className="gap-2 shrink-0 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white shadow-md shadow-violet-500/20 border-0"
              >
                {scanning ? (
                  <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Scanning…</>
                ) : (
                  <><Radar className="h-3.5 w-3.5" /> Scan Now</>
                )}
              </Button>
            </div>

            {/* Stat pills */}
            <div className="flex items-center gap-2 flex-wrap">
              {readyCount > 0 && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-violet-500/10 ring-1 ring-violet-500/20 text-xs">
                  <span className="h-2 w-2 rounded-full bg-violet-400 animate-pulse" />
                  <span className="font-semibold text-violet-600 dark:text-violet-400">{readyCount}</span>
                  <span className="text-muted-foreground">ready</span>
                </span>
              )}
              {draftCount > 0 && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 ring-1 ring-amber-500/20 text-xs">
                  <Loader2 className="h-3 w-3 animate-spin text-amber-500" />
                  <span className="font-semibold text-amber-600 dark:text-amber-400">{draftCount}</span>
                  <span className="text-muted-foreground">drafting</span>
                </span>
              )}
              {sentThisMonth > 0 && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 ring-1 ring-emerald-500/20 text-xs">
                  <Send className="h-3 w-3 text-emerald-500" />
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">{sentThisMonth}</span>
                  <span className="text-muted-foreground">sent this month</span>
                </span>
              )}
              {readyCount === 0 && draftCount === 0 && sentThisMonth === 0 && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-muted/50 text-xs text-muted-foreground">
                  <CheckCircle2 className="h-3 w-3" />
                  All caught up
                </span>
              )}
            </div>

            {/* Tab switcher */}
            <div className="flex items-center gap-1 p-1 rounded-lg bg-muted/40 ring-1 ring-border/40 self-start">
              <button
                onClick={() => setActiveTab("outreach")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-all",
                  activeTab === "outreach"
                    ? "bg-background shadow-sm text-foreground ring-1 ring-border/50"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Radar className="h-3 w-3" />
                Outreach
                {(readyCount + draftCount) > 0 && (
                  <span className={cn(
                    "ml-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold",
                    activeTab === "outreach"
                      ? "bg-violet-500/20 text-violet-600 dark:text-violet-400"
                      : "bg-muted text-muted-foreground",
                  )}>
                    {readyCount + draftCount}
                  </span>
                )}
              </button>
              <button
                onClick={() => setActiveTab("newsletters")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-all",
                  activeTab === "newsletters"
                    ? "bg-background shadow-sm text-foreground ring-1 ring-border/50"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Mail className="h-3 w-3" />
                Newsletters
              </button>
            </div>

            {/* Email signature + AI Voice Guide (collapsible) — outreach tab only */}
            {activeTab === "outreach" && (
            <div className="flex flex-col gap-2">
              <div>
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
                      rows={3}
                      className="text-xs font-mono resize-none"
                      placeholder={"Best regards,\nYour Name\nBrokerage Name\n(555) 123-4567"}
                    />
                    <p className="text-[10px] text-muted-foreground">
                      {sigSaving ? "Saving…" : "Appended to every AI-drafted message. Saves automatically."}
                    </p>
                  </div>
                )}
              </div>
              <div>
                <button
                  onClick={() => setGuideOpen(!guideOpen)}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Pen className="h-3 w-3" />
                  <span>AI Voice Guide</span>
                  {voiceGuide && !guideOpen && (
                    <span className="text-foreground/50 truncate max-w-[200px]">
                      — {voiceGuide.slice(0, 40)}{voiceGuide.length > 40 ? "…" : ""}
                    </span>
                  )}
                  <ChevronDown className={cn("h-3 w-3 transition-transform", guideOpen && "rotate-180")} />
                </button>
                {guideOpen && (
                  <div className="mt-2 space-y-1.5">
                    <Textarea
                      value={voiceGuide}
                      onChange={(e) => saveVoiceGuide(e.target.value)}
                      rows={4}
                      className="text-xs resize-none"
                      placeholder={"Describe your writing style so AI drafts sound like you.\n\nExample: I keep messages short and casual. I always end with an open question. I avoid real estate clichés and never say \"I hope this email finds you well\". I prefer first names only."}
                    />
                    <p className="text-[10px] text-muted-foreground">
                      {guideSaving ? "Saving…" : "The AI uses this to match your voice on every drafted message. Saves automatically."}
                    </p>
                  </div>
                )}
              </div>
            </div>
            )}
          </div>
          {/* Bottom divider with gradient fade */}
          <div className="h-px bg-gradient-to-r from-transparent via-border/60 to-transparent" />
        </div>

        {/* ── Tab content ────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {activeTab === "newsletters" ? (
            <NewsletterSection
              initialNewsletters={initialNewsletters}
              signature={signature}
            />
          ) : queue.length === 0 ? (
            <EmptyState onScan={handleScan} scanning={scanning} />
          ) : (
            <div className="space-y-3 max-w-2xl">
              {/* Section label */}
              {readyCount > 0 && (
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 mb-1">
                  <TrendingUp className="h-3 w-3 text-violet-400" />
                  Opportunities Ready
                </p>
              )}
              {/* Ready items first */}
              {queue
                .filter((i) => i.status === "ready")
                .map((item) => (
                  <MessageCard
                    key={item.id}
                    item={item}
                    onReview={setReviewItem}
                    onSkip={handleSkip}
                    onGenerate={handleGenerate}
                  />
                ))}
              {/* Draft section label */}
              {draftCount > 0 && (
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 mt-4 mb-1">
                  <Sparkles className="h-3 w-3 text-amber-400" />
                  Pending — Generate Message to draft
                </p>
              )}
              {/* Draft / still generating */}
              {queue
                .filter((i) => i.status === "draft")
                .map((item) => (
                  <MessageCard
                    key={item.id}
                    item={item}
                    onReview={setReviewItem}
                    onSkip={handleSkip}
                    onGenerate={handleGenerate}
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
        signature={signature}
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
    <div className="flex flex-col items-center justify-center py-20 text-center max-w-md mx-auto gap-5">
      <div className="relative">
        <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400/20 to-emerald-600/10 ring-1 ring-emerald-500/30 shadow-lg shadow-emerald-500/10">
          <CheckCircle2 className="h-8 w-8 text-emerald-400" />
        </span>
        <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 shadow-sm">
          <Sparkles className="h-3 w-3 text-white" />
        </span>
      </div>
      <div className="space-y-2">
        <h2 className="text-lg font-bold text-foreground">
          All caught up
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Flight Control monitors closing anniversaries, birthdays, and
          clients who haven&apos;t heard from you lately. When it finds a
          touchpoint, it drafts a personal message for you.
        </p>
      </div>
      <Button
        onClick={onScan}
        disabled={scanning}
        size="sm"
        className="gap-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white border-0 shadow-md shadow-violet-500/20"
      >
        {scanning ? (
          <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Scanning…</>
        ) : (
          <><Radar className="h-3.5 w-3.5" /> Scan Now</>
        )}
      </Button>
      <p className="text-[11px] text-muted-foreground/50">
        Scans run automatically each morning at 8 AM.
      </p>
    </div>
  );
}
