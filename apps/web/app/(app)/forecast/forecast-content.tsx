"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ExplainButton } from "@/components/explain-button";
import { GuideLink } from "@/components/guide-link";
import { Separator } from "@/components/ui/separator";
import { fmtCurrency, fmtCompact, fmtPct } from "@/lib/formatters";
import { CANONICAL_TAX_DISCLAIMER_SHORT } from "@/lib/flight-crew/constants";
import {
  computeGCI,
  computeWeightedGCI,
  activePipelineDeals,
  getAgentPct,
  PROVINCE_LABELS,
  type Transaction,
  type PipelineDeal,
  type UserSettings,
  type ExpenseCategoryWithItems,
  type HistoryItem,
  type ListingAppointment,
} from "@/lib/types/database";
import { computePlanGross } from "@/lib/engines/real-compensation-engine";
import {
  seasonalFractionElapsed,
  projectedYearEndGCI,
  projectedYearEndTransactions,
  computeListingWeightedGCI,
  daysRemaining,
  paceVsGoalPercent,
  dailyPaceRequired,
} from "@/lib/engines/projection-engine";
import { calculate as calculateTax, gstHstRate, gstHstLabel, marginalRate } from "@/lib/engines/canadian-tax-engine";
import { computeHSTCollected } from "@/lib/engines/hst-engine";
import { calculateCorporateTax } from "@/lib/engines/corporate-tax-engine";
import { probabilityBands, fiveYearBands } from "@/lib/engines/probabilistic-forecast-engine";
import { survivalResult, riskColorBand, type RiskColorBand } from "@/lib/engines/survival-engine";
import { computeEffectiveCashForSurvival, computePipelineMonthlyIncome } from "@/lib/engines/effective-cash";
import { compare } from "@/lib/engines/benchmark-engine";
import { generateAdvisory, type AdvisorCard } from "@/lib/engines/advisor-engine";
import { generateTaxOptimizations, type TaxOptimizationCard } from "@/lib/engines/tax-optimization-engine";
import dynamic from "next/dynamic";
import type { ProbabilityDataPoint } from "@/components/probability-chart";

const ProbabilityChart = dynamic(() => import("@/components/probability-chart").then(m => m.ProbabilityChart), { ssr: false });
import Link from "next/link";
import { Settings, CalendarCheck, Building2, TrendingDown, TrendingUp, AlertTriangle, Rocket, Plus, DollarSign, BarChart3, Wallet, PartyPopper, Lightbulb, Target, CheckCircle2, Coins } from "lucide-react";
import * as LucideIcons from "lucide-react";
import { cn } from "@/lib/utils";
import { KpiStrip, CockpitStat, ScoreDial, scoreBand, SEMANTIC } from "@/components/cockpit-ui";

// ── CRA quarterly remittance helper ─────────────────────────────────────────
function nextRemittanceDate(from: Date): { date: Date; label: string; quarter: string } {
  // CRA quarterly filer deadlines: Apr 30, Jul 31, Oct 31, Jan 31
  // Compare by calendar date only (strip time) so deadline-day itself counts as "today / 0 days away"
  const fromDate = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const year = from.getFullYear();
  const candidates = [
    { date: new Date(year, 3, 30),     quarter: "Q1", label: "April 30" },
    { date: new Date(year, 6, 31),     quarter: "Q2", label: "July 31" },
    { date: new Date(year, 9, 31),     quarter: "Q3", label: "October 31" },
    { date: new Date(year + 1, 0, 31), quarter: "Q4", label: "January 31" },
  ];
  return candidates.find(c => c.date >= fromDate) ?? candidates[candidates.length - 1];
}

interface Props {
  settings: UserSettings | null;
  transactions: Transaction[];
  pipelineDeals: PipelineDeal[];
  expenseCategories: ExpenseCategoryWithItems[];
  historyItems: HistoryItem[];
  listingAppointments?: ListingAppointment[];
  isPro?: boolean;
  receiptYTD?: number;
  mileageKmTotal?: number;
  ccaAssetCount?: number;
  recurringExpMonthly?: number;
  recurringExpYTD?: number;
}

export function ForecastContent({
  settings,
  transactions,
  pipelineDeals,
  listingAppointments,
  expenseCategories,
  historyItems,
  isPro: isPro = false,
  receiptYTD: receiptYTDProp = 0,
  mileageKmTotal = 0,
  ccaAssetCount = 0,
  recurringExpMonthly = 0,
  recurringExpYTD = 0,
}: Props) {
  // ── Scenario selector (Conservative −15% / Base / Optimistic +15%) ────
  const [scenario, setScenario] = useState<"conservative" | "base" | "optimistic">("base");

  if (!settings) {
    return (
      <div className="py-20 text-center text-muted-foreground">
        Settings not found. Complete onboarding first.
      </div>
    );
  }

  const currentYear = new Date().getFullYear();

  // ── YTD from transactions ─────────────────────────────────────────────
  // `transactions.date` is a Postgres `date` (date-only). `new Date("2026-01-01")`
  // parses as UTC midnight, which is the PREVIOUS day in every Canadian zone —
  // so a Jan 1 close reads as last year and drops out of YTD. Anchor at local
  // noon, the idiom the dashboard uses (dashboard-content.tsx:243/935/3026/3063).
  const ytdTx = transactions.filter(
    (tx) => new Date(tx.date + "T12:00:00").getFullYear() === currentYear,
  );
  const ytdGCI = ytdTx.reduce((sum, tx) => sum + computeGCI(tx), 0);
  const ytdDealCount = ytdTx.length;

  // ── Pipeline weighted ─────────────────────────────────────────────────
  // Terminal stages excluded via the canonical filter — a "closed" deal is
  // already counted in ytdGCI as a transaction, so including it here would
  // double-count it inside projectedYearEndGCI below.
  // Hoisted so the weighted-GCI reduce and the deal COUNT are derived from
  // the SAME filtered array. #258 filtered the money and left the count raw,
  // which fed terminal deals into projectedYearEndTransactions at +0.3 each.
  const livePipelineDeals = activePipelineDeals(pipelineDeals);
  const pipelineWeighted = livePipelineDeals.reduce(
    (sum, d) => sum + computeWeightedGCI(d),
    0,
  );

  // Listing appointments weighted by status probability
  // Canonical helper (projection-engine) — shared listing probability table +
  // weighting formula. Keeps forecast projected GCI aligned with dashboard,
  // reports, chat, and MCP. See dashboard_metric_divergence_fix_2026-06-26.md.
  const listingWeightedGCI = computeListingWeightedGCI(listingAppointments);
  const totalPipelineWeighted = pipelineWeighted + listingWeightedGCI;

  // ── Seasonality-aware projection ──────────────────────────────────────
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
    (settings.use_national_seasonality
      ? (settings.national_quarter_pcts ?? [0.25, 0.25, 0.25, 0.25])
      : [0.25, 0.25, 0.25, 0.25]);
  const fraction = seasonalFractionElapsed(seasonalWeights);
  const rawProjectedGCI = projectedYearEndGCI(ytdGCI, totalPipelineWeighted, fraction, settings.goal_gci);
  const scenarioMultiplier = scenario === "conservative" ? 0.85 : scenario === "optimistic" ? 1.15 : 1.0;
  const projectedGCI = rawProjectedGCI * scenarioMultiplier;
  const projectedDeals = projectedYearEndTransactions(ytdDealCount, livePipelineDeals.length, fraction);

  // ── Financial waterfall ───────────────────────────────────────────────
  // Plan-aware waterfall (REAL analytic or legacy split) — mirrors
  // effective-cash.ts:projectedAgentNet. brokerageTake = GCI − agent share
  // (REAL: company dollar + any team override; simple: brokerage %).
  const planProjected = computePlanGross(settings, projectedGCI, {
    dealCount: projectedDeals,
    asOf: new Date().toISOString().slice(0, 10),
  });
  const agentGross = planProjected.shareBeforePlanFees;
  const brokerageTake = Math.max(0, projectedGCI - agentGross);
  const txFees = planProjected.planFees;
  const brokerageFeeAnnual = settings.monthly_brokerage_fee * 12;
  const projectedNet = planProjected.grossAfterPlan - brokerageFeeAnnual;

  // ── Expenses ──────────────────────────────────────────────────────────
  // Includes both legacy expense_items.monthly_recurring AND new recurring_expenses table
  const receiptTotal = receiptYTDProp;
  const legacyMonthlyRecurring = expenseCategories.reduce(
    (sum, cat) => sum + cat.items.reduce((s, i) => s + Number(i.monthly_recurring), 0),
    0,
  );
  const monthlyRecurring = legacyMonthlyRecurring + recurringExpMonthly;
  const _now = new Date();
  // Integer months elapsed (1-12) — matches the dashboard's expMonthsElapsed.
  // Fractional getDate()/30 (fixed 2026-06-26) diverged expensesYTD from the
  // dashboard. See dashboard_metric_divergence_fix_2026-06-26.md.
  const _monthsElapsed = _now.getMonth() + 1;
  const legacyRecurringYTDEstimate = legacyMonthlyRecurring * _monthsElapsed;
  const expensesYTD = Math.max(receiptTotal, legacyRecurringYTDEstimate) + recurringExpYTD;
  // Project full-year: actual YTD + remaining months of recurring
  const remainingMonths = Math.max(0, 12 - (_now.getMonth() + 1));
  const annualExpenses = expensesYTD + monthlyRecurring * remainingMonths;

  // ── Tax estimate ──────────────────────────────────────────────────────
  const netForTax = Math.max(0, projectedNet - annualExpenses);
  const taxResult = calculateTax(netForTax, settings.province, Math.max(projectedDeals, 1));
  const marginalTaxRate = marginalRate(netForTax, settings.province);

  // ── Corporate tax estimate (incorporated users only) ──────────────────
  const corpTaxResult = settings.is_incorporated
    ? calculateCorporateTax({
        corporateIncome: netForTax,
        province: settings.province,
        compensationMethod:
          (settings.compensation_method as "salary" | "dividends" | "mixed") ?? "salary",
        dealCount: Math.max(projectedDeals, 1),
      })
    : null;

  // ── GST/HST collected on commissions (only for registered agents) ─────
  // D-4 fix (Audit 1 2026-04-22): canonical HST helper respects
  // `brokerageWithholdsHst` (returns 0 when brokerage remits). See hst-engine.ts.
  const isGstRegistered = settings.gst_hst_registered;
  const taxLabel = gstHstLabel(settings.province);
  const taxRate = gstHstRate(settings.province);
  const gstHstCollectedYTD = computeHSTCollected({
    ytdGCI,
    hstRate: taxRate,
    isRegistered: isGstRegistered ?? false,
    brokerageWithholdsHst: settings.brokerage_withholds_hst ?? false,
  });
  const gstHstCollectedProjected = computeHSTCollected({
    ytdGCI: projectedGCI,
    hstRate: taxRate,
    isRegistered: isGstRegistered ?? false,
    brokerageWithholdsHst: settings.brokerage_withholds_hst ?? false,
  });

  // ── CRA remittance calendar ────────────────────────────────────────────
  const today = new Date();
  const remittance = nextRemittanceDate(today);
  const daysUntilRemittance = Math.ceil((remittance.date.getTime() - today.getTime()) / 86400000);
  const isUrgent = daysUntilRemittance <= 30;

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
  // Survival cash input MUST be cashPosition.effectiveCash (not raw cash_reserve)
  // to match dashboard + chat. See memory/feedback_data_consistency_protocol.md.
  // Pipeline monthly income via canonical helper (D-1, Audit 1 2026-04-22).
  const pipelineMonthlyEst = computePipelineMonthlyIncome(pipelineWeighted, fraction);
  const { cashPosition: forecastCashPosition } = computeEffectiveCashForSurvival({
    settings,
    ytdGCI,
    expensesYTD,
    monthlyRecurring,
    projectedGCI,
    projectedDealCount: projectedDeals,
    fraction,
    now: _now,
  });
  const survival = survivalResult(
    settings.monthly_brokerage_fee,
    monthlyRecurring,
    forecastCashPosition.effectiveCash,
    pipelineMonthlyEst,
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

  // ── Tax Optimization Engine ─────────────────────────────────────────────
  const hasExpensesInCategory = (key: string) =>
    expenseCategories.some(
      (cat) => cat.key === key && cat.items.some((i) => Number(i.ytd_amount) > 0 || Number(i.monthly_recurring) > 0),
    );

  const taxOptInput = {
    netIncome: netForTax,
    projectedGCI,
    annualExpenses,
    dealCount: Math.max(projectedDeals, 1),
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
  };

  const taxOptResult = generateTaxOptimizations(taxOptInput);

  // Cash-runway color — single semantic contract via the engine's
  // riskColorBand() so healthy (4–<6mo) reads amber/watch, not emerald.
  // §9.1 hexes (for the dark cockpit strip) so the band reads identically to
  // every other instrument. Spec: memory/spec_runway_score_canonical_bands.md §9.1/§9.5.
  const riskBandHex: Record<RiskColorBand, string> = {
    red: SEMANTIC.risk,
    amber: SEMANTIC.watch,
    emerald: SEMANTIC.strong,
    slate: SEMANTIC.none,
  };

  // ── Break-even analysis ───────────────────────────────────────────────
  // Plan-aware: under 'real' use the projection's effective split (net of
  // plan fees) so break-even math matches the waterfall above.
  const agentPctVal =
    settings.comp_plan === "real" ? planProjected.effectiveAgentPct : getAgentPct(settings.split_preset);
  const avgDealGCIForBreakEven = ytdDealCount > 0
    ? ytdGCI / ytdDealCount
    : projectedGCI / Math.max(projectedDeals, 1);
  // Per-deal tx fee (proportional to GCI)
  const perDealTxFee = avgDealGCIForBreakEven * ((settings.tx_fee_rate_pct ?? 0) / 100);
  // Per-deal contribution to covering annual overhead
  const perDealContribution = avgDealGCIForBreakEven * agentPctVal - perDealTxFee;
  // Annual fixed overhead (brokerage fee + projected expenses)
  const annualOverhead = brokerageFeeAnnual + annualExpenses;
  const breakEvenDeals = perDealContribution > 0
    ? Math.ceil(annualOverhead / perDealContribution)
    : null;
  const ytdDealsPastBreakEven = breakEvenDeals !== null
    ? Math.max(0, ytdDealCount - breakEvenDeals)
    : null;

  // ── Cap milestone ─────────────────────────────────────────────────────
  const capThreshold = settings.post_cap_threshold_gci;
  const capConfigured = capThreshold > 0;
  const hasHitCap = capConfigured && ytdGCI >= capThreshold;
  const gciToCap = Math.max(0, capThreshold - ytdGCI);
  const capProgress = capConfigured ? Math.min((ytdGCI / capThreshold) * 100, 100) : 0;
  const avgDealForCap = ytdDealCount > 0 ? ytdGCI / ytdDealCount : 0;
  const dealsToCap = avgDealForCap > 0 && !hasHitCap
    ? Math.ceil(gciToCap / avgDealForCap)
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Forecast</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Where you&apos;ll land this year — and what to do about the gap. &middot; {PROVINCE_LABELS[settings.province]}
          </p>
        </div>
        {/* Scenario selector — applies a multiplier to the projected GCI and all downstream numbers */}
        <div className="flex shrink-0 rounded-lg border border-slate-200 p-0.5 text-xs">
          {(["conservative", "base", "optimistic"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setScenario(s)}
              className={cn(
                "rounded-md px-3 py-1.5 font-medium transition-colors",
                scenario === s
                  ? "bg-slate-800 text-white"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {s === "conservative" ? "−15%" : s === "optimistic" ? "+15%" : "Base"}
            </button>
          ))}
        </div>
      </div>

      {/* First-run guidance banner */}
      {transactions.length === 0 && (
        <Card className="border-dashed border-amber-300 bg-amber-50/60">
          <CardContent className="p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-6">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600">
                <Rocket className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-semibold">Your forecast builds as you add deals.</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Log your first transaction to see projections, tax estimates, and goal tracking come to life.
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

      {/* Projection summary — cockpit instrument strip */}
      <KpiStrip cols={4} label={`Year-end projection · ${scenario === "conservative" ? "Conservative" : scenario === "optimistic" ? "Optimistic" : "Base"} scenario`}>
        <CockpitStat
          label="Projected GCI"
          value={fmtCurrency(projectedGCI)}
          color={SEMANTIC.strong}
          icon={<DollarSign className="h-3.5 w-3.5" />}
          sub={`P25–P75: ${fmtCompact(bands.p25)}–${fmtCompact(bands.p75)}`}
        />
        <CockpitStat
          label="Projected Deals"
          value={String(projectedDeals)}
          color="#F8FAFC"
          icon={<BarChart3 className="h-3.5 w-3.5" />}
          sub={`${ytdDealCount} closed + ${livePipelineDeals.length} pipeline`}
        />
        <CockpitStat
          label="After-Tax Net"
          value={fmtCurrency(
            corpTaxResult
              ? Math.max(0, corpTaxResult.netPersonalIncome)
              : Math.max(0, netForTax - taxResult.totalBurden),
          )}
          color={SEMANTIC.strong}
          icon={<Wallet className="h-3.5 w-3.5" />}
          sub={
            corpTaxResult
              ? `${fmtPct(corpTaxResult.combinedEffectiveRate)} combined rate`
              : `${fmtPct(taxResult.effectiveRate)} effective rate`
          }
        />
        <CockpitStat
          label="Cash Runway"
          value={survival.label}
          color={riskBandHex[riskColorBand(survival.riskLevel)]}
          icon={<CalendarCheck className="h-3.5 w-3.5" />}
          sub={`${fmtCurrency(survival.monthlyBurn)}/mo burn`}
        />
      </KpiStrip>

      {/* ── Planning insight cards: Break-even & Cap Milestone ──────────── */}
      {(breakEvenDeals !== null || capConfigured) && (
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Break-even analysis */}
          {breakEvenDeals !== null && avgDealGCIForBreakEven > 0 && (
            <Card className="rounded-xl border-slate-200 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Break-Even Analysis</CardTitle>
                <CardDescription>Deals required to cover all costs</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-end gap-2">
                  <span className="text-3xl font-bold text-slate-800">{breakEvenDeals}</span>
                  <span className="mb-1 text-sm text-muted-foreground">deals to break even</span>
                </div>
                <Progress
                  value={breakEvenDeals > 0 ? Math.min((ytdDealCount / breakEvenDeals) * 100, 100) : 100}
                  className="h-2"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{ytdDealCount} closed so far</span>
                  <span>{Math.max(0, breakEvenDeals - ytdDealCount)} more to go</span>
                </div>
                {ytdDealsPastBreakEven !== null && ytdDealsPastBreakEven > 0 && (
                  <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                    {ytdDealsPastBreakEven} surplus deal{ytdDealsPastBreakEven !== 1 ? "s" : ""} — you&apos;re generating profit
                  </p>
                )}
                <div className="border-t border-slate-100 pt-2 text-xs text-muted-foreground space-y-1">
                  <div className="flex justify-between">
                    <span>Annual overhead (fees + expenses)</span>
                    <span>{fmtCurrency(annualOverhead)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Avg net per deal after split</span>
                    <span>{fmtCurrency(perDealContribution)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Cap milestone */}
          {capConfigured && (
            <Card className={cn(
              "rounded-xl shadow-sm",
              hasHitCap
                ? "border border-emerald-200 bg-emerald-50/60"
                : "border-slate-200",
            )}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-1.5">
                  {hasHitCap && <PartyPopper className="h-4 w-4 text-emerald-600" />}
                  {hasHitCap ? "Cap Hit!" : "Cap Milestone"}
                </CardTitle>
                <CardDescription>
                  {hasHitCap
                    ? `Post-cap split: ${Math.round(settings.post_cap_agent_pct * 100)}% to you`
                    : `${fmtCurrency(gciToCap)} to reach your ${fmtCurrency(capThreshold)} cap`}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-end gap-2">
                  <span className={cn("text-3xl font-bold", hasHitCap ? "text-emerald-700" : "text-slate-800")}>
                    {hasHitCap ? fmtCurrency(ytdGCI) : fmtCurrency(ytdGCI)}
                  </span>
                  <span className="mb-1 text-sm text-muted-foreground">
                    {hasHitCap ? "GCI this year" : `of ${fmtCurrency(capThreshold)}`}
                  </span>
                </div>
                <Progress value={capProgress} className="h-2" />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{fmtPct(capProgress / 100)} of cap</span>
                  {!hasHitCap && dealsToCap > 0 && avgDealForCap > 0 && (
                    <span>~{dealsToCap} more deal{dealsToCap !== 1 ? "s" : ""} at current avg</span>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Financial waterfall with tax */}
      <Card className="rounded-xl border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-1.5">
            Financial Waterfall
            <GuideLink anchor="financial-waterfall" label="Financial Waterfall explained in Guide" />
            {isPro && <ExplainButton question="Walk me through my financial waterfall — where does every dollar of my GCI go?" />}
          </CardTitle>
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
                {settings.comp_plan === "real"
                  ? "REAL plan (company dollar + fees)"
                  : `Brokerage split (${fmtPct(1 - getAgentPct(settings.split_preset))})`}
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
              <span>{corpTaxResult ? "Net Corporate Income" : "Net Self-Employment Income"}</span>
              <span>{fmtCurrency(netForTax)}</span>
            </div>
            {corpTaxResult ? (
              // ── Incorporated waterfall ──
              <>
                {corpTaxResult.salaryTaken > 0 && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Salary to owner</span>
                    <span>-{fmtCurrency(corpTaxResult.salaryTaken)}</span>
                  </div>
                )}
                <div className="flex justify-between text-muted-foreground">
                  <span>Corporate tax ({fmtPct(corpTaxResult.totalCorpRate)})</span>
                  <span>-{fmtCurrency(corpTaxResult.corporateTax)}</span>
                </div>
                <Separator />
                <div className="flex justify-between font-medium">
                  <span>After-Tax Corp Income</span>
                  <span>{fmtCurrency(corpTaxResult.afterTaxCorporateIncome)}</span>
                </div>
                {corpTaxResult.personalTaxOnSalary > 0 && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Personal tax on salary (incl. CPP)</span>
                    <span>-{fmtCurrency(corpTaxResult.personalTaxOnSalary)}</span>
                  </div>
                )}
                {corpTaxResult.personalTaxOnDividend > 0 && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Personal tax on dividends</span>
                    <span>-{fmtCurrency(corpTaxResult.personalTaxOnDividend)}</span>
                  </div>
                )}
                <Separator />
                <div className="flex justify-between text-base font-semibold">
                  <span>Estimated After-Tax Personal Net</span>
                  <span>{fmtCurrency(Math.max(0, corpTaxResult.netPersonalIncome))}</span>
                </div>
              </>
            ) : (
              // ── Sole-proprietor waterfall ──
              <>
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
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Tax details */}
        <Card className="rounded-xl border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-1.5">
              Tax Estimates
              <GuideLink anchor="tax-estimate" label="Tax estimate methodology explained in Guide" />
              {isPro && <ExplainButton question="How are my tax estimates calculated, and what's the per-deal tax portion?" />}
            </CardTitle>
            <CardDescription>
              {taxResult.taxYear} estimates &middot; {PROVINCE_LABELS[settings.province]}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* HST/GST Collected — only shown for GST/HST-registered agents */}
            {isGstRegistered ? (
              <>
                <div className="flex items-center justify-between py-2 border-b border-border/50">
                  <div>
                    <p className="text-sm font-medium">{taxLabel} Collected YTD</p>
                    <p className="text-xs text-muted-foreground">
                      On {fmtCurrency(ytdGCI)} GCI &middot; {(taxRate * 100).toFixed(taxRate === 0.14975 ? 3 : 0)}% rate &middot; tax portion estimated for remittance
                    </p>
                  </div>
                  <p className="text-lg font-bold tabular-nums">{fmtCurrency(gstHstCollectedYTD)}</p>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-border/50">
                  <div>
                    <p className="text-sm font-medium">{taxLabel} Full-Year Projected</p>
                    <p className="text-xs text-muted-foreground">Based on {fmtCurrency(projectedGCI)} projected GCI</p>
                  </div>
                  <p className="text-lg font-bold tabular-nums text-muted-foreground">{fmtCurrency(gstHstCollectedProjected)}</p>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-between py-2 border-b border-border/50">
                <p className="text-sm text-muted-foreground">
                  {taxLabel} tracking is available once you mark yourself as registered in Settings.
                </p>
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-3 pt-4">
              <div className="text-center">
                <p className="text-2xl font-bold tabular-nums">
                  {fmtCurrency(corpTaxResult ? corpTaxResult.totalCombinedTax / 4 : taxResult.quarterlyEstimate)}
                </p>
                <p className="text-xs text-muted-foreground">Quarterly instalment</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold tabular-nums">
                  {fmtCurrency(corpTaxResult
                    ? corpTaxResult.totalCombinedTax / Math.max(projectedDeals, 1)
                    : taxResult.perDealSetAside)}
                </p>
                <p className="text-xs text-muted-foreground">Per-deal tax portion</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold tabular-nums">
                  {fmtPct(corpTaxResult ? corpTaxResult.combinedEffectiveRate : taxResult.effectiveRate)}
                </p>
                <p className="text-xs text-muted-foreground">Effective rate (all-in)</p>
              </div>
            </div>
            {marginalTaxRate > 0 && (
              <div className="flex items-center justify-between pt-3 mt-1 border-t border-border/50">
                <span className="text-sm text-muted-foreground">Marginal tax rate</span>
                <span className="text-sm font-semibold tabular-nums">{fmtPct(marginalTaxRate)}</span>
              </div>
            )}
            <p className="mt-3 text-[10px] text-muted-foreground/70 leading-relaxed">
              {CANONICAL_TAX_DISCLAIMER_SHORT}
            </p>
          </CardContent>
        </Card>

      {/* Tax Deduction Estimates */}
      {taxOptResult.cardCount > 0 && (
        <Card className="rounded-xl border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Coins className="h-4 w-4 text-amber-600" />
              Tax Deduction Estimates
            </CardTitle>
            <CardDescription>
              Estimated ~{fmtCurrency(taxOptResult.totalEstimatedSavings)}/yr in potential savings &middot; {taxOptResult.cardCount} {taxOptResult.cardCount === 1 ? "opportunity" : "opportunities"} found
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Disclaimer banner */}
            <div className="rounded-lg border border-amber-300 bg-amber-100 p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-700 mt-0.5 shrink-0" />
                <p className="text-xs text-amber-800 leading-relaxed">
                  <span className="font-semibold">Tax Deduction Estimates — For Informational Purposes Only.</span>{" "}
                  These suggestions highlight common tax strategies for Canadian self-employed
                  real estate agents. They are NOT personalized tax advice. Estimated savings are
                  approximate and depend on your individual circumstances. Always consult a
                  qualified Canadian accountant or tax professional before making tax decisions.
                  Agent Runway does not provide tax advice and accepts no liability for tax filing outcomes.
                </p>
              </div>
            </div>

            {/* Savings cards */}
            <div className="space-y-3">
              {taxOptResult.cards.map((card) => (
                <TaxOptCardRow key={card.id} card={card} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Compensation Optimizer — incorporated users only */}
      {corpTaxResult && (
        <Card className="rounded-xl border-slate-200 shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-slate-400" />
              <div>
                <CardTitle className="text-base">Compensation Optimizer</CardTitle>
                <CardDescription>
                  {settings.corp_type === "prec" ? "PREC" : "Corporation"} &middot; {PROVINCE_LABELS[settings.province]} &middot; projected corporate income {fmtCurrency(netForTax)}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Salary vs Dividends comparison */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className={`rounded-xl border p-4 ${corpTaxResult.optimalMethod === "salary" ? "border-blue-300 bg-blue-50" : "border-border bg-muted/30"}`}>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-semibold">All Salary</p>
                  {corpTaxResult.optimalMethod === "salary" && (
                    <Badge className="bg-blue-600 text-white text-xs">Optimal</Badge>
                  )}
                </div>
                <p className="text-2xl font-bold tabular-nums">{fmtCurrency(corpTaxResult.allSalaryTotalTax)}</p>
                <p className="text-xs text-muted-foreground mt-1">Total tax burden</p>
                <p className="text-xs text-muted-foreground">Generates CPP + RRSP room</p>
              </div>
              <div className={`rounded-xl border p-4 ${corpTaxResult.optimalMethod === "dividends" ? "border-blue-300 bg-blue-50" : "border-border bg-muted/30"}`}>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-semibold">All Dividends</p>
                  {corpTaxResult.optimalMethod === "dividends" && (
                    <Badge className="bg-blue-600 text-white text-xs">Optimal</Badge>
                  )}
                </div>
                <p className="text-2xl font-bold tabular-nums">{fmtCurrency(corpTaxResult.allDividendsTotalTax)}</p>
                <p className="text-xs text-muted-foreground mt-1">Total tax burden</p>
                <p className="text-xs text-muted-foreground">No CPP — no RRSP contribution room</p>
              </div>
            </div>

            {/* Net-to-owner summary */}
            <div className="space-y-2 text-sm">
              <Separator />
              <div className="flex justify-between">
                <span>Sole-proprietor equivalent tax</span>
                <span className="text-muted-foreground">{fmtCurrency(corpTaxResult.soleProprietorTax)}</span>
              </div>
              <div className="flex justify-between font-medium">
                <span>Your current method tax ({settings.compensation_method ?? "salary"})</span>
                <span>{fmtCurrency(corpTaxResult.totalCombinedTax)}</span>
              </div>
              <div className={`flex justify-between font-semibold ${corpTaxResult.taxSavingVsSoleProp >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                <span>vs. sole proprietor</span>
                <span className="flex items-center gap-1">
                  {corpTaxResult.taxSavingVsSoleProp >= 0
                    ? <TrendingDown className="h-3.5 w-3.5" />
                    : <TrendingUp className="h-3.5 w-3.5" />}
                  {corpTaxResult.taxSavingVsSoleProp >= 0
                    ? `Saves ${fmtCurrency(corpTaxResult.taxSavingVsSoleProp)}`
                    : `Costs ${fmtCurrency(Math.abs(corpTaxResult.taxSavingVsSoleProp))} more`}
                </span>
              </div>
            </div>

            {/* Optimizer comparison */}
            {corpTaxResult.optimalSaving > 500 &&
              corpTaxResult.optimalMethod !== settings.compensation_method && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                <p className="flex items-start gap-1.5 text-sm font-medium text-blue-900">
                  <Lightbulb className="h-4 w-4 shrink-0 mt-0.5 text-blue-600" />
                  The engine estimates an all-{corpTaxResult.optimalMethod === "salary" ? "salary" : "dividends"} mix would model ~{fmtCurrency(corpTaxResult.optimalSaving)}/yr lower combined tax
                </p>
                <p className="text-xs text-blue-700/80 mt-1">
                  At {fmtCurrency(netForTax)} corporate income in {PROVINCE_LABELS[settings.province]}, {corpTaxResult.optimalMethod === "salary" ? "salary avoids non-eligible dividend tax drag" : "dividends avoids CPP above the YMPE threshold"} in this model.
                  This is an estimate based on rules published by the CRA. Verify with your accountant before making any filing or financial decision.
                </p>
              </div>
            )}

            {/* SBD passive income warning */}
            {corpTaxResult.passiveIncomeWarning && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="flex items-center gap-1.5 text-sm font-medium text-amber-900">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                  Passive income threshold exceeded
                </p>
                <p className="text-xs text-amber-700/80 mt-1">
                  Investment income over $50K reduces your Small Business Deduction limit by $5 per dollar.
                  SBD limit reduced by {fmtCurrency(corpTaxResult.sbdReductionAmount)} — consider consulting your accountant about holding company structure.
                </p>
              </div>
            )}

            <p className="text-[10px] text-muted-foreground/70 leading-relaxed">
              {CANONICAL_TAX_DISCLAIMER_SHORT} Salary vs dividend mix depends on many factors including RRSP room, CPP entitlement, and future income expectations.
            </p>
          </CardContent>
        </Card>
      )}

      {/* CRA Remittance Calendar */}
      <Card className={isUrgent ? "border-amber-200" : ""}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarCheck className="h-4 w-4 text-primary" />
              CRA Remittance Calendar
            </CardTitle>
            {isUrgent && <Badge variant="outline" className="border-amber-300 text-amber-600 text-xs">Due soon</Badge>}
          </div>
          <CardDescription>Quarterly {taxLabel} remittance — {PROVINCE_LABELS[settings.province]}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Next deadline</p>
              <p className="text-xs text-muted-foreground">{remittance.quarter} · {remittance.label}</p>
            </div>
            <p className={`text-lg font-bold tabular-nums ${isUrgent ? "text-amber-600" : "text-foreground"}`}>
              {daysUntilRemittance}d away
            </p>
          </div>
          {isGstRegistered && (
            <>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{taxLabel} collected YTD</p>
                  <p className="text-xs text-muted-foreground">Set this aside — it&apos;s the government&apos;s, not yours</p>
                </div>
                <p className="text-lg font-bold tabular-nums">{fmtCurrency(gstHstCollectedYTD)}</p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Goal gap analysis */}
      {goalGCI > 0 && (() => {
        const goalProgress = Math.min((ytdGCI / goalGCI) * 100, 100);
        return (
        <Card className="rounded-xl border-slate-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-1.5">
              <Target className="h-4 w-4 text-slate-400" />
              Goal Gap Analysis
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <ScoreDial
                score={goalProgress}
                size={56}
                hex={scoreBand(goalProgress).hex}
                isStrong={scoreBand(goalProgress).isStrong}
              />
              <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="tabular-nums">
                {fmtCurrency(ytdGCI)} of {fmtCurrency(goalGCI)}
              </span>
              <span className="tabular-nums font-medium">{fmtPct(ytdGCI / goalGCI)}</span>
            </div>
            {gciGap > 0 ? (
              <div className="space-y-1 text-sm text-muted-foreground">
                <p className="tabular-nums">
                  {fmtCurrency(gciGap)} remaining
                  {dealsNeeded != null && ` \u2014 ~${dealsNeeded} deals needed`}
                </p>
                <p className="tabular-nums">
                  Pace: {pacePercent >= 0 ? "+" : ""}{Math.round(pacePercent)}% &middot;{" "}
                  Need {fmtCurrency(dailyNeeded)}/day for {daysLeft} days
                </p>
              </div>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700">
                <CheckCircle2 className="h-4 w-4" />
                Nailed it.
              </span>
            )}
              </div>
            </div>
          </CardContent>
        </Card>
        );
      })()}

      {/* Probability bands — chart + text summary */}
      <Card className="rounded-xl border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-1.5">
            Projection Range
            <GuideLink anchor="probability-bands" label="Probability bands explained in Guide" />
            {isPro && <ExplainButton question="How are my probability bands (P10–P90) calculated and what does my range mean?" />}
          </CardTitle>
          <CardDescription>
            {bands.confidence} confidence &middot; {bands.monthsOfData} months of data
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Visual chart */}
          {bands.p50 > 0 ? (() => {
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
          })() : (
            <div className="flex h-[200px] flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
              <p>No closed transactions yet — projection bands will appear once you have deal history.</p>
              <a href="/transactions" className="text-xs text-blue-600 hover:underline font-medium">Go to Transactions →</a>
            </div>
          )}
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
          <Card className="rounded-xl border-slate-200 shadow-sm">
            <CardHeader className="flex flex-row items-start justify-between">
              <div>
                <CardTitle className="text-base">5-Year Growth Plan (Illustrative)</CardTitle>
                <CardDescription>
                  Illustrative compound projections using your annual growth rates
                </CardDescription>
              </div>
              <Link
                href="/settings#growth-plan"
                className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors shrink-0"
              >
                <Settings className="h-3 w-3" />
                Edit rates
              </Link>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {yearBands.map((yb, i) => (
                  <div key={yb.year}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium tabular-nums">{yb.year}</span>
                      <span className="font-semibold tabular-nums">{fmtCurrency(yb.p50)}</span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        +{growthRates[i] ?? 0}%
                      </span>
                    </div>
                    <div className="mt-1 flex justify-between text-xs text-muted-foreground tabular-nums">
                      <span>P25: {fmtCompact(yb.p25)}</span>
                      <span>P75: {fmtCompact(yb.p75)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
      )}

      {/* Advisor cards */}
      {advisorCards.length > 0 && (
          <Card className="rounded-xl border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Advisor</CardTitle>
              <CardDescription>
                Data-driven insights sorted by potential impact
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
      )}

      {/* Disclaimer */}
      <p className="text-center text-xs leading-relaxed text-muted-foreground/60 pb-2">
        All projections, tax estimates, and suggested actions are approximations
        for planning purposes only — not financial, tax, or professional advice. Actual
        results will differ. Always consult a qualified accountant or tax professional.{" "}
        <a href="/terms" className="underline underline-offset-2 hover:text-muted-foreground">
          Terms of Service
        </a>
        .
      </p>
    </div>
  );
}

// ── Advisor card component ────────────────────────────────────────────────

function AdvisorCardRow({ card }: { card: AdvisorCard }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-semibold">{card.title}</p>
          <Badge variant="secondary" className="mt-1 bg-blue-100 text-blue-700 text-xs">
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

// ── Tax Optimization card component ───────────────────────────────────────

const COMPLEXITY_STYLES: Record<string, string> = {
  easy: "bg-emerald-100 text-emerald-700",
  moderate: "bg-amber-100 text-amber-700",
  complex: "bg-slate-100 text-slate-700",
};

function TaxOptCardRow({ card }: { card: TaxOptimizationCard }) {
  // Convert kebab-case icon name to PascalCase for Lucide lookup
  const iconKey = card.icon.replace(/(^|-)([a-z])/g, (_: string, __: string, c: string) => c.toUpperCase());
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const IconComponent = ((LucideIcons as any)[iconKey] ?? LucideIcons.Lightbulb) as React.ComponentType<{ className?: string }>;

  return (
    <div className="rounded-xl border border-amber-100 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <div className="mt-0.5 shrink-0 rounded-lg bg-amber-100 p-1.5">
            <IconComponent className="h-4 w-4 text-amber-700" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold">{card.title}</p>
            <Badge
              variant="secondary"
              className={`mt-1 text-xs ${COMPLEXITY_STYLES[card.complexity] ?? ""}`}
            >
              {card.complexity === "easy" ? "Easy" : card.complexity === "moderate" ? "Moderate" : "Complex"}
            </Badge>
          </div>
        </div>
        <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs shrink-0 font-semibold">
          {card.estimatedSavingsLabel}
        </Badge>
      </div>
      <ul className="mt-2 space-y-1">
        {card.evidence.map((e, i) => (
          <li key={i} className="text-xs text-muted-foreground">
            &middot; {e}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-sm">
        <span className="font-medium text-amber-800">Research:</span> {card.action}
      </p>
      <p className="mt-1.5 text-[10px] text-muted-foreground/70 leading-relaxed italic">
        {card.disclaimer}
      </p>
    </div>
  );
}
