"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Activity,
  ListTodo,
  Plus,
  Square,
  TrendingUp,
  TrendingDown,
  Clock,
  Users,
  AlertTriangle,
  Phone,
  BarChart3,
  Zap,
  Target,
  Sparkles,
  AlertCircle,
  Gift,
  Key,
  Star,
  UserX,
  WifiOff,
  Copy,
  ChevronDown,
  ChevronUp,
  X,
  RefreshCw,
  Home,
  Timer,
  Loader2,
  Pen,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { cn } from "@/lib/utils";
import type {
  Client,
  ClientRecord,
  ContactActivity,
  ContactTask,
  ActivityType,
  TaskPriority,
  OutreachOpportunityType,
} from "@/lib/types/database";
import {
  ACTIVITY_TYPE_LABELS,
  ACTIVITY_TYPE_ICONS,
  CLIENT_STATUS_LABELS,
  CLIENT_STATUS_COLORS,
} from "@/lib/types/database";
import {
  computeCrmDashboard,
  computeSpeedToLead,
  computeIntelligenceBriefing,
  type BriefingItem,
} from "@/lib/engines/crm-analytics-engine";
import { SummaryCard, relativeDate, fmtDate, todayIso, PRIORITY_STYLES, fmtResponseTime } from "../shared";
import { toast } from "sonner";

// ── Draft button eligibility ─────────────────────────────────────────────────
// Maps BriefingItem types → OutreachOpportunityType for the Draft endpoint.
// Only types where a personalised email genuinely adds value are included.

const BRIEFING_TO_OUTREACH_TYPE: Partial<Record<BriefingItem["type"], OutreachOpportunityType>> = {
  birthday_today:           "birthday",
  birthday_soon:            "birthday",
  closing_anniversary:      "closing_anniversary",
  mortgage_renewal_due:     "mortgage_renewal_due",
  mortgage_renewal_window:  "mortgage_renewal_window",
  past_client_check_in:     "past_client_check_in",
  timeframe_approaching:    "timeframe_approaching",
  property_value_milestone: "property_value_milestone",
};

// ── Props ───────────────────────────────────────────────────────────────────

interface CrmDashboardTabProps {
  clients: Client[];
  activities: ContactActivity[];
  tasks: ContactTask[];
  records: ClientRecord[];
  clientById: Map<string, Client>;
  onLogActivity: (clientId: string, type: ActivityType, description: string, activityDate: string) => Promise<void>;
  onAddTask: (clientId: string | null, title: string, dueDate: string, priority: TaskPriority, notes: string) => Promise<void>;
  onCompleteTask: (taskId: string) => Promise<void>;
  onOpenDetailPanel: (clientId: string) => void;
}

// ── Briefing Row ────────────────────────────────────────────────────────────

function BriefingIcon({ type }: { type: BriefingItem["type"] }) {
  if (type === "vip_overdue")            return <Star className="h-3.5 w-3.5 text-amber-500" />;
  if (type === "uncontacted_lead")       return <UserX className="h-3.5 w-3.5 text-red-500" />;
  if (type === "in_flight_stale")        return <AlertCircle className="h-3.5 w-3.5 text-red-500" />;
  if (type === "birthday_today")         return <Gift className="h-3.5 w-3.5 text-pink-500" />;
  if (type === "birthday_soon")          return <Gift className="h-3.5 w-3.5 text-pink-400" />;
  if (type === "closing_anniversary")    return <Key className="h-3.5 w-3.5 text-blue-500" />;
  if (type === "mortgage_renewal_due")   return <RefreshCw className="h-3.5 w-3.5 text-red-500" />;
  if (type === "mortgage_renewal_window") return <RefreshCw className="h-3.5 w-3.5 text-blue-400" />;
  if (type === "past_client_check_in")   return <Clock className="h-3.5 w-3.5 text-slate-500" />;
  if (type === "timeframe_approaching")  return <Timer className="h-3.5 w-3.5 text-amber-500" />;
  if (type === "property_value_milestone") return <Home className="h-3.5 w-3.5 text-emerald-500" />;
  if (type === "no_contact_info")        return <WifiOff className="h-3.5 w-3.5 text-amber-500" />;
  return <Copy className="h-3.5 w-3.5 text-slate-500" />;
}

const BRIEFING_SEVERITY_STYLES: Record<BriefingItem["severity"], string> = {
  urgent:    "border-red-200 bg-red-50/80",
  attention: "border-amber-200 bg-amber-50/80",
  upcoming:  "border-blue-200 bg-blue-50/60",
};

function BriefingRow({
  item,
  onView,
  onDismiss,
  onDraft,
  drafting,
}: {
  item:      BriefingItem;
  onView:    () => void;
  onDismiss: () => void;
  onDraft?:  () => void;
  drafting?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2.5 rounded-xl border px-3 py-2",
        BRIEFING_SEVERITY_STYLES[item.severity],
      )}
    >
      <span className="shrink-0"><BriefingIcon type={item.type} /></span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-foreground truncate">{item.title}</p>
        <p className="text-[11px] text-muted-foreground truncate">{item.detail}</p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {onDraft && (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 text-[10px] px-2 text-violet-600 hover:text-violet-700 hover:bg-violet-50/80 font-semibold gap-1"
            onClick={onDraft}
            disabled={drafting}
            title="Draft an AI outreach email for this opportunity"
          >
            {drafting ? (
              <Loader2 className="h-2.5 w-2.5 animate-spin" />
            ) : (
              <Pen className="h-2.5 w-2.5" />
            )}
            {drafting ? "Drafting…" : "Draft"}
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="h-6 text-[10px] px-2 text-foreground hover:text-primary hover:bg-white/60"
          onClick={onView}
        >
          View
        </Button>
        <button
          onClick={onDismiss}
          className="text-muted-foreground/50 hover:text-muted-foreground transition-colors p-1 rounded"
          title="Dismiss"
          aria-label="Dismiss this item"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

// ── Pie colors ──────────────────────────────────────────────────────────────

const PIE_COLORS = ["#3b82f6", "#8b5cf6", "#10b981", "#f59e0b", "#ef4444", "#06b6d4", "#f97316"];

// ── Component ───────────────────────────────────────────────────────────────

export function CrmDashboardTab({
  clients,
  activities,
  tasks,
  records,
  clientById,
  onLogActivity: _onLogActivity,
  onAddTask,
  onCompleteTask,
  onOpenDetailPanel,
}: CrmDashboardTabProps) {
  void _onLogActivity; // reserved for future use
  const [periodDays, setPeriodDays] = useState<30 | 60 | 90>(30);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // ── Intelligence Briefing ────────────────────────────────────────────────
  const briefing = useMemo(
    () => computeIntelligenceBriefing(clients, activities, records),
    [clients, activities, records],
  );
  const [briefingExpanded, setBriefingExpanded] = useState(true);
  const [dismissedIds,     setDismissedIds]     = useState<Set<string>>(new Set());
  const [draftingId,       setDraftingId]       = useState<string | null>(null);
  const visibleItems = briefing.items.filter((i) => !dismissedIds.has(i.id));

  function dismissItem(id: string) {
    setDismissedIds((prev) => new Set([...prev, id]));
  }

  const handleDraft = useCallback(async (item: BriefingItem) => {
    const outreachType = BRIEFING_TO_OUTREACH_TYPE[item.type];
    if (!outreachType) return;

    setDraftingId(item.id);
    try {
      const res  = await fetch("/api/ai/draft-outreach", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ client_id: item.clientId, opportunity_type: outreachType }),
      });
      const data = await res.json() as { status?: string; error?: string };

      if (!res.ok) {
        toast.error(data.error ?? "Drafting failed — try again");
        return;
      }

      if (data.status === "existing") {
        toast.info("Already drafted", {
          description: "This opportunity already has a draft in Flight Control.",
          action: { label: "Open Flight Control", onClick: () => window.location.href = "/flight-control" },
        });
      } else if (data.status === "queued") {
        toast.success("Queued for drafting", {
          description: "Groq is unavailable right now — your draft will be ready soon.",
          action: { label: "Open Flight Control", onClick: () => window.location.href = "/flight-control" },
        });
      } else {
        toast.success("Draft ready", {
          description: `AI has drafted an outreach email for ${item.title}.`,
          action: { label: "Review in Flight Control", onClick: () => window.location.href = "/flight-control" },
        });
      }
    } catch {
      toast.error("Network error — draft could not be created");
    } finally {
      setDraftingId(null);
    }
  }, []);

  // ── CRM Dashboard engine ────────────────────────────────────────────────
  const dashboard = useMemo(
    () => computeCrmDashboard({ clients, activities, records, periodDays }),
    [clients, activities, records, periodDays],
  );

  // ── Speed to Lead engine ────────────────────────────────────────────────
  const speedToLead = useMemo(
    () => computeSpeedToLead(clients),
    [clients],
  );

  // ── Tasks state ─────────────────────────────────────────────────────────
  const openTasks = useMemo(
    () => [...tasks].sort((a, b) => a.due_date.localeCompare(b.due_date)),
    [tasks],
  );

  const recentActivities = useMemo(
    () =>
      [...activities]
        .sort((a, b) => b.activity_date.localeCompare(a.activity_date))
        .slice(0, 20),
    [activities],
  );

  // Global add task form state
  const [showGlobalAddTask, setShowGlobalAddTask] = useState(false);
  const [globalTaskClientId, setGlobalTaskClientId] = useState<string | null>(null);
  const [globalTaskTitle, setGlobalTaskTitle] = useState("");
  const [globalTaskDueDate, setGlobalTaskDueDate] = useState(todayIso());
  const [globalTaskPriority, setGlobalTaskPriority] = useState<TaskPriority>("normal");
  const [globalTaskNotes, setGlobalTaskNotes] = useState("");
  const [globalTaskSaving, setGlobalTaskSaving] = useState(false);
  const [globalClientSearch, setGlobalClientSearch] = useState("");

  const filteredClientsForTask = useMemo(() => {
    const q = globalClientSearch.toLowerCase();
    return q
      ? clients.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 8)
      : clients.slice(0, 8);
  }, [clients, globalClientSearch]);

  async function handleGlobalAddTask() {
    if (!globalTaskTitle.trim()) return;
    setGlobalTaskSaving(true);
    await onAddTask(
      globalTaskClientId,
      globalTaskTitle.trim(),
      globalTaskDueDate,
      globalTaskPriority,
      globalTaskNotes.trim(),
    );
    setGlobalTaskSaving(false);
    setShowGlobalAddTask(false);
    setGlobalTaskTitle("");
    setGlobalTaskDueDate(todayIso());
    setGlobalTaskPriority("normal");
    setGlobalTaskNotes("");
    setGlobalTaskClientId(null);
    setGlobalClientSearch("");
  }

  // ── Recharts data ─────────────────────────────────────────────────────────
  const freqChartData = dashboard.frequencyBuckets.map((b) => ({
    name: b.label,
    count: b.count,
  }));

  const pieChartData = dashboard.activityBreakdown.map((b) => ({
    name: b.label,
    value: b.count,
  }));

  return (
    <div className="space-y-6">
      {/* ── Intelligence Briefing ─────────────────────────────────────── */}
      {briefing.totalCount > 0 && (
        <Card className="rounded-2xl border-violet-200 bg-violet-50/60 shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-violet-500" />
                <CardTitle className="text-sm font-semibold text-violet-900">
                  Today&apos;s Briefing
                </CardTitle>
                <div className="flex items-center gap-1.5 ml-1">
                  {visibleItems.filter((i) => i.severity === "urgent").length > 0 && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-red-100 text-red-700 border border-red-200 rounded-full px-2 py-0.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-red-500 inline-block" />
                      {visibleItems.filter((i) => i.severity === "urgent").length} urgent
                    </span>
                  )}
                  {visibleItems.filter((i) => i.severity === "attention").length > 0 && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-amber-100 text-amber-700 border border-amber-200 rounded-full px-2 py-0.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-500 inline-block" />
                      {visibleItems.filter((i) => i.severity === "attention").length} to review
                    </span>
                  )}
                  {visibleItems.filter((i) => i.severity === "upcoming").length > 0 && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-blue-100 text-blue-700 border border-blue-200 rounded-full px-2 py-0.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-blue-400 inline-block" />
                      {visibleItems.filter((i) => i.severity === "upcoming").length} upcoming
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => setBriefingExpanded((v) => !v)}
                className="text-violet-500 hover:text-violet-700 transition-colors"
                aria-label={briefingExpanded ? "Collapse briefing" : "Expand briefing"}
              >
                {briefingExpanded
                  ? <ChevronUp className="h-4 w-4" />
                  : <ChevronDown className="h-4 w-4" />}
              </button>
            </div>
          </CardHeader>
          {briefingExpanded && visibleItems.length > 0 && (
            <CardContent className="pt-0 pb-3">
              <div className="space-y-1.5">
                {visibleItems.map((item) => (
                  <BriefingRow
                    key={item.id}
                    item={item}
                    onView={() => onOpenDetailPanel(item.clientId)}
                    onDismiss={() => dismissItem(item.id)}
                    onDraft={BRIEFING_TO_OUTREACH_TYPE[item.type] ? () => handleDraft(item) : undefined}
                    drafting={draftingId === item.id}
                  />
                ))}
              </div>
            </CardContent>
          )}
          {briefingExpanded && visibleItems.length === 0 && (
            <CardContent className="pt-0 pb-4">
              <p className="text-sm text-violet-700/70 text-center py-2">
                All items reviewed — you&apos;re up to date.
              </p>
            </CardContent>
          )}
        </Card>
      )}

      {/* ── Period Selector ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-muted-foreground">Period:</span>
        {([30, 60, 90] as const).map((d) => (
          <Button
            key={d}
            variant={periodDays === d ? "default" : "outline"}
            size="sm"
            onClick={() => setPeriodDays(d)}
            className="h-7 text-xs px-3"
          >
            {d}d
          </Button>
        ))}
      </div>

      {/* ── Outreach KPI Strip ────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard
          icon={<Activity className="h-4 w-4 text-blue-500" />}
          label="Touchpoints"
          value={String(dashboard.kpis.totalTouchpoints)}
          sub={`Last ${periodDays} days`}
          accent="blue"
        />
        <SummaryCard
          icon={<Users className="h-4 w-4 text-violet-500" />}
          label="Avg / Client"
          value={String(dashboard.kpis.avgContactsPerClient)}
          sub="contacts per client"
          accent="violet"
        />
        <SummaryCard
          icon={<AlertTriangle className="h-4 w-4 text-red-500" />}
          label="Overdue"
          value={String(dashboard.kpis.overdueCount)}
          sub="30+ days no contact"
          accent={dashboard.kpis.overdueCount > 0 ? "red" : "emerald"}
        />
        <SummaryCard
          icon={
            dashboard.kpis.touchpointTrend === null || dashboard.kpis.touchpointTrend >= 0 ? (
              <TrendingUp className="h-4 w-4 text-emerald-500" />
            ) : (
              <TrendingDown className="h-4 w-4 text-red-500" />
            )
          }
          label="Trend"
          value={dashboard.kpis.touchpointTrend === null ? "New" : `${dashboard.kpis.touchpointTrend >= 0 ? "+" : ""}${dashboard.kpis.touchpointTrend}%`}
          sub={dashboard.kpis.touchpointTrend === null ? "No prior period" : `vs prior ${periodDays}d`}
          accent={dashboard.kpis.touchpointTrend === null ? "emerald" : dashboard.kpis.touchpointTrend >= 0 ? "emerald" : "red"}
        />
      </div>

      {/* ── Speed to Lead Card ────────────────────────────────────────── */}
      <Card className="rounded-2xl border-sky-200 bg-gradient-to-br from-sky-50 to-blue-50 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-sky-800 flex items-center gap-2">
            <Zap className="h-4 w-4 text-sky-500" />
            Speed to Lead
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {speedToLead.kpis.totalMeasurable === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Log your first activity to start tracking Speed to Lead.
              The clock starts when a client is created and stops at first contact.
            </p>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Median Response</p>
                  <p className="text-xl font-bold tabular-nums text-foreground">{fmtResponseTime(speedToLead.kpis.medianResponseHours)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Best</p>
                  <p className="text-xl font-bold tabular-nums text-emerald-600">{fmtResponseTime(speedToLead.kpis.bestResponseHours)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Worst</p>
                  <p className="text-xl font-bold tabular-nums text-red-600">{fmtResponseTime(speedToLead.kpis.worstResponseHours)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Within 1hr</p>
                  <p className="text-xl font-bold tabular-nums text-foreground">{speedToLead.kpis.pctWithin1Hour}%</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Within 24hr</p>
                  <p className="text-xl font-bold tabular-nums text-foreground">{speedToLead.kpis.pctWithin24Hours}%</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Measurable</p>
                  <p className="text-xl font-bold tabular-nums text-foreground">{speedToLead.kpis.totalMeasurable}</p>
                </div>
              </div>

              {/* Speed by Source table */}
              {speedToLead.bySource.length > 0 && (
                <div className="border-t border-sky-200/60 pt-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">By Source</p>
                  <div className="space-y-1">
                    {speedToLead.bySource.map((s) => (
                      <div key={s.source} className="flex items-center justify-between text-xs">
                        <span className="text-foreground font-medium">{s.source}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-muted-foreground">{s.count} lead{s.count !== 1 ? "s" : ""}</span>
                          <span className="font-semibold tabular-nums">{fmtResponseTime(s.avgResponseHours)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Charts: Frequency + Breakdown ─────────────────────────────── */}
      {mounted && (freqChartData.some((d) => d.count > 0) || pieChartData.length > 0) && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Contact Frequency Distribution */}
          <Card className="rounded-2xl shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-blue-500" />
                Contact Frequency ({periodDays}d)
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={freqChartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{ fontSize: 12, borderRadius: 8 }}
                      formatter={(value) => [`${value} clients`, "Count"]}
                    />
                    <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Contacts per client in the last {periodDays} days
              </p>
            </CardContent>
          </Card>

          {/* Activity Breakdown by Type */}
          <Card className="rounded-2xl shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Target className="h-4 w-4 text-violet-500" />
                Activity Breakdown ({periodDays}d)
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="h-48 flex items-center">
                <div className="w-1/2 h-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieChartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={35}
                        outerRadius={65}
                        dataKey="value"
                        stroke="none"
                      >
                        {pieChartData.map((_, idx) => (
                          <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ fontSize: 12, borderRadius: 8 }}
                        formatter={(value) => [`${value}`, ""]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="w-1/2 space-y-1.5 pl-2">
                  {pieChartData.map((item, idx) => (
                    <div key={item.name} className="flex items-center gap-2 text-xs">
                      <div
                        className="h-2.5 w-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] }}
                      />
                      <span className="text-foreground truncate">{item.name}</span>
                      <span className="text-muted-foreground ml-auto tabular-nums">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Overdue Outreach Table ─────────────────────────────────────── */}
      {dashboard.overdueClients.length > 0 && (
        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Clock className="h-4 w-4 text-red-500" />
              Overdue Outreach
              <Badge variant="outline" className="text-[10px] bg-red-50 text-red-700 border-red-200 ml-1 py-0">
                {dashboard.overdueClients.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60">
                    <th className="text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground pb-2 pr-4">Name</th>
                    <th className="text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground pb-2 px-3">Status</th>
                    <th className="text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground pb-2 px-3">Last Activity</th>
                    <th className="text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground pb-2 px-3">Days</th>
                    <th className="text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground pb-2 pl-3">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {dashboard.overdueClients.slice(0, 20).map((oc) => {
                    const colors = CLIENT_STATUS_COLORS[oc.status];
                    return (
                      <tr
                        key={oc.clientId}
                        className={cn(
                          "group hover:bg-muted/30 transition-colors",
                          oc.daysSinceContact >= 60 ? "bg-red-50/30" : oc.daysSinceContact >= 30 ? "bg-amber-50/30" : "",
                        )}
                      >
                        <td className="py-2 pr-4">
                          <button
                            onClick={() => onOpenDetailPanel(oc.clientId)}
                            className="text-sm font-medium text-foreground hover:text-primary transition-colors text-left"
                          >
                            {oc.name}
                          </button>
                        </td>
                        <td className="py-2 px-3">
                          <Badge variant="outline" className={cn("text-[10px] py-0", colors.bg, colors.text, colors.border)}>
                            {CLIENT_STATUS_LABELS[oc.status]}
                          </Badge>
                        </td>
                        <td className="py-2 px-3 text-xs text-muted-foreground">
                          {oc.lastActivityType ? ACTIVITY_TYPE_LABELS[oc.lastActivityType] : "Never"}
                        </td>
                        <td className={cn(
                          "py-2 px-3 text-right tabular-nums text-sm font-semibold",
                          oc.daysSinceContact >= 60 ? "text-red-600" : "text-amber-600",
                        )}>
                          {oc.daysSinceContact === 999 ? "∞" : oc.daysSinceContact}
                        </td>
                        <td className="py-2 pl-3 text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 text-[10px] px-2"
                            onClick={() => onOpenDetailPanel(oc.clientId)}
                          >
                            <Phone className="h-3 w-3 mr-1" />
                            Contact
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Tasks + Recent Activity (existing panels) ─────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Tasks panel */}
        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <ListTodo className="h-4 w-4 text-blue-500" />
                Follow-up Tasks
              </CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowGlobalAddTask((v) => !v)}
                className="gap-1 h-7 text-xs"
              >
                <Plus className="h-3 w-3" />
                Add Task
              </Button>
            </div>
          </CardHeader>

          {/* Global add task inline form */}
          {showGlobalAddTask && (
            <CardContent className="pt-0 pb-3">
              <div className="rounded-xl border border-border/60 bg-muted/30 p-3 space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs">Task title</Label>
                  <Input
                    placeholder="e.g. Follow up with Sarah"
                    value={globalTaskTitle}
                    onChange={(e) => setGlobalTaskTitle(e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Client (optional)</Label>
                  <Input
                    placeholder="Search clients…"
                    value={globalClientSearch}
                    onChange={(e) => setGlobalClientSearch(e.target.value)}
                    className="h-8 text-sm"
                  />
                  {globalClientSearch && filteredClientsForTask.length > 0 && (
                    <div className="border border-border rounded-lg bg-background shadow-sm overflow-hidden mt-1">
                      {filteredClientsForTask.map((c) => (
                        <button
                          key={c.id}
                          className={cn(
                            "w-full text-left px-3 py-1.5 text-sm hover:bg-muted transition-colors",
                            globalTaskClientId === c.id && "bg-primary/10 text-primary",
                          )}
                          onClick={() => {
                            setGlobalTaskClientId(c.id);
                            setGlobalClientSearch(c.name);
                          }}
                        >
                          {c.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Due date</Label>
                    <Input
                      type="date"
                      value={globalTaskDueDate}
                      onChange={(e) => setGlobalTaskDueDate(e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Priority</Label>
                    <Select
                      value={globalTaskPriority}
                      onValueChange={(v) => setGlobalTaskPriority(v as TaskPriority)}
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="normal">Normal</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Notes (optional)</Label>
                  <Textarea
                    placeholder="Any notes…"
                    value={globalTaskNotes}
                    onChange={(e) => setGlobalTaskNotes(e.target.value)}
                    rows={2}
                    className="text-sm resize-none"
                  />
                </div>
                <div className="flex gap-2 pt-1">
                  <Button
                    size="sm"
                    disabled={!globalTaskTitle.trim() || globalTaskSaving}
                    onClick={handleGlobalAddTask}
                    className="h-7 text-xs"
                  >
                    {globalTaskSaving ? "Saving…" : "Save Task"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setShowGlobalAddTask(false)}
                    className="h-7 text-xs"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </CardContent>
          )}

          <CardContent className="pt-0">
            {openTasks.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                No open tasks. Add one to stay on top of follow-ups.
              </p>
            ) : (
              <div className="space-y-1">
                {openTasks.map((task) => {
                  const client = task.client_id
                    ? clientById.get(task.client_id)
                    : null;
                  const isOverdue = task.due_date < todayIso();
                  return (
                    <div
                      key={task.id}
                      className="flex items-start gap-2.5 py-2 px-1 rounded-lg hover:bg-muted/30 transition-colors group"
                    >
                      <button
                        onClick={() => onCompleteTask(task.id)}
                        className="mt-0.5 text-muted-foreground hover:text-emerald-600 transition-colors shrink-0"
                        title="Mark complete"
                      >
                        <Square className="h-4 w-4" />
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={cn(
                              "text-[10px] font-semibold border rounded-full px-2.5 py-0.5 shrink-0",
                              PRIORITY_STYLES[task.priority],
                            )}
                          >
                            {task.priority}
                          </span>
                          <span className="text-sm font-medium text-foreground truncate">
                            {task.title}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          {client && (
                            <span className="text-xs text-muted-foreground truncate">
                              {client.name}
                            </span>
                          )}
                          <span
                            className={cn(
                              "text-xs shrink-0",
                              isOverdue
                                ? "text-red-600 font-medium"
                                : "text-muted-foreground",
                            )}
                          >
                            {isOverdue ? "Overdue · " : ""}
                            {fmtDate(task.due_date)}
                          </span>
                        </div>
                        {task.notes && (
                          <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                            {task.notes}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Activity feed */}
        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Activity className="h-4 w-4 text-emerald-500" />
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {recentActivities.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                No activity logged yet.
              </p>
            ) : (
              <div className="relative border-l-2 border-muted-foreground/20 ml-2 space-y-0">
                {recentActivities.map((act) => {
                  const client = clientById.get(act.client_id);
                  return (
                    <div key={act.id} className="relative pl-5 pb-4 last:pb-0">
                      <div className="absolute -left-1.5 top-0.5 h-3 w-3 rounded-full bg-emerald-400 border-2 border-background" />
                      <div className="flex items-start gap-2">
                        <span className="text-base leading-none mt-0.5 shrink-0">
                          {ACTIVITY_TYPE_ICONS[act.type]}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs font-semibold text-foreground">
                              {ACTIVITY_TYPE_LABELS[act.type]}
                            </span>
                            {client && (
                              <span className="text-xs text-muted-foreground">
                                · {client.name}
                              </span>
                            )}
                            <span className="text-xs text-muted-foreground ml-auto shrink-0">
                              {relativeDate(act.activity_date)}
                            </span>
                          </div>
                          {act.description && (
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                              {act.description}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
