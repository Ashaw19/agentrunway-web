"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { CountUp } from "@/components/count-up";
import { useConfetti } from "@/hooks/use-confetti";
import { AnnualReview } from "@/components/annual-review";
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
} from "lucide-react";
import Link from "next/link";
import { fmtCurrency, fmtCompact, fmtPct } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { MonthlyChart, type MonthlyDataPoint } from "@/components/monthly-chart";
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
} from "@/lib/types/database";
import {
  seasonalFractionElapsed,
  projectedYearEndGCI,
  projectedYearEndTransactions,
  paceVsGoalPercent,
  daysRemaining,
  trendDirection,
  dayOfYear,
  daysInYear,
  weekOfYear,
} from "@/lib/engines/projection-engine";
import { probabilityBands } from "@/lib/engines/probabilistic-forecast-engine";
import { compare, COHORT_LABELS } from "@/lib/engines/benchmark-engine";
import { survivalResult, type SurvivalResult } from "@/lib/engines/survival-engine";
import { compute as computeRunwayScore, type BusinessHealthReport, type RunwayScoreResult } from "@/lib/engines/runway-score-engine";
import { generateInsights, type Insight } from "@/lib/engines/insights-engine";
import { calculate as calculateTax } from "@/lib/engines/canadian-tax-engine";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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

type DashboardView = "essentials" | "standard" | "full";

interface Props {
  transactions: Transaction[];
  pipelineDeals: PipelineDeal[];
  settings: UserSettings | null;
  expenseCategories: ExpenseCategoryWithItems[];
  historyItems?: HistoryItem[];
  initialDashboardView?: string;
  subscriptionTier?: string;
  showUpgradeBanner?: boolean;
  userName?: string;
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
      .map((tx) => new Date(tx.date).getMonth())
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
  historyItems = [],
  initialDashboardView,
  subscriptionTier: _subscriptionTier = "starter",
  showUpgradeBanner = false,
  userName,
}: Props) {
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [showAnnualReview, setShowAnnualReview] = useState(false);
  const { fire: fireConfetti } = useConfetti();
  const confettiFiredRef = useRef(false);
  const now = new Date();
  const currentYear = now.getFullYear();
  const isDecember = now.getMonth() === 11; // 0-indexed

  // ── Scenario toggle ────────────────────────────────────────────────────
  const [scenario, setScenario] = useState<"conservative" | "base" | "optimistic">("base");
  // ── Business Health Narrative expanded by default (Weekly Brief) ────────
  const [narrativeOpen, setNarrativeOpen] = useState(true);

  // ── Dashboard view mode ────────────────────────────────────────────────
  const validView = (v?: string): DashboardView =>
    v === "essentials" || v === "standard" || v === "full" ? v : "standard";
  const [dashboardView, setDashboardView] = useState<DashboardView>(
    validView(initialDashboardView),
  );
  const handleViewChange = useCallback(async (mode: DashboardView) => {
    setDashboardView(mode);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase
        .from("user_settings")
        .update({ dashboard_view: mode })
        .eq("user_id", user.id);
    } catch { /* fire-and-forget — UI already updated */ }
  }, []);
  const scenarioMultiplier =
    scenario === "conservative" ? 0.85 : scenario === "optimistic" ? 1.15 : 1.0;

  // ── YTD calculations ──────────────────────────────────────────────────
  const ytdGCI = transactions.reduce((sum, tx) => sum + computeGCI(tx), 0);
  const ytdDealCount = transactions.length;
  const avgDealSize = ytdDealCount > 0 ? ytdGCI / ytdDealCount : 0;

  // ── Pipeline ──────────────────────────────────────────────────────────
  const pipelineWeightedGCI = pipelineDeals.reduce(
    (sum, d) => sum + computeWeightedGCI(d),
    0,
  );
  const pipelineCount = pipelineDeals.length;

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
  const rawProjectedGCI = projectedYearEndGCI(ytdGCI, pipelineWeightedGCI, fraction);
  const projectedGCI = rawProjectedGCI * scenarioMultiplier;

  // ── Goal & pace ─────────────────────────────────────────────────────
  const goalGCI = settings?.goal_gci ?? 0;
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

  // ── Expenses ──────────────────────────────────────────────────────────
  const expensesYTD = expenseCategories.reduce(
    (sum, cat) =>
      sum + cat.items.reduce((s, i) => s + Number(i.ytd_amount), 0),
    0,
  );
  const monthlyRecurring = expenseCategories.reduce(
    (sum, cat) =>
      sum + cat.items.reduce((s, i) => s + Number(i.monthly_recurring), 0),
    0,
  );

  // ── Survival ──────────────────────────────────────────────────────────
  const survival = survivalResult(
    settings?.monthly_brokerage_fee ?? 0,
    monthlyRecurring,
    settings?.cash_reserve ?? 0,
  );

  // ── Runway Score ──────────────────────────────────────────────────────
  const healthReport: BusinessHealthReport = buildHealthReport(
    ytdGCI, goalGCI, fraction, pipelineWeightedGCI, expensesYTD, projectedGCI, settings,
  );
  const runwayScore = computeRunwayScore(healthReport, benchmark.percentile, survival.months);

  // ── Tax estimate ──────────────────────────────────────────────────────
  // Project full-year expenses: actual YTD + remaining months of recurring.
  // Using expRemainingMonths avoids double-counting recurring costs already in expensesYTD.
  const expRemainingMonths = Math.max(0, 12 - (now.getMonth() + 1));
  const annualExpenses = expensesYTD + monthlyRecurring * expRemainingMonths;
  const projectedNet = computeProjectedNet(projectedGCI, settings);
  // Net self-employment income = gross-of-brokerage minus all business expenses
  const netForTax = Math.max(0, projectedNet - annualExpenses);
  // Per-deal set-aside is more useful against projected deal count, not just YTD
  const projectedDealCount = projectedYearEndTransactions(ytdDealCount, pipelineCount, fraction);
  const taxResult = settings
    ? calculateTax(netForTax, settings.province, Math.max(projectedDealCount, 1))
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
    const d = new Date(tx.date);
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
  const insightsLimit = dashboardView === "full" ? 5 : dashboardView === "essentials" ? 2 : 3;
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
  };

  // Derived status labels for the strip
  const paceLabel = paceStatus === "ahead" ? "Ahead" : paceStatus === "behind" ? "Behind" : "On Track";
  const runwayLabel = survival.riskLevel === "critical" ? "Critical" : survival.riskLevel === "warning" ? "Watchlist" : "Stable";
  const paceStripColor = paceStatus === "ahead" ? "text-emerald-800 bg-emerald-100 border-emerald-300" : paceStatus === "behind" ? "text-amber-800 bg-amber-100 border-amber-300" : "text-slate-700 bg-slate-100 border-slate-300";
  const runwayStripColor = survival.riskLevel === "critical" ? "text-red-800 bg-red-100 border-red-300" : survival.riskLevel === "warning" ? "text-amber-800 bg-amber-100 border-amber-300" : "text-emerald-800 bg-emerald-100 border-emerald-300";

  return (
    <div className="space-y-8">
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

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/60 pb-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight greet-fade">
            {emoji} {greeting}{firstName ? `, ${firstName}` : ""}
          </h1>
          <p className="text-sm text-muted-foreground">
            {motivationalTag}
          </p>
          {streakLabel && (
            <p className="mt-1 text-xs font-semibold text-amber-600">{streakLabel}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Year in Review button — always show if there's data */}
          {ytdDealCount > 0 && (
            <button
              onClick={() => setShowAnnualReview(true)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all",
                isDecember
                  ? "border-violet-300 bg-violet-50 text-violet-700 hover:bg-violet-100"
                  : "border-border bg-muted/40 text-muted-foreground hover:text-foreground"
              )}
            >
              <Star className="h-3 w-3" />
              {currentYear} Review
            </button>
          )}
          {/* View mode toggle */}
          <div className="flex rounded-lg border border-border bg-muted/40 p-0.5 text-xs">
            {(["essentials", "standard", "full"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => handleViewChange(mode)}
                className={cn(
                  "rounded-md px-3 py-1.5 font-medium transition-colors capitalize",
                  dashboardView === mode
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {mode.charAt(0).toUpperCase() + mode.slice(1)}
              </button>
            ))}
          </div>
          {/* Scenario toggle */}
          <div className="flex rounded-lg border border-border p-0.5 text-xs">
            {(["conservative", "base", "optimistic"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setScenario(s)}
                className={cn(
                  "rounded-md px-3 py-1.5 font-medium transition-colors",
                  scenario === s
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {s === "conservative" ? "−15%" : s === "optimistic" ? "+15%" : "Base"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── You Are Here strip ── */}
      <YouAreHereStrip
        fraction={fraction}
        pacePercent={pacePercent}
        paceStatus={paceStatus}
        goalGCI={goalGCI}
      />

      {/* ── Status strip ── */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-2.5">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-500 mr-1">
          Status
        </span>
        <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold", paceStripColor)}>
          <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
          Pace: {paceLabel}
        </span>
        <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold", runwayStripColor)}>
          <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
          Runway: {runwayLabel}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-[11px] font-semibold text-slate-600">
          <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
          Scenario: {scenario === "conservative" ? "Conservative −15%" : scenario === "optimistic" ? "Optimistic +15%" : "Base"}
        </span>
        <span className="ml-auto text-[11px] text-slate-400 hidden sm:block">
          {runwayScore.grade} · Score {runwayScore.score}/100
        </span>
      </div>

      {/* ── Period recap (month boundary) ── */}
      {periodRecap && (
        <div className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-violet-800">
              {periodRecap.monthName} recap — {fmtCurrency(periodRecap.monthGCI)} · {periodRecap.monthTx} deal{periodRecap.monthTx !== 1 ? "s" : ""}
            </p>
            <p className="text-xs text-violet-600 mt-0.5">
              {periodRecap.vsAvg >= 1.2
                ? `↑ ${Math.round((periodRecap.vsAvg - 1) * 100)}% above your monthly average`
                : periodRecap.vsAvg <= 0.8 && periodRecap.vsAvg > 0
                ? `↓ ${Math.round((1 - periodRecap.vsAvg) * 100)}% below your monthly average`
                : "Right in line with your monthly average"}
            </p>
          </div>
          <CalendarCheck className="h-5 w-5 text-violet-400 shrink-0" />
        </div>
      )}

      {/* ── Weekly Business Brief (elevated, always visible) ── */}
      {narrative && (
        <BusinessHealthNarrativeCard
          narrative={narrative}
          isOpen={narrativeOpen}
          onToggle={() => setNarrativeOpen((o) => !o)}
        />
      )}

      {/* ── Section: Business Health ── */}
      <SectionHeader label="Business Health" />

      {/* Runway Score Hero */}
      <Card className="rounded-2xl border-amber-200/60 bg-gradient-to-br from-amber-50/80 via-slate-50 to-blue-50/60 shadow-lg shadow-amber-100/50">
        <CardContent className="pt-6 pb-6">
          <div className="flex flex-wrap items-center justify-between gap-6">
            {/* Left: grade circle + score */}
            <div className="flex items-center gap-5">
              {/* Commission Gold grade circle — signature brand moment */}
              <div
                className="relative flex h-20 w-20 shrink-0 items-center justify-center rounded-full"
                style={{
                  background: "linear-gradient(135deg, #F0A800 0%, #D97706 55%, #a85c00 100%)",
                  boxShadow: "0 0 24px rgba(240,168,0,0.45), 0 0 60px rgba(240,168,0,0.14), inset 0 1px 1px rgba(255,255,255,0.22)",
                }}
              >
                <span className="text-3xl font-black leading-none" style={{ color: "#15110A" }}>
                  {runwayScore.grade}
                </span>
              </div>
              <div>
                <div className="flex items-center gap-1">
                  <span className="flex items-center gap-1">
                    <p className="text-sm font-semibold text-slate-500">Runway Score</p>
                    <MetricInfo tip="A composite score across 6 factors: pace vs goal, expense ratio, pipeline health, cash runway, trend direction, and deal consistency." />
                  </span>
                  <RunwayScoreInfoDialog />
                </div>
                <p className="text-4xl font-extrabold text-slate-800 leading-none mt-0.5">
                  {runwayScore.score}
                  <span className="text-base font-medium text-slate-400">/100</span>
                </p>
                <p className="mt-1 text-xs text-slate-500">{scoreNarrative}</p>
              </div>
            </div>
            {/* Right: survival + benchmark */}
            <div className="flex gap-6 text-right sm:gap-8">
              <div>
                <span className="flex items-center gap-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Cash Runway</p>
                  <MetricInfo tip="How many months you could sustain current expenses using only your cash reserve, with zero new income." />
                </span>
                <p className={cn("text-xl font-bold mt-0.5", riskColors[survival.riskLevel])}>
                  {formatSurvivalDisplay(survival)}
                </p>
                <p className="text-xs text-slate-400">cash coverage</p>
              </div>
              <div>
                <span className="flex items-center gap-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Cohort Rank</p>
                  <MetricInfo tip="How you rank vs Canadian agents with similar experience, based on CREA 2023 benchmarks. P75 means you out-earned 75% of your peers." />
                </span>
                {/* Gold for top-half performers — commission gold as achievement signal */}
                <p
                  className="text-xl font-bold mt-0.5"
                  style={{ color: benchmark.percentile >= 50 ? "#D97706" : "#334155" }}
                >
                  P{benchmark.percentile}
                  {benchmark.percentile >= 75 && <span className="ml-1 text-base">★</span>}
                </p>
                <p className="text-xs text-slate-400">{COHORT_LABELS[benchmark.cohort]}</p>
              </div>
            </div>
          </div>
          {/* Score components */}
          <div className="mt-5 grid grid-cols-3 gap-3 sm:grid-cols-6 border-t border-amber-200/40 pt-4">
            {runwayScore.components.map((c, i) => {
              const barColors = [
                "[&>div]:bg-blue-500",
                "[&>div]:bg-purple-500",
                "[&>div]:bg-teal-500",
                "[&>div]:bg-violet-500",
                "[&>div]:bg-emerald-500",
                "[&>div]:bg-sky-500",
              ];
              // High-scoring components (≥80) earn the gold bar
              const isTopScore = c.score >= 80;
              return (
              <div key={c.label} className="text-center">
                <p className="text-[10px] font-semibold text-slate-600">{c.label}</p>
                <p
                  className="text-sm font-bold mt-0.5"
                  style={{ color: isTopScore ? "#D97706" : "#1e293b" }}
                >
                  {c.score}
                </p>
                <Progress
                  value={c.score}
                  className={cn("mt-1.5 h-2", isTopScore ? "[&>div]:bg-amber-500" : barColors[i % barColors.length])}
                />
              </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* ── Section: Performance Metrics ── */}
      <SectionHeader label="Performance Metrics" />

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="rounded-2xl border-emerald-200 bg-gradient-to-br from-emerald-100 to-emerald-50 shadow-sm transition-all duration-200 hover:shadow-md hover:scale-[1.01]">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardDescription className="font-semibold text-emerald-800">YTD GCI</CardDescription>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-200">
              <DollarSign className="h-4 w-4 text-emerald-700" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tracking-tight text-slate-800">
              $<CountUp end={ytdGCI} decimals={0} duration={1000} />
            </div>
            {goalGCI > 0 ? (
              <>
                <p className="text-xs text-slate-500">
                  {fmtPct(ytdGCI / goalGCI)} of {fmtCompact(goalGCI)} goal
                </p>
                {fraction > 0 && paceStatus !== "no-goal" && (
                  <p className={cn(
                    "mt-0.5 text-xs font-semibold",
                    paceStatus === "ahead" ? "text-emerald-600" : "text-amber-600",
                  )}>
                    {paceStatus === "ahead"
                      ? `↑ ${fmtCurrency(paceGapAmount)} ahead of pace`
                      : `↓ ${fmtCurrency(Math.abs(paceGapAmount))} behind pace`}
                  </p>
                )}
              </>
            ) : (
              <p className="text-xs text-slate-400">Set a goal in Settings to track pace</p>
            )}
            {vsLastYearGCI !== null && ytdGCI > 0 && (
              <p className={cn("mt-0.5 text-xs font-medium", vsLastYearGCI >= 0 ? "text-emerald-600" : "text-amber-600")}>
                {vsLastYearGCI >= 0
                  ? `↑ ${fmtCurrency(vsLastYearGCI)} vs last year`
                  : `↓ ${fmtCurrency(Math.abs(vsLastYearGCI))} vs last year`}
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-blue-200 bg-gradient-to-br from-blue-100 to-blue-50 shadow-sm transition-all duration-200 hover:shadow-md hover:scale-[1.01]">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardDescription className="font-semibold text-blue-800">Deals Closed</CardDescription>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-200">
              <Briefcase className="h-4 w-4 text-blue-700" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tracking-tight text-slate-800">
              <CountUp end={ytdDealCount} duration={800} />
            </div>
            {ytdDealCount === 0 ? (
              <p className="text-xs text-slate-500">No deals yet — your first is the hardest</p>
            ) : (
              <p className="text-xs text-slate-500 flex items-center gap-1">
                <span className="flex items-center gap-1">
                  Avg Deal Size
                  <MetricInfo tip="Your total GCI divided by the number of closed deals this year." />
                </span>
                <span>· {fmtCurrency(avgDealSize)}</span>
              </p>
            )}
            {dealsThisQ > 0 && (
              <p className={cn("mt-0.5 text-xs font-medium",
                lastYearQDeals !== null
                  ? dealsThisQ >= lastYearQDeals ? "text-emerald-600" : "text-amber-600"
                  : "text-slate-500"
              )}>
                {dealsThisQ} deal{dealsThisQ !== 1 ? "s" : ""} this Q{currentQ + 1}
                {lastYearQDeals !== null ? ` · vs ${lastYearQDeals} last year` : ""}
              </p>
            )}
            {lastYearDealAtThisPoint !== null && ytdDealCount > 0 && (
              <p className="text-xs text-slate-400">
                vs {lastYearDealAtThisPoint} at this point last year
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-purple-200 bg-gradient-to-br from-purple-100 to-purple-50 shadow-sm transition-all duration-200 hover:shadow-md hover:scale-[1.01]">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardDescription className="font-semibold text-purple-800">
              <span className="flex items-center gap-1">
                Pipeline Weighted
                <MetricInfo tip="Your in-progress deals weighted by their probability of closing. A $50K deal at 60% odds counts as $30K here." />
              </span>
            </CardDescription>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-purple-200">
              <TrendingUp className="h-4 w-4 text-purple-700" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tracking-tight text-slate-800">
              {pipelineCount === 0 ? "—" : <>$<CountUp end={pipelineWeightedGCI} duration={1000} /></>}
            </div>
            <p className="text-xs text-slate-500">
              {pipelineCount === 0
                ? "Add prospects to see weighted forecasts"
                : `${pipelineCount} deal${pipelineCount !== 1 ? "s" : ""} · probability-weighted`}
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-teal-200 bg-gradient-to-br from-teal-100 to-teal-50 shadow-sm transition-all duration-200 hover:shadow-md hover:scale-[1.01]">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardDescription className="font-semibold text-teal-800">Projected Year-End</CardDescription>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-teal-200">
              <Target className="h-4 w-4 text-teal-700" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tracking-tight">
              $<CountUp end={projectedGCI} duration={1100} />
            </div>
            <div className="mt-1 flex items-center gap-2">
              <Badge
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
                <Badge variant="secondary" className="gap-1">
                  {trend === "up" ? (
                    <TrendingUp className="h-3 w-3" />
                  ) : (
                    <TrendingDown className="h-3 w-3" />
                  )}
                  {trend}
                </Badge>
              )}
            </div>
            {/* Deals needed to hit goal */}
            {goalGCI > 0 && avgDealSize > 0 && ytdGCI < goalGCI && (
              <p className="mt-1.5 text-xs text-muted-foreground">
                ~{Math.ceil((goalGCI - ytdGCI) / avgDealSize)} more deal
                {Math.ceil((goalGCI - ytdGCI) / avgDealSize) !== 1 ? "s" : ""} at avg size to hit goal
              </p>
            )}
            {goalGCI > 0 && ytdGCI >= goalGCI && (
              <p className="mt-1.5 text-xs font-semibold shimmer-text">
                🎉 Goal reached — you crushed it!
              </p>
            )}
            <p className="mt-2 text-[10px] text-muted-foreground/70">
              {seasonalSource === "agent"
                ? `Seasonality: your ${historyItems.filter((h) => (h.quarter_gci as number[]).some((v) => (v ?? 0) > 0)).length}-yr pattern`
                : seasonalSource === "national"
                  ? "Seasonality: national averages"
                  : "Seasonality: uniform (add history to improve)"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Personal Records — standard + full, only when there's data */}
      {dashboardView !== "essentials" && (transactions.length > 0 || historyItems.length > 0) && (
        <PersonalRecordsCard
          transactions={transactions}
          historyItems={historyItems}
          ytdGCI={ytdGCI}
          currentYear={currentYear}
        />
      )}

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

      {/* ── Section: Insights & Actions ── */}
      {insights.length > 0 && <SectionHeader label="Insights & Actions" />}

      {/* Top Priority Action callout */}
      {insights.length > 0 && (
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
      )}

      {/* Full insight list */}
      {insights.length > 1 && (
        <Card className="rounded-2xl border-amber-200 bg-gradient-to-br from-amber-100 to-amber-50 shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-200">
                <Sparkles className="h-3.5 w-3.5 text-amber-700" />
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

      {/* ── Section: Activity & Trends ── */}
      {dashboardView !== "essentials" && <SectionHeader label="Activity & Trends" />}

      {/* Monthly Performance Chart — Standard + Full */}
      {dashboardView !== "essentials" && (
        <Card className="rounded-2xl border-slate-200 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Monthly Performance</CardTitle>
                <CardDescription>
                  Closed GCI by month &mdash; projected months shown lighter
                </CardDescription>
              </div>
              {scenario !== "base" && (
                <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary capitalize">
                  {scenario} scenario
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <MonthlyChart data={monthlyChartData} />
          </CardContent>
        </Card>
      )}

      {/* Probability bands + benchmark row — Full only */}
      {dashboardView === "full" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="rounded-2xl border-blue-200 bg-blue-100 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Projection Range</CardTitle>
              <CardDescription>
                {bands.confidence} confidence &middot; {bands.monthsOfData} months data
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Best case (P90)</span>
                  <span>{fmtCurrency(bands.p90)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Optimistic (P75)</span>
                  <span>{fmtCurrency(bands.p75)}</span>
                </div>
                <div className="flex justify-between font-medium">
                  <span>Base (P50)</span>
                  <span>{fmtCurrency(bands.p50)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Conservative (P25)</span>
                  <span>{fmtCurrency(bands.p25)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Pessimistic (P10)</span>
                  <span>{fmtCurrency(bands.p10)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-purple-200 bg-purple-100 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Benchmark</CardTitle>
              <CardDescription>
                vs. {COHORT_LABELS[benchmark.cohort]} cohort (CREA 2023)
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
                  <span className="text-muted-foreground">National percentile</span>
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
      )}

      {/* ── Section: Planning ── */}
      {dashboardView === "full" && <SectionHeader label="Planning" />}

      {/* Tax estimate + Goal progress row — Full only */}
      {dashboardView === "full" && (
        <div className="grid gap-4 sm:grid-cols-2">
          {taxResult && (
            <Card className="rounded-2xl border-amber-200 bg-amber-100 shadow-sm">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">Tax Readiness</CardTitle>
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
                      : "bg-orange-100 text-orange-800 border-orange-200"
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
                    <span className="text-amber-900 font-medium">Set aside monthly</span>
                    <span className="font-bold text-amber-900">{fmtCurrency(recommendedMonthlySave)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Should have saved by now</span>
                    <span className="font-medium">{fmtCurrency(expectedSavedByNow)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Quarterly instalment</span>
                    <span>{fmtCurrency(quarterlyInstalment)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Per-deal set-aside</span>
                    <span>{fmtCurrency(taxResult.perDealSetAside)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {goalGCI > 0 && (
            <Card className="rounded-2xl border-emerald-200 bg-emerald-100 shadow-sm">
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
      )}

      {/* ── Section: Recent Activity ── */}
      <SectionHeader label="Recent Activity" />

      {/* Recent transactions */}
      <Card className="rounded-2xl border-slate-200 shadow-sm">
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
    </div>
  );
}

// ── YouAreHereStrip ───────────────────────────────────────────────────────

function YouAreHereStrip({
  fraction,
  pacePercent,
  paceStatus,
  goalGCI,
}: {
  fraction: number;
  pacePercent: number;
  paceStatus: string;
  goalGCI: number;
}) {
  const now = new Date();
  const doy = dayOfYear(now);
  const total = daysInYear(now);
  const week = weekOfYear(now);
  const pctThrough = Math.round(fraction * 100);
  const daysLeft = total - doy;
  const paceAbs = Math.abs(Math.round(pacePercent));
  const paceColor =
    paceStatus === "ahead"
      ? "text-emerald-600"
      : paceStatus === "behind"
      ? "text-amber-600"
      : "text-slate-500";

  return (
    <div className="rounded-xl border border-border bg-card/60 px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          You Are Here
        </span>
        <span className="text-[11px] text-muted-foreground">
          Week {week} of 52 &middot; {daysLeft} days left in {now.getFullYear()}
        </span>
      </div>
      <Progress value={pctThrough} className="h-2" />
      <div className="flex items-center justify-between mt-1.5">
        <span className="text-[11px] text-muted-foreground">Jan 1</span>
        <span className="text-[11px] font-semibold text-foreground">
          {pctThrough}% through {now.getFullYear()}
        </span>
        <span className="text-[11px] text-muted-foreground">Dec 31</span>
      </div>
      {goalGCI > 0 && paceStatus !== "no-goal" && (
        <p className={cn("mt-1.5 text-xs font-medium", paceColor)}>
          {paceStatus === "ahead"
            ? `↑ ${paceAbs}% ahead of goal pace`
            : paceStatus === "behind"
            ? `↓ ${paceAbs}% behind goal pace`
            : "Right on track with goal pace"}
        </p>
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
    const d = new Date(tx.date);
    return d.getFullYear() === recapYear && d.getMonth() === recapMonth;
  });
  const monthGCI = monthTxList.reduce((s, tx) => s + computeGCI(tx), 0);
  if (monthGCI === 0 || monthTxList.length === 0) return null;

  const monthName = new Date(recapYear, recapMonth).toLocaleString("en-CA", { month: "long" });

  // Average monthly GCI across distinct months with transactions
  const monthsWithData = new Set(
    transactions.map((tx) => {
      const d = new Date(tx.date);
      return `${d.getFullYear()}-${d.getMonth()}`;
    }),
  ).size;
  const totalGCI = transactions.reduce((s, tx) => s + computeGCI(tx), 0);
  const avgMonthly = monthsWithData > 0 ? totalGCI / monthsWithData : 0;
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
    const m = new Date(tx.date).getMonth();
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
  if (bestMonthGCI && bestMonthName) records.push({ label: "Best Month", value: fmtCurrency(bestMonthGCI), sub: bestMonthName });
  if (bestDeal) records.push({ label: "Best Single Deal", value: fmtCurrency(bestDeal), sub: "single commission" });

  if (records.length === 0) return null;

  return (
    <Card className="rounded-2xl border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-amber-600" />
          <CardTitle className="text-sm font-semibold text-amber-800">Personal Records</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-4">
          {records.map((r) => (
            <div key={r.label} className="text-center">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-600">
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

function SectionHeader({ label }: { label: string }) {
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
  { border: string; chip: string; icon: string }
> = {
  Stable:    { border: "border-l-emerald-500", chip: "bg-emerald-100 text-emerald-800 border border-emerald-200",  icon: "text-emerald-600" },
  Watchlist: { border: "border-l-amber-400",   chip: "bg-amber-100 text-amber-800 border border-amber-200",       icon: "text-amber-600"   },
  "At Risk": { border: "border-l-orange-500",  chip: "bg-orange-100 text-orange-800 border border-orange-200",    icon: "text-orange-600"  },
  Critical:  { border: "border-l-red-500",     chip: "bg-red-100 text-red-800 border border-red-200",             icon: "text-red-600"     },
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
    <Card className={cn("rounded-2xl border-l-4 bg-gradient-to-br from-slate-100 to-slate-50 shadow-sm", styles.border)}>
      {/* Clickable header — always visible */}
      <CardHeader
        className="cursor-pointer pb-2 pt-4 select-none"
        onClick={onToggle}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className={cn("flex h-7 w-7 items-center justify-center rounded-full", styles.chip.includes("emerald") ? "bg-emerald-200" : styles.chip.includes("amber") ? "bg-amber-200" : styles.chip.includes("orange") ? "bg-orange-200" : "bg-red-200")}>
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
    weight: "30%",
    description:
      "Measures how your YTD GCI tracks against your annual goal, adjusted for seasonal patterns. Full credit when you're at or ahead of expected pace.",
  },
  {
    label: "Pipeline",
    weight: "20%",
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
    label: "Setup",
    weight: "10%",
    description:
      "How complete your business profile is — annual goal, province, commission split, experience, and brokerage fee. A complete profile means more accurate projections.",
  },
  {
    label: "Benchmark",
    weight: "10%",
    description:
      "Your projected annual GCI compared to agents with similar experience (sourced from CREA cohort data). Shows where you rank within your peer group.",
  },
] as const;

const GRADE_RANGES = [
  { grade: "A+", range: "92–100", label: "Thriving",     textColor: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200" },
  { grade: "A",  range: "85–91",  label: "Strong",       textColor: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200" },
  { grade: "B",  range: "75–84",  label: "Healthy",      textColor: "text-blue-700",    bg: "bg-blue-50 border-blue-200"       },
  { grade: "C",  range: "62–74",  label: "Developing",   textColor: "text-amber-700",   bg: "bg-amber-50 border-amber-200"     },
  { grade: "D",  range: "50–61",  label: "Struggling",   textColor: "text-orange-700",  bg: "bg-orange-50 border-orange-200"   },
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
            health of your real estate business across six dimensions. It updates
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
            <div className="grid grid-cols-2 gap-2">
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
            Benchmark data is sourced from CREA 2023 national agent cohort statistics.
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
    info: "border-border",
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
    Setup: "your forecast profile is incomplete — finishing Settings will improve this",
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
    Setup: `Forecast profile is incomplete (score: ${healthReport.readinessScore}/100). Missing settings — such as goal, split structure, and experience years — reduce projection accuracy across all dashboard metrics.`,
    Benchmark: `Projected GCI of ${fmtCurrency(projectedGCI)} ranks at the ${benchmark.percentile}th percentile for your experience cohort, with a median of ${fmtCurrency(benchmark.cohortMedianGCI)} (CREA 2023 data).`,
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
  } else if (weakest.label === "Setup") {
    nextMove = "Complete your Settings profile — set your annual GCI goal, brokerage split, and experience years to unlock full forecast accuracy.";
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

function buildHealthReport(
  ytdGCI: number,
  goalGCI: number,
  fraction: number,
  pipelineWeightedGCI: number,
  expensesYTD: number,
  projectedGCI: number,
  settings: UserSettings | null,
): BusinessHealthReport {
  // Pace score: 100 if at or ahead of goal pace, scales down linearly
  let paceScore = 50;
  if (goalGCI > 0 && fraction > 0) {
    const expected = goalGCI * fraction;
    const ratio = ytdGCI / expected;
    paceScore = Math.min(100, Math.round(ratio * 100));
  }

  // Pipeline score: based on pipeline-to-remaining-goal ratio
  let pipelineScore = 30;
  const remaining = Math.max(0, goalGCI - ytdGCI);
  if (remaining > 0 && pipelineWeightedGCI > 0) {
    pipelineScore = Math.min(100, Math.round((pipelineWeightedGCI / remaining) * 100));
  } else if (goalGCI > 0 && ytdGCI >= goalGCI) {
    pipelineScore = 90;
  }

  // Expense score: lower ratio = higher score
  // Use ytdGCI (not projectedGCI) so the ratio is apples-to-apples with
  // the expense ratio shown on the Expenses page and in the Insights engine.
  let expenseScore = 80;
  if (ytdGCI > 0) {
    const ratio = expensesYTD / ytdGCI;
    if (ratio > 0.5) expenseScore = 30;
    else if (ratio > 0.35) expenseScore = 55;
    else if (ratio > 0.25) expenseScore = 75;
    else expenseScore = 90;
  }

  // Readiness score: based on forecast setup completeness
  let readinessScore = 25;
  if (settings) {
    let points = 0;
    if (settings.goal_gci > 0) points += 30;
    if (settings.goal_transactions > 0) points += 20;
    const growthRates = settings.growth_goal_year_pcts as number[] | null;
    if (growthRates && growthRates.some((r) => r > 0)) points += 25;
    if (settings.cash_reserve > 0) points += 15;
    if (settings.experience_years != null) points += 10;
    readinessScore = points;
  }

  const components = [paceScore, pipelineScore, expenseScore, readinessScore];
  const avg = components.reduce((a, b) => a + b, 0) / 4;
  const weakest = Math.min(...components);
  const weakestLabels = ["Pace", "Pipeline", "Expenses", "Setup"];
  const weakestIdx = components.indexOf(weakest);

  return {
    score: Math.round(avg),
    grade: avg >= 85 ? "A" : avg >= 75 ? "B" : avg >= 62 ? "C" : avg >= 50 ? "D" : "F",
    paceScore,
    pipelineScore,
    expenseScore,
    readinessScore,
    weakestLabel: weakestLabels[weakestIdx],
    hasEnoughData: ytdGCI > 0,
  };
}

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
