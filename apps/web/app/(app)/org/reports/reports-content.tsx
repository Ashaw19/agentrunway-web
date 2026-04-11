"use client";

import { useState, useMemo, useCallback, useRef } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  TrendingUp,
  Users,
  Phone,
  Receipt,
  Target,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  BarChart3,
  Sparkles,
} from "lucide-react";
import {
  generatePipelineHealthReport,
  generateTransactionsInFlightReport,
  generateCrmConsistencyReport,
  generateTaxResponsibilityReport,
  generateForecastingReport,
} from "@agent-runway/core/engines";
import type {
  AgentActivitySummary,
  AgentPendingDealsSummary,
  AgentExpenseStatus,
  TeamReportAgent,
} from "@agent-runway/core/engines";

// ── Seasonal fraction (same as org dashboard) ────────────────────────────────
function getSeasonalFraction(): number {
  const month = new Date().getMonth(); // 0-indexed
  // Q1=18%, Q2=28%, Q3=30%, Q4=24% — cumulative at end of each month
  const cumulative = [
    0.06, 0.12, 0.18, // Q1
    0.27, 0.37, 0.46, // Q2
    0.56, 0.66, 0.76, // Q3
    0.82, 0.90, 1.0,  // Q4
  ];
  return cumulative[month] ?? 0.5;
}

// ── Types ────────────────────────────────────────────────────────────────────

interface Props {
  orgId: string;
  orgName: string;
  performance: TeamReportAgent[];
  activitySummary: AgentActivitySummary[];
  pendingDeals: AgentPendingDealsSummary[];
  expenseStatus: AgentExpenseStatus[];
}

type ReportKey = "pipeline" | "transactions" | "crm" | "tax" | "forecast";

const REPORT_CONFIG: Record<
  ReportKey,
  { icon: typeof TrendingUp; title: string; description: string; color: string }
> = {
  pipeline: {
    icon: BarChart3,
    title: "Pipeline Health Check",
    description: "Coverage ratios, active pipeline, and gaps",
    color: "text-blue-500",
  },
  transactions: {
    icon: TrendingUp,
    title: "Transactions In-Flight",
    description: "Pending deals, values, and expected close dates",
    color: "text-emerald-500",
  },
  crm: {
    icon: Phone,
    title: "CRM Consistency",
    description: "Activity frequency, touchpoint distribution",
    color: "text-violet-500",
  },
  tax: {
    icon: Receipt,
    title: "Tax Responsibilities",
    description: "Expense tracking and filing readiness",
    color: "text-amber-500",
  },
  forecast: {
    icon: Target,
    title: "Forecasting & Goals",
    description: "Pace vs goals, pipeline coverage, trajectory",
    color: "text-rose-500",
  },
};

// ── Main component ───────────────────────────────────────────────────────────

export function ReportsContent({
  orgId,
  orgName,
  performance,
  activitySummary,
  pendingDeals,
  expenseStatus,
}: Props) {
  const [expanded, setExpanded] = useState<ReportKey | null>(null);
  const [insights, setInsights] = useState<Partial<Record<ReportKey, string>>>({});
  const [insightLoading, setInsightLoading] = useState<Partial<Record<ReportKey, boolean>>>({});
  const fetchedRef = useRef<Set<ReportKey>>(new Set());

  const seasonalFraction = useMemo(getSeasonalFraction, []);

  const reports = useMemo(() => ({
    pipeline: generatePipelineHealthReport(performance),
    transactions: generateTransactionsInFlightReport(pendingDeals),
    crm: generateCrmConsistencyReport(activitySummary),
    tax: generateTaxResponsibilityReport(expenseStatus),
    forecast: generateForecastingReport(performance, seasonalFraction),
  }), [performance, pendingDeals, activitySummary, expenseStatus, seasonalFraction]);

  const fetchInsight = useCallback(async (key: ReportKey) => {
    if (fetchedRef.current.has(key)) return;
    fetchedRef.current.add(key);
    setInsightLoading((prev) => ({ ...prev, [key]: true }));
    try {
      const res = await fetch("/api/ai/team-insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          org_id: orgId,
          report_type: key,
          report_data: reports[key],
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setInsights((prev) => ({ ...prev, [key]: data.insight }));
      }
    } catch {
      // Silently fail — insight is optional
    } finally {
      setInsightLoading((prev) => ({ ...prev, [key]: false }));
    }
  }, [orgId, reports]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{orgName} — Team Reports</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Summary reports for coaching and team health. No individual financial details are exposed.
        </p>
      </div>

      {/* Report cards */}
      <div className="space-y-3">
        {(Object.keys(REPORT_CONFIG) as ReportKey[]).map((key) => {
          const cfg = REPORT_CONFIG[key];
          const report = reports[key];
          const isOpen = expanded === key;
          const Icon = cfg.icon;

          return (
            <Card key={key} className="overflow-hidden">
              <button
                className="w-full text-left"
                onClick={() => {
                  const next = isOpen ? null : key;
                  setExpanded(next);
                  if (next) fetchInsight(next);
                }}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`${cfg.color}`}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div>
                        <CardTitle className="text-base">{cfg.title}</CardTitle>
                        <CardDescription className="text-xs">
                          {cfg.description}
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <p className="text-xs text-muted-foreground max-w-xs text-right hidden sm:block">
                        {report.summary}
                      </p>
                      {isOpen ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </div>
                </CardHeader>
              </button>

              {isOpen && (
                <CardContent className="pt-0 pb-4">
                  <div className="border-t pt-4 space-y-3">
                    {key === "pipeline" && <PipelineDetail report={reports.pipeline} />}
                    {key === "transactions" && <TransactionsDetail report={reports.transactions} />}
                    {key === "crm" && <CrmDetail report={reports.crm} />}
                    {key === "tax" && <TaxDetail report={reports.tax} />}
                    {key === "forecast" && <ForecastDetail report={reports.forecast} />}

                    {/* AI Insight */}
                    <AiInsightBox
                      loading={!!insightLoading[key]}
                      insight={insights[key]}
                    />
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>

      <p className="text-[10px] text-center text-muted-foreground/50 pt-4">
        Reports show aggregate summaries only. Individual tax details, expenses, and commission splits are never exposed.
      </p>
    </div>
  );
}

// ── Detail sub-components ────────────────────────────────────────────────────

function PipelineDetail({ report }: { report: ReturnType<typeof generatePipelineHealthReport> }) {
  return (
    <>
      <div className="grid grid-cols-3 gap-4 text-sm">
        <Stat label="Pipeline Value" value={`$${Math.round(report.total_pipeline_value).toLocaleString()}`} />
        <Stat label="Active Deals" value={String(report.total_pipeline_deals)} />
        <Stat label="Avg Coverage" value={`${report.avg_coverage_ratio}x`} />
      </div>
      {report.agents_with_no_pipeline.length > 0 && (
        <FlagList
          icon={<AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
          label="No active pipeline"
          names={report.agents_with_no_pipeline}
        />
      )}
      {report.agents_with_low_coverage.length > 0 && (
        <FlagList
          icon={<AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
          label="Below 1.0x coverage"
          names={report.agents_with_low_coverage.map((a) => `${a.name} (${a.ratio}x)`)}
        />
      )}
    </>
  );
}

function TransactionsDetail({ report }: { report: ReturnType<typeof generateTransactionsInFlightReport> }) {
  return (
    <>
      <div className="grid grid-cols-3 gap-4 text-sm">
        <Stat label="Pending Deals" value={String(report.total_pending_deals)} />
        <Stat label="Pending Value" value={`$${Math.round(report.total_pending_value).toLocaleString()}`} />
        <Stat label="Nearest Close" value={report.nearest_close ?? "—"} />
      </div>
      {report.agents_with_pending.length > 0 && (
        <div className="space-y-1">
          {report.agents_with_pending.map((a) => (
            <div key={a.name} className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{a.name}</span>
              <span>{a.count} deal{a.count !== 1 ? "s" : ""} · ${Math.round(a.value).toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function CrmDetail({ report }: { report: ReturnType<typeof generateCrmConsistencyReport> }) {
  const { activity_type_breakdown: b } = report;
  return (
    <>
      <div className="grid grid-cols-3 gap-4 text-sm">
        <Stat label="Avg Touchpoints" value={String(report.avg_touchpoints_per_agent)} />
        <Stat label="Low Activity" value={String(report.agents_with_low_activity.length)} />
        <Stat label="High Activity" value={String(report.agents_with_high_activity.length)} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Badge variant="outline" className="text-xs">Calls: {b.calls}</Badge>
        <Badge variant="outline" className="text-xs">Emails: {b.emails}</Badge>
        <Badge variant="outline" className="text-xs">Texts: {b.texts}</Badge>
        <Badge variant="outline" className="text-xs">Meetings: {b.meetings}</Badge>
        <Badge variant="outline" className="text-xs">Showings: {b.showings}</Badge>
      </div>
      {report.agents_with_low_activity.length > 0 && (
        <FlagList
          icon={<AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
          label="Below average activity"
          names={report.agents_with_low_activity.map((a) => `${a.name} (${a.total})`)}
        />
      )}
    </>
  );
}

function TaxDetail({ report }: { report: ReturnType<typeof generateTaxResponsibilityReport> }) {
  const allGood =
    report.agents_without_expenses.length === 0 &&
    report.agents_without_receipts.length === 0;

  return (
    <>
      {allGood && (
        <div className="flex items-center gap-2 text-sm text-emerald-600">
          <CheckCircle2 className="h-4 w-4" />
          All agents are actively tracking expenses and uploading receipts.
        </div>
      )}
      {report.agents_without_expenses.length > 0 && (
        <FlagList
          icon={<AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
          label="No expenses logged this quarter"
          names={report.agents_without_expenses}
        />
      )}
      {report.agents_without_receipts.length > 0 && (
        <FlagList
          icon={<AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
          label="No receipt uploads this quarter"
          names={report.agents_without_receipts}
        />
      )}
      {report.agents_with_few_categories.length > 0 && (
        <FlagList
          icon={<Users className="h-3.5 w-3.5 text-blue-500" />}
          label="Fewer than 3 expense categories"
          names={report.agents_with_few_categories.map((a) => `${a.name} (${a.count})`)}
        />
      )}
    </>
  );
}

function ForecastDetail({ report }: { report: ReturnType<typeof generateForecastingReport> }) {
  return (
    <>
      <div className="grid grid-cols-3 gap-4 text-sm">
        <Stat label="Team Pace" value={`${report.team_avg_pace_pct}%`} />
        <Stat label="Ahead of Pace" value={String(report.agents_ahead_of_pace.length)} />
        <Stat label="Behind Pace" value={String(report.agents_behind_pace.length)} />
      </div>
      {report.agents_behind_pace.length > 0 && (
        <FlagList
          icon={<AlertTriangle className="h-3.5 w-3.5 text-rose-500" />}
          label="Behind pace"
          names={report.agents_behind_pace.map((a) => `${a.name} (${a.pct_behind}% behind)`)}
        />
      )}
      {report.agents_ahead_of_pace.length > 0 && (
        <FlagList
          icon={<CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
          label="Ahead of pace"
          names={report.agents_ahead_of_pace.map((a) => `${a.name} (+${a.pct_ahead}%)`)}
        />
      )}
      {report.agents_without_goals.length > 0 && (
        <FlagList
          icon={<Users className="h-3.5 w-3.5 text-muted-foreground" />}
          label="No goal set"
          names={report.agents_without_goals}
        />
      )}
    </>
  );
}

// ── AI Insight box ──────────────────────────────────────────────────────────

function AiInsightBox({ loading, insight }: { loading: boolean; insight?: string }) {
  if (!loading && !insight) return null;

  return (
    <div className="rounded-lg border border-blue-200/50 bg-blue-50/50 dark:border-blue-900/30 dark:bg-blue-950/20 px-3 py-2.5 mt-2">
      <div className="flex items-center gap-2 mb-1">
        <Sparkles className="h-3.5 w-3.5 text-blue-500" />
        <span className="text-xs font-semibold text-blue-700 dark:text-blue-400">AI Insight</span>
      </div>
      {loading ? (
        <div className="space-y-1.5">
          <div className="h-3 w-full rounded bg-blue-200/40 dark:bg-blue-800/30 animate-pulse" />
          <div className="h-3 w-3/4 rounded bg-blue-200/40 dark:bg-blue-800/30 animate-pulse" />
        </div>
      ) : (
        <p className="text-xs text-blue-900/80 dark:text-blue-300/80 leading-relaxed">{insight}</p>
      )}
    </div>
  );
}

// ── Shared primitives ────────────────────────────────────────────────────────

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-lg font-bold">{value}</p>
    </div>
  );
}

function FlagList({
  icon,
  label,
  names,
}: {
  icon: React.ReactNode;
  label: string;
  names: string[];
}) {
  return (
    <div className="rounded-lg border border-border/40 bg-muted/20 px-3 py-2.5">
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-xs font-semibold">{label}</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {names.map((n) => (
          <Badge key={n} variant="secondary" className="text-[10px]">
            {n}
          </Badge>
        ))}
      </div>
    </div>
  );
}
