"use client";

import { useState, useMemo, useCallback, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
  Gem,
  Shield,
  Timer,
  Heart,
  Zap,
  AlertTriangle,
  Briefcase,
  MapPin,
  Phone,
  Link2,
  DollarSign,
  UserPlus,
  Pencil,
  FileText,
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
  UserSettings,
  ExpenseItem,
  ClientRelationship,
  ClientStatus,
  PhoneType,
  PreferredContact,
  ClientTimeframe,
  RelationshipType,
  FlightPlan,
  FlightPlanStep,
} from "@/lib/types/database";
import {
  ACTIVITY_TYPE_LABELS,
  ACTIVITY_TYPE_ICONS,
  CLIENT_STATUS_LABELS,
  CLIENT_STATUS_COLORS,
  PHONE_TYPE_LABELS,
  PREFERRED_CONTACT_LABELS,
  CLIENT_TIMEFRAME_LABELS,
  RELATIONSHIP_TYPE_LABELS,
} from "@/lib/types/database";
import {
  computeClientValuations,
  TIER_CONFIG,
  type ClientValuation,
  type ClientValuationResult,
} from "@/lib/engines/client-valuation-engine";
import { survivalResult } from "@/lib/engines/survival-engine";
import { createClient } from "@/lib/supabase/client";
import { CrmDashboardTab } from "./tabs/crm-dashboard-tab";
import { InsightsTab } from "./tabs/insights-tab";
import { FlightPlansTab } from "./tabs/flight-plans-tab";
import { TagPicker } from "./shared";

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  clients: Client[];
  records: ClientRecord[];
  activities: ContactActivity[];
  tasks: ContactTask[];
  settings: UserSettings | null;
  expenseItems: ExpenseItem[];
  relationships: ClientRelationship[];
  flightPlans: FlightPlan[];
  flightPlanSteps: FlightPlanStep[];
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
type TabId = "clients" | "crm" | "insights" | "portfolio" | "flight_plans";
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

function normalizePhoneType(raw: string): PhoneType {
  const s = raw.toLowerCase().trim();
  if (s === "iphone" || s === "mobile" || s === "cell") return "mobile";
  if (s === "home") return "home";
  if (s === "work" || s === "office") return "work";
  return "mobile";
}

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
  settings,
  expenseItems,
  relationships: initialRelationships,
  flightPlans: initialFlightPlans,
  flightPlanSteps: initialFlightPlanSteps,
}: Props) {
  // ── Local state ─────────────────────────────────────────────────────────────
  const [localActivities, setLocalActivities] =
    useState<ContactActivity[]>(initialActivities);
  const [localTasks, setLocalTasks] = useState<ContactTask[]>(initialTasks);
  const [localClients, setLocalClients] = useState<Client[]>(initialClients);
  const [localRelationships, setLocalRelationships] =
    useState<ClientRelationship[]>(initialRelationships);
  const [localFlightPlans, setLocalFlightPlans] =
    useState<FlightPlan[]>(initialFlightPlans);
  const [localFlightPlanSteps, setLocalFlightPlanSteps] =
    useState<FlightPlanStep[]>(initialFlightPlanSteps);

  const [search, setSearch] = useState("");
  const [filterSide, setFilterSide] = useState<"all" | "buyer" | "seller" | "both">("all");
  const [filterSource, setFilterSource] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<"all" | ClientStatus>("all");
  const [sortCol, setSortCol] = useState<SortCol>("gci");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [tab, setTab] = useState<TabId>("clients");

  // Detail panel state
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [detailPanelOpen, setDetailPanelOpen] = useState(false);

  // Add Client dialog
  const [addClientOpen, setAddClientOpen] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [newClientEmail, setNewClientEmail] = useState("");
  const [newClientPhone, setNewClientPhone] = useState("");
  const [newClientStatus, setNewClientStatus] = useState<ClientStatus>("boarding");
  const [newClientSource, setNewClientSource] = useState("");
  const [newClientTags, setNewClientTags] = useState<string[]>([]);
  const [addClientSaving, setAddClientSaving] = useState(false);

  // Inline editing
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");

  // Relationship linking
  const [linkRelOpen, setLinkRelOpen] = useState(false);
  const [linkRelSearch, setLinkRelSearch] = useState("");
  const [linkRelType, setLinkRelType] = useState<RelationshipType>("spouse");

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

  // CSV Import modal
  const [importOpen, setImportOpen] = useState(false);
  const [importStep, setImportStep] = useState<ImportStep>("upload");
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<CsvRow[]>([]);
  const [mapName, setMapName] = useState("");
  const [mapEmail, setMapEmail] = useState("__none__");
  const [mapPhone, setMapPhone] = useState("__none__");
  const [mapSource, setMapSource] = useState("__none__");
  const [mapCity, setMapCity] = useState("__none__");
  const [mapProvince, setMapProvince] = useState("__none__");
  const [mapStreet, setMapStreet] = useState("__none__");
  const [mapPostal, setMapPostal] = useState("__none__");
  const [mapCountry, setMapCountry] = useState("__none__");
  const [mapPhoneType, setMapPhoneType] = useState("__none__");
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

  const sourceStats = useMemo(() => computeSourceStats(records), [records]);
  const topSource = sourceStats[0] ?? null;

  // ── Client Valuation Engine ───────────────────────────────────────────────
  const valuationResult: ClientValuationResult | null = useMemo(() => {
    if (!settings || grouped.length === 0 || totalGCI <= 0) return null;

    const monthlyRecurring = expenseItems
      .reduce((s, e) => s + (e.monthly_recurring ?? 0), 0);
    const survival = survivalResult(
      settings.monthly_brokerage_fee,
      monthlyRecurring,
      0, // cash reserve not needed for burn rate
    );

    // Build metadata map for contact-based insights
    const metaMap = new Map<string, { lastContactAt: string | null }>();
    for (const c of localClients) {
      metaMap.set(c.id, { lastContactAt: c.last_contact_at });
    }

    return computeClientValuations(
      {
        clients: grouped.map((g) => ({
          clientId: g.clientId,
          name: g.name,
          totalGCI: g.totalGCI,
          dealCount: g.dealCount,
          avgDeal: g.avgDeal,
          lastDeal: g.lastDeal,
          years: g.years,
        })),
        totalGCI,
        monthlyBurn: survival.monthlyBurn,
        province: settings.province,
        netIncome: settings.ytd_gci,
        agentExperienceYears: null,
      },
      metaMap,
    );
  }, [grouped, totalGCI, settings, expenseItems, localClients]);

  // Quick lookup: clientId/name → valuation
  const valuationMap = useMemo(() => {
    const map = new Map<string, ClientValuation>();
    if (valuationResult) {
      for (const v of valuationResult.valuations) {
        map.set(v.clientId ?? v.name, v);
      }
    }
    return map;
  }, [valuationResult]);

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
      // Flight Status filter — match client status from localClients
      if (filterStatus !== "all" && g.clientId) {
        const client = localClients.find((c) => c.id === g.clientId);
        if (client && client.status !== filterStatus) return false;
      }
      return true;
    });
    return sortTableGroups(f, sortCol, sortDir);
  }, [grouped, search, filterSide, filterSource, filterStatus, sortCol, sortDir, localClients]);

  const hasAnyData = records.length > 0;

  // Open tasks sorted by due_date ASC
  const openTasks = useMemo(
    () => [...localTasks].sort((a, b) => a.due_date.localeCompare(b.due_date)),
    [localTasks],
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

  // Relationships for the selected client
  const clientRelationships = useMemo(() => {
    if (!selectedClientId) return [];
    return localRelationships.filter(
      (r) => r.client_id_a === selectedClientId || r.client_id_b === selectedClientId,
    );
  }, [localRelationships, selectedClientId]);

  // Deal history for the selected client
  const clientDeals = useMemo(() => {
    if (!selectedClientId) return [];
    return records.filter((r) => r.client_id === selectedClientId);
  }, [records, selectedClientId]);

  // Clients for relationship linking search
  const linkCandidates = useMemo(() => {
    if (!selectedClientId || !linkRelSearch) return [];
    const q = linkRelSearch.toLowerCase();
    return localClients
      .filter((c) => c.id !== selectedClientId && c.name.toLowerCase().includes(q))
      .slice(0, 6);
  }, [localClients, selectedClientId, linkRelSearch]);

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

  // Update a single field on a client record
  const updateClientField = useCallback(
    async (clientId: string, field: string, value: unknown) => {
      setLocalClients((prev) =>
        prev.map((c) => (c.id === clientId ? { ...c, [field]: value } : c)),
      );
      const supabase = createClient();
      await supabase.from("clients").update({ [field]: value }).eq("id", clientId);

      // Flight Plan execution: fire matching plans on status change
      if (field === "status" && typeof value === "string") {
        const matchingPlans = localFlightPlans.filter(
          (fp) => fp.is_active && fp.trigger_status === value,
        );
        for (const plan of matchingPlans) {
          const planSteps = localFlightPlanSteps.filter(
            (s) => s.flight_plan_id === plan.id,
          );
          for (const step of planSteps) {
            if (step.action_type === "task" && step.template) {
              const client = localClients.find((c) => c.id === clientId);
              const taskTitle = step.template.replace(
                /\{name\}/g,
                client?.name ?? "Client",
              );
              const dueDate = new Date();
              dueDate.setDate(dueDate.getDate() + step.delay_days);
              const dueDateStr = dueDate.toISOString().slice(0, 10);
              await addTask(
                clientId,
                taskTitle,
                dueDateStr,
                "normal",
                `Auto-created by Flight Plan: ${plan.name}`,
              );
            }
          }
        }
      }
    },
    [localFlightPlans, localFlightPlanSteps, localClients, addTask],
  );

  // Add a new client manually
  const handleAddClient = useCallback(async () => {
    if (!newClientName.trim()) return;
    setAddClientSaving(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setAddClientSaving(false); return; }

    const { data, error } = await supabase
      .from("clients")
      .insert({
        user_id: user.id,
        name: newClientName.trim(),
        name_search: newClientName.trim().toLowerCase(),
        email: newClientEmail.trim() || null,
        phone: newClientPhone.trim() || null,
        status: newClientStatus,
        lead_source: newClientSource || null,
        tags: newClientTags,
      })
      .select()
      .single();

    if (!error && data) {
      setLocalClients((prev) => [...prev, data as Client]);
      setAddClientOpen(false);
      setNewClientName("");
      setNewClientEmail("");
      setNewClientPhone("");
      setNewClientStatus("boarding");
      setNewClientSource("");
      setNewClientTags([]);
    }
    setAddClientSaving(false);
  }, [newClientName, newClientEmail, newClientPhone, newClientStatus, newClientSource, newClientTags]);

  // Add a relationship between two clients
  const addRelationship = useCallback(
    async (clientIdA: string, clientIdB: string, type: RelationshipType) => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Enforce ordered constraint
      const [a, b] = clientIdA < clientIdB ? [clientIdA, clientIdB] : [clientIdB, clientIdA];

      const { data, error } = await supabase
        .from("client_relationships")
        .insert({
          user_id: user.id,
          client_id_a: a,
          client_id_b: b,
          relationship_type: type,
        })
        .select()
        .single();

      if (!error && data) {
        setLocalRelationships((prev) => [...prev, data as ClientRelationship]);
      }
    },
    [],
  );

  // ── Flight Plan CRUD ─────────────────────────────────────────────────────────

  const handleSaveFlightPlan = useCallback(
    async (
      plan: { id?: string; name: string; description: string; trigger_status: ClientStatus | null; is_active: boolean },
      steps: { step_order: number; delay_days: number; action_type: "task" | "email" | "text"; template: string }[],
    ) => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      let planId = plan.id;

      if (planId) {
        // Update existing plan
        await supabase
          .from("flight_plans")
          .update({
            name: plan.name,
            description: plan.description || null,
            trigger_status: plan.trigger_status,
            is_active: plan.is_active,
          })
          .eq("id", planId);

        // Delete existing steps and re-insert
        await supabase.from("flight_plan_steps").delete().eq("flight_plan_id", planId);
      } else {
        // Insert new plan
        const { data, error } = await supabase
          .from("flight_plans")
          .insert({
            user_id: user.id,
            name: plan.name,
            description: plan.description || null,
            trigger_status: plan.trigger_status,
            is_active: plan.is_active,
          })
          .select()
          .single();

        if (error || !data) return;
        planId = data.id;
      }

      // Insert steps
      if (steps.length > 0 && planId) {
        const { data: stepsData } = await supabase
          .from("flight_plan_steps")
          .insert(
            steps.map((s) => ({
              flight_plan_id: planId!,
              step_order: s.step_order,
              delay_days: s.delay_days,
              action_type: s.action_type,
              template: s.template || null,
            })),
          )
          .select();

        if (stepsData) {
          setLocalFlightPlanSteps((prev) => [
            ...prev.filter((s) => s.flight_plan_id !== planId),
            ...(stepsData as FlightPlanStep[]),
          ]);
        }
      }

      // Refresh plan in local state
      const { data: refreshed } = await supabase
        .from("flight_plans")
        .select("*")
        .eq("id", planId)
        .single();

      if (refreshed) {
        setLocalFlightPlans((prev) => {
          const idx = prev.findIndex((p) => p.id === planId);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = refreshed as FlightPlan;
            return next;
          }
          return [refreshed as FlightPlan, ...prev];
        });
      }
    },
    [],
  );

  const handleDeleteFlightPlan = useCallback(async (planId: string) => {
    setLocalFlightPlans((prev) => prev.filter((p) => p.id !== planId));
    setLocalFlightPlanSteps((prev) => prev.filter((s) => s.flight_plan_id !== planId));
    const supabase = createClient();
    await supabase.from("flight_plans").delete().eq("id", planId);
  }, []);

  const handleToggleFlightPlan = useCallback(async (planId: string, isActive: boolean) => {
    setLocalFlightPlans((prev) =>
      prev.map((p) => (p.id === planId ? { ...p, is_active: isActive } : p)),
    );
    const supabase = createClient();
    await supabase.from("flight_plans").update({ is_active: isActive }).eq("id", planId);
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

      // Reset all mappings to defaults
      setMapName(headers[0] ?? "");
      setMapEmail("__none__");
      setMapPhone("__none__");
      setMapSource("__none__");
      setMapCity("__none__");
      setMapProvince("__none__");
      setMapStreet("__none__");
      setMapPostal("__none__");
      setMapCountry("__none__");
      setMapPhoneType("__none__");

      // Auto-detect Follow Up Boss column names (case-insensitive)
      const FUB_AUTOMAP: Record<string, (v: string) => void> = {
        "name":                 setMapName,
        "email 1":              setMapEmail,
        "phone 1":              setMapPhone,
        "phone 1 - type":       setMapPhoneType,
        "address 1 - street":   setMapStreet,
        "address 1 - city":     setMapCity,
        "address 1 - state":    setMapProvince,
        "address 1 - zip":      setMapPostal,
        "address 1 - country":  setMapCountry,
      };
      headers.forEach((h) => {
        const fn = FUB_AUTOMAP[h.toLowerCase().trim()];
        if (fn) fn(h);
      });

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
      // Province: strip trailing commas (FUB exports "ON," sometimes)
      const province = mapProvince !== "__none__"
        ? (row[mapProvince] ?? "").trim().replace(/,+$/, "") || null
        : null;

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
          city:           mapCity      !== "__none__" ? (row[mapCity]      ?? "").trim() || null : null,
          province_region: province,
          street_address: mapStreet    !== "__none__" ? (row[mapStreet]    ?? "").trim() || null : null,
          postal_code:    mapPostal    !== "__none__" ? (row[mapPostal]    ?? "").trim() || null : null,
          country:        mapCountry   !== "__none__" ? (row[mapCountry]   ?? "").trim() || "Canada" : "Canada",
          phone_type:     mapPhoneType !== "__none__" ? normalizePhoneType(row[mapPhoneType] ?? "") : "mobile",
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
    setMapCity("__none__");
    setMapProvince("__none__");
    setMapStreet("__none__");
    setMapPostal("__none__");
    setMapCountry("__none__");
    setMapPhoneType("__none__");
    setImportResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // ── Filtered clients for global task form ───────────────────────────────────
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
        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            onClick={() => setAddClientOpen(true)}
            className="gap-1.5"
          >
            <UserPlus className="h-3.5 w-3.5" />
            Add Client
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              resetImport();
              setImportOpen(true);
            }}
            className="gap-1.5"
          >
            <Upload className="h-3.5 w-3.5" />
            Import CSV
          </Button>
        </div>
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
        {(["clients", "crm", "insights", "portfolio", "flight_plans"] as TabId[]).map((t) => {
          const label = t === "clients" ? "Clients" : t === "crm" ? "CRM" : t === "insights" ? "Insights" : t === "portfolio" ? "Portfolio" : "Flight Plans";
          return (
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
              {label}
            </button>
          );
        })}
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

          {/* Flight Status filter pills */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => setFilterStatus("all")}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-semibold border transition-colors",
                filterStatus === "all"
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-muted-foreground border-border hover:border-primary/40",
              )}
            >
              All Statuses
            </button>
            {(Object.keys(CLIENT_STATUS_LABELS) as ClientStatus[]).map((s) => {
              const colors = CLIENT_STATUS_COLORS[s];
              return (
                <button
                  key={s}
                  onClick={() => setFilterStatus(s)}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-semibold border transition-colors inline-flex items-center gap-1.5",
                    filterStatus === s
                      ? cn(colors.bg, colors.text, colors.border)
                      : "bg-card text-muted-foreground border-border hover:border-primary/40",
                  )}
                >
                  <span className={cn("h-2 w-2 rounded-full", filterStatus === s ? colors.dot : "bg-muted-foreground/30")} />
                  {CLIENT_STATUS_LABELS[s]}
                </button>
              );
            })}
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
                      <TableHead className="text-xs font-medium text-muted-foreground uppercase tracking-wide whitespace-nowrap">
                        Status
                      </TableHead>
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
                          colSpan={8}
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
                                {(() => {
                                  const v = valuationMap.get(group.clientId ?? group.name);
                                  if (!v) return null;
                                  const tc = TIER_CONFIG[v.tier];
                                  return (
                                    <Badge
                                      variant="outline"
                                      className={cn("text-[9px] shrink-0 py-0", tc.bg, tc.color, tc.border)}
                                    >
                                      {fmtCurrency(v.lgv)}
                                    </Badge>
                                  );
                                })()}
                                {/* Tag chips (up to 2) */}
                                {(() => {
                                  const client = group.clientId ? clientById.get(group.clientId) : null;
                                  if (!client?.tags?.length) return null;
                                  const visible = client.tags.slice(0, 2);
                                  const overflow = client.tags.length - 2;
                                  return (
                                    <>
                                      {visible.map((tag) => (
                                        <Badge
                                          key={tag}
                                          variant="outline"
                                          className="text-[9px] bg-violet-50 text-violet-700 border-violet-200 shrink-0 py-0"
                                        >
                                          {tag}
                                        </Badge>
                                      ))}
                                      {overflow > 0 && (
                                        <Badge
                                          variant="outline"
                                          className="text-[9px] bg-muted text-muted-foreground shrink-0 py-0"
                                        >
                                          +{overflow}
                                        </Badge>
                                      )}
                                    </>
                                  );
                                })()}
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
                            <TableCell className="py-3">
                              {(() => {
                                const client = hasClientId ? clientById.get(group.clientId!) : null;
                                if (!client) return null;
                                const sc = CLIENT_STATUS_COLORS[client.status];
                                return (
                                  <span className={cn("text-[10px] font-semibold border rounded-full px-2 py-0.5 whitespace-nowrap inline-flex items-center gap-1", sc.bg, sc.text, sc.border)}>
                                    <span className={cn("h-1.5 w-1.5 rounded-full", sc.dot)} />
                                    {CLIENT_STATUS_LABELS[client.status]}
                                  </span>
                                );
                              })()}
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
        <CrmDashboardTab
          clients={localClients}
          activities={localActivities}
          tasks={localTasks}
          records={records}
          clientById={clientById}
          onLogActivity={logActivity}
          onAddTask={addTask}
          onCompleteTask={completeTask}
          onOpenDetailPanel={openDetailPanel}
        />
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* INSIGHTS TAB                                                       */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {tab === "insights" && hasAnyData && (
        <InsightsTab
          clients={localClients}
          records={records}
          activities={localActivities}
          grouped={grouped}
          totalGCI={totalGCI}
          sourceStats={sourceStats}
          topSource={topSource}
        />
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* PORTFOLIO TAB                                                        */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {tab === "portfolio" && (
        <>
          {!valuationResult || valuationResult.valuations.length === 0 ? (
            <div className="py-16 text-center">
              <Briefcase className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm font-medium text-muted-foreground">
                {!settings
                  ? "Complete onboarding to unlock portfolio valuations."
                  : "Import client records to see portfolio analysis."}
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Hero KPI row */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Card className="rounded-2xl border-emerald-200 bg-gradient-to-br from-emerald-50 to-card shadow-sm">
                  <CardContent className="pt-4 pb-3 px-4">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Gem className="h-4 w-4 text-emerald-500" />
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Total Portfolio LGV
                      </span>
                    </div>
                    <p className="text-2xl font-bold text-foreground tabular-nums">
                      {fmtCurrency(valuationResult.totalLGV)}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      forward-looking lifetime value
                    </p>
                  </CardContent>
                </Card>

                <Card className="rounded-2xl border-blue-200 bg-gradient-to-br from-blue-50 to-card shadow-sm">
                  <CardContent className="pt-4 pb-3 px-4">
                    <div className="flex items-center gap-1.5 mb-1">
                      <PieChart className="h-4 w-4 text-blue-500" />
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Top 12% → GCI
                      </span>
                    </div>
                    <p className="text-2xl font-bold text-foreground tabular-nums">
                      {valuationResult.top12PctGCI}%
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      of total GCI from top clients
                    </p>
                  </CardContent>
                </Card>

                <Card className="rounded-2xl shadow-sm" style={{
                  borderColor: valuationResult.portfolioHealth === "Concentrated"
                    ? "rgb(251 191 36)" : valuationResult.portfolioHealth === "Balanced"
                    ? "rgb(96 165 250)" : "rgb(52 211 153)",
                }}>
                  <CardContent className="pt-4 pb-3 px-4">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Shield className="h-4 w-4" style={{
                        color: valuationResult.portfolioHealth === "Concentrated"
                          ? "rgb(245 158 11)" : valuationResult.portfolioHealth === "Balanced"
                          ? "rgb(59 130 246)" : "rgb(16 185 129)",
                      }} />
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Portfolio Health
                      </span>
                    </div>
                    <p className="text-2xl font-bold text-foreground">
                      {valuationResult.portfolioHealth}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {valuationResult.portfolioHealth === "Concentrated"
                        ? "high dependency on few clients"
                        : valuationResult.portfolioHealth === "Balanced"
                        ? "moderate client spread"
                        : "well-distributed revenue"}
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Client valuation cards */}
              <div className="space-y-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Client Valuations — sorted by composite score
                </p>
                {valuationResult.valuations.map((v) => (
                  <ValuationCard key={v.clientId ?? v.name} valuation={v} />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* FLIGHT PLANS TAB                                                    */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {tab === "flight_plans" && (
        <FlightPlansTab
          flightPlans={localFlightPlans}
          flightPlanSteps={localFlightPlanSteps}
          onSaveFlightPlan={handleSaveFlightPlan}
          onDeleteFlightPlan={handleDeleteFlightPlan}
          onToggleFlightPlan={handleToggleFlightPlan}
        />
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* CLIENT DETAIL SHEET                                                */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      <Sheet open={detailPanelOpen} onOpenChange={setDetailPanelOpen}>
        <SheetContent side="right" className="sm:max-w-xl w-full overflow-y-auto p-0">
          {selectedClient && (
            <div className="flex flex-col">
              {/* ── Header ──────────────────────────────────────────────── */}
              <div className="sticky top-0 z-10 bg-background border-b border-border/60 px-6 pt-6 pb-4">
                <SheetHeader className="p-0">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xl font-semibold shrink-0">
                      {selectedClient.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {editingField === "name" ? (
                          <Input
                            autoFocus
                            value={editingValue}
                            onChange={(e) => setEditingValue(e.target.value)}
                            onBlur={() => {
                              if (editingValue.trim() && editingValue.trim() !== selectedClient.name) {
                                updateClientField(selectedClient.id, "name", editingValue.trim());
                                updateClientField(selectedClient.id, "name_search", editingValue.trim().toLowerCase());
                              }
                              setEditingField(null);
                            }}
                            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                            className="h-8 text-lg font-semibold"
                          />
                        ) : (
                          <SheetTitle
                            className="text-lg font-semibold leading-tight cursor-pointer hover:text-primary transition-colors"
                            onClick={() => { setEditingField("name"); setEditingValue(selectedClient.name); }}
                          >
                            {selectedClient.name}
                          </SheetTitle>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        {selectedClient.last_contact_at && (
                          <span className="text-xs text-muted-foreground">
                            Last contact: {relativeDate(selectedClient.last_contact_at)}
                          </span>
                        )}
                      </div>
                    </div>
                    {/* Flight Status dropdown */}
                    <Select
                      value={selectedClient.status}
                      onValueChange={(v) => updateClientField(selectedClient.id, "status", v)}
                    >
                      <SelectTrigger className={cn("h-8 w-auto gap-1.5 rounded-full text-xs font-semibold border px-3", CLIENT_STATUS_COLORS[selectedClient.status].bg, CLIENT_STATUS_COLORS[selectedClient.status].text, CLIENT_STATUS_COLORS[selectedClient.status].border)}>
                        <span className={cn("h-2 w-2 rounded-full", CLIENT_STATUS_COLORS[selectedClient.status].dot)} />
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(CLIENT_STATUS_LABELS) as ClientStatus[]).map((s) => (
                          <SelectItem key={s} value={s}>
                            <span className="inline-flex items-center gap-1.5">
                              <span className={cn("h-2 w-2 rounded-full", CLIENT_STATUS_COLORS[s].dot)} />
                              {CLIENT_STATUS_LABELS[s]}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </SheetHeader>

                {/* Flight Status strip */}
                <FlightStatusStrip current={selectedClient.status} />
              </div>

              {/* ── Body ────────────────────────────────────────────────── */}
              <div className="px-6 py-5 space-y-6">

                {/* Contact info section */}
                <div className="space-y-3">
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5" />
                    Contact Information
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    <InlineEdit
                      label={`${PHONE_TYPE_LABELS[selectedClient.phone_type]} Phone`}
                      value={selectedClient.phone ?? ""}
                      onSave={(v) => updateClientField(selectedClient.id, "phone", v || null)}
                      placeholder="Add phone…"
                    />
                    <InlineEdit
                      label="Email"
                      value={selectedClient.email ?? ""}
                      onSave={(v) => updateClientField(selectedClient.id, "email", v || null)}
                      placeholder="Add email…"
                    />
                    <InlineEdit
                      label={`${PHONE_TYPE_LABELS[selectedClient.secondary_phone_type]} Phone`}
                      value={selectedClient.secondary_phone ?? ""}
                      onSave={(v) => updateClientField(selectedClient.id, "secondary_phone", v || null)}
                      placeholder="Add secondary phone…"
                    />
                    <InlineEdit
                      label="Secondary Email"
                      value={selectedClient.secondary_email ?? ""}
                      onSave={(v) => updateClientField(selectedClient.id, "secondary_email", v || null)}
                      placeholder="Add secondary email…"
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <span className="text-[10px] text-muted-foreground block mb-1">Preferred Contact</span>
                      <div className="flex gap-1">
                        {(["phone", "email", "text"] as PreferredContact[]).map((pc) => (
                          <button
                            key={pc}
                            onClick={() => updateClientField(selectedClient.id, "preferred_contact", pc)}
                            className={cn(
                              "rounded-full px-2.5 py-0.5 text-[10px] font-semibold border transition-colors",
                              selectedClient.preferred_contact === pc
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-card text-muted-foreground border-border hover:border-primary/40",
                            )}
                          >
                            {PREFERRED_CONTACT_LABELS[pc]}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Address */}
                <div className="space-y-3">
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5" />
                    Address
                  </h3>
                  <div className="grid grid-cols-1 gap-2">
                    <InlineEdit
                      label="Street Address"
                      value={selectedClient.street_address ?? ""}
                      onSave={(v) => updateClientField(selectedClient.id, "street_address", v || null)}
                      placeholder="Add street address…"
                    />
                    <InlineEdit
                      label="Unit / Suite"
                      value={selectedClient.unit_number ?? ""}
                      onSave={(v) => updateClientField(selectedClient.id, "unit_number", v || null)}
                      placeholder="Apt, Suite, Unit…"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <InlineEdit
                      label="City"
                      value={selectedClient.city ?? ""}
                      onSave={(v) => updateClientField(selectedClient.id, "city", v || null)}
                      placeholder="Add city…"
                    />
                    <InlineEdit
                      label="Province / Region"
                      value={selectedClient.province_region ?? ""}
                      onSave={(v) => updateClientField(selectedClient.id, "province_region", v || null)}
                      placeholder="Add province…"
                    />
                    <InlineEdit
                      label="Postal Code"
                      value={selectedClient.postal_code ?? ""}
                      onSave={(v) => updateClientField(selectedClient.id, "postal_code", v || null)}
                      placeholder="A1A 1A1"
                    />
                    <InlineEdit
                      label="Country"
                      value={selectedClient.country ?? "Canada"}
                      onSave={(v) => updateClientField(selectedClient.id, "country", v || "Canada")}
                      placeholder="Canada"
                    />
                  </div>
                </div>

                <Separator />

                {/* Details */}
                <div className="space-y-3">
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5" />
                    Details
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <span className="text-[10px] text-muted-foreground block mb-1">Property Interest</span>
                      <div className="flex items-center gap-1.5">
                        <Select
                          value={selectedClient.property_interest_type}
                          onValueChange={(v) => updateClientField(selectedClient.id, "property_interest_type", v)}
                        >
                          <SelectTrigger className="h-7 w-20 text-[10px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="budget">Budget</SelectItem>
                            <SelectItem value="listing">Listing</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input
                          type="number"
                          placeholder="$"
                          value={selectedClient.property_interest ?? ""}
                          onChange={(e) => updateClientField(selectedClient.id, "property_interest", e.target.value ? Number(e.target.value) : null)}
                          className="h-7 text-xs flex-1"
                        />
                      </div>
                    </div>
                    <div>
                      <span className="text-[10px] text-muted-foreground block mb-1">Timeframe</span>
                      <Select
                        value={selectedClient.timeframe ?? "unknown"}
                        onValueChange={(v) => updateClientField(selectedClient.id, "timeframe", v === "unknown" ? null : v)}
                      >
                        <SelectTrigger className="h-7 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.entries(CLIENT_TIMEFRAME_LABELS) as [ClientTimeframe, string][]).map(([k, label]) => (
                            <SelectItem key={k} value={k}>{label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <InlineEdit
                      label="Birthday"
                      value={selectedClient.birthdate ?? ""}
                      type="date"
                      onSave={(v) => updateClientField(selectedClient.id, "birthdate", v || null)}
                      placeholder="Add birthday…"
                    />
                    <div>
                      <span className="text-[10px] text-muted-foreground block mb-1">Lead Source</span>
                      <InlineEdit
                        value={selectedClient.lead_source ?? ""}
                        onSave={(v) => updateClientField(selectedClient.id, "lead_source", v || null)}
                        placeholder="Add source…"
                      />
                    </div>
                  </div>
                  {/* Tags */}
                  <div className="col-span-2">
                    <span className="text-[10px] text-muted-foreground block mb-1.5">Tags</span>
                    <TagPicker
                      value={selectedClient.tags ?? []}
                      onChange={(tags) => updateClientField(selectedClient.id, "tags", tags)}
                    />
                  </div>
                </div>

                <Separator />

                {/* Relationships */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <Link2 className="h-3.5 w-3.5" />
                      Relationships
                    </h3>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1 h-6 text-[10px]"
                      onClick={() => { setLinkRelOpen((v) => !v); setLinkRelSearch(""); }}
                    >
                      <Plus className="h-3 w-3" />
                      Link Client
                    </Button>
                  </div>

                  {linkRelOpen && (
                    <div className="rounded-xl border border-border/60 bg-muted/30 p-3 space-y-2">
                      <Input
                        autoFocus
                        placeholder="Search clients…"
                        value={linkRelSearch}
                        onChange={(e) => setLinkRelSearch(e.target.value)}
                        className="h-7 text-xs"
                      />
                      <Select value={linkRelType} onValueChange={(v) => setLinkRelType(v as RelationshipType)}>
                        <SelectTrigger className="h-7 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.entries(RELATIONSHIP_TYPE_LABELS) as [RelationshipType, string][]).map(([k, label]) => (
                            <SelectItem key={k} value={k}>{label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {linkCandidates.length > 0 && (
                        <div className="border border-border rounded-lg bg-background overflow-hidden">
                          {linkCandidates.map((c) => (
                            <button
                              key={c.id}
                              className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition-colors"
                              onClick={async () => {
                                await addRelationship(selectedClient.id, c.id, linkRelType);
                                setLinkRelOpen(false);
                                setLinkRelSearch("");
                              }}
                            >
                              {c.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {clientRelationships.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-2 text-center">No linked clients.</p>
                  ) : (
                    <div className="space-y-1">
                      {clientRelationships.map((rel) => {
                        const otherId = rel.client_id_a === selectedClient.id ? rel.client_id_b : rel.client_id_a;
                        const other = clientById.get(otherId);
                        if (!other) return null;
                        return (
                          <div
                            key={rel.id}
                            className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-muted/30 transition-colors cursor-pointer"
                            onClick={() => openDetailPanel(otherId)}
                          >
                            <div className="h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold shrink-0">
                              {other.name.charAt(0).toUpperCase()}
                            </div>
                            <span className="text-sm font-medium text-foreground truncate flex-1">{other.name}</span>
                            <Badge variant="outline" className="text-[9px] py-0">
                              {RELATIONSHIP_TYPE_LABELS[rel.relationship_type as RelationshipType] ?? rel.relationship_type}
                            </Badge>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <Separator />

                {/* Notes */}
                <div className="space-y-2">
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5" />
                    Notes
                  </h3>
                  <Textarea
                    placeholder="Add notes about this client…"
                    value={selectedClient.notes ?? ""}
                    onChange={(e) => updateClientField(selectedClient.id, "notes", e.target.value || null)}
                    rows={3}
                    className="text-sm resize-none"
                  />
                </div>

                <Separator />

                {/* Activity section */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <Activity className="h-3.5 w-3.5" />
                      Activity
                    </h3>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1 h-6 text-[10px]"
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

                  {showLogActivity && (
                    <div className="rounded-xl border border-border/60 bg-muted/30 p-3 space-y-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Type</Label>
                        <Select value={logType} onValueChange={(v) => setLogType(v as ActivityType)}>
                          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {(Object.keys(ACTIVITY_TYPE_LABELS) as ActivityType[]).map((t) => (
                              <SelectItem key={t} value={t}>{ACTIVITY_TYPE_ICONS[t]} {ACTIVITY_TYPE_LABELS[t]}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Description</Label>
                        <Textarea placeholder="What happened?" value={logDescription} onChange={(e) => setLogDescription(e.target.value)} rows={2} className="text-sm resize-none" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Date & time</Label>
                        <Input type="datetime-local" value={logDate} onChange={(e) => setLogDate(e.target.value)} className="h-8 text-sm" />
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" disabled={!logDescription.trim() || logSaving} onClick={handleLogActivity} className="h-7 text-xs">{logSaving ? "Saving…" : "Save"}</Button>
                        <Button size="sm" variant="ghost" onClick={() => setShowLogActivity(false)} className="h-7 text-xs">Cancel</Button>
                      </div>
                    </div>
                  )}

                  {clientActivities.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-3 text-center">No activity logged yet.</p>
                  ) : (
                    <div className="relative border-l-2 border-muted-foreground/20 ml-2 space-y-0">
                      {clientActivities.map((act) => (
                        <div key={act.id} className="relative pl-4 pb-3 last:pb-0">
                          <div className="absolute -left-1.5 top-0.5 h-3 w-3 rounded-full bg-blue-400 border-2 border-background" />
                          <div className="flex items-start gap-1.5">
                            <span className="text-sm leading-none mt-0.5 shrink-0">{ACTIVITY_TYPE_ICONS[act.type]}</span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-semibold text-foreground">{ACTIVITY_TYPE_LABELS[act.type]}</span>
                                <span className="text-[11px] text-muted-foreground shrink-0">{relativeDate(act.activity_date)}</span>
                              </div>
                              {act.description && <p className="text-xs text-muted-foreground mt-0.5">{act.description}</p>}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <Separator />

                {/* Tasks section */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <ListTodo className="h-3.5 w-3.5" />
                      Tasks
                    </h3>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1 h-6 text-[10px]"
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

                  {showAddTask && (
                    <div className="rounded-xl border border-border/60 bg-muted/30 p-3 space-y-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Title</Label>
                        <Input placeholder="e.g. Send market update" value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} className="h-8 text-sm" />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label className="text-xs">Due date</Label>
                          <Input type="date" value={taskDueDate} onChange={(e) => setTaskDueDate(e.target.value)} className="h-8 text-sm" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Priority</Label>
                          <Select value={taskPriority} onValueChange={(v) => setTaskPriority(v as TaskPriority)}>
                            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
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
                        <Textarea placeholder="Any notes…" value={taskNotes} onChange={(e) => setTaskNotes(e.target.value)} rows={2} className="text-sm resize-none" />
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" disabled={!taskTitle.trim() || taskSaving} onClick={handleAddTask} className="h-7 text-xs">{taskSaving ? "Saving…" : "Save"}</Button>
                        <Button size="sm" variant="ghost" onClick={() => setShowAddTask(false)} className="h-7 text-xs">Cancel</Button>
                      </div>
                    </div>
                  )}

                  {clientTasks.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-3 text-center">No tasks for this client.</p>
                  ) : (
                    <div className="space-y-1">
                      {clientTasks.map((task) => {
                        const isOverdue = task.due_date < todayIso();
                        return (
                          <div key={task.id} className="flex items-start gap-2.5 py-2 px-1 rounded-lg hover:bg-muted/30 transition-colors">
                            <button onClick={() => completeTask(task.id)} className="mt-0.5 text-muted-foreground hover:text-emerald-600 transition-colors shrink-0" title="Mark complete">
                              <Square className="h-4 w-4" />
                            </button>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={cn("text-[10px] font-semibold border rounded px-1.5 py-0.5 shrink-0", PRIORITY_STYLES[task.priority])}>{task.priority}</span>
                                <span className="text-sm font-medium text-foreground truncate">{task.title}</span>
                              </div>
                              <span className={cn("text-xs mt-0.5", isOverdue ? "text-red-600 font-medium" : "text-muted-foreground")}>{isOverdue ? "Overdue · " : ""}{fmtDate(task.due_date)}</span>
                              {task.notes && <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{task.notes}</p>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Deal History */}
                {clientDeals.length > 0 && (
                  <>
                    <Separator />
                    <div className="space-y-3">
                      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                        <DollarSign className="h-3.5 w-3.5" />
                        Deal History
                      </h3>
                      <div className="space-y-1.5">
                        {clientDeals.map((deal) => (
                          <div key={deal.id} className="flex items-center justify-between py-1.5 px-2 rounded-lg bg-muted/20">
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-medium text-foreground truncate">
                                {deal.address || "No address"}
                              </p>
                              <div className="flex items-center gap-2 mt-0.5">
                                {deal.side && (
                                  <span className={cn("text-[9px] font-semibold border rounded px-1.5 py-0 shrink-0", SIDE_STYLES[deal.side]?.cls)}>
                                    {SIDE_STYLES[deal.side]?.label}
                                  </span>
                                )}
                                {deal.close_date && <span className="text-[10px] text-muted-foreground">{fmtMonthYear(deal.close_date)}</span>}
                              </div>
                            </div>
                            <span className="text-sm font-bold tabular-nums text-foreground shrink-0 ml-3">
                              {fmtCurrency(deal.gci ?? 0)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* ADD CLIENT DIALOG                                                   */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      <Dialog open={addClientOpen} onOpenChange={setAddClientOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-4 w-4" />
              Add Client
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="space-y-1">
              <Label className="text-xs">Name <span className="text-red-500">*</span></Label>
              <Input
                autoFocus
                placeholder="Full name"
                value={newClientName}
                onChange={(e) => setNewClientName(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Email</Label>
                <Input
                  type="email"
                  placeholder="email@example.com"
                  value={newClientEmail}
                  onChange={(e) => setNewClientEmail(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Phone</Label>
                <Input
                  type="tel"
                  placeholder="(555) 555-5555"
                  value={newClientPhone}
                  onChange={(e) => setNewClientPhone(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Flight Status</Label>
                <Select value={newClientStatus} onValueChange={(v) => setNewClientStatus(v as ClientStatus)}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(CLIENT_STATUS_LABELS) as ClientStatus[]).map((s) => (
                      <SelectItem key={s} value={s}>
                        <span className="inline-flex items-center gap-1.5">
                          <span className={cn("h-2 w-2 rounded-full", CLIENT_STATUS_COLORS[s].dot)} />
                          {CLIENT_STATUS_LABELS[s]}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Lead Source</Label>
                <Input
                  placeholder="e.g. Referral, SOI"
                  value={newClientSource}
                  onChange={(e) => setNewClientSource(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Tags</Label>
              <TagPicker value={newClientTags} onChange={setNewClientTags} />
            </div>
            <div className="flex gap-2 pt-2">
              <Button
                disabled={!newClientName.trim() || addClientSaving}
                onClick={handleAddClient}
                className="flex-1"
              >
                {addClientSaving ? "Adding…" : "Add Client"}
              </Button>
              <Button variant="ghost" onClick={() => setAddClientOpen(false)}>
                Cancel
              </Button>
            </div>
          </div>
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
                        <SelectItem key={h} value={h}>{h}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Label className="text-xs">Street Address</Label>
                  <Select value={mapStreet} onValueChange={setMapStreet}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— Skip —</SelectItem>
                      {csvHeaders.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                    </SelectContent>
                  </Select>

                  <Label className="text-xs">City</Label>
                  <Select value={mapCity} onValueChange={setMapCity}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— Skip —</SelectItem>
                      {csvHeaders.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                    </SelectContent>
                  </Select>

                  <Label className="text-xs">Province / Region</Label>
                  <Select value={mapProvince} onValueChange={setMapProvince}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— Skip —</SelectItem>
                      {csvHeaders.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                    </SelectContent>
                  </Select>

                  <Label className="text-xs">Postal Code</Label>
                  <Select value={mapPostal} onValueChange={setMapPostal}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— Skip —</SelectItem>
                      {csvHeaders.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                    </SelectContent>
                  </Select>

                  <Label className="text-xs">Country</Label>
                  <Select value={mapCountry} onValueChange={setMapCountry}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— Skip —</SelectItem>
                      {csvHeaders.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                    </SelectContent>
                  </Select>

                  <Label className="text-xs">Phone Type</Label>
                  <Select value={mapPhoneType} onValueChange={setMapPhoneType}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— Skip —</SelectItem>
                      {csvHeaders.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
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
                {mapStreet !== "__none__" && (
                  <div className="flex gap-2">
                    <CheckCheck className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                    <span>Street address column: <strong className="text-foreground">{mapStreet}</strong></span>
                  </div>
                )}
                {mapCity !== "__none__" && (
                  <div className="flex gap-2">
                    <CheckCheck className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                    <span>City column: <strong className="text-foreground">{mapCity}</strong></span>
                  </div>
                )}
                {mapProvince !== "__none__" && (
                  <div className="flex gap-2">
                    <CheckCheck className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                    <span>Province column: <strong className="text-foreground">{mapProvince}</strong></span>
                  </div>
                )}
                {mapPostal !== "__none__" && (
                  <div className="flex gap-2">
                    <CheckCheck className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                    <span>Postal code column: <strong className="text-foreground">{mapPostal}</strong></span>
                  </div>
                )}
                {mapCountry !== "__none__" && (
                  <div className="flex gap-2">
                    <CheckCheck className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                    <span>Country column: <strong className="text-foreground">{mapCountry}</strong></span>
                  </div>
                )}
                {mapPhoneType !== "__none__" && (
                  <div className="flex gap-2">
                    <CheckCheck className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                    <span>Phone type column: <strong className="text-foreground">{mapPhoneType}</strong></span>
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

// ── Valuation Card ──────────────────────────────────────────────────────────

function ValuationCard({ valuation: v }: { valuation: ClientValuation }) {
  const tc = TIER_CONFIG[v.tier];
  return (
    <Card className="rounded-2xl shadow-sm hover:shadow-md transition-shadow">
      <CardContent className="pt-4 pb-3 px-4 space-y-3">
        {/* Header: name + tier + score */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="h-9 w-9 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-semibold shrink-0">
            {v.name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-foreground truncate">
                {v.name}
              </span>
              <Badge
                variant="outline"
                className={cn("text-[10px] shrink-0 py-0 font-bold", tc.bg, tc.color, tc.border)}
              >
                {tc.label}
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Score {v.compositeScore}/100 · Lifetime {fmtCurrency(v.lifetimeGCI)}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-lg font-bold tabular-nums text-foreground">
              {fmtCurrency(v.lgv)}
            </p>
            <p className="text-[10px] text-muted-foreground">LGV</p>
          </div>
        </div>

        {/* Metric pills */}
        <div className="flex flex-wrap gap-1.5">
          <MetricPill
            icon={<Gem className="h-3 w-3" />}
            label="LGV"
            value={fmtCurrency(v.lgv)}
            color="emerald"
          />
          <MetricPill
            icon={<Shield className="h-3 w-3" />}
            label="Runway"
            value={`${v.runwayImpactMonths.toFixed(1)}mo`}
            color="blue"
          />
          <MetricPill
            icon={<Zap className="h-3 w-3" />}
            label="After Tax"
            value={`${v.taxEfficiencyCents}¢`}
            color="violet"
          />
          <MetricPill
            icon={<Timer className="h-3 w-3" />}
            label="Velocity"
            value={v.velocityDays !== null ? `${v.velocityDays}d` : "—"}
            color="amber"
          />
          <MetricPill
            icon={<Heart className="h-3 w-3" />}
            label="Health"
            value={`${v.healthContributionPct}%`}
            color="rose"
          />
        </div>

        {/* Insight badges */}
        {v.insights.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {v.insights.map((insight) => (
              <span
                key={insight}
                className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-medium text-amber-700"
              >
                <AlertTriangle className="h-2.5 w-2.5" />
                {insight}
              </span>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Metric Pill ─────────────────────────────────────────────────────────────

function MetricPill({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: "emerald" | "blue" | "violet" | "amber" | "rose";
}) {
  const styles: Record<string, string> = {
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
    blue:    "bg-blue-50 text-blue-700 border-blue-200",
    violet:  "bg-violet-50 text-violet-700 border-violet-200",
    amber:   "bg-amber-50 text-amber-700 border-amber-200",
    rose:    "bg-rose-50 text-rose-700 border-rose-200",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium",
        styles[color],
      )}
    >
      {icon}
      <span className="opacity-70">{label}</span>
      <span className="font-bold tabular-nums">{value}</span>
    </span>
  );
}

// ── Flight Status Strip ──────────────────────────────────────────────────────

const FLIGHT_STAGES: ClientStatus[] = ["boarding", "taxiing", "in_flight", "landed", "cruising"];

function FlightStatusStrip({ current }: { current: ClientStatus }) {
  const currentIdx = FLIGHT_STAGES.indexOf(current);
  return (
    <div className="flex items-center gap-0 mt-4">
      {FLIGHT_STAGES.map((stage, i) => {
        const colors = CLIENT_STATUS_COLORS[stage];
        const isActive = i === currentIdx;
        const isPast = i < currentIdx;
        return (
          <div key={stage} className="flex items-center flex-1">
            <div className="flex flex-col items-center flex-1">
              <div
                className={cn(
                  "h-2 w-full rounded-full transition-colors",
                  isActive ? colors.dot : isPast ? "bg-primary/30" : "bg-muted",
                )}
              />
              <span
                className={cn(
                  "text-[9px] mt-1 font-medium transition-colors",
                  isActive ? colors.text : isPast ? "text-muted-foreground" : "text-muted-foreground/50",
                )}
              >
                {CLIENT_STATUS_LABELS[stage]}
              </span>
            </div>
            {i < FLIGHT_STAGES.length - 1 && (
              <div className={cn("h-0.5 w-2 shrink-0", isPast ? "bg-primary/30" : "bg-muted")} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Inline Edit ──────────────────────────────────────────────────────────────

function InlineEdit({
  label,
  value,
  onSave,
  placeholder = "—",
  type = "text",
}: {
  label?: string;
  value: string;
  onSave: (value: string) => void;
  placeholder?: string;
  type?: "text" | "date";
}) {
  const [editing, setEditing] = useState(false);
  const [localVal, setLocalVal] = useState(value);

  function commit() {
    setEditing(false);
    if (localVal !== value) onSave(localVal);
  }

  if (editing) {
    return (
      <div>
        {label && <span className="text-[10px] text-muted-foreground block mb-0.5">{label}</span>}
        <Input
          autoFocus
          type={type}
          value={localVal}
          onChange={(e) => setLocalVal(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") { setLocalVal(value); setEditing(false); } }}
          className="h-7 text-xs"
        />
      </div>
    );
  }

  return (
    <div
      className="cursor-pointer group"
      onClick={() => { setLocalVal(value); setEditing(true); }}
    >
      {label && <span className="text-[10px] text-muted-foreground block mb-0.5">{label}</span>}
      <span className={cn(
        "text-xs inline-flex items-center gap-1 group-hover:text-primary transition-colors",
        value ? "text-foreground" : "text-muted-foreground/50",
      )}>
        {value || placeholder}
        <Pencil className="h-2.5 w-2.5 opacity-0 group-hover:opacity-50 transition-opacity" />
      </span>
    </div>
  );
}
