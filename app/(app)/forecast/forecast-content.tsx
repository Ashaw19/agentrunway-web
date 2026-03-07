"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { fmtCurrency, fmtCompact, fmtPct } from "@/lib/formatters";
import {
  computeGCI,
  computeWeightedGCI,
  getAgentPct,
  computeTxFees,
  computeAgentGross,
  PROVINCE_LABELS,
  type Transaction,
  type PipelineDeal,
  type UserSettings,
  type ExpenseCategoryWithItems,
} from "@/lib/types/database";
import {
  seasonalFractionElapsed,
  projectedYearEndGCI,
  projectedYearEndTransactions,
  daysRemaining,
  paceVsGoalPercent,
  dailyPaceRequired,
} from "@/lib/engines/projection-engine";
import { calculate as calculateTax } from "@/lib/engines/canadian-tax-engine";
import { probabilityBands, fiveYearBands } from "@/lib/engines/probabilistic-forecast-engine";
import { survivalResult } from "@/lib/engines/survival-engine";
import { compare } from "@/lib/engines/benchmark-engine";
import { generateAdvisory, type AdvisorCard } from "@/lib/engines/advisor-engine";
import { ProbabilityChart, type ProbabilityDataPoint } from "@/components/probability-chart";
import { ProGate } from "@/components/pro-gate";

interface Props {
  settings: UserSettings | null;
  transactions: Transaction[];
  pipelineDeals: PipelineDeal[];
  expenseCategories: ExpenseCategoryWithItems[];
  subscriptionTier?: string;
}

export function ForecastContent({
  settings,
  transactions,
  pipelineDeals,
  expenseCategories,
  subscriptionTier = "starter",
}: Props) {
  const isPro = subscriptionTier === "professional" || subscriptionTier === "team";
  if (!settings) {
    return (
      <div className="py-20 text-center text-muted-foreground">
        Settings not found. Complete onboarding first.
      </div>
    );
  }

  const currentYear = new Date().getFullYear();

  // ── YTD from transactions ─────────────────────────────────────────────
  const ytdTx = transactions.filter(
    (tx) => new Date(tx.date).getFullYear() === currentYear,
  );
  const ytdGCI = ytdTx.reduce((sum, tx) => sum + computeGCI(tx), 0);
  const ytdDealCount = ytdTx.length;

  // ── Pipeline weighted ─────────────────────────────────────────────────
  const pipelineWeighted = pipelineDeals.reduce(
    (sum, d) => sum + computeWeightedGCI(d),
    0,
  );

  // ── Seasonality-aware projection ──────────────────────────────────────
  const seasonalWeights = settings.use_national_seasonality
    ? (settings.national_quarter_pcts ?? [0.25, 0.25, 0.25, 0.25])
    : [0.25, 0.25, 0.25, 0.25];
  const fraction = seasonalFractionElapsed(seasonalWeights);
  const projectedGCI = projectedYearEndGCI(ytdGCI, pipelineWeighted, fraction);
  const projectedDeals = projectedYearEndTransactions(ytdDealCount, pipelineDeals.length, fraction);

  // ── Financial waterfall ───────────────────────────────────────────────
  const { agentGross, brokerageTake } = computeAgentGross(
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
  const projectedNet = agentGross - txFees - brokerageFeeAnnual;

  // ── Expenses ──────────────────────────────────────────────────────────
  const expensesYTD = expenseCategories.reduce(
    (sum, cat) => sum + cat.items.reduce((s, i) => s + Number(i.ytd_amount), 0),
    0,
  );
  const monthlyRecurring = expenseCategories.reduce(
    (sum, cat) => sum + cat.items.reduce((s, i) => s + Number(i.monthly_recurring), 0),
    0,
  );
  const annualExpenses = expensesYTD + monthlyRecurring * 12;

  // ── Tax estimate ──────────────────────────────────────────────────────
  const netForTax = Math.max(0, projectedNet - annualExpenses);
  const taxResult = calculateTax(netForTax, settings.province, Math.max(projectedDeals, 1));

  // ── Probability bands ─────────────────────────────────────────────────
  const bands = probabilityBands(transactions, projectedGCI, fraction);

  // ── 5-year growth plan with probability bands ─────────────────────────
  const growthRates = (settings.growth_goal_year_pcts as number[]) ?? [0, 0, 0, 0, 0];
  const growthDecimals = growthRates.map((r) => r / 100);
  const yearBands = fiveYearBands(projectedGCI, growthDecimals, bands);

  // ── Goal gap ──────────────────────────────────────────────────────────
  const goalGCI = settings.goal_gci;
  const gciGap = goalGCI - ytdGCI;
  const avgDealGCI = ytdDealCount > 0 ? ytdGCI / ytdDealCount : 0;
  const dealsNeeded = avgDealGCI > 0 ? Math.ceil(Math.max(0, gciGap) / avgDealGCI) : null;
  const pacePercent = goalGCI > 0 ? paceVsGoalPercent(goalGCI, ytdGCI, fraction) : 0;
  const daysLeft = daysRemaining();
  const dailyNeeded = goalGCI > 0 ? dailyPaceRequired(goalGCI, ytdGCI, daysLeft) : 0;

  // ── Survival ──────────────────────────────────────────────────────────
  const survival = survivalResult(
    settings.monthly_brokerage_fee,
    monthlyRecurring,
    settings.cash_reserve,
  );

  // ── Benchmark ─────────────────────────────────────────────────────────
  const benchmark = compare(projectedGCI, settings.experience_years);

  // ── Advisor cards ─────────────────────────────────────────────────────
  const advisorCards = generateAdvisory({
    transactions,
    pipelineDeals,
    goalGCI,
    splitPreset: settings.split_preset,
    seasonalWeights,
    expensesYTD,
    monthlyRecurringExpenses: monthlyRecurring,
    projectedYearEndGCI: projectedGCI,
    marketYoYGrowth: settings.market_yoy_growth_pct / 100,
    benchmarkPercentile: benchmark.percentile,
    survivalMonths: survival.months,
    capIsConfigured: settings.post_cap_threshold_gci > 0,
    hasHitCap: settings.post_cap_threshold_gci > 0 && ytdGCI >= settings.post_cap_threshold_gci,
    gciRemainingToCap: Math.max(0, settings.post_cap_threshold_gci - ytdGCI),
    postCapAgentPct: settings.post_cap_agent_pct,
  }, 3);

  const riskColors: Record<string, string> = {
    critical: "text-red-600",
    warning: "text-amber-600",
    healthy: "text-emerald-600",
    strong: "text-emerald-600",
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-border/60 pb-5">
        <h1 className="text-2xl font-semibold tracking-tight">Forecast</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Year-end projections & financial outlook &middot; {PROVINCE_LABELS[settings.province]}
        </p>
      </div>

      {/* Projection summary */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-t-2 border-t-primary/40">
          <CardHeader className="pb-2">
            <CardDescription>Projected GCI</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fmtCurrency(projectedGCI)}</div>
            <p className="text-xs text-muted-foreground">
              P25–P75: {fmtCompact(bands.p25)}–{fmtCompact(bands.p75)}
            </p>
          </CardContent>
        </Card>

        <Card className="border-t-2 border-t-primary/40">
          <CardHeader className="pb-2">
            <CardDescription>Projected Deals</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{projectedDeals}</div>
            <p className="text-xs text-muted-foreground">
              {ytdDealCount} closed + {pipelineDeals.length} pipeline
            </p>
          </CardContent>
        </Card>

        <Card className="border-t-2 border-t-primary/40">
          <CardHeader className="pb-2">
            <CardDescription>After-Tax Net</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {fmtCurrency(Math.max(0, netForTax - taxResult.totalBurden))}
            </div>
            <p className="text-xs text-muted-foreground">
              {fmtPct(taxResult.effectiveRate)} effective rate
            </p>
          </CardContent>
        </Card>

        <Card className="border-t-2 border-t-primary/40">
          <CardHeader className="pb-2">
            <CardDescription>Cash Runway</CardDescription>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${riskColors[survival.riskLevel]}`}>
              {survival.label}
            </div>
            <p className="text-xs text-muted-foreground">
              {fmtCurrency(survival.monthlyBurn)}/mo burn
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Financial waterfall with tax */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Financial Waterfall</CardTitle>
          <CardDescription>
            Projected income breakdown for {currentYear}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span>Projected GCI</span>
              <span className="font-medium">{fmtCurrency(projectedGCI)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>
                Brokerage split ({fmtPct(1 - getAgentPct(settings.split_preset))})
              </span>
              <span>-{fmtCurrency(brokerageTake)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Transaction fees</span>
              <span>-{fmtCurrency(txFees)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Brokerage desk fees</span>
              <span>-{fmtCurrency(brokerageFeeAnnual)}</span>
            </div>
            <Separator />
            <div className="flex justify-between font-medium">
              <span>Agent Gross (Pre-Tax)</span>
              <span>{fmtCurrency(projectedNet)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Business expenses</span>
              <span>-{fmtCurrency(annualExpenses)}</span>
            </div>
            <Separator />
            <div className="flex justify-between font-medium">
              <span>Net Self-Employment Income</span>
              <span>{fmtCurrency(netForTax)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>CPP/QPP contributions</span>
              <span>-{fmtCurrency(taxResult.totalCPP)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Federal income tax</span>
              <span>-{fmtCurrency(taxResult.federalTax)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Provincial income tax</span>
              <span>-{fmtCurrency(taxResult.provincialTax)}</span>
            </div>
            <Separator />
            <div className="flex justify-between text-base font-semibold">
              <span>Estimated After-Tax Net</span>
              <span>{fmtCurrency(Math.max(0, netForTax - taxResult.totalBurden))}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tax details */}
      <ProGate
        isPro={isPro}
        feature="Tax Planning"
        description="Quarterly instalment amounts, per-deal set-asides, and effective tax rate — available on the Professional plan."
      >
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tax Planning</CardTitle>
            <CardDescription>
              {taxResult.taxYear} estimates &middot; {PROVINCE_LABELS[settings.province]}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="text-center">
                <p className="text-2xl font-bold">{fmtCurrency(taxResult.quarterlyEstimate)}</p>
                <p className="text-xs text-muted-foreground">Quarterly instalment</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold">{fmtCurrency(taxResult.perDealSetAside)}</p>
                <p className="text-xs text-muted-foreground">Per-deal set-aside</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold">{fmtPct(taxResult.effectiveRate)}</p>
                <p className="text-xs text-muted-foreground">Effective rate (all-in)</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </ProGate>

      {/* Goal gap analysis */}
      {goalGCI > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Goal Gap Analysis</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Progress
              value={Math.min((ytdGCI / goalGCI) * 100, 100)}
              className="h-3"
            />
            <div className="flex justify-between text-sm">
              <span>
                {fmtCurrency(ytdGCI)} of {fmtCurrency(goalGCI)}
              </span>
              <span>{fmtPct(ytdGCI / goalGCI)}</span>
            </div>
            {gciGap > 0 ? (
              <div className="space-y-1 text-sm text-muted-foreground">
                <p>
                  {fmtCurrency(gciGap)} remaining
                  {dealsNeeded != null && ` \u2014 ~${dealsNeeded} deals needed`}
                </p>
                <p>
                  Pace: {pacePercent >= 0 ? "+" : ""}{Math.round(pacePercent)}% &middot;{" "}
                  Need {fmtCurrency(dailyNeeded)}/day for {daysLeft} days
                </p>
              </div>
            ) : (
              <Badge variant="default">Goal reached!</Badge>
            )}
          </CardContent>
        </Card>
      )}

      {/* Probability bands — chart + text summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Projection Range</CardTitle>
          <CardDescription>
            {bands.confidence} confidence &middot; {bands.monthsOfData} months of data
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Visual chart */}
          {(() => {
            const chartData: ProbabilityDataPoint[] = (() => {
              const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
              const now = new Date();
              const currentMonth = now.getMonth();
              return MONTHS.slice(currentMonth).map((month, i) => {
                const t = (i + 1) / Math.max(12 - currentMonth, 1);
                return {
                  label: month,
                  p10: bands.p10 * t,
                  p25: bands.p25 * t,
                  p50: bands.p50 * t,
                  p75: bands.p75 * t,
                  p90: bands.p90 * t,
                };
              });
            })();
            return <ProbabilityChart data={chartData} />;
          })()}
          {/* Text reference */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 pt-1 text-sm sm:grid-cols-3">
            {[
              { label: "P90 (Best)", value: bands.p90 },
              { label: "P75 (Optimistic)", value: bands.p75 },
              { label: "P50 (Base)", value: bands.p50, bold: true },
              { label: "P25 (Conservative)", value: bands.p25 },
              { label: "P10 (Pessimistic)", value: bands.p10 },
            ].map((row) => (
              <div
                key={row.label}
                className={`flex justify-between gap-2 ${row.bold ? "font-medium" : "text-muted-foreground"}`}
              >
                <span className="truncate">{row.label}</span>
                <span className="shrink-0">{fmtCurrency(row.value)}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 5-Year growth plan with probability bands */}
      {yearBands.length > 0 && (
        <ProGate
          isPro={isPro}
          feature="5-Year Growth Plan"
          description="Multi-year GCI projections with probability bands — available on the Professional plan."
        >
          <Card>
            <CardHeader>
              <CardTitle className="text-base">5-Year Growth Plan</CardTitle>
              <CardDescription>
                Projections with widening probability bands
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {yearBands.map((yb, i) => (
                  <div key={yb.year}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{yb.year}</span>
                      <span className="font-semibold">{fmtCurrency(yb.p50)}</span>
                      <span className="text-xs text-muted-foreground">
                        +{growthRates[i] ?? 0}%
                      </span>
                    </div>
                    <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                      <span>P25: {fmtCompact(yb.p25)}</span>
                      <span>P75: {fmtCompact(yb.p75)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </ProGate>
      )}

      {/* Advisor cards */}
      {advisorCards.length > 0 && (
        <ProGate
          isPro={isPro}
          feature="AI Advisor"
          description="Data-driven recommendations sorted by potential revenue impact — available on the Professional plan."
        >
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Advisor</CardTitle>
              <CardDescription>
                Data-driven recommendations sorted by potential impact
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {advisorCards.map((card) => (
                  <AdvisorCardRow key={card.id} card={card} />
                ))}
              </div>
            </CardContent>
          </Card>
        </ProGate>
      )}
    </div>
  );
}

// ── Advisor card component ────────────────────────────────────────────────

function AdvisorCardRow({ card }: { card: AdvisorCard }) {
  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-semibold">{card.title}</p>
          <Badge variant="secondary" className="mt-1 text-xs">
            {card.estimatedImpact}
          </Badge>
        </div>
      </div>
      <ul className="mt-2 space-y-1">
        {card.evidence.map((e, i) => (
          <li key={i} className="text-xs text-muted-foreground">
            &middot; {e}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-sm">{card.action}</p>
    </div>
  );
}
