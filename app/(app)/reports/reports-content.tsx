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
import { FileDown, Loader2, Lock } from "lucide-react";
import Link from "next/link";
import { ProGate } from "@/components/pro-gate";
import { fmtCurrency, fmtPct } from "@/lib/formatters";
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
} from "@/lib/engines/projection-engine";
import { calculate as calculateTax } from "@/lib/engines/canadian-tax-engine";
import { compare, COHORT_LABELS } from "@/lib/engines/benchmark-engine";
import { survivalResult } from "@/lib/engines/survival-engine";

interface Props {
  settings: UserSettings | null;
  transactions: Transaction[];
  pipelineDeals: PipelineDeal[];
  expenseCategories: ExpenseCategoryWithItems[];
  subscriptionTier?: string;
}

export function ReportsContent({
  settings,
  transactions,
  pipelineDeals,
  expenseCategories,
  subscriptionTier = "starter",
}: Props) {
  const isPro = subscriptionTier === "professional" || subscriptionTier === "team";
  const [downloading, setDownloading] = useState(false);

  if (!settings) {
    return (
      <div className="py-20 text-center text-muted-foreground">
        Settings not found.
      </div>
    );
  }

  const currentYear = new Date().getFullYear();

  // ── YTD ───────────────────────────────────────────────────────────────
  const ytdTx = transactions.filter(
    (tx) => tx.date.startsWith(String(currentYear)),
  );
  const ytdGCI = ytdTx.reduce((sum, tx) => sum + computeGCI(tx), 0);
  const avgDealSize = ytdTx.length > 0 ? ytdGCI / ytdTx.length : 0;

  // ── Pipeline ──────────────────────────────────────────────────────────
  const pipelineWeighted = pipelineDeals.reduce(
    (sum, d) => sum + computeWeightedGCI(d),
    0,
  );

  // ── Projections ─────────────────────────────────────────────────────
  const seasonalWeights = settings.use_national_seasonality
    ? (settings.national_quarter_pcts ?? [0.25, 0.25, 0.25, 0.25])
    : [0.25, 0.25, 0.25, 0.25];
  const fraction = seasonalFractionElapsed(seasonalWeights);
  const projectedGCI = projectedYearEndGCI(ytdGCI, pipelineWeighted, fraction);
  const projectedDeals = projectedYearEndTransactions(ytdTx.length, pipelineDeals.length, fraction);

  // ── Financial ─────────────────────────────────────────────────────────
  const { agentGross, brokerageTake } = computeAgentGross(
    ytdGCI,
    settings.split_preset,
    settings.post_cap_threshold_gci,
    settings.post_cap_agent_pct,
    settings.post_cap_brokerage_pct,
  );
  const txFees = computeTxFees(
    ytdGCI,
    settings.tx_fee_rate_pct,
    settings.tx_fee_annual_cap,
  );
  const brokerageFeeYTD =
    settings.monthly_brokerage_fee * new Date().getMonth();

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
  const netPreTax = agentGross - txFees - brokerageFeeYTD - expensesYTD;

  // ── Tax estimate (on projected net) ───────────────────────────────────
  const projectedNet = (() => {
    const { agentGross: ag } = computeAgentGross(
      projectedGCI,
      settings.split_preset,
      settings.post_cap_threshold_gci,
      settings.post_cap_agent_pct,
      settings.post_cap_brokerage_pct,
    );
    const tf = computeTxFees(projectedGCI, settings.tx_fee_rate_pct, settings.tx_fee_annual_cap);
    const bf = settings.monthly_brokerage_fee * 12;
    const annualExp = expensesYTD + monthlyRecurring * 12;
    return Math.max(0, ag - tf - bf - annualExp);
  })();
  const taxResult = calculateTax(projectedNet, settings.province, Math.max(projectedDeals, 1));

  // ── Benchmark ─────────────────────────────────────────────────────────
  const benchmark = compare(projectedGCI, settings.experience_years);

  // ── Survival ──────────────────────────────────────────────────────────
  const survival = survivalResult(
    settings.monthly_brokerage_fee,
    monthlyRecurring,
    settings.cash_reserve,
  );

  // ── Buyer/Seller split ────────────────────────────────────────────────
  const buyerDeals = ytdTx.filter(
    (tx) => tx.side === "buyer" || tx.side === "both",
  ).length;
  const sellerDeals = ytdTx.filter(
    (tx) => tx.side === "seller" || tx.side === "both",
  ).length;

  // ── Monthly breakdown ─────────────────────────────────────────────────
  const MONTH_LABELS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const monthlyData = Array.from({ length: 12 }, (_, i) => {
    const mm = String(i + 1).padStart(2, "0");
    const monthTx = ytdTx.filter((tx) => tx.date.slice(5, 7) === mm);
    return {
      month: MONTH_LABELS[i],
      gci: monthTx.reduce((sum, tx) => sum + computeGCI(tx), 0),
      deals: monthTx.length,
    };
  }).filter((m) => m.gci > 0 || m.deals > 0);

  const riskColors: Record<string, string> = {
    critical: "text-red-600",
    warning: "text-amber-600",
    healthy: "text-emerald-600",
    strong: "text-emerald-600",
  };

  // ── PDF download ───────────────────────────────────────────────────────────
  const handleDownload = async () => {
    setDownloading(true);
    try {
      const [{ pdf }, { BusinessReportPDF }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("@/components/pdf/business-report-pdf"),
      ]);

      const pdfProps = {
        agentName: settings.display_name ?? "",
        brokerageName: settings.brokerage_name ?? "",
        businessName: settings.business_name ?? "",
        province: settings.province,
        year: currentYear,
        ytdGCI,
        ytdDeals: ytdTx.length,
        buyerDeals,
        sellerDeals,
        avgDealSize,
        pipelineWeighted,
        pipelineCount: pipelineDeals.length,
        agentPct: getAgentPct(settings.split_preset),
        brokerageTake,
        txFees,
        brokerageFeeYTD,
        agentGrossNet: agentGross - txFees - brokerageFeeYTD,
        expensesYTD,
        netPreTax,
        projectedNet,
        taxResult,
        expenseCategories,
        monthlyRecurring,
        monthlyData,
        transactions: ytdTx,
      };

      // createElement avoids JSX typing issues with the dynamic import
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const blob = await pdf(createElement(BusinessReportPDF, pdfProps) as any).toBlob();

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `agent-runway-report-${currentYear}.pdf`;
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
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
          <p className="text-sm text-muted-foreground">
            {currentYear} business summary &mdash; {PROVINCE_LABELS[settings.province]}
          </p>
        </div>
        {isPro ? (
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownload}
            disabled={downloading}
            className="shrink-0"
          >
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

      {/* KPI Summary */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>YTD GCI</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{fmtCurrency(ytdGCI)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Closed Deals</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{ytdTx.length}</div>
            <p className="text-xs text-muted-foreground">
              {buyerDeals}B / {sellerDeals}S
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Avg Deal Size</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{fmtCurrency(avgDealSize)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Pipeline (Weighted)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">
              {fmtCurrency(pipelineWeighted)}
            </div>
            <p className="text-xs text-muted-foreground">
              {pipelineDeals.length} deals
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Benchmark + Survival row */}
      <ProGate
        isPro={isPro}
        feature="Benchmark & Cash Runway"
        description="CREA cohort benchmarking and cash runway analysis — available on the Professional plan."
      >
        <div className="grid gap-4 sm:grid-cols-2">
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
                  <span className="text-muted-foreground">Cohort median</span>
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

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Cash Runway</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Runway</span>
                  <span className={`font-medium ${riskColors[survival.riskLevel]}`}>
                    {survival.label}
                  </span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Monthly burn</span>
                  <span>{fmtCurrency(survival.monthlyBurn)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Cash reserve</span>
                  <span>{fmtCurrency(survival.cashReserve)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </ProGate>

      {/* P&L */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Profit & Loss \u2014 YTD {currentYear}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span>Gross Commission Income</span>
              <span className="font-medium">{fmtCurrency(ytdGCI)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>
                Brokerage split ({fmtPct(1 - getAgentPct(settings.split_preset))}
                )
              </span>
              <span>-{fmtCurrency(brokerageTake)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Transaction fees</span>
              <span>-{fmtCurrency(txFees)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Brokerage desk fees</span>
              <span>-{fmtCurrency(brokerageFeeYTD)}</span>
            </div>
            <Separator />
            <div className="flex justify-between font-medium">
              <span>Agent Gross</span>
              <span>{fmtCurrency(agentGross - txFees - brokerageFeeYTD)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Business expenses</span>
              <span>-{fmtCurrency(expensesYTD)}</span>
            </div>
            <Separator />
            <div className="flex justify-between text-base font-semibold">
              <span>Net Pre-Tax</span>
              <span>{fmtCurrency(netPreTax)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tax estimate */}
      <ProGate
        isPro={isPro}
        feature="Projected Tax Breakdown"
        description="Full Canadian tax breakdown including CPP/QPP, federal, and provincial estimates — available on the Professional plan."
      >
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Projected Tax Breakdown</CardTitle>
            <CardDescription>
              {taxResult.taxYear} estimate &middot; {PROVINCE_LABELS[settings.province]}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Projected net income</span>
                <span className="font-medium">{fmtCurrency(projectedNet)}</span>
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
              <div className="flex justify-between font-medium">
                <span>Total tax burden</span>
                <span>{fmtCurrency(taxResult.totalBurden)}</span>
              </div>
              <div className="flex justify-between">
                <span>Effective rate</span>
                <span className="font-medium">{fmtPct(taxResult.effectiveRate)}</span>
              </div>
              <Separator />
              <div className="grid grid-cols-2 gap-4 pt-2">
                <div className="text-center">
                  <p className="text-lg font-bold">{fmtCurrency(taxResult.quarterlyEstimate)}</p>
                  <p className="text-xs text-muted-foreground">Quarterly instalment</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold">{fmtCurrency(taxResult.perDealSetAside)}</p>
                  <p className="text-xs text-muted-foreground">Per-deal set-aside</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </ProGate>

      {/* Expense breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Expenses by Category</CardTitle>
        </CardHeader>
        <CardContent>
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
                  (s, i) => s + Number(i.ytd_amount),
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
                    <TableCell className="text-right">
                      {fmtCurrency(catYTD)}
                    </TableCell>
                    <TableCell className="text-right">
                      {fmtCurrency(catMonthly)}
                    </TableCell>
                  </TableRow>
                );
              })}
              <TableRow className="font-semibold">
                <TableCell>Total</TableCell>
                <TableCell className="text-right">
                  {fmtCurrency(expensesYTD)}
                </TableCell>
                <TableCell className="text-right">
                  {fmtCurrency(monthlyRecurring)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
          </div>
        </CardContent>
      </Card>

      {/* Monthly breakdown */}
      {monthlyData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Monthly Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead className="text-right">GCI</TableHead>
                  <TableHead className="text-right">Deals</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {monthlyData.map((m) => (
                  <TableRow key={m.month}>
                    <TableCell>{m.month}</TableCell>
                    <TableCell className="text-right">
                      {fmtCurrency(m.gci)}
                    </TableCell>
                    <TableCell className="text-right">{m.deals}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Deal log */}
      <Card>
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
                    <TableCell className="whitespace-nowrap">
                      {tx.date}
                    </TableCell>
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
    </div>
  );
}
