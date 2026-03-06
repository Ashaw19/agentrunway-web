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
import { survivalResult } from "@/lib/engines/survival-engine";
import { compute as computeRunwayScore, type BusinessHealthReport } from "@/lib/engines/runway-score-engine";
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
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                <span className="text-2xl font-bold text-primary">
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
                  {survival.label} runway
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
        </CardContent>
      </Card>

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardDescription>YTD GCI</CardDescription>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fmtCurrency(ytdGCI)}</div>
            {goalGCI > 0 && (
              <p className="text-xs text-muted-foreground">
                {fmtPct(ytdGCI / goalGCI)} of {fmtCompact(goalGCI)} goal
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardDescription>Closed Deals</CardDescription>
            <Briefcase className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{ytdDealCount}</div>
            <p className="text-xs text-muted-foreground">
              Avg {fmtCurrency(avgDealSize)} per deal
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardDescription>Pipeline</CardDescription>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {fmtCurrency(pipelineWeightedGCI)}
            </div>
            <p className="text-xs text-muted-foreground">
              {pipelineCount} deal{pipelineCount !== 1 && "s"} weighted
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardDescription>Projected Year-End</CardDescription>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
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
          </CardContent>
        </Card>
      </div>

      {/* Monthly Performance Chart */}
      <Card>
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
        <Card>
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

        <Card>
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
          <Card>
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
          <Card>
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
        <Card>
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
      <Card>
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

  return (
    <div className="flex items-start gap-3 rounded-lg border p-3">
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${typeColors[insight.type]}`} />
      <div>
        <p className="text-sm font-medium">{insight.title}</p>
        <p className="text-xs text-muted-foreground">{insight.message}</p>
      </div>
    </div>
  );
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
