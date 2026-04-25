"use client";

import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Target,
  Briefcase,
  BarChart2,
  AlertTriangle,
  CheckCircle,
  Info,
  Lightbulb,
  Star,
  Gauge,
  Trophy,
  Sparkles,
  Compass,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Rocket,
  Plus,
} from "lucide-react";
import Link from "next/link";
import { fmtCurrency, fmtCompact, fmtPct } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import dynamic from "next/dynamic";
import type { MonthlyDataPoint } from "@/components/monthly-chart";

const MonthlyChart = dynamic(() => import("@/components/monthly-chart").then(m => m.MonthlyChart), { ssr: false });
import {
  computeGCI,
  computeWeightedGCI,
  type Transaction,
  type PipelineDeal,
  type UserSettings,
  type HistoryItem,
} from "@/lib/types/database";
import {
  seasonalFractionElapsed,
  projectedYearEndGCI,
  projectedYearEndTransactions,
  paceVsGoalPercent,
  daysRemaining,
} from "@/lib/engines/projection-engine";
import { compare, COHORT_LABELS } from "@/lib/engines/benchmark-engine";
import { computeWhereYouStand, BAND_LABELS, type PerformanceBand } from "@/lib/engines/where-you-stand-engine";
import { generateInsights, type Insight } from "@/lib/engines/insights-engine";
import { compute as computeRunwayScore } from "@/lib/engines/runway-score-engine";
import { survivalResult } from "@/lib/engines/survival-engine";
import { computeEffectiveCashForSurvival, computePipelineMonthlyIncome } from "@/lib/engines/effective-cash";
import { buildHealthReport } from "@/lib/engines/health-report";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ExplainButton } from "@/components/explain-button";
import { GuideLink } from "@/components/guide-link";

// ── MetricInfo ────────────────────────────────────────────────────────────

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

// ── Pipeline stage config ──────────────────────────────────────────────────

const PIPELINE_STAGE_CONFIG: Array<{
  key: string;
  label: string;
  dotClass: string;
  chipClass: string;
}> = [
  { key: "lead",        label: "Lead",        dotClass: "bg-slate-400",   chipClass: "border-slate-200 bg-slate-50 text-slate-600" },
  { key: "showing",     label: "Showing",     dotClass: "bg-blue-500",    chipClass: "border-blue-200 bg-blue-50 text-blue-700" },
  { key: "offer",       label: "Offer",       dotClass: "bg-amber-500",   chipClass: "border-amber-200 bg-amber-50 text-amber-700" },
  { key: "conditional", label: "Conditional", dotClass: "bg-amber-600",   chipClass: "border-amber-300 bg-amber-100 text-amber-800" },
  { key: "firm",        label: "Firm",        dotClass: "bg-emerald-500", chipClass: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  { key: "closed",      label: "Closed",      dotClass: "bg-green-600",   chipClass: "border-green-300 bg-green-50 text-green-800" },
];

// ── Insight icons ──────────────────────────────────────────────────────────

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

// ── InsightRow ─────────────────────────────────────────────────────────────

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

// ── PersonalRecords ────────────────────────────────────────────────────────

function computePersonalRecords(
  transactions: Transaction[],
  historyItems: HistoryItem[],
  ytdGCI: number,
  currentYear: number,
) {
  const bestDeal =
    transactions.length > 0
      ? Math.max(...transactions.map((tx) => computeGCI(tx)))
      : null;

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

  const allYearGCIs = [
    ...historyItems.map((h) => ({ year: h.year, gci: h.annual_gci })),
    { year: currentYear, gci: ytdGCI },
  ].filter((y) => y.gci > 0);
  const bestYearEntry = allYearGCIs.sort((a, b) => b.gci - a.gci)[0] ?? null;

  return { bestDeal, bestMonthGCI, bestMonthName, bestYear: bestYearEntry };
}

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
    transactions, historyItems, ytdGCI, currentYear,
  );

  type RecordEntry = { label: string; value: string; sub: string };
  const records: RecordEntry[] = [];
  if (bestYear) records.push({ label: "Best Year", value: fmtCurrency(bestYear.gci), sub: String(bestYear.year) });
  if (bestMonthGCI && bestMonthName) records.push({ label: "Best Month", value: fmtCurrency(bestMonthGCI), sub: bestMonthName });
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

// ── buildMonthlyChartData ──────────────────────────────────────────────────

function buildMonthlyChartData(
  transactions: Transaction[],
  projectedGCI: number,
  seasonalWeights: number[],
  currentYear: number,
  now: Date,
): MonthlyDataPoint[] {
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const currentMonth = now.getMonth();

  const actualByMonth = new Array(12).fill(0);
  transactions.forEach((tx) => {
    if (tx.date.startsWith(String(currentYear))) {
      const monthIdx = parseInt(tx.date.slice(5, 7)) - 1;
      actualByMonth[monthIdx] += computeGCI(tx);
    }
  });

  const ytdActual = actualByMonth.reduce((sum, v) => sum + v, 0);
  const remainingGCI = Math.max(0, projectedGCI - ytdActual);

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

// ── buildHealthReport imported from @/lib/engines/health-report ──────────────

// ── Props ──────────────────────────────────────────────────────────────────

interface Props {
  transactions: Transaction[];
  pipelineDeals: PipelineDeal[];
  settings: UserSettings | null;
  historyItems?: HistoryItem[];
  isPro?: boolean;
  recurringExpMonthly?: number;
  expensesYTD?: number;
}

// ── AltimeterBanner ────────────────────────────────────────────────────────

function AltimeterBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const dismissed = localStorage.getItem("altimeter_banner_dismissed");
      if (!dismissed) setVisible(true);
    } catch {
      // localStorage may not be available in some contexts
    }
  }, []);

  function dismiss() {
    try {
      localStorage.setItem("altimeter_banner_dismissed", "true");
    } catch { /* ignore */ }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-blue-300 bg-blue-600 px-5 py-4 text-white shadow-sm">
      <div className="flex items-start gap-3">
        <BarChart2 className="h-5 w-5 shrink-0 mt-0.5 opacity-90" />
        <div>
          <p className="font-semibold text-sm">Welcome to Altimeter</p>
          <p className="text-sm text-blue-100 mt-0.5 leading-relaxed">
            Your business analytics dashboard. We called it Altimeter because it measures how high you&apos;re flying financially. Yes, it&apos;s a stretch. Yes, we&apos;re committed to the bit.
          </p>
        </div>
      </div>
      <button
        onClick={dismiss}
        className="shrink-0 rounded-lg border border-blue-400 bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-400 transition-colors whitespace-nowrap mt-0.5"
      >
        Got it, lean into it
      </button>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export function AltimeterContent({
  transactions,
  pipelineDeals,
  settings,
  historyItems = [],
  isPro: isPro = false,
  recurringExpMonthly = 0,
  expensesYTD: expensesYTDProp = 0,
}: Props) {
  const now = new Date();
  const currentYear = now.getFullYear();

  // ── YTD calculations ───────────────────────────────────────────────────
  const ytdGCI = transactions.reduce((sum, tx) => sum + computeGCI(tx), 0);
  const ytdDealCount = transactions.length;

  // ── Pipeline ───────────────────────────────────────────────────────────
  const pipelineWeightedGCI = pipelineDeals.reduce(
    (sum, d) => sum + computeWeightedGCI(d),
    0,
  );
  const pipelineCount = pipelineDeals.length;

  // ── Seasonality ────────────────────────────────────────────────────────
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
  const projectedGCI = projectedYearEndGCI(ytdGCI, pipelineWeightedGCI, fraction, goalGCI);
  const gciProgress = goalGCI > 0 ? Math.min((ytdGCI / goalGCI) * 100, 100) : 0;
  const pacePercent = goalGCI > 0 ? paceVsGoalPercent(goalGCI, ytdGCI, fraction) : 0;
  const paceStatus =
    goalGCI <= 0 ? "no-goal" : pacePercent >= 0 ? "ahead" : "behind";
  const paceGapAmount = goalGCI > 0 && fraction > 0 ? ytdGCI - goalGCI * fraction : 0;

  // ── Benchmark ──────────────────────────────────────────────────────────
  const benchmark = compare(projectedGCI, settings?.experience_years ?? null);

  // ── Where You Stand ────────────────────────────────────────────────────
  const avgDealSize = ytdDealCount > 0 ? ytdGCI / ytdDealCount : 0;
  const hasPriorYearData = historyItems.some(
    h => h.year === currentYear - 1 && (h.annual_gci ?? 0) > 0,
  );
  const currentQuarter = Math.floor(now.getMonth() / 3); // 0=Q1..3=Q4
  const whereYouStand = computeWhereYouStand({
    ytdGCI,
    ytdDealCount,
    projectedGCI,
    avgDealGCI: avgDealSize,
    goalGCI,
    benchmark,
    marketMomentum: null,
    fraction,
    experienceYears: settings?.experience_years ?? null,
    cohort: benchmark.cohort,
    hasPriorYearData,
    currentQuarter,
  });

  // ── Monthly chart ──────────────────────────────────────────────────────
  const monthlyChartData: MonthlyDataPoint[] = buildMonthlyChartData(
    transactions,
    projectedGCI,
    seasonalWeights,
    currentYear,
    now,
  );

  // ── Commission side mix ────────────────────────────────────────────────
  const buyerDeals = transactions.filter(tx => tx.side === "buyer");
  const listingDeals = transactions.filter(tx => tx.side === "seller");
  const dualDeals = transactions.filter(tx => tx.side === "both");
  const buyerGCI = buyerDeals.reduce((s, tx) => s + computeGCI(tx), 0);
  const listingGCI = listingDeals.reduce((s, tx) => s + computeGCI(tx), 0);
  const dualGCI = dualDeals.reduce((s, tx) => s + computeGCI(tx), 0);

  // ── Pipeline by stage ──────────────────────────────────────────────────
  const pipelineByStage = pipelineDeals.reduce<Record<string, number>>((acc, deal) => {
    const stage = (deal.stage ?? "lead") as string;
    acc[stage] = (acc[stage] ?? 0) + 1;
    return acc;
  }, {});

  // ── Insights ───────────────────────────────────────────────────────────
  // Expense data is now fetched from page.tsx and passed as props
  const monthlyRecurring = recurringExpMonthly;
  const expensesYTD = expensesYTDProp;

  // Survival cash input MUST be cashPosition.effectiveCash (not raw cash_reserve)
  // to match dashboard + chat. See memory/feedback_data_consistency_protocol.md.
  const projectedDealCount = projectedYearEndTransactions(ytdDealCount, pipelineCount, fraction);
  const survival = settings
    ? survivalResult(
        settings.monthly_brokerage_fee ?? 0,
        monthlyRecurring,
        computeEffectiveCashForSurvival({
          settings,
          ytdGCI,
          expensesYTD,
          monthlyRecurring,
          projectedGCI,
          projectedDealCount,
          fraction,
          now,
        }).cashPosition.effectiveCash,
        // Pipeline monthly income via canonical helper (D-1, Audit 1 2026-04-22).
        computePipelineMonthlyIncome(pipelineWeightedGCI, fraction),
      )
    : survivalResult(0, monthlyRecurring, 0, computePipelineMonthlyIncome(pipelineWeightedGCI, fraction));

  const healthReport = buildHealthReport(
    ytdGCI, goalGCI, fraction, pipelineWeightedGCI, expensesYTD,
  );

  const runwayScore = computeRunwayScore(healthReport, benchmark.percentile, survival.months);

  const capThreshold = settings?.post_cap_threshold_gci ?? 0;

  const insights = settings
    ? generateInsights({
        transactions,
        pipelineDeals,
        goalGCI,
        seasonalWeights,
        expensesYTD,
        monthlyRecurringExpenses: monthlyRecurring,
        capIsConfigured: capThreshold > 0,
        hasHitCap: capThreshold > 0 && ytdGCI >= capThreshold,
        gciRemainingToCap: Math.max(0, capThreshold - ytdGCI),
        postCapAgentPct: settings.post_cap_agent_pct ?? 0,
        estimatedCapMonth: null,
        forecastReadiness: goalGCI > 0 ? 0.6 : 0,
        historyItems,
        runwayScore: runwayScore.score,
        runwayGrade: runwayScore.grade,
        runwayStateLabel: runwayScore.stateLabel,
        runwayWeakestLabel: healthReport.weakestLabel,
      }, 5)
    : [];

  // ── Last year vs this point ────────────────────────────────────────────
  const lastYearItem = historyItems.find(h => h.year === currentYear - 1) ?? null;
  const lastYearAtThisPoint = lastYearItem ? lastYearItem.annual_gci * fraction : null;
  const vsLastYearGCI = lastYearAtThisPoint !== null ? ytdGCI - lastYearAtThisPoint : null;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Altimeter</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Business analytics — monthly performance, pipeline health, and goal tracking.
        </p>
      </div>

      {/* Funny dismissible banner */}
      <AltimeterBanner />

      {/* First-run guidance banner */}
      {transactions.length === 0 && (
        <Card className="border-dashed border-amber-300 bg-amber-50/60">
          <CardContent className="p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-6">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600">
                <Rocket className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-semibold">Your performance benchmarks need data to compare.</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Add your first deal to see how you stack up against industry averages.
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Link href="/transactions" className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
                    <Plus className="h-4 w-4" />
                    Add First Deal
                  </Link>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Monthly Performance chart */}
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
          <p className="mt-2 text-[10px] text-muted-foreground/70">
            {seasonalSource === "agent"
              ? `Seasonality: your ${historyItems.filter((h) => (h.quarter_gci as number[]).some((v) => (v ?? 0) > 0)).length}-yr pattern`
              : seasonalSource === "national"
                ? "Seasonality: national averages"
                : "Seasonality: uniform (add history to improve)"}
          </p>
        </CardContent>
      </Card>

      {/* Commission Mix + Pipeline Snapshot */}
      {(ytdDealCount > 0 || pipelineCount > 0) && (
        <div className="grid gap-4 sm:grid-cols-2">
          {ytdDealCount > 0 && (
            <Card className="rounded-xl border-slate-200 shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-1.5">
                  <CardTitle className="text-sm font-semibold">Commission Mix</CardTitle>
                  <MetricInfo tip="How your closed GCI breaks down by transaction side — buyer, listing, or dual-ended." />
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
                    <MetricInfo tip="A count of active deals by pipeline stage." />
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
      )}

      {/* Goal Progress */}
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
            <div className="mt-2 flex items-center gap-3 flex-wrap">
              {fraction > 0 && paceStatus !== "no-goal" && (
                <p className={cn(
                  "text-xs font-semibold",
                  paceStatus === "ahead" ? "text-emerald-600" : "text-amber-600",
                )}>
                  {paceStatus === "ahead"
                    ? `↑ ${fmtCurrency(paceGapAmount)} ahead of pace`
                    : `↓ ${fmtCurrency(Math.abs(paceGapAmount))} behind pace`}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                {daysRemaining()} days remaining
              </p>
            </div>
            {vsLastYearGCI !== null && ytdGCI > 0 && (
              <p className={cn("mt-1 text-xs font-medium", vsLastYearGCI >= 0 ? "text-emerald-600" : "text-amber-600")}>
                {vsLastYearGCI >= 0
                  ? `↑ ${fmtCurrency(vsLastYearGCI)} vs last year`
                  : `↓ ${fmtCurrency(Math.abs(vsLastYearGCI))} vs last year`}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Personal Records */}
      {(transactions.length > 0 || historyItems.length > 0) && (
        <PersonalRecordsCard
          transactions={transactions}
          historyItems={historyItems}
          ytdGCI={ytdGCI}
          currentYear={currentYear}
        />
      )}

      {/* Insights — all 5 */}
      {insights.length > 0 && (
        <div className="space-y-4">
          <div className="rounded-xl border-2 border-primary/20 bg-primary/5 px-4 py-3 flex items-start gap-3">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 mt-0.5">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
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
                    <BarChart2 className="h-3.5 w-3.5 text-slate-500" />
                  </div>
                  <CardTitle className="text-base">All Insights</CardTitle>
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
      )}

      {/* Where You Stand */}
      {(ytdDealCount > 0) && (() => {
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
        const bandColors: Record<PerformanceBand, { bg: string; text: string; active: string }> = {
          launching:   { bg: "bg-slate-100",  text: "text-slate-500",   active: "bg-slate-700 text-white" },
          climbing:    { bg: "bg-blue-50",    text: "text-blue-500",    active: "bg-blue-600 text-white" },
          competitive: { bg: "bg-emerald-50", text: "text-emerald-500", active: "bg-emerald-600 text-white" },
          advancing:   { bg: "bg-amber-50",   text: "text-amber-600",   active: "bg-amber-500 text-white" },
          leading:     { bg: "bg-violet-50",  text: "text-violet-500",  active: "bg-violet-600 text-white" },
        };
        return (
          <Card className="rounded-xl border-slate-200 bg-white shadow-sm">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-1.5">
                <Compass className="h-4 w-4 text-slate-500" />
                <CardTitle className="text-base">Where You Stand</CardTitle>
              </div>
              <CardDescription>Competitive position, momentum, and market diagnosis</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-1.5 mb-3">
                {bands.map((band) => {
                  const isActive = band === wys.band;
                  const colors = bandColors[band];
                  return (
                    <div key={band} className="flex flex-col items-center gap-1 flex-1">
                      <div className={cn("h-2 w-full rounded-full", isActive ? colors.active : colors.bg)} />
                      <span className={cn("text-[8px] font-semibold uppercase tracking-wider", isActive ? colors.text : "text-slate-300")}>
                        {BAND_LABELS[band]}
                      </span>
                    </div>
                  );
                })}
              </div>
              <p className="text-sm font-semibold text-slate-800">{wys.identityLine}</p>
              <div className={cn("flex items-center gap-1 mt-1", momentumColor)}>
                {momentumIcon}
                <span className="text-xs font-medium">{wys.momentumLabel}</span>
                {wys.momentumDetail && <span className="text-xs text-slate-500"> — {wys.momentumDetail}</span>}
              </div>
              {wys.diagnosisLine && (
                <p className="text-xs text-slate-500 mt-2">{wys.diagnosisLine}</p>
              )}
              {wys.distanceLine && (
                <p className="text-xs text-slate-500 mt-1">{wys.distanceLine}</p>
              )}
              <p className="text-xs font-medium text-blue-600 mt-2">{wys.bridgeLine}</p>
            </CardContent>
          </Card>
        );
      })()}

      {/* Benchmark */}
      <Card className="rounded-xl border-violet-200 bg-white shadow-sm">
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

      {/* Disclaimer */}
      <p className="text-center text-xs leading-relaxed text-muted-foreground/60 pb-2">
        All projections and benchmarks are approximations for planning purposes only — not financial or professional advice.
        Benchmark data reflects industry-cohort estimates aggregated from public industry sources.
      </p>
    </div>
  );
}
