"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { SortableCard } from "./sortable-card";
import {
  type CardId,
  CARD_REGISTRY,
  SECTIONS,
  DEFAULT_ORDER,
  DEFAULT_HIDDEN,
  type DashboardLayout,
} from "./card-registry";
import { CountUp } from "@/components/count-up";
import { useConfetti } from "@/hooks/use-confetti";
import dynamic from "next/dynamic";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Target,
  Briefcase,
  BarChart2,
  Gauge,
  AlertTriangle,
  CheckCircle,
  Info,
  Lightbulb,
  Star,
  ChevronDown,
  HelpCircle,
  Sparkles,
  X,
  Rocket,
  Plus,
  Layers,
  Receipt,
  Trophy,
  CalendarCheck,
  Zap,
  CheckSquare,
  Square,
  Building2,
  Settings2,
  RotateCcw,
  Eye,
  Calendar,
  Clock,
  Crosshair,
  ChevronRight,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Compass,
} from "lucide-react";
import { Tailfin } from "@/components/icons/brand-icons";
import Link from "next/link";
import { fmtCurrency, fmtCompact, fmtPct } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { CANONICAL_TAX_DISCLAIMER, CANONICAL_TAX_DISCLAIMER_SHORT } from "@/lib/flight-crew/constants";
import type { MonthlyDataPoint } from "@/components/monthly-chart";
import {
  computeGCI,
  computeWeightedGCI,
  computeTxFees,
  computeAgentGross,
  PROVINCE_LABELS,
  type Transaction,
  type PipelineDeal,
  type UserSettings,
  type ExpenseCategoryWithItems,
  type HistoryItem,
  type ContactTask,
  type ListingAppointment,
  type FilingFrequency,
} from "@/lib/types/database";
import { getCurrentFilingPeriod, deadlineUrgency } from "@agent-runway/core/engines/filing-period-engine";
import { gstHstLabel, gstHstRate } from "@agent-runway/core/engines/canadian-tax-engine";
import { computeHSTCollected } from "@agent-runway/core/engines/hst-engine";
import {
  seasonalFractionElapsed,
  projectedYearEndGCI,
  projectedYearEndTransactions,
  paceVsGoalPercent,
  daysRemaining,
  trendDirection,
} from "@/lib/engines/projection-engine";
import { probabilityBands } from "@/lib/engines/probabilistic-forecast-engine";
import { compare, COHORT_LABELS, cohortFromYears } from "@/lib/engines/benchmark-engine";
import { computeWhereYouStand, BAND_LABELS, type PerformanceBand } from "@/lib/engines/where-you-stand-engine";
import type { BriefingItem } from "@/lib/engines/crm-analytics-engine";
import { survivalResult, type SurvivalResult } from "@/lib/engines/survival-engine";
import { computeCashPosition, type CashPositionResult } from "@/lib/engines/cash-position-engine";
import { compute as computeRunwayScore, type BusinessHealthReport, type RunwayScoreResult, type RunwayStateLabel } from "@/lib/engines/runway-score-engine";
import { generateInsights, type Insight } from "@/lib/engines/insights-engine";
import { buildHealthReport } from "@/lib/engines/health-report";
import {
  experienceTier,
  computeBaselines,
  detectAllDeviations,
  generateDeviationInsights,
} from "@/lib/engines/deviation-engine";
import { calculate as calculateTax, marginalRate } from "@/lib/engines/canadian-tax-engine";
import { calculateCorporateTax, type CorporateTaxResult } from "@/lib/engines/corporate-tax-engine";
import { generateTaxOptimizations, type TaxOptimizationCard } from "@/lib/engines/tax-optimization-engine";
import { computeTimeValue } from "@/lib/engines/time-value";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ExplainButton } from "@/components/explain-button";
const AnnualReview = dynamic(() => import("@/components/annual-review").then(m => m.AnnualReview), { ssr: false });
const MonthlyChart = dynamic(() => import("@/components/monthly-chart").then(m => m.MonthlyChart), { ssr: false });
const WelcomeTour = dynamic(() => import("@/components/welcome-tour").then(m => m.WelcomeTour), { ssr: false });
import { GuideLink } from "@/components/guide-link";
import { AiProfilePrompt } from "./ai-profile-prompt";
import { ClosingDayPrompt } from "./closing-day-prompt";
import type { CommunicationProfile, BusinessIdentity } from "@/lib/types/database";

function MetricInfo({ tip }: { tip: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Info className="h-3.5 w-3.5 text-muted-foreground/50 hover:text-muted-foreground cursor-help transition-colors shrink-0" />
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[220px] text-center leading-snug">
          {tip}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface Props {
  transactions: Transaction[];
  pipelineDeals: PipelineDeal[];
  settings: UserSettings | null;
  expenseCategories: ExpenseCategoryWithItems[];
  /** Current-year YTD total from receipt_expenses (replaces ytd_amount sum) */
  receiptYTD?: number;
  historyItems?: HistoryItem[];
  initialDashboardView?: string;
  isPro?: boolean;
  showUpgradeBanner?: boolean;
  userName?: string;
  openTasks?: ContactTask[];
  mileageKmTotal?: number;
  ccaAssetCount?: number;
  activeClientCount?: number;
  staleLeadCount?: number;
  hasSeenTour?: boolean;
  briefingItems?: BriefingItem[];
  upcomingConditions?: Array<{ address: string; condition_date: string; client_name: string; days_until: number }>;
  runwayScoreSnapshot?: { score: number; month: string } | null;
  dashboardLayout?: DashboardLayout | null;
  communicationProfile?: CommunicationProfile | null;
  businessIdentity?: BusinessIdentity | null;
  aiProfilePromptDismissedAt?: string | null;
  activeListings?: ListingAppointment[];
  teamWelcome?: { orgName: string } | null;
  /** Pre-computed monthly total from recurring_expenses table */
  recurringExpMonthly?: number;
  /** Pre-computed YTD total from recurring_expenses table */
  recurringExpYTD?: number;
}

function getTimeGreeting(): { greeting: string; emoji: string } {
  const hour = new Date().getHours();
  if (hour < 12) return { greeting: "Good morning", emoji: "☀️" };
  if (hour < 17) return { greeting: "Good afternoon", emoji: "⚡" };
  return { greeting: "Good evening", emoji: "🌙" };
}

function getMotivationalTag(paceStatus: string, ytdDealCount: number): string {
  if (ytdDealCount === 0) return "Zero on the board. The market has no idea what's coming. 🚀";
  if (paceStatus === "ahead") return "Ahead of pace. Your accountant is cautiously optimistic.";
  if (paceStatus === "behind") return "Behind pace. The market doesn't know that yet.";
  return "Right on track. Quietly dangerous.";
}

function getStreakLabel(transactions: Transaction[]): string | null {
  if (transactions.length < 2) return null;
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth();
  const months = new Set(
    transactions
      .filter((tx) => tx.date.startsWith(String(currentYear)))
      .map((tx) => new Date(tx.date + "T12:00:00").getMonth())
  );
  // Count consecutive months backwards from current
  let streak = 0;
  for (let m = currentMonth; m >= 0; m--) {
    if (months.has(m)) streak++;
    else break;
  }
  if (streak >= 3) return `🔥 ${streak}-month closing streak`;
  if (streak === 2) return "2 months running. Someone's hungry.";
  return null;
}

const PIPELINE_STAGE_CONFIG: Array<{
  key: string;
  label: string;
  dotClass: string;
  chipClass: string;
}> = [
  { key: "lead",        label: "Lead",        dotClass: "bg-slate-400",   chipClass: "border-slate-200 bg-slate-50 text-slate-600" },
  { key: "showing",    label: "Showing",     dotClass: "bg-blue-500",    chipClass: "border-blue-200 bg-blue-50 text-blue-700" },
  { key: "offer",      label: "Offer",       dotClass: "bg-amber-500",   chipClass: "border-amber-200 bg-amber-50 text-amber-700" },
  { key: "conditional", label: "Conditional", dotClass: "bg-amber-600", chipClass: "border-amber-300 bg-amber-100 text-amber-800" },
  { key: "firm",       label: "Firm",        dotClass: "bg-emerald-500", chipClass: "border-emerald-200 bg-emerald-50 text-emerald-700" },
];

// Color-only lookup keyed to the engine's `stateLabel`. The label itself
// comes from `runwayScore.stateLabel` (engine = source of truth); this
// helper contributes only the dashboard's Tailwind tokens for each band.
function scoreBandColor(label: RunwayStateLabel): string {
  switch (label) {
    case "Strong":   return "text-emerald-400 bg-emerald-500/15 border-emerald-500/30";
    case "On Track": return "text-blue-400 bg-blue-500/15 border-blue-500/30";
    case "Building": return "text-amber-400 bg-amber-500/15 border-amber-500/30";
    case "At Risk":  return "text-red-400 bg-red-500/15 border-red-500/30";
  }
}

const INSIGHT_ICONS: Record<string, React.ElementType> = {
  "gauge": Gauge,
  "check-circle": CheckCircle,
  "alert-triangle": AlertTriangle,
  "alert-circle": AlertTriangle,
  "arrow-up-right": TrendingUp,
  "bar-chart": BarChart2,
  "arrow-right-circle": Target,
  "layers": Briefcase,
  "dollar-sign": DollarSign,
  "trending-up": TrendingUp,
  "trending-down": TrendingDown,
  "star": Star,
  "flag": Target,
  "sliders": Gauge,
  "plus-circle": Lightbulb,
  "target": Target,
};

export function DashboardContent({
  transactions,
  pipelineDeals,
  settings,
  expenseCategories,
  receiptYTD = 0,
  historyItems = [],
  initialDashboardView: _initialDashboardView,
  isPro: isPro = false,
  showUpgradeBanner = false,
  userName,
  openTasks = [],
  mileageKmTotal = 0,
  ccaAssetCount = 0,
  activeClientCount: activeClients = 0,
  staleLeadCount = 0,
  hasSeenTour = true,
  briefingItems = [],
  upcomingConditions = [],
  runwayScoreSnapshot = null,
  dashboardLayout = null,
  communicationProfile = null,
  businessIdentity = null,
  aiProfilePromptDismissedAt = null,
  activeListings,
  teamWelcome = null,
  recurringExpMonthly = 0,
  recurringExpYTD = 0,
}: Props) {
  const supabase = useMemo(() => createClient(), []);

  // ── Filing deadline alert ────────────────────────────────────────────
  const filingDeadlineAlert = useMemo(() => {
    if (!settings) return null;
    const freq = (settings.filing_frequency as FilingFrequency) ?? "quarterly";
    const period = getCurrentFilingPeriod(freq);
    const dl = deadlineUrgency(period.deadline);
    if (dl.urgency === "ok") return null;
    return {
      urgency: dl.urgency,
      deadlineLabel: dl.label,
      periodLabel: period.label,
      taxLabel: gstHstLabel(settings.province),
    };
  }, [settings]);

  // Memoized so ClosingDayPrompt's useEffect doesn't reset on every re-render.
  // Bulletproof local date — no locale dependency, no UTC offset issues.
  const dealsClosingToday = useMemo(() => {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    return pipelineDeals.filter((d) => {
      if (!d.expected_close_date) return false;
      if (d.stage !== "firm" && d.stage !== "closed") return false;
      return d.expected_close_date <= today;
    });
  }, [pipelineDeals]);

  const [tourComplete, setTourComplete] = useState(hasSeenTour);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [showAnnualReview, setShowAnnualReview] = useState(false);
  // ── CRM task widget state ───────────────────────────────────────────────
  const [localTasks, setLocalTasks] = useState<ContactTask[]>(openTasks);
  async function completeTaskFromDashboard(taskId: string) {
    // Optimistic removal — use functional updater so we can reverse just this task
    // even if multiple completions are in-flight simultaneously (no stale closure).
    setLocalTasks((prev) => prev.filter((t) => t.id !== taskId));
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLocalTasks((prev) => {
        // Restore only if the task isn't already back (idempotent)
        return prev.some((t) => t.id === taskId) ? prev : [...prev];
      });
      toast.error("Not authenticated");
      return;
    }
    const { error } = await supabase
      .from("contact_tasks")
      .update({ completed_at: new Date().toISOString() })
      .eq("id", taskId)
      .eq("user_id", user.id);
    if (error) {
      // Restore just this task without clobbering concurrent completions.
      // We don't have the original task object here, so trigger a page refresh
      // to re-sync from server rather than risk an inconsistent local state.
      toast.error("Failed to complete task — refreshing…");
      window.location.reload();
    }
  }
  const { fire: fireConfetti } = useConfetti();
  const confettiFiredRef = useRef(false);
  const now = new Date();
  const currentYear = now.getFullYear();
  const _isDecember = now.getMonth() === 11; // 0-indexed

  // ── Scenario toggle ────────────────────────────────────────────────────
  // NOTE [RELOCATED]: Scenario selector (Conservative/Base/Optimistic ±15%)
  // was removed from the dashboard header to reduce cognitive load on the home screen.
  // It belongs on the Forecast page where scenario planning is the primary intent.
  // The dashboard always shows the Base projection.
  // ── Business Health Narrative collapsed by default — expand on demand ───
  const [narrativeOpen, setNarrativeOpen] = useState(false);

  // ── Custom card layout ────────────────────────────────────────────────
  const [cardOrder, setCardOrder] = useState<CardId[]>(() => {
    if (dashboardLayout?.order && dashboardLayout.order.length > 0) {
      // Merge: include any new cards not in saved order at the end
      const saved = dashboardLayout.order.filter((id): id is CardId =>
        DEFAULT_ORDER.includes(id as CardId)
      );
      const missing = DEFAULT_ORDER.filter((id) => !saved.includes(id));
      return [...saved, ...missing];
    }
    return DEFAULT_ORDER;
  });
  const [hiddenCards, setHiddenCards] = useState<Set<CardId>>(() => {
    if (dashboardLayout?.hidden) {
      return new Set(dashboardLayout.hidden as CardId[]);
    }
    return new Set(DEFAULT_HIDDEN);
  });
  const [customizeMode, setCustomizeMode] = useState(false);

  // Portal target for top-bar action buttons
  const [topBarTarget, setTopBarTarget] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const el = document.getElementById("top-bar-actions");
    if (el) setTopBarTarget(el);
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  async function persistLayout(order: CardId[], hidden: Set<CardId>) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase
        .from("user_settings")
        .update({ dashboard_layout: { order, hidden: [...hidden] } })
        .eq("user_id", user.id);
    } catch { /* fire-and-forget */ }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const currentHidden = hiddenCards;
    setCardOrder((prev) => {
      const oldIndex = prev.indexOf(active.id as CardId);
      const newIndex = prev.indexOf(over.id as CardId);
      const next = arrayMove(prev, oldIndex, newIndex);
      persistLayout(next, currentHidden);
      return next;
    });
  }

  function toggleHide(id: CardId) {
    const currentOrder = cardOrder;
    setHiddenCards((prev) => {
      const next = new Set(prev);
      next.add(id);
      persistLayout(currentOrder, next);
      return next;
    });
  }

  function toggleShow(id: CardId) {
    const currentOrder = cardOrder;
    setHiddenCards((prev) => {
      const next = new Set(prev);
      next.delete(id);
      persistLayout(currentOrder, next);
      return next;
    });
  }

  function resetLayout() {
    const order = DEFAULT_ORDER;
    const hidden = new Set<CardId>(DEFAULT_HIDDEN);
    setCardOrder(order);
    setHiddenCards(hidden);
    persistLayout(order, hidden);
  }

  // ── YTD calculations ──────────────────────────────────────────────────
  const ytdGCI = transactions.reduce((sum, tx) => sum + computeGCI(tx), 0);
  const ytdDealCount = transactions.length;
  const avgDealSize = ytdDealCount > 0 ? ytdGCI / ytdDealCount : 0;

  // ── Zero-data gate ────────────────────────────────────────────────────
  // The Runway Score, pace percentile, and behind-goal % are only meaningful
  // once there's business activity to score. On a brand-new account all five
  // component inputs are zero, which collapses to a misleading "D / 0" hero.
  // Any closed transaction OR historical import (prior-year data) is enough
  // signal to render the real score.
  const hasData = transactions.length > 0 || historyItems.length > 0;

  // ── Pipeline ──────────────────────────────────────────────────────────
  const pipelineWeightedGCI = pipelineDeals.reduce(
    (sum, d) => sum + computeWeightedGCI(d),
    0,
  );
  const pipelineCount = pipelineDeals.length;

  // ── Listing appointment weighted GCI ─────────────────────────────────
  const LISTING_PROBS: Record<string, number> = { scheduled: 0.15, active: 0.40 };
  const listingWeightedGCI = (activeListings ?? []).reduce((sum, la) => {
    const price = Number(la.estimated_list_price ?? 0);
    const commPct = la.estimated_commission_pct ?? 0.025;
    const prob = LISTING_PROBS[la.status] ?? 0;
    return sum + price * commPct * prob;
  }, 0);
  const listingCount = (activeListings ?? []).length;

  // ── Seasonality-aware projections ─────────────────────────────────────
  // Phase 4: prefer agent-specific weights derived from their own history
  const agentSeasonalWeights = (() => {
    const withData = historyItems.filter((h) =>
      (h.quarter_gci as number[]).some((v) => (v ?? 0) > 0),
    );
    if (withData.length < 2) return null;
    const avgQ = [0, 1, 2, 3].map((q) =>
      withData.reduce((sum, h) => sum + ((h.quarter_gci as number[])[q] ?? 0), 0) /
      withData.length,
    );
    const total = avgQ.reduce((a, b) => a + b, 0);
    return total > 0 ? avgQ.map((v) => v / total) : null;
  })();

  const seasonalWeights =
    agentSeasonalWeights ??
    (settings?.use_national_seasonality
      ? (settings.national_quarter_pcts ?? [0.25, 0.25, 0.25, 0.25])
      : [0.25, 0.25, 0.25, 0.25]);

  const seasonalSource: "agent" | "national" | "default" =
    agentSeasonalWeights
      ? "agent"
      : settings?.use_national_seasonality
        ? "national"
        : "default";
  const fraction = seasonalFractionElapsed(seasonalWeights);
  const goalGCI = settings?.goal_gci ?? 0;
  const rawProjectedGCI = projectedYearEndGCI(ytdGCI, pipelineWeightedGCI + listingWeightedGCI, fraction, goalGCI);
  const projectedGCI = rawProjectedGCI; // Base scenario — see note above re: scenario selector
  const gciProgress = goalGCI > 0 ? Math.min((ytdGCI / goalGCI) * 100, 100) : 0;
  const pacePercent = goalGCI > 0 ? paceVsGoalPercent(goalGCI, ytdGCI, fraction) : 0;
  const paceStatus =
    goalGCI <= 0 ? "no-goal" : pacePercent >= 0 ? "ahead" : "behind";
  // Dollar amount ahead/behind pace (positive = ahead, negative = behind)
  const paceGapAmount = goalGCI > 0 && fraction > 0 ? ytdGCI - goalGCI * fraction : 0;

  // ── Probability bands ─────────────────────────────────────────────────
  const bands = probabilityBands(transactions, projectedGCI, fraction);

  // ── Benchmark ─────────────────────────────────────────────────────────
  const benchmark = compare(projectedGCI, settings?.experience_years ?? null);

  // ── Where You Stand ──────────────────────────────────────────────────
  // Market momentum input retired with the licensed market data layer; the
  // engine handles a null marketMomentum and falls back to internal-only signals.
  const whereYouStand = computeWhereYouStand({
    ytdGCI,
    ytdDealCount,
    projectedGCI,
    avgDealGCI: avgDealSize,
    goalGCI,
    fraction,
    benchmark,
    marketMomentum: null,
    experienceYears: settings?.experience_years ?? null,
    cohort: cohortFromYears(settings?.experience_years ?? 5),
    hasPriorYearData: historyItems.some(h => h.year === currentYear - 1),
    currentQuarter: Math.floor(now.getMonth() / 3),
  });

  // ── Expenses ──────────────────────────────────────────────────────────
  // Effective YTD: higher of receipt-verified actuals or recurring estimates
  // Includes both legacy expense_items.monthly_recurring AND new recurring_expenses table
  const receiptTotal = receiptYTD;
  const legacyMonthlyRecurring = expenseCategories.reduce(
    (sum, cat) =>
      sum + cat.items.reduce((s, i) => s + Number(i.monthly_recurring), 0),
    0,
  );
  const monthlyRecurring = legacyMonthlyRecurring + recurringExpMonthly;
  const expMonthsElapsed = now.getMonth() + 1; // 1-12, consistent with expRemainingMonths denominator
  const legacyRecurringYTDEstimate = legacyMonthlyRecurring * expMonthsElapsed;
  const expensesYTD = Math.max(receiptTotal, legacyRecurringYTDEstimate) + recurringExpYTD;

  // ── Survival prep (pipeline monthly estimate) ──────────────────────────
  const remainingMonths = Math.max(1, 12 - Math.floor(fraction * 12));
  const pipelineMonthlyEst = fraction > 0 ? pipelineWeightedGCI / remainingMonths : 0;

  // ── Tax estimate ──────────────────────────────────────────────────────
  // Project full-year expenses: actual YTD + remaining months of recurring.
  // Using expRemainingMonths avoids double-counting recurring costs already in expensesYTD.
  const expRemainingMonths = Math.max(0, 12 - (now.getMonth() + 1));
  const annualExpenses = expensesYTD + monthlyRecurring * expRemainingMonths;
  const projectedNet = computeProjectedNet(projectedGCI, settings);
  // Net self-employment income = gross-of-brokerage minus all business expenses
  const netForTax = Math.max(0, projectedNet - annualExpenses);
  // Per-deal tax portion is more useful against projected deal count, not just YTD
  const projectedDealCount = projectedYearEndTransactions(ytdDealCount, pipelineCount, fraction);
  const taxResult = settings
    ? calculateTax(netForTax, settings.province, Math.max(projectedDealCount, 1))
    : null;

  // ── Cash Position (implied from YTD data) ─────────────────────────────
  // Computes what *should* be in the agent's business account based on
  // income earned minus expenses, tax set-aside, and HST owing.
  // D-4 fix (Audit 1 2026-04-22): canonical HST helper respects
  // `brokerageWithholdsHst`. Prior inline formula treated brokerage-withholding
  // agents as still having YTD HST collected, which disagreed with the
  // cash-position engine (which already zeroed owing when brokerage withholds).
  // The helper aligns dashboard display with chat + MCP. See hst-engine.ts.
  const hstRateValue = settings ? gstHstRate(settings.province) : 0;
  const ytdHstCollected = computeHSTCollected({
    ytdGCI,
    hstRate: hstRateValue,
    isRegistered: settings?.gst_hst_registered ?? false,
    brokerageWithholdsHst: settings?.brokerage_withholds_hst ?? false,
  });
  const ytdHstOnExpenses = settings?.gst_hst_paid_on_expenses ? expensesYTD * (hstRateValue / (1 + hstRateValue)) : 0;
  const cashPosition: CashPositionResult = computeCashPosition({
    ytdGCI,
    ytdAgentNet: (() => {
      if (!settings) return ytdGCI;
      const { agentGross } = computeAgentGross(
        ytdGCI, settings.split_preset, settings.post_cap_threshold_gci,
        settings.post_cap_agent_pct, settings.post_cap_brokerage_pct,
      );
      const txFees = computeTxFees(ytdGCI, settings.tx_fee_rate_pct, settings.tx_fee_annual_cap);
      const brokerageFees = settings.monthly_brokerage_fee * (now.getMonth() + 1);
      return Math.max(0, agentGross - txFees - brokerageFees);
    })(),
    ytdExpenses: expensesYTD,
    ytdTaxSetAside: taxResult ? taxResult.totalBurden * Math.min(fraction, 1) : 0,
    ytdHstCollected,
    ytdHstOnExpenses,
    brokerageWithholdsHst: settings?.brokerage_withholds_hst ?? false,
    manualCashReserve: settings?.cash_reserve ?? 0,
    fractionElapsed: fraction,
  });

  // ── Survival (final — uses implied cash position) ─────────────────────
  const survival = survivalResult(
    settings?.monthly_brokerage_fee ?? 0,
    monthlyRecurring,
    cashPosition.effectiveCash,
    pipelineMonthlyEst,
  );

  // ── Runway Score ──────────────────────────────────────────────────────
  const healthReport: BusinessHealthReport = buildHealthReport(
    ytdGCI, goalGCI, fraction, pipelineWeightedGCI, expensesYTD,
  );
  const runwayScore = computeRunwayScore(healthReport, benchmark.percentile, survival.months);

  // ── Runway Score trend (month-over-month) ─────────────────────────────
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const scoreDelta =
    runwayScoreSnapshot != null && runwayScoreSnapshot.month !== currentMonthKey
      ? runwayScore.score - runwayScoreSnapshot.score
      : null;

  // Persist full score breakdown to Supabase so mobile reads the same values.
  // Saves every time the score changes (not just once/month) for real-time parity.
  useEffect(() => {
    const snapshot = {
      score: runwayScore.score,
      grade: runwayScore.grade,
      // Canonical prose band — mobile reads this directly instead of
      // re-deriving from `score`. Parity-by-construction per
      // memory/spec_runway_score_canonical_bands.md §3.2.
      stateLabel: runwayScore.stateLabel,
      month: currentMonthKey,
      updated_at: new Date().toISOString(),
      components: runwayScore.components.map((c) => ({
        label: c.label,
        score: c.score,
        weight: c.weightValue,
      })),
    };
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      // Try up to 2 times (initial + 1 retry) to ensure mobile gets the score
      for (let attempt = 0; attempt < 2; attempt++) {
        const { error } = await supabase
          .from("user_settings")
          .update({ runway_score_snapshot: snapshot })
          .eq("user_id", user.id);
        if (!error) break;
        if (attempt === 0) {
          console.warn("Runway score snapshot save failed, retrying…", error.message);
          await new Promise((r) => setTimeout(r, 1000));
        } else {
          console.error("Runway score snapshot save failed after retry:", error.message);
        }
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runwayScore.score]);

  // ── Value-add metrics ─────────────────────────────────────────────────────
  // Marginal tax rate (combined federal + provincial at projected income level)
  const marginalTaxRate = settings
    ? marginalRate(netForTax, settings.province)
    : 0;

  // After-tax take-home per projected deal
  const afterTaxPerDeal =
    rawProjectedGCI > 0 && taxResult && projectedDealCount > 0
      ? (rawProjectedGCI - taxResult.totalBurden) / projectedDealCount
      : 0;

  // Break-even GCI: the gross income needed to cover all expenses + taxes, netting $0.
  // Uses iterative convergence — typically resolves in 3–5 iterations.
  const breakEvenGCI = (() => {
    if (!settings || annualExpenses <= 0) return 0;
    let guess = annualExpenses * 1.5;
    for (let i = 0; i < 15; i++) {
      const tax = calculateTax(guess, settings.province, 12).totalBurden;
      const next = annualExpenses + tax;
      if (Math.abs(next - guess) < 50) { guess = next; break; }
      guess = next;
    }
    return Math.round(guess);
  })();

  // ── Corporate tax estimate (incorporated users only) ──────────────────
  const corpTaxResult: CorporateTaxResult | null =
    settings?.is_incorporated
      ? calculateCorporateTax({
          corporateIncome: netForTax,
          province: settings.province,
          compensationMethod:
            (settings.compensation_method as "salary" | "dividends" | "mixed") ?? "salary",
          dealCount: Math.max(projectedDealCount, 1),
        })
      : null;

  // ── Tax Optimization Engine (top 3 for dashboard) ───────────────────
  const hasExpensesInCategory = (key: string) =>
    expenseCategories.some(
      (cat) => cat.key === key && cat.items.some((i) => Number(i.ytd_amount) > 0 || Number(i.monthly_recurring) > 0),
    );

  const taxOptResult = settings
    ? generateTaxOptimizations({
        netIncome: netForTax,
        projectedGCI,
        annualExpenses,
        dealCount: Math.max(projectedDealCount, 1),
        province: settings.province,
        experienceYears: settings.experience_years,
        isIncorporated: settings.is_incorporated,
        corpType: (settings.corp_type as "prec" | "general" | null) ?? null,
        compensationMethod: (settings.compensation_method as "salary" | "dividends" | "mixed") ?? "salary",
        homeOfficeSqFootage: settings.home_office_sq_footage,
        homeOfficeBusinessUsePct: settings.home_office_business_use_pct,
        homeOfficeRentMonthly: settings.home_office_rent_monthly,
        homeOfficeUtilitiesMonthly: settings.home_office_utilities_monthly,
        homeOfficePropertyTaxAnnual: settings.home_office_property_tax_annual,
        homeOfficeInsuranceMonthly: settings.home_office_insurance_monthly,
        homeOfficeMaintenanceAnnual: settings.home_office_maintenance_annual,
        homeOfficeCondoFeesMonthly: settings.home_office_condo_fees_monthly,
        vehicleType: (settings.vehicle_type as "own" | "lease" | "none") ?? "none",
        vehicleBusinessUsePct: settings.vehicle_business_use_pct,
        hasTrackedMileage: mileageKmTotal > 0,
        annualMileageKm: mileageKmTotal,
        gstHstRegistered: settings.gst_hst_registered,
        gstHstPaidOnExpenses: settings.gst_hst_paid_on_expenses,
        gstHstRemitted:
          settings.gst_hst_remitted_q1 +
          settings.gst_hst_remitted_q2 +
          settings.gst_hst_remitted_q3 +
          settings.gst_hst_remitted_q4,
        taxInstalmentsPaid:
          settings.tax_instalment_paid_q1 +
          settings.tax_instalment_paid_q2 +
          settings.tax_instalment_paid_q3 +
          settings.tax_instalment_paid_q4,
        cppInstalmentPaidYTD: settings.cpp_instalment_paid_ytd,
        hasProfDevExpenses: hasExpensesInCategory("education"),
        hasMarketingExpenses: hasExpensesInCategory("marketing"),
        hasClientGiftExpenses: expenseCategories.some(
          (cat) => cat.key === "marketing" && cat.items.some((i) => i.key === "marketing_gifts" && (Number(i.ytd_amount) > 0 || Number(i.monthly_recurring) > 0)),
        ),
        hasMealExpenses: hasExpensesInCategory("meals"),
        hasLicensingExpenses: hasExpensesInCategory("professional"),
        ccaAssetCount,
        dismissed: (settings.tax_opt_dismissed as string[]) ?? [],
      }, 3)
    : null;

  // ── Trend ─────────────────────────────────────────────────────────────
  const trend = trendDirection(transactions);

  // ── History / vs last year ────────────────────────────────────────────
  const lastYearItem = historyItems.find(h => h.year === currentYear - 1) ?? null;
  const lastYearAtThisPoint = lastYearItem ? lastYearItem.annual_gci * fraction : null;
  const vsLastYearGCI = lastYearAtThisPoint !== null ? ytdGCI - lastYearAtThisPoint : null;
  const lastYearDealAtThisPoint = lastYearItem
    ? Math.round(lastYearItem.annual_tx * fraction)
    : null;

  // ── Deal velocity: this quarter vs same quarter last year ─────────────
  const currentQ = Math.floor(now.getMonth() / 3); // 0-based
  const dealsThisQ = transactions.filter(tx => {
    const d = new Date(tx.date + "T12:00:00");
    return d.getFullYear() === currentYear && Math.floor(d.getMonth() / 3) === currentQ;
  }).length;
  const lastYearQDeals: number | null = lastYearItem?.quarter_tx?.[currentQ] ?? null;

  // ── Period recap (month boundary) ─────────────────────────────────────
  const periodRecap = getPeriodRecap(transactions, now);

  // ── Tax readiness ─────────────────────────────────────────────────────
  const monthsElapsed = now.getMonth() + 1; // 1-12
  const recommendedMonthlySave = taxResult ? taxResult.totalBurden / 12 : 0;
  const expectedSavedByNow = Math.round(recommendedMonthlySave * monthsElapsed);
  const quarterlyInstalment = taxResult ? taxResult.totalBurden / 4 : 0;

  // ── Insights ──────────────────────────────────────────────────────────
  const insightsLimit = 5;
  const insights = settings
    ? generateInsights({
        transactions,
        pipelineDeals,
        goalGCI,
        seasonalWeights,
        expensesYTD,
        monthlyRecurringExpenses: monthlyRecurring,
        capIsConfigured: (settings.post_cap_threshold_gci ?? 0) > 0,
        hasHitCap: (settings.post_cap_threshold_gci ?? 0) > 0 && ytdGCI >= settings.post_cap_threshold_gci,
        gciRemainingToCap: Math.max(0, (settings.post_cap_threshold_gci ?? 0) - ytdGCI),
        postCapAgentPct: settings.post_cap_agent_pct ?? 0,
        estimatedCapMonth: null,
        forecastReadiness: goalGCI > 0 ? 0.6 : 0,
        historyItems,
        runwayScore: runwayScore.score,
        runwayGrade: runwayScore.grade,
        runwayStateLabel: runwayScore.stateLabel,
        runwayWeakestLabel: healthReport.weakestLabel,
      }, insightsLimit)
    : [];

  // ── Health narrative ──────────────────────────────────────────────────
  const scoreNarrative = buildScoreNarrative(
    runwayScore, survival, paceStatus, pacePercent, healthReport,
  );
  const narrative = settings
    ? generateBusinessHealthNarrative({
        ytdGCI,
        goalGCI,
        fraction,
        projectedGCI,
        pipelineWeightedGCI,
        pipelineCount,
        survival,
        ytdDealCount,
        avgDealSize,
        paceStatus,
        paceGapAmount,
        pacePercent,
        runwayScore,
        healthReport,
        expenseRatio: ytdGCI > 0 ? expensesYTD / ytdGCI : 0,
        benchmark,
      })
    : null;

  // ── Greeting & streak ─────────────────────────────────────────────────
  const { greeting, emoji } = getTimeGreeting();
  const firstName = userName?.split(" ")[0] ?? null;
  const streakLabel = getStreakLabel(transactions);
  const motivationalTag = getMotivationalTag(paceStatus, ytdDealCount);

  // ── Smart alerts — only render when conditions are met ────────────────
  const smartAlerts: Array<{ type: "warning" | "danger" | "info"; icon: string; title: string; body: string }> = [];

  // Alert 1: Low cash runway (skip if not configured — don't scare new users)
  if (survival.riskLevel !== "notConfigured" && survival.months < 3) {
    smartAlerts.push({
      type: "danger",
      icon: "🔴",
      title: "Cash runway is critically low",
      body: `At current burn, your reserves cover ~${survival.months.toFixed(1)} months. Time to close some pipeline.`,
    });
  } else if (survival.riskLevel !== "notConfigured" && survival.months < 5) {
    smartAlerts.push({
      type: "warning",
      icon: "🟡",
      title: "Runway is getting thin",
      body: `~${survival.months.toFixed(1)} months of runway remaining. A few closes would extend it significantly.`,
    });
  }

  // Alert 2: Significantly behind pace
  if (pacePercent < -30 && goalGCI > 0) {
    const gap = goalGCI - ytdGCI;
    const dealsNeededForAlert = ytdDealCount > 0 && ytdGCI > 0 ? Math.ceil(gap / (ytdGCI / ytdDealCount)) : null;
    smartAlerts.push({
      type: "warning",
      icon: "⚠️",
      title: "Behind pace on your annual goal",
      body: `You're at ${(100 + pacePercent).toFixed(0)}% of expected pace. ${fmtCurrency(gap)} to go${dealsNeededForAlert !== null ? ` — ~${dealsNeededForAlert} more deals at your average size` : ""}.`,
    });
  }

  // Alert 3: High expense ratio
  const expenseRatioForAlert = ytdGCI > 0 ? expensesYTD / ytdGCI : 0;
  if (expenseRatioForAlert > 0.40 && ytdGCI > 0) {
    smartAlerts.push({
      type: "warning",
      icon: "💸",
      title: "Expense ratio is elevated",
      body: `Your costs are ${fmtPct(expenseRatioForAlert)} of GCI — above the 25–30% benchmark. Every dollar saved here goes straight to your net.`,
    });
  }

  // ── Personal Deviation Detection ─────────────────────────────────────
  const tier = experienceTier(settings?.experience_years);
  const baselines = useMemo(
    () => {
      const monthlyExpenses = monthlyRecurring;
      const monthlyGCIForRatio = fraction > 0 ? ytdGCI / (fraction * 12) : 0;
      return computeBaselines(transactions, [], monthlyExpenses, monthlyGCIForRatio);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [transactions.length, monthlyRecurring, ytdGCI, fraction],
  );
  const currentMonthlyGCI = fraction > 0 ? ytdGCI / (fraction * 12) : 0;
  const currentMonthlyDeals = fraction > 0 ? ytdDealCount / (fraction * 12) : 0;
  const currentExpenseRatio = ytdGCI > 0 ? expensesYTD / ytdGCI : 0;
  const deviations = useMemo(
    () => detectAllDeviations(baselines, currentMonthlyGCI, currentMonthlyDeals, currentExpenseRatio, 0),
    [baselines, currentMonthlyGCI, currentMonthlyDeals, currentExpenseRatio],
  );
  const deviationMessages = useMemo(
    () => generateDeviationInsights(deviations, tier),
    [deviations, tier],
  );

  // ── Confetti on goal milestone ────────────────────────────────────────
  // Fires once per session when the agent crosses 50%, 75%, or 100% of goal
  useEffect(() => {
    if (confettiFiredRef.current || goalGCI <= 0) return;
    const pct = ytdGCI / goalGCI;
    if (pct >= 1.0) {
      confettiFiredRef.current = true;
      fireConfetti("goal");
      toast.success("🎉 Number hit. Take five — then set a bigger one.", {
        duration: 6000,
        description: `${fmtCurrency(ytdGCI)} closed — incredible work.`,
      });
    } else if (pct >= 0.75) {
      confettiFiredRef.current = true;
      fireConfetti("milestone");
      toast("🏆 Three-quarters done. One good push and it's yours.", {
        duration: 5000,
        description: `${fmtCurrency(goalGCI - ytdGCI)} left to your target.`,
      });
    } else if (pct >= 0.5) {
      confettiFiredRef.current = true;
      fireConfetti("milestone");
      toast("⚡ Halfway. This is where reps become pros.", {
        duration: 4000,
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ytdGCI, goalGCI]);

  // ── Monthly chart data ────────────────────────────────────────────────
  const monthlyChartData: MonthlyDataPoint[] = buildMonthlyChartData(
    transactions,
    projectedGCI,
    seasonalWeights,
    currentYear,
    now,
  );

  const riskColors: Record<string, string> = {
    critical: "text-red-600",
    warning: "text-amber-600",
    healthy: "text-emerald-600",
    strong: "text-emerald-600",
    notConfigured: "text-muted-foreground",
  };

  // ── YTD Net Take-Home calculations ────────────────────────────────────
  // This answers "what do I actually keep?" — the most important dashboard metric.
  const ytdAgentGrossCalc = settings
    ? computeAgentGross(
        ytdGCI,
        settings.split_preset,
        settings.post_cap_threshold_gci,
        settings.post_cap_agent_pct,
        settings.post_cap_brokerage_pct,
      )
    : null;
  const ytdAgentGross = ytdAgentGrossCalc?.agentGross ?? ytdGCI;
  const ytdTxFees = settings ? computeTxFees(ytdGCI, settings.tx_fee_rate_pct, settings.tx_fee_annual_cap) : 0;
  const ytdBrokerageFeesTotal = settings ? settings.monthly_brokerage_fee * monthsElapsed : 0;
  const ytdNetBeforeTax = Math.max(0, ytdAgentGross - ytdTxFees - ytdBrokerageFeesTotal);
  // Prorated tax estimate (fraction of year elapsed)
  const ytdTaxSetAside = taxResult ? taxResult.totalBurden * Math.min(fraction, 1) : 0;
  const ytdEstimatedTakeHome = Math.max(0, ytdNetBeforeTax - ytdTaxSetAside);

  // ── Commission side mix (TransactionSide: "buyer" | "seller" | "both") ──
  const buyerDeals = transactions.filter(tx => tx.side === "buyer");
  const listingDeals = transactions.filter(tx => tx.side === "seller");
  const dualDeals = transactions.filter(tx => tx.side === "both");
  const buyerGCI = buyerDeals.reduce((s, tx) => s + computeGCI(tx), 0);
  const listingGCI = listingDeals.reduce((s, tx) => s + computeGCI(tx), 0);
  const dualGCI = dualDeals.reduce((s, tx) => s + computeGCI(tx), 0);

  // ── Pipeline by stage ────────────────────────────────────────────────
  const pipelineByStage = pipelineDeals.reduce<Record<string, number>>((acc, deal) => {
    const stage = (deal.stage ?? "lead") as string;
    acc[stage] = (acc[stage] ?? 0) + 1;
    return acc;
  }, {});

  // ── Cap progress ──────────────────────────────────────────────────────
  const capThreshold = settings?.post_cap_threshold_gci ?? 0;
  const capConfigured = capThreshold > 0;
  const capProgress = capConfigured ? Math.min((ytdGCI / capThreshold) * 100, 100) : 0;
  const hasHitCap = capConfigured && ytdGCI >= capThreshold;

  // ── Card render map — build all card JSX (null = card has no data to show) ──
  const cardRenders: Partial<Record<CardId, React.ReactNode>> = {};

  // ── Daily Briefing — comprehensive morning intelligence card ──────────
  const dailyBriefingPipelineLabel =
    activeClients === 0 ? "Empty" : activeClients <= 2 ? "Light" : `${activeClients} active`;
  const dailyBriefingPaceLabel =
    paceStatus === "ahead" ? "Ahead" : paceStatus === "behind" ? "Behind" : goalGCI > 0 ? "On track" : "";

  const _urgentBriefingItems = briefingItems.filter(i => i.severity === "urgent");
  const _attentionBriefingItems = briefingItems.filter(i => i.severity === "attention" || i.severity === "upcoming");
  const startHereItem = briefingItems[0] ?? null;

  const dateLabel = new Date().toLocaleDateString("en-CA", { weekday: "long", month: "long", day: "numeric" });

  // ── Captain's Morning Brief ─────────────────────────────────────────────────
  cardRenders["morning_brief"] = (() => {
    const staleItems = briefingItems.filter(i => i.type === "in_flight_stale");
    const pctOfGoal = goalGCI > 0 ? Math.round((ytdGCI / goalGCI) * 100) : null;
    const pctOfYear = Math.round(fraction * 100);
    return (
      <Card className="rounded-xl border-slate-200 bg-white shadow-sm overflow-hidden">
        {/* Captain accent header */}
        <div className="flex items-center gap-2 border-b border-blue-100 bg-blue-50/60 px-4 py-2.5">
          <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600/10">
            <Tailfin className="h-3 w-3 text-blue-600" />
          </div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-blue-600">Captain&apos;s Morning Brief</p>
          <span className="ml-auto text-[10px] text-slate-400">{dateLabel}</span>
        </div>

        {/* Data rows */}
        <div className="px-4 py-3 space-y-2">
          {/* Income */}
          <div className="flex gap-2.5 items-start">
            <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 shrink-0 w-16 pt-0.5">Income</span>
            <p className="text-xs text-slate-700 leading-snug">
              {goalGCI > 0 && pctOfGoal !== null ? (
                <>
                  <span className={cn("font-semibold", paceStatus === "ahead" ? "text-emerald-600" : paceStatus === "behind" ? "text-amber-700" : "text-slate-800")}>
                    {fmtCurrency(ytdGCI)}
                  </span>
                  {" of "}{fmtCurrency(goalGCI)} goal — {pctOfGoal}% earned, {pctOfYear}% through the year
                  {paceStatus !== "no-goal" && paceGapAmount !== 0 && (
                    <span className={cn("ml-1 font-medium", paceStatus === "ahead" ? "text-emerald-600" : "text-amber-700")}>
                      ({paceStatus === "ahead" ? "↑" : "↓"}{fmtCurrency(Math.abs(paceGapAmount))} vs pace)
                    </span>
                  )}
                </>
              ) : (
                <span className="font-semibold text-slate-800">{fmtCurrency(ytdGCI)} GCI this year</span>
              )}
            </p>
          </div>

          {/* Pipeline */}
          <div className="flex gap-2.5 items-start">
            <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 shrink-0 w-16 pt-0.5">Pipeline</span>
            <p className="text-xs text-slate-700 leading-snug">
              {pipelineCount > 0 ? (
                <>
                  <span className="font-semibold text-slate-800">{pipelineCount} deal{pipelineCount !== 1 ? "s" : ""}</span>
                  {" — "}{fmtCurrency(pipelineWeightedGCI)} weighted GCI in motion
                </>
              ) : (
                <span className="text-slate-500">No active pipeline — add deals in CRM</span>
              )}
            </p>
          </div>

          {/* Watch — stale active clients */}
          {staleItems.length > 0 && (
            <div className="flex gap-2.5 items-start">
              <span className="text-[10px] font-bold uppercase tracking-wide text-amber-600 shrink-0 w-16 pt-0.5">Watch</span>
              <p className="text-xs text-amber-700 leading-snug">
                {staleItems.length === 1 ? (
                  <><span className="font-semibold">{staleItems[0].clientName}</span> — {staleItems[0].daysValue}d since last contact</>
                ) : (
                  <><span className="font-semibold">{staleItems[0].clientName}</span> and {staleItems.length - 1} other{staleItems.length > 2 ? "s" : ""} — {staleItems[0].daysValue}+ days since contact</>
                )}
              </p>
            </div>
          )}

          {/* Runway */}
          {survival.monthlyBurn > 0 && (
            <div className="flex gap-2.5 items-start">
              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 shrink-0 w-16 pt-0.5">Runway</span>
              <p className={cn("text-xs leading-snug", survival.months < 3 ? "text-red-700 font-semibold" : survival.months < 5 ? "text-amber-700" : "text-slate-700")}>
                {survival.months < 1 ? "Less than 1 month" : `${survival.months.toFixed(1)} months`} of operating runway
              </p>
            </div>
          )}
        </div>
      </Card>
    );
  })();

  cardRenders["client_briefing"] = (smartAlerts.length > 0 || briefingItems.length > 0 || upcomingConditions.length > 0) ? (
    <div className="space-y-2">
      {/* Smart alerts (cash runway, pace, expenses) */}
      {smartAlerts.map((alert, i) => (
        <div
          key={i}
          className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${
            alert.type === "danger"
              ? "border-red-300 bg-white text-slate-800"
              : "border-amber-300 bg-white text-slate-800"
          }`}
        >
          <AlertTriangle className={`h-4 w-4 shrink-0 mt-0.5 ${alert.type === "danger" ? "text-red-500" : "text-amber-500"}`} />
          <div>
            <p className="font-medium">{alert.title}</p>
            <p className="text-xs mt-0.5 opacity-80">{alert.body}</p>
          </div>
        </div>
      ))}

      {/* Daily Briefing card */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        {/* Header */}
        <div className="px-4 pt-3 pb-2 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="h-3.5 w-3.5 text-slate-500 shrink-0" />
              <p className="text-xs font-semibold text-slate-800 uppercase tracking-wide">Daily Briefing</p>
            </div>
            <p className="text-[11px] text-slate-400">{dateLabel}</p>
          </div>
          {/* Status strip */}
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className={cn(
              "inline-flex items-center gap-1 rounded-full text-[10px] font-semibold px-2 py-0.5 border",
              activeClients === 0
                ? "bg-red-50 text-red-700 border-red-200"
                : activeClients <= 2
                  ? "bg-amber-50 text-amber-700 border-amber-200"
                  : "bg-green-50 text-green-700 border-green-200"
            )}>
              <Layers className="h-2.5 w-2.5" />
              Pipeline: {dailyBriefingPipelineLabel}
            </span>
            {dailyBriefingPaceLabel && (
              <span className={cn(
                "inline-flex items-center gap-1 rounded-full text-[10px] font-semibold px-2 py-0.5 border",
                paceStatus === "ahead"
                  ? "bg-green-50 text-green-700 border-green-200"
                  : paceStatus === "behind"
                    ? "bg-red-50 text-red-700 border-red-200"
                    : "bg-slate-50 text-slate-600 border-slate-200"
              )}>
                {paceStatus === "ahead" ? <TrendingUp className="h-2.5 w-2.5" /> : paceStatus === "behind" ? <TrendingDown className="h-2.5 w-2.5" /> : <Target className="h-2.5 w-2.5" />}
                Pace: {dailyBriefingPaceLabel}
              </span>
            )}
          </div>
        </div>

        {/* Start Here — primary action */}
        {startHereItem && (
          <div className="px-4 py-2.5 bg-slate-50/60 border-b border-slate-100">
            <div className="flex items-start gap-2">
              <Crosshair className="h-3.5 w-3.5 text-slate-600 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-0.5">Start here</p>
                <p className="text-xs font-medium text-slate-800 leading-snug">{startHereItem.title}</p>
                <p className="text-[11px] text-slate-500 leading-snug">{startHereItem.detail}</p>
              </div>
            </div>
          </div>
        )}

        {/* Condition dates this week */}
        {upcomingConditions.length > 0 && (
          <div className="px-4 py-2 border-b border-slate-100">
            <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider mb-1 flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              Condition dates
            </p>
            <div className="space-y-0.5">
              {upcomingConditions.map((c, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className={cn(
                    "h-1.5 w-1.5 rounded-full shrink-0",
                    c.days_until <= 1 ? "bg-red-500" : c.days_until <= 3 ? "bg-amber-500" : "bg-blue-400"
                  )} />
                  <p className="text-[11px] text-slate-700 truncate">
                    <span className="font-medium">{c.address}</span>
                    <span className="text-slate-400"> — {c.client_name} — </span>
                    <span className={cn(
                      "font-semibold",
                      c.days_until <= 1 ? "text-red-600" : c.days_until <= 3 ? "text-amber-600" : "text-slate-600"
                    )}>
                      {c.days_until === 0 ? "today" : c.days_until === 1 ? "tomorrow" : `in ${c.days_until}d`}
                    </span>
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Needs attention — remaining urgent + attention items */}
        {((startHereItem ? briefingItems.slice(1) : briefingItems).length > 0 || staleLeadCount > 0) && (
          <div className="px-4 py-2">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Needs attention
            </p>
            <div className="space-y-1">
              {(startHereItem ? briefingItems.slice(1) : briefingItems).slice(0, 5).map((item) => (
                <div key={item.id} className="flex items-start gap-2">
                  <span className={cn(
                    "mt-1 h-1.5 w-1.5 rounded-full shrink-0",
                    item.severity === "urgent" ? "bg-red-500" : item.severity === "attention" ? "bg-amber-500" : "bg-blue-400",
                  )} />
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium text-slate-700 leading-snug">{item.title}</p>
                    <p className="text-[10px] text-slate-400 leading-snug">{item.detail}</p>
                  </div>
                </div>
              ))}
              {staleLeadCount > 0 && (
                <div className="flex items-center gap-2 pt-0.5">
                  <Building2 className="h-3 w-3 text-amber-500 shrink-0" />
                  <p className="text-[11px] text-amber-700 font-medium">{staleLeadCount} clients need outreach</p>
                </div>
              )}
            </div>
            <div className="mt-2 pt-1.5 border-t border-slate-100">
              <Link href="/crm" className="text-[11px] text-slate-500 hover:text-slate-800 font-medium">
                View full briefing in CRM →
              </Link>
            </div>
          </div>
        )}

        {/* Empty state — no items at all */}
        {briefingItems.length === 0 && upcomingConditions.length === 0 && staleLeadCount === 0 && (
          <div className="px-4 py-3">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-3.5 w-3.5 text-green-500" />
              <p className="text-xs text-slate-500">All clear — no urgent actions today.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  ) : null;

  // ── Where You Stand — competitive position + market diagnosis ─────────
  cardRenders["where_you_stand"] = (() => {
    // Don't render if user has zero transactions — nothing to show
    if (ytdDealCount === 0) return null;

    const wys = whereYouStand;
    const bands: PerformanceBand[] = ["launching", "climbing", "competitive", "advancing", "leading"];

    const momentumIcon =
      wys.momentum === "gaining" ? <ArrowUpRight className="h-3.5 w-3.5" /> :
      wys.momentum === "losing" ? <ArrowDownRight className="h-3.5 w-3.5" /> :
      wys.momentum === "no_data" ? null :
      <Minus className="h-3.5 w-3.5" />;

    const momentumColor =
      wys.momentum === "gaining" ? "text-emerald-600" :
      wys.momentum === "losing" ? "text-amber-600" :
      "text-slate-500";

    return (
      <WhereYouStandCard
        wys={wys}
        bands={bands}
        momentumIcon={momentumIcon}
        momentumColor={momentumColor}
      />
    );
  })();

  cardRenders["business_brief"] = (() => {
    const hasPeriodRecap = periodRecap !== null;
    const hasNarrative = narrative !== null;
    if (!hasPeriodRecap && !hasNarrative) return null;
    return (
      <div className="space-y-4">
        {periodRecap && (
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-800">
                {periodRecap.monthName} recap — {fmtCurrency(periodRecap.monthGCI)} · {periodRecap.monthTx} deal{periodRecap.monthTx !== 1 ? "s" : ""}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                {periodRecap.vsAvg >= 1.2
                  ? `↑ ${Math.round((periodRecap.vsAvg - 1) * 100)}% above your monthly average`
                  : periodRecap.vsAvg <= 0.8 && periodRecap.vsAvg > 0
                  ? `↓ ${Math.round((1 - periodRecap.vsAvg) * 100)}% below your monthly average`
                  : "Right in line with your monthly average"}
              </p>
            </div>
            <CalendarCheck className="h-5 w-5 text-slate-400 shrink-0" />
          </div>
        )}
        {narrative && (
          <BusinessHealthNarrativeCard
            narrative={narrative}
            isOpen={narrativeOpen}
            onToggle={() => setNarrativeOpen((o) => !o)}
          />
        )}
      </div>
    );
  })();

  cardRenders["kpi_row"] = (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Card className="rounded-xl border-slate-200 bg-white shadow-sm py-3 gap-1 transition-all duration-200 hover:shadow-md">
        <CardHeader className="flex flex-row items-center justify-between pb-0 px-4">
          <CardDescription className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">YTD GCI</CardDescription>
          <DollarSign className="h-3.5 w-3.5 text-slate-400" />
        </CardHeader>
        <CardContent className="px-4 pt-0">
          <div className="text-lg font-bold tracking-tight text-slate-800">
            $<CountUp end={ytdGCI} decimals={0} duration={1000} />
          </div>
          {goalGCI > 0 ? (
            <>
              <p className="text-[11px] text-slate-500 leading-tight">
                {fmtPct(ytdGCI / goalGCI)} of {fmtCompact(goalGCI)} goal
              </p>
              {fraction > 0 && paceStatus !== "no-goal" && (
                <p className={cn(
                  "text-[11px] font-semibold leading-tight",
                  paceStatus === "ahead" ? "text-emerald-600" : "text-amber-600",
                )}>
                  {paceStatus === "ahead"
                    ? `↑ ${fmtCurrency(paceGapAmount)} ahead of pace`
                    : `↓ ${fmtCurrency(Math.abs(paceGapAmount))} behind pace`}
                </p>
              )}
            </>
          ) : (
            <p className="text-[11px] text-slate-400 leading-tight">Set a goal in Settings</p>
          )}
          {vsLastYearGCI !== null && ytdGCI > 0 && (
            <p className={cn("text-[11px] font-medium leading-tight", vsLastYearGCI >= 0 ? "text-emerald-600" : "text-amber-600")}>
              {vsLastYearGCI >= 0
                ? `↑ ${fmtCurrency(vsLastYearGCI)} vs last year`
                : `↓ ${fmtCurrency(Math.abs(vsLastYearGCI))} vs last year`}
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-xl border-slate-200 bg-white shadow-sm py-3 gap-1 transition-all duration-200 hover:shadow-md">
        <CardHeader className="flex flex-row items-center justify-between pb-0 px-4">
          <CardDescription className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Deals Closed</CardDescription>
          <Briefcase className="h-3.5 w-3.5 text-slate-400" />
        </CardHeader>
        <CardContent className="px-4 pt-0">
          <div className="text-lg font-bold tracking-tight text-slate-800">
            <CountUp end={ytdDealCount} duration={800} />
          </div>
          {ytdDealCount === 0 ? (
            <p className="text-[11px] text-slate-500 leading-tight">No deals yet — your first is the hardest</p>
          ) : (
            <p className="text-[11px] text-slate-500 flex items-center gap-1 leading-tight">
              <span className="flex items-center gap-1">
                Avg Deal Size
                <MetricInfo tip="Your total GCI divided by the number of closed deals this year." />
              </span>
              <span>· {fmtCurrency(avgDealSize)}</span>
            </p>
          )}
          {dealsThisQ > 0 && (
            <p className={cn("text-[11px] font-medium leading-tight",
              lastYearQDeals !== null
                ? dealsThisQ >= lastYearQDeals ? "text-emerald-600" : "text-amber-600"
                : "text-slate-500"
            )}>
              {dealsThisQ} deal{dealsThisQ !== 1 ? "s" : ""} this Q{currentQ + 1}
              {lastYearQDeals !== null ? ` · vs ${lastYearQDeals} last year` : ""}
            </p>
          )}
          {lastYearDealAtThisPoint !== null && ytdDealCount > 0 && (
            <p className="text-[11px] text-slate-400 leading-tight">
              vs {lastYearDealAtThisPoint} at this point last year
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-xl border-slate-200 bg-white shadow-sm py-3 gap-1 transition-all duration-200 hover:shadow-md">
        <CardHeader className="flex flex-row items-center justify-between pb-0 px-4">
          <CardDescription className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            <span className="flex items-center gap-1">
              Pipeline Weighted
              <MetricInfo tip="Your in-progress deals weighted by their probability of closing. A $50K deal at 60% odds counts as $30K here." />
            </span>
          </CardDescription>
          <TrendingUp className="h-3.5 w-3.5 text-slate-400" />
        </CardHeader>
        <CardContent className="px-4 pt-0">
          <div className="text-lg font-bold tracking-tight text-slate-800">
            {pipelineCount === 0 && listingCount === 0 ? "—" : <>$<CountUp end={pipelineWeightedGCI + listingWeightedGCI} duration={1000} /></>}
          </div>
          <p className="text-[11px] text-slate-500 leading-tight">
            {pipelineCount === 0 && listingCount === 0
              ? "Add prospects to see weighted forecasts"
              : `${pipelineCount} deal${pipelineCount !== 1 ? "s" : ""}${listingCount > 0 ? ` + ${listingCount} listing${listingCount !== 1 ? "s" : ""}` : ""} · probability-weighted`}
          </p>
        </CardContent>
      </Card>

      <Card className="rounded-xl border-slate-200 bg-white shadow-sm py-3 gap-1 transition-all duration-200 hover:shadow-md">
        <CardHeader className="flex flex-row items-center justify-between pb-0 px-4">
          <CardDescription className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            <span className="flex items-center gap-1">
              Projected Year-End
              <MetricInfo tip={seasonalSource === "agent"
                ? `Based on your ${historyItems.filter((h) => (h.quarter_gci as number[]).some((v) => (v ?? 0) > 0)).length}-year seasonal pattern.`
                : seasonalSource === "national"
                  ? "Based on national seasonal averages."
                  : "Using uniform seasonality — add history to improve."} />
            </span>
          </CardDescription>
          <Target className="h-3.5 w-3.5 text-slate-400" />
        </CardHeader>
        <CardContent className="px-4 pt-0">
          <div className="text-lg font-bold tracking-tight">
            $<CountUp end={projectedGCI} duration={1100} />
          </div>
          <div className="flex items-center gap-1.5">
            <Badge
              className="text-[10px] px-1.5 py-0"
              variant={
                paceStatus === "ahead"
                  ? "default"
                  : paceStatus === "behind"
                    ? "destructive"
                    : "secondary"
              }
            >
              {paceStatus === "ahead"
                ? `+${Math.round(pacePercent)}% ahead`
                : paceStatus === "behind"
                  ? `${Math.round(pacePercent)}% behind`
                  : "Set a goal"}
            </Badge>
            {trend !== "flat" && (
              <Badge variant="secondary" className="gap-0.5 text-[10px] px-1.5 py-0">
                {trend === "up" ? (
                  <TrendingUp className="h-2.5 w-2.5" />
                ) : (
                  <TrendingDown className="h-2.5 w-2.5" />
                )}
                {trend}
              </Badge>
            )}
          </div>
          {goalGCI > 0 && avgDealSize > 0 && ytdGCI < goalGCI && (
            <p className="text-[11px] text-muted-foreground leading-tight">
              ~{Math.ceil((goalGCI - ytdGCI) / avgDealSize)} more deal
              {Math.ceil((goalGCI - ytdGCI) / avgDealSize) !== 1 ? "s" : ""} at avg size to hit goal
            </p>
          )}
          {goalGCI > 0 && ytdGCI >= goalGCI && (
            <p className="text-[11px] font-semibold shimmer-text leading-tight">
              🎉 Goal reached — you crushed it!
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );

  cardRenders["net_takehome"] = (ytdGCI > 0 && settings) ? (
    <Card className="rounded-xl border-emerald-200 bg-white shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-1.5">
            <CardTitle className="text-base">Net Take-Home (YTD Est.)</CardTitle>
            <MetricInfo tip="Your gross GCI after brokerage split, transaction fees, monthly brokerage costs, and estimated income tax — approximately what you actually keep." />
            {isPro && <ExplainButton question="Break down my net take-home calculation — what am I actually keeping from each deal this year?" />}
          </div>
          <Link href="/forecast" className="text-xs text-emerald-700 hover:text-emerald-900 font-medium transition-colors">
            Full tax breakdown →
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-6 items-start">
          <div>
            <p className="text-3xl font-bold text-emerald-800">
              {fmtCurrency(ytdEstimatedTakeHome)}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">after splits, fees &amp; estimated tax</p>
          </div>
          <div className="flex flex-wrap gap-5 text-sm">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Agent Net (pre-tax)</p>
              <p className="font-bold text-slate-700 mt-0.5">{fmtCurrency(ytdNetBeforeTax)}</p>
              <p className="text-[10px] text-slate-400">after split &amp; fees</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Est. Tax Owed</p>
              <p className="font-bold text-amber-700 mt-0.5">{fmtCurrency(ytdTaxSetAside)}</p>
              <p className="text-[10px] text-slate-400">based on YTD net</p>
            </div>
            {ytdDealCount > 0 && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Per Deal</p>
                <p className="font-bold text-emerald-700 mt-0.5">{fmtCurrency(ytdEstimatedTakeHome / ytdDealCount)}</p>
                <p className="text-[10px] text-slate-400">actual take-home</p>
              </div>
            )}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-slate-400 border-t border-emerald-100 pt-2.5">
          <span>Split: {settings.split_preset ?? "custom"}</span>
          {settings.monthly_brokerage_fee > 0 && <span>Monthly fee: {fmtCurrency(settings.monthly_brokerage_fee)}/mo × {monthsElapsed}mo</span>}
          {ytdTxFees > 0 && <span>Tx fees: {fmtCurrency(ytdTxFees)}</span>}
          <span className="italic">{CANONICAL_TAX_DISCLAIMER_SHORT}</span>
        </div>
      </CardContent>
    </Card>
  ) : null;

  cardRenders["personal_records"] = (transactions.length > 0 || historyItems.length > 0) ? (
    <PersonalRecordsCard
      transactions={transactions}
      historyItems={historyItems}
      ytdGCI={ytdGCI}
      currentYear={currentYear}
    />
  ) : null;

  cardRenders["commission_mix"] = (ytdDealCount > 0 || pipelineCount > 0) ? (
    <div className="grid gap-4 sm:grid-cols-2">
      {ytdDealCount > 0 && (
        <Card className="rounded-xl border-slate-200 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-1.5">
              <CardTitle className="text-sm font-semibold">Commission Mix</CardTitle>
              <MetricInfo tip="How your closed GCI breaks down by transaction side — buyer, listing, or dual-ended. Knowing your mix helps identify where your business actually comes from." />
              {isPro && <ExplainButton question="Analyze my commission mix — am I over-reliant on one side and what does that mean for my business?" />}
            </div>
            <CardDescription>Buyer vs. listing side · YTD</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {buyerGCI > 0 && (
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-500 font-medium">Buyer</span>
                  <span className="font-semibold text-slate-700">{fmtCurrency(buyerGCI)} · {buyerDeals.length} deal{buyerDeals.length !== 1 ? "s" : ""}</span>
                </div>
                <Progress value={ytdGCI > 0 ? (buyerGCI / ytdGCI) * 100 : 0} className="h-1.5 [&>div]:bg-blue-500" />
              </div>
            )}
            {listingGCI > 0 && (
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-500 font-medium">Seller / Listing</span>
                  <span className="font-semibold text-slate-700">{fmtCurrency(listingGCI)} · {listingDeals.length} deal{listingDeals.length !== 1 ? "s" : ""}</span>
                </div>
                <Progress value={ytdGCI > 0 ? (listingGCI / ytdGCI) * 100 : 0} className="h-1.5 [&>div]:bg-violet-500" />
              </div>
            )}
            {dualGCI > 0 && (
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-500 font-medium">Both / Double-ended</span>
                  <span className="font-semibold text-slate-700">{fmtCurrency(dualGCI)} · {dualDeals.length} deal{dualDeals.length !== 1 ? "s" : ""}</span>
                </div>
                <Progress value={ytdGCI > 0 ? (dualGCI / ytdGCI) * 100 : 0} className="h-1.5 [&>div]:bg-emerald-500" />
              </div>
            )}
            {buyerGCI === 0 && listingGCI === 0 && dualGCI === 0 && (
              <p className="text-xs text-muted-foreground py-2">
                No side data recorded yet. Tag each deal as buyer, seller, or both on the Transactions page.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {pipelineCount > 0 && (
        <Card className="rounded-xl border-slate-200 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <CardTitle className="text-sm font-semibold">Pipeline Snapshot</CardTitle>
                <MetricInfo tip="A count of active deals by pipeline stage. Seeing where deals cluster helps you spot bottlenecks before they cost you closings." />
                {isPro && <ExplainButton question="Analyze my pipeline stages — are there any bottlenecks I should address to close more deals?" />}
              </div>
              <Link href="/pipeline" className="text-xs text-muted-foreground hover:text-foreground font-medium transition-colors">
                View all →
              </Link>
            </div>
            <CardDescription>{pipelineCount} active deal{pipelineCount !== 1 ? "s" : ""} · {fmtCurrency(pipelineWeightedGCI)} weighted</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {PIPELINE_STAGE_CONFIG.map(stage => {
                const count = pipelineByStage[stage.key] ?? 0;
                if (count === 0) return null;
                return (
                  <div key={stage.key} className={cn("flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium", stage.chipClass)}>
                    <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", stage.dotClass)} />
                    <span>{stage.label}</span>
                    <span className="font-bold ml-0.5">{count}</span>
                  </div>
                );
              })}
              {Object.entries(pipelineByStage)
                .filter(([key]) => !PIPELINE_STAGE_CONFIG.some(s => s.key === key))
                .map(([key, count]) => (
                  <div key={key} className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600">
                    <span className="h-1.5 w-1.5 rounded-full bg-slate-400 shrink-0" />
                    <span className="capitalize">{key}</span>
                    <span className="font-bold ml-0.5">{count}</span>
                  </div>
                ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Probability-weighted value includes deal confidence %. <Link href="/pipeline" className="text-primary hover:underline">Manage pipeline →</Link>
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  ) : null;

  cardRenders["cap_progress"] = capConfigured ? (
    <Card className="rounded-xl border-violet-200 bg-white shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-1.5">
            <CardTitle className="text-sm font-semibold">Cap Progress</CardTitle>
            <MetricInfo tip={`Your commission cap is ${fmtCurrency(capThreshold)}. After hitting cap, you keep ${settings ? fmtPct(settings.post_cap_agent_pct) : ""} of each deal's GCI — often 100% — instead of your normal split. Hitting cap is one of the highest-leverage moments in an agent's year.`} />
            {isPro && <ExplainButton question="How close am I to my commission cap and what's my projected take-home once I hit it?" />}
          </div>
          {hasHitCap && (
            <span className="rounded-full bg-violet-200 text-violet-800 border border-violet-300 text-[11px] font-bold px-2.5 py-0.5">
              🎉 Cap Hit!
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <Progress value={capProgress} className="h-2.5 [&>div]:bg-violet-500" />
        <div className="flex justify-between text-xs text-slate-500 mt-1.5">
          <span>$0</span>
          <span className="font-semibold text-slate-700">
            {fmtPct(capProgress / 100)} — {fmtCurrency(ytdGCI)} of {fmtCurrency(capThreshold)}
          </span>
          <span>{fmtCompact(capThreshold)}</span>
        </div>
        {!hasHitCap ? (
          <p className="mt-2 text-xs text-slate-600">
            <span className="font-medium">{fmtCurrency(Math.max(0, capThreshold - ytdGCI))} to cap</span>
            {settings && settings.post_cap_agent_pct > 0 && (
              <> — then you keep <span className="font-semibold text-violet-700">{fmtPct(settings.post_cap_agent_pct)}</span> per deal (vs. your current split)</>
            )}
          </p>
        ) : (
          <p className="mt-2 text-xs font-medium text-violet-700">
            Every dollar you close now earns you {settings ? fmtPct(settings.post_cap_agent_pct) : "a higher rate"} — you&apos;re in your highest-earning window. Push hard.
          </p>
        )}
      </CardContent>
    </Card>
  ) : null;

  cardRenders["tasks"] = (() => {
    if (localTasks.length === 0 && staleLeadCount === 0) return null;
    const _now = new Date();
    const todayStr = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, "0")}-${String(_now.getDate()).padStart(2, "0")}`;
    const overdue  = localTasks.filter((t) => t.due_date < todayStr);
    const dueToday = localTasks.filter((t) => t.due_date === todayStr);
    const upcoming = localTasks.filter((t) => t.due_date > todayStr).slice(0, 3);
    const shown    = [...overdue, ...dueToday, ...upcoming].slice(0, 5);
    return (
      <Card className="rounded-xl border-slate-200 bg-white shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold text-slate-800 flex items-center gap-2">
              <CheckSquare className="h-4 w-4 text-slate-500" />
              Follow-up Tasks
            </CardTitle>
            <Link href="/crm" className="text-xs text-slate-500 hover:text-slate-800 hover:underline font-medium">
              View all →
            </Link>
          </div>
          {(overdue.length > 0 || staleLeadCount > 0) && (
            <div className="flex items-center gap-2 mt-1">
              {overdue.length > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-red-100 text-red-700 text-[11px] font-semibold px-2.5 py-0.5 border border-red-200">
                  <AlertTriangle className="h-3 w-3" />
                  {overdue.length} overdue
                </span>
              )}
              {staleLeadCount > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-700 text-[11px] font-semibold px-2.5 py-0.5 border border-amber-200">
                  <Building2 className="h-3 w-3" />
                  {staleLeadCount} need outreach
                </span>
              )}
            </div>
          )}
        </CardHeader>
        <CardContent className="pt-0 space-y-1.5">
          {shown.map((task) => {
            const isOverdue = task.due_date < todayStr;
            const isToday   = task.due_date === todayStr;
            const dateLabel = isOverdue ? `Overdue · ${task.due_date}`
                            : isToday   ? "Due today"
                            : task.due_date;
            return (
              <div key={task.id} className="flex items-center gap-2.5 rounded-lg bg-white/60 px-3 py-2">
                <button
                  onClick={() => completeTaskFromDashboard(task.id)}
                  className="text-muted-foreground hover:text-emerald-600 transition-colors shrink-0"
                  title="Mark complete"
                >
                  <Square className="h-4 w-4" />
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{task.title}</p>
                  <p className={cn("text-[11px]", isOverdue ? "text-red-600 font-semibold" : isToday ? "text-amber-700 font-medium" : "text-muted-foreground")}>
                    {dateLabel}
                  </p>
                </div>
                <span className={cn(
                  "text-[10px] font-semibold border rounded-full px-2.5 py-0.5 shrink-0",
                  task.priority === "high"   ? "bg-red-50 text-red-700 border-red-200"
                  : task.priority === "low"  ? "bg-gray-50 text-gray-600 border-gray-200"
                  : "bg-blue-50 text-blue-700 border-blue-200",
                )}>
                  {task.priority}
                </span>
              </div>
            );
          })}
          {localTasks.length > 5 && (
            <p className="text-xs text-slate-500 text-center pt-1">
              +{localTasks.length - 5} more tasks —{" "}
              <Link href="/crm" className="underline font-medium text-slate-700">view all in CRM</Link>
            </p>
          )}
          {localTasks.length === 0 && staleLeadCount > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-center">
              <p className="text-sm font-semibold text-amber-800">{staleLeadCount} contact{staleLeadCount !== 1 ? "s" : ""} need outreach</p>
              <p className="text-xs text-amber-700 mt-0.5">No scheduled tasks — <Link href="/crm" className="underline font-medium">review in CRM →</Link></p>
            </div>
          )}
        </CardContent>
      </Card>
    );
  })();

  cardRenders["insights"] = insights.length > 0 ? (
    <div className="space-y-4">
      <div className="rounded-xl border-2 border-primary/20 bg-primary/5 px-4 py-3 flex items-start gap-3">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 mt-0.5">
          <Zap className="h-3.5 w-3.5 text-primary" />
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-primary mb-0.5">Top Priority Action</p>
          <p className="text-sm font-semibold text-foreground">{insights[0].title}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{insights[0].message}</p>
        </div>
      </div>
      {insights.length > 1 && (
        <Card className="rounded-xl border-slate-200 bg-white shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100">
                <Sparkles className="h-3.5 w-3.5 text-slate-500" />
              </div>
              <CardTitle className="text-base">Insights</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {insights.slice(1).map((insight) => (
                <InsightRow key={insight.id} insight={insight} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  ) : null;

  cardRenders["trends"] = (
    <Card className="rounded-xl border-slate-200 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Monthly Performance</CardTitle>
            <CardDescription>
              Closed GCI by month &mdash; projected months shown lighter
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <MonthlyChart data={monthlyChartData} />
      </CardContent>
    </Card>
  );

  cardRenders["probability"] = (
    <div className="grid gap-4 sm:grid-cols-2">
      <Card className="rounded-xl border-slate-200 bg-white shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-1.5">
            <CardTitle className="text-base">Projection Range</CardTitle>
            <GuideLink anchor="probability-bands" label="Probability bands explained in Guide" />
            {isPro && <ExplainButton question="Explain my projection range — what would I need to do differently to reach the upside scenario?" />}
          </div>
          <CardDescription>
            {bands.confidence} confidence &middot; {bands.monthsOfData} months of data
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-lg bg-white/80 border border-blue-200 px-3.5 py-3">
            <p className="text-sm font-medium text-blue-900 leading-snug">
              Your year-end GCI is most likely to fall between{" "}
              <span className="font-bold">{fmtCurrency(bands.p25)}</span> and{" "}
              <span className="font-bold">{fmtCurrency(bands.p75)}</span>
            </p>
            <p className="text-xs text-blue-700 mt-1">
              That&apos;s the 50% confidence window — there&apos;s a 1-in-10 chance you&apos;ll exceed{" "}
              <span className="font-semibold">{fmtCurrency(bands.p90)}</span>
            </p>
          </div>
          <div className="grid grid-cols-1 gap-2 text-center sm:grid-cols-3">
            <div className="rounded-md border border-blue-100 bg-white/50 px-2 py-2">
              <p className="text-[10px] font-semibold uppercase text-slate-400 tracking-wide">Downside</p>
              <p className="text-base font-bold text-slate-700 mt-0.5">{fmtCompact(bands.p10)}</p>
              <p className="text-[10px] text-slate-400">1-in-10 scenario</p>
            </div>
            <div className="rounded-md border border-blue-300 bg-blue-50 px-2 py-2">
              <p className="text-[10px] font-semibold uppercase text-blue-600 tracking-wide">Base</p>
              <p className="text-base font-bold text-slate-800 mt-0.5">{fmtCompact(bands.p50)}</p>
              <p className="text-[10px] text-blue-500">most likely</p>
            </div>
            <div className="rounded-md border border-blue-100 bg-white/50 px-2 py-2">
              <p className="text-[10px] font-semibold uppercase text-slate-400 tracking-wide">Upside</p>
              <p className="text-base font-bold text-slate-700 mt-0.5">{fmtCompact(bands.p90)}</p>
              <p className="text-[10px] text-slate-400">exceptional year</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-xl border-slate-200 bg-white shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-1.5">
            <CardTitle className="text-base">Benchmark</CardTitle>
            <GuideLink anchor="benchmark" label="Benchmark cohorts explained in Guide" />
          </div>
          <CardDescription>
            vs. {COHORT_LABELS[benchmark.cohort]} cohort · industry estimate
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div>
              <div className="mb-1 flex justify-between text-sm">
                <span>Cohort percentile</span>
                <span className="font-medium">P{benchmark.percentile}</span>
              </div>
              <Progress value={benchmark.percentile} className="h-2" />
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Cohort median GCI</span>
              <span>{fmtCurrency(benchmark.cohortMedianGCI)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">vs Established Agents</span>
              <span>P{benchmark.nationalPercentile}</span>
            </div>
            {benchmark.distanceToNextTier != null && benchmark.distanceToNextTier > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">
                  Gap to {benchmark.nextTierLabel}
                </span>
                <span>{fmtCurrency(benchmark.distanceToNextTier)}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );

  cardRenders["tax_planning"] = (() => {
    if (!taxResult && goalGCI <= 0) return null;
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        {taxResult && (
          <Card className="rounded-xl border-amber-200 bg-white shadow-sm">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-1.5">
                    <CardTitle className="text-base">Tax Readiness</CardTitle>
                    <GuideLink anchor="tax-estimate" label="Tax estimate explained in Guide" />
                  </div>
                  <CardDescription>
                    {taxResult.taxYear} · {PROVINCE_LABELS[settings!.province]} · {fmtPct(taxResult.effectiveRate)} effective rate
                  </CardDescription>
                </div>
                <span className={cn(
                  "rounded-full px-2.5 py-0.5 text-xs font-semibold border",
                  monthsElapsed <= 3
                    ? "bg-blue-100 text-blue-800 border-blue-200"
                    : monthsElapsed <= 6
                    ? "bg-amber-200 text-amber-900 border-amber-300"
                    : "bg-amber-100 text-amber-800 border-amber-200"
                )}>
                  {monthsElapsed <= 3 ? "Q1 in progress" : monthsElapsed <= 6 ? "Q2 in progress" : monthsElapsed <= 9 ? "Q3 in progress" : "Q4 — year-end"}
                </span>
              </div>
            </CardHeader>
            <CardContent>
              <div className="mb-3">
                <p className="text-2xl font-bold text-slate-800">{fmtCurrency(taxResult.totalBurden)}</p>
                <p className="text-xs text-slate-500">estimated total owed at year-end</p>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between items-center rounded-md bg-amber-200/60 px-3 py-1.5">
                  <span className="text-amber-900 font-medium">Monthly allocation pace</span>
                  <span className="font-bold text-amber-900">{fmtCurrency(recommendedMonthlySave)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">YTD allocation pace</span>
                  <span className="font-medium">{fmtCurrency(expectedSavedByNow)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Quarterly instalment</span>
                  <span>{fmtCurrency(quarterlyInstalment)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Per-deal tax portion</span>
                  <span>{fmtCurrency(taxResult.perDealSetAside)}</span>
                </div>
                {marginalTaxRate > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Marginal rate</span>
                    <span>{fmtPct(marginalTaxRate)}</span>
                  </div>
                )}
                {afterTaxPerDeal > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Take-home / deal</span>
                    <span className="font-medium text-emerald-700">{fmtCurrency(afterTaxPerDeal)}</span>
                  </div>
                )}
                {breakEvenGCI > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Break-even GCI</span>
                    <span>{fmtCurrency(breakEvenGCI)}/yr</span>
                  </div>
                )}
              </div>
              <p className="mt-3 text-[10px] text-amber-700/70 leading-relaxed">
                {CANONICAL_TAX_DISCLAIMER_SHORT}
              </p>
            </CardContent>
          </Card>
        )}

        {goalGCI > 0 && (
          <Card className="rounded-xl border-emerald-200 bg-white shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Goal Progress</CardTitle>
              <CardDescription>
                {fmtCurrency(ytdGCI)} of {fmtCurrency(goalGCI)} ({fmtPct(gciProgress / 100)})
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Progress value={gciProgress} className="h-2.5 [&>div]:bg-emerald-500" />
              <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                <span>$0</span>
                <span>{fmtCompact(goalGCI)}</span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {daysRemaining()} days remaining
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    );
  })();

  cardRenders["corp_tax"] = (corpTaxResult && settings) ? (
    <Card className="rounded-xl border-slate-200 bg-white shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-slate-500" />
            <div>
              <CardTitle className="text-base">Corporate Tax Estimate</CardTitle>
              <CardDescription>
                {settings.corp_type === "prec" ? "PREC" : "Corporation"} &middot; {PROVINCE_LABELS[settings.province]} &middot; {fmtPct(corpTaxResult.totalCorpRate)} corp rate
              </CardDescription>
            </div>
          </div>
          <span className={cn(
            "rounded-full px-2.5 py-0.5 text-xs font-semibold border",
            corpTaxResult.taxSavingVsSoleProp >= 0
              ? "bg-emerald-100 text-emerald-800 border-emerald-200"
              : "bg-red-100 text-red-800 border-red-200"
          )}>
            {corpTaxResult.taxSavingVsSoleProp >= 0
              ? `Saves ${fmtCompact(corpTaxResult.taxSavingVsSoleProp)} vs solo`
              : `Costs ${fmtCompact(Math.abs(corpTaxResult.taxSavingVsSoleProp))} vs solo`}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-3">
          <p className="text-2xl font-bold text-slate-800">{fmtCurrency(corpTaxResult.totalCombinedTax)}</p>
          <p className="text-xs text-slate-500">combined corp + personal tax at year-end</p>
        </div>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between items-center rounded-md bg-slate-100 px-3 py-1.5">
            <span className="text-slate-800 font-medium">Corporate tax ({fmtPct(corpTaxResult.totalCorpRate)})</span>
            <span className="font-bold text-slate-800">{fmtCurrency(corpTaxResult.corporateTax)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">After-tax corp income</span>
            <span className="font-medium">{fmtCurrency(corpTaxResult.afterTaxCorporateIncome)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground capitalize">
              Personal tax ({settings.compensation_method ?? "salary"})
            </span>
            <span>{fmtCurrency(corpTaxResult.totalPersonalTax)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Combined effective rate</span>
            <span>{fmtPct(corpTaxResult.combinedEffectiveRate)}</span>
          </div>
        </div>
        {corpTaxResult.optimalSaving > 500 &&
          corpTaxResult.optimalMethod !== settings.compensation_method && (
          <div className="mt-3 rounded-md bg-slate-50 border border-slate-200 px-3 py-2">
            <p className="text-xs text-slate-700 font-medium">
              💡 Switching to {corpTaxResult.optimalMethod === "salary" ? "salary" : "dividends"} could save ~{fmtCurrency(corpTaxResult.optimalSaving)}/yr at your income level. Talk to your accountant before changing compensation structure.
            </p>
          </div>
        )}
        {corpTaxResult.passiveIncomeWarning && (
          <div className="mt-2 rounded-md bg-amber-100 border border-amber-200 px-3 py-2">
            <p className="text-xs text-amber-800 font-medium">
              ⚠️ Passive income exceeds $50K — SBD limit reduced by {fmtCurrency(corpTaxResult.sbdReductionAmount)}
            </p>
          </div>
        )}
        <p className="mt-3 text-[10px] text-slate-400 leading-relaxed">
          {CANONICAL_TAX_DISCLAIMER_SHORT}
        </p>
      </CardContent>
    </Card>
  ) : null;

  cardRenders["tax_savings"] = (taxOptResult && taxOptResult.cardCount > 0) ? (
    <Card className="rounded-xl border-slate-200 bg-white shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Tax Deduction Estimates</CardTitle>
            <CardDescription>
              Estimated ~{fmtCurrency(taxOptResult.totalEstimatedSavings)}/yr in potential savings
            </CardDescription>
          </div>
          <Link
            href="/forecast"
            className="text-xs text-slate-500 hover:text-slate-800 font-medium transition-colors shrink-0"
          >
            See all on Forecast →
          </Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-[10px] text-slate-400 leading-relaxed italic">
          {CANONICAL_TAX_DISCLAIMER_SHORT}
        </p>
        {taxOptResult.cards.map((card: TaxOptimizationCard) => (
          <div key={card.id} className="rounded-lg border border-slate-100 bg-white p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold truncate">{card.title}</p>
              <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs shrink-0 font-semibold">
                {card.estimatedSavingsLabel}
              </Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{card.action}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  ) : null;

  cardRenders["recent_activity"] = (
    <Card className="rounded-xl border-slate-200 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">Recent Transactions</CardTitle>
        <CardDescription>
          {ytdDealCount === 0
            ? "No closed deals yet this year"
            : `Showing latest ${Math.min(ytdDealCount, 5)} of ${ytdDealCount}`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {transactions.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No transactions yet. Add your first deal to get started.
          </p>
        ) : (
          <div className="space-y-3">
            {transactions.slice(0, 5).map((tx) => (
              <div
                key={tx.id}
                className="flex items-center justify-between rounded-lg border p-3"
              >
                <div>
                  <p className="text-sm font-medium">
                    {tx.address || "No address"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {tx.client_name || "\u2014"} &middot;{" "}
                    {tx.date}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold">
                    {fmtCurrency(computeGCI(tx))}
                  </p>
                  <Badge variant="secondary" className="text-xs capitalize">
                    {tx.side}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );

  // ── Time Value card ────────────────────────────────────────────────────────
  const weeklyHours = settings?.estimated_weekly_hours;
  cardRenders["time_value"] = weeklyHours && weeklyHours > 0 && projectedGCI > 0 ? (() => {
    const projectedAnnualNet = taxResult
      ? Math.max(0, projectedNet - annualExpenses - taxResult.totalBurden)
      : Math.max(0, projectedNet - annualExpenses);
    const tv = computeTimeValue({
      estimatedWeeklyHours: weeklyHours,
      vacationWeeks: settings?.vacation_weeks_per_year ?? 0,
      ytdGCI,
      ytdNetIncome: ytdEstimatedTakeHome,
      projectedAnnualNet,
      projectedAnnualGCI: projectedGCI,
      dealCount: ytdDealCount,
      annualExpenses,
      yearFractionElapsed: fraction,
    });
    return (
      <Card className="rounded-xl border-slate-200 bg-white shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-1.5">
            <Clock className="h-4 w-4 text-blue-600" />
            <CardTitle className="text-base">Time Value</CardTitle>
            <MetricInfo tip="Based on your self-reported weekly hours and projected annual income. Update your hours in Settings → Runway Inputs." />
          </div>
          <CardDescription>What your time is worth</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-6 items-start">
            <div>
              <p className="text-3xl font-bold text-blue-700">
                {fmtCurrency(tv.effectiveHourlyRate)}<span className="text-base font-medium text-slate-400">/hr</span>
              </p>
              <p className="text-xs text-slate-500 mt-0.5">effective hourly rate (net)</p>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
              <span className="text-slate-500">Gross rate</span>
              <span className="font-semibold text-right">{fmtCurrency(tv.grossHourlyRate)}/hr</span>
              {ytdDealCount > 0 && (
                <>
                  <span className="text-slate-500">Hours/deal</span>
                  <span className="font-semibold text-right">{tv.hoursPerDeal}h</span>
                  <span className="text-slate-500">Net/deal-hour</span>
                  <span className="font-semibold text-right">{fmtCurrency(tv.netPerDealHour)}</span>
                </>
              )}
              {tv.breakEvenDealCount > 0 && (
                <>
                  <span className="text-slate-500">Break-even deals</span>
                  <span className="font-semibold text-right">{tv.breakEvenDealCount}</span>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  })() : settings && !weeklyHours ? (
    <Card className="rounded-xl border-slate-200 bg-white shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-1.5">
          <Clock className="h-4 w-4 text-slate-400" />
          <CardTitle className="text-base">Time Value</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-slate-500">
          Set your average weekly hours in{" "}
          <Link href="/settings" className="text-blue-600 font-medium hover:underline">
            Settings → Runway Inputs
          </Link>{" "}
          to see your effective hourly rate and time-value metrics.
        </p>
      </CardContent>
    </Card>
  ) : null;

  // ── Cards moved to dedicated pages — set to null so they are skipped ──────
  // Monthly Performance chart, Commission Mix+Pipeline, Personal Records → Altimeter
  // Tax Readiness, Goal Progress, Net Take-Home, Cap Progress → Overhead
  cardRenders["trends"]           = null;
  cardRenders["commission_mix"]   = null;
  cardRenders["personal_records"] = null;
  cardRenders["tax_planning"]     = null;
  cardRenders["net_takehome"]     = null;
  cardRenders["cap_progress"]     = null;

  return (
    <div className="space-y-6">
      {/* Annual Review Modal */}
      {showAnnualReview && (
        <AnnualReview
          year={currentYear}
          ytdGCI={ytdGCI}
          goalGCI={goalGCI}
          dealCount={ytdDealCount}
          avgDealSize={avgDealSize}
          benchmarkPercentile={benchmark.percentile}
          projectedGCI={projectedGCI}
          onClose={() => setShowAnnualReview(false)}
        />
      )}

      {/* Upgrade success banner */}
      {showUpgradeBanner && !bannerDismissed && (
        <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <Sparkles className="h-4 w-4 shrink-0 text-emerald-600" />
            <p className="text-sm font-medium text-emerald-800">
              Welcome to Professional! Your 14-day free trial has started — all Pro features are now unlocked.
            </p>
          </div>
          <button
            onClick={() => setBannerDismissed(true)}
            aria-label="Dismiss"
            className="ml-4 shrink-0 text-emerald-500 hover:text-emerald-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Team welcome banner for new members */}
      {teamWelcome && !bannerDismissed && (
        <div className="rounded-xl border border-orange-200 bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-950/30 dark:to-amber-950/20 dark:border-orange-800/40 px-5 py-4">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-orange-500/10">
                <Building2 className="h-4 w-4 text-orange-600" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  Welcome to {teamWelcome.orgName}!
                </h3>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed max-w-lg">
                  Get started by importing your client list — head to the{" "}
                  <a href="/crm" className="text-orange-600 hover:underline font-medium">CRM</a>{" "}
                  and use <strong>Import CSV</strong> to bring in your contacts. Then check the{" "}
                  <a href="/transactions" className="text-orange-600 hover:underline font-medium">Transactions</a>{" "}
                  page to upload your deal history.
                </p>
              </div>
            </div>
            <button
              onClick={() => setBannerDismissed(true)}
              aria-label="Dismiss"
              className="ml-4 shrink-0 text-orange-400 hover:text-orange-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── GST/HST Filing Deadline Alert ───────────────────────────────── */}
      {settings && filingDeadlineAlert && (filingDeadlineAlert.urgency === "overdue" || filingDeadlineAlert.urgency === "urgent" || filingDeadlineAlert.urgency === "soon") && (
        <div className={cn(
          "flex items-center gap-2.5 rounded-lg px-3.5 py-2.5 text-sm",
          filingDeadlineAlert.urgency === "overdue"
            ? "border border-red-300 bg-red-50 text-red-800"
            : filingDeadlineAlert.urgency === "urgent"
            ? "border border-amber-300 bg-amber-50 text-amber-800"
            : "border border-amber-200 bg-amber-50/60 text-amber-700",
        )}>
          <AlertTriangle className={cn(
            "h-4 w-4 shrink-0",
            filingDeadlineAlert.urgency === "overdue" ? "text-red-600" :
            "text-amber-500",
          )} />
          <div className="flex-1 text-sm">
            <strong>
              {filingDeadlineAlert.urgency === "overdue"
                ? `${filingDeadlineAlert.taxLabel} return overdue`
                : `${filingDeadlineAlert.taxLabel} filing deadline approaching`}
            </strong>
            <span className="ml-1.5 font-normal">
              — {filingDeadlineAlert.periodLabel} is {filingDeadlineAlert.deadlineLabel}.
            </span>
          </div>
          <a
            href="/expenses"
            className={cn(
              "shrink-0 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              filingDeadlineAlert.urgency === "overdue"
                ? "bg-red-100 text-red-700 hover:bg-red-200"
                : "bg-amber-100 text-amber-700 hover:bg-amber-200",
            )}
          >
            View Expenses →
          </a>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 pb-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight greet-fade text-foreground">
            {emoji} {greeting}{firstName ? `, ${firstName}` : ""}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {motivationalTag}
          </p>
          {streakLabel && (
            <p className="mt-1 text-xs font-semibold text-amber-600">{streakLabel}</p>
          )}
        </div>
      </div>

      {/* ── Top-bar utility buttons (portaled into the top nav bar) ── */}
      {topBarTarget && createPortal(
        <>
          {ytdDealCount > 0 && (
            <button
              onClick={() => setShowAnnualReview(true)}
              className="flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              title={`${currentYear} Year in Review`}
            >
              <Star className="h-3.5 w-3.5" />
              <span className="hidden lg:inline">{currentYear} Review</span>
            </button>
          )}
          <button
            onClick={() => setCustomizeMode((m) => !m)}
            className={cn(
              "flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors",
              customizeMode
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-accent"
            )}
            title="Customize Dashboard"
          >
            <Settings2 className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">{customizeMode ? "Done" : "Customize"}</span>
          </button>
        </>,
        topBarTarget
      )}

      {/* Runway Score Hero — always first */}
      <Card data-tour="dashboard-score" className="rounded-xl border-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 shadow-lg overflow-hidden relative">
        {/* Subtle brand gradient accent at top */}
        <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: "linear-gradient(90deg, #F0A800 0%, #1E72F2 45%, #7C3AED 80%, #10B981 100%)" }} />
        <CardContent className="pt-5 pb-4">
          {/* Stack vertically on mobile (<640px) — the two-column stats grid
              on the right doesn't fit beside the grade circle at narrow
              widths and overflows the card. Row layout resumes at sm+. */}
          <div className="flex flex-col sm:flex-row sm:flex-nowrap sm:items-center sm:justify-between gap-4 sm:gap-6">
            {/* Left: grade circle + score */}
            <div className="flex items-center gap-5 min-w-0">
              {/* Commission Gold grade circle — signature brand moment.
                  On a fresh account (no transactions or history) we show a
                  neutral "—" placeholder so the user doesn't see a misleading
                  D-grade before they've logged any activity. */}
              <div
                className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-full"
                style={hasData ? {
                  background: "linear-gradient(135deg, #F0A800 0%, #D97706 55%, #a85c00 100%)",
                  boxShadow: "0 0 24px rgba(240,168,0,0.45), 0 0 60px rgba(240,168,0,0.14), inset 0 1px 1px rgba(255,255,255,0.22)",
                } : {
                  background: "rgba(148, 163, 184, 0.12)",
                  boxShadow: "inset 0 0 0 1px rgba(148, 163, 184, 0.3)",
                }}
              >
                <span
                  className="text-2xl font-black leading-none"
                  style={{ color: hasData ? "#15110A" : "#94A3B8" }}
                >
                  {hasData ? runwayScore.grade : "—"}
                </span>
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1">
                  <span className="flex items-center gap-1">
                    <p className="text-sm font-semibold text-slate-400">Runway Score</p>
                    <MetricInfo tip="A composite score across 5 factors: pace vs goal (35%), pipeline health (30%), expense ratio (15%), cash survival (15%), and benchmark ranking (5%)." />
                    <GuideLink anchor="runway-score" label="Runway Score explained in Guide" />
                    {isPro && hasData && <ExplainButton question="How is my Runway Score calculated and what can I do to improve it?" />}
                  </span>
                  <RunwayScoreInfoDialog />
                </div>
                {hasData ? (
                  <div className="flex items-center gap-2.5 mt-0.5">
                    <p className="text-4xl font-extrabold text-white leading-none">
                      {runwayScore.score}
                      <span className="text-base font-medium text-slate-500">/100</span>
                    </p>
                    <span className={cn(
                      "text-[10px] font-semibold border rounded-full px-2 py-0 leading-5",
                      scoreBandColor(runwayScore.stateLabel),
                    )}>
                      {runwayScore.stateLabel}
                    </span>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 mt-1 max-w-xs leading-snug">
                    Your Runway Score appears after you log your first transaction or import history.
                  </p>
                )}
                {/* Month-over-month trend */}
                {hasData && scoreDelta !== null && (
                  <p className={cn(
                    "text-[10px] font-semibold tabular-nums mt-1",
                    scoreDelta > 0 ? "text-emerald-600" : scoreDelta < 0 ? "text-red-500" : "text-slate-400",
                  )}>
                    {scoreDelta > 0 ? `+${scoreDelta}` : scoreDelta} vs last month
                  </p>
                )}
              </div>
            </div>
            {/* Right: survival — single-column mini-grid (Pace card retired with market data layer) */}
            <div className="grid grid-cols-1 gap-px rounded-xl border border-slate-700 bg-slate-700 overflow-hidden shrink-0">
              {/* Cash Runway */}
              <div className="bg-slate-800/50 px-4 py-3 text-center">
                <div className="flex items-center justify-center gap-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Cash Runway</p>
                  <MetricInfo tip={cashPosition.source === "implied"
                    ? `Based on your YTD income (${fmtCurrency(cashPosition.breakdown.ytdAgentNet)}) minus expenses (${fmtCurrency(cashPosition.breakdown.ytdExpenses)}), tax set-aside (${fmtCurrency(cashPosition.breakdown.ytdTaxSetAside)})${cashPosition.breakdown.ytdHstOwing > 0 ? `, HST owing (${fmtCurrency(cashPosition.breakdown.ytdHstOwing)})` : ""}${cashPosition.manualReserve > 0 ? ` + starting reserve (${fmtCurrency(cashPosition.manualReserve)})` : ""}. Effective cash: ${fmtCurrency(cashPosition.effectiveCash)}.`
                    : "How many months you could sustain current expenses using only your cash reserve, with zero new income. Update your cash reserve in Settings."
                  } />
                  <GuideLink anchor="cash-runway" label="Cash Runway explained in Guide" />
                  {isPro && <ExplainButton question="What is my current cash runway and how can I extend it?" />}
                </div>
                <p className={cn("text-2xl font-bold mt-1 leading-none", riskColors[survival.riskLevel])}>
                  {formatSurvivalDisplay(survival)}
                </p>
                <p className="text-[10px] text-slate-500 mt-1">
                  {cashPosition.source === "implied" ? (
                    <span title={`Implied: ${fmtCurrency(cashPosition.impliedPosition)}${cashPosition.manualReserve > 0 ? ` + Reserve: ${fmtCurrency(cashPosition.manualReserve)}` : ""}`}>
                      est. {fmtCurrency(cashPosition.effectiveCash)} position
                    </span>
                  ) : (
                    "cash coverage"
                  )}
                </p>
              </div>
            </div>
          </div>
          {/* Narrative — full-width line below the score/stats row.
              On zero-data we don't have a meaningful narrative, so we
              suppress it entirely rather than print a misleading one. */}
          {hasData && (
            <p className="mt-3 text-xs text-slate-400">{scoreNarrative}</p>
          )}
          {/* Score components — hidden on zero-data; component scores are
              all 0 until transactions exist and would just look broken. */}
          {hasData && (
            <div className="mt-3 grid grid-cols-5 gap-3 border-t border-slate-700 pt-3">
              {runwayScore.components.map((c) => {
                // Bar colour reflects score tier — colour carries meaning, not decoration
                const barColor = c.score >= 80 ? "[&>div]:bg-amber-500"
                               : c.score >= 60 ? "[&>div]:bg-emerald-500"
                               : c.score >= 40 ? "[&>div]:bg-blue-400"
                               :                 "[&>div]:bg-red-400";
                const textColor = c.score >= 80 ? "#D97706"
                                : c.score >= 60 ? "#059669"
                                : c.score >= 40 ? "#3b82f6"
                                :                 "#ef4444";
                return (
                <div key={c.label} className="text-center">
                  <p className="text-[10px] font-semibold text-slate-400">{c.label}</p>
                  <p className="text-sm font-bold mt-0.5" style={{ color: textColor }}>
                    {c.score}
                  </p>
                  <Progress value={c.score} className={cn("mt-1.5 h-2", barColor)} />
                </div>
                );
              })}
            </div>
          )}
          {/* Deviation insights — progressive disclosure: collapsed by default */}
          {/* Suppress before mid-Feb: annualization math unreliable with < 2 months YTD data */}
          {hasData && fraction * 12 >= 2 && deviationMessages.length > 0 && (
            <details className="mt-3 border-t border-slate-700 pt-2 group">
              <summary className="text-[10px] text-slate-500 cursor-pointer hover:text-slate-400 transition-colors select-none list-none flex items-center gap-1">
                <ChevronRight className="h-3 w-3 transition-transform group-open:rotate-90" />
                {deviationMessages.length} insight{deviationMessages.length !== 1 ? "s" : ""} from your history
              </summary>
              <div className="mt-2 space-y-1.5">
                {deviationMessages.map((msg, i) => (
                  <p key={i} className="text-[11px] text-slate-400 leading-snug flex items-start gap-1.5">
                    <span className="shrink-0 mt-px text-slate-600">{"·"}</span>
                    {msg}
                  </p>
                ))}
              </div>
            </details>
          )}
        </CardContent>
      </Card>

      {/* ── Customize bar ── */}
      {customizeMode && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-foreground">Customize your dashboard</p>
            <p className="text-xs text-muted-foreground mt-0.5">Drag to reorder. Show hidden cards or hide ones you don&apos;t need. Reset restores the default lean view.</p>
          </div>
          <button
            onClick={resetLayout}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg px-2.5 py-1.5 shrink-0"
          >
            <RotateCcw className="h-3 w-3" />
            Reset
          </button>
        </div>
      )}

      {/* ── Sortable card area ── */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={cardOrder} strategy={verticalListSortingStrategy}>
          <div className="space-y-3">
            {(() => {
              let lastSection: string | null = null;
              const visibleCards = cardOrder.filter((id) => customizeMode || !hiddenCards.has(id));
              return visibleCards.map((id) => {
                const content = cardRenders[id];
                const cardDef = CARD_REGISTRY.find((c) => c.id === id);
                const isHidden = hiddenCards.has(id);
                if (!customizeMode && (content == null || isHidden)) return null;

                // Section header — show when section changes (skip in customize mode)
                let sectionHeader: React.ReactNode = null;
                if (!customizeMode && cardDef?.section && cardDef.section !== lastSection) {
                  const isFirstSection = lastSection === null;
                  lastSection = cardDef.section;
                  const sectionDef = SECTIONS.find((s) => s.id === cardDef.section);
                  // Skip the first section header — the KPI cards are self-explanatory right after Runway Score
                  if (sectionDef && !isFirstSection) {
                    sectionHeader = (
                      <div key={`section-${sectionDef.id}`} className="pt-2 pb-1">
                        <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                          {sectionDef.label}
                        </p>
                      </div>
                    );
                  }
                }

                return (
                  <div key={id}>
                    {sectionHeader}
                    <SortableCard
                      id={id}
                      label={cardDef?.label ?? id}
                      customizeMode={customizeMode}
                      onHide={() => toggleHide(id)}
                    >
                      {isHidden ? (
                        <div className="rounded-xl border-2 border-dashed border-border/50 bg-muted/20 px-4 py-3 flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-muted-foreground">{cardDef?.label}</p>
                            <p className="text-xs text-muted-foreground/70">{cardDef?.description}</p>
                          </div>
                          <button
                            onClick={() => toggleShow(id)}
                            className="flex items-center gap-1.5 text-xs font-medium text-primary border border-primary/30 rounded-lg px-2.5 py-1.5 hover:bg-primary/5"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            Show
                          </button>
                        </div>
                      ) : content ?? (
                        <div className="rounded-xl border border-dashed border-border/40 bg-muted/10 px-4 py-3 text-xs text-muted-foreground text-center">
                          {cardDef?.label} — no data yet
                        </div>
                      )}
                    </SortableCard>
                  </div>
                );
              });
            })()}
          </div>
        </SortableContext>
      </DndContext>


      {/* First-run guide — shown only when there's no data yet */}
      {transactions.length === 0 && pipelineDeals.length === 0 && (
        <Card className="border-dashed border-primary/30 bg-primary/5">
          <CardContent className="p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-6">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                <Rocket className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-semibold">Your runway is clear — now let&apos;s light it up.</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Log your first deal and watch your Runway Score, tax forecast, and year-end projection come to life. It only takes 30 seconds.
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Link href="/transactions" className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
                    <Plus className="h-4 w-4" />
                    Add First Deal
                  </Link>
                  <Link href="/pipeline" className="inline-flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors">
                    <Layers className="h-4 w-4" />
                    Add to Pipeline
                  </Link>
                  <Link href="/expenses" className="inline-flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors">
                    <Receipt className="h-4 w-4" />
                    Track Expenses
                  </Link>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}


      {/* Disclaimer */}
      <p className="text-center text-xs leading-relaxed text-muted-foreground/60 pb-2">
        {CANONICAL_TAX_DISCLAIMER}{" "}
        <a href="/terms" className="underline underline-offset-2 hover:text-muted-foreground">
          Terms of Service
        </a>
        .
      </p>

      {/* Welcome Tour — shown only on first visit after onboarding */}
      {!tourComplete && (
        <WelcomeTour
          hasAiChat={isPro}
          onComplete={async () => {
            setTourComplete(true);
            try {
              const { data: { user } } = await supabase.auth.getUser();
              if (user) {
                await supabase
                  .from("user_settings")
                  .update({ has_seen_tour: true })
                  .eq("user_id", user.id);
              }
            } catch { /* fire-and-forget — UI already updated */ }
          }}
        />
      )}

      {/* Closing Day floating prompt — surfaces firm/closed pipeline deals due today */}
      <ClosingDayPrompt
        dealsClosingToday={dealsClosingToday}
        settings={settings}
        ytdTransactions={transactions
          .filter((t) => t.status === "closed")
          .map((t) => ({ sale_price: t.sale_price, commission_pct: t.commission_pct, date: t.date }))}
      />

      {/* AI Profile floating prompt */}
      {settings?.user_id && (
        <AiProfilePrompt
          userId={settings.user_id}
          hasVoiceProfile={!!(communicationProfile?.completed)}
          hasBusinessIdentity={!!(businessIdentity?.completed)}
          lastDismissedAt={aiProfilePromptDismissedAt}
        />
      )}
    </div>
  );
}

// ── getPeriodRecap ────────────────────────────────────────────────────────

function getPeriodRecap(
  transactions: Transaction[],
  now: Date,
): { monthName: string; monthGCI: number; monthTx: number; vsAvg: number } | null {
  const day = now.getDate();
  const month = now.getMonth(); // 0-based
  const year = now.getFullYear();

  // Show only in last 2 days of a month OR first 3 days of new month
  const isMonthBoundary = day >= 28 || day <= 3;
  if (!isMonthBoundary) return null;

  // The month that just completed
  const recapMonth = day <= 3 ? (month === 0 ? 11 : month - 1) : month;
  const recapYear = day <= 3 && month === 0 ? year - 1 : year;

  const monthTxList = transactions.filter((tx) => {
    const d = new Date(tx.date + "T12:00:00");
    return d.getFullYear() === recapYear && d.getMonth() === recapMonth;
  });
  const monthGCI = monthTxList.reduce((s, tx) => s + computeGCI(tx), 0);
  if (monthGCI === 0 || monthTxList.length === 0) return null;

  const monthName = new Date(recapYear, recapMonth).toLocaleString("en-CA", { month: "long" });

  // Average monthly GCI across all elapsed months (not just months with data)
  // so that zero-GCI months don't inflate the average.
  // When recapping the previous month (day <= 3), use recapMonth + 1 (0-indexed → count).
  // Otherwise (recapping current month at month-end), use current month count.
  const elapsedMonths = day <= 3 ? recapMonth + 1 : now.getMonth() + 1;
  const totalGCI = transactions.reduce((s, tx) => s + computeGCI(tx), 0);
  const avgMonthly = elapsedMonths > 0 ? totalGCI / elapsedMonths : 0;
  const vsAvg = avgMonthly > 0 ? monthGCI / avgMonthly : 0;

  return { monthName, monthGCI, monthTx: monthTxList.length, vsAvg };
}

// ── computePersonalRecords ────────────────────────────────────────────────

function computePersonalRecords(
  transactions: Transaction[],
  historyItems: HistoryItem[],
  ytdGCI: number,
  currentYear: number,
) {
  // Best single deal (YTD)
  const bestDeal =
    transactions.length > 0
      ? Math.max(...transactions.map((tx) => computeGCI(tx)))
      : null;

  // Best month YTD
  const monthlyGCI: Record<number, number> = {};
  for (const tx of transactions) {
    const m = new Date(tx.date + "T12:00:00").getMonth();
    monthlyGCI[m] = (monthlyGCI[m] ?? 0) + computeGCI(tx);
  }
  const bestMonthEntries = Object.entries(monthlyGCI).sort((a, b) => Number(b[1]) - Number(a[1]));
  const bestMonthEntry = bestMonthEntries[0] ?? null;
  const bestMonthGCI = bestMonthEntry ? Number(bestMonthEntry[1]) : null;
  const bestMonthName = bestMonthEntry
    ? new Date(currentYear, Number(bestMonthEntry[0])).toLocaleString("en-CA", { month: "long" })
    : null;

  // Best year (career history + current year)
  const allYearGCIs = [
    ...historyItems.map((h) => ({ year: h.year, gci: h.annual_gci })),
    { year: currentYear, gci: ytdGCI },
  ].filter((y) => y.gci > 0);
  const bestYearEntry = allYearGCIs.sort((a, b) => b.gci - a.gci)[0] ?? null;

  return { bestDeal, bestMonthGCI, bestMonthName, bestYear: bestYearEntry };
}

// ── PersonalRecordsCard ───────────────────────────────────────────────────

function PersonalRecordsCard({
  transactions,
  historyItems,
  ytdGCI,
  currentYear,
}: {
  transactions: Transaction[];
  historyItems: HistoryItem[];
  ytdGCI: number;
  currentYear: number;
}) {
  const { bestDeal, bestMonthGCI, bestMonthName, bestYear } = computePersonalRecords(
    transactions,
    historyItems,
    ytdGCI,
    currentYear,
  );

  type RecordEntry = { label: string; value: string; sub: string };
  const records: RecordEntry[] = [];
  if (bestYear) records.push({ label: "Best Year", value: fmtCurrency(bestYear.gci), sub: String(bestYear.year) });
  if (bestMonthGCI && bestMonthName) records.push({ label: "Best Month", value: fmtCurrency(bestMonthGCI), sub: `${bestMonthName} ${currentYear}` });
  if (bestDeal) records.push({ label: "Best Single Deal", value: fmtCurrency(bestDeal), sub: "single commission" });

  if (records.length === 0) return null;

  return (
    <Card className="rounded-xl border-slate-200 bg-white shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-brand-gold" />
          <CardTitle className="text-sm font-semibold text-slate-700">Personal Records</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {records.map((r) => (
            <div key={r.label} className="text-center">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-gold">
                {r.label}
              </p>
              <p className="text-xl font-bold text-slate-800 mt-0.5 tabular-nums">{r.value}</p>
              <p className="text-xs text-slate-500">{r.sub}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Section header ────────────────────────────────────────────────────────

function _SectionHeader({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 pt-2">
      <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500 whitespace-nowrap">
        {label}
      </p>
      <div className="h-px flex-1 bg-slate-300" />
    </div>
  );
}

// ── Business Health Narrative card ───────────────────────────────────────

const STATUS_STYLES: Record<
  HealthStatus,
  { border: string; chip: string; icon: string; bg: string }
> = {
  Stable:    { border: "border-l-emerald-500", chip: "bg-emerald-100 text-emerald-800 border border-emerald-200",  icon: "text-emerald-600", bg: "from-white to-white" },
  Watchlist: { border: "border-l-amber-400",   chip: "bg-amber-100 text-amber-800 border border-amber-200",       icon: "text-amber-600",   bg: "from-white to-white" },
  "At Risk": { border: "border-l-amber-500",   chip: "bg-amber-100 text-amber-800 border border-amber-200",       icon: "text-amber-600",   bg: "from-white to-white" },
  Critical:  { border: "border-l-red-500",     chip: "bg-red-100 text-red-800 border border-red-200",             icon: "text-red-600",     bg: "from-red-50 to-red-50/40"        },
};

function BusinessHealthNarrativeCard({
  narrative,
  isOpen,
  onToggle,
}: {
  narrative: HealthNarrativeResult;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const styles = STATUS_STYLES[narrative.status];
  return (
    <Card className={cn("rounded-xl border-l-4 bg-gradient-to-br shadow-sm", styles.border, styles.bg)}>
      {/* Clickable header — always visible */}
      <CardHeader
        className="cursor-pointer pb-2 pt-4 select-none"
        onClick={onToggle}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className={cn("flex h-7 w-7 items-center justify-center rounded-full", styles.chip.includes("emerald") ? "bg-emerald-200" : styles.chip.includes("amber") ? "bg-amber-200" : "bg-red-200")}>
              <BarChart2 className={cn("h-3.5 w-3.5", styles.icon)} />
            </div>
            <CardTitle className="text-xs font-bold uppercase tracking-widest text-slate-500">
              Business Health Narrative
            </CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", styles.chip)}>
              {narrative.status}
            </span>
            <ChevronDown
              className={cn(
                "h-4 w-4 text-muted-foreground transition-transform duration-200",
                isOpen && "rotate-180",
              )}
            />
          </div>
        </div>
        {/* Summary always visible below the header row */}
        {!isOpen && (
          <p className="mt-1.5 line-clamp-2 text-sm text-slate-600">
            {narrative.summary}
          </p>
        )}
      </CardHeader>

      {/* Expandable body */}
      {isOpen && (
        <CardContent className="space-y-4 pb-5 pt-0">
          {/* Executive summary paragraph */}
          <p className="text-sm leading-relaxed text-foreground">{narrative.summary}</p>

          <Separator />

          {/* Three named sections */}
          <div className="space-y-3">
            <NarrativeSection
              icon={TrendingUp}
              label="What changed"
              text={narrative.whatChanged}
            />
            <NarrativeSection
              icon={Info}
              label="Why"
              text={narrative.why}
            />
            <NarrativeSection
              icon={Target}
              label="Next move"
              text={narrative.nextMove}
              accent
            />
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function NarrativeSection({
  icon: Icon,
  label,
  text,
  accent = false,
}: {
  icon: React.ElementType;
  label: string;
  text: string;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex gap-3 rounded-md px-3 py-2.5",
        accent ? "bg-primary/5 border border-primary/10" : "bg-muted/40",
      )}
    >
      <Icon
        className={cn(
          "mt-0.5 h-4 w-4 shrink-0",
          accent ? "text-primary" : "text-muted-foreground",
        )}
      />
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          {label}
        </p>
        <p className={cn("mt-0.5 text-sm", accent ? "font-medium text-foreground" : "text-foreground/80")}>
          {text}
        </p>
      </div>
    </div>
  );
}

// ── Runway Score info dialog ──────────────────────────────────────────────

const SCORE_COMPONENTS_INFO = [
  {
    label: "Goal Pace",
    weight: "35%",
    description:
      "Measures how your YTD GCI tracks against your annual goal, adjusted for seasonal patterns. Full credit when you're at or ahead of expected pace.",
  },
  {
    label: "Pipeline",
    weight: "25%",
    description:
      "Your probability-weighted pipeline value relative to the remaining goal gap. A healthy pipeline provides a cushion for the months ahead.",
  },
  {
    label: "Expenses",
    weight: "15%",
    description:
      "Your expense ratio (expenses ÷ GCI) vs. the 25–30% industry benchmark. Below 30% is healthy; above 50% is a warning sign.",
  },
  {
    label: "Survival",
    weight: "15%",
    description:
      "Months of cash runway based on your burn rate (brokerage fee + recurring expenses) and cash reserves. 6+ months is considered strong.",
  },
  {
    label: "Benchmark",
    weight: "10%",
    description:
      "Your projected annual GCI compared to agents with similar experience (industry-cohort estimate). Shows where you rank within your peer group.",
  },
] as const;

const GRADE_RANGES = [
  { grade: "A+", range: "92–100", label: "Thriving",     textColor: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200" },
  { grade: "A",  range: "85–91",  label: "Strong",       textColor: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200" },
  { grade: "B",  range: "75–84",  label: "Healthy",      textColor: "text-blue-700",    bg: "bg-blue-50 border-blue-200"       },
  { grade: "C",  range: "62–74",  label: "Developing",   textColor: "text-amber-700",   bg: "bg-amber-50 border-amber-200"     },
  { grade: "D",  range: "50–61",  label: "Struggling",   textColor: "text-amber-700",   bg: "bg-amber-50 border-amber-200"     },
  { grade: "F",  range: "0–49",   label: "Danger Zone",  textColor: "text-red-700",     bg: "bg-red-50 border-red-200"         },
] as const;

function RunwayScoreInfoDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          className="rounded-full p-0.5 text-muted-foreground transition-colors hover:text-foreground focus:outline-none"
          title="How is my Runway Score calculated?"
          onClick={(e) => e.stopPropagation()}
        >
          <HelpCircle className="h-3.5 w-3.5" />
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>How Your Runway Score Works</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 text-sm">
          <p className="text-muted-foreground">
            Your Runway Score is a composite 0–100 number that grades the overall
            health of your real estate business across five dimensions. It updates
            in real time as you enter data.
          </p>

          {/* Components */}
          <div>
            <h3 className="mb-2 font-semibold">What goes into your score</h3>
            <div className="space-y-2">
              {SCORE_COMPONENTS_INFO.map((c) => (
                <div
                  key={c.label}
                  className="flex items-start gap-3 rounded-md border bg-muted/30 px-3 py-2.5"
                >
                  <div className="shrink-0 pt-0.5">
                    <Badge
                      variant="secondary"
                      className="text-[10px] font-bold tabular-nums"
                    >
                      {c.weight}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-xs font-semibold">{c.label}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{c.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Grade ranges */}
          <div>
            <h3 className="mb-2 font-semibold">Score ranges</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {GRADE_RANGES.map((g) => (
                <div
                  key={g.grade}
                  className={cn(
                    "flex items-center gap-3 rounded-md border px-3 py-2",
                    g.bg,
                  )}
                >
                  <span className={cn("w-7 text-center text-lg font-bold", g.textColor)}>
                    {g.grade}
                  </span>
                  <div>
                    <p className={cn("text-xs font-semibold", g.textColor)}>{g.label}</p>
                    <p className="text-[10px] text-muted-foreground">{g.range}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Improvement tips */}
          <div className="rounded-md border bg-muted/30 px-3 py-3">
            <p className="text-xs font-semibold">How to improve your score</p>
            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
              <li>• Close or advance pipeline deals to boost Goal Pace and Pipeline scores</li>
              <li>• Keep expenses below 30% of GCI to maximise the Expenses component</li>
              <li>• Build 4–6 months of cash reserves for a strong Survival score</li>
              <li>• Complete all fields in Settings — each unlocks more accurate projections</li>
              <li>• Grow GCI year-over-year to climb your experience-cohort Benchmark ranking</li>
            </ul>
          </div>

          <p className="text-xs text-muted-foreground border-t pt-3">
            Benchmark data reflects industry-cohort estimates aggregated from public industry sources.
            Score version: {/* version shown inline */}1.0.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Insight row component ─────────────────────────────────────────────────

function InsightRow({ insight }: { insight: Insight }) {
  const Icon = INSIGHT_ICONS[insight.icon] ?? Info;
  const typeColors: Record<string, string> = {
    praise: "text-emerald-600",
    tip: "text-blue-600",
    warning: "text-amber-600",
    info: "text-muted-foreground",
  };
  const typeBg: Record<string, string> = {
    praise: "bg-emerald-50 border-emerald-200",
    tip: "bg-blue-50 border-blue-200",
    warning: "bg-amber-50 border-amber-200",
    info: "bg-slate-50 border-slate-200",
  };

  return (
    <div className={`flex items-start gap-3 rounded-lg border p-3 ${typeBg[insight.type] ?? "border-border"}`}>
      <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${typeColors[insight.type]}`} />
      <div>
        <p className="text-sm font-medium">{insight.title}</p>
        <p className="text-xs text-muted-foreground">{insight.message}</p>
      </div>
    </div>
  );
}

// ── Helper: Format survival label (handles 0-month edge case) ─────────────

function formatSurvivalDisplay(survival: SurvivalResult): string {
  if (survival.monthlyBurn === 0) return "—";
  if (survival.months < 1) return "< 1 month";
  return survival.label;
}

// ── Helper: Runway score one-liner explanation ─────────────────────────────

function buildScoreNarrative(
  runwayScore: RunwayScoreResult,
  survival: SurvivalResult,
  paceStatus: string,
  pacePercent: number,
  _healthReport: BusinessHealthReport,
): string {
  if (!runwayScore.hasEnoughData) {
    return "Add transactions and complete your Settings to get a meaningful score.";
  }
  const weakest = runwayScore.components.reduce((a, b) =>
    a.score < b.score ? a : b,
  );
  const paceAbs = Math.abs(Math.round(pacePercent));
  const weakestPhrases: Record<string, string> = {
    "Goal Pace":
      paceStatus === "ahead"
        ? `you're ${paceAbs}% ahead of pace — momentum is building`
        : `you're ${paceAbs}% behind your goal pace — closing pipeline deals will move this`,
    Pipeline: "your pipeline is thin relative to your remaining goal",
    Expenses: "your expense ratio is above the 25–30% benchmark",
    Benchmark: "your projected GCI is below your experience-group cohort median",
    Survival:
      survival.monthlyBurn > 0
        ? `cash runway is ${formatSurvivalDisplay(survival)}`
        : "configure monthly costs in Settings to enable runway tracking",
  };
  const phrase =
    weakestPhrases[weakest.label] ?? "review your business inputs";
  return `Biggest opportunity: ${weakest.label} (${weakest.score}/100) — ${phrase}.`;
}

// ── Helper: Business Health Narrative ─────────────────────────────────────
//
// generateBusinessHealthNarrative() — deterministic rule-based engine.
// Returns a structured object that can later be swapped for a Groq response
// with no changes to the rendering layer.

export type HealthStatus = "Stable" | "Watchlist" | "At Risk" | "Critical";

export interface HealthNarrativeResult {
  status: HealthStatus;
  summary: string;        // 2–3 sentence executive paragraph
  whatChanged: string;    // current state vs expected — the key signal
  why: string;            // root cause explanation
  nextMove: string;       // single, specific, data-backed action
}

function deriveStatus(
  survival: SurvivalResult,
  runwayScore: RunwayScoreResult,
  paceStatus: string,
  pacePercent: number,
  pipelineCount: number,
  ytdGCI: number,
): HealthStatus {
  const grade = runwayScore.grade;
  const hasBurn = survival.monthlyBurn > 0;

  if (grade === "F" || (hasBurn && survival.months < 1)) return "Critical";
  if (
    grade === "D" ||
    (hasBurn && survival.months < 3) ||
    (paceStatus === "behind" && pacePercent < -30)
  )
    return "At Risk";
  if (
    grade === "C" ||
    paceStatus === "behind" ||
    (pipelineCount === 0 && ytdGCI > 0)
  )
    return "Watchlist";
  return "Stable";
}

function generateBusinessHealthNarrative({
  ytdGCI,
  goalGCI,
  fraction,
  projectedGCI,
  pipelineWeightedGCI,
  pipelineCount,
  survival,
  ytdDealCount,
  avgDealSize,
  paceStatus,
  paceGapAmount,
  pacePercent,
  runwayScore,
  healthReport,
  expenseRatio,
  benchmark,
}: {
  ytdGCI: number;
  goalGCI: number;
  fraction: number;
  projectedGCI: number;
  pipelineWeightedGCI: number;
  pipelineCount: number;
  survival: SurvivalResult;
  ytdDealCount: number;
  avgDealSize: number;
  paceStatus: string;
  paceGapAmount: number;
  pacePercent: number;
  runwayScore: RunwayScoreResult;
  healthReport: BusinessHealthReport;
  expenseRatio: number;
  benchmark: { percentile: number; cohortMedianGCI: number };
}): HealthNarrativeResult {
  const pctElapsed = Math.round(fraction * 100);
  const gciGap = Math.max(0, goalGCI - ytdGCI);
  const dealsNeeded = avgDealSize > 0 ? Math.ceil(gciGap / avgDealSize) : null;
  const status = deriveStatus(
    survival, runwayScore, paceStatus, pacePercent, pipelineCount, ytdGCI,
  );

  // ── No data yet ──────────────────────────────────────────────────────────
  if (ytdGCI === 0 && pipelineCount === 0) {
    return {
      status: "Watchlist",
      summary:
        "No business activity has been logged for this year yet. Add your first closed deal and pipeline prospects to unlock performance insights, pace tracking, and your Runway Score.",
      whatChanged:
        "No YTD GCI or pipeline deals are on record — the dashboard is ready but waiting for data.",
      why: "Projections, pace, and benchmarks all require at least one closed deal to generate meaningful signals.",
      nextMove:
        "Log your first transaction on the Transactions page, then add active pipeline deals to enable forecasting.",
    };
  }

  // ── Find weakest score component ─────────────────────────────────────────
  const weakest = runwayScore.components.reduce((a, b) =>
    a.score < b.score ? a : b,
  );

  // ── Summary (2–3 sentences) ───────────────────────────────────────────────
  const dealStr =
    ytdDealCount > 0
      ? `${ytdDealCount} deal${ytdDealCount !== 1 ? "s" : ""} closed for ${fmtCurrency(ytdGCI)} in YTD GCI`
      : "no deals closed yet this year";

  let paceSentence: string;
  if (goalGCI <= 0) {
    paceSentence = `Projected year-end GCI is ${fmtCurrency(projectedGCI)}. Set a goal in Settings to unlock pace and gap analysis.`;
  } else if (paceStatus === "ahead") {
    paceSentence = `You're ${fmtCurrency(Math.abs(paceGapAmount))} ahead of the pace required to hit your ${fmtCurrency(goalGCI)} goal, with ${pctElapsed}% of the year elapsed.`;
  } else {
    paceSentence = `You're ${fmtCurrency(Math.abs(paceGapAmount))} behind the pace required to hit your ${fmtCurrency(goalGCI)} goal, with ${pctElapsed}% of the year elapsed.`;
  }

  let pipelineSentence: string;
  if (survival.monthlyBurn > 0 && survival.months < 3) {
    pipelineSentence = `Cash runway is ${formatSurvivalDisplay(survival)} — this requires immediate attention alongside revenue generation.`;
  } else if (pipelineCount > 0) {
    pipelineSentence = `Your pipeline carries ${fmtCurrency(pipelineWeightedGCI)} in probability-weighted income across ${pipelineCount} active deal${pipelineCount !== 1 ? "s" : ""}.`;
  } else {
    pipelineSentence = "No active pipeline deals are on record — adding prospects will improve forecast accuracy and score.";
  }

  const summary = `With ${dealStr}, ${paceSentence.charAt(0).toLowerCase()}${paceSentence.slice(1)} ${pipelineSentence}`;

  // ── What changed (current vs expected) ───────────────────────────────────
  let whatChanged: string;
  if (goalGCI > 0 && fraction > 0) {
    const expectedYTD = goalGCI * fraction;
    const direction = paceGapAmount >= 0 ? "ahead of" : "behind";
    whatChanged = `YTD GCI of ${fmtCurrency(ytdGCI)} is ${fmtCurrency(Math.abs(paceGapAmount))} ${direction} the ${fmtCurrency(expectedYTD)} expected at this point in the year (${pctElapsed}% elapsed).`;
  } else {
    whatChanged = `${ytdDealCount} deal${ytdDealCount !== 1 ? "s" : ""} closed YTD averaging ${fmtCurrency(avgDealSize)}, projecting a ${fmtCurrency(projectedGCI)} year-end without a goal set.`;
  }

  // ── Why (root cause from weakest score component) ─────────────────────────
  const whyMap: Record<string, string> = {
    "Goal Pace":
      gciGap > 0
        ? `Goal pace (score: ${healthReport.paceScore}/100) is the primary drag. With ${ytdDealCount} closed deal${ytdDealCount !== 1 ? "s" : ""} at an average of ${fmtCurrency(avgDealSize)}, current trajectory puts year-end ${fmtCurrency(Math.abs(projectedGCI - goalGCI))} ${projectedGCI >= goalGCI ? "above" : "below"} target.`
        : `Goal pace is strong (${healthReport.paceScore}/100) — you've maintained above-expected velocity throughout the year.`,
    Pipeline:
      pipelineCount === 0
        ? `Pipeline is empty (score: ${healthReport.pipelineScore}/100). With no active deals in progress, the forecast relies entirely on closed deals and seasonal assumptions.`
        : `Pipeline coverage is thin (score: ${healthReport.pipelineScore}/100). The ${pipelineCount} active deal${pipelineCount !== 1 ? "s" : ""} carrying ${fmtCurrency(pipelineWeightedGCI)} may not be sufficient to close a ${fmtCurrency(gciGap)} gap.`,
    Expenses:
      expenseRatio > 0
        ? `Expense ratio is elevated at ${fmtPct(expenseRatio)} of YTD GCI (score: ${healthReport.expenseScore}/100), above the 25–30% benchmark. Monthly burn of ${fmtCurrency(survival.monthlyBurn)} is compressing net take-home.`
        : `Expense tracking (score: ${healthReport.expenseScore}/100) — configure your costs in Settings to see expense ratio and burn analysis.`,
    Benchmark: `Projected GCI of ${fmtCurrency(projectedGCI)} ranks at the ${benchmark.percentile}th percentile for your experience cohort, with a median of ${fmtCurrency(benchmark.cohortMedianGCI)} (industry-cohort estimate).`,
    Survival:
      survival.monthlyBurn > 0
        ? `Cash runway is ${formatSurvivalDisplay(survival)} against a ${fmtCurrency(survival.monthlyBurn)}/month burn rate. This is the highest-priority operational risk on the dashboard.`
        : "Cash runway cannot be calculated — configure your monthly brokerage fee and recurring expenses in Settings.",
  };
  const why = whyMap[weakest.label] ?? `${weakest.label} scored ${weakest.score}/100 — review your business inputs to improve this component.`;

  // ── Next move (specific, data-backed) ─────────────────────────────────────
  let nextMove: string;
  if (status === "Critical" && survival.monthlyBurn > 0 && survival.months < 1) {
    nextMove = "Immediate priority: build your cash reserve or reduce monthly burn to extend runway beyond 1 month.";
  } else if (weakest.label === "Goal Pace" && dealsNeeded && dealsNeeded > 0) {
    nextMove = `Close ${dealsNeeded} more deal${dealsNeeded !== 1 ? "s" : ""} at your current average of ${fmtCurrency(avgDealSize)} to reach your ${fmtCurrency(goalGCI)} goal. Converting active pipeline deals is the fastest path.`;
  } else if (weakest.label === "Pipeline" && pipelineCount === 0) {
    nextMove = "Add at least 3–5 pipeline deals on the Pipeline page to improve forecast coverage and your Runway Score.";
  } else if (weakest.label === "Pipeline" && pipelineCount > 0) {
    nextMove = `Push ${pipelineCount > 2 ? "top 2" : "your"} pipeline deal${pipelineCount !== 1 ? "s" : ""} toward closing this month to improve both GCI and pipeline score.`;
  } else if (weakest.label === "Expenses") {
    nextMove = "Review your Expenses page and identify at least $500/month in reducible recurring costs to bring the expense ratio below 30%.";
  } else if (weakest.label === "Survival" && survival.monthlyBurn > 0) {
    nextMove = `Build your cash reserve to cover at least 3 months of the ${fmtCurrency(survival.monthlyBurn)}/month burn rate (${fmtCurrency(survival.monthlyBurn * 3)} target).`;
  } else if (pipelineCount > 0 && gciGap > 0) {
    nextMove = `Convert pipeline deals to close the ${fmtCurrency(gciGap)} remaining gap to your ${fmtCurrency(goalGCI)} goal.`;
  } else if (paceStatus === "ahead" && goalGCI > 0) {
    nextMove = "You're on track — maintain deal velocity and consider increasing your annual goal if Q3 pipeline is strong.";
  } else {
    nextMove = "Focus on building pipeline this month to protect your Q3 and Q4 forecast.";
  }

  return { status, summary, whatChanged, why, nextMove };
}

// ── Helper: Build monthly chart data ──────────────────────────────────────

function buildMonthlyChartData(
  transactions: Transaction[],
  projectedGCI: number,
  seasonalWeights: number[],
  currentYear: number,
  now: Date,
): MonthlyDataPoint[] {
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const currentMonth = now.getMonth(); // 0-indexed

  // Actual GCI by month (use string date to avoid timezone issues)
  const actualByMonth = new Array(12).fill(0);
  transactions.forEach((tx) => {
    if (tx.date.startsWith(String(currentYear))) {
      const monthIdx = parseInt(tx.date.slice(5, 7)) - 1;
      actualByMonth[monthIdx] += computeGCI(tx);
    }
  });

  const ytdActual = actualByMonth.reduce((sum, v) => sum + v, 0);
  const remainingGCI = Math.max(0, projectedGCI - ytdActual);

  // Monthly seasonality weights (quarterly weights / 3)
  const monthlyWeights = seasonalWeights.flatMap((qw) => [qw / 3, qw / 3, qw / 3]);
  const futureWeightTotal = monthlyWeights
    .slice(currentMonth + 1)
    .reduce((sum, w) => sum + w, 0);

  return MONTHS.map((month, i) => {
    if (i <= currentMonth) {
      return { month, gci: actualByMonth[i], projected: false };
    } else {
      const gci =
        futureWeightTotal > 0
          ? remainingGCI * (monthlyWeights[i] / futureWeightTotal)
          : 0;
      return { month, gci, projected: true };
    }
  });
}

// ── Helper: Build BusinessHealthReport ────────────────────────────────────
// Canonical implementation lives in packages/core/engines/health-report.ts
// and is imported via @/lib/engines/health-report.

// ── Helper: Projected net income ──────────────────────────────────────────

function computeProjectedNet(projectedGCI: number, settings: UserSettings | null): number {
  if (!settings) return projectedGCI;
  const { agentGross } = computeAgentGross(
    projectedGCI,
    settings.split_preset,
    settings.post_cap_threshold_gci,
    settings.post_cap_agent_pct,
    settings.post_cap_brokerage_pct,
  );
  const txFees = computeTxFees(
    projectedGCI,
    settings.tx_fee_rate_pct,
    settings.tx_fee_annual_cap,
  );
  const brokerageFeeAnnual = settings.monthly_brokerage_fee * 12;
  return agentGross - txFees - brokerageFeeAnnual;
}

// ── Where You Stand Card ──────────────────────────────────────────────────────
// Extracted as a separate component so it can own its own expand/collapse state
// without causing re-renders of the entire DashboardContent.

function WhereYouStandCard({
  wys,
  bands,
  momentumIcon,
  momentumColor: _momentumColor,
}: {
  wys: import("@/lib/engines/where-you-stand-engine").WhereYouStandResult;
  bands: import("@/lib/engines/where-you-stand-engine").PerformanceBand[];
  momentumIcon: React.ReactNode;
  momentumColor: string;
}) {
  const [expanded, setExpanded] = useState(false);

  // Band color mapping
  const bandColors: Record<string, { bg: string; border: string; text: string; fill: string }> = {
    launching:   { bg: "bg-slate-50",   border: "border-slate-300",   text: "text-slate-700",   fill: "bg-slate-400" },
    climbing:    { bg: "bg-amber-50",   border: "border-amber-300",   text: "text-amber-700",   fill: "bg-amber-400" },
    competitive: { bg: "bg-blue-50",    border: "border-blue-300",    text: "text-blue-700",    fill: "bg-blue-500" },
    advancing:   { bg: "bg-indigo-50",  border: "border-indigo-300",  text: "text-indigo-700",  fill: "bg-indigo-500" },
    leading:     { bg: "bg-violet-50",  border: "border-violet-300",  text: "text-violet-700",  fill: "bg-violet-500" },
  };

  const _activeBandColor = bandColors[wys.band] ?? bandColors.competitive;

  return (
    <div
      className="rounded-xl border border-slate-200 bg-white overflow-hidden cursor-pointer transition-all hover:border-slate-300"
      onClick={() => setExpanded(!expanded)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setExpanded(!expanded); } }}
    >
      {/* Header */}
      <div className="px-4 pt-3 pb-2">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Compass className="h-3.5 w-3.5 text-slate-500 shrink-0" />
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Where You Stand</p>
          </div>
          <ChevronRight className={cn(
            "h-3.5 w-3.5 text-slate-400 transition-transform duration-200",
            expanded && "rotate-90",
          )} />
        </div>

        {/* Identity Line — the most important sentence */}
        <p className="text-sm font-medium text-slate-800 leading-snug mb-3">
          {wys.identityLine}
        </p>

        {/* Band Track + Momentum */}
        <div className="flex items-center gap-3">
          {/* Band segments */}
          <div className="flex-1 flex gap-0.5">
            {bands.map((band, i) => {
              const isActive = i === wys.bandIndex;
              const isPast = i < wys.bandIndex;
              const isNext = i === wys.bandIndex + 1;
              const colors = bandColors[band];

              return (
                <div key={band} className="flex-1 flex flex-col items-center gap-0.5">
                  {/* Segment bar */}
                  <div
                    className={cn(
                      "w-full h-2 rounded-sm transition-all",
                      isActive && `${colors.fill} ring-1 ring-offset-1 ${colors.border.replace("border-", "ring-")}`,
                      isPast && `${colors.fill} opacity-25`,
                      isNext && `${colors.fill} opacity-15`,
                      !isActive && !isPast && !isNext && "bg-slate-100",
                    )}
                  />
                  {/* Label — only show active band on small screens, all on larger */}
                  <span className={cn(
                    "text-[8px] font-semibold uppercase tracking-wider leading-none",
                    isActive ? colors.text : "text-slate-300",
                    !isActive && "hidden sm:block",
                  )}>
                    {BAND_LABELS[band]}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Momentum indicator */}
          {wys.momentum !== "no_data" && (
            <div className={cn(
              "flex items-center gap-1 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold",
              wys.momentum === "gaining" && "bg-emerald-50 text-emerald-700",
              wys.momentum === "losing" && "bg-amber-50 text-amber-700",
              wys.momentum === "holding" && "bg-slate-50 text-slate-600",
            )}>
              {momentumIcon}
              <span className="hidden sm:inline">{wys.momentumLabel}</span>
              <span className="sm:hidden">
                {wys.momentum === "gaining" ? "▲" : wys.momentum === "losing" ? "▼" : "→"}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-slate-100 px-4 py-3 space-y-3 animate-in slide-in-from-top-1 duration-200">
          {/* Market vs You stats */}
          {(wys.marketChangePct != null || wys.agentChangePct != null) && (
            <div className="flex items-center gap-2 flex-wrap">
              {wys.marketChangePct != null && (
                <span className="inline-flex items-center gap-1 rounded-full text-[10px] font-semibold px-2 py-0.5 border bg-slate-50 text-slate-600 border-slate-200">
                  Market: {wys.marketChangePct >= 0 ? "+" : ""}{Math.round(wys.marketChangePct)}% YoY
                </span>
              )}
              {wys.agentChangePct != null && (
                <span className={cn(
                  "inline-flex items-center gap-1 rounded-full text-[10px] font-semibold px-2 py-0.5 border",
                  wys.agentChangePct >= 5 ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                  wys.agentChangePct <= -5 ? "bg-amber-50 text-amber-700 border-amber-200" :
                  "bg-slate-50 text-slate-600 border-slate-200",
                )}>
                  You: {wys.agentChangePct >= 0 ? "+" : ""}{Math.round(wys.agentChangePct)}% YoY
                </span>
              )}
            </div>
          )}

          {/* Diagnosis */}
          <p className="text-xs text-slate-600 leading-relaxed">
            {wys.diagnosisLine}
          </p>

          {/* Distance to next tier */}
          {wys.distanceLine && (
            <div className={cn(
              "flex items-start gap-2 rounded-lg px-3 py-2",
              wys.band === "leading" ? "bg-violet-50/50" : "bg-slate-50",
            )}>
              <Target className={cn(
                "h-3.5 w-3.5 shrink-0 mt-0.5",
                wys.band === "leading" ? "text-violet-500" : "text-slate-400",
              )} />
              <p className="text-[11px] font-medium text-slate-700 leading-snug">
                {wys.distanceLine}
              </p>
            </div>
          )}

          {/* Momentum detail */}
          {wys.momentumDetail && (
            <p className="text-[11px] text-slate-500 leading-snug">
              {wys.momentumDetail}
            </p>
          )}

          {/* Bridge to Top Opportunities */}
          <div className="pt-1 border-t border-slate-100">
            <p className="text-[11px] text-indigo-600 font-medium">
              {wys.bridgeLine}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
