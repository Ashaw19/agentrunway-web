"use client";

import { useMemo } from "react";
import type { PipelineSeedData } from "./page";
import {
  computePipelineForecast,
  computePreTransactionalWeightedGCI,
} from "@/lib/engines/pipeline-forecast";
import type {
  UnifiedPipelineItem,
  UnifiedStage,
  FunnelStep,
} from "@/lib/engines/pipeline-forecast";
import { fmtCurrency, fmtPct } from "@/lib/formatters";
import {
  Layers,
  Home,
  User,
  TrendingUp,
  Target,
  BarChart3,
  ArrowRight,
} from "lucide-react";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

// ── Helpers ──────────────────────────────────────────────────────────────

const STAGE_BADGE_COLORS: Record<UnifiedStage, string> = {
  pre_qualifying: "bg-slate-100 text-slate-600 border-slate-200",
  active:         "bg-blue-50 text-blue-600 border-blue-200",
  offer:          "bg-indigo-50 text-indigo-600 border-indigo-200",
  conditional:    "bg-violet-50 text-violet-600 border-violet-200",
  firm:           "bg-emerald-50 text-emerald-600 border-emerald-200",
  closed:         "bg-green-50 text-green-600 border-green-200",
};

const STAGE_LABELS: Record<UnifiedStage, string> = {
  pre_qualifying: "Pre-qualifying",
  active:         "Active",
  offer:          "Offer",
  conditional:    "Conditional",
  firm:           "Firm",
  closed:         "Closed",
};

function sourceIcon(source: "deal" | "listing" | "buyer") {
  switch (source) {
    case "deal":    return <Layers className="h-4 w-4 text-cyan-500" />;
    case "listing": return <Home className="h-4 w-4 text-amber-500" />;
    case "buyer":   return <User className="h-4 w-4 text-teal-500" />;
  }
}

function sourceLabel(source: "deal" | "listing" | "buyer") {
  switch (source) {
    case "deal":    return "Deal";
    case "listing": return "Listing";
    case "buyer":   return "Buyer";
  }
}

function sideBadge(side: "buy" | "sell" | "both") {
  switch (side) {
    case "buy":
      return <span className="inline-flex items-center rounded-md border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[11px] font-medium text-blue-600">Buy</span>;
    case "sell":
      return <span className="inline-flex items-center rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-600">Sell</span>;
    case "both":
      return <span className="inline-flex items-center rounded-md border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[11px] font-medium text-violet-600">Both</span>;
  }
}

function accuracyColor(score: number): string {
  if (score >= 80) return "text-emerald-600";
  if (score >= 60) return "text-amber-500";
  return "text-red-500";
}

function formatDate(iso: string | null): string {
  if (!iso) return "\u2014";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "\u2014";
  return d.toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" });
}

// ── Component ────────────────────────────────────────────────────────────

export function PipelineContent({ seed }: { seed: PipelineSeedData }) {
  const result = useMemo(
    () =>
      computePipelineForecast({
        pipelineDeals: seed.pipelineDeals,
        listingAppointments: seed.listingAppointments,
        buyerClients: seed.buyerClients,
        closedTransactions: seed.closedTransactions,
        defaultCommissionPct: seed.defaultCommissionPct,
      }),
    [seed],
  );

  const preTransactionalGCI = useMemo(
    () => computePreTransactionalWeightedGCI(result),
    [result],
  );

  const sortedItems = useMemo(
    () => [...result.items].sort((a, b) => b.weightedGCI - a.weightedGCI),
    [result],
  );

  return (
    <div className="space-y-6">
      {/* ── Page Header ─────────────────────────────────────────────── */}
      <div className="border-l-[3px] border-cyan-500 pl-4">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Pipeline
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Unified view of deals, listings, and tracked buyers with
          probability-weighted GCI forecasting.
        </p>
      </div>

      {/* ── Summary Strip ───────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <SummaryCard
          label="Total Weighted GCI"
          value={fmtCurrency(result.totalWeightedGCI)}
          icon={<TrendingUp className="h-4 w-4 text-cyan-500" />}
          primary
        />
        <SummaryCard
          label="Pipeline Deals"
          value={String(result.dealCount)}
          subValue={fmtCurrency(result.dealWeightedGCI)}
          icon={<Layers className="h-4 w-4 text-cyan-500" />}
        />
        <SummaryCard
          label="Active Listings"
          value={String(result.listingCount)}
          subValue={fmtCurrency(result.listingWeightedGCI)}
          icon={<Home className="h-4 w-4 text-amber-500" />}
        />
        <SummaryCard
          label="Tracked Buyers"
          value={String(result.buyerCount)}
          subValue={fmtCurrency(result.buyerWeightedGCI)}
          icon={<User className="h-4 w-4 text-teal-500" />}
        />
        {result.accuracy.overallScore != null ? (
          <SummaryCard
            label="Forecast Accuracy"
            value={`${result.accuracy.overallScore}%`}
            subValue={`${result.accuracy.sampleSize} closed`}
            icon={<Target className="h-4 w-4 text-violet-500" />}
            valueClassName={accuracyColor(result.accuracy.overallScore)}
          />
        ) : (
          <SummaryCard
            label="Forecast Accuracy"
            value="\u2014"
            subValue="Not enough data"
            icon={<Target className="h-4 w-4 text-slate-500" />}
          />
        )}
      </div>

      {/* ── Pipeline Table ──────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card">
        {sortedItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <Layers className="h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground max-w-md">
              No active pipeline items. Add deals in Transactions, listing
              appointments in CRM, or track buyers to see them here.
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="w-10">Source</TableHead>
                <TableHead>Name / Address</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Side</TableHead>
                <TableHead className="text-right">Est. Value</TableHead>
                <TableHead className="text-right">Weighted GCI</TableHead>
                <TableHead className="text-right">Prob.</TableHead>
                <TableHead className="text-right">Expected Close</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedItems.map((item) => (
                <PipelineRow key={item.id} item={item} />
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* ── Pipeline Intelligence ───────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <AccuracyCard accuracy={result.accuracy} />
        <FunnelCard funnel={result.funnel.dealFunnel} />
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  subValue,
  icon,
  primary,
  valueClassName,
}: {
  label: string;
  value: string;
  subValue?: string;
  icon: React.ReactNode;
  primary?: boolean;
  valueClassName?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card p-4",
        primary && "lg:col-span-1",
      )}
    >
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-xs font-medium text-muted-foreground">
          {label}
        </span>
      </div>
      <p
        className={cn(
          "text-xl font-bold tracking-tight text-foreground",
          primary && "text-2xl",
          valueClassName,
        )}
      >
        {value}
      </p>
      {subValue && (
        <p className="mt-0.5 text-xs text-muted-foreground">{subValue}</p>
      )}
    </div>
  );
}

function PipelineRow({ item }: { item: UnifiedPipelineItem }) {
  const stageColor =
    STAGE_BADGE_COLORS[item.unifiedStage] ?? STAGE_BADGE_COLORS.pre_qualifying;
  const stageLabel =
    STAGE_LABELS[item.unifiedStage] ?? item.stage;

  return (
    <TableRow className="border-border">
      <TableCell>
        <div className="flex items-center gap-1.5" title={sourceLabel(item.source)}>
          {sourceIcon(item.source)}
        </div>
      </TableCell>
      <TableCell>
        <div className="flex flex-col">
          <span className="font-medium text-foreground">{item.name}</span>
          {item.clientName && item.source !== "buyer" && (
            <span className="text-xs text-muted-foreground">
              {item.clientName}
            </span>
          )}
        </div>
      </TableCell>
      <TableCell>
        <span
          className={cn(
            "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-medium",
            stageColor,
          )}
        >
          {stageLabel}
        </span>
      </TableCell>
      <TableCell>{sideBadge(item.side)}</TableCell>
      <TableCell className="text-right font-medium text-foreground tabular-nums">
        {fmtCurrency(item.estimatedValue)}
      </TableCell>
      <TableCell className="text-right font-semibold text-foreground tabular-nums">
        {fmtCurrency(item.weightedGCI)}
      </TableCell>
      <TableCell className="text-right text-muted-foreground tabular-nums">
        {fmtPct(item.probability)}
      </TableCell>
      <TableCell className="text-right text-muted-foreground tabular-nums">
        {formatDate(item.expectedCloseDate)}
      </TableCell>
    </TableRow>
  );
}

function AccuracyCard({
  accuracy,
}: {
  accuracy: ReturnType<typeof computePipelineForecast>["accuracy"];
}) {
  if (accuracy.overallScore == null) {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center gap-2 mb-4">
          <Target className="h-5 w-5 text-violet-500" />
          <h3 className="text-sm font-semibold text-foreground">
            Forecast Accuracy
          </h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Not enough data yet — accuracy will appear after deals close.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="flex items-center gap-2 mb-4">
        <Target className="h-5 w-5 text-violet-500" />
        <h3 className="text-sm font-semibold text-foreground">
          Forecast Accuracy
        </h3>
      </div>

      <div className="flex items-baseline gap-3 mb-4">
        <span
          className={cn(
            "text-4xl font-bold tracking-tight",
            accuracyColor(accuracy.overallScore),
          )}
        >
          {accuracy.overallScore}%
        </span>
        <span className="text-sm text-muted-foreground">
          Based on {accuracy.sampleSize} closed deal
          {accuracy.sampleSize !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="space-y-1.5 text-sm">
        {accuracy.listingAccuracy && (
          <p className="text-muted-foreground">
            Listing estimates: avg{" "}
            <span className="font-medium text-foreground">
              {fmtPct(accuracy.listingAccuracy.avgErrorPct)}
            </span>{" "}
            off
          </p>
        )}
        {accuracy.dealAccuracy && (
          <p className="text-muted-foreground">
            Deal estimates: avg{" "}
            <span className="font-medium text-foreground">
              {fmtPct(accuracy.dealAccuracy.avgErrorPct)}
            </span>{" "}
            off
          </p>
        )}
      </div>
    </div>
  );
}

function FunnelCard({ funnel }: { funnel: FunnelStep[] }) {
  const hasData = funnel.some((s) => s.count > 0);

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 className="h-5 w-5 text-cyan-500" />
        <h3 className="text-sm font-semibold text-foreground">
          Conversion Funnel
        </h3>
      </div>

      {!hasData ? (
        <p className="text-sm text-muted-foreground">
          Conversion data will appear as deals move through stages.
        </p>
      ) : (
        <div className="flex items-center gap-1 flex-wrap">
          {funnel
            .filter((step) => step.stage !== "closed")
            .map((step, i, arr) => (
              <div key={step.stage} className="flex items-center gap-1">
                <div className="flex flex-col items-center">
                  <span className="text-xs font-medium text-muted-foreground capitalize">
                    {step.stage}
                  </span>
                  <span className="text-lg font-bold text-foreground tabular-nums">
                    {step.count}
                  </span>
                </div>
                {i < arr.length - 1 && (
                  <div className="flex flex-col items-center mx-1.5">
                    <span className="text-[10px] text-muted-foreground tabular-nums mb-0.5">
                      {step.conversionRate != null && i > 0
                        ? ""
                        : ""}
                      {arr[i + 1].conversionRate != null
                        ? fmtPct(arr[i + 1].conversionRate!)
                        : ""}
                    </span>
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/50" />
                  </div>
                )}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
