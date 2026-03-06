"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Target,
  Briefcase,
  Shield,
  BarChart2,
  Gauge,
  AlertTriangle,
  CheckCircle,
  Info,
  Lightbulb,
  Star,
} from "lucide-react";
import { fmtCurrency, fmtCompact, fmtPct } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { MonthlyChart, type MonthlyDataPoint } from "@/components/monthly-chart";
import {
  computeGCI,
  computeWeightedGCI,
  computeTxFees,
  computeAgentGross,
  type Transaction,
  type PipelineDeal,
  type UserSettings,
  type ExpenseCategoryWithItems,
} from "@/lib/types/database";
import {
  seasonalFractionElapsed,
  projectedYearEndGCI,
  paceVsGoalPercent,
  daysRemaining,
  todayDescription,
  trendDirection,
} from "@/lib/engines/projection-engine";
import { probabilityBands } from "@/lib/engines/probabilistic-forecast-engine";
import { compare, COHORT_LABELS } from "@/lib/engines/benchmark-engine";
import { survivalResult, type SurvivalResult } from "@/lib/engines/survival-engine";
import { compute as computeRunwayScore, type BusinessHealthReport, type RunwayScoreResult } from "@/lib/engines/runway-score-engine";
import { generateInsights, type Insight } from "@/lib/engines/insights-engine";
import { calculate as calculateTax } from "@/lib/engines/canadian-tax-engine";

interface Props {
  transactions: Transaction[];
  pipelineDeals: PipelineDeal[];
  settings: UserSettings | null;
  expenseCategories: ExpenseCategoryWithItems[];
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
}: Props) {
  const now = new Date();
  const currentYear = now.getFullYear();

  // ── Scenario toggle ────────────────────────────────────────────────────
  const [scenario, setScenario] = useState<"conservative" | "base" | "optimistic">("base");
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
  const seasonalWeights = settings?.use_national_seasonality
    ? (settings.national_quarter_pcts ?? [0.25, 0.25, 0.25, 0.25])
    : [0.25, 0.25, 0.25, 0.25];
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
  const projectedNet = computeProjectedNet(projectedGCI, settings);
  const taxResult = settings
    ? calculateTax(projectedNet, settings.province, Math.max(ytdDealCount, 1))
    : null;

  // ── Trend ─────────────────────────────────────────────────────────────
  const trend = trendDirection(transactions);

  // ── Insights ──────────────────────────────────────────────────────────
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
      }, 3)
    : [];

  // ── Health narrative ──────────────────────────────────────────────────
  const scoreNarrative = buildScoreNarrative(
    runwayScore, survival, paceStatus, pacePercent, healthReport,
  );
  const narrative = settings
    ? buildHealthNarrative({
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
        runwayScore,
        healthReport,
      })
    : null;

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            {todayDescription()} &middot; {currentYear} year-to-date
          </p>
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

      {/* Business Health Narrative */}
      {narrative && (
        <Card className="border-l-4 border-l-blue-500 bg-gradient-to-r from-blue-50/60 to-transparent">
          <CardHeader className="pb-2 pt-4">
            <div className="flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-blue-600" />
              <CardTitle className="text-sm font-semibold text-blue-800">
                Today&apos;s Business Snapshot
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pb-4 space-y-3">
            <p className="text-sm font-semibold text-foreground">{narrative.headline}</p>
            <ul className="space-y-1.5">
              {narrative.bullets.map((bullet, i) => (
                <li key={i} className="flex gap-2 text-sm text-muted-foreground">
                  <span className="mt-0.5 shrink-0 text-blue-400 font-bold">›</span>
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
            <div className="flex items-start gap-2 rounded-md bg-blue-100/80 px-3 py-2.5">
              <Target className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" />
              <p className="text-sm font-medium text-blue-900">{narrative.action}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Runway Score Hero */}
      <Card className="bg-gradient-to-br from-slate-50 to-blue-50 border-blue-100">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-violet-600 shadow-lg">
                <span className="text-2xl font-bold text-white">
                  {runwayScore.grade}
                </span>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Runway Score
                </p>
                <p className="text-3xl font-bold">{runwayScore.score}</p>
              </div>
            </div>
            <div className="text-right">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-muted-foreground" />
                <span className={`text-sm font-medium ${riskColors[survival.riskLevel]}`}>
                  {formatSurvivalDisplay(survival)} runway
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {COHORT_LABELS[benchmark.cohort]} &middot; P{benchmark.percentile}
              </p>
            </div>
          </div>
          {/* Score components */}
          <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-6">
            {runwayScore.components.map((c) => (
              <div key={c.label} className="text-center">
                <p className="text-xs text-muted-foreground">{c.label}</p>
                <p className="text-sm font-semibold">{c.score}</p>
                <Progress value={c.score} className="mt-1 h-1" />
              </div>
            ))}
          </div>
          {/* Score narrative */}
          <p className="mt-3 border-t border-border/60 pt-3 text-xs text-muted-foreground">
            {scoreNarrative}
          </p>
        </CardContent>
      </Card>

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-t-2 border-t-emerald-500">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardDescription>YTD GCI</CardDescription>
            <div className="rounded-md bg-emerald-50 p-1.5">
              <DollarSign className="h-4 w-4 text-emerald-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tracking-tight">{fmtCurrency(ytdGCI)}</div>
            {goalGCI > 0 ? (
              <>
                <p className="text-xs text-muted-foreground">
                  {fmtPct(ytdGCI / goalGCI)} of {fmtCompact(goalGCI)} goal
                </p>
                {fraction > 0 && paceStatus !== "no-goal" && (
                  <p className={cn(
                    "mt-0.5 text-xs font-medium",
                    paceStatus === "ahead" ? "text-emerald-600" : "text-amber-600",
                  )}>
                    {paceStatus === "ahead"
                      ? `↑ ${fmtCurrency(paceGapAmount)} ahead of pace`
                      : `↓ ${fmtCurrency(Math.abs(paceGapAmount))} behind pace`}
                  </p>
                )}
              </>
            ) : (
              <p className="text-xs text-muted-foreground">Set a goal to track pace</p>
            )}
          </CardContent>
        </Card>

        <Card className="border-t-2 border-t-blue-500">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardDescription>Closed Deals</CardDescription>
            <div className="rounded-md bg-blue-50 p-1.5">
              <Briefcase className="h-4 w-4 text-blue-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tracking-tight">{ytdDealCount}</div>
            <p className="text-xs text-muted-foreground">
              Avg {fmtCurrency(avgDealSize)} per deal
            </p>
          </CardContent>
        </Card>

        <Card className="border-t-2 border-t-violet-500">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardDescription>Active Pipeline</CardDescription>
            <div className="rounded-md bg-violet-50 p-1.5">
              <TrendingUp className="h-4 w-4 text-violet-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tracking-tight">
              {pipelineCount === 0 ? "—" : fmtCurrency(pipelineWeightedGCI)}
            </div>
            <p className="text-xs text-muted-foreground">
              {pipelineCount === 0
                ? "No active deals — add prospects"
                : `${pipelineCount} deal${pipelineCount !== 1 ? "s" : ""} · probability-weighted`}
            </p>
          </CardContent>
        </Card>

        <Card className="border-t-2 border-t-teal-500">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardDescription>Projected Year-End</CardDescription>
            <div className="rounded-md bg-teal-50 p-1.5">
              <Target className="h-4 w-4 text-teal-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tracking-tight">
              {fmtCurrency(projectedGCI)}
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
              <p className="mt-1.5 text-xs font-medium text-emerald-600">
                🎉 Goal reached!
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Monthly Performance Chart */}
      <Card className="border-t-2 border-t-emerald-500">
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

      {/* Probability bands + benchmark row */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="border-t-2 border-t-violet-500">
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

        <Card className="border-t-2 border-t-teal-500">
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

      {/* Tax estimate + Goal progress row */}
      <div className="grid gap-4 sm:grid-cols-2">
        {taxResult && (
          <Card className="border-t-2 border-t-rose-400">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Tax Estimate</CardTitle>
              <CardDescription>
                {taxResult.taxYear} &middot; {taxResult.provinceName}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Effective rate</span>
                  <span className="font-medium">{fmtPct(taxResult.effectiveRate)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Quarterly estimate</span>
                  <span>{fmtCurrency(taxResult.quarterlyEstimate)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Per-deal set-aside</span>
                  <span>{fmtCurrency(taxResult.perDealSetAside)}</span>
                </div>
                <Separator />
                <div className="flex justify-between font-medium">
                  <span>Est. total burden</span>
                  <span>{fmtCurrency(taxResult.totalBurden)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {goalGCI > 0 && (
          <Card className="border-t-2 border-t-emerald-500">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Goal Progress</CardTitle>
              <CardDescription>
                {fmtCurrency(ytdGCI)} of {fmtCurrency(goalGCI)} ({fmtPct(gciProgress / 100)})
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Progress value={gciProgress} className="h-3" />
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

      {/* Insights */}
      {insights.length > 0 && (
        <Card className="border-t-2 border-t-blue-500">
          <CardHeader>
            <CardTitle className="text-base">Insights</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {insights.map((insight) => (
                <InsightRow key={insight.id} insight={insight} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent transactions */}
      <Card className="border-t-2 border-t-emerald-500">
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

// ── Helper: Business health narrative ─────────────────────────────────────

interface NarrativeResult {
  headline: string;
  bullets: string[];
  action: string;
}

function buildHealthNarrative({
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
  runwayScore,
  healthReport,
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
  runwayScore: RunwayScoreResult;
  healthReport: BusinessHealthReport;
}): NarrativeResult {
  const pctElapsed = Math.round(fraction * 100);
  const gciGap = Math.max(0, goalGCI - ytdGCI);
  const dealsNeeded =
    avgDealSize > 0 ? Math.ceil(gciGap / avgDealSize) : null;

  // No data yet
  if (ytdGCI === 0 && pipelineCount === 0) {
    return {
      headline: "Set up your business data to unlock performance insights.",
      bullets: [
        "Add your first closed deal on the Transactions page.",
        "Add pipeline deals to see your projected year-end income.",
        "Set a GCI goal in Settings to enable pace tracking.",
      ],
      action: "Start by logging a transaction or adding a pipeline deal.",
    };
  }

  // Find weakest component
  const weakestComp = runwayScore.components.reduce((a, b) =>
    a.score < b.score ? a : b,
  );

  // Headline
  let headline: string;
  if (goalGCI <= 0) {
    headline = `Grade ${runwayScore.grade} business health — set a GCI goal in Settings to unlock pace tracking.`;
  } else if (paceStatus === "ahead") {
    headline = `${fmtCurrency(Math.abs(paceGapAmount))} ahead of pace with ${pctElapsed}% of the year elapsed.`;
  } else {
    headline = `${fmtCurrency(Math.abs(paceGapAmount))} behind pace with ${pctElapsed}% of the year elapsed.`;
  }

  // Bullets
  const bullets: string[] = [];

  if (ytdDealCount > 0) {
    bullets.push(
      `${ytdDealCount} deal${ytdDealCount !== 1 ? "s" : ""} closed YTD averaging ${fmtCurrency(avgDealSize)} — projecting ${fmtCurrency(projectedGCI)} by year-end.`,
    );
  }

  if (pipelineCount > 0) {
    bullets.push(
      `${pipelineCount} deal${pipelineCount !== 1 ? "s" : ""} in pipeline represent ${fmtCurrency(pipelineWeightedGCI)} of probability-weighted income.`,
    );
  } else {
    bullets.push(
      "No active pipeline deals — adding prospects improves forecast accuracy.",
    );
  }

  const weakInsights: Record<string, string> = {
    "Goal Pace":
      gciGap > 0 && dealsNeeded
        ? `Goal pace (${healthReport.paceScore}/100) needs work — ~${dealsNeeded} more deal${dealsNeeded !== 1 ? "s" : ""} at your average size would close the gap.`
        : `Goal pace is strong (${healthReport.paceScore}/100) — keep the momentum.`,
    Pipeline: `Pipeline depth (${healthReport.pipelineScore}/100) is your main risk — build your prospect list to protect Q3/Q4.`,
    Expenses: `Expense management (${healthReport.expenseScore}/100) needs attention — review monthly recurring costs to improve net income.`,
    Setup: `Forecast setup (${healthReport.readinessScore}/100) is incomplete — finishing your Settings profile unlocks better projections.`,
    Benchmark:
      "You're below your experience-group benchmark — focus on deal volume and average commission size.",
    Survival:
      survival.monthlyBurn > 0
        ? `Cash runway is ${formatSurvivalDisplay(survival)} — consider building a 3–6 month operating reserve.`
        : "Enable runway tracking by entering your monthly costs in Settings.",
  };

  if (weakInsights[weakestComp.label]) {
    bullets.push(weakInsights[weakestComp.label]);
  }

  // Action
  let action: string;
  if (weakestComp.label === "Goal Pace" && dealsNeeded && dealsNeeded > 0) {
    action = `Close ${dealsNeeded} more deal${dealsNeeded !== 1 ? "s" : ""} at your current average (${fmtCurrency(avgDealSize)}) to reach your ${fmtCurrency(goalGCI)} goal.`;
  } else if (weakestComp.label === "Pipeline" && pipelineCount === 0) {
    action = "Add pipeline deals to improve your forecast and Runway Score.";
  } else if (weakestComp.label === "Expenses") {
    action =
      "Review recurring expenses to bring your cost ratio below 30% of GCI.";
  } else if (weakestComp.label === "Setup") {
    action =
      "Complete your Settings profile to unlock full forecast accuracy.";
  } else if (
    weakestComp.label === "Survival" &&
    survival.monthlyBurn > 0 &&
    survival.months < 3
  ) {
    action = "Build your cash reserve to at least 3 months of operating costs.";
  } else if (pipelineCount > 0 && gciGap > 0) {
    action = `Convert pipeline deals to close the ${fmtCurrency(gciGap)} remaining gap to your goal.`;
  } else if (paceStatus === "ahead") {
    action =
      "You're on track — keep pace and consider stretching your annual goal.";
  } else {
    action =
      "Focus on pipeline conversion to improve your year-end projection.";
  }

  return { headline, bullets, action };
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
  let expenseScore = 80;
  if (projectedGCI > 0) {
    const ratio = expensesYTD / projectedGCI;
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
