"use client";

import Image from "next/image";
import { useState, useMemo } from "react";
import {
  ChevronUp,
  ChevronDown,
  CheckCircle,
  MinusCircle,
  AlertCircle,
  HelpCircle,
  ChevronLeft,
  ChevronRight,
  Search,
  Eye,
  EyeOff,
} from "lucide-react";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { fmtCurrency, fmtCompact } from "@/lib/formatters";
import { cohortFromYears, COHORT_LABELS } from "@/lib/engines/benchmark-engine";
import dynamic from "next/dynamic";
import type { MonthlyDataPoint } from "@/components/monthly-chart";

const MonthlyChart = dynamic(() => import("@/components/monthly-chart").then(m => m.MonthlyChart), { ssr: false });
import type { OrgAgentPerformance, PaceStatus, LeaderboardSortKey } from "@/lib/types/organizations";
import { ORG_MEMBER_ROLE_LABELS } from "@/lib/types/organizations";

const PAGE_SIZE = 25;

// ── Props ───────────────────────────────────────────────────────────────────

interface OrgLeaderboardProps {
  agents: OrgAgentPerformance[];
  agentPaceMap: Map<string, PaceStatus>;
  isAdmin: boolean;
  showAnonymized: boolean;
  onToggleAnonymize: () => void;
}

// ── Pace Icon ───────────────────────────────────────────────────────────────

function PaceIcon({ status }: { status: PaceStatus }) {
  switch (status) {
    case "ahead":
      return <CheckCircle className="h-4 w-4 text-emerald-500" />;
    case "on-track":
      return <MinusCircle className="h-4 w-4 text-amber-500" />;
    case "behind":
      return <AlertCircle className="h-4 w-4 text-rose-500" />;
    case "no-goal":
      return <HelpCircle className="h-4 w-4 text-muted-foreground/40" />;
  }
}

// ── Sort Header ─────────────────────────────────────────────────────────────

function SortHeader({
  label,
  sortKey,
  currentKey,
  asc,
  onClick,
  className,
}: {
  label: string;
  sortKey: LeaderboardSortKey;
  currentKey: LeaderboardSortKey;
  asc: boolean;
  onClick: (key: LeaderboardSortKey) => void;
  className?: string;
}) {
  const active = currentKey === sortKey;
  return (
    <TableHead
      className={`cursor-pointer select-none hover:text-foreground transition-colors ${className ?? ""}`}
      onClick={() => onClick(sortKey)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active &&
          (asc ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          ))}
      </span>
    </TableHead>
  );
}

// ── Monthly GCI Transform ───────────────────────────────────────────────────

function toMonthlyChartData(
  monthlyGci: Record<string, number>,
): MonthlyDataPoint[] {
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return months.map((m, i) => ({
    month: m,
    gci: monthlyGci[String(i + 1)] ?? 0,
    projected: false,
  }));
}

// ── Component ───────────────────────────────────────────────────────────────

export function OrgLeaderboard({
  agents,
  agentPaceMap,
  isAdmin,
  showAnonymized,
  onToggleAnonymize,
}: OrgLeaderboardProps) {
  const [sortKey, setSortKey] = useState<LeaderboardSortKey>("ytd_gci");
  const [sortAsc, setSortAsc] = useState(false);
  const [page, setPage] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterRole, setFilterRole] = useState<string>("all");
  const [filterPace, setFilterPace] = useState<string>("all");
  const [filterCohort, setFilterCohort] = useState<string>("all");
  const [search, setSearch] = useState("");

  // ── Sort handler ──────────────────────────────────────────────────────
  function handleSort(key: LeaderboardSortKey) {
    if (key === sortKey) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
    setPage(0);
  }

  // ── Pipeline: filter → sort → paginate ────────────────────────────────
  const { paged, totalFiltered, totalPages } = useMemo(() => {
    let filtered = [...agents];

    // Filter
    if (filterRole !== "all")
      filtered = filtered.filter((a) => a.role === filterRole);
    if (filterPace !== "all")
      filtered = filtered.filter(
        (a) => agentPaceMap.get(a.user_id) === filterPace,
      );
    if (filterCohort !== "all")
      filtered = filtered.filter(
        (a) => cohortFromYears(a.experience_years ?? 5) === filterCohort,
      );
    if (search.trim())
      filtered = filtered.filter((a) =>
        a.agent_name.toLowerCase().includes(search.toLowerCase()),
      );

    // Sort
    filtered.sort((a, b) => {
      let va: number, vb: number;
      switch (sortKey) {
        case "ytd_gci":
          va = Number(a.ytd_gci);
          vb = Number(b.ytd_gci);
          break;
        case "deal_count":
          va = Number(a.deal_count);
          vb = Number(b.deal_count);
          break;
        case "pipeline_value":
          va = Number(a.pipeline_value);
          vb = Number(b.pipeline_value);
          break;
        case "avg_deal_size":
          va =
            Number(a.deal_count) > 0
              ? Number(a.ytd_gci) / Number(a.deal_count)
              : 0;
          vb =
            Number(b.deal_count) > 0
              ? Number(b.ytd_gci) / Number(b.deal_count)
              : 0;
          break;
        case "goal_progress":
          va =
            Number(a.goal_gci) > 0
              ? Number(a.ytd_gci) / Number(a.goal_gci)
              : 0;
          vb =
            Number(b.goal_gci) > 0
              ? Number(b.ytd_gci) / Number(b.goal_gci)
              : 0;
          break;
        default:
          va = 0;
          vb = 0;
      }
      return sortAsc ? va - vb : vb - va;
    });

    const totalFiltered = filtered.length;
    const totalPages = Math.ceil(totalFiltered / PAGE_SIZE);
    const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

    return { paged, totalFiltered, totalPages };
  }, [agents, filterRole, filterPace, filterCohort, search, sortKey, sortAsc, page, agentPaceMap]);

  // ── Quick Stats ───────────────────────────────────────────────────────
  const { topAgent, avgGCI, medianGCI } = useMemo(() => {
    const sorted = [...agents].sort(
      (a, b) => Number(b.ytd_gci) - Number(a.ytd_gci),
    );
    const topAgent = sorted[0] ?? null;
    const total = sorted.reduce((s, a) => s + Number(a.ytd_gci), 0);
    const avg = sorted.length > 0 ? total / sorted.length : 0;

    const gcis = sorted.map((a) => Number(a.ytd_gci));
    const mid = Math.floor(gcis.length / 2);
    const median =
      gcis.length === 0
        ? 0
        : gcis.length % 2 === 0
          ? (gcis[mid - 1] + gcis[mid]) / 2
          : gcis[mid];

    return { topAgent, avgGCI: avg, medianGCI: median };
  }, [agents]);

  return (
    <div className="space-y-4">
      {/* Quick Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border bg-card px-4 py-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            #1 Producer
          </p>
          <p className="text-sm font-semibold truncate">
            {topAgent?.agent_name ?? "\u2014"}
          </p>
          <p className="text-xs text-muted-foreground">
            {topAgent ? fmtCurrency(Number(topAgent.ytd_gci)) : "\u2014"}
          </p>
        </div>
        <div className="rounded-lg border bg-card px-4 py-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Org Average
          </p>
          <p className="text-sm font-semibold">{fmtCurrency(avgGCI)}</p>
        </div>
        <div className="rounded-lg border bg-card px-4 py-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Org Median
          </p>
          <p className="text-sm font-semibold">{fmtCurrency(medianGCI)}</p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search agents..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            className="pl-8 h-9 text-xs"
          />
        </div>

        <Select
          value={filterRole}
          onValueChange={(v) => {
            setFilterRole(v);
            setPage(0);
          }}
        >
          <SelectTrigger className="w-[130px] h-9 text-xs">
            <SelectValue placeholder="Role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            <SelectItem value="owner">Owner</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="team_leader">Team Leader</SelectItem>
            <SelectItem value="agent">Agent</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={filterPace}
          onValueChange={(v) => {
            setFilterPace(v);
            setPage(0);
          }}
        >
          <SelectTrigger className="w-[130px] h-9 text-xs">
            <SelectValue placeholder="Pace" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Pace</SelectItem>
            <SelectItem value="ahead">Ahead</SelectItem>
            <SelectItem value="on-track">On Track</SelectItem>
            <SelectItem value="behind">Behind</SelectItem>
            <SelectItem value="no-goal">No Goal</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={filterCohort}
          onValueChange={(v) => {
            setFilterCohort(v);
            setPage(0);
          }}
        >
          <SelectTrigger className="w-[150px] h-9 text-xs">
            <SelectValue placeholder="Cohort" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Cohorts</SelectItem>
            <SelectItem value="rookie">Rookie (0\u20132 yr)</SelectItem>
            <SelectItem value="growth">Growth (2\u20135 yr)</SelectItem>
            <SelectItem value="established">Established (5\u201310 yr)</SelectItem>
            <SelectItem value="topProducer">Top Producer (10+)</SelectItem>
          </SelectContent>
        </Select>

        {isAdmin && (
          <button
            onClick={onToggleAnonymize}
            className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {showAnonymized ? (
              <EyeOff className="h-3.5 w-3.5" />
            ) : (
              <Eye className="h-3.5 w-3.5" />
            )}
            {showAnonymized ? "Anonymized" : "Names Visible"}
          </button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-xl border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 text-center">#</TableHead>
              <TableHead>Agent</TableHead>
              <SortHeader
                label="YTD GCI"
                sortKey="ytd_gci"
                currentKey={sortKey}
                asc={sortAsc}
                onClick={handleSort}
                className="text-right"
              />
              <SortHeader
                label="Goal"
                sortKey="goal_progress"
                currentKey={sortKey}
                asc={sortAsc}
                onClick={handleSort}
                className="text-right hidden lg:table-cell"
              />
              <TableHead className="text-right hidden xl:table-cell">
                Progress
              </TableHead>
              <SortHeader
                label="Deals"
                sortKey="deal_count"
                currentKey={sortKey}
                asc={sortAsc}
                onClick={handleSort}
                className="text-right hidden md:table-cell"
              />
              <SortHeader
                label="Avg Deal"
                sortKey="avg_deal_size"
                currentKey={sortKey}
                asc={sortAsc}
                onClick={handleSort}
                className="text-right hidden lg:table-cell"
              />
              <SortHeader
                label="Pipeline"
                sortKey="pipeline_value"
                currentKey={sortKey}
                asc={sortAsc}
                onClick={handleSort}
                className="text-right hidden md:table-cell"
              />
              <TableHead className="w-12 text-center">Pace</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paged.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={9}
                  className="text-center text-sm text-muted-foreground py-8"
                >
                  No agents match the current filters
                </TableCell>
              </TableRow>
            )}
            {paged.map((agent, idx) => {
              const rank = page * PAGE_SIZE + idx + 1;
              const pace = agentPaceMap.get(agent.user_id) ?? "no-goal";
              const goalProgress =
                Number(agent.goal_gci) > 0
                  ? Math.min(
                      100,
                      (Number(agent.ytd_gci) / Number(agent.goal_gci)) * 100,
                    )
                  : 0;
              const avgDeal =
                Number(agent.deal_count) > 0
                  ? Number(agent.ytd_gci) / Number(agent.deal_count)
                  : 0;
              const isExpanded = expandedId === agent.user_id;
              const cohort = COHORT_LABELS[cohortFromYears(agent.experience_years ?? 5)];

              return (
                <>
                  <TableRow
                    key={agent.user_id}
                    className="cursor-pointer hover:bg-muted/30 transition-colors"
                    onClick={() =>
                      setExpandedId(isExpanded ? null : agent.user_id)
                    }
                  >
                    <TableCell className="text-center text-xs text-muted-foreground font-mono">
                      {rank}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {agent.avatar_url ? (
                          <Image
                            src={agent.avatar_url}
                            alt=""
                            width={28}
                            height={28}
                            className="h-7 w-7 rounded-full object-cover"
                          />
                        ) : (
                          <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold text-muted-foreground">
                            {agent.agent_name.charAt(0)}
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">
                            {agent.agent_name}
                          </p>
                          <div className="flex items-center gap-1.5">
                            <Badge
                              variant="outline"
                              className="text-[9px] px-1 py-0"
                            >
                              {ORG_MEMBER_ROLE_LABELS[agent.role]}
                            </Badge>
                            <span className="text-[9px] text-muted-foreground/60">
                              {cohort}
                            </span>
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm font-medium">
                      {fmtCurrency(Number(agent.ytd_gci))}
                    </TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground hidden lg:table-cell">
                      {Number(agent.goal_gci) > 0
                        ? fmtCompact(Number(agent.goal_gci))
                        : "\u2014"}
                    </TableCell>
                    <TableCell className="hidden xl:table-cell">
                      {Number(agent.goal_gci) > 0 ? (
                        <div className="flex items-center gap-2">
                          <Progress
                            value={goalProgress}
                            className="h-1.5 w-16"
                          />
                          <span className="text-[10px] text-muted-foreground w-8 text-right">
                            {Math.round(goalProgress)}%
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground/40">
                          \u2014
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-sm hidden md:table-cell">
                      {Number(agent.deal_count)}
                    </TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground hidden lg:table-cell">
                      {avgDeal > 0 ? fmtCurrency(avgDeal) : "\u2014"}
                    </TableCell>
                    <TableCell className="text-right text-sm hidden md:table-cell">
                      {fmtCompact(Number(agent.pipeline_value))}
                    </TableCell>
                    <TableCell className="text-center">
                      <PaceIcon status={pace} />
                    </TableCell>
                  </TableRow>

                  {/* Expanded Detail */}
                  {isExpanded && (
                    <TableRow key={`${agent.user_id}-detail`}>
                      <TableCell colSpan={9} className="bg-muted/10 px-6 py-4">
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-3">
                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                              YTD GCI
                            </p>
                            <p className="text-sm font-semibold">
                              {fmtCurrency(Number(agent.ytd_gci))}
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                              Deals Closed
                            </p>
                            <p className="text-sm font-semibold">
                              {Number(agent.deal_count)}
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                              Pipeline
                            </p>
                            <p className="text-sm font-semibold">
                              {Number(agent.pipeline_count)} deals (
                              {fmtCurrency(Number(agent.pipeline_value))})
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                              Avg Deal Size
                            </p>
                            <p className="text-sm font-semibold">
                              {avgDeal > 0 ? fmtCurrency(avgDeal) : "\u2014"}
                            </p>
                          </div>
                        </div>
                        {/* Privacy: individual monthly GCI only shown when 3+ agents opted into Tier 2,
                            preventing identification of a single agent's monthly pattern */}
                        {agent.monthly_gci && agents.filter(a => a.monthly_gci).length >= 3 && (
                          <div>
                            <p className="text-xs text-muted-foreground mb-2">
                              Monthly GCI Breakdown (Extended Sharing)
                            </p>
                            <MonthlyChart
                              data={toMonthlyChartData(agent.monthly_gci)}
                            />
                          </div>
                        )}
                        {(!agent.monthly_gci || agents.filter(a => a.monthly_gci).length < 3) && (
                          <p className="text-[10px] text-muted-foreground/60 italic">
                            {!agent.monthly_gci
                              ? "This agent uses Basic Sharing \u2014 monthly breakdown not available."
                              : "Monthly breakdown requires 3+ agents with Extended Sharing enabled."}
                          </p>
                        )}
                      </TableCell>
                    </TableRow>
                  )}
                </>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <p>
            Showing {page * PAGE_SIZE + 1}\u2013
            {Math.min((page + 1) * PAGE_SIZE, totalFiltered)} of{" "}
            {totalFiltered} agents
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPage(Math.max(0, page - 1))}
              disabled={page === 0}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="px-2">
              {page + 1} / {totalPages}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
              disabled={page >= totalPages - 1}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
