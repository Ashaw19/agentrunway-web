"use client";

/**
 * Flight Control — Business Brain + Prioritization Engine.
 *
 * Shows top opportunities: "Who should I focus on right now, and why?"
 * Message drafting is optional and assistive, not the primary experience.
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { Button }                          from "@/components/ui/button";
import { Input }                           from "@/components/ui/input";
import { Textarea }                        from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { createClient }                    from "@/lib/supabase/client";
import { toast }                           from "sonner";
import { cn }                              from "@/lib/utils";
import {
  Sparkles, Calendar, Clock, Gift, Mail, Copy,
  ChevronDown, Loader2, CheckCircle2, Pen,
  Send, Radar, TrendingUp, Target,
  Home, MessageCircle, Star, Users,
  Handshake, Heart, Repeat2,
  Flower2, Leaf, PartyPopper, Receipt,
  RefreshCw, Timer, Lightbulb, ArrowRight,
  AlertTriangle, Brain, Zap,
} from "lucide-react";
import type { OutreachQueueItem, OutreachOpportunityType, TopOpportunity, NewsletterQueue } from "@/lib/types/database";
import { useAiChat } from "@/lib/ai-chat-context";
import { NewsletterSection } from "./newsletter-section";

// ── Opportunity type icons ──────────────────────────────────────────────────

const OPTYPE_ICON: Record<OutreachOpportunityType, React.ElementType> = {
  closing_anniversary:   Calendar,
  idle_client:           Clock,
  birthday:              Gift,
  post_close_3:          Home,
  post_close_14:         MessageCircle,
  post_close_90:         TrendingUp,
  review_request:        Star,
  referral_ask:          Users,
  new_client_welcome:    Handshake,
  contact_anniversary:   Heart,
  multi_deal_milestone:  Repeat2,
  seasonal_spring:       Flower2,
  seasonal_fall:         Leaf,
  seasonal_yearend:      PartyPopper,
  seasonal_tax:          Receipt,
  mortgage_renewal_due:  RefreshCw,
  mortgage_renewal_window: RefreshCw,
  past_client_check_in:  Clock,
  timeframe_approaching: Timer,
  property_value_milestone: Home,
  // Batch 5: Memory-Powered Triggers
  pain_point_inactive:    Brain,
  buyer_inventory_match:  Target,
  seller_timing_hesitation: Lightbulb,
  mortgage_renewal_finance: RefreshCw,
  educational_value_inactive: Lightbulb,
  condition_firming:      CheckCircle2,
  scheduled_date_approaching: Timer,
};

function getScoreColor(score: number): { bg: string; text: string; ring: string } {
  if (score >= 80) return { bg: "bg-emerald-500/10", text: "text-emerald-400", ring: "ring-emerald-500/30" };
  if (score >= 65) return { bg: "bg-violet-500/10", text: "text-violet-400", ring: "ring-violet-500/30" };
  return { bg: "bg-amber-500/10", text: "text-amber-400", ring: "ring-amber-500/30" };
}

function getContextBadge(level: TopOpportunity["context_level"]): { label: string; cls: string } | null {
  if (level === "sensitive") return { label: "Sensitive", cls: "bg-rose-500/10 text-rose-400 ring-rose-500/20" };
  if (level === "sparse") return { label: "Limited data", cls: "bg-slate-500/10 text-slate-400 ring-slate-500/20" };
  return null; // rich = no badge needed
}

// ── Extended queue item type for drafting ───────────────────────────────────

type QueueItemWithClient = OutreachQueueItem & {
  clients: {
    name:             string;
    city:             string | null;
    province_region:  string | null;
    email:            string | null;
  } | null;
};

// ── Opportunity Card ────────────────────────────────────────────────────────

function OpportunityCard({
  opportunity,
  onDraftMessage,
  onDismiss,
  draftedMessage,
  onReviewDraft,
  drafting,
  onAskAI,
}: {
  opportunity:    TopOpportunity;
  onDraftMessage: (opp: TopOpportunity) => void;
  onDismiss:      (opp: TopOpportunity) => void;
  draftedMessage: QueueItemWithClient | null;
  onReviewDraft:  (item: QueueItemWithClient) => void;
  drafting:       boolean;
  onAskAI:        (opp: TopOpportunity) => void;
}) {
  const Icon = OPTYPE_ICON[opportunity.opportunity_type] ?? Target;
  const scoreColors = getScoreColor(opportunity.score);
  const contextBadge = getContextBadge(opportunity.context_level);
  const [expanded, setExpanded] = useState(false);

  const hasDraft = draftedMessage && draftedMessage.ai_subject;
  const isPrimary = opportunity.is_primary;

  return (
    <div className={cn(
      "rounded-xl border backdrop-blur-sm p-5 space-y-3",
      "ring-1 transition-all duration-200",
      isPrimary
        ? "bg-gradient-to-br from-violet-500/5 via-card/90 to-card/80 ring-violet-500/40 shadow-lg shadow-violet-500/10 ring-2"
        : cn("bg-card/80", scoreColors.ring, "hover:shadow-lg hover:shadow-black/5 hover:bg-card hover:ring-2"),
    )}>
      {/* Primary badge */}
      {isPrimary && (
        <div className="flex items-center gap-2 -mt-1 mb-1">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-violet-500/15 ring-1 ring-violet-500/30 text-[11px] font-bold text-violet-400 uppercase tracking-wider">
            <Zap className="h-3 w-3" />
            Start here
          </span>
          {opportunity.primary_reason && (
            <span className="text-[12px] text-violet-300/80 leading-tight">
              {opportunity.primary_reason}
            </span>
          )}
        </div>
      )}

      {/* Top row: icon + label + score */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <span className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 shadow-sm",
            isPrimary ? "bg-violet-500/15 ring-violet-500/40" : cn(scoreColors.bg, scoreColors.ring),
          )}>
            <Icon className={cn("h-5 w-5", isPrimary ? "text-violet-400" : scoreColors.text)} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-[15px] text-foreground leading-tight">
              {opportunity.client_name}
            </p>
            <p className="text-[12px] text-muted-foreground leading-snug mt-0.5">
              {opportunity.label}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {contextBadge && (
            <span className={cn(
              "text-[10px] font-medium px-2 py-0.5 rounded-full ring-1",
              contextBadge.cls,
            )}>
              {contextBadge.label}
            </span>
          )}
          <span className={cn(
            "text-[12px] font-bold px-2.5 py-1 rounded-full ring-1",
            scoreColors.bg, scoreColors.text, scoreColors.ring,
          )}>
            {opportunity.score}
          </span>
        </div>
      </div>

      {/* Why now — always visible */}
      <div className="flex items-start gap-2 pl-0.5">
        <Zap className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-400" />
        <p className="text-[13px] text-foreground/80 leading-relaxed">
          <span className="font-semibold text-foreground/90">Why now:</span>{" "}
          {opportunity.why_now}
        </p>
      </div>

      {/* Suggested angle — always visible */}
      <div className="flex items-start gap-2 pl-0.5">
        <Lightbulb className="h-3.5 w-3.5 mt-0.5 shrink-0 text-violet-400" />
        <p className="text-[13px] text-foreground/80 leading-relaxed">
          <span className="font-semibold text-foreground/90">Angle:</span>{" "}
          {opportunity.suggested_angle}
        </p>
      </div>

      {/* Financial impact — always visible */}
      <div className="flex items-start gap-2 pl-0.5">
        <TrendingUp className="h-3.5 w-3.5 mt-0.5 shrink-0 text-emerald-400" />
        <p className="text-[13px] text-foreground/80 leading-relaxed">
          <span className="font-semibold text-foreground/90">Impact:</span>{" "}
          {opportunity.financial_impact}
        </p>
      </div>

      {/* Risk if ignored — primary only */}
      {isPrimary && opportunity.risk_if_ignored && (
        <div className="flex items-start gap-2 pl-0.5">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-400/70" />
          <p className="text-[12px] text-muted-foreground leading-relaxed italic">
            {opportunity.risk_if_ignored}
          </p>
        </div>
      )}

      {/* Expandable: why this matters */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground transition-colors pl-0.5"
      >
        <Brain className="h-3 w-3" />
        <span>Why this matters</span>
        <ChevronDown className={cn("h-3 w-3 transition-transform", expanded && "rotate-180")} />
      </button>
      {expanded && (
        <div className="pl-6 text-[12px] text-muted-foreground leading-relaxed border-l-2 border-border/40 ml-1">
          {opportunity.why_this_matters}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between gap-2 pt-1">
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-foreground h-7 text-xs"
          onClick={() => onDismiss(opportunity)}
        >
          Dismiss
        </Button>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-xs gap-1.5 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
            onClick={() => onAskAI(opportunity)}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Ask AI
          </Button>
          {hasDraft && !drafting ? (
            <Button
              size="sm"
              className={cn(
                "h-8 text-xs gap-1.5 font-semibold",
                "bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white border-0 shadow-sm",
              )}
              onClick={() => onReviewDraft(draftedMessage!)}
            >
              Review Draft
              <ArrowRight className="h-3 w-3" />
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs gap-1.5 font-semibold border-violet-500/40 text-violet-400 hover:text-violet-300 hover:bg-violet-500/10"
              onClick={() => !drafting && onDraftMessage(opportunity)}
              disabled={drafting}
            >
              {drafting ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating...</>
              ) : (
                <><Pen className="h-3.5 w-3.5" /> Draft Message</>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Review drawer (preserved from existing — handles draft review + send) ───

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

  // Track the server's updated_at for optimistic locking
  const updatedAtRef = useRef<string | null>(null);

  const prevIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (item && item.id !== prevIdRef.current) {
      prevIdRef.current = item.id;
      setEditSubject(item.final_subject ?? item.ai_subject ?? "");
      setEditBody(item.final_body ?? item.ai_body ?? "");
      setCopied(false);
      updatedAtRef.current = item.updated_at ?? null;
    }
    if (!item) {
      prevIdRef.current = null;
      updatedAtRef.current = null;
    }
  }, [item]);

  // Captures latest editSubject/editBody at execution time
  // to prevent stale values when user edits during an active save.
  const latestEditsRef = useRef({ subject: "", body: "" });
  latestEditsRef.current = { subject: editSubject, body: editBody };

  const saveEdits = useCallback(async () => {
    if (!item) return;
    if (saving) return; // Prevent concurrent saves
    setSaving(true);
    try {
      // Read latest values at save time (not from closure)
      const { subject, body } = latestEditsRef.current;
      const payload: Record<string, unknown> = {
        final_subject: subject,
        final_body: body,
      };
      // Send optimistic lock token if we have one
      if (updatedAtRef.current) {
        payload.expected_updated_at = updatedAtRef.current;
      }
      const res = await fetch(`/api/ai/outreach-queue/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.status === 409) {
        toast.error("This draft was edited elsewhere — please refresh the page");
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // Update the lock token with the server's new updated_at
      const json = await res.json();
      if (json.updated_at) updatedAtRef.current = json.updated_at;
    } catch {
      toast.error("Couldn't save edits — your changes may not persist");
    } finally {
      setSaving(false);
    }
  }, [item, saving]);

  const markAsSent = useCallback(async () => {
    if (!item) return;
    try {
      const res = await fetch(`/api/ai/outreach-queue/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status:  "sent",
          sent_at: new Date().toISOString(),
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onSent(item.id);
      onClose();
      toast.success("Marked as sent");
    } catch {
      toast.error("Couldn't mark as sent — try again");
    }
  }, [item, onSent, onClose]);

  const handleCopy = useCallback(async () => {
    if (!item) return;
    await saveEdits();
    const text = `Subject: ${editSubject}\n\n${editBody}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error("Couldn't access clipboard");
      return;
    }
    markAsSent();
  }, [item, editSubject, editBody, saveEdits, markAsSent]);

  const handleOpenMailto = useCallback(async () => {
    if (!item) return;
    const to = item.clients?.email?.trim() ?? "";
    if (!to) {
      toast.error("No email address on file for this client");
      return;
    }
    await saveEdits();
    const subject = encodeURIComponent(editSubject);
    if (editBody.length > 1800) {
      toast.warning("Message was trimmed for the email link");
    }
    const body    = encodeURIComponent(editBody.slice(0, 1800));
    const url     = `mailto:${to}?subject=${subject}&body=${body}`;
    window.open(url, "_blank");
    markAsSent();
  }, [item, editSubject, editBody, saveEdits, markAsSent]);

  if (!item) return null;

  return (
    <Sheet open={!!item} onOpenChange={(open: boolean) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-lg flex flex-col gap-0 p-0 overflow-hidden">
        <SheetHeader className="relative px-6 pt-6 pb-4 shrink-0 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-violet-600/8 via-indigo-500/5 to-transparent pointer-events-none" />
          <div className="relative">
            <SheetTitle className="text-base font-bold">
              {item.clients?.name ?? "Client"} — Draft Message
            </SheetTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Review and personalise before sending. Edits are saved automatically.
            </p>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-border/60 to-transparent" />
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              Subject
            </label>
            <Input
              value={editSubject}
              onChange={(e) => setEditSubject(e.target.value)}
              className="text-sm font-medium"
              placeholder="Subject line..."
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
              placeholder="Message body..."
            />
          </div>

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
                    No signature set — add one in Settings.
                  </p>
                )}
              </div>
              <a
                href="/settings"
                className="shrink-0 text-[10px] text-violet-400 hover:text-violet-300 underline underline-offset-2 transition-colors mt-0.5"
              >
                Edit
              </a>
            </div>
          </div>
        </div>

        {/* Send actions */}
        <div className="px-6 pb-6 pt-4 shrink-0 space-y-3 border-t border-border/30">
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1 gap-2 h-10" onClick={handleCopy} disabled={saving}>
              {copied ? <><CheckCircle2 className="h-4 w-4 text-emerald-400" /> Copied!</> : <><Copy className="h-4 w-4" /> Copy to Clipboard</>}
            </Button>
            <Button
              className="flex-1 gap-2 h-10 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white border-0 shadow-md shadow-violet-500/20"
              onClick={handleOpenMailto}
              disabled={saving}
            >
              <Mail className="h-4 w-4" /> Open in Email
            </Button>
          </div>
          <Button variant="ghost" className="w-full text-muted-foreground text-xs h-8" onClick={markAsSent} disabled={saving}>
            Mark as sent without opening
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

type Tab = "opportunities" | "newsletters";

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
  const { askQuestion } = useAiChat();
  const [activeTab, setActiveTab] = useState<Tab>("opportunities");

  // Top Opportunities state
  const [opportunities, setOpportunities] = useState<TopOpportunity[]>([]);
  const [dismissedIds,  setDismissedIds]  = useState<Set<string>>(new Set());
  const [scanning,      setScanning]      = useState(false);
  const [loaded,        setLoaded]        = useState(false);

  // Drafted messages (from outreach_queue)
  const [queue,         setQueue]         = useState<QueueItemWithClient[]>(initialQueue);
  const [reviewItem,    setReviewItem]    = useState<QueueItemWithClient | null>(null);
  const [draftingFor,   setDraftingFor]   = useState<string | null>(null); // client_id being drafted
  const [sentThisMonth, setSentThisMonth] = useState(initialSentThisMonth);

  // Settings
  const [signature,     setSignature]     = useState(initialSignature);
  const [sigOpen,       setSigOpen]       = useState(false);
  const [sigSaving,     setSigSaving]     = useState(false);
  const sigDebounce     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [voiceGuide,    setVoiceGuide]    = useState(initialVoiceGuide);
  const [guideOpen,     setGuideOpen]     = useState(false);
  const [guideSaving,   setGuideSaving]   = useState(false);
  const guideDebounce   = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup debounce timers on unmount
  useEffect(() => {
    return () => {
      if (sigDebounce.current) clearTimeout(sigDebounce.current);
      if (guideDebounce.current) clearTimeout(guideDebounce.current);
    };
  }, []);

  // ── Load top opportunities on mount ──────────────────────────────────────
  const loadOpportunities = useCallback(async () => {
    setScanning(true);
    try {
      const res = await fetch("/api/ai/top-opportunities");
      const data = await res.json();
      if (res.ok && data.opportunities) {
        setOpportunities(data.opportunities);
        setDismissedIds(new Set());
      }
    } catch {
      toast.error("Couldn't load opportunities");
    } finally {
      setScanning(false);
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    loadOpportunities();
  }, [loadOpportunities]);

  // ── Settings persistence ──────────────────────────────────────────────────
  const saveSignature = useCallback((value: string) => {
    setSignature(value);
    if (sigDebounce.current) clearTimeout(sigDebounce.current);
    sigDebounce.current = setTimeout(async () => {
      setSigSaving(true);
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { error } = await supabase.from("user_settings").update({ email_signature: value }).eq("user_id", user.id);
          if (error) throw error;
        }
      } catch (err) {
        console.error("[flight-control] Failed to save email signature:", err);
        toast.error("Couldn't save signature — changes may not persist");
      } finally { setSigSaving(false); }
    }, 800);
  }, []);

  const saveVoiceGuide = useCallback((value: string) => {
    setVoiceGuide(value);
    if (guideDebounce.current) clearTimeout(guideDebounce.current);
    guideDebounce.current = setTimeout(async () => {
      setGuideSaving(true);
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { error } = await supabase.from("user_settings").update({ ai_voice_guide: value }).eq("user_id", user.id);
          if (error) throw error;
        }
      } catch (err) {
        console.error("[flight-control] Failed to save AI voice guide:", err);
        toast.error("Couldn't save voice guide — changes may not persist");
      } finally { setGuideSaving(false); }
    }, 800);
  }, []);

  // ── Dismiss opportunity ──────────────────────────────────────────────────
  const handleDismiss = useCallback((opp: TopOpportunity) => {
    setDismissedIds((prev) => new Set([...prev, `${opp.client_id}:${opp.opportunity_type}`]));
  }, []);

  // ── Ask AI about an opportunity ──────────────────────────────────────────
  const handleAskAI = useCallback((opp: TopOpportunity) => {
    const question = `I have a ${opp.label} opportunity with ${opp.client_name}. ${opp.why_now} The suggested angle is: ${opp.suggested_angle}. What's the best approach, and can you help me log a touchpoint once I reach out?`;
    askQuestion(question);
  }, [askQuestion]);

  // ── Draft message for an opportunity ──────────────────────────────────────
  const handleDraftMessage = useCallback(async (opp: TopOpportunity) => {
    setDraftingFor(opp.client_id);
    try {
      // First, persist the opportunity to outreach_queue via the scan endpoint
      const scanRes = await fetch("/api/ai/detect-opportunities", { method: "POST" });
      const scanData = await scanRes.json();
      if (!scanRes.ok) {
        toast.error(scanData?.error ?? "Couldn't scan opportunities — try again");
        return;
      }
      if (scanData.queue) {
        setQueue(scanData.queue as QueueItemWithClient[]);
      }

      // Then draft any pending items
      const draftRes = await fetch("/api/ai/detect-opportunities?draft_only=true", { method: "POST" });
      const draftData = await draftRes.json();
      if (!draftRes.ok) {
        toast.error(draftData?.error ?? "Couldn't generate draft — try again");
        return;
      }
      if (draftData.queue) {
        setQueue(draftData.queue as QueueItemWithClient[]);

        // Find the drafted message for this client
        const drafted = (draftData.queue as QueueItemWithClient[]).find(
          (q) => q.client_id === opp.client_id && q.status === "ready" && q.ai_subject,
        );
        if (drafted) {
          setReviewItem(drafted);
          toast.success("Draft ready for review");
        } else {
          toast.success("Message queued — may still be generating");
        }
      }
    } catch {
      toast.error("Couldn't draft message — try again");
    } finally {
      setDraftingFor(null);
    }
  }, []);

  // ── Mark as sent ──────────────────────────────────────────────────────────
  const handleSent = useCallback((id: string) => {
    setQueue((prev) => prev.filter((i) => i.id !== id));
    setSentThisMonth((n) => n + 1);
  }, []);

  // ── Visible opportunities ──────────────────────────────────────────────────
  const visibleOpps = opportunities.filter(
    (opp) => !dismissedIds.has(`${opp.client_id}:${opp.opportunity_type}`),
  );

  // Find matching drafted messages for each opportunity
  const getDraftForOpp = (opp: TopOpportunity): QueueItemWithClient | null => {
    return queue.find(
      (q) => q.client_id === opp.client_id && q.status === "ready" && q.ai_subject,
    ) ?? null;
  };

  return (
    <>
      <div className="flex flex-col h-full">
        {/* ── Hero header ────────────────────────────────────────────────── */}
        <div className="shrink-0">
          <div className="px-6 pt-6 pb-5 space-y-4">
            {/* Title row */}
            <div className="flex items-center justify-between gap-4">
              <div>
                <h1 className="text-xl font-bold tracking-tight">
                  Flight Control
                </h1>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Who should you focus on today?
                </p>
              </div>
              <Button
                onClick={loadOpportunities}
                disabled={scanning}
                size="sm"
                className="gap-2 shrink-0"
              >
                {scanning ? (
                  <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Scanning...</>
                ) : (
                  <><Radar className="h-3.5 w-3.5" /> Scan Now</>
                )}
              </Button>
            </div>

            {/* Stat pills */}
            <div className="flex items-center gap-2 flex-wrap">
              {visibleOpps.length > 0 && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-violet-500/10 ring-1 ring-violet-500/20 text-xs">
                  <Target className="h-3 w-3 text-violet-500" />
                  <span className="font-semibold text-violet-600 dark:text-violet-400">{visibleOpps.length}</span>
                  <span className="text-muted-foreground">top {visibleOpps.length === 1 ? "opportunity" : "opportunities"}</span>
                </span>
              )}
              {sentThisMonth > 0 && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 ring-1 ring-emerald-500/20 text-xs">
                  <Send className="h-3 w-3 text-emerald-500" />
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">{sentThisMonth}</span>
                  <span className="text-muted-foreground">sent this month</span>
                </span>
              )}
              {loaded && visibleOpps.length === 0 && !scanning && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-muted/50 text-xs text-muted-foreground">
                  <CheckCircle2 className="h-3 w-3" />
                  All caught up
                </span>
              )}
            </div>

            {/* Tab switcher */}
            <div className="flex items-center gap-1 p-1 rounded-lg bg-muted/40 ring-1 ring-border/40 self-start">
              <button
                onClick={() => setActiveTab("opportunities")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-all",
                  activeTab === "opportunities"
                    ? "bg-background shadow-sm text-foreground ring-1 ring-border/50"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Target className="h-3 w-3" />
                Opportunities
                {visibleOpps.length > 0 && (
                  <span className={cn(
                    "ml-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold",
                    activeTab === "opportunities"
                      ? "bg-violet-500/20 text-violet-600 dark:text-violet-400"
                      : "bg-muted text-muted-foreground",
                  )}>
                    {visibleOpps.length}
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

            {/* Settings (collapsible) — opportunities tab only */}
            {activeTab === "opportunities" && (
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
                      {sigSaving ? "Saving..." : "Appended to every AI-drafted message. Saves automatically."}
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
                      — {voiceGuide.slice(0, 40)}{voiceGuide.length > 40 ? "..." : ""}
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
                      placeholder={"Describe your writing style so AI drafts sound like you.\n\nExample: I keep messages short and casual. I avoid real estate clichés."}
                    />
                    <p className="text-[10px] text-muted-foreground">
                      {guideSaving ? "Saving..." : "The AI uses this to match your voice. Saves automatically."}
                    </p>
                  </div>
                )}
              </div>
            </div>
            )}
          </div>
        </div>

        {/* ── Tab content ──────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {activeTab === "newsletters" ? (
            <NewsletterSection
              initialNewsletters={initialNewsletters}
              signature={signature}
            />
          ) : !loaded ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Loader2 className="h-6 w-6 animate-spin text-violet-400" />
              <p className="text-sm text-muted-foreground">Analyzing your clients...</p>
            </div>
          ) : visibleOpps.length === 0 ? (
            <EmptyState onScan={loadOpportunities} scanning={scanning} />
          ) : (
            <div className="space-y-4 max-w-2xl">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 mb-1">
                <Target className="h-3 w-3 text-violet-400" />
                Top Opportunities — Who needs your attention
              </p>
              {visibleOpps.map((opp, i) => (
                <OpportunityCard
                  key={`${opp.client_id}-${opp.opportunity_type}-${i}`}
                  opportunity={opp}
                  onDraftMessage={handleDraftMessage}
                  onDismiss={handleDismiss}
                  draftedMessage={getDraftForOpp(opp)}
                  onReviewDraft={setReviewItem}
                  drafting={draftingFor === opp.client_id}
                  onAskAI={handleAskAI}
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
          No high-value opportunities right now. Flight Control scans your CRM for
          clients who need attention — closing anniversaries, overdue check-ins,
          timing signals, and relationship milestones.
        </p>
      </div>
      <Button
        onClick={onScan}
        disabled={scanning}
        size="sm"
        className="gap-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white border-0 shadow-md shadow-violet-500/20"
      >
        {scanning ? (
          <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Scanning...</>
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
