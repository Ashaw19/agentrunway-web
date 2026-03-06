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

      {/* Business Health Narrative */}
      {narrative && <BusinessHealthNarrativeCard narrative={narrative} />}

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
}: {
  narrative: HealthNarrativeResult;
}) {
  const styles = STATUS_STYLES[narrative.status];
  return (
    <Card className={cn("border-l-4", styles.border)}>
      <CardHeader className="pb-2 pt-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart2 className={cn("h-4 w-4", styles.icon)} />
            <CardTitle className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Business Health Narrative
            </CardTitle>
          </div>
          <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", styles.chip)}>
            {narrative.status}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pb-5">
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
