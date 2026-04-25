"use client";

import { useState, useMemo } from "react";
import {
  Building2,
  Users,
  DollarSign,
  TrendingUp,
  BarChart3,
  Target,
  AlertTriangle,
  CheckCircle,
  Info,
  Award,
  XCircle,
  Filter,
  UserPlus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtCurrency, fmtCompact, fmtPct } from "@/lib/formatters";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import dynamic from "next/dynamic";

const OrgProductionChart = dynamic(() => import("@/components/org-production-chart").then(m => m.OrgProductionChart), { ssr: false });
const OrgCohortChart = dynamic(() => import("@/components/org-cohort-chart").then(m => m.OrgCohortChart), { ssr: false });
import { OrgLeaderboard } from "@/components/org-leaderboard";
import type {
  Organization,
  OrganizationMember,
  OrgAgentPerformance,
  OrgDashboardTab,
  OrgInsight,
  OrgInsightSeverity,
  PaceStatus,
} from "@/lib/types/organizations";
import {
  ORG_TYPE_LABELS,
  ORG_INSIGHT_SEVERITY_COLORS,
} from "@/lib/types/organizations";
import {
  seasonalFractionElapsed,
  paceVsGoalPercent,
} from "@/lib/engines/projection-engine";
import {
  cohortFromYears,
  COHORT_LABELS,
  BENCHMARKS,
  type Cohort,
} from "@/lib/engines/benchmark-engine";
import { generateOrgInsights } from "@/lib/engines/org-insights-engine";

// ── Seasonal weights (Q1 18%, Q2 28%, Q3 30%, Q4 24%) ────────────────────────
const SEASONAL_WEIGHTS = [0.18, 0.28, 0.3, 0.24];

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  org: Organization;
  membership: OrganizationMember;
  isAdmin: boolean;
  performance: OrgAgentPerformance[];
  activeMemberCount: number;
}

export function OrgDashboardContent({
  org,
  membership: _membership,
  isAdmin,
  performance,
  activeMemberCount,
}: Props) {
  const [activeTab, setActiveTab] = useState<OrgDashboardTab>("overview");
  const [showAnonymized, setShowAnonymized] = useState(org.anonymize_agents);
  const [insightFilter, setInsightFilter] = useState<OrgInsightSeverity | "all">("all");

  // ── Core computed values ──────────────────────────────────────────────────

  const seasonalFraction = useMemo(
    () => seasonalFractionElapsed(SEASONAL_WEIGHTS),
    [],
  );

  const displayAgents = useMemo(() => {
    if (!showAnonymized) return performance;
    return performance.map((a, i) => ({
      ...a,
      agent_name: `Agent ${String.fromCharCode(65 + (i % 26))}`,
      avatar_url: "",
    }));
  }, [performance, showAnonymized]);

  const totalGCI = useMemo(
    () => performance.reduce((s, a) => s + Number(a.ytd_gci), 0),
    [performance],
  );
  const totalDeals = useMemo(
    () => performance.reduce((s, a) => s + Number(a.deal_count), 0),
    [performance],
  );
  const totalPipelineValue = useMemo(
    () => performance.reduce((s, a) => s + Number(a.pipeline_value), 0),
    [performance],
  );
  const totalPipelineCount = useMemo(
    () => performance.reduce((s, a) => s + Number(a.pipeline_count), 0),
    [performance],
  );
  const avgGCIPerAgent = activeMemberCount > 0 ? totalGCI / activeMemberCount : 0;

  const _medianGCI = useMemo(() => {
    const sorted = [...performance]
      .map((a) => Number(a.ytd_gci))
      .sort((a, b) => a - b);
    if (sorted.length === 0) return 0;
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  }, [performance]);

  // ── Pace map ──────────────────────────────────────────────────────────────

  const agentPaceMap = useMemo(() => {
    const map = new Map<string, PaceStatus>();
    performance.forEach((a) => {
      const goal = Number(a.goal_gci);
      if (goal <= 0) {
        map.set(a.user_id, "no-goal");
        return;
      }
      const pace = paceVsGoalPercent(goal, Number(a.ytd_gci), seasonalFraction);
      if (pace > 5) map.set(a.user_id, "ahead");
      else if (pace >= -10) map.set(a.user_id, "on-track");
      else map.set(a.user_id, "behind");
    });
    return map;
  }, [performance, seasonalFraction]);

  const agentsOnTrack = useMemo(() => {
    let count = 0;
    agentPaceMap.forEach((status) => {
      if (status === "ahead" || status === "on-track") count++;
    });
    return count;
  }, [agentPaceMap]);

  const agentsWithGoals = useMemo(
    () => performance.filter((a) => Number(a.goal_gci) > 0).length,
    [performance],
  );

  // ── Cohort counts ─────────────────────────────────────────────────────────

  const cohortCounts = useMemo(() => {
    const counts = { rookie: 0, growth: 0, established: 0, topProducer: 0 };
    performance.forEach((a) => {
      const cohort = cohortFromYears(a.experience_years ?? 5);
      counts[cohort]++;
    });
    return counts;
  }, [performance]);

  // ── Org Insights ──────────────────────────────────────────────────────────

  const orgInsights = useMemo(
    () =>
      generateOrgInsights({
        agents: performance,
        orgGoalGci: org.org_goal_gci,
        seasonalFraction,
        anonymize: showAnonymized,
      }),
    [performance, org.org_goal_gci, seasonalFraction, showAnonymized],
  );

  const criticalWarningCount = useMemo(
    () => orgInsights.filter((i) => i.severity === "critical" || i.severity === "warning").length,
    [orgInsights],
  );

  const filteredInsights = useMemo(
    () =>
      insightFilter === "all"
        ? orgInsights
        : orgInsights.filter((i) => i.severity === insightFilter),
    [orgInsights, insightFilter],
  );

  // ── Org goal progress ─────────────────────────────────────────────────────

  const orgGoalProgress = useMemo(() => {
    if (!org.org_goal_gci || org.org_goal_gci <= 0) return null;
    return Math.min(100, (totalGCI / org.org_goal_gci) * 100);
  }, [totalGCI, org.org_goal_gci]);

  // ── Tier 2 monthly data aggregation ───────────────────────────────────────

  const tier2Agents = useMemo(
    () => performance.filter((a) => a.monthly_gci !== null),
    [performance],
  );

  const aggregatedMonthlyGCI = useMemo(() => {
    if (tier2Agents.length < 3) return null; // Only show if ≥3 Tier 2 agents
    const monthly: Record<string, number> = {};
    tier2Agents.forEach((a) => {
      if (!a.monthly_gci) return;
      Object.entries(a.monthly_gci).forEach(([m, val]) => {
        monthly[m] = (monthly[m] ?? 0) + val;
      });
    });
    return monthly;
  }, [tier2Agents]);

  const monthlyChartData = useMemo(() => {
    if (!aggregatedMonthlyGCI) return null;
    const months = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];
    return months.map((label, i) => ({
      month: label,
      gci: aggregatedMonthlyGCI[String(i + 1)] ?? 0,
    }));
  }, [aggregatedMonthlyGCI]);

  // ── Cohort comparison data ────────────────────────────────────────────────

  const cohortComparison = useMemo(() => {
    const cohorts: Cohort[] = ["rookie", "growth", "established", "topProducer"];
    return cohorts.map((c) => {
      const cohortAgents = performance.filter(
        (a) => cohortFromYears(a.experience_years ?? 5) === c,
      );
      const avgGCI =
        cohortAgents.length > 0
          ? cohortAgents.reduce((s, a) => s + Number(a.ytd_gci), 0) / cohortAgents.length
          : 0;
      return {
        cohort: c,
        label: COHORT_LABELS[c],
        count: cohortAgents.length,
        orgAvgGCI: avgGCI,
        benchmarkMedian: BENCHMARKS[c].medianGCI,
        diff:
          BENCHMARKS[c].medianGCI > 0
            ? ((avgGCI - BENCHMARKS[c].medianGCI) / BENCHMARKS[c].medianGCI) * 100
            : 0,
      };
    });
  }, [performance]);

  // ── Average deal size ─────────────────────────────────────────────────────

  const avgDealSize = totalDeals > 0 ? totalGCI / totalDeals : 0;

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Building2 className="h-6 w-6 text-orange-500" />
            <h1 className="text-2xl font-bold tracking-tight">{org.name}</h1>
            <span className="rounded-full bg-orange-500/10 px-2.5 py-0.5 text-xs font-medium text-orange-500">
              {ORG_TYPE_LABELS[org.type]}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            Team performance dashboard
          </p>
        </div>
        {isAdmin && (
          <a
            href="/org/members"
            className="inline-flex items-center gap-1.5 rounded-lg border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-orange-300 transition-colors"
          >
            <UserPlus className="h-3.5 w-3.5" />
            Invite
          </a>
        )}
      </div>

      {/* Empty State — shown when no members have entered data yet */}
      {performance.length === 0 && (
        <div className="rounded-2xl border-2 border-dashed border-orange-200 bg-gradient-to-br from-orange-50/50 to-amber-50/50 p-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-orange-500/10">
            <Users className="h-8 w-8 text-orange-500" />
          </div>
          <h2 className="text-lg font-bold text-foreground">Your team dashboard is ready</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground leading-relaxed">
            Once your team members accept their invites and start entering transactions and pipeline deals,
            their data will appear here — KPIs, leaderboard, trends, and coaching insights.
          </p>
          <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
            <a
              href="/org/members"
              className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 transition-colors"
            >
              <UserPlus className="h-4 w-4" />
              Invite Team Members
            </a>
            <a
              href="/org/reports"
              className="inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <BarChart3 className="h-4 w-4" />
              Preview Reports
            </a>
          </div>
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-lg mx-auto">
            {[
              { step: "1", label: "Invite your agents", desc: "Send email invites from Members page" },
              { step: "2", label: "They accept & set up", desc: "Personal config takes ~2 minutes" },
              { step: "3", label: "Data flows here", desc: "KPIs, insights & coaching appear" },
            ].map((item) => (
              <div key={item.step} className="rounded-lg bg-white/60 border border-orange-100 p-3 text-left">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-orange-500 text-white text-xs font-bold mb-1.5">
                  {item.step}
                </span>
                <p className="text-xs font-semibold text-foreground">{item.label}</p>
                <p className="text-[11px] text-muted-foreground">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabbed Content */}
      {performance.length > 0 && <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as OrgDashboardTab)}
      >
        <TabsList variant="line" className="w-full justify-start border-b pb-0">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>
          <TabsTrigger value="trends">Trends</TabsTrigger>
          <TabsTrigger value="insights" className="gap-1.5">
            Insights
            {criticalWarningCount > 0 && (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500/15 px-1.5 text-[10px] font-semibold text-rose-500">
                {criticalWarningCount}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── Tab 1: Overview ─────────────────────────────────────────────── */}
        <TabsContent value="overview" className="mt-6 space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <KPICard
              icon={DollarSign}
              label="Total Org GCI"
              value={fmtCompact(totalGCI)}
              iconColor="text-emerald-500"
            />
            <KPICard
              icon={Users}
              label="Active Agents"
              value={String(activeMemberCount)}
              sub={`Avg ${fmtCurrency(avgGCIPerAgent)} / agent`}
              iconColor="text-blue-500"
            />
            <KPICard
              icon={BarChart3}
              label="Closed Deals"
              value={String(totalDeals)}
              sub={totalDeals > 0 ? `Avg ${fmtCurrency(avgDealSize)} / deal` : undefined}
              iconColor="text-violet-500"
            />
            <KPICard
              icon={TrendingUp}
              label="Pipeline Value"
              value={fmtCompact(totalPipelineValue)}
              sub={`${totalPipelineCount} active deals`}
              iconColor="text-amber-500"
            />
            <KPICard
              icon={Target}
              label="Agents On Track"
              value={agentsWithGoals > 0 ? `${agentsOnTrack} / ${agentsWithGoals}` : "—"}
              sub={agentsWithGoals > 0 ? "vs seasonal pace" : "No goals set"}
              iconColor="text-orange-500"
            />
            {org.org_goal_gci && org.org_goal_gci > 0 ? (
              <div className="rounded-xl border bg-card p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Target className="h-4 w-4 text-teal-500" />
                  <span className="text-xs text-muted-foreground">Org Goal Progress</span>
                </div>
                <p className="text-xl font-bold tracking-tight">
                  {fmtPct(orgGoalProgress! / 100)}
                </p>
                <Progress value={orgGoalProgress!} className="h-1.5 mt-2" />
                <p className="text-xs text-muted-foreground mt-1">
                  {fmtCompact(totalGCI)} of {fmtCompact(org.org_goal_gci)} goal
                </p>
              </div>
            ) : (
              <KPICard
                icon={BarChart3}
                label="Pipeline Coverage"
                value={
                  totalGCI > 0
                    ? `${(totalPipelineValue / Math.max(1, totalGCI)).toFixed(1)}x`
                    : "—"
                }
                sub="Pipeline vs YTD production"
                iconColor="text-teal-500"
              />
            )}
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-xl border bg-card p-5">
              <h3 className="text-sm font-semibold mb-4">Production by Agent</h3>
              <OrgProductionChart agents={displayAgents} />
            </div>
            <div className="rounded-xl border bg-card p-5">
              <h3 className="text-sm font-semibold mb-4">Experience Distribution</h3>
              <OrgCohortChart cohortCounts={cohortCounts} />
            </div>
          </div>

          {/* Monthly Momentum (only if ≥3 Tier 2 agents) */}
          {monthlyChartData && (
            <div className="rounded-xl border bg-card p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold">Monthly GCI Momentum</h3>
                <span className="text-[10px] text-muted-foreground">
                  Based on {tier2Agents.length} agents with extended sharing
                </span>
              </div>
              <MonthlyBarChart data={monthlyChartData} />
            </div>
          )}
        </TabsContent>

        {/* ── Tab 2: Leaderboard ──────────────────────────────────────────── */}
        <TabsContent value="leaderboard" className="mt-6">
          <OrgLeaderboard
            agents={displayAgents}
            agentPaceMap={agentPaceMap}
            isAdmin={isAdmin}
            showAnonymized={showAnonymized}
            onToggleAnonymize={() => setShowAnonymized(!showAnonymized)}
          />
        </TabsContent>

        {/* ── Tab 3: Trends ───────────────────────────────────────────────── */}
        <TabsContent value="trends" className="mt-6 space-y-6">
          {/* Goal Pace Timeline */}
          <div className="rounded-xl border bg-card p-5">
            <h3 className="text-sm font-semibold mb-4">Seasonal Pace Position</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Year Start</span>
                <span>Today ({fmtPct(seasonalFraction)})</span>
                <span>Year End</span>
              </div>
              <div className="relative h-3 rounded-full bg-muted overflow-hidden">
                {/* Expected position marker */}
                <div
                  className="absolute top-0 h-full w-0.5 bg-muted-foreground/40 z-10"
                  style={{ left: `${seasonalFraction * 100}%` }}
                />
                {/* Actual progress (if org goal exists) */}
                {org.org_goal_gci && org.org_goal_gci > 0 && (
                  <div
                    className={cn(
                      "absolute top-0 h-full rounded-full transition-all",
                      orgGoalProgress! >= seasonalFraction * 100
                        ? "bg-emerald-500"
                        : "bg-amber-500",
                    )}
                    style={{
                      width: `${Math.min(100, orgGoalProgress!)}%`,
                    }}
                  />
                )}
              </div>
              {org.org_goal_gci && org.org_goal_gci > 0 ? (
                <div className="flex items-center gap-4 text-xs">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />
                    Expected: {fmtPct(seasonalFraction)}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        "h-2 w-2 rounded-full",
                        orgGoalProgress! >= seasonalFraction * 100
                          ? "bg-emerald-500"
                          : "bg-amber-500",
                      )}
                    />
                    Actual: {fmtPct(orgGoalProgress! / 100)}
                  </span>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Set an org goal in Settings to track overall pace.
                </p>
              )}
            </div>
          </div>

          {/* Monthly GCI Trend (Tier 2 data) */}
          {monthlyChartData ? (
            <div className="rounded-xl border bg-card p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold">Monthly GCI Trend</h3>
                <span className="text-[10px] text-muted-foreground">
                  {tier2Agents.length} of {performance.length} agents sharing monthly data
                </span>
              </div>
              <MonthlyBarChart data={monthlyChartData} />
            </div>
          ) : (
            <div className="rounded-xl border bg-card p-5 text-center py-10">
              <BarChart3 className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                Monthly trend data requires at least 3 agents with extended data sharing (Tier 2).
              </p>
            </div>
          )}

          {/* Cohort Performance vs Benchmark */}
          <div className="rounded-xl border bg-card">
            <div className="px-5 py-4 border-b">
              <h3 className="text-sm font-semibold">
                Cohort Performance vs Industry Benchmark
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Org average YTD GCI by experience level compared to the industry national median
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30 text-xs text-muted-foreground">
                    <th className="px-5 py-3 text-left font-medium">Cohort</th>
                    <th className="px-5 py-3 text-right font-medium">Agents</th>
                    <th className="px-5 py-3 text-right font-medium">Org Avg GCI</th>
                    <th className="px-5 py-3 text-right font-medium">Industry Median</th>
                    <th className="px-5 py-3 text-right font-medium">Difference</th>
                  </tr>
                </thead>
                <tbody>
                  {cohortComparison.map((row) => (
                    <tr
                      key={row.cohort}
                      className="border-b last:border-b-0 hover:bg-muted/20 transition-colors"
                    >
                      <td className="px-5 py-3 font-medium">{row.label}</td>
                      <td className="px-5 py-3 text-right">{row.count}</td>
                      <td className="px-5 py-3 text-right font-mono">
                        {row.count > 0 ? fmtCurrency(row.orgAvgGCI) : "—"}
                      </td>
                      <td className="px-5 py-3 text-right font-mono text-muted-foreground">
                        {fmtCurrency(row.benchmarkMedian)}
                      </td>
                      <td className="px-5 py-3 text-right">
                        {row.count > 0 ? (
                          <span
                            className={cn(
                              "text-xs font-medium",
                              row.diff > 0
                                ? "text-emerald-500"
                                : row.diff < -10
                                  ? "text-rose-500"
                                  : "text-muted-foreground",
                            )}
                          >
                            {row.diff > 0 ? "+" : ""}
                            {Math.round(row.diff)}%
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        {/* ── Tab 4: Insights ─────────────────────────────────────────────── */}
        <TabsContent value="insights" className="mt-6 space-y-4">
          {/* Filter */}
          <div className="flex items-center gap-3">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select
              value={insightFilter}
              onValueChange={(v) => setInsightFilter(v as OrgInsightSeverity | "all")}
            >
              <SelectTrigger size="sm" className="w-[180px]">
                <SelectValue placeholder="Filter severity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Insights</SelectItem>
                <SelectItem value="critical">Critical Only</SelectItem>
                <SelectItem value="warning">Warnings Only</SelectItem>
                <SelectItem value="info">Info Only</SelectItem>
                <SelectItem value="praise">Praise Only</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">
              {filteredInsights.length} insight{filteredInsights.length !== 1 ? "s" : ""}
            </span>
          </div>

          {/* Insight Cards */}
          {filteredInsights.length === 0 ? (
            <div className="rounded-xl border bg-card p-8 text-center">
              <CheckCircle className="h-8 w-8 text-emerald-500/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                {insightFilter === "all"
                  ? "No insights to show. Your team is performing well!"
                  : `No ${insightFilter} insights at this time.`}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredInsights.map((insight) => (
                <InsightCard key={insight.id} insight={insight} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>}

      {/* Data privacy notice */}
      <p className="text-[10px] text-muted-foreground/60 italic leading-relaxed">
        This dashboard shows only Tier 1 and Tier 2 (opt-in) metrics. Individual
        agent tax data, expense details, commission splits, and cash reserves are
        never accessible to organization administrators.
      </p>
    </div>
  );
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KPICard({
  icon: Icon,
  label,
  value,
  sub,
  iconColor,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  iconColor: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className={cn("h-4 w-4", iconColor)} />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className="text-xl font-bold tracking-tight">{value}</p>
      {sub && (
        <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
      )}
    </div>
  );
}

// ── Insight Card ──────────────────────────────────────────────────────────────

const SEVERITY_ICONS: Record<OrgInsightSeverity, React.ComponentType<{ className?: string }>> = {
  critical: XCircle,
  warning: AlertTriangle,
  info: Info,
  praise: Award,
};

function InsightCard({ insight }: { insight: OrgInsight }) {
  const Icon = SEVERITY_ICONS[insight.severity];
  const colors = ORG_INSIGHT_SEVERITY_COLORS[insight.severity];

  return (
    <div className={cn("rounded-xl border p-4 flex items-start gap-3", colors)}>
      <Icon className="h-5 w-5 mt-0.5 shrink-0" />
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-semibold">{insight.title}</p>
          {insight.agentName && (
            <span className="text-[10px] font-medium opacity-70">
              — {insight.agentName}
            </span>
          )}
        </div>
        <p className="text-xs mt-0.5 opacity-80">{insight.message}</p>
      </div>
    </div>
  );
}

// ── Monthly Bar Chart (lightweight inline for Trends + Overview) ─────────────

function MonthlyBarChart({
  data,
}: {
  data: { month: string; gci: number }[];
}) {
  const maxGCI = Math.max(...data.map((d) => d.gci), 1);
  const currentMonth = new Date().getMonth(); // 0-indexed

  return (
    <div className="flex items-end gap-1.5 h-40">
      {data.map((d, i) => {
        const height = maxGCI > 0 ? (d.gci / maxGCI) * 100 : 0;
        const isFuture = i > currentMonth;
        return (
          <div
            key={d.month}
            className="flex-1 flex flex-col items-center gap-1"
          >
            <div className="w-full relative flex-1 flex items-end">
              <div
                className={cn(
                  "w-full rounded-t transition-all",
                  isFuture
                    ? "bg-muted/40"
                    : d.gci > 0
                      ? "bg-orange-500/80"
                      : "bg-muted/30",
                )}
                style={{ height: `${Math.max(height, 2)}%` }}
                title={`${d.month}: ${fmtCurrency(d.gci)}`}
              />
            </div>
            <span className="text-[9px] text-muted-foreground">{d.month}</span>
          </div>
        );
      })}
    </div>
  );
}
