"use client";

import { useState, createElement } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  FileDown,
  Loader2,
  Lock,
  History,
  TrendingUp,
  TrendingDown,
  Target,
  Zap,
  BarChart2,
  DollarSign,
  Layers,
  CheckCircle,
  AlertTriangle,
  Lightbulb,
  Rocket,
  Plus,
  Receipt,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { fmtCurrency, fmtPct } from "@/lib/formatters";
import { ExplainButton } from "@/components/explain-button";
import { GuideLink } from "@/components/guide-link";
import {
  KpiStrip,
  CockpitStat,
  ScoreDial,
  scoreBand,
  SEMANTIC,
  magnitudePct,
} from "@/components/cockpit-ui";
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
import dynamic from "next/dynamic";
import type { YoYDataPoint } from "@/components/year-over-year-chart";
import type { ProbabilityDataPoint } from "@/components/probability-chart";
import type { DonutDataPoint } from "@/components/expense-donut";
import type { MonthlyDataPoint } from "@/components/monthly-chart";

const ProductionReportDialog = dynamic(() => import("@/components/production-report-dialog").then(m => m.ProductionReportDialog), { ssr: false });
const YearOverYearChart = dynamic(() => import("@/components/year-over-year-chart").then(m => m.YearOverYearChart), { ssr: false });
const ProbabilityChart = dynamic(() => import("@/components/probability-chart").then(m => m.ProbabilityChart), { ssr: false });
const ExpenseDonut = dynamic(() => import("@/components/expense-donut").then(m => m.ExpenseDonut), { ssr: false });
const MonthlyChart = dynamic(() => import("@/components/monthly-chart").then(m => m.MonthlyChart), { ssr: false });
import {
  seasonalFractionElapsed,
  projectedYearEndGCI,
  projectedYearEndTransactions,
  computeListingWeightedGCI,
  paceVsGoalPercent,
} from "@/lib/engines/projection-engine";
import {
  calculate as calculateTax,
  gstHstRate,
  gstHstLabel,
} from "@/lib/engines/canadian-tax-engine";
import { computeHSTCollected } from "@/lib/engines/hst-engine";
import { compare, COHORT_LABELS } from "@/lib/engines/benchmark-engine";
import { calculateCorporateTax } from "@/lib/engines/corporate-tax-engine";
import { survivalResult, riskColorBand, type RiskLevel, type RiskColorBand } from "@/lib/engines/survival-engine";
import { computeEffectiveCashForSurvival, computePipelineMonthlyIncome } from "@/lib/engines/effective-cash";
import {
  compute as computeRunwayScore,
} from "@/lib/engines/runway-score-engine";
import { probabilityBands } from "@/lib/engines/probabilistic-forecast-engine";
import { generateAdvisory, ADVISOR_CATEGORY_LABELS } from "@/lib/engines/advisor-engine";
import { buildHealthReport } from "@/lib/engines/health-report";
import type { CcaAsset } from "@/lib/types/database";
import { ReportsT2125Tab } from "./reports-t2125-tab";

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  settings: UserSettings | null;
  transactions: Transaction[];
  pipelineDeals: PipelineDeal[];
  listingAppointments?: ListingAppointment[];
  expenseCategories: ExpenseCategoryWithItems[];
  isPro?: boolean;
  historyItems?: HistoryItem[];
  receiptTotalsByKey?: Record<string, number>;
  /** Current-year receipts with a NULL category_key — excluded from the per-key map. */
  uncategorizedReceiptYTD?: number;
  /** T2125 tab data */
  ccaAssets?: CcaAsset[];
  expenseAmounts?: Record<string, number>;
  mileageLogs?: { km: number; deduction: number; trip_date: string }[];
  taxYear?: number;
  userId?: string;
  /** Referral summary for PDF Page 7 */
  referralSummary?: { inboundCount: number; outboundCount: number; feesEarned: number; feesPaid: number };
  recurringExpMonthly?: number;
  recurringExpYTD?: number;
}

// ── buildHealthReport imported from @/lib/engines/health-report ──────────────

function computeProjectedNet(
  projectedGCI: number,
  settings: UserSettings | null,
  projectedDealCount?: number,
): number {
  if (!settings) return projectedGCI;
  // Plan-aware (REAL analytic waterfall or legacy split) — mirrors
  // effective-cash.ts:projectedAgentNet exactly.
  const { grossAfterPlan } = computePlanGross(settings, projectedGCI, {
    dealCount: projectedDealCount,
    asOf: new Date().toISOString().slice(0, 10),
  });
  const brokerageFeeAnnual = settings.monthly_brokerage_fee * 12;
  return grossAfterPlan - brokerageFeeAnnual;
}

// Grade prose label keyed off the canonical letter grade (kept for the hero
// caption). Colour is no longer derived here — it comes from scoreBand() (§9.1).
const GRADE_LABEL: Record<string, string> = {
  "A+": "Exceptional",
  A: "Excellent",
  B: "Strong",
  C: "Developing",
  D: "Needs Work",
  F: "Critical",
};

// Color derives from the engine's single semantic contract (riskColorBand,
// §9.1/§9.5): healthy (4–<6mo) reads amber/watch, not blue. Labels stay keyed
// off the riskLevel so "Healthy" and "Warning" remain distinct words.
const RISK_BAND_STYLE: Record<RiskColorBand, { cardBorder: string; badgeCls: string; dot: string; labelColor: string }> = {
  emerald: { cardBorder: "border-emerald-200", badgeCls: "bg-emerald-100 text-emerald-800", dot: "bg-emerald-500", labelColor: "text-emerald-700" },
  amber:   { cardBorder: "border-amber-200",   badgeCls: "bg-amber-100 text-amber-800",     dot: "bg-amber-500",   labelColor: "text-amber-700" },
  red:     { cardBorder: "border-red-200",     badgeCls: "bg-red-100 text-red-800",         dot: "bg-red-500",     labelColor: "text-red-700" },
  slate:   { cardBorder: "border-slate-200",   badgeCls: "bg-slate-100 text-slate-600",     dot: "bg-slate-400",   labelColor: "text-slate-600" },
};

const RISK_LABEL: Record<RiskLevel, string> = {
  strong: "Strong",
  healthy: "Healthy",
  warning: "Warning",
  critical: "Critical",
  notConfigured: "Not Set",
};

function riskStyle(level: RiskLevel) {
  return { ...RISK_BAND_STYLE[riskColorBand(level)], label: RISK_LABEL[level] };
}

// ── Waterfall row ─────────────────────────────────────────────────────────────

function WaterfallRow({
  label,
  sublabel,
  amount,
  pctOfGCI,
  isDeduction = true,
}: {
  label: string;
  sublabel?: string;
  amount: number;
  pctOfGCI: number;
  isDeduction?: boolean;
}) {
  const barColor = isDeduction ? "bg-red-400/70" : "bg-emerald-500";
  const amtColor = isDeduction ? "text-red-600" : "text-emerald-700";
  const pct = Math.min(100, Math.abs(pctOfGCI));
  return (
    <div className="px-5 py-3 border-t border-slate-100 first:border-t-0">
      <div className="flex items-baseline justify-between mb-1.5 gap-3">
        <div className="min-w-0 flex-1">
          <span className="text-sm text-slate-700">{label}</span>
          {sublabel && <span className="ml-2 text-xs text-slate-400">{sublabel}</span>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-slate-400">{Math.round(pct)}%</span>
          <span className={`text-sm font-bold ${amtColor}`}>
            {isDeduction ? "-" : ""}{fmtCurrency(amount)}
          </span>
        </div>
      </div>
      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

const MONTH_LABELS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export function ReportsContent({
  settings,
  transactions,
  pipelineDeals,
  listingAppointments = [],
  expenseCategories,
  isPro: isPro = false,
  historyItems = [],
  receiptTotalsByKey = {},
  uncategorizedReceiptYTD = 0,
  ccaAssets = [],
  expenseAmounts = {},
  mileageLogs = [],
  taxYear,
  userId = "",
  referralSummary,
  recurringExpMonthly = 0,
  recurringExpYTD = 0,
}: Props) {
  const [downloading, setDownloading] = useState(false);
  const [histReportOpen, setHistReportOpen] = useState(false);

  // ── Tab state ────────────────────────────────────────────────────────────
  const [tab, setTab] = useState<"overview" | "t2125">("overview");

  if (!settings) {
    return (
      <div className="py-20 text-center text-muted-foreground">
        Settings not found.
      </div>
    );
  }

  const currentYear = new Date().getFullYear();
  const now = new Date();

  // ── YTD ──────────────────────────────────────────────────────────────────────
  const ytdTx = transactions.filter((tx) => tx.date.startsWith(String(currentYear)));
  const ytdGCI = ytdTx.reduce((sum, tx) => sum + computeGCI(tx), 0);
  const avgDealSize = ytdTx.length > 0 ? ytdGCI / ytdTx.length : 0;
  const buyerDeals = ytdTx.filter((tx) => tx.side === "buyer" || tx.side === "both").length;
  const sellerDeals = ytdTx.filter((tx) => tx.side === "seller" || tx.side === "both").length;

  // ── Pipeline ──────────────────────────────────────────────────────────────────
  // Hoisted so the weighted-GCI reduce, the projected deal count, the exported
  // pipelineCount, and the "N active deals" caption all derive from the SAME
  // filtered array. #258 filtered the money and left all three counts raw.
  const livePipelineDeals = activePipelineDeals(pipelineDeals);
  const pipelineWeighted = livePipelineDeals.reduce((sum, d) => sum + computeWeightedGCI(d), 0);

  // Listing appointments weighted by status probability — canonical helper
  // (projection-engine), shared with dashboard, forecast, chat, and MCP.
  // See memory/findings/dashboard_metric_divergence_fix_2026-06-26.md.
  const listingWeightedGCI = computeListingWeightedGCI(listingAppointments);
  const totalPipelineWeighted = pipelineWeighted + listingWeightedGCI;

  // ── Seasonality & Projections ─────────────────────────────────────────────────
  // Prefer agent-specific weights derived from history (same logic as dashboard)
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
  const goalGCI = settings.goal_gci ?? 0;
  const projectedGCI = projectedYearEndGCI(ytdGCI, totalPipelineWeighted, fraction, goalGCI);
  const projectedDeals = projectedYearEndTransactions(ytdTx.length, livePipelineDeals.length, fraction);
  const gciProgress = goalGCI > 0 ? Math.min((ytdGCI / goalGCI) * 100, 100) : 0;
  const pacePercent = goalGCI > 0 ? paceVsGoalPercent(goalGCI, ytdGCI, fraction) : 0;
  const paceStatus: "ahead" | "behind" | "no-goal" = goalGCI <= 0 ? "no-goal" : pacePercent >= 0 ? "ahead" : "behind";

  // ── Vs last year ──────────────────────────────────────────────────────────────
  const lastYearItem = historyItems.find((h) => h.year === currentYear - 1) ?? null;
  const vsLastYearGCI = lastYearItem && fraction > 0
    ? ytdGCI - lastYearItem.annual_gci * fraction
    : null;

  // ── Financial waterfall ───────────────────────────────────────────────────────
  // Plan-aware waterfall (REAL per-deal or legacy split) — same deal source
  // as ytdGCI so the report can never disagree with the dashboard.
  const planYtd = computePlanGross(settings, ytdGCI, {
    deals: ytdTx.map((tx) => ({ date: tx.date, gci: computeGCI(tx) })),
    windowStart: `${currentYear}-01-01`,
    windowEnd: `${currentYear + 1}-01-01`,
    asOf: now.toISOString().slice(0, 10),
  });
  const agentGross = planYtd.shareBeforePlanFees;
  const brokerageTake = Math.max(0, ytdGCI - agentGross);
  const txFees = planYtd.planFees;
  const brokerageFeeYTD = settings.monthly_brokerage_fee * (now.getMonth() + 1);
  const agentNet = planYtd.grossAfterPlan - brokerageFeeYTD;

  // ── Expenses ──────────────────────────────────────────────────────────────────
  // Includes both legacy expense_items.monthly_recurring AND new recurring_expenses table
  // Per-key totals + the uncategorized remainder. Summing only the per-key map
  // would silently drop every receipt saved without a category and understate
  // expensesYTD against the dashboard.
  const receiptTotal =
    Object.values(receiptTotalsByKey).reduce((s, v) => s + v, 0) + uncategorizedReceiptYTD;
  const legacyMonthlyRecurring = expenseCategories.reduce(
    (sum, cat) => sum + cat.items.reduce((s, i) => s + Number(i.monthly_recurring), 0),
    0,
  );
  const monthlyRecurring = legacyMonthlyRecurring + recurringExpMonthly;
  // Integer months elapsed (1-12) — matches the dashboard. See
  // dashboard_metric_divergence_fix_2026-06-26.md.
  const monthsElapsed = now.getMonth() + 1;
  const legacyRecurringYTDEstimate = legacyMonthlyRecurring * monthsElapsed;
  // Receipts and legacy recurring may overlap (same expenses tracked both ways).
  // Take the higher of the two, then add new-style recurring expenses — matches Forecast page.
  const expensesYTD = Math.max(receiptTotal, legacyRecurringYTDEstimate) + recurringExpYTD;
  const netPreTax = agentNet - expensesYTD;
  const expenseRatio = ytdGCI > 0 ? (expensesYTD / ytdGCI) * 100 : 0;

  // ── Tax ───────────────────────────────────────────────────────────────────────
  const expRemainingMonths = Math.max(0, 12 - (now.getMonth() + 1));
  const annualExpenses = expensesYTD + monthlyRecurring * expRemainingMonths;
  const projectedNet = computeProjectedNet(projectedGCI, settings, projectedDeals);
  const netForTax = Math.max(0, projectedNet - annualExpenses);
  const personalTaxResult = calculateTax(netForTax, settings.province, Math.max(projectedDeals, 1));
  const corpTaxResult = settings.is_incorporated
    ? calculateCorporateTax({
        corporateIncome: netForTax,
        province: settings.province,
        compensationMethod: (settings.compensation_method as "salary" | "dividends" | "mixed") ?? "salary",
        dealCount: Math.max(projectedDeals, 1),
      })
    : null;
  const taxResult = personalTaxResult; // keep for detailed breakdown display
  const taxBurden = corpTaxResult ? corpTaxResult.totalCombinedTax : personalTaxResult.totalBurden;
  const taxLabel = gstHstLabel(settings.province);
  const taxRate = gstHstRate(settings.province);
  // D-4 fix (Audit 1 2026-04-22): canonical HST helper respects
  // `brokerageWithholdsHst` (returns 0 when brokerage remits). See hst-engine.ts.
  const gstHstCollectedYTD = computeHSTCollected({
    ytdGCI,
    hstRate: taxRate,
    isRegistered: settings.gst_hst_registered ?? false,
    brokerageWithholdsHst: settings.brokerage_withholds_hst ?? false,
  });
  const afterTaxNet = Math.max(0, netForTax - taxBurden);

  // ── Benchmark ─────────────────────────────────────────────────────────────────
  const benchmark = compare(projectedGCI, settings.experience_years);

  // ── Survival ──────────────────────────────────────────────────────────────────
  // Survival cash input MUST be cashPosition.effectiveCash (not raw cash_reserve)
  // to match dashboard + chat. See memory/feedback_data_consistency_protocol.md.
  // Pipeline monthly income via canonical helper (D-1, Audit 1 2026-04-22).
  const pipelineMonthlyEst = computePipelineMonthlyIncome(pipelineWeighted, fraction);
  const { cashPosition: reportsCashPosition } = computeEffectiveCashForSurvival({
    settings,
    ytdGCI,
    expensesYTD,
    monthlyRecurring,
    projectedGCI,
    projectedDealCount: projectedDeals,
    fraction,
    now,
  });
  const survival = survivalResult(
    settings.monthly_brokerage_fee,
    monthlyRecurring,
    reportsCashPosition.effectiveCash,
    pipelineMonthlyEst,
  );

  // ── Runway Score ──────────────────────────────────────────────────────────────
  const healthReport = buildHealthReport(
    ytdGCI, goalGCI, fraction, pipelineWeighted, expensesYTD,
  );
  const runwayScore = computeRunwayScore(healthReport, benchmark.percentile, survival.months);
  const scoreColors = scoreBand(runwayScore.score);
  const gradeLabel = GRADE_LABEL[runwayScore.grade] ?? "—";
  const rs = riskStyle(survival.riskLevel);

  // ── Probability Bands ─────────────────────────────────────────────────────────
  const bands = probabilityBands(ytdTx, projectedGCI, fraction);
  const probChartData: ProbabilityDataPoint[] = MONTH_LABELS.map((label, i) => {
    const frac = (i + 1) / 12;
    return {
      label,
      p10: bands.p10 * frac,
      p25: bands.p25 * frac,
      p50: bands.p50 * frac,
      p75: bands.p75 * frac,
      p90: bands.p90 * frac,
    };
  });

  // ── Expense Donut ─────────────────────────────────────────────────────────────
  const donutData: DonutDataPoint[] = expenseCategories
    .map((cat) => ({
      name: cat.title,
      value: cat.items.reduce((s, i) => s + (receiptTotalsByKey[i.key] ?? 0), 0),
    }))
    .filter((d) => d.value > 0);

  // ── Advisor Cards ─────────────────────────────────────────────────────────────
  const capIsConfigured = (settings.post_cap_threshold_gci ?? 0) > 0;
  const hasHitCap = capIsConfigured && ytdGCI >= (settings.post_cap_threshold_gci ?? 0);
  const gciRemainingToCap = capIsConfigured
    ? Math.max(0, (settings.post_cap_threshold_gci ?? 0) - ytdGCI)
    : 0;
  const advisorCards = generateAdvisory({
    transactions: ytdTx,
    pipelineDeals,
    goalGCI,
    splitPreset: settings.split_preset,
    seasonalWeights,
    expensesYTD,
    monthlyRecurringExpenses: monthlyRecurring,
    projectedYearEndGCI: projectedGCI,
    marketYoYGrowth: (settings.market_yoy_growth_pct ?? 0) / 100,
    benchmarkPercentile: benchmark.percentile,
    survivalMonths: survival.months,
    capIsConfigured,
    hasHitCap,
    gciRemainingToCap,
    postCapAgentPct: settings.post_cap_agent_pct ?? 1.0,
  }, 3);

  // ── Quarterly production breakdown ───────────────────────────────────────────
  // Current year Q1-Q4 GCI and deal count computed from actual transactions
  const currentQGCI = [1, 4, 7, 10].map((startMonth) => {
    const endMonth = startMonth + 2;
    return ytdTx
      .filter((t) => {
        const m = parseInt(t.date.slice(5, 7));
        return t.status === "closed" && m >= startMonth && m <= endMonth;
      })
      .reduce((sum, t) => sum + computeGCI(t), 0);
  });
  const currentQDeals = [1, 4, 7, 10].map((startMonth) => {
    const endMonth = startMonth + 2;
    return ytdTx.filter((t) => {
      const m = parseInt(t.date.slice(5, 7));
      return t.status === "closed" && m >= startMonth && m <= endMonth;
    }).length;
  });

  // Prior year quarterly data from historyItems
  const priorYearItem = historyItems.find((h) => h.year === currentYear - 1) ?? null;
  const priorQGCI = priorYearItem ? (priorYearItem.quarter_gci as number[]) : null;

  // YoY trajectory: classify 3+ year trend as accelerating / stable / declining
  const sortedHistory = [...historyItems]
    .filter((h) => h.annual_gci > 0)
    .sort((a, b) => b.year - a.year); // most recent first
  const hasTrajectory = sortedHistory.length >= 3;
  const yoyTrajectory: "accelerating" | "stable" | "declining" | null = hasTrajectory
    ? sortedHistory[0].annual_gci > sortedHistory[1].annual_gci &&
      sortedHistory[1].annual_gci > sortedHistory[2].annual_gci
      ? "accelerating"
      : sortedHistory[0].annual_gci < sortedHistory[1].annual_gci &&
        sortedHistory[1].annual_gci < sortedHistory[2].annual_gci
      ? "declining"
      : "stable"
    : null;
  const yoyGrowthRate =
    sortedHistory.length >= 2 && sortedHistory[1].annual_gci > 0
      ? (sortedHistory[0].annual_gci - sortedHistory[1].annual_gci) / sortedHistory[1].annual_gci
      : null;

  // ── Year-over-year ────────────────────────────────────────────────────────────
  const yoyData: YoYDataPoint[] = [
    ...[...historyItems]
      .sort((a, b) => a.year - b.year)
      .map((it) => ({
        year: it.year,
        gci: it.annual_gci,
        deals: it.annual_tx,
        isCurrentYear: it.year === currentYear,
      })),
    ...(historyItems.some((it) => it.year === currentYear)
      ? []
      : ytdTx.length > 0
        ? [{ year: currentYear, gci: ytdGCI, deals: ytdTx.length, isCurrentYear: true }]
        : []),
  ];

  // ── Monthly breakdown ─────────────────────────────────────────────────────────
  // Raw month-by-month data (used for PDF + chart)
  const monthlyData = Array.from({ length: 12 }, (_, i) => {
    const mm = String(i + 1).padStart(2, "0");
    const monthTx = ytdTx.filter((tx) => tx.date.slice(5, 7) === mm);
    return {
      month: MONTH_LABELS[i],
      gci: monthTx.reduce((sum, tx) => sum + computeGCI(tx), 0),
      deals: monthTx.length,
    };
  }).filter((m) => m.gci > 0 || m.deals > 0);

  // Chart-shaped version for MonthlyChart (only months with GCI)
  const monthlyChartData: MonthlyDataPoint[] = monthlyData
    .filter((m) => m.gci > 0)
    .map((m) => ({ month: m.month, gci: m.gci, projected: false }));

  // ── PDF download ──────────────────────────────────────────────────────────────
  const handleDownload = async () => {
    setDownloading(true);
    try {
      const [{ pdf }, { BusinessReportPDF }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("@/components/pdf/business-report-pdf"),
      ]);

      // Full 12-month array for the PDF bar chart (includes zero-GCI months)
      const pdfMonthlyData = MONTH_LABELS.map((month, i) => {
        const mm = String(i + 1).padStart(2, "0");
        const monthTx = ytdTx.filter((tx) => tx.date.slice(5, 7) === mm);
        return {
          month,
          gci: monthTx.reduce((sum, tx) => sum + computeGCI(tx), 0),
          deals: monthTx.length,
        };
      });

      const pdfProps = {
        // Identity
        agentName: settings.display_name ?? "",
        brokerageName: settings.brokerage_name ?? "",
        businessName: settings.business_name ?? "",
        province: settings.province,
        year: currentYear,
        avatarUrl: settings.avatar_url || undefined,
        logoUrl: settings.business_logo_url || undefined,

        // KPIs
        ytdGCI,
        ytdDeals: ytdTx.length,
        buyerDeals,
        sellerDeals,
        avgDealSize,
        pipelineWeighted,
        pipelineCount: livePipelineDeals.length,

        // Goals + projections
        goalGCI,
        fraction,
        projectedGCI,

        // P&L
        agentPct: settings.comp_plan === "real" ? planYtd.effectiveAgentPct : getAgentPct(settings.split_preset),
        brokerageTake,
        txFees,
        brokerageFeeYTD,
        agentGrossNet: agentGross - txFees - brokerageFeeYTD,
        expensesYTD,
        netPreTax,
        afterTaxNet,

        // Tax
        projectedNet,
        taxResult,
        gstHstCollectedYTD,
        gstHstLabel: taxLabel,

        // Expenses
        expenseRatio,
        expenseCategories,
        monthlyRecurring,
        receiptTotalsByKey,

        // Projections
        bands,
        monthlyData: pdfMonthlyData,

        // Engines
        benchmark,
        survival,
        runwayScore,
        advisorCards,

        // Transactions
        transactions: ytdTx,

        // Year-over-year (from history items)
        historyYears: (historyItems ?? []).map((h) => ({
          year: h.year,
          gci: h.annual_gci,
          transactions: h.annual_tx,
        })),

        // Referral summary for Page 7
        referralSummary,
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const blob = await pdf(createElement(BusinessReportPDF, pdfProps) as any).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `the-runway-briefing-${currentYear}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("PDF generation failed:", err);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-8">

      {/* ── Header ────────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 border-b border-border/60 pb-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
          <p className="text-sm text-muted-foreground">
            {settings.display_name && <>{settings.display_name} &middot; </>}
            {currentYear} &middot; {PROVINCE_LABELS[settings.province]}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {historyItems.length > 0 && (
            <Button size="sm" variant="outline" onClick={() => setHistReportOpen(true)}>
              <History className="mr-1.5 h-3.5 w-3.5" />
              History
            </Button>
          )}
          {isPro ? (
            <Button variant="outline" size="sm" onClick={handleDownload} disabled={downloading}>
              {downloading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FileDown className="mr-2 h-4 w-4" />
              )}
              {downloading ? "Generating…" : "Download PDF"}
            </Button>
          ) : (
            <Link
              href="/pricing"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors"
            >
              <Lock className="h-3.5 w-3.5" />
              Download PDF
            </Link>
          )}
        </div>
      </div>

      {/* ── First-run guidance banner ──────────────────────────────────────── */}
      {transactions.length === 0 && (
        <Card className="border-dashed border-amber-300 bg-amber-50/60">
          <CardContent className="p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-6">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600">
                <Rocket className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-semibold">Reports generate from your transaction and expense data.</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Start by adding deals and tracking expenses to unlock your financial overview.
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Link href="/transactions" className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
                    <Plus className="h-4 w-4" />
                    Add First Deal
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

      {/* ── Tab bar ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 border-b border-border/60">
        {(["overview", "t2125"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              tab === t
                ? "text-foreground border-b-2 border-foreground -mb-px"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "overview" ? "Overview" : "T2125 / Tax Form"}
          </button>
        ))}
      </div>

      {/* ── Tab: T2125 ───────────────────────────────────────────────────────── */}
      {tab === "t2125" && settings && (
        <ReportsT2125Tab
          settings={settings}
          transactions={transactions.filter((tx) => tx.date.startsWith(String(taxYear ?? new Date().getFullYear())))}
          expenseAmounts={expenseAmounts}
          ccaAssets={ccaAssets}
          mileageLogs={mileageLogs}
          taxYear={taxYear ?? new Date().getFullYear()}
          userId={userId}
          referralSummary={referralSummary}
        />
      )}

      {/* ── Tab: Overview ────────────────────────────────────────────────────── */}
      {tab === "overview" && (<>

      {/* ── 1. Business Health Score (Hero) ───────────────────────────────────── */}
      {/* Dark cockpit instrument hero — the canonical ScoreDial replaces the
          former hand-rolled gold gauge + gradeStyle ladder. Colour comes from
          the §9.1 band (scoreBand); gold appears only when the score is Strong. */}
      <div className="relative overflow-hidden rounded-2xl border-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 shadow-[0_10px_24px_-14px_rgba(2,6,23,0.45),0_34px_60px_-30px_rgba(2,6,23,0.55)]">
        <div className="absolute top-0 left-0 right-0 h-[3px] bg-slate-700/60">
          <div
            className="h-full"
            style={{ width: `${Math.max(0, Math.min(100, runwayScore.score))}%`, backgroundColor: scoreColors.isStrong ? "#F0A800" : scoreColors.hex }}
          />
        </div>
        <div className="px-6 py-4 border-b border-slate-700/50 flex items-center gap-2">
          <Zap className="h-4 w-4 text-slate-400" />
          <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">Business Health Score</span>
        </div>
        <div className="px-6 py-6 flex flex-col sm:flex-row gap-8 items-center sm:items-start">
          {/* Canonical ScoreDial — band colour + Strong-gold from the engine. */}
          <div className="flex flex-col items-center gap-3 shrink-0">
            <ScoreDial
              score={runwayScore.score}
              size={112}
              hex={scoreColors.hex}
              isStrong={scoreColors.isStrong}
              numberColor="#F8FAFC"
            />
            <div className="text-center">
              <div className="text-2xl font-black leading-none tabular-nums" style={{ color: scoreColors.isStrong ? "#F0A800" : "#F8FAFC" }}>
                {runwayScore.grade}
              </div>
              <div className="mt-1 text-xs font-semibold text-slate-400">{gradeLabel}</div>
            </div>
          </div>
          {/* Component sub-scores — §9.1 magnitude bars, band colour per score. */}
          <div className="flex-1 grid sm:grid-cols-2 gap-x-8 gap-y-4 w-full">
            {runwayScore.components.map((comp) => {
              const band = scoreBand(comp.score);
              return (
                <div key={comp.label}>
                  <div className="flex justify-between mb-1.5 text-xs">
                    <span className="text-slate-200 font-medium">{comp.label}</span>
                    <span className="text-slate-400">
                      {comp.weight} &middot; <span className="text-slate-100 font-semibold tabular-nums">{Math.round(comp.score)}</span>
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-700/60 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${magnitudePct(comp.score, 100)}%`,
                        backgroundColor: band.isStrong ? "#F0A800" : band.hex,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        {!runwayScore.hasEnoughData && (
          <div className="px-6 pb-4">
            <p className="text-xs text-slate-400">Add closed transactions to get a fully personalised score.</p>
          </div>
        )}
      </div>

      {/* ── Health Narrative — biggest opportunity + score context ─────────── */}
      {runwayScore.hasEnoughData && (() => {
        const weakest = [...runwayScore.components].sort((a, b) => a.score - b.score)[0];
        const strongest = [...runwayScore.components].sort((a, b) => b.score - a.score)[0];
        return (
          <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 space-y-2">
            <div className="flex items-start gap-2">
              <Lightbulb className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-slate-800">
                  Biggest opportunity: {weakest.label} ({Math.round(weakest.score)}/100)
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {weakest.label === "Goal Pace" && "You're behind on your annual GCI target. Closing one more deal could shift this significantly."}
                  {weakest.label === "Pipeline" && "Your pipeline is thin. Adding prospects or listing appointments would strengthen your forecast."}
                  {weakest.label === "Expenses" && "Your expense ratio needs attention. Log all expenses to get an accurate picture."}
                  {weakest.label === "Benchmark" && "You're below your experience cohort median. Focus on deal volume to move up."}
                  {weakest.label === "Survival" && "Your cash runway is short. Building a reserve or reducing monthly burn would help."}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
              <p className="text-sm text-slate-600">
                Strongest area: <span className="font-semibold">{strongest.label}</span> ({Math.round(strongest.score)}/100)
              </p>
            </div>
          </div>
        );
      })()}

      {/* ── 2. YTD Snapshot ───────────────────────────────────────────────────── */}
      {/* Canonical cockpit KPI band — replaces the four pale gradient cards. */}
      <KpiStrip cols={4} label="YTD Snapshot">
        <CockpitStat
          label="YTD GCI"
          value={fmtCurrency(ytdGCI)}
          color={SEMANTIC.strong}
          icon={<DollarSign className="h-3.5 w-3.5" />}
          sub={
            vsLastYearGCI !== null ? (
              <span className="flex items-center gap-0.5" style={{ color: vsLastYearGCI >= 0 ? SEMANTIC.strong : SEMANTIC.risk }}>
                {vsLastYearGCI >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {vsLastYearGCI >= 0 ? "+" : ""}{fmtCurrency(Math.abs(vsLastYearGCI))} vs last yr
              </span>
            ) : (
              `${ytdTx.length} deals closed`
            )
          }
        />
        <CockpitStat
          label="Avg Deal"
          value={fmtCurrency(avgDealSize)}
          color="#F8FAFC"
          icon={<BarChart2 className="h-3.5 w-3.5" />}
          sub={`${buyerDeals}B / ${sellerDeals}S side`}
        />
        <CockpitStat
          label="Pipeline"
          value={fmtCurrency(pipelineWeighted)}
          color={SEMANTIC.onTrack}
          icon={<Layers className="h-3.5 w-3.5" />}
          sub={`${livePipelineDeals.length} active deals`}
        />
        <CockpitStat
          label="Projected Year-End"
          value={fmtCurrency(projectedGCI)}
          color={SEMANTIC.onTrack}
          icon={<Target className="h-3.5 w-3.5" />}
          sub={`~${Math.round(projectedDeals)} deals`}
        />
      </KpiStrip>

      {/* ── Goal Progress ──────────────────────────────────────────────────────── */}
      {goalGCI > 0 && (
        <Card className="rounded-2xl border-slate-200 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base">Goal Progress</CardTitle>
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className={
                    paceStatus === "ahead"
                      ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                      : paceStatus === "behind"
                      ? "border-red-300 bg-red-50 text-red-700"
                      : ""
                  }
                >
                  {paceStatus === "ahead"
                    ? `+${Math.round(pacePercent)}% ahead of pace`
                    : paceStatus === "behind"
                    ? `${Math.round(Math.abs(pacePercent))}% behind pace`
                    : "On pace"}
                </Badge>
                <span className="text-sm text-slate-500">
                  {fmtCurrency(ytdGCI)} / {fmtCurrency(goalGCI)}
                </span>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Progress value={gciProgress} className="h-3" />
            <div className="mt-2 flex justify-between text-xs text-muted-foreground">
              <span>{Math.round(gciProgress)}% of annual goal</span>
              <span>{fmtCurrency(Math.max(0, goalGCI - ytdGCI))} remaining</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── 3. Income Probability Forecast ────────────────────────────────────── */}
      <Card className="rounded-2xl border-slate-200 shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle className="text-base flex items-center gap-1.5">
                Income Probability Forecast
                <GuideLink anchor="probability-bands" label="Probability bands explained in Guide" />
              </CardTitle>
              <CardDescription>Year-end GCI range based on your historical variance</CardDescription>
            </div>
            <Badge
              variant="outline"
              className={
                bands.confidence === "high"
                  ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                  : bands.confidence === "medium"
                  ? "border-blue-300 bg-blue-50 text-blue-700"
                  : "border-amber-300 bg-amber-50 text-amber-700"
              }
            >
              {bands.confidence === "high"
                ? "High confidence"
                : bands.confidence === "medium"
                ? "Med confidence"
                : "Low confidence"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-[200px]">
            {bands.p50 > 0 ? (
              <ProbabilityChart data={probChartData} />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Add transactions to see projection bands
              </div>
            )}
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-5">
            {[
              { label: "P90", value: bands.p90, color: "text-emerald-600", desc: "Best case" },
              { label: "P75", value: bands.p75, color: "text-blue-600", desc: "Optimistic" },
              { label: "P50", value: bands.p50, color: "text-slate-800", desc: "Most likely" },
              { label: "P25", value: bands.p25, color: "text-amber-600", desc: "Conservative" },
              { label: "P10", value: bands.p10, color: "text-red-600", desc: "Downside" },
            ].map((p) => (
              <div key={p.label} className="rounded-xl border border-slate-100 bg-slate-50 p-2 sm:p-3 text-center">
                <div className="text-xs font-semibold text-slate-400">{p.label}</div>
                <div className={`text-xs sm:text-sm font-bold ${p.color} mt-0.5`}>{fmtCurrency(p.value)}</div>
                <div className="text-[10px] text-slate-400 hidden sm:block">{p.desc}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── 4. Financial Waterfall ────────────────────────────────────────────── */}
      {ytdGCI > 0 && (
        <Card className="rounded-2xl border-slate-200 shadow-sm overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Financial Waterfall — YTD {currentYear}</CardTitle>
            <CardDescription>Where every commission dollar goes</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {/* GCI header */}
            <div className="px-5 py-4 bg-gradient-to-r from-emerald-50 to-emerald-100/50 border-b border-emerald-200">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-emerald-900">Gross Commission Income</span>
                <span className="text-xl font-bold text-emerald-800">{fmtCurrency(ytdGCI)}</span>
              </div>
              <div className="mt-1.5 h-2 bg-emerald-200 rounded-full">
                <div className="h-full rounded-full bg-emerald-500 w-full" />
              </div>
            </div>

            <WaterfallRow
              label="Brokerage split"
              sublabel={settings.comp_plan === "real" ? "REAL plan" : `${Math.round((1 - getAgentPct(settings.split_preset)) * 100)}% brokerage`}
              amount={brokerageTake}
              pctOfGCI={ytdGCI > 0 ? (brokerageTake / ytdGCI) * 100 : 0}
            />
            <WaterfallRow
              label="Transaction fees"
              amount={txFees}
              pctOfGCI={ytdGCI > 0 ? (txFees / ytdGCI) * 100 : 0}
            />
            <WaterfallRow
              label="Desk / office fees"
              amount={brokerageFeeYTD}
              pctOfGCI={ytdGCI > 0 ? (brokerageFeeYTD / ytdGCI) * 100 : 0}
            />

            {/* Agent net subtotal */}
            <div className="px-5 py-3 bg-blue-50 border-t border-blue-200">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-blue-900">Agent Net (after splits &amp; fees)</span>
                <span className="text-base font-bold text-blue-800">{fmtCurrency(agentNet)}</span>
              </div>
            </div>

            <WaterfallRow
              label="Business expenses"
              amount={expensesYTD}
              pctOfGCI={ytdGCI > 0 ? (expensesYTD / ytdGCI) * 100 : 0}
            />

            {/* Net pre-tax */}
            <div className="px-5 py-3 bg-amber-50 border-t border-amber-200">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-amber-900">Net Pre-Tax</span>
                <span className="text-base font-bold text-amber-800">{fmtCurrency(netPreTax)}</span>
              </div>
            </div>

            {/* Summary footer */}
            <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-slate-100 border-t border-slate-200">
              {[
                { label: "You keep", value: fmtPct(ytdGCI > 0 ? agentNet / ytdGCI : 0), sub: "of gross GCI" },
                {
                  label: "Expense ratio",
                  value: `${expenseRatio.toFixed(1)}%`,
                  sub: (
                    <span className="inline-flex items-center justify-center gap-1">
                      {expenseRatio <= 30 ? (
                        <><CheckCircle className="h-3 w-3 text-emerald-500" /> Healthy</>
                      ) : (
                        <><AlertTriangle className="h-3 w-3 text-amber-500" /> Review</>
                      )}
                    </span>
                  ),
                },
                { label: "Net pre-tax", value: fmtCurrency(netPreTax), sub: "after all costs" },
                { label: "Effective take", value: fmtPct(ytdGCI > 0 ? netPreTax / ytdGCI : 0), sub: "of every $1" },
              ].map((s) => (
                <div key={s.label} className="px-4 py-4 text-center">
                  <div className="text-sm font-bold text-slate-900 tabular-nums">{s.value}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{s.label}</div>
                  <div className="text-[10px] text-slate-400">{s.sub}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── 4b. Monthly GCI Breakdown ─────────────────────────────────────────── */}
      {monthlyChartData.length > 0 && (
        <Card className="rounded-2xl border-slate-200 shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Monthly GCI Breakdown</CardTitle>
                <CardDescription>Commission earned each month — spot your peak season</CardDescription>
              </div>
              <div className="text-right text-xs text-muted-foreground">
                <div className="font-medium text-slate-700">{monthlyChartData.length} active months</div>
                <div>Avg {fmtCurrency(ytdGCI / monthlyChartData.length)}/mo</div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-[200px]">
              <MonthlyChart data={monthlyChartData} />
            </div>
            {monthlyChartData.length > 1 && (() => {
              const peak = monthlyChartData.reduce((a, b) => a.gci > b.gci ? a : b);
              const low = monthlyChartData.reduce((a, b) => a.gci < b.gci ? a : b);
              return (
                <div className="mt-3 flex gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 inline-block" />
                    Peak: <strong className="text-slate-700">{peak.month} — {fmtCurrency(peak.gci)}</strong>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-slate-300 inline-block" />
                    Low: <strong className="text-slate-700">{low.month} — {fmtCurrency(low.gci)}</strong>
                  </span>
                </div>
              );
            })()}
          </CardContent>
        </Card>
      )}

      {/* ── 5. Tax Snapshot ───────────────────────────────────────────────────── */}
      <Card className="rounded-2xl border border-amber-200 bg-amber-50/40 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base flex items-center gap-1.5">
                Tax Snapshot
                <GuideLink anchor="tax-estimate" label="Tax estimate methodology explained in Guide" />
              </CardTitle>
              <CardDescription>
                {taxResult.taxYear} estimate &middot; {PROVINCE_LABELS[settings.province]}
              </CardDescription>
            </div>
            <Badge variant="outline" className="border-amber-300 bg-amber-100 text-amber-800">
              {fmtPct(corpTaxResult ? corpTaxResult.combinedEffectiveRate : taxResult.effectiveRate)} effective rate
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {/* Stacked proportion bar */}
          {netForTax > 0 && taxResult.totalBurden > 0 && (
            <div className="mb-5">
              {/* Categorical legend: Federal / Provincial / CPP. Kept as three
                  distinct hues (real categories), re-toned onto on-system
                  colours — Provincial swapped off violet to slate. */}
              <div className="flex h-5 w-full rounded-full overflow-hidden gap-px">
                <div
                  className="bg-blue-500 h-full transition-all"
                  style={{ width: `${Math.min(99, (taxResult.federalTax / netForTax) * 100)}%` }}
                />
                <div
                  className="bg-slate-500 h-full transition-all"
                  style={{ width: `${Math.min(99, (taxResult.provincialTax / netForTax) * 100)}%` }}
                />
                <div
                  className="bg-amber-500 h-full transition-all"
                  style={{ width: `${Math.min(99, (taxResult.totalCPP / netForTax) * 100)}%` }}
                />
                <div className="bg-slate-200 h-full flex-1" />
              </div>
              <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-500">
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-blue-500 inline-block" />
                  Federal {fmtCurrency(taxResult.federalTax)}
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-slate-500 inline-block" />
                  Provincial {fmtCurrency(taxResult.provincialTax)}
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-amber-500 inline-block" />
                  CPP/QPP {fmtCurrency(taxResult.totalCPP)}
                </span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
            <div className="rounded-xl border border-amber-200 bg-white px-4 py-3 text-center">
              <div className="text-lg font-bold text-slate-900">
                {fmtCurrency(corpTaxResult ? corpTaxResult.totalCombinedTax / 4 : taxResult.quarterlyEstimate)}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">Quarterly instalment</div>
            </div>
            <div className="rounded-xl border border-amber-200 bg-white px-4 py-3 text-center">
              <div className="text-lg font-bold text-slate-900">
                {fmtCurrency(corpTaxResult
                  ? corpTaxResult.totalCombinedTax / Math.max(projectedDeals, 1)
                  : taxResult.perDealSetAside)}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">Per-deal tax portion</div>
            </div>
            {settings.gst_hst_registered && (
              <div className="rounded-xl border border-amber-200 bg-white px-4 py-3 text-center">
                <div className="text-lg font-bold text-slate-900">{fmtCurrency(gstHstCollectedYTD)}</div>
                <div className="text-xs text-slate-500 mt-0.5">{taxLabel} collected YTD</div>
              </div>
            )}
          </div>

          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-600">Projected net income</span>
              <span className="font-medium">{fmtCurrency(netForTax)}</span>
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
            <div className="flex justify-between font-semibold">
              <span>Estimated after-tax net</span>
              <span className="text-emerald-700">{fmtCurrency(afterTaxNet)}</span>
            </div>
          </div>

          {settings.gst_hst_registered ? (
            <p className="mt-3 text-[11px] text-muted-foreground">
              {taxLabel} of {fmtCurrency(gstHstCollectedYTD)} was charged to clients and must be remitted to CRA.
              Net of input tax credits (ITCs) on business expenses may reduce your remittance.
            </p>
          ) : (
            <p className="mt-3 text-[11px] text-muted-foreground">
              {taxLabel} tracking is available once you register and enable it in Settings.
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── 6. Expense Analysis ───────────────────────────────────────────────── */}
      <Card className="rounded-2xl border-slate-200 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Expense Analysis</CardTitle>
          <CardDescription>Spend breakdown vs. your commission income</CardDescription>
        </CardHeader>
        {expensesYTD > 0 ? (
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-6 items-center">
              {/* Donut */}
              {donutData.length > 0 && (
                <div className="h-[180px] w-[180px] shrink-0">
                  <ExpenseDonut data={donutData} />
                </div>
              )}
              {/* Ratio gauge + category bars */}
              <div className="flex-1 w-full space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-1.5">
                    <span className="font-medium text-slate-800">Expense ratio</span>
                    <span className={`font-bold ${expenseRatio <= 30 ? "text-emerald-600" : expenseRatio <= 40 ? "text-amber-600" : "text-red-600"}`}>
                      {expenseRatio.toFixed(1)}%
                    </span>
                  </div>
                  <div className="relative h-3 rounded-full bg-slate-100 overflow-hidden">
                    {/* benchmark zone markers (25–30%) */}
                    <div className="absolute inset-y-0 bg-emerald-200/60" style={{ left: "50%", width: "10%" }} />
                    <div
                      className={`h-full rounded-full transition-all ${
                        expenseRatio <= 30 ? "bg-emerald-500" : expenseRatio <= 40 ? "bg-amber-500" : "bg-red-500"
                      }`}
                      style={{ width: `${Math.min(100, expenseRatio * 2)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                    <span>0%</span>
                    <span className="text-emerald-600 font-medium">Target: 25–30%</span>
                    <span>50%+</span>
                  </div>
                </div>
                {/* Top categories */}
                <div className="space-y-2">
                  {donutData.slice(0, 5).map((d) => (
                    <div key={d.name} className="flex items-center gap-3 text-sm">
                      <span className="text-slate-600 flex-1 truncate">{d.name}</span>
                      <div className="h-1.5 w-24 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-amber-400 rounded-full"
                          style={{ width: `${expensesYTD > 0 ? (d.value / expensesYTD) * 100 : 0}%` }}
                        />
                      </div>
                      <span className="font-medium text-slate-800 w-20 text-right shrink-0">{fmtCurrency(d.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        ) : (
          <CardContent>
            <div className="flex flex-col items-center justify-center py-8 gap-2 text-center">
              <DollarSign className="h-8 w-8 text-slate-300" />
              <p className="text-sm font-medium text-slate-500">No expenses tracked yet</p>
              <p className="text-xs text-muted-foreground max-w-xs">
                Upload receipts on the{" "}
                <Link href="/expenses" className="underline hover:text-primary">Expenses</Link>{" "}
                page to see your spend breakdown and expense ratio.
              </p>
            </div>
          </CardContent>
        )}
      </Card>

      {/* ── 7. Benchmark + Cash Runway ────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Benchmark — neutral cockpit card (was purple). */}
        <Card className="rounded-2xl border-slate-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-1.5">
              Benchmark Standing
              <GuideLink anchor="benchmark" label="Benchmark cohorts explained in Guide" />
              {isPro && <ExplainButton question="How does my benchmark standing work and what does my percentile rank mean?" />}
            </CardTitle>
            <CardDescription>vs. {COHORT_LABELS[benchmark.cohort]} cohort · industry estimate</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Percentile magnitude track — slate→blue on-system ramp. */}
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-slate-600">Cohort percentile</span>
                  <span className="font-bold text-slate-800 tabular-nums">P{benchmark.percentile}</span>
                </div>
                <div className="relative h-4 rounded-full bg-gradient-to-r from-slate-200 via-blue-300 to-blue-500 overflow-visible">
                  <div
                    className="absolute top-0 h-full w-1 bg-white rounded-full shadow-sm"
                    style={{ left: `calc(${benchmark.percentile}% - 2px)` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                  <span>P0</span>
                  <span>P50</span>
                  <span>P100</span>
                </div>
              </div>
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Cohort median</span>
                  <span className="font-medium tabular-nums">{fmtCurrency(benchmark.cohortMedianGCI)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">vs Established Agents</span>
                  <span className="font-medium tabular-nums">P{benchmark.nationalPercentile}</span>
                </div>
                {benchmark.distanceToNextTier != null && benchmark.distanceToNextTier > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">To {benchmark.nextTierLabel}</span>
                    <span className="font-medium text-blue-700 tabular-nums">{fmtCurrency(benchmark.distanceToNextTier)}</span>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Cash Runway */}
        <Card className={`rounded-2xl shadow-sm border ${rs.cardBorder}`}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-1.5">
                Cash Runway
                <GuideLink anchor="cash-runway" label="Cash Runway explained in Guide" />
              </CardTitle>
              <Badge className={`${rs.badgeCls} border-0`}>{rs.label}</Badge>
            </div>
            <CardDescription>Estimated months without commission income</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4 flex items-center gap-3">
              <div className={`h-3 w-3 rounded-full ${rs.dot}`} />
              <span className={`text-lg font-bold ${rs.labelColor}`}>{survival.label}</span>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Cash reserve</span>
                <span className="font-medium">{fmtCurrency(survival.cashReserve)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Monthly burn</span>
                <span className="font-medium">{fmtCurrency(survival.monthlyBurn)}</span>
              </div>
              <div className="flex justify-between text-xs text-slate-400">
                <span>Brokerage fee</span>
                <span>{fmtCurrency(settings.monthly_brokerage_fee)}/mo</span>
              </div>
              <div className="flex justify-between text-xs text-slate-400">
                <span>Recurring expenses</span>
                <span>{fmtCurrency(monthlyRecurring)}/mo</span>
              </div>
            </div>
            {survival.months < 4 && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 flex items-start gap-2">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>Consider building your reserve to at least 4 months of operating costs.</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── 8. Career Trend ───────────────────────────────────────────────────── */}
      <Card className="rounded-2xl border-slate-200 shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Career Trend</CardTitle>
              <CardDescription>Year-over-year GCI &amp; deal volume</CardDescription>
            </div>
            {yoyData.length >= 2 && (
              <span className="text-xs text-muted-foreground">GCI (bars) &middot; Deals (line)</span>
            )}
          </div>
        </CardHeader>
        <CardContent className="pb-4">
          {yoyData.length >= 2 ? (
            <>
              <YearOverYearChart data={yoyData} height={240} />
              {yoyData.some((d) => d.isCurrentYear) && (
                <p className="mt-1.5 text-center text-[11px] text-muted-foreground/70">
                  Light bar = current year (partial)
                </p>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
              <BarChart2 className="h-8 w-8 text-slate-300" />
              <p className="text-sm font-medium text-slate-500">Multi-year trend not yet available</p>
              <p className="text-xs text-muted-foreground max-w-xs">
                Add prior-year data in <Link href="/settings" className="underline hover:text-primary">Settings → History</Link> to unlock year-over-year GCI and deal trends.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Quarterly Production Table ────────────────────────────────────────── */}
      {(currentQGCI.some((v) => v > 0) || priorQGCI !== null) && (
        <Card className="rounded-2xl border-slate-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Quarterly Production</CardTitle>
            <CardDescription>
              GCI by quarter — {currentYear}{priorYearItem ? ` vs ${currentYear - 1}` : ""}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Quarter</TableHead>
                  <TableHead className="text-right">{currentYear} GCI</TableHead>
                  {priorQGCI && <TableHead className="text-right">{currentYear - 1}</TableHead>}
                  {priorQGCI && <TableHead className="text-right">YoY</TableHead>}
                  <TableHead className="text-right pr-6">Deals</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(["Q1", "Q2", "Q3", "Q4"] as const).map((q, i) => {
                  const gci = currentQGCI[i];
                  const deals = currentQDeals[i];
                  const prior = priorQGCI ? (priorQGCI[i] ?? 0) : null;
                  const yoyChange = prior !== null && prior > 0 ? (gci - prior) / prior : null;
                  const qStartMonth = i * 3 + 1;
                  const currentMonth = now.getMonth() + 1;
                  const isFuture = qStartMonth > currentMonth;
                  return (
                    <TableRow key={q} className={isFuture ? "opacity-40" : ""}>
                      <TableCell className="pl-6 font-medium text-sm">
                        {q}
                        {isFuture && (
                          <span className="ml-1.5 text-[10px] text-muted-foreground">(upcoming)</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-semibold text-sm">
                        {gci > 0 ? fmtCurrency(gci) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      {prior !== null && (
                        <TableCell className="text-right text-sm text-muted-foreground">
                          {prior > 0 ? fmtCurrency(prior) : "—"}
                        </TableCell>
                      )}
                      {prior !== null && (
                        <TableCell className="text-right text-sm">
                          {yoyChange !== null ? (
                            <span className={yoyChange >= 0 ? "font-medium text-emerald-700 tabular-nums" : "font-medium text-red-600 tabular-nums"}>
                              {yoyChange >= 0 ? "+" : ""}{fmtPct(yoyChange)}
                            </span>
                          ) : "—"}
                        </TableCell>
                      )}
                      <TableCell className="text-right text-sm text-muted-foreground pr-6">
                        {deals > 0 ? deals : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {/* YoY trajectory insight */}
            {yoyTrajectory && (
              <div className={cn(
                "mx-6 mb-4 mt-2 flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm",
                yoyTrajectory === "accelerating"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : yoyTrajectory === "declining"
                  ? "border-red-200 bg-red-50 text-red-800"
                  : "border-slate-200 bg-slate-50 text-slate-700",
              )}>
                {yoyTrajectory === "accelerating" ? (
                  <TrendingUp className="h-4 w-4 shrink-0" />
                ) : yoyTrajectory === "declining" ? (
                  <TrendingDown className="h-4 w-4 shrink-0" />
                ) : (
                  <Layers className="h-4 w-4 shrink-0" />
                )}
                <span>
                  <strong className="capitalize">{yoyTrajectory}</strong> —{" "}
                  {yoyTrajectory === "accelerating"
                    ? "GCI has grown every year for the past 3 years"
                    : yoyTrajectory === "declining"
                    ? "GCI has declined over the past 3 years — review your pipeline strategy"
                    : "GCI has been relatively stable over the past 3 years"}
                  {yoyGrowthRate !== null && (
                    <span className="ml-1 opacity-70">
                      ({yoyGrowthRate >= 0 ? "+" : ""}{fmtPct(yoyGrowthRate)} last year)
                    </span>
                  )}
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── 9. AI Business Intelligence ────────────────────────────────────────── */}
      <div>
        <div className="mb-3 flex items-center gap-2">
          <Zap className="h-4 w-4 text-amber-500" />
          <h2 className="text-base font-semibold">Business Intelligence</h2>
          <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700 text-xs">
            AI-powered
          </Badge>
        </div>
        {advisorCards.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-3">
            {advisorCards.map((card) => (
              <div
                key={card.id}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm flex flex-col gap-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">
                      {ADVISOR_CATEGORY_LABELS[card.category]}
                    </div>
                    <div className="text-sm font-bold text-slate-900 leading-snug">{card.title}</div>
                  </div>
                  <Badge className="shrink-0 bg-emerald-100 text-emerald-800 border-0 text-xs whitespace-nowrap">
                    {card.estimatedImpact}
                  </Badge>
                </div>
                <div className="space-y-1.5">
                  {card.evidence.map((e, idx) => (
                    <div key={idx} className="flex items-start gap-1.5 text-xs text-slate-500">
                      <CheckCircle className="h-3 w-3 mt-0.5 shrink-0 text-slate-400" />
                      <span>{e}</span>
                    </div>
                  ))}
                </div>
                <div className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2 text-xs text-slate-600 leading-relaxed">
                  <span className="font-semibold text-slate-700">Action: </span>{card.action}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-8 text-center">
            <Zap className="h-8 w-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-medium text-slate-500">No recommendations right now</p>
            <p className="text-xs text-muted-foreground mt-1">
              Add more transaction data and set an annual goal to unlock personalised insight cards.
            </p>
          </div>
        )}
      </div>

      {/* ── 10. Expenses by Category ──────────────────────────────────────────── */}
      <Card className="rounded-2xl border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Expenses by Category</CardTitle>
        </CardHeader>
        <CardContent>
          {expensesYTD === 0 && monthlyRecurring === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No expenses recorded yet. Add receipts on the{" "}
              <Link href="/expenses" className="underline hover:text-primary">Expenses</Link>{" "}
              page to see a breakdown here.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">YTD</TableHead>
                    <TableHead className="text-right">Monthly</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expenseCategories.map((cat) => {
                    const catYTD = cat.items.reduce(
                      (s, i) => s + (receiptTotalsByKey[i.key] ?? 0),
                      0,
                    );
                    const catMonthly = cat.items.reduce(
                      (s, i) => s + Number(i.monthly_recurring),
                      0,
                    );
                    if (catYTD === 0 && catMonthly === 0) return null;
                    return (
                      <TableRow key={cat.id}>
                        <TableCell>{cat.title}</TableCell>
                        <TableCell className="text-right">{fmtCurrency(catYTD)}</TableCell>
                        <TableCell className="text-right">{fmtCurrency(catMonthly)}</TableCell>
                      </TableRow>
                    );
                  })}
                  <TableRow className="font-semibold">
                    <TableCell>Total</TableCell>
                    <TableCell className="text-right">{fmtCurrency(expensesYTD)}</TableCell>
                    <TableCell className="text-right">{fmtCurrency(monthlyRecurring)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── 12. Transaction Log ───────────────────────────────────────────────── */}
      <Card className="rounded-2xl border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">
            Transaction Log ({ytdTx.length} deals)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {ytdTx.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No closed deals this year.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Address</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Side</TableHead>
                    <TableHead className="text-right">GCI</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ytdTx.map((tx) => (
                    <TableRow key={tx.id}>
                      <TableCell className="whitespace-nowrap">{tx.date}</TableCell>
                      <TableCell>{tx.address || "\u2014"}</TableCell>
                      <TableCell>{tx.client_name || "\u2014"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {tx.side}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {fmtCurrency(computeGCI(tx))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Disclaimer ────────────────────────────────────────────────────────── */}
      <p className="text-center text-xs leading-relaxed text-muted-foreground/60 pb-2">
        All projections, tax estimates, and benchmark comparisons are approximations
        for planning purposes only — not financial, tax, or professional advice.
        Do not use these figures for tax filings, loan applications, or any official purpose.
        Always consult a qualified accountant or tax professional.{" "}
        <a href="/terms" className="underline underline-offset-2 hover:text-muted-foreground">
          Terms of Service
        </a>
        .
      </p>

      {/* Historical Production Report dialog */}
      {settings && (
        <ProductionReportDialog
          open={histReportOpen}
          onClose={() => setHistReportOpen(false)}
          historyItems={historyItems}
          settings={settings}
        />
      )}

      </>)}
    </div>
  );
}
