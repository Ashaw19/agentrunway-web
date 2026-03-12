"use client";

import { useState, useMemo, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Users,
  Search,
  TrendingUp,
  RepeatIcon,
  Home,
  Trophy,
  Star,
  BarChart3,
  PieChart,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Plus,
  Upload,
  Square,
  CheckCheck,
  Activity,
  ListTodo,
} from "lucide-react";
import { fmtCurrency } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import type {
  Client,
  ClientRecord,
  ContactActivity,
  ContactTask,
  ActivityType,
  TaskPriority,
} from "@/lib/types/database";
import {
  ACTIVITY_TYPE_LABELS,
  ACTIVITY_TYPE_ICONS,
} from "@/lib/types/database";
import { createClient } from "@/lib/supabase/client";

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  clients: Client[];
  records: ClientRecord[];
  activities: ContactActivity[];
  tasks: ContactTask[];
}

// ── Types ─────────────────────────────────────────────────────────────────────

type ClientGroup = {
  clientId: string | null;
  name: string;
  deals: ClientRecord[];
  totalGCI: number;
  dealCount: number;
  avgDeal: number;
  lastDeal: string | null;
  years: number[];
};

type SortCol = "name" | "deals" | "gci" | "avg" | "last" | "years" | "side";
type SortDir = "asc" | "desc";
type TabId = "clients" | "crm" | "insights";
type SourceStat = { source: string; deals: number; totalGCI: number; avgGCI: number };

// CSV import state
interface CsvRow {
  [col: string]: string;
}
type ImportStep = "upload" | "map" | "confirm" | "done";

// ── Date helpers ──────────────────────────────────────────────────────────────

function relativeDate(isoStr: string): string {
  const d = new Date(isoStr);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return d.toLocaleDateString("en-CA", { month: "short", day: "numeric" });
}

function fmtDate(iso: string): string {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
  });
}

function fmtMonthYear(iso: string): string {
  try {
    return new Date(iso + "T12:00:00").toLocaleDateString("en-CA", {
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function nowIso(): string {
  return new Date().toISOString().slice(0, 16);
}

// ── Priority style ────────────────────────────────────────────────────────────

const PRIORITY_STYLES: Record<TaskPriority, string> = {
  high:   "bg-red-50 text-red-700 border-red-200",
  normal: "bg-blue-50 text-blue-700 border-blue-200",
  low:    "bg-gray-50 text-gray-600 border-gray-200",
};

// ── Build client groups ───────────────────────────────────────────────────────

function buildAllGroups(clients: Client[], records: ClientRecord[]): ClientGroup[] {
  const nameToId = new Map(clients.map((c) => [c.name_search, c.id]));

  const buckets = new Map<string, ClientRecord[]>();

  for (const r of records) {
    const key =
      r.client_id ??
      nameToId.get(r.name.trim().toLowerCase()) ??
      `__v__${r.name.trim().toLowerCase()}`;
    const b = buckets.get(key) ?? [];
    b.push(r);
    buckets.set(key, b);
  }

  const groups: ClientGroup[] = [];

  for (const client of clients) {
    const deals = buckets.get(client.id) ?? [];
    if (deals.length > 0) {
      groups.push(makeGroup(client.id, client.name, deals));
    }
  }

  for (const [key, deals] of buckets) {
    if (key.startsWith("__v__")) {
      groups.push(makeGroup(null, deals[0].name, deals));
    }
  }

  return groups.sort((a, b) => b.totalGCI - a.totalGCI);
}

function makeGroup(
  clientId: string | null,
  name: string,
  deals: ClientRecord[],
): ClientGroup {
  const totalGCI =
    Math.round(deals.reduce((s, d) => s + (d.gci ?? 0), 0) * 100) / 100;
  const dealCount = deals.length;
  const avgDeal = dealCount > 0 ? Math.round(totalGCI / dealCount) : 0;
  const sortedDates = deals
    .map((d) => d.close_date)
    .filter(Boolean)
    .sort()
    .reverse();
  const lastDeal = (sortedDates[0] as string | undefined) ?? null;
  const years = [
    ...new Set(
      deals.map((d) => d.year).filter((y): y is number => y !== null),
    ),
  ].sort((a, b) => b - a);
  return { clientId, name, deals, totalGCI, dealCount, avgDeal, lastDeal, years };
}

function computeSourceStats(records: ClientRecord[]): SourceStat[] {
  const map = new Map<string, { deals: number; totalGCI: number }>();
  for (const r of records) {
    const src = r.source?.trim() || "Unknown";
    if (!map.has(src)) map.set(src, { deals: 0, totalGCI: 0 });
    const s = map.get(src)!;
    s.deals++;
    s.totalGCI = Math.round((s.totalGCI + (r.gci ?? 0)) * 100) / 100;
  }
  return Array.from(map.entries())
    .map(([source, s]) => ({
      source,
      ...s,
      avgGCI: Math.round(s.totalGCI / s.deals),
    }))
    .sort((a, b) => b.totalGCI - a.totalGCI);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const SIDE_STYLES: Record<string, { label: string; cls: string }> = {
  buyer:  { label: "Buyer",  cls: "bg-blue-50 text-blue-700 border-blue-200" },
  seller: { label: "Seller", cls: "bg-purple-50 text-purple-700 border-purple-200" },
  both:   { label: "Both",   cls: "bg-teal-50 text-teal-700 border-teal-200" },
};

function dominantSide(
  deals: ClientRecord[],
): "buyer" | "seller" | "both" {
  const counts = { buyer: 0, seller: 0, both: 0 };
  deals.forEach((d) => {
    if (d.side) counts[d.side as keyof typeof counts]++;
  });
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] as
    | "buyer"
    | "seller"
    | "both";
}

function sortTableGroups(
  groups: ClientGroup[],
  col: SortCol,
  dir: SortDir,
): ClientGroup[] {
  return [...groups].sort((a, b) => {
    let cmp = 0;
    switch (col) {
      case "name":  cmp = a.name.localeCompare(b.name); break;
      case "deals": cmp = a.dealCount - b.dealCount; break;
      case "gci":   cmp = a.totalGCI - b.totalGCI; break;
      case "avg":   cmp = a.avgDeal - b.avgDeal; break;
      case "last":
        if (!a.lastDeal && !b.lastDeal) cmp = 0;
        else if (!a.lastDeal) cmp = 1;
        else if (!b.lastDeal) cmp = -1;
        else cmp = a.lastDeal.localeCompare(b.lastDeal);
        break;
      case "years": cmp = a.years.length - b.years.length; break;
      case "side":
        cmp = dominantSide(a.deals).localeCompare(dominantSide(b.deals));
        break;
      default: cmp = 0;
    }
    return dir === "asc" ? cmp : -cmp;
  });
}

// ── CSV Parsing ───────────────────────────────────────────────────────────────

function parseCsv(text: string): { headers: string[]; rows: CsvRow[] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return { headers: [], rows: [] };

  function splitLine(line: string): string[] {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === "," && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  }

  const headers = splitLine(lines[0]);
  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = splitLine(lines[i]);
    const row: CsvRow = {};
    headers.forEach((h, idx) => {
      row[h] = vals[idx] ?? "";
    });
    rows.push(row);
  }
  return { headers, rows };
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export function ClientsContent({
  clients: initialClients,
  records,
  activities: initialActivities,
  tasks: initialTasks,
}: Props) {
  // ── Local state ─────────────────────────────────────────────────────────────
  const [localActivities, setLocalActivities] =
    useState<ContactActivity[]>(initialActivities);
  const [localTasks, setLocalTasks] = useState<ContactTask[]>(initialTasks);
  const [localClients, setLocalClients] = useState<Client[]>(initialClients);

  const [search, setSearch] = useState("");
  const [filterSide, setFilterSide] = useState<"all" | "buyer" | "seller" | "both">("all");
  const [filterSource, setFilterSource] = useState<string>("all");
  const [sortCol, setSortCol] = useState<SortCol>("gci");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [tab, setTab] = useState<TabId>("clients");

  // Detail panel state
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [detailPanelOpen, setDetailPanelOpen] = useState(false);

  // Log activity form (in detail panel)
  const [showLogActivity, setShowLogActivity] = useState(false);
  const [logActivityClientId, setLogActivityClientId] = useState<string | null>(null);
  const [logType, setLogType] = useState<ActivityType>("call");
  const [logDescription, setLogDescription] = useState("");
  const [logDate, setLogDate] = useState(nowIso());
  const [logSaving, setLogSaving] = useState(false);

  // Add task form (in detail panel)
  const [showAddTask, setShowAddTask] = useState(false);
  const [addTaskClientId, setAddTaskClientId] = useState<string | null>(null);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDueDate, setTaskDueDate] = useState(todayIso());
  const [taskPriority, setTaskPriority] = useState<TaskPriority>("normal");
  const [taskNotes, setTaskNotes] = useState("");
  const [taskSaving, setTaskSaving] = useState(false);

  // CRM tab global "Add Task" form
  const [showGlobalAddTask, setShowGlobalAddTask] = useState(false);
  const [globalTaskClientId, setGlobalTaskClientId] = useState<string | null>(null);
  const [globalTaskTitle, setGlobalTaskTitle] = useState("");
  const [globalTaskDueDate, setGlobalTaskDueDate] = useState(todayIso());
  const [globalTaskPriority, setGlobalTaskPriority] = useState<TaskPriority>("normal");
  const [globalTaskNotes, setGlobalTaskNotes] = useState("");
  const [globalTaskSaving, setGlobalTaskSaving] = useState(false);
  const [globalClientSearch, setGlobalClientSearch] = useState("");

  // CSV Import modal
  const [importOpen, setImportOpen] = useState(false);
  const [importStep, setImportStep] = useState<ImportStep>("upload");
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<CsvRow[]>([]);
  const [mapName, setMapName] = useState("");
  const [mapEmail, setMapEmail] = useState("__none__");
  const [mapPhone, setMapPhone] = useState("__none__");
  const [mapSource, setMapSource] = useState("__none__");
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number } | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleSort(col: SortCol) {
    if (col === sortCol) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
  }

  // ── Core data ───────────────────────────────────────────────────────────────
  const grouped = useMemo(
    () => buildAllGroups(localClients, records),
    [localClients, records],
  );
  const totalGCI = useMemo(
    () => grouped.reduce((s, g) => s + g.totalGCI, 0),
    [grouped],
  );
  const repeatCount = grouped.filter((g) => g.dealCount > 1).length;
  const repeatRate =
    grouped.length > 0
      ? Math.round((repeatCount / grouped.length) * 100)
      : 0;
  const totalDeals = grouped.reduce((s, g) => s + g.dealCount, 0);

  const topClients = useMemo(
    () => [...grouped].sort((a, b) => b.totalGCI - a.totalGCI).slice(0, 5),
    [grouped],
  );
  const sourceStats = useMemo(() => computeSourceStats(records), [records]);
  const topSource = sourceStats[0] ?? null;
  const sortedByGCI = useMemo(
    () => [...grouped].sort((a, b) => b.totalGCI - a.totalGCI),
    [grouped],
  );
  const concentrationPct =
    totalGCI > 0
      ? Math.round(
          (sortedByGCI
            .slice(0, 5)
            .reduce((s, g) => s + g.totalGCI, 0) /
            totalGCI) *
            100,
        )
      : 0;

  const sources = useMemo(
    () =>
      [
        ...new Set(
          records.map((r) => r.source).filter(Boolean) as string[],
        ),
      ].sort(),
    [records],
  );

  const filtered = useMemo(() => {
    const f = grouped.filter((g) => {
      if (search) {
        const q = search.toLowerCase();
        if (
          !g.name.toLowerCase().includes(q) &&
          !g.deals.some((d) => d.address?.toLowerCase().includes(q))
        )
          return false;
      }
      if (
        filterSide !== "all" &&
        !g.deals.some((d) => d.side === filterSide)
      )
        return false;
      if (
        filterSource !== "all" &&
        !g.deals.some((d) => d.source === filterSource)
      )
        return false;
      return true;
    });
    return sortTableGroups(f, sortCol, sortDir);
  }, [grouped, search, filterSide, filterSource, sortCol, sortDir]);

  const hasAnyData = records.length > 0;

  // Open tasks sorted by due_date ASC
  const openTasks = useMemo(
    () => [...localTasks].sort((a, b) => a.due_date.localeCompare(b.due_date)),
    [localTasks],
  );

  // Recent activities sorted by activity_date DESC, limited to 20
  const recentActivities = useMemo(
    () =>
      [...localActivities]
        .sort((a, b) => b.activity_date.localeCompare(a.activity_date))
        .slice(0, 20),
    [localActivities],
  );

  // Client lookup map
  const clientById = useMemo(
    () => new Map(localClients.map((c) => [c.id, c])),
    [localClients],
  );

  // Selected client detail
  const selectedClient = selectedClientId
    ? clientById.get(selectedClientId) ?? null
    : null;

  const clientActivities = useMemo(
    () =>
      selectedClientId
        ? [...localActivities]
            .filter((a) => a.client_id === selectedClientId)
            .sort((a, b) => b.activity_date.localeCompare(a.activity_date))
        : [],
    [localActivities, selectedClientId],
  );

  const clientTasks = useMemo(
    () =>
      selectedClientId
        ? openTasks.filter((t) => t.client_id === selectedClientId)
        : [],
    [openTasks, selectedClientId],
  );

  // ── Mutations ───────────────────────────────────────────────────────────────

  const logActivity = useCallback(
    async (
      clientId: string,
      type: ActivityType,
      description: string,
      activityDate: string,
    ) => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("contact_activities")
        .insert({
          user_id: user.id,
          client_id: clientId,
          type,
          description,
          activity_date: activityDate,
        })
        .select()
        .single();

      if (!error && data) {
        setLocalActivities((prev) => [data as ContactActivity, ...prev]);
      }
    },
    [],
  );

  const addTask = useCallback(
    async (
      clientId: string | null,
      title: string,
      dueDate: string,
      priority: TaskPriority,
      notes: string,
    ) => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("contact_tasks")
        .insert({
          user_id: user.id,
          client_id: clientId || null,
          title,
          due_date: dueDate,
          priority,
          notes: notes || null,
        })
        .select()
        .single();

      if (!error && data) {
        setLocalTasks((prev) => [data as ContactTask, ...prev]);
      }
    },
    [],
  );

  const completeTask = useCallback(async (taskId: string) => {
    setLocalTasks((prev) => prev.filter((t) => t.id !== taskId));
    const supabase = createClient();
    await supabase
      .from("contact_tasks")
      .update({ completed_at: new Date().toISOString() })
      .eq("id", taskId);
  }, []);

  // ── Form handlers ────────────────────────────────────────────────────────────

  function openDetailPanel(clientId: string) {
    setSelectedClientId(clientId);
    setDetailPanelOpen(true);
    setShowLogActivity(false);
    setShowAddTask(false);
    setLogType("call");
    setLogDescription("");
    setLogDate(nowIso());
    setTaskTitle("");
    setTaskDueDate(todayIso());
    setTaskPriority("normal");
    setTaskNotes("");
  }

  async function handleLogActivity() {
    if (!logDescription.trim() || !logActivityClientId) return;
    setLogSaving(true);
    await logActivity(logActivityClientId, logType, logDescription.trim(), logDate);
    setLogSaving(false);
    setShowLogActivity(false);
    setLogDescription("");
    setLogDate(nowIso());
  }

  async function handleAddTask() {
    if (!taskTitle.trim() || !addTaskClientId) return;
    setTaskSaving(true);
    await addTask(addTaskClientId, taskTitle.trim(), taskDueDate, taskPriority, taskNotes.trim());
    setTaskSaving(false);
    setShowAddTask(false);
    setTaskTitle("");
    setTaskDueDate(todayIso());
    setTaskPriority("normal");
    setTaskNotes("");
  }

  async function handleGlobalAddTask() {
    if (!globalTaskTitle.trim()) return;
    setGlobalTaskSaving(true);
    await addTask(
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

  // ── CSV Import ────────────────────────────────────────────────────────────

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const { headers, rows } = parseCsv(text);
      setCsvHeaders(headers);
      setCsvRows(rows);
      setMapName(headers[0] ?? "");
      setMapEmail("__none__");
      setMapPhone("__none__");
      setMapSource("__none__");
      setImportStep("map");
    };
    reader.readAsText(file);
  }

  async function handleImport() {
    if (!mapName) return;
    setImportLoading(true);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setImportLoading(false);
      return;
    }

    // Build existing name_search set for dedup
    const existingSearchNames = new Set(localClients.map((c) => c.name_search));
    let imported = 0;
    let skipped = 0;
    const newClients: Client[] = [];

    for (const row of csvRows) {
      const rawName = (row[mapName] ?? "").trim();
      if (!rawName) { skipped++; continue; }
      const nameSearch = rawName.toLowerCase();
      if (existingSearchNames.has(nameSearch)) { skipped++; continue; }

      const email = mapEmail !== "__none__" ? (row[mapEmail] ?? "").trim() || null : null;
      const phone = mapPhone !== "__none__" ? (row[mapPhone] ?? "").trim() || null : null;
      const leadSource = mapSource !== "__none__" ? (row[mapSource] ?? "").trim() || null : null;

      const { data, error } = await supabase
        .from("clients")
        .insert({
          user_id: user.id,
          name: rawName,
          name_search: nameSearch,
          email,
          phone,
          lead_source: leadSource,
          tags: [],
        })
        .select()
        .single();

      if (!error && data) {
        existingSearchNames.add(nameSearch);
        newClients.push(data as Client);
        imported++;
      } else {
        skipped++;
      }
    }

    setLocalClients((prev) => [...prev, ...newClients]);
    setImportResult({ imported, skipped });
    setImportStep("done");
    setImportLoading(false);
  }

  function resetImport() {
    setImportStep("upload");
    setCsvHeaders([]);
    setCsvRows([]);
    setMapName("");
    setMapEmail("__none__");
    setMapPhone("__none__");
    setMapSource("__none__");
    setImportResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // ── Filtered clients for global task form ───────────────────────────────────
  const filteredClientsForTask = useMemo(() => {
    const q = globalClientSearch.toLowerCase();
    return q
      ? localClients.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 8)
      : localClients.slice(0, 8);
  }, [localClients, globalClientSearch]);

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-b border-border/60 pb-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Clients</h1>
          <p className="text-sm text-muted-foreground">
            The people who made your year — quantified.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            resetImport();
            setImportOpen(true);
          }}
          className="gap-1.5 shrink-0"
        >
          <Upload className="h-3.5 w-3.5" />
          Import CSV
        </Button>
      </div>

      {/* ── Summary KPI strip ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard
          icon={<Users className="h-4 w-4 text-blue-500" />}
          label="Total Clients"
          value={String(grouped.length)}
          sub="unique relationships"
          accent="blue"
        />
        <SummaryCard
          icon={<RepeatIcon className="h-4 w-4 text-violet-500" />}
          label="Repeat Clients"
          value={`${repeatCount} (${repeatRate}%)`}
          sub="2 or more deals"
          accent="violet"
        />
        <SummaryCard
          icon={<TrendingUp className="h-4 w-4 text-emerald-500" />}
          label="Lifetime GCI"
          value={fmtCurrency(totalGCI)}
          sub="across all years"
          accent="emerald"
        />
        <SummaryCard
          icon={<Home className="h-4 w-4 text-amber-500" />}
          label="Total Deals"
          value={String(totalDeals)}
          sub="imported deal records"
          accent="amber"
        />
      </div>

      {/* ── Tabs ─────────────────────────────────────────────────────────── */}
      <div className="flex gap-1 border-b border-border/60">
        {(["clients", "crm", "insights"] as TabId[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              tab === t
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t === "clients" ? "Clients" : t === "crm" ? "CRM" : "Insights"}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* CLIENTS TAB                                                        */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {tab === "clients" && (
        <>
          {/* Search + filters */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Search by name or address…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              {(["all", "buyer", "seller", "both"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setFilterSide(s)}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-semibold border transition-colors",
                    filterSide === s
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card text-muted-foreground border-border hover:border-primary/40",
                  )}
                >
                  {s === "all" ? "All Sides" : s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
              {sources.length > 0 && (
                <>
                  <span className="text-muted-foreground/40 text-xs">|</span>
                  <select
                    value={filterSource}
                    onChange={(e) => setFilterSource(e.target.value)}
                    className="rounded-full px-3 py-1 text-xs font-semibold border border-border bg-card text-muted-foreground hover:border-primary/40 transition-colors cursor-pointer outline-none"
                  >
                    <option value="all">All Sources</option>
                    {sources.map((src) => (
                      <option key={src} value={src}>
                        {src}
                      </option>
                    ))}
                  </select>
                </>
              )}
            </div>
          </div>

          {/* Client table */}
          {!hasAnyData ? (
            <Card className="rounded-2xl border-slate-200 shadow-sm">
              <CardContent className="py-12 text-center text-muted-foreground">
                No clients yet. Import a brokerage report or career tracker
                from the History page to populate your client database.
              </CardContent>
            </Card>
          ) : (
            <Card className="rounded-2xl shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b border-border/60 hover:bg-transparent">
                      <SortableHead
                        col="name"
                        label="Client"
                        active={sortCol}
                        dir={sortDir}
                        onSort={handleSort}
                        className="pl-4"
                      />
                      <SortableHead
                        col="deals"
                        label="Deals"
                        active={sortCol}
                        dir={sortDir}
                        onSort={handleSort}
                        className="text-right"
                      />
                      <SortableHead
                        col="gci"
                        label="Lifetime GCI"
                        active={sortCol}
                        dir={sortDir}
                        onSort={handleSort}
                        className="text-right"
                      />
                      <SortableHead
                        col="avg"
                        label="Avg / Deal"
                        active={sortCol}
                        dir={sortDir}
                        onSort={handleSort}
                        className="text-right"
                      />
                      <SortableHead
                        col="last"
                        label="Last Deal"
                        active={sortCol}
                        dir={sortDir}
                        onSort={handleSort}
                        className="text-right"
                      />
                      <SortableHead
                        col="years"
                        label="Years Active"
                        active={sortCol}
                        dir={sortDir}
                        onSort={handleSort}
                      />
                      <SortableHead
                        col="side"
                        label="Side"
                        active={sortCol}
                        dir={sortDir}
                        onSort={handleSort}
                        className="pr-4"
                      />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={7}
                          className="py-12 text-center text-muted-foreground"
                        >
                          No clients match your search.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filtered.map((group) => {
                        const isRepeat = group.dealCount > 1;
                        const side = dominantSide(group.deals);
                        const sideStyle = SIDE_STYLES[side];
                        const hasClientId = group.clientId !== null;
                        return (
                          <TableRow
                            key={group.clientId ?? group.name}
                            className={cn(
                              "transition-colors",
                              hasClientId
                                ? "hover:bg-muted/40 cursor-pointer"
                                : "hover:bg-muted/20",
                            )}
                            onClick={() => {
                              if (hasClientId) {
                                openDetailPanel(group.clientId!);
                              }
                            }}
                          >
                            <TableCell className="pl-4 py-3">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-semibold shrink-0">
                                  {group.name.charAt(0).toUpperCase()}
                                </div>
                                <span className="font-medium text-foreground text-sm truncate">
                                  {group.name}
                                </span>
                                {isRepeat && (
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] bg-violet-50 text-violet-700 border-violet-200 shrink-0 py-0"
                                  >
                                    ×{group.dealCount}
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-sm text-muted-foreground py-3">
                              {group.dealCount}
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-sm font-semibold text-foreground py-3">
                              {fmtCurrency(group.totalGCI)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-sm text-muted-foreground py-3">
                              {fmtCurrency(group.avgDeal)}
                            </TableCell>
                            <TableCell className="text-right text-sm text-muted-foreground py-3 whitespace-nowrap">
                              {group.lastDeal ? fmtMonthYear(group.lastDeal) : "—"}
                            </TableCell>
                            <TableCell className="py-3">
                              <div className="flex flex-wrap gap-1">
                                {group.years.map((y) => (
                                  <span
                                    key={y}
                                    className="text-[10px] font-medium text-muted-foreground bg-muted rounded px-1.5 py-0.5"
                                  >
                                    {y}
                                  </span>
                                ))}
                              </div>
                            </TableCell>
                            <TableCell className="pr-4 py-3">
                              {sideStyle && (
                                <span
                                  className={cn(
                                    "text-[10px] font-semibold border rounded px-1.5 py-0.5 whitespace-nowrap",
                                    sideStyle.cls,
                                  )}
                                >
                                  {sideStyle.label}
                                </span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </Card>
          )}
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* CRM TAB                                                            */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {tab === "crm" && (
        <div className="space-y-6">
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
                    onClick={() => {
                      setShowGlobalAddTask((v) => !v);
                    }}
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

              <CardContent className={cn("pt-0", showGlobalAddTask ? "" : "")}>
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
                      const isOverdue =
                        task.due_date < todayIso();
                      return (
                        <div
                          key={task.id}
                          className="flex items-start gap-2.5 py-2 px-1 rounded-lg hover:bg-muted/30 transition-colors group"
                        >
                          <button
                            onClick={() => completeTask(task.id)}
                            className="mt-0.5 text-muted-foreground hover:text-emerald-600 transition-colors shrink-0"
                            title="Mark complete"
                          >
                            <Square className="h-4 w-4" />
                          </button>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span
                                className={cn(
                                  "text-[10px] font-semibold border rounded px-1.5 py-0.5 shrink-0",
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
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* INSIGHTS TAB                                                       */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {tab === "insights" && hasAnyData && (
        <div className="space-y-6">
          {/* Top 5 clients by lifetime GCI */}
          <Card className="rounded-2xl border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-amber-800 flex items-center gap-2">
                <Trophy className="h-4 w-4 text-amber-500" />
                Top Clients by Lifetime GCI
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-2">
              {topClients.map((c, i) => {
                const pct =
                  totalGCI > 0
                    ? Math.round((c.totalGCI / totalGCI) * 100)
                    : 0;
                return (
                  <div key={c.name} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={cn(
                            "text-[11px] font-bold w-5 text-center shrink-0",
                            i === 0 ? "text-amber-600" : "text-slate-400",
                          )}
                        >
                          #{i + 1}
                        </span>
                        <span className="text-sm font-medium text-foreground truncate">
                          {c.name}
                        </span>
                        {c.dealCount > 1 && (
                          <Badge
                            variant="outline"
                            className="text-[9px] bg-violet-50 text-violet-700 border-violet-200 shrink-0 py-0"
                          >
                            ×{c.dealCount}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-xs text-muted-foreground">
                          {pct}%
                        </span>
                        <span className="text-sm font-bold text-foreground tabular-nums">
                          {fmtCurrency(c.totalGCI)}
                        </span>
                      </div>
                    </div>
                    <div className="ml-7 h-1.5 rounded-full bg-amber-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-amber-400"
                        style={{ width: `${Math.max(pct, 2)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Client concentration */}
          {grouped.length >= 3 && (
            <Card className="rounded-2xl shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <PieChart className="h-4 w-4 text-slate-500" />
                  Client Concentration
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-2.5">
                {([1, 3, 5] as const).map((n) => {
                  const topN = sortedByGCI.slice(0, n);
                  const topNGCI = topN.reduce((s, g) => s + g.totalGCI, 0);
                  const pct =
                    totalGCI > 0
                      ? Math.round((topNGCI / totalGCI) * 100)
                      : 0;
                  const color =
                    pct > 60
                      ? "bg-amber-400"
                      : pct > 40
                      ? "bg-blue-400"
                      : "bg-emerald-400";
                  return (
                    <div key={n} className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground w-20 shrink-0">
                        Top {n} client{n !== 1 ? "s" : ""}
                      </span>
                      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all",
                            color,
                          )}
                          style={{ width: `${Math.max(pct, 2)}%` }}
                        />
                      </div>
                      <span className="text-xs font-semibold tabular-nums w-8 text-right">
                        {pct}%
                      </span>
                    </div>
                  );
                })}
                <p className="text-xs text-muted-foreground pt-1 border-t border-border/40">
                  {concentrationPct > 60
                    ? `Your top 5 clients generate ${concentrationPct}% of your GCI. Solid loyalists. Just don't put all your eggs in three baskets.`
                    : concentrationPct > 40
                    ? `Your top 5 clients generate ${concentrationPct}% of your GCI — decent spread. Room to diversify.`
                    : `Nicely spread. Your top 5 clients account for ${concentrationPct}% of GCI — no single client can make or break your year.`}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Lead source performance */}
          {sourceStats.length > 0 && (
            <Card className="rounded-2xl shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-blue-500" />
                  Lead Source Performance
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/60">
                        <th className="text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground pb-2 pr-4">
                          Source
                        </th>
                        <th className="text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground pb-2 px-3">
                          Deals
                        </th>
                        <th className="text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground pb-2 px-3">
                          Total GCI
                        </th>
                        <th className="text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground pb-2 pl-3">
                          Avg / Deal
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {sourceStats.map((s) => (
                        <tr
                          key={s.source}
                          className="group hover:bg-muted/30 transition-colors"
                        >
                          <td className="py-2 pr-4 font-medium text-foreground">
                            {s.source}
                          </td>
                          <td className="py-2 px-3 text-right tabular-nums text-muted-foreground">
                            {s.deals}
                          </td>
                          <td className="py-2 px-3 text-right tabular-nums font-semibold text-foreground">
                            {fmtCurrency(s.totalGCI)}
                          </td>
                          <td className="py-2 pl-3 text-right tabular-nums text-muted-foreground">
                            {fmtCurrency(s.avgGCI)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {topSource && (
                  <p className="mt-3 text-xs text-muted-foreground border-t border-border/40 pt-3">
                    <span className="font-semibold text-foreground">
                      {topSource.source}
                    </span>{" "}
                    is your top source —{" "}
                    {topSource.deals} deal{topSource.deals !== 1 ? "s" : ""}{" "}
                    generating {fmtCurrency(topSource.totalGCI)}.
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Repeat client insight */}
          {grouped.length >= 3 && (
            <Card
              className={cn(
                "rounded-2xl shadow-sm",
                repeatRate >= 20
                  ? "border-violet-200 bg-gradient-to-br from-violet-50 to-indigo-50"
                  : "border-border",
              )}
            >
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Star
                    className={cn(
                      "h-4 w-4",
                      repeatRate >= 20 ? "text-violet-500" : "text-muted-foreground",
                    )}
                  />
                  Repeat Client Rate
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-3">
                <div className="flex items-end gap-3">
                  <p className="text-4xl font-bold tabular-nums text-foreground">
                    {repeatRate}%
                  </p>
                  <p className="text-sm text-muted-foreground pb-1">
                    {repeatCount} of {grouped.length} clients returned for
                    another deal
                  </p>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      repeatRate >= 30
                        ? "bg-violet-500"
                        : repeatRate >= 15
                        ? "bg-violet-400"
                        : "bg-slate-300",
                    )}
                    style={{ width: `${Math.min(repeatRate, 100)}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {repeatRate >= 30
                    ? "Excellent loyalty — your clients keep coming back."
                    : repeatRate >= 15
                    ? "Good repeat rate. Nurturing past clients could grow this further."
                    : "Opportunity to build more repeat business."}
                </p>
                {repeatCount > 0 && (
                  <div className="pt-1 space-y-1">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Repeat Clients
                    </p>
                    {grouped
                      .filter((g) => g.dealCount > 1)
                      .sort((a, b) => b.dealCount - a.dealCount)
                      .slice(0, 8)
                      .map((g) => (
                        <div
                          key={g.name}
                          className="flex items-center justify-between text-xs"
                        >
                          <span className="text-foreground font-medium truncate mr-2">
                            {g.name}
                          </span>
                          <span className="text-muted-foreground shrink-0">
                            {g.dealCount} deals · {g.years.join(", ")}
                          </span>
                        </div>
                      ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* CLIENT DETAIL DIALOG                                               */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      <Dialog open={detailPanelOpen} onOpenChange={setDetailPanelOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          {selectedClient && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center text-lg font-semibold shrink-0">
                    {selectedClient.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <DialogTitle className="text-lg font-semibold leading-tight">
                      {selectedClient.name}
                    </DialogTitle>
                    {selectedClient.last_contact_at && (
                      <p className="text-xs text-muted-foreground">
                        Last contact: {relativeDate(selectedClient.last_contact_at)}
                      </p>
                    )}
                  </div>
                </div>
              </DialogHeader>

              {/* Contact info chips */}
              {(selectedClient.email ||
                selectedClient.phone ||
                selectedClient.lead_source) && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {selectedClient.email && (
                    <span className="text-xs bg-muted rounded-full px-2.5 py-1 text-foreground">
                      {selectedClient.email}
                    </span>
                  )}
                  {selectedClient.phone && (
                    <span className="text-xs bg-muted rounded-full px-2.5 py-1 text-foreground">
                      {selectedClient.phone}
                    </span>
                  )}
                  {selectedClient.lead_source && (
                    <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-2.5 py-1">
                      {selectedClient.lead_source}
                    </span>
                  )}
                </div>
              )}

              {selectedClient.tags && selectedClient.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {selectedClient.tags.map((tag) => (
                    <Badge
                      key={tag}
                      variant="outline"
                      className="text-[10px] bg-violet-50 text-violet-700 border-violet-200"
                    >
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}

              <Separator className="my-1" />

              {/* Activity section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground">Activity</h3>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1 h-7 text-xs"
                    onClick={() => {
                      setShowLogActivity((v) => !v);
                      setLogActivityClientId(selectedClient.id);
                      setShowAddTask(false);
                    }}
                  >
                    <Plus className="h-3 w-3" />
                    Log Activity
                  </Button>
                </div>

                {/* Log activity inline form */}
                {showLogActivity && (
                  <div className="rounded-xl border border-border/60 bg-muted/30 p-3 space-y-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Type</Label>
                      <Select
                        value={logType}
                        onValueChange={(v) => setLogType(v as ActivityType)}
                      >
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.keys(ACTIVITY_TYPE_LABELS) as ActivityType[]).map(
                            (t) => (
                              <SelectItem key={t} value={t}>
                                {ACTIVITY_TYPE_ICONS[t]} {ACTIVITY_TYPE_LABELS[t]}
                              </SelectItem>
                            ),
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Description</Label>
                      <Textarea
                        placeholder="What happened?"
                        value={logDescription}
                        onChange={(e) => setLogDescription(e.target.value)}
                        rows={2}
                        className="text-sm resize-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Date & time</Label>
                      <Input
                        type="datetime-local"
                        value={logDate}
                        onChange={(e) => setLogDate(e.target.value)}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        disabled={!logDescription.trim() || logSaving}
                        onClick={handleLogActivity}
                        className="h-7 text-xs"
                      >
                        {logSaving ? "Saving…" : "Save"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setShowLogActivity(false)}
                        className="h-7 text-xs"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}

                {/* Activity timeline */}
                {clientActivities.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-3 text-center">
                    No activity logged yet. Log your first contact.
                  </p>
                ) : (
                  <div className="relative border-l-2 border-muted-foreground/20 ml-2 space-y-0">
                    {clientActivities.map((act) => (
                      <div key={act.id} className="relative pl-4 pb-3 last:pb-0">
                        <div className="absolute -left-1.5 top-0.5 h-3 w-3 rounded-full bg-blue-400 border-2 border-background" />
                        <div className="flex items-start gap-1.5">
                          <span className="text-sm leading-none mt-0.5 shrink-0">
                            {ACTIVITY_TYPE_ICONS[act.type]}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-semibold text-foreground">
                                {ACTIVITY_TYPE_LABELS[act.type]}
                              </span>
                              <span className="text-[11px] text-muted-foreground shrink-0">
                                {relativeDate(act.activity_date)}
                              </span>
                            </div>
                            {act.description && (
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {act.description}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <Separator className="my-1" />

              {/* Tasks section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground">Tasks</h3>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1 h-7 text-xs"
                    onClick={() => {
                      setShowAddTask((v) => !v);
                      setAddTaskClientId(selectedClient.id);
                      setShowLogActivity(false);
                    }}
                  >
                    <Plus className="h-3 w-3" />
                    Add Task
                  </Button>
                </div>

                {/* Add task inline form */}
                {showAddTask && (
                  <div className="rounded-xl border border-border/60 bg-muted/30 p-3 space-y-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Title</Label>
                      <Input
                        placeholder="e.g. Send market update"
                        value={taskTitle}
                        onChange={(e) => setTaskTitle(e.target.value)}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Due date</Label>
                        <Input
                          type="date"
                          value={taskDueDate}
                          onChange={(e) => setTaskDueDate(e.target.value)}
                          className="h-8 text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Priority</Label>
                        <Select
                          value={taskPriority}
                          onValueChange={(v) =>
                            setTaskPriority(v as TaskPriority)
                          }
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
                        value={taskNotes}
                        onChange={(e) => setTaskNotes(e.target.value)}
                        rows={2}
                        className="text-sm resize-none"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        disabled={!taskTitle.trim() || taskSaving}
                        onClick={handleAddTask}
                        className="h-7 text-xs"
                      >
                        {taskSaving ? "Saving…" : "Save"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setShowAddTask(false)}
                        className="h-7 text-xs"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}

                {/* Task list for this client */}
                {clientTasks.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-3 text-center">
                    No tasks for this client.
                  </p>
                ) : (
                  <div className="space-y-1">
                    {clientTasks.map((task) => {
                      const isOverdue = task.due_date < todayIso();
                      return (
                        <div
                          key={task.id}
                          className="flex items-start gap-2.5 py-2 px-1 rounded-lg hover:bg-muted/30 transition-colors"
                        >
                          <button
                            onClick={() => completeTask(task.id)}
                            className="mt-0.5 text-muted-foreground hover:text-emerald-600 transition-colors shrink-0"
                            title="Mark complete"
                          >
                            <Square className="h-4 w-4" />
                          </button>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span
                                className={cn(
                                  "text-[10px] font-semibold border rounded px-1.5 py-0.5 shrink-0",
                                  PRIORITY_STYLES[task.priority],
                                )}
                              >
                                {task.priority}
                              </span>
                              <span className="text-sm font-medium text-foreground truncate">
                                {task.title}
                              </span>
                            </div>
                            <span
                              className={cn(
                                "text-xs mt-0.5",
                                isOverdue
                                  ? "text-red-600 font-medium"
                                  : "text-muted-foreground",
                              )}
                            >
                              {isOverdue ? "Overdue · " : ""}
                              {fmtDate(task.due_date)}
                            </span>
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
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* CSV IMPORT DIALOG                                                  */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-4 w-4" />
              Import Contacts from CSV
            </DialogTitle>
          </DialogHeader>

          {/* Step indicator */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {(["upload", "map", "confirm", "done"] as ImportStep[]).map(
              (s, i) => (
                <div key={s} className="flex items-center gap-2">
                  {i > 0 && <span className="text-border">›</span>}
                  <span
                    className={cn(
                      "font-medium",
                      importStep === s
                        ? "text-primary"
                        : i < (["upload", "map", "confirm", "done"] as ImportStep[]).indexOf(importStep)
                        ? "text-emerald-600"
                        : "text-muted-foreground",
                    )}
                  >
                    {i + 1}. {s.charAt(0).toUpperCase() + s.slice(1)}
                  </span>
                </div>
              ),
            )}
          </div>

          <Separator />

          {/* Step 1: Upload */}
          {importStep === "upload" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Upload a CSV file with your contacts. The first row should be column headers.
              </p>
              <div
                className="border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-primary/40 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm font-medium text-foreground">
                  Click to upload CSV
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  .csv files only
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>
            </div>
          )}

          {/* Step 2: Map columns */}
          {importStep === "map" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Map your CSV columns to contact fields. {csvRows.length} rows detected.
              </p>

              {/* Preview first 3 rows */}
              {csvRows.slice(0, 3).length > 0 && (
                <div className="rounded-lg border border-border overflow-x-auto">
                  <table className="text-xs w-full">
                    <thead className="bg-muted">
                      <tr>
                        {csvHeaders.slice(0, 5).map((h) => (
                          <th
                            key={h}
                            className="px-2 py-1.5 text-left font-semibold text-muted-foreground"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {csvRows.slice(0, 3).map((row, i) => (
                        <tr key={i}>
                          {csvHeaders.slice(0, 5).map((h) => (
                            <td
                              key={h}
                              className="px-2 py-1.5 text-muted-foreground truncate max-w-[120px]"
                            >
                              {row[h]}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Column mapping */}
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-x-4 gap-y-3 items-center">
                  <Label className="text-xs font-semibold">
                    Name <span className="text-red-500">*</span>
                  </Label>
                  <Select value={mapName} onValueChange={setMapName}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="Select column" />
                    </SelectTrigger>
                    <SelectContent>
                      {csvHeaders.map((h) => (
                        <SelectItem key={h} value={h}>
                          {h}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Label className="text-xs">Email</Label>
                  <Select value={mapEmail} onValueChange={setMapEmail}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— Skip —</SelectItem>
                      {csvHeaders.map((h) => (
                        <SelectItem key={h} value={h}>
                          {h}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Label className="text-xs">Phone</Label>
                  <Select value={mapPhone} onValueChange={setMapPhone}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— Skip —</SelectItem>
                      {csvHeaders.map((h) => (
                        <SelectItem key={h} value={h}>
                          {h}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Label className="text-xs">Lead Source</Label>
                  <Select value={mapSource} onValueChange={setMapSource}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— Skip —</SelectItem>
                      {csvHeaders.map((h) => (
                        <SelectItem key={h} value={h}>
                          {h}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <Button
                  disabled={!mapName}
                  onClick={() => setImportStep("confirm")}
                >
                  Continue
                </Button>
                <Button variant="ghost" onClick={() => setImportStep("upload")}>
                  Back
                </Button>
              </div>
            </div>
          )}

          {/* Step 3: Confirm */}
          {importStep === "confirm" && (
            <div className="space-y-4">
              <div className="rounded-xl bg-muted/40 p-4 space-y-1">
                <p className="text-sm font-semibold text-foreground">
                  Ready to import {csvRows.length} contacts
                </p>
                <p className="text-xs text-muted-foreground">
                  Duplicates (matching existing names) will be skipped automatically.
                </p>
              </div>
              <div className="text-xs text-muted-foreground space-y-1">
                <div className="flex gap-2">
                  <CheckCheck className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                  <span>Name column: <strong className="text-foreground">{mapName}</strong></span>
                </div>
                {mapEmail !== "__none__" && (
                  <div className="flex gap-2">
                    <CheckCheck className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                    <span>Email column: <strong className="text-foreground">{mapEmail}</strong></span>
                  </div>
                )}
                {mapPhone !== "__none__" && (
                  <div className="flex gap-2">
                    <CheckCheck className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                    <span>Phone column: <strong className="text-foreground">{mapPhone}</strong></span>
                  </div>
                )}
                {mapSource !== "__none__" && (
                  <div className="flex gap-2">
                    <CheckCheck className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                    <span>Lead source column: <strong className="text-foreground">{mapSource}</strong></span>
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  disabled={importLoading}
                  onClick={handleImport}
                >
                  {importLoading ? "Importing…" : "Import Contacts"}
                </Button>
                <Button variant="ghost" onClick={() => setImportStep("map")}>
                  Back
                </Button>
              </div>
            </div>
          )}

          {/* Step 4: Done */}
          {importStep === "done" && importResult && (
            <div className="space-y-4">
              <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 space-y-1">
                <p className="text-sm font-semibold text-emerald-800">
                  Import complete
                </p>
                <p className="text-sm text-emerald-700">
                  {importResult.imported} contact{importResult.imported !== 1 ? "s" : ""} imported
                  {importResult.skipped > 0
                    ? `, ${importResult.skipped} skipped (duplicates)`
                    : ""}
                  .
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => {
                    setImportOpen(false);
                    resetImport();
                  }}
                >
                  Done
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    resetImport();
                  }}
                >
                  Import Another File
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function SortableHead({
  col,
  label,
  active,
  dir,
  onSort,
  className,
}: {
  col: SortCol;
  label: string;
  active: SortCol;
  dir: SortDir;
  onSort: (col: SortCol) => void;
  className?: string;
}) {
  const isActive = col === active;
  return (
    <TableHead
      onClick={() => onSort(col)}
      className={cn(
        "text-xs font-medium text-muted-foreground uppercase tracking-wide cursor-pointer select-none hover:text-foreground transition-colors whitespace-nowrap",
        className,
      )}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {isActive ? (
          dir === "asc" ? (
            <ArrowUp className="h-3 w-3 shrink-0" />
          ) : (
            <ArrowDown className="h-3 w-3 shrink-0" />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 shrink-0 opacity-40" />
        )}
      </span>
    </TableHead>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  accent: "blue" | "violet" | "emerald" | "amber";
}) {
  const accentMap = {
    blue:    "from-blue-50 border-blue-200",
    violet:  "from-violet-50 border-violet-200",
    emerald: "from-emerald-50 border-emerald-200",
    amber:   "from-amber-50 border-amber-200",
  };
  return (
    <Card
      className={cn(
        "rounded-2xl border shadow-sm bg-gradient-to-br to-card",
        accentMap[accent],
      )}
    >
      <CardContent className="pt-4 pb-3 px-4">
        <div className="flex items-center gap-1.5 mb-1">
          {icon}
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {label}
          </span>
        </div>
        <p className="text-2xl font-bold text-foreground tabular-nums">
          {value}
        </p>
        <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>
      </CardContent>
    </Card>
  );
}
