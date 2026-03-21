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
import { Badge } from "@/components/ui/badge";
import {
  DollarSign,
  Info,
  Receipt,
  Building2,
} from "lucide-react";
import Link from "next/link";
import { fmtCurrency, fmtCompact, fmtPct } from "@/lib/formatters";
import { cn } from "@/lib/utils";
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
} from "@/lib/engines/projection-engine";
import { calculate as calculateTax, marginalRate } from "@/lib/engines/canadian-tax-engine";
import { calculateCorporateTax, type CorporateTaxResult } from "@/lib/engines/corporate-tax-engine";
import { generateTaxOptimizations, type TaxOptimizationCard } from "@/lib/engines/tax-optimization-engine";
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

// ── Props ──────────────────────────────────────────────────────────────────

interface Props {
  transactions: Transaction[];
  settings: UserSettings | null;
  expenseCategories: ExpenseCategoryWithItems[];
  receiptYTD?: number;
  mileageKmTotal?: number;
  ccaAssetCount?: number;
  historyItems?: HistoryItem[];
  pipelineDeals?: PipelineDeal[];
  subscriptionTier?: string;
}

// ── OverheadBanner ─────────────────────────────────────────────────────────

function OverheadBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const dismissed = localStorage.getItem("overhead_banner_dismissed");
      if (!dismissed) setVisible(true);
    } catch {
      // localStorage may not be available in some contexts
    }
  }, []);

  function dismiss() {
    try {
      localStorage.setItem("overhead_banner_dismissed", "true");
    } catch { /* ignore */ }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="flex items-start justify-between gap-4 rounded-2xl border border-amber-300 bg-amber-600 px-5 py-4 text-white shadow-sm">
      <div className="flex items-start gap-3">
        <Receipt className="h-5 w-5 shrink-0 mt-0.5 opacity-90" />
        <div>
          <p className="font-semibold text-sm">Welcome to Overhead</p>
          <p className="text-sm text-amber-100 mt-0.5 leading-relaxed">
            In aviation, overhead means flying above something. In accounting, it means money disappearing above you. Both apply here. This is your tax command centre.
          </p>
        </div>
      </div>
      <button
        onClick={dismiss}
        className="shrink-0 rounded-lg border border-amber-400 bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-400 transition-colors whitespace-nowrap mt-0.5"
      >
        Unfortunate but understood
      </button>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export function OverheadContent({
  transactions,
  settings,
  expenseCategories,
  receiptYTD = 0,
  mileageKmTotal = 0,
  ccaAssetCount = 0,
  historyItems = [],
  pipelineDeals = [],
  subscriptionTier = "starter",
}: Props) {
  const isPro = subscriptionTier === "professional" || subscriptionTier === "team";
  const now = new Date();
  const currentYear = now.getFullYear();
  const monthsElapsed = now.getMonth() + 1;

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

  const fraction = seasonalFractionElapsed(seasonalWeights);
  const goalGCI = settings?.goal_gci ?? 0;
  const projectedGCI = projectedYearEndGCI(ytdGCI, pipelineWeightedGCI, fraction, goalGCI);
  const projectedDealCount = projectedYearEndTransactions(ytdDealCount, pipelineCount, fraction);

  // ── Expenses ───────────────────────────────────────────────────────────
  const expensesYTD = receiptYTD;
  const monthlyRecurring = expenseCategories.reduce(
    (sum, cat) =>
      sum + cat.items.reduce((s, i) => s + Number(i.monthly_recurring), 0),
    0,
  );

  const expRemainingMonths = Math.max(0, 12 - (now.getMonth() + 1));
  const annualExpenses = expensesYTD + monthlyRecurring * expRemainingMonths;

  // ── Agent net (after split/fees) ───────────────────────────────────────
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

  // ── Tax estimate ───────────────────────────────────────────────────────
  const projectedNet = (() => {
    if (!settings) return projectedGCI;
    const { agentGross } = computeAgentGross(
      projectedGCI,
      settings.split_preset,
      settings.post_cap_threshold_gci,
      settings.post_cap_agent_pct,
      settings.post_cap_brokerage_pct,
    );
    const txFees = computeTxFees(projectedGCI, settings.tx_fee_rate_pct, settings.tx_fee_annual_cap);
    const brokerageFeeAnnual = settings.monthly_brokerage_fee * 12;
    return agentGross - txFees - brokerageFeeAnnual;
  })();

  const netForTax = Math.max(0, projectedNet - annualExpenses);

  const taxResult = settings
    ? calculateTax(netForTax, settings.province, Math.max(projectedDealCount, 1))
    : null;

  const marginalTaxRate = settings
    ? marginalRate(Math.max(projectedGCI, ytdGCI), settings.province)
    : 0;

  const afterTaxPerDeal =
    projectedGCI > 0 && taxResult && projectedDealCount > 0
      ? (projectedGCI - taxResult.totalBurden) / projectedDealCount
      : 0;

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

  const recommendedMonthlySave = taxResult ? taxResult.totalBurden / 12 : 0;
  const expectedSavedByNow = Math.round(recommendedMonthlySave * monthsElapsed);
  const quarterlyInstalment = taxResult ? taxResult.totalBurden / 4 : 0;

  // ── YTD take-home ──────────────────────────────────────────────────────
  const ytdTaxSetAside = taxResult ? taxResult.totalBurden * Math.min(fraction, 1) : 0;
  const ytdEstimatedTakeHome = Math.max(0, ytdNetBeforeTax - ytdTaxSetAside);

  // ── Cap progress ───────────────────────────────────────────────────────
  const capThreshold = settings?.post_cap_threshold_gci ?? 0;
  const capConfigured = capThreshold > 0;
  const capProgress = capConfigured ? Math.min((ytdGCI / capThreshold) * 100, 100) : 0;
  const hasHitCap = capConfigured && ytdGCI >= capThreshold;

  // ── Corporate tax ──────────────────────────────────────────────────────
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

  // ── Tax savings opportunities ──────────────────────────────────────────
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
        homeOfficeMethod: (settings.home_office_method as "simplified" | "detailed") ?? "simplified",
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

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="border-b border-border/60 pb-5">
        <h1 className="text-2xl font-semibold tracking-tight">Overhead</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Tax command centre — readiness, take-home estimates, cap tracking, and savings opportunities.
        </p>
      </div>

      {/* Funny dismissible banner */}
      <OverheadBanner />

      {/* Tax Readiness + take-home overview */}
      {(taxResult || ytdGCI > 0) && (
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Tax Readiness */}
          {taxResult && settings && (
            <Card className="rounded-2xl border-amber-200 bg-white shadow-sm">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <CardTitle className="text-base">Tax Readiness</CardTitle>
                      <GuideLink anchor="tax-estimate" label="Tax estimate explained in Guide" />
                    </div>
                    <CardDescription>
                      {taxResult.taxYear} · {PROVINCE_LABELS[settings.province]} · {fmtPct(taxResult.effectiveRate)} effective rate
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
                  Estimates only · Not tax advice · Consult a qualified accountant
                </p>
              </CardContent>
            </Card>
          )}

          {/* Net Take-Home */}
          {ytdGCI > 0 && settings && (
            <Card className="rounded-2xl border-emerald-200 bg-white shadow-sm">
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
                      <p className="text-[10px] text-slate-400">set aside now</p>
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
                  <span className="italic">Estimate only · Not tax advice</span>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Cap Progress */}
      {capConfigured && (
        <Card className="rounded-2xl border-violet-200 bg-white shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-1.5">
                <CardTitle className="text-sm font-semibold">Cap Progress</CardTitle>
                <MetricInfo tip={`Your commission cap is ${fmtCurrency(capThreshold)}. After hitting cap, you keep ${settings ? fmtPct(settings.post_cap_agent_pct) : ""} of each deal's GCI — often 100% — instead of your normal split.`} />
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
      )}

      {/* Tax Savings Opportunities */}
      {taxOptResult && taxOptResult.cardCount > 0 && (
        <Card className="rounded-2xl border-amber-200 bg-white shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">💰 Tax Savings Opportunities</CardTitle>
                <CardDescription>
                  Estimated ~{fmtCurrency(taxOptResult.totalEstimatedSavings)}/yr in potential savings
                </CardDescription>
              </div>
              <Link
                href="/forecast"
                className="text-xs text-amber-700 hover:text-amber-900 font-medium transition-colors shrink-0"
              >
                See all on Forecast →
              </Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-[10px] text-amber-700/70 leading-relaxed italic">
              For educational purposes only — not tax advice. Consult a qualified accountant.
            </p>
            {taxOptResult.cards.map((card: TaxOptimizationCard) => (
              <div key={card.id} className="rounded-lg border border-amber-100 bg-white p-3">
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
      )}

      {/* Corporate Tax Estimate */}
      {corpTaxResult && settings && (
        <Card className="rounded-2xl border-violet-200 bg-white shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-violet-600" />
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
              <div className="flex justify-between items-center rounded-md bg-violet-100/80 px-3 py-1.5">
                <span className="text-violet-900 font-medium">Corporate tax ({fmtPct(corpTaxResult.totalCorpRate)})</span>
                <span className="font-bold text-violet-900">{fmtCurrency(corpTaxResult.corporateTax)}</span>
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
              <div className="mt-3 rounded-md bg-violet-100 border border-violet-200 px-3 py-2">
                <p className="text-xs text-violet-800 font-medium">
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
            <p className="mt-3 text-[10px] text-violet-700/70 leading-relaxed">
              Estimates only · Not tax advice · Consult a qualified accountant
            </p>
          </CardContent>
        </Card>
      )}

      {/* No data state */}
      {ytdGCI === 0 && !taxResult && !capConfigured && (
        <Card className="rounded-2xl border-dashed border-amber-300 bg-amber-50/50">
          <CardContent className="p-6 text-center">
            <Receipt className="h-8 w-8 text-amber-400 mx-auto mb-3" />
            <p className="font-semibold text-slate-700">No tax data yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Add transactions and complete your Settings (province, split, goal) to unlock tax readiness estimates.
            </p>
            <div className="mt-4 flex justify-center gap-3">
              <Link href="/transactions" className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 transition-colors">
                Add Transactions
              </Link>
              <Link href="/settings" className="inline-flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors">
                Open Settings
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Disclaimer */}
      <p className="text-center text-xs leading-relaxed text-muted-foreground/60 pb-2">
        All tax estimates are approximations for planning purposes only — not financial, tax, or professional advice.
        Actual tax owed will differ. Always consult a qualified accountant or tax professional.{" "}
        <a href="/terms" className="underline underline-offset-2 hover:text-muted-foreground">
          Terms of Service
        </a>
        .
      </p>
    </div>
  );
}
