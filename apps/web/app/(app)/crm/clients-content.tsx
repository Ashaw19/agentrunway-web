"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
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
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
  MoreHorizontal,
  Archive,
  RotateCcw,
  Plane,
  Rocket,
  Crown,
  Wind,
  GitBranch,
  Loader2,
  Save,
  X,
  CalendarDays,
  Sparkles,
} from "lucide-react";
import { ShowingsSection } from "./showings-section";
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
  ArchiveReason,
  PropertyShowing,
  CommunicationTone,
  LeadSource,
  PropertyUse,
  ListingAppointment,
  ListingStatus,
  BuyerFinancingType,
  ClientNote,
} from "@/lib/types/database";
import {
  LISTING_STATUS_LABELS,
  BUYER_FINANCING_LABELS,
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
  COMMUNICATION_TONE_LABELS,
  COMMUNICATION_TONE_DESCRIPTIONS,
  PROPERTY_USE_LABELS,
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
import { TagPicker, getCountryLabels } from "./shared";
import { PipelineTab } from "./tabs/pipeline-tab";
import { useVoiceDraft } from "@/lib/voice/voice-draft-context";
import type { VoiceDraft } from "@/lib/voice/types";
import { toast } from "sonner";
import { guardSandboxWrite } from "@/lib/sandbox-guard";
import { useSandboxMode } from "@/lib/sandbox-mode-context";
import { markMemoryStaleClient } from "@/lib/ai/mark-memory-stale";
import * as XLSX from "xlsx";
import { validateClient, validateEmail, validatePhone, FIELD_LIMITS } from "@agent-runway/core/validation/input-guards";

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
  showings: PropertyShowing[];
  listingAppointments: ListingAppointment[];
  /** User ID — used for client-side data fetching when server passes empty clients */
  userId?: string;
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
type TabId = "clients" | "crm" | "insights" | "portfolio" | "flight_plans" | "pipeline";
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

function monthsAgo(iso: string): number {
  const d = new Date(iso + "T12:00:00");
  const now = new Date();
  return (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
}

function relativeTimeLabel(iso: string): string {
  const m = monthsAgo(iso);
  if (m <= 0) return "This month";
  if (m === 1) return "1 month ago";
  if (m < 12) return `${m} months ago`;
  const y = Math.floor(m / 12);
  return y === 1 ? "1 year ago" : `${y} years ago`;
}

function recencyAccent(iso: string | null): string {
  if (!iso) return "bg-border/60";
  const m = monthsAgo(iso);
  if (m < 6) return "bg-emerald-500";
  if (m < 18) return "bg-amber-400";
  return "bg-rose-400";
}

function recencyTextClass(iso: string | null): string {
  if (!iso) return "text-muted-foreground";
  const m = monthsAgo(iso);
  if (m < 6) return "text-emerald-600";
  if (m < 18) return "text-amber-600";
  return "text-rose-500";
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function nowIso(): string {
  return new Date().toISOString().slice(0, 16);
}

// ── Lead Source options ────────────────────────────────────────────────────────

type LeadSourceGroup = { label: string; options: LeadSource[] };

const LEAD_SOURCE_GROUPS: LeadSourceGroup[] = [
  {
    label: "Personal Network",
    options: ["SOI", "Referral — Past Client", "Referral — Agent", "Referral — General"],
  },
  {
    label: "Portals",
    options: ["Realtor.ca", "Zillow", "Zolo", "HouseSigma", "Point2 Homes"],
  },
  {
    label: "Brokerages",
    options: ["Royal LePage", "RE/MAX", "EXIT Realty", "Century 21", "REAL Broker", "eXp Realty", "Keller Williams", "Brokerage Website"],
  },
  {
    label: "Events & Outreach",
    options: ["Open House", "Door Knocking", "Direct Mail", "Sphere Event"],
  },
  {
    label: "Digital",
    options: ["Social Media", "Google Ads", "Facebook Ads", "YouTube", "TikTok", "Podcast / Media", "Cold Call"],
  },
  {
    label: "Other",
    options: ["Other"],
  },
];

// ── Achievement Badges ────────────────────────────────────────────────────────

type AchievementBadgeId = "high_yield" | "frequent_flyer" | "silver_wings" | "tailwind_club" | "first_class";
type RewardGenerosity   = "thoughtful" | "generous" | "lavish";

interface AchievementBadge {
  id: AchievementBadgeId;
  label: string;
  /** One-liner shown under the badge name in the tooltip */
  earned: string;
  /** Category description (no dollar amounts — those are computed dynamically) */
  rewardCategory: string;
  /** Tailwind gradient + ring for the badge disc */
  ringCls: string;
  bgCls: string;
}

/** Generosity multiplier as a fraction of the relevant deal's GCI */
const GENEROSITY_PCT: Record<RewardGenerosity, number> = {
  thoughtful: 0.0075, // 0.75 % of GCI
  generous:   0.015,  // 1.5 %
  lavish:     0.025,  // 2.5 %
};

const GENEROSITY_LABELS: Record<RewardGenerosity, { label: string; sub: string }> = {
  thoughtful: { label: "Thoughtful",  sub: "~0.75% of deal GCI" },
  generous:   { label: "Generous",    sub: "~1.5% of deal GCI"  },
  lavish:     { label: "Lavish",      sub: "~2.5% of deal GCI"  },
};

/** Round budget to nearest $5, minimum $10 */
function calcRewardBudget(gci: number, generosity: RewardGenerosity): number {
  return Math.max(10, Math.round((gci * GENEROSITY_PCT[generosity]) / 5) * 5);
}

/** Returns a quick, budget-appropriate gift idea shown instantly in the tooltip
 *  (before any AI call is made). No dollar amounts — just a category + example. */
function quickGiftTip(budget: number): string {
  if (budget < 30)  return "Tim Hortons or local coffee shop gift card + handwritten note.";
  if (budget < 60)  return "Canadian Tire or Amazon gift card — a new homeowner's to-do list is endless.";
  if (budget < 100) return "Home Depot or Costco gift card — practical and universally appreciated.";
  if (budget < 180) return "Local restaurant or The Keg gift card for a nice dinner out.";
  return "A spa day, experience gift, or premium restaurant — something genuinely memorable.";
}

const ACHIEVEMENT_DEFS: Record<AchievementBadgeId, AchievementBadge> = {
  high_yield: {
    id: "high_yield",
    label: "High Yield",
    earned: "Closed a deal worth $10K+ in GCI",
    rewardCategory: "A polished gift that matches the quality of the deal — fine dining, premium wine, or a curated local experience.",
    ringCls: "ring-emerald-400",
    bgCls:   "bg-gradient-to-br from-emerald-500 to-teal-600",
  },
  frequent_flyer: {
    id: "frequent_flyer",
    label: "Frequent Flyer",
    earned: "Has flown with you 2 or more times",
    rewardCategory: "A personal touch — handwritten card, local coffee shop or restaurant gift card.",
    ringCls: "ring-sky-400",
    bgCls:   "bg-gradient-to-br from-sky-500 to-blue-600",
  },
  silver_wings: {
    id: "silver_wings",
    label: "Silver Wings",
    earned: "5+ transactions — a true repeat client",
    rewardCategory: "A curated gift box — artisan food, spa products, or a meaningful local experience.",
    ringCls: "ring-slate-400",
    bgCls:   "bg-gradient-to-br from-slate-400 to-slate-600",
  },
  tailwind_club: {
    id: "tailwind_club",
    label: "Tailwind Club",
    earned: "10+ transactions — a lifetime loyalist",
    rewardCategory: "A signature experience — tasting tour, event tickets, or a weekend getaway voucher.",
    ringCls: "ring-amber-400",
    bgCls:   "bg-gradient-to-br from-amber-400 to-orange-500",
  },
  first_class: {
    id: "first_class",
    label: "First Class",
    earned: "Top 5% of all clients by lifetime GCI",
    rewardCategory: "A luxury experience that shows this client truly made your career.",
    ringCls: "ring-violet-400",
    bgCls:   "bg-gradient-to-br from-violet-500 to-purple-700",
  },
};

// ── Badge icon component (aviation-themed disc + hover tooltip) ───────────────

function AchievementBadgeIcon({
  badge,
  rewardBudget,
  generosity,
  size = 24,
  showLabel = false,
}: {
  badge: AchievementBadge;
  rewardBudget?: number;
  generosity?: RewardGenerosity;
  size?: number;
  showLabel?: boolean;
}) {
  const iconSize = Math.round(size * 0.52);
  const IconComponent: React.ComponentType<{ size?: number; className?: string }> =
    badge.id === "high_yield"       ? Gem
    : badge.id === "frequent_flyer" ? Plane
    : badge.id === "silver_wings"   ? Wind
    : badge.id === "tailwind_club"  ? Rocket
    : Crown;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex flex-col items-center cursor-default">
            {/* Disc */}
            <span
              className={cn(
                "rounded-full flex items-center justify-center ring-2 shadow-sm shrink-0",
                badge.bgCls,
                badge.ringCls,
              )}
              style={{ width: size, height: size }}
            >
              <IconComponent size={iconSize} className="text-white drop-shadow-sm" />
            </span>
            {showLabel && (
              <span className="text-[10px] font-medium text-muted-foreground mt-1 whitespace-nowrap leading-tight">
                {badge.label}
              </span>
            )}
          </span>
        </TooltipTrigger>
        <TooltipContent
          side="bottom"
          align="start"
          sideOffset={8}
          className="w-60 p-3 rounded-xl border border-border/80 bg-popover shadow-xl text-left"
        >
          <div className="flex flex-col gap-1.5">
            <span className="flex items-center gap-1.5">
              <span
                className={cn("h-5 w-5 rounded-full flex items-center justify-center ring-1 shrink-0", badge.bgCls, badge.ringCls)}
              >
                <IconComponent size={10} className="text-white" />
              </span>
              <span className="text-xs font-bold text-foreground">{badge.label}</span>
            </span>
            <span className="text-[11px] text-muted-foreground leading-snug">{badge.earned}</span>
            <span className="text-[11px] leading-snug text-foreground/80 border-t border-border/40 pt-1.5 break-words">
              {rewardBudget !== undefined ? quickGiftTip(rewardBudget) : badge.rewardCategory}
            </span>
            {rewardBudget !== undefined && generosity && (
              <span className="text-[11px] font-semibold text-primary border-t border-border/40 pt-1.5 flex items-center gap-1 flex-wrap">
                <span>Suggested budget:</span>
                <span className="tabular-nums">~{fmtCurrency(rewardBudget)}</span>
                <span className="text-muted-foreground font-normal">· {GENEROSITY_LABELS[generosity].label}</span>
              </span>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function computeAchievements(
  group: { deals: ClientRecord[]; dealCount: number; totalGCI: number },
  firstClassThreshold: number,
): AchievementBadge[] {
  const badges: AchievementBadge[] = [];
  if (group.deals.some((d) => d.gci >= 10_000)) badges.push(ACHIEVEMENT_DEFS.high_yield);
  if (group.dealCount >= 2)  badges.push(ACHIEVEMENT_DEFS.frequent_flyer);
  if (group.dealCount >= 5)  badges.push(ACHIEVEMENT_DEFS.silver_wings);
  if (group.dealCount >= 10) badges.push(ACHIEVEMENT_DEFS.tailwind_club);
  if (group.totalGCI >= firstClassThreshold && firstClassThreshold > 0)
    badges.push(ACHIEVEMENT_DEFS.first_class);
  return badges;
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
    // Always include — clients with no records (e.g. FUB imports) must still appear
    groups.push(makeGroup(client.id, client.name, deals));
  }

  for (const [key, deals] of buckets) {
    if (key.startsWith("__v__")) {
      groups.push(makeGroup(null, deals[0].name, deals));
    }
  }

  // Sort by GCI desc; break ties alphabetically so contacts-only clients are ordered
  return groups.sort((a, b) => {
    if (b.totalGCI !== a.totalGCI) return b.totalGCI - a.totalGCI;
    return a.name.localeCompare(b.name);
  });
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

const STATUS_HEADER_GRADIENT: Record<ClientStatus, string> = {
  boarding:  "from-sky-500 to-sky-600",
  taxiing:   "from-amber-500 to-orange-500",
  approach:  "from-orange-500 to-amber-600",
  in_flight: "from-emerald-500 to-teal-600",
  landed:    "from-violet-500 to-purple-600",
  cruising:  "from-rose-400 to-pink-500",
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

const CSV_ROW_CAP = 5_000;

function parseCsv(text: string): { headers: string[]; rows: CsvRow[]; truncated: boolean } {
  // Strip UTF-8 BOM if present (common in Excel-exported CSVs)
  const clean = text.startsWith("\uFEFF") ? text.slice(1) : text;

  // Parse CSV properly handling quoted fields that contain embedded newlines.
  // We can't just split by \n because "John\nSmith" is a single field.
  function parseAllRows(input: string): string[][] {
    const rows: string[][] = [];
    let current = "";
    let inQuotes = false;
    const fields: string[] = [];

    for (let i = 0; i < input.length; i++) {
      const ch = input[i];
      if (ch === '"') {
        if (inQuotes && input[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === "," && !inQuotes) {
        fields.push(current.trim());
        current = "";
      } else if ((ch === "\r" || ch === "\n") && !inQuotes) {
        // End of row (skip \n after \r)
        if (ch === "\r" && input[i + 1] === "\n") i++;
        fields.push(current.trim());
        current = "";
        if (fields.some((f) => f.length > 0)) {
          rows.push([...fields]);
        }
        fields.length = 0;
      } else {
        current += ch;
      }
    }
    // Last row (no trailing newline)
    fields.push(current.trim());
    if (fields.some((f) => f.length > 0)) {
      rows.push([...fields]);
    }
    return rows;
  }

  const allRows = parseAllRows(clean);
  if (allRows.length < 2) return { headers: [], rows: [], truncated: false };

  const headers = allRows[0];
  const dataRows = allRows.slice(1);
  const truncated = dataRows.length > CSV_ROW_CAP;
  const rows: CsvRow[] = [];
  for (let i = 0; i < Math.min(dataRows.length, CSV_ROW_CAP); i++) {
    const vals = dataRows[i];
    const row: CsvRow = {};
    headers.forEach((h, idx) => {
      row[h] = vals[idx] ?? "";
    });
    rows.push(row);
  }
  return { headers, rows, truncated };
}

// ─────────────────────────────────────────────────────────────────────────────
// MORTGAGE ESTIMATE SECTION
// Canadian semi-annual compounding, CMHC insurance tiers, 3-scenario comparison
// ─────────────────────────────────────────────────────────────────────────────

function computeMonthlyPayment(
  principal: number,
  annualPct: number,
  amortYears: number,
): number {
  const semiAnnualRate = annualPct / 100 / 2;
  const effectiveMonthly = Math.pow(1 + semiAnnualRate, 1 / 6) - 1;
  const n = amortYears * 12;
  if (effectiveMonthly === 0) return principal / n;
  return (
    (principal * (effectiveMonthly * Math.pow(1 + effectiveMonthly, n))) /
    (Math.pow(1 + effectiveMonthly, n) - 1)
  );
}

function cmhcInsurancePremium(purchasePrice: number, downPct: number): number {
  if (downPct >= 0.2) return 0;
  if (purchasePrice > 1_500_000) return 0; // CMHC doesn't insure over $1.5M
  const loan = purchasePrice * (1 - downPct);
  const rate = downPct >= 0.15 ? 0.028 : downPct >= 0.10 ? 0.031 : 0.04;
  return loan * rate;
}

function MortgageEstimateSection({ price }: { price: number }) {
  const [annualRate, setAnnualRate] = useState(4.99);
  const [amort, setAmort] = useState(25);

  const scenarios = [
    { label: "5% down", downPct: 0.05 },
    { label: "10% down", downPct: 0.10 },
    { label: "20% down", downPct: 0.20 },
  ].map(({ label, downPct }) => {
    const downAmount = price * downPct;
    const insurance = cmhcInsurancePremium(price, downPct);
    const principal = price - downAmount + insurance;
    const monthly = computeMonthlyPayment(principal, annualRate, amort);
    return { label, downPct, downAmount, insurance, principal, monthly };
  });

  return (
    <div className="space-y-3">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
        <DollarSign className="h-3.5 w-3.5" />
        Mortgage Estimate
      </h3>

      {/* Rate + Amortization inputs */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground">Rate</span>
          <Input
            type="number"
            step="0.01"
            min={0}
            max={20}
            value={annualRate}
            onChange={(e) => setAnnualRate(Number(e.target.value) || 0)}
            className="h-6 text-[11px] w-16"
          />
          <span className="text-[10px] text-muted-foreground">%</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground">Amort</span>
          <Select value={String(amort)} onValueChange={(v) => setAmort(Number(v))}>
            <SelectTrigger className="h-6 text-[11px] w-16">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="20">20yr</SelectItem>
              <SelectItem value="25">25yr</SelectItem>
              <SelectItem value="30">30yr</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <span className="text-[10px] text-muted-foreground/60 ml-auto">semi-annual cpd</span>
      </div>

      {/* Scenario cards */}
      <div className="grid grid-cols-3 gap-2">
        {scenarios.map((s) => (
          <div
            key={s.label}
            className={cn(
              "rounded-xl border p-2.5 text-center",
              s.downPct >= 0.2
                ? "border-emerald-200 bg-emerald-50/60"
                : "border-border bg-muted/30",
            )}
          >
            <p className="text-[10px] font-semibold text-muted-foreground">{s.label}</p>
            <p className="text-sm font-bold tabular-nums text-foreground mt-0.5">
              {fmtCurrency(Math.round(s.monthly))}
              <span className="text-[9px] font-normal text-muted-foreground">/mo</span>
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {fmtCurrency(Math.round(s.downAmount))} down
            </p>
            {s.insurance > 0 && (
              <p className="text-[9px] text-amber-600 mt-0.5">
                +{fmtCurrency(Math.round(s.insurance))} CMHC
              </p>
            )}
          </div>
        ))}
      </div>

      <p className="text-[10px] text-muted-foreground/60">
        Estimate only · {annualRate}% rate · {amort}-yr amortization · Canadian semi-annual compounding
      </p>
    </div>
  );
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
  showings: initialShowings,
  listingAppointments: initialListingAppointments,
  userId,
}: Props) {
  const router = useRouter();
  const sandbox = useSandboxMode();

  // ── Local state ─────────────────────────────────────────────────────────────
  const [localActivities, setLocalActivities] =
    useState<ContactActivity[]>(initialActivities);
  const [localTasks, setLocalTasks] = useState<ContactTask[]>(initialTasks);
  const [clientNotes, setClientNotes] = useState<ClientNote[]>([]);
  const [newNoteText, setNewNoteText] = useState("");
  const [localClients, setLocalClients] = useState<Client[]>(initialClients);
  const [clientsLoading, setClientsLoading] = useState(initialClients.length === 0 && !!userId);

  // Client-side fetch: when server passes empty clients (to avoid large RSC payload),
  // fetch directly via Supabase client SDK
  useEffect(() => {
    if (initialClients.length > 0 || !userId) return;
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .eq("user_id", userId)
        .order("name")
        .limit(10000);
      if (!cancelled) {
        if (data) setLocalClients(data as Client[]);
        if (error) console.error("[CRM] Client-side fetch failed:", error.message);
        setClientsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [initialClients.length, userId]);
  const [localRelationships, setLocalRelationships] =
    useState<ClientRelationship[]>(initialRelationships);
  const [localFlightPlans, setLocalFlightPlans] =
    useState<FlightPlan[]>(initialFlightPlans);
  const [localFlightPlanSteps, setLocalFlightPlanSteps] =
    useState<FlightPlanStep[]>(initialFlightPlanSteps);
  const [localShowings, setLocalShowings] =
    useState<PropertyShowing[]>(initialShowings);
  const [localListingAppointments, setLocalListingAppointments] =
    useState<ListingAppointment[]>(initialListingAppointments);

  // Listing appointment add form
  const [showAddApptForm, setShowAddApptForm] = useState(false);
  const [newApptForm, setNewApptForm] = useState({
    appointment_date:     "",
    property_address:     "",
    estimated_list_price: "",
    notes:                "",
  });

  const [search, setSearch] = useState("");
  const [filterSide, setFilterSide] = useState<"all" | "buyer" | "seller" | "both">("all");
  const [filterSource, setFilterSource] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<"all" | ClientStatus>("all");
  const [activityFilter, setActivityFilter] = useState<"all" | "1y" | "3y" | "5y">("all");
  const [rewardGenerosity, setRewardGenerosity] = useState<RewardGenerosity>(() => {
    if (typeof window === "undefined") return "thoughtful";
    return (localStorage.getItem("crm_reward_generosity") as RewardGenerosity | null) ?? "thoughtful";
  });
  const [showArchived, setShowArchived] = useState(false);
  const [sortCol, setSortCol] = useState<SortCol>("gci");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [tab, setTab] = useState<TabId>("clients");
  const [clientsPage, setClientsPage] = useState(0);
  const CLIENTS_PAGE_SIZE = 200;

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
  // Address fields in Add Client dialog
  const [newClientStreet,   setNewClientStreet]   = useState("");
  const [newClientUnit,     setNewClientUnit]      = useState("");
  const [newClientCity,     setNewClientCity]      = useState("");
  const [newClientProvince, setNewClientProvince]  = useState("");
  const [newClientPostal,   setNewClientPostal]    = useState("");
  const [newClientCountry,  setNewClientCountry]   = useState("Canada");
  const [addClientSaving, setAddClientSaving] = useState(false);

  // Archive / Delete dialogs
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [archiveReason, setArchiveReason] = useState<ArchiveReason>("deceased");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Voice-to-client state
  const [voiceDraft,  setVoiceDraft]  = useState<VoiceDraft | null>(null);
  const [voiceBanner, setVoiceBanner] = useState(false);
  const { consume } = useVoiceDraft();

  // Derive which form fields were pre-filled by AI from voice input
  const voiceFilledFields = useMemo(() => {
    if (!voiceBanner || !voiceDraft || voiceDraft.intent !== "new_client") return new Set<string>();
    const s = new Set<string>();
    const c = voiceDraft.client;
    if (c.fullName)     s.add("name");
    if (c.email)        s.add("email");
    if (c.phone)        s.add("phone");
    if (c.source)       s.add("source");
    if (c.tags?.length) s.add("tags");
    if (c.street1)      s.add("street");
    if (c.street2)      s.add("unit");
    if (c.city)         s.add("city");
    if (c.province)     s.add("province");
    if (c.postalCode)   s.add("postal");
    if (c.country)      s.add("country");
    return s;
  }, [voiceBanner, voiceDraft]);

  /** Returns amber tint classes if this field was AI-filled from voice */
  const voiceTint = (field: string) =>
    voiceFilledFields.has(field) ? "bg-amber-50/60 border-amber-200/80" : "";

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
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number; enriched: number; errors: string[] } | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number; phase: string } | null>(null);
  const [importAsNewLeads, setImportAsNewLeads] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [profileDraft, setProfileDraft] = useState<{ first_name: string; last_name: string; notes: string } | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);

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
  // Only count against clients who have closed at least one transaction
  const clientsWithDeals = grouped.filter((g) => g.dealCount >= 1);
  const repeatCount = clientsWithDeals.filter((g) => g.dealCount > 1).length;
  const repeatRate =
    clientsWithDeals.length > 0
      ? Math.round((repeatCount / clientsWithDeals.length) * 100)
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

  // Sets of archived client IDs for fast lookup
  const archivedClientIds = useMemo(
    () => new Set(localClients.filter((c) => !!c.archived_at).map((c) => c.id)),
    [localClients],
  );
  const archivedCount = archivedClientIds.size;

  const filtered = useMemo(() => {
    const f = grouped.filter((g) => {
      // Archive visibility: hide archived clients unless in Hangar view (and vice versa)
      const isArchived = g.clientId ? archivedClientIds.has(g.clientId) : false;
      if (showArchived ? !isArchived : isArchived) return false;

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
      // Activity window filter
      if (activityFilter !== "all") {
        if (!g.lastDeal) return false;
        const cutoffMs = {
          "1y": 365,
          "3y": 365 * 3,
          "5y": 365 * 5,
        }[activityFilter] * 24 * 60 * 60 * 1000;
        const lastMs = new Date(g.lastDeal + "T12:00:00").getTime();
        if (Date.now() - lastMs > cutoffMs) return false;
      }
      return true;
    });
    return sortTableGroups(f, sortCol, sortDir);
  }, [grouped, search, filterSide, filterSource, filterStatus, activityFilter, sortCol, sortDir, localClients, showArchived, archivedClientIds]);

  // Reset to first page when filters change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setClientsPage(0); }, [search, filterSide, filterSource, filterStatus, activityFilter, sortCol, sortDir, showArchived]);

  // Paginate the filtered list
  const totalPages = Math.ceil(filtered.length / CLIENTS_PAGE_SIZE);
  const paginatedFiltered = filtered.slice(clientsPage * CLIENTS_PAGE_SIZE, (clientsPage + 1) * CLIENTS_PAGE_SIZE);

  // Max GCI across all clients (for proportional bar)
  const maxGCI = useMemo(
    () => grouped.reduce((m, g) => Math.max(m, g.totalGCI), 1),
    [grouped],
  );

  // Top-5% GCI threshold across ALL clients (for First Class badge)
  const firstClassThreshold = useMemo(() => {
    if (grouped.length === 0) return 0;
    const sorted = [...grouped].sort((a, b) => b.totalGCI - a.totalGCI);
    const idx = Math.max(0, Math.ceil(sorted.length * 0.05) - 1);
    return sorted[idx]?.totalGCI ?? 0;
  }, [grouped]);

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

  useEffect(() => {
    if (!selectedClient) { setProfileDraft(null); return; }
    setProfileDraft({
      first_name: selectedClient.first_name ?? "",
      last_name:  selectedClient.last_name  ?? "",
      notes:      selectedClient.notes      ?? "",
    });
  }, [selectedClient?.id]);

  // Fetch client notes log when a client is selected
  useEffect(() => {
    if (!selectedClientId) { setClientNotes([]); setNewNoteText(""); return; }
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("client_notes")
        .select("*")
        .eq("client_id", selectedClientId)
        .order("created_at", { ascending: false });
      if (!cancelled && data) setClientNotes(data as ClientNote[]);
    })();
    return () => { cancelled = true; };
  }, [selectedClientId]);

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

  // Badges + reward budget for the selected client's detail panel
  const selectedClientBadges = useMemo(() => {
    if (!selectedClientId || !clientDeals.length) return [];
    const group = {
      deals: clientDeals,
      dealCount: clientDeals.length,
      totalGCI: clientDeals.reduce((s, d) => s + d.gci, 0),
    };
    return computeAchievements(group, firstClassThreshold);
  }, [selectedClientId, clientDeals, firstClassThreshold]);

  const selectedClientRewardBudget = useMemo(() => {
    if (!clientDeals.length) return undefined;
    const sorted = [...clientDeals].filter((d) => d.close_date).sort((a, b) => (b.close_date ?? "").localeCompare(a.close_date ?? ""));
    const gci = sorted[0]?.gci ?? (clientDeals.reduce((s, d) => s + d.gci, 0) / clientDeals.length);
    return gci > 0 ? calcRewardBudget(gci, rewardGenerosity) : undefined;
  }, [clientDeals, rewardGenerosity]);

  // Auto-transition countdown: days until Landed -> Cruising (90 days after last close)
  const landedTransitionDays = useMemo(() => {
    if (!selectedClient || selectedClient.status !== "landed") return null;
    const closeDates = clientDeals
      .map((d) => d.close_date)
      .filter(Boolean)
      .sort()
      .reverse();
    const lastClose = closeDates[0];
    if (!lastClose) return null;
    const daysSince = Math.floor((Date.now() - new Date(lastClose + "T00:00:00").getTime()) / 86400000);
    const daysLeft = 90 - daysSince;
    return daysSince > 60 && daysLeft > 0 ? daysLeft : null;
  }, [selectedClient, clientDeals]);

  // Showings for the selected client
  const selectedClientShowings = useMemo(
    () => selectedClientId ? localShowings.filter((s) => s.client_id === selectedClientId) : [],
    [localShowings, selectedClientId],
  );

  // Listing appointments for the selected client
  const selectedClientListingAppointments = useMemo(
    () => selectedClientId ? localListingAppointments.filter((a) => a.client_id === selectedClientId) : [],
    [localListingAppointments, selectedClientId],
  );

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
      if (guardSandboxWrite(sandbox.sandboxMode)) return;
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
        // Keep last_contact_at in sync so the CRM card reflects the new activity immediately
        setLocalClients((prev) =>
          prev.map((c) =>
            c.id === clientId
              ? { ...c, last_contact_at: activityDate }
              : c
          )
        );
        markMemoryStaleClient(clientId);
      } else if (error) {
        toast.error("Failed to log activity");
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
      if (guardSandboxWrite(sandbox.sandboxMode)) return;
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
        if (clientId) markMemoryStaleClient(clientId);
      } else if (error) {
        toast.error("Failed to add task");
      }
    },
    [],
  );

  const completeTask = useCallback(async (taskId: string) => {
    if (guardSandboxWrite(sandbox.sandboxMode)) return;
    let removedTask: ContactTask | undefined;
    setLocalTasks((prev) => {
      removedTask = prev.find((t) => t.id === taskId);
      return prev.filter((t) => t.id !== taskId);
    });
    const supabase = createClient();
    const { error } = await supabase
      .from("contact_tasks")
      .update({ completed_at: new Date().toISOString() })
      .eq("id", taskId);
    if (error) {
      if (removedTask) {
        setLocalTasks((prev) =>
          [...prev, removedTask!].sort((a, b) => a.due_date.localeCompare(b.due_date)),
        );
      }
      toast.error("Failed to complete task");
    } else if (removedTask?.client_id) {
      markMemoryStaleClient(removedTask.client_id);
    }
  }, []);

  // Update a single field on a client record
  const updateClientField = useCallback(
    async (clientId: string, field: string, value: unknown) => {
      if (guardSandboxWrite(sandbox.sandboxMode)) return;
      const prevClient = localClients.find((c) => c.id === clientId);
      const prevValue = prevClient ? (prevClient as unknown as Record<string, unknown>)[field] : undefined;
      setLocalClients((prev) =>
        prev.map((c) => (c.id === clientId ? { ...c, [field]: value } : c)),
      );
      const supabase = createClient();
      const { error } = await supabase.from("clients").update({ [field]: value }).eq("id", clientId);
      if (error) {
        setLocalClients((prev) =>
          prev.map((c) => (c.id === clientId ? { ...c, [field]: prevValue } : c)),
        );
        toast.error("Failed to save changes");
        return;
      }
      markMemoryStaleClient(clientId);

      // Flight Plan execution: fire matching plans on status change
      if (field === "status" && typeof value === "string") {
        const client = localClients.find((c) => c.id === clientId);
        const clientTags: string[] = client?.tags ?? [];
        const matchingPlans = localFlightPlans.filter((fp) => {
          if (!fp.is_active || fp.trigger_status !== value) return false;
          if (fp.trigger_tag && !clientTags.includes(fp.trigger_tag)) return false;
          return true;
        });
        for (const plan of matchingPlans) {
          const planSteps = localFlightPlanSteps.filter(
            (s) => s.flight_plan_id === plan.id,
          );
          for (const step of planSteps) {
            if (step.action_type === "task" && step.template) {
              const clientName = client?.name ?? "Client";
              const taskTitle = step.template
                .replace(/\{name\}/gi, clientName)
                .replace(/\[name\]/gi, clientName)
                .replace(/\[Name\]/g, clientName);
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

  // ── Listing Appointment CRUD ─────────────────────────────────────────────────

  const addListingAppointment = useCallback(async () => {
    if (guardSandboxWrite(sandbox.sandboxMode)) return;
    if (!selectedClient || !newApptForm.appointment_date) return;
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data, error } = await supabase
      .from("listing_appointments")
      .insert({
        user_id:              user.id,
        client_id:            selectedClient.id,
        appointment_date:     newApptForm.appointment_date,
        property_address:     newApptForm.property_address || null,
        estimated_list_price: newApptForm.estimated_list_price ? Number(newApptForm.estimated_list_price) : null,
        notes:                newApptForm.notes || null,
        status:               "scheduled",
      })
      .select()
      .single();
    if (error) { toast.error("Failed to add appointment"); return; }
    setLocalListingAppointments((prev) => [...prev, data as ListingAppointment]);
    setShowAddApptForm(false);
    setNewApptForm({ appointment_date: "", property_address: "", estimated_list_price: "", notes: "" });
  }, [selectedClient, newApptForm]);

  const updateApptField = useCallback(async (id: string, field: string, value: unknown) => {
    if (guardSandboxWrite(sandbox.sandboxMode)) return;
    setLocalListingAppointments((prev) =>
      prev.map((a) => (a.id === id ? { ...a, [field]: value } : a)),
    );
    const supabase = createClient();
    const { error } = await supabase.from("listing_appointments").update({ [field]: value }).eq("id", id);
    if (error) toast.error("Failed to update appointment");
  }, []);

  const deleteListingAppointment = useCallback(async (id: string) => {
    if (guardSandboxWrite(sandbox.sandboxMode)) return;
    setLocalListingAppointments((prev) => prev.filter((a) => a.id !== id));
    const supabase = createClient();
    const { error } = await supabase.from("listing_appointments").delete().eq("id", id);
    if (error) toast.error("Failed to delete appointment");
  }, []);

  // Update a single field on a client_record (deal row) — no local state, DB write only
  const updateClientRecordField = useCallback(
    async (recordId: string, field: string, value: unknown) => {
      if (guardSandboxWrite(sandbox.sandboxMode)) return;
      const supabase = createClient();
      const { error } = await supabase.from("client_records").update({ [field]: value }).eq("id", recordId);
      if (error) toast.error("Failed to save changes");
    },
    [],
  );

  // Archive a client (move to Hangar) — atomic single update
  const handleArchiveClient = useCallback(async (clientId: string, reason: ArchiveReason) => {
    if (guardSandboxWrite(sandbox.sandboxMode)) return;
    const archivedAt = new Date().toISOString();
    const supabase = createClient();
    const { error } = await supabase
      .from("clients")
      .update({ archived_at: archivedAt, archive_reason: reason })
      .eq("id", clientId);
    if (error) {
      toast.error("Failed to archive client");
      return;
    }
    setLocalClients((prev) =>
      prev.map((c) => c.id === clientId ? { ...c, archived_at: archivedAt, archive_reason: reason } : c),
    );
    setArchiveDialogOpen(false);
    setDetailPanelOpen(false);
  }, []);

  // Restore a client from the Hangar — atomic single update
  const handleRestoreClient = useCallback(async (clientId: string) => {
    if (guardSandboxWrite(sandbox.sandboxMode)) return;
    const supabase = createClient();
    const { error } = await supabase
      .from("clients")
      .update({ archived_at: null, archive_reason: null })
      .eq("id", clientId);
    if (error) {
      toast.error("Failed to restore client");
      return;
    }
    setLocalClients((prev) =>
      prev.map((c) => c.id === clientId ? { ...c, archived_at: null, archive_reason: null } : c),
    );
    setDetailPanelOpen(false);
  }, []);

  // Permanently delete a client
  const handleDeleteClient = useCallback(async (clientId: string) => {
    if (guardSandboxWrite(sandbox.sandboxMode)) return;
    setDeleteLoading(true);
    const supabase = createClient();
    const { error } = await supabase.from("clients").delete().eq("id", clientId);
    setDeleteLoading(false);
    if (error) {
      toast.error("Failed to delete client");
      return;
    }
    setLocalClients((prev) => prev.filter((c) => c.id !== clientId));
    setDeleteDialogOpen(false);
    setDetailPanelOpen(false);
  }, []);

  // Add a new client manually
  const handleAddClient = useCallback(async () => {
    if (guardSandboxWrite(sandbox.sandboxMode)) return;
    if (!newClientName.trim()) return;
    setAddClientSaving(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setAddClientSaving(false); return; }

    // Check for existing client with same name (case-insensitive)
    const nameSearch = newClientName.trim().toLowerCase();
    const { data: existing } = await supabase
      .from("clients")
      .select("id, name")
      .eq("user_id", user.id)
      .eq("name_search", nameSearch)
      .limit(1)
      .single();

    if (existing) {
      toast.error(`A client named "${existing.name}" already exists`);
      setAddClientSaving(false);
      return;
    }

    // ── Validate client fields before writing ────────────────────────────────
    const clientValidation = validateClient({
      name: newClientName,
      email: newClientEmail.trim() || null,
      phone: newClientPhone.trim() || null,
    });
    if (!clientValidation.valid) {
      clientValidation.errors.forEach((msg) => toast.error(msg));
      setAddClientSaving(false);
      return;
    }

    const { data, error } = await supabase
      .from("clients")
      .insert({
        user_id: user.id,
        name: newClientName.trim().slice(0, FIELD_LIMITS.clientName),
        name_search: nameSearch,
        email: newClientEmail.trim().slice(0, FIELD_LIMITS.email) || null,
        phone: newClientPhone.trim().slice(0, FIELD_LIMITS.phone) || null,
        status: newClientStatus,
        lead_source: newClientSource || null,
        tags: newClientTags,
        street_address:  newClientStreet.trim().slice(0, FIELD_LIMITS.address)   || null,
        unit_number:     newClientUnit.trim()      || null,
        city:            newClientCity.trim()      || null,
        province_region: newClientProvince.trim()  || null,
        postal_code:     newClientPostal.trim()    || null,
        country:         newClientCountry.trim()   || "Canada",
      })
      .select()
      .single();

    if (error || !data) {
      toast.error("Failed to add client — please try again");
      setAddClientSaving(false);
      return;
    }
    setLocalClients((prev) => [...prev, data as Client]);
    setAddClientOpen(false);
    setNewClientName("");
    setNewClientEmail("");
    setNewClientPhone("");
    setNewClientStatus("boarding");
    setNewClientSource("");
    setNewClientTags([]);
    setNewClientStreet("");
    setNewClientUnit("");
    setNewClientCity("");
    setNewClientProvince("");
    setNewClientPostal("");
    setNewClientCountry("Canada");
    setVoiceDraft(null);
    setVoiceBanner(false);
    setAddClientSaving(false);
  }, [newClientName, newClientEmail, newClientPhone, newClientStatus, newClientSource, newClientTags,
      newClientStreet, newClientUnit, newClientCity, newClientProvince, newClientPostal, newClientCountry]);

  // Consume voice draft from global context on mount (routed from FAB)
  // Persist reward generosity preference
  useEffect(() => {
    localStorage.setItem("crm_reward_generosity", rewardGenerosity);
  }, [rewardGenerosity]);

  useEffect(() => {
    const draft = consume();
    if (!draft) return;

    if (draft.intent === "new_client") {
      // Pre-fill Add Client dialog
      if (draft.client.fullName)     setNewClientName(draft.client.fullName);
      if (draft.client.email)        setNewClientEmail(draft.client.email);
      if (draft.client.phone)        setNewClientPhone(draft.client.phone);
      if (draft.client.source)       setNewClientSource(draft.client.source);
      if (draft.client.tags?.length) setNewClientTags(draft.client.tags);
      if (draft.client.street1)      setNewClientStreet(draft.client.street1);
      if (draft.client.street2)      setNewClientUnit(draft.client.street2);
      if (draft.client.city)         setNewClientCity(draft.client.city);
      if (draft.client.province)     setNewClientProvince(draft.client.province);
      if (draft.client.postalCode)   setNewClientPostal(draft.client.postalCode);
      if (draft.client.country)      setNewClientCountry(draft.client.country);
      setVoiceDraft(draft);
      setVoiceBanner(true);
      setAddClientOpen(true);
    } else if (draft.intent === "note") {
      // Fuzzy-match client by name and open Log Activity
      const nameQuery = draft.note.client_name?.toLowerCase() ?? "";
      const match = nameQuery
        ? localClients.find((c) =>
            c.name?.toLowerCase().includes(nameQuery)
          )
        : null;
      if (match) {
        setSelectedClientId(match.id);
        setDetailPanelOpen(true);
        setLogActivityClientId(match.id);
        setLogType(draft.note.activity_type);
        setLogDescription(draft.note.description);
        setShowLogActivity(true);
      } else {
        toast.info("Couldn't find a matching client", {
          description: draft.note.client_name
            ? `"${draft.note.client_name}" — try adding the note manually.`
            : "No client name detected. Try adding the note manually.",
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Add a relationship between two clients
  const addRelationship = useCallback(
    async (clientIdA: string, clientIdB: string, type: RelationshipType) => {
      if (guardSandboxWrite(sandbox.sandboxMode)) return;
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
      } else if (error) {
        toast.error("Failed to add relationship");
      }
    },
    [],
  );

  // ── Flight Plan CRUD ─────────────────────────────────────────────────────────

  const handleLoadDefaults = useCallback(async () => {
    if (guardSandboxWrite(sandbox.sandboxMode)) return;
    const res = await fetch("/api/flight-plans/seed-defaults", { method: "POST" });
    const json = await res.json();
    if (!res.ok) {
      toast.error("Failed to load default campaigns");
      return;
    }
    if (json.seeded === 0) {
      toast.info("All default campaigns are already loaded");
      return;
    }
    toast.success(`${json.seeded} campaign${json.seeded !== 1 ? "s" : ""} loaded`);
    router.refresh();
  }, [router]);

  const handleSaveProfile = useCallback(async () => {
    if (guardSandboxWrite(sandbox.sandboxMode)) return;
    if (!selectedClient || !profileDraft) return;
    setProfileSaving(true);
    const first = profileDraft.first_name.trim();
    const last  = profileDraft.last_name.trim();
    const fullName = [first, last].filter(Boolean).join(" ") || selectedClient.name;
    await Promise.all([
      updateClientField(selectedClient.id, "first_name", first || null),
      updateClientField(selectedClient.id, "last_name",  last  || null),
      updateClientField(selectedClient.id, "name",       fullName),
      updateClientField(selectedClient.id, "name_search", fullName.toLowerCase()),
    ]);
    setProfileSaving(false);
    toast.success("Profile saved");
  }, [selectedClient, profileDraft, updateClientField]);

  const handleSaveFlightPlan = useCallback(
    async (
      plan: { id?: string; name: string; description: string; trigger_status: ClientStatus | null; trigger_tag: string | null; is_active: boolean },
      steps: { step_order: number; delay_days: number; action_type: "task" | "email" | "text"; template: string }[],
    ) => {
      if (guardSandboxWrite(sandbox.sandboxMode)) return;
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      let planId = plan.id;

      if (planId) {
        // Update existing plan
        const { error: updateError } = await supabase
          .from("flight_plans")
          .update({
            name: plan.name,
            description: plan.description || null,
            trigger_status: plan.trigger_status,
            trigger_tag: plan.trigger_tag,
            is_active: plan.is_active,
          })
          .eq("id", planId)
          .eq("user_id", user.id);

        if (updateError) {
          toast.error("Failed to save flight plan");
          return;
        }

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
            trigger_tag: plan.trigger_tag,
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
    if (guardSandboxWrite(sandbox.sandboxMode)) return;
    const supabase = createClient();
    const { error } = await supabase.from("flight_plans").delete().eq("id", planId);
    if (error) {
      toast.error("Failed to delete flight plan");
      return;
    }
    setLocalFlightPlans((prev) => prev.filter((p) => p.id !== planId));
    setLocalFlightPlanSteps((prev) => prev.filter((s) => s.flight_plan_id !== planId));
  }, []);

  const handleToggleFlightPlan = useCallback(async (planId: string, isActive: boolean) => {
    if (guardSandboxWrite(sandbox.sandboxMode)) return;
    const supabase = createClient();
    const { error } = await supabase.from("flight_plans").update({ is_active: isActive }).eq("id", planId);
    if (error) {
      toast.error("Failed to update flight plan");
      return;
    }
    setLocalFlightPlans((prev) =>
      prev.map((p) => (p.id === planId ? { ...p, is_active: isActive } : p)),
    );
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
    if (guardSandboxWrite(sandbox.sandboxMode)) return;
    if (!logDescription.trim() || !logActivityClientId) return;
    setLogSaving(true);
    await logActivity(logActivityClientId, logType, logDescription.trim(), logDate);
    setLogSaving(false);
    setShowLogActivity(false);
    setLogDescription("");
    setLogDate(nowIso());
  }

  async function handleAddTask() {
    if (guardSandboxWrite(sandbox.sandboxMode)) return;
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

    // File size guard — 10MB is generous for a CSV/spreadsheet
    const MAX_FILE_MB = 10;
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      toast.error(`File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum size is ${MAX_FILE_MB} MB.`);
      return;
    }

    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    const isExcel = ext === "xlsx" || ext === "xls";

    if (isExcel) {
      // Parse Excel with SheetJS
      const reader = new FileReader();
      reader.onerror = () => toast.error("Failed to read file. Please try again or use a different file.");
      reader.onload = (ev) => {
        try {
          const data = new Uint8Array(ev.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: "array" });
          const sheetName = workbook.SheetNames[0];
          if (!sheetName) { toast.error("Spreadsheet has no sheets."); return; }
          const csvText = XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName]);
          processImportText(csvText);
        } catch {
          toast.error("Could not parse spreadsheet. Make sure it's a valid .xlsx or .xls file.");
        }
      };
      reader.readAsArrayBuffer(file);
      return;
    }

    // CSV path
    const reader = new FileReader();
    reader.onerror = () => {
      toast.error("Failed to read file. Please try again or use a different file.");
    };
    reader.onload = (ev) => {
      const text = ev.target?.result as string;

      // If UTF-8 produced replacement characters, retry as Windows-1252 (common for older CRM exports)
      if (text.includes("\uFFFD")) {
        const fallbackReader = new FileReader();
        fallbackReader.onload = (ev2) => {
          const retryText = ev2.target?.result as string;
          processImportText(retryText);
        };
        fallbackReader.readAsText(file, "windows-1252");
        return;
      }

      processImportText(text);
    };

    function processImportText(text: string) {
      const { headers, rows, truncated } = parseCsv(text);
      if (headers.length === 0 || rows.length === 0) {
        toast.error("No data found. Make sure the first row contains column headers and there's at least one data row.");
        return;
      }
      if (truncated) {
        toast.warning(`File capped at ${CSV_ROW_CAP.toLocaleString()} rows — only the first ${CSV_ROW_CAP.toLocaleString()} contacts will be imported`);
      }

      // Auto-detect first_name + last_name columns and concatenate them
      const lowerHeaders = headers.map((h) => h.toLowerCase().trim());
      const firstNameIdx = lowerHeaders.findIndex((h) => h === "first name" || h === "first_name" || h === "firstname");
      const lastNameIdx = lowerHeaders.findIndex((h) => h === "last name" || h === "last_name" || h === "lastname");
      if (firstNameIdx !== -1 && lastNameIdx !== -1 && !lowerHeaders.includes("name")) {
        // Concatenate first + last into a synthetic "Name" column
        const firstH = headers[firstNameIdx];
        const lastH = headers[lastNameIdx];
        const syntheticHeader = "__full_name__";
        headers.push(syntheticHeader);
        for (const row of rows) {
          const first = (row[firstH] ?? "").trim();
          const last = (row[lastH] ?? "").trim();
          row[syntheticHeader] = [first, last].filter(Boolean).join(" ");
        }
        toast.info('Auto-merged "First Name" + "Last Name" into a single Name column.');
      }

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

      // Auto-detect common CRM column names (case-insensitive)
      // Covers: Follow Up Boss, kvCORE, Sierra Interactive, generic CRMs
      const AUTOMAP: Record<string, (v: string) => void> = {
        // Name variants
        "name":                 setMapName,
        "full name":            setMapName,
        "full_name":            setMapName,
        "contact name":         setMapName,
        "contact_name":         setMapName,
        "__full_name__":        setMapName,   // synthetic from first+last merge
        // Email variants
        "email":                setMapEmail,
        "email 1":              setMapEmail,
        "email address":        setMapEmail,
        "email_address":        setMapEmail,
        "e-mail":               setMapEmail,
        "primary email":        setMapEmail,
        // Phone variants
        "phone":                setMapPhone,
        "phone 1":              setMapPhone,
        "phone number":         setMapPhone,
        "mobile":               setMapPhone,
        "mobile phone":         setMapPhone,
        "cell":                 setMapPhone,
        "cell phone":           setMapPhone,
        "primary phone":        setMapPhone,
        // Phone type
        "phone 1 - type":       setMapPhoneType,
        "phone type":           setMapPhoneType,
        // Source variants
        "source":               setMapSource,
        "lead source":          setMapSource,
        "lead_source":          setMapSource,
        "referral source":      setMapSource,
        // Address variants
        "address 1 - street":   setMapStreet,
        "street":               setMapStreet,
        "street address":       setMapStreet,
        "address":              setMapStreet,
        "address 1 - city":     setMapCity,
        "city":                 setMapCity,
        "address 1 - state":    setMapProvince,
        "state":                setMapProvince,
        "province":             setMapProvince,
        "state/province":       setMapProvince,
        "address 1 - zip":      setMapPostal,
        "zip":                  setMapPostal,
        "postal code":          setMapPostal,
        "postal_code":          setMapPostal,
        "zip code":             setMapPostal,
        "address 1 - country":  setMapCountry,
        "country":              setMapCountry,
      };

      // Apply auto-mapping (first match wins per setter to avoid overwrite)
      const appliedSetters = new Set<(v: string) => void>();
      headers.forEach((h) => {
        const fn = AUTOMAP[h.toLowerCase().trim()];
        if (fn && !appliedSetters.has(fn)) {
          fn(h);
          appliedSetters.add(fn);
        }
      });

      setImportStep("map");
    }
    reader.readAsText(file, "UTF-8");
  }

  async function handleImport() {
    if (guardSandboxWrite(sandbox.sandboxMode)) return;
    if (!mapName) return;
    setImportLoading(true);
    setImportProgress({ current: 0, total: csvRows.length, phase: "Preparing..." });

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      toast.error("Session expired. Please refresh the page and try again.");
      setImportLoading(false);
      setImportProgress(null);
      return;
    }

    // Build existing name_search set for dedup
    const existingSearchNames = new Set(localClients.map((c) => c.name_search));
    let imported = 0;
    let skipped = 0;
    let enriched = 0;
    const errorMessages: string[] = [];
    const newClients: Client[] = [];

    // Pass 1: separate rows into enrichments (existing clients) and inserts (new)
    type EnrichItem = { existingId: string; updates: Record<string, unknown> };
    type InsertRow = Record<string, unknown>;
    const toEnrich: EnrichItem[] = [];
    const toInsert: InsertRow[] = [];

    for (const row of csvRows) {
      const rowNum = csvRows.indexOf(row) + 2; // +2 for 1-indexed header row
      const rawName = (row[mapName] ?? "").trim();
      if (!rawName) { skipped++; errorMessages.push(`Row ${rowNum}: skipped — no name`); continue; }
      const nameSearch = rawName.toLowerCase();

      let email    = mapEmail    !== "__none__" ? (row[mapEmail]    ?? "").trim() || null : null;
      const phone    = mapPhone    !== "__none__" ? (row[mapPhone]    ?? "").trim() || null : null;

      // Basic email format check — warn but don't reject
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errorMessages.push(`Row ${rowNum} (${rawName}): invalid email "${email}" — skipped field`);
        email = null;
      }
      const city     = mapCity     !== "__none__" ? (row[mapCity]     ?? "").trim() || null : null;
      const street   = mapStreet   !== "__none__" ? (row[mapStreet]   ?? "").trim() || null : null;
      const postal   = mapPostal   !== "__none__" ? (row[mapPostal]   ?? "").trim() || null : null;
      const leadSource = mapSource !== "__none__" ? (row[mapSource]   ?? "").trim() || null : null;
      // Province: strip trailing commas (FUB exports "ON," sometimes)
      const province = mapProvince !== "__none__"
        ? (row[mapProvince] ?? "").trim().replace(/,+$/, "") || null
        : null;

      if (existingSearchNames.has(nameSearch)) {
        const existing = localClients.find((c) => c.name_search === nameSearch);
        if (existing) {
          const updates: Record<string, unknown> = {};
          if (!existing.email           && email)    updates.email           = email;
          if (!existing.phone           && phone)    updates.phone           = phone;
          if (!existing.city            && city)     updates.city            = city;
          if (!existing.province_region && province) updates.province_region = province;
          if (!existing.street_address  && street)   updates.street_address  = street;
          if (!existing.postal_code     && postal)   updates.postal_code     = postal;
          if (Object.keys(updates).length > 0) {
            toEnrich.push({ existingId: existing.id, updates });
          } else {
            skipped++;
          }
        } else {
          skipped++;
        }
      } else {
        // Track within-CSV duplicates so they don't get inserted twice
        existingSearchNames.add(nameSearch);
        toInsert.push({
          user_id: user.id,
          name: rawName,
          name_search: nameSearch,
          email,
          phone,
          lead_source: leadSource,
          tags: [],
          city,
          province_region: province,
          street_address: street,
          postal_code:    postal,
          country:        mapCountry   !== "__none__" ? (row[mapCountry]   ?? "").trim() || "Canada" : "Canada",
          phone_type:     mapPhoneType !== "__none__" ? normalizePhoneType(row[mapPhoneType] ?? "") : "mobile",
          imported_at:    new Date().toISOString(),
          // Default to "cruising" (past client / sphere) so contact-recency alerts
          // don't fire. Only set "boarding" if the user explicitly marks these as new leads.
          status:         importAsNewLeads ? "boarding" : "cruising",
        });
      }
    }

    // Pass 2: batch upsert new clients in groups of 200
    // Using upsert with ignoreDuplicates prevents one bad row from killing an entire batch
    const BATCH_SIZE = 200;
    const totalOps = toInsert.length + toEnrich.length;
    let completedOps = 0;

    setImportProgress({ current: 0, total: totalOps, phase: "Importing contacts..." });

    for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
      const batch = toInsert.slice(i, i + BATCH_SIZE);
      const { data: batchData, error: batchError } = await supabase
        .from("clients")
        .upsert(batch, { onConflict: "user_id,name_search", ignoreDuplicates: true })
        .select();
      if (!batchError && batchData) {
        newClients.push(...(batchData as Client[]));
        imported += batchData.length;
      } else {
        const msg = batchError?.message ?? "unknown error";
        console.error(`[CSV Import] Batch ${Math.floor(i / BATCH_SIZE) + 1} failed (${batch.length} rows):`, msg);
        errorMessages.push(`Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${msg}`);
        skipped += batch.length;
      }
      completedOps += batch.length;
      setImportProgress({ current: completedOps, total: totalOps, phase: "Importing contacts..." });
    }

    // Pass 3: apply enrichments in parallel batches of 10
    setImportProgress({ current: completedOps, total: totalOps, phase: "Enriching existing contacts..." });
    const ENRICH_CONCURRENCY = 10;
    for (let i = 0; i < toEnrich.length; i += ENRICH_CONCURRENCY) {
      const chunk = toEnrich.slice(i, i + ENRICH_CONCURRENCY);
      const results = await Promise.allSettled(
        chunk.map(({ existingId, updates }) =>
          supabase.from("clients").update(updates).eq("id", existingId),
        ),
      );
      for (let j = 0; j < results.length; j++) {
        const r = results[j];
        if (r.status === "fulfilled" && !r.value.error) {
          const { existingId, updates } = chunk[j];
          setLocalClients((prev) =>
            prev.map((c) => (c.id === existingId ? { ...c, ...updates } : c)),
          );
          enriched++;
        } else {
          skipped++;
        }
      }
      completedOps += chunk.length;
      setImportProgress({ current: completedOps, total: totalOps, phase: "Enriching existing contacts..." });
    }

    setLocalClients((prev) => [...prev, ...newClients]);
    setImportResult({ imported, skipped, enriched, errors: errorMessages });
    setImportStep("done");
    setImportLoading(false);
    setImportProgress(null);
  }

  function resetImport() {
    setImportStep("upload");
    setCsvHeaders([]);
    setCsvRows([]);
    setImportAsNewLeads(false);
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
            className="gap-1.5 bg-white border-slate-300 text-slate-600 hover:text-slate-900 hover:border-slate-400"
          >
            <Upload className="h-3.5 w-3.5" />
            Import CSV
          </Button>
        </div>
      </div>

      {/* ── Summary KPI strip ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <SummaryCard
          icon={<Users className="h-4 w-4 text-blue-500" />}
          label="Total Clients"
          value={clientsLoading ? "Loading…" : String(grouped.length)}
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
        {(["clients", "crm", "insights", "portfolio", "flight_plans", "pipeline"] as TabId[]).map((t) => {
          const label = t === "clients" ? "Clients" : t === "crm" ? "CRM" : t === "insights" ? "Insights" : t === "portfolio" ? "Portfolio" : t === "flight_plans" ? "Flight Plans" : "Pipeline";
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                tab === t
                  ? "border-primary text-foreground"
                  : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300",
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
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3 flex flex-col gap-3">
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
                      : "bg-white text-slate-600 border-slate-200 hover:border-primary/40",
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
                    className="rounded-full px-3 py-1 text-xs font-semibold border border-slate-200 bg-white text-slate-600 hover:border-primary/40 transition-colors cursor-pointer outline-none"
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

          {/* ── Compact filter bar ────────────────────────────────── */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Status filter — compact dropdown */}
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as "all" | ClientStatus)}
              className="rounded-full px-3 py-1 text-xs font-semibold border border-slate-200 bg-white text-slate-600 hover:border-primary/40 transition-colors cursor-pointer outline-none"
            >
              <option value="all">All Statuses</option>
              {(Object.keys(CLIENT_STATUS_LABELS) as ClientStatus[]).map((s) => (
                <option key={s} value={s}>
                  {CLIENT_STATUS_LABELS[s]}
                </option>
              ))}
            </select>

            {/* Time window — compact dropdown */}
            <select
              value={activityFilter}
              onChange={(e) => setActivityFilter(e.target.value as "all" | "1y" | "3y" | "5y")}
              className="rounded-full px-3 py-1 text-xs font-semibold border border-slate-200 bg-white text-slate-600 hover:border-primary/40 transition-colors cursor-pointer outline-none"
            >
              <option value="all">All Time</option>
              <option value="1y">Last 365 days</option>
              <option value="3y">Last 3 years</option>
              <option value="5y">Last 5 years</option>
            </select>

            {/* Gift level — compact dropdown */}
            <select
              value={rewardGenerosity}
              onChange={(e) => setRewardGenerosity(e.target.value as RewardGenerosity)}
              className="rounded-full px-3 py-1 text-xs font-semibold border border-slate-200 bg-white text-slate-600 hover:border-primary/40 transition-colors cursor-pointer outline-none"
            >
              {(Object.keys(GENEROSITY_LABELS) as RewardGenerosity[]).map((g) => (
                <option key={g} value={g}>
                  🎁 {GENEROSITY_LABELS[g].label}
                </option>
              ))}
            </select>
            <span className="text-[10px] text-muted-foreground/60 hidden sm:block">
              {GENEROSITY_LABELS[rewardGenerosity].sub}
            </span>

            {/* Hangar toggle */}
            {archivedCount > 0 && (
              <button
                onClick={() => setShowArchived((v) => !v)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold border transition-colors ml-auto",
                  showArchived
                    ? "bg-zinc-800 text-zinc-100 border-zinc-700"
                    : "bg-white text-slate-600 border-slate-200 hover:border-primary/40",
                )}
              >
                <Archive className="h-3 w-3" />
                {showArchived ? "← Active" : `Hangar (${archivedCount})`}
              </button>
            )}
          </div>
          </div>{/* end filter panel */}

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
                        <TableHead className="p-0 w-1" />
                        <SortableHead col="name" label="Client" active={sortCol} dir={sortDir} onSort={handleSort} className="pl-3" />
                        <SortableHead col="gci" label="Lifetime GCI" active={sortCol} dir={sortDir} onSort={handleSort} className="text-right" />
                        <SortableHead col="deals" label="Deals" active={sortCol} dir={sortDir} onSort={handleSort} className="text-right" />
                        <SortableHead col="avg" label="Avg / Deal" active={sortCol} dir={sortDir} onSort={handleSort} className="text-right" />
                        <SortableHead col="last" label="Last Deal" active={sortCol} dir={sortDir} onSort={handleSort} className="text-right" />
                        <TableHead className="text-xs font-medium text-muted-foreground uppercase tracking-wide whitespace-nowrap">
                          Status
                        </TableHead>
                        <SortableHead col="side" label="Side" active={sortCol} dir={sortDir} onSort={handleSort} className="pr-4" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {clientsLoading ? (
                        Array.from({ length: 8 }).map((_, i) => (
                          <TableRow key={i} className="border-b border-border/20">
                            <TableCell className="p-0"><div className="w-1 min-h-[46px] bg-border/30" /></TableCell>
                            <TableCell className="pl-3 pr-2 py-2.5">
                              <div className="flex items-center gap-1.5">
                                <div className="h-7 w-7 rounded-full bg-muted animate-pulse" />
                                <div className="h-4 w-28 bg-muted rounded animate-pulse" />
                              </div>
                            </TableCell>
                            <TableCell><div className="h-4 w-16 bg-muted rounded animate-pulse ml-auto" /></TableCell>
                            <TableCell><div className="h-4 w-8 bg-muted rounded animate-pulse ml-auto" /></TableCell>
                            <TableCell><div className="h-4 w-16 bg-muted rounded animate-pulse ml-auto" /></TableCell>
                            <TableCell><div className="h-4 w-16 bg-muted rounded animate-pulse ml-auto" /></TableCell>
                            <TableCell><div className="h-4 w-16 bg-muted rounded animate-pulse" /></TableCell>
                            <TableCell><div className="h-4 w-12 bg-muted rounded animate-pulse" /></TableCell>
                          </TableRow>
                        ))
                      ) : filtered.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={8} className="py-12 text-center text-muted-foreground">
                            No clients match your search.
                          </TableCell>
                        </TableRow>
                      ) : (
                        paginatedFiltered.map((group) => {
                          const badges      = computeAchievements(group, firstClassThreshold);
                          const side        = dominantSide(group.deals);
                          const sideStyle   = SIDE_STYLES[side];
                          const hasClientId = group.clientId !== null;
                          const client      = hasClientId ? clientById.get(group.clientId!) : null;
                          const sc          = client ? CLIENT_STATUS_COLORS[client.status] : null;
                          const barPct      = maxGCI > 0 ? (group.totalGCI / maxGCI) * 100 : 0;
                          // Budget basis: most recent deal's GCI (fallback to average per deal)
                          const mostRecentGCI = group.deals
                            .filter((d) => d.close_date)
                            .sort((a, b) => (b.close_date ?? "").localeCompare(a.close_date ?? ""))[0]?.gci
                            ?? (group.dealCount > 0 ? group.totalGCI / group.dealCount : 0);
                          const rewardBudget = mostRecentGCI > 0 ? calcRewardBudget(mostRecentGCI, rewardGenerosity) : undefined;
                          return (
                            <TableRow
                              key={group.clientId ?? group.name}
                              className={cn(
                                "transition-colors border-b border-border/20 last:border-0",
                                hasClientId ? "hover:bg-muted/40 cursor-pointer" : "hover:bg-muted/20",
                              )}
                              onClick={() => { if (hasClientId) openDetailPanel(group.clientId!); }}
                            >
                              {/* Recency accent strip */}
                              <TableCell className="p-0">
                                <div className={cn("w-1 min-h-[46px]", recencyAccent(group.lastDeal))} />
                              </TableCell>

                              {/* Name + achievement badges */}
                              <TableCell className="pl-3 pr-2 py-2.5">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <div className="h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                                    {group.name.charAt(0).toUpperCase()}
                                  </div>
                                  <span className="font-medium text-foreground text-sm truncate max-w-[160px]">
                                    {group.name}
                                  </span>
                                  {/* Achievement badge icons — circular discs with hover tooltip */}
                                  {badges.length > 0 && (
                                    <span className="flex items-center gap-1.5 shrink-0">
                                      {badges.map((b) => (
                                        <AchievementBadgeIcon
                                          key={b.id}
                                          badge={b}
                                          size={17}
                                          rewardBudget={rewardBudget}
                                          generosity={rewardGenerosity}
                                        />
                                      ))}
                                    </span>
                                  )}
                                  {client?.tags?.[0] && (
                                    <Badge variant="outline" className="text-[9px] bg-violet-50 text-violet-700 border-violet-200 shrink-0 py-0">
                                      {client.tags[0]}
                                    </Badge>
                                  )}
                                </div>
                              </TableCell>

                              {/* Lifetime GCI + mini bar */}
                              <TableCell className="text-right py-2.5 pr-3">
                                <div className="flex flex-col items-end gap-0.5">
                                  <span className="tabular-nums text-sm font-semibold text-foreground">
                                    {fmtCurrency(group.totalGCI)}
                                  </span>
                                  <div className="h-1 w-14 bg-border/30 rounded-full overflow-hidden">
                                    <div
                                      className="h-full bg-primary/50 rounded-full transition-all"
                                      style={{ width: `${barPct}%` }}
                                    />
                                  </div>
                                </div>
                              </TableCell>

                              <TableCell className="text-right tabular-nums text-sm text-muted-foreground py-2.5">
                                {group.dealCount}
                              </TableCell>
                              <TableCell className="text-right tabular-nums text-sm text-muted-foreground py-2.5">
                                {fmtCurrency(group.avgDeal)}
                              </TableCell>

                              {/* Last Deal — coloured by recency */}
                              <TableCell className="text-right py-2.5">
                                {group.lastDeal ? (
                                  <span className={cn("text-sm whitespace-nowrap", recencyTextClass(group.lastDeal))}>
                                    {fmtMonthYear(group.lastDeal)}
                                  </span>
                                ) : (
                                  <span className="text-sm text-muted-foreground/40">—</span>
                                )}
                              </TableCell>

                              <TableCell className="py-2.5">
                                {sc && client && (
                                  <div className="flex flex-col gap-0.5">
                                    <span className={cn("text-[10px] font-semibold border rounded-full px-2 py-0.5 whitespace-nowrap inline-flex items-center gap-1", sc.bg, sc.text, sc.border)}>
                                      <span className={cn("h-1.5 w-1.5 rounded-full", sc.dot)} />
                                      {CLIENT_STATUS_LABELS[client.status]}
                                    </span>
                                    {/* Auto-transition countdown for Landed clients approaching 90-day mark */}
                                    {client.status === "landed" && group.lastDeal && (() => {
                                      const daysSinceClose = Math.floor((Date.now() - new Date(group.lastDeal + "T00:00:00").getTime()) / 86400000);
                                      const daysLeft = 90 - daysSinceClose;
                                      if (daysSinceClose > 60 && daysLeft > 0) {
                                        return (
                                          <span className="text-[9px] text-amber-600 dark:text-amber-400 whitespace-nowrap pl-0.5">
                                            Cruising in {daysLeft}d
                                          </span>
                                        );
                                      }
                                      return null;
                                    })()}
                                  </div>
                                )}
                              </TableCell>

                              <TableCell className="pr-4 py-2.5">
                                {sideStyle && (
                                  <span className={cn("text-[10px] font-semibold border rounded-full px-2.5 py-0.5 whitespace-nowrap", sideStyle.cls)}>
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
                {/* ── Pagination ── */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200">
                    <span className="text-sm text-muted-foreground">
                      Showing {clientsPage * CLIENTS_PAGE_SIZE + 1}–{Math.min((clientsPage + 1) * CLIENTS_PAGE_SIZE, filtered.length)} of {filtered.length} clients
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setClientsPage((p) => Math.max(0, p - 1))}
                        disabled={clientsPage === 0}
                        className="px-3 py-1.5 text-sm rounded-md border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        ← Previous
                      </button>
                      <span className="text-sm text-muted-foreground">
                        Page {clientsPage + 1} of {totalPages}
                      </span>
                      <button
                        onClick={() => setClientsPage((p) => Math.min(totalPages - 1, p + 1))}
                        disabled={clientsPage >= totalPages - 1}
                        className="px-3 py-1.5 text-sm rounded-md border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Next →
                      </button>
                    </div>
                  </div>
                )}
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
          listingAppointments={localListingAppointments}
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

                <Card className={cn(
                  "rounded-2xl shadow-sm",
                  valuationResult.portfolioHealth === "Concentrated" ? "border-amber-400" :
                  valuationResult.portfolioHealth === "Balanced" ? "border-blue-400" : "border-emerald-400",
                )}>
                  <CardContent className="pt-4 pb-3 px-4">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Shield className={cn(
                        "h-4 w-4",
                        valuationResult.portfolioHealth === "Concentrated" ? "text-amber-500" :
                        valuationResult.portfolioHealth === "Balanced" ? "text-blue-500" : "text-emerald-500",
                      )} />
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
          onLoadDefaults={handleLoadDefaults}
        />
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* PIPELINE TAB                                                        */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {tab === "pipeline" && (
        <PipelineTab
          clients={localClients}
          records={records}
          activities={localActivities}
          listingAppointments={localListingAppointments}
        />
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* CLIENT DETAIL SHEET                                                */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      <Sheet open={detailPanelOpen} onOpenChange={(open) => {
        setDetailPanelOpen(open);
        if (!open) {
          setEditingField(null);
          setShowLogActivity(false);
          setShowAddTask(false);
          setLogDescription("");
          setLogDate(nowIso());
          setTaskTitle("");
          setTaskDueDate(todayIso());
          setTaskPriority("normal");
          setTaskNotes("");
        }
      }}>
        <SheetContent side="right" className="sm:max-w-xl w-full overflow-y-auto p-0">
          {selectedClient && (
            <div className="flex flex-col">
              {/* ── Profile Header ───────────────────────────────────── */}
              <div className="sticky top-0 z-10 bg-background">
                {/* Status gradient banner */}
                <div className={cn("h-20 w-full bg-gradient-to-r", STATUS_HEADER_GRADIENT[selectedClient.status])} />

                {/* Avatar + controls row */}
                <div className="px-5 -mt-9 flex items-end justify-between">
                  <div className={cn(
                    "h-16 w-16 rounded-2xl ring-4 ring-background shadow-lg flex items-center justify-center text-white text-2xl font-bold bg-gradient-to-br shrink-0",
                    STATUS_HEADER_GRADIENT[selectedClient.status],
                  )}>
                    {(profileDraft?.first_name || selectedClient.first_name || selectedClient.name).charAt(0).toUpperCase()}
                  </div>
                  <div className="flex items-center gap-2 pb-1">
                    <Select
                      value={selectedClient.status}
                      onValueChange={(v) => updateClientField(selectedClient.id, "status", v)}
                    >
                      <SelectTrigger className={cn("h-7 w-auto gap-1.5 rounded-full text-xs font-semibold border px-3", CLIENT_STATUS_COLORS[selectedClient.status].bg, CLIENT_STATUS_COLORS[selectedClient.status].text, CLIENT_STATUS_COLORS[selectedClient.status].border)}>
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
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {selectedClient.archived_at ? (
                          <DropdownMenuItem className="gap-2" onSelect={() => handleRestoreClient(selectedClient.id)}>
                            <RotateCcw className="h-4 w-4" />
                            Restore Client
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem className="gap-2" onSelect={() => { setArchiveReason("deceased"); setArchiveDialogOpen(true); }}>
                            <Archive className="h-4 w-4" />
                            Move to Hangar…
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="gap-2 text-destructive focus:text-destructive" onSelect={() => setDeleteDialogOpen(true)}>
                          Delete Forever…
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                {/* Name + save */}
                <div className="px-5 pt-3 pb-4 border-b border-border/60 space-y-3">
                  <SheetHeader className="p-0">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-0.5">
                        <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">First Name</label>
                        <Input
                          value={profileDraft?.first_name ?? ""}
                          onChange={(e) => setProfileDraft((d) => d ? { ...d, first_name: e.target.value } : d)}
                          placeholder="First name"
                          className="h-9 text-base font-semibold"
                        />
                      </div>
                      <div className="space-y-0.5">
                        <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Last Name</label>
                        <Input
                          value={profileDraft?.last_name ?? ""}
                          onChange={(e) => setProfileDraft((d) => d ? { ...d, last_name: e.target.value } : d)}
                          placeholder="Last name"
                          className="h-9 text-base font-semibold"
                        />
                      </div>
                    </div>

                    {/* Badges + meta */}
                    <div className="flex items-center justify-between">
                      <div className="flex flex-wrap items-center gap-2">
                        {selectedClientBadges.length > 0 && selectedClientBadges.map((b) => (
                          <AchievementBadgeIcon
                            key={b.id}
                            badge={b}
                            size={24}
                            showLabel
                            rewardBudget={selectedClientRewardBudget}
                            generosity={rewardGenerosity}
                          />
                        ))}
                        {selectedClient.last_contact_at && (
                          <span className="text-[11px] text-muted-foreground">
                            Last contact: {relativeDate(selectedClient.last_contact_at)}
                          </span>
                        )}
                      </div>
                      <Button
                        size="sm"
                        onClick={handleSaveProfile}
                        disabled={profileSaving || !profileDraft || (
                          profileDraft.first_name === (selectedClient.first_name ?? "") &&
                          profileDraft.last_name  === (selectedClient.last_name  ?? "") &&
                          profileDraft.notes      === (selectedClient.notes      ?? "")
                        )}
                        className="h-7 gap-1.5 text-xs shrink-0"
                      >
                        {profileSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                        Save
                      </Button>
                    </div>
                  </SheetHeader>

                  {/* Flight Status Strip */}
                  <FlightStatusStrip current={selectedClient.status} />
                  {/* Auto-transition countdown */}
                  {landedTransitionDays !== null && (
                    <div className="mt-2 flex items-center gap-1.5 px-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                      <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                        Transitioning to Cruising in {landedTransitionDays} day{landedTransitionDays !== 1 ? "s" : ""}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* ── Body ────────────────────────────────────────────────── */}
              <div className="px-4 py-4 space-y-3">

                {/* Contact info section */}
                <div className="rounded-2xl border border-sky-200/60 bg-sky-50/30 dark:bg-sky-950/10 p-4 space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-sky-700 dark:text-sky-400 flex items-center gap-2">
                    <div className="h-5 w-5 rounded-md bg-sky-100 dark:bg-sky-900 flex items-center justify-center">
                      <Phone className="h-3 w-3 text-sky-600 dark:text-sky-400" />
                    </div>
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
                    <div className="flex-1">
                      <span className="text-[10px] text-muted-foreground block mb-1">AI Message Tone</span>
                      <div className="flex gap-1">
                        {(["casual", "friendly", "professional", "formal"] as CommunicationTone[]).map((tone) => (
                          <button
                            key={tone}
                            onClick={() => updateClientField(selectedClient.id, "communication_tone", tone)}
                            title={COMMUNICATION_TONE_DESCRIPTIONS[tone]}
                            className={cn(
                              "rounded-full px-2 py-0.5 text-[10px] font-semibold border transition-colors",
                              selectedClient.communication_tone === tone
                                ? "bg-violet-600 text-white border-violet-600"
                                : "bg-card text-muted-foreground border-border hover:border-violet-400/40",
                            )}
                          >
                            {COMMUNICATION_TONE_LABELS[tone]}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Address */}
                {(() => {
                  const addrLabels = getCountryLabels(selectedClient.country ?? "Canada");
                  return (
                    <div className="rounded-2xl border border-emerald-200/60 bg-emerald-50/30 dark:bg-emerald-950/10 p-4 space-y-3">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
                        <div className="h-5 w-5 rounded-md bg-emerald-100 dark:bg-emerald-900 flex items-center justify-center">
                          <MapPin className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                        </div>
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
                          label={addrLabels.provinceLabel}
                          value={selectedClient.province_region ?? ""}
                          onSave={(v) => updateClientField(selectedClient.id, "province_region", v || null)}
                          placeholder={`Add ${addrLabels.provinceLabel.toLowerCase()}…`}
                        />
                        <InlineEdit
                          label={addrLabels.postalLabel}
                          value={selectedClient.postal_code ?? ""}
                          onSave={(v) => updateClientField(selectedClient.id, "postal_code", v || null)}
                          placeholder={addrLabels.postalPlaceholder || addrLabels.postalLabel}
                        />
                        <InlineEdit
                          label="Country"
                          value={selectedClient.country ?? "Canada"}
                          onSave={(v) => updateClientField(selectedClient.id, "country", v || "Canada")}
                          placeholder="Canada"
                        />
                      </div>
                    </div>
                  );
                })()}

                {/* Details */}
                <div className="rounded-2xl border border-amber-200/60 bg-amber-50/30 dark:bg-amber-950/10 p-4 space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400 flex items-center gap-2">
                    <div className="h-5 w-5 rounded-md bg-amber-100 dark:bg-amber-900 flex items-center justify-center">
                      <FileText className="h-3 w-3 text-amber-600 dark:text-amber-400" />
                    </div>
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
                          <SelectTrigger className="h-7 w-24 text-[10px]">
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
                      <Select
                        value={selectedClient.lead_source ?? "__none__"}
                        onValueChange={(v) => updateClientField(selectedClient.id, "lead_source", v === "__none__" ? null : v)}
                      >
                        <SelectTrigger className="h-7 text-xs w-full">
                          <SelectValue placeholder="Select source…" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__" className="text-muted-foreground text-xs italic">
                            — Not set —
                          </SelectItem>
                          {LEAD_SOURCE_GROUPS.map((group) => (
                            <SelectGroup key={group.label}>
                              <SelectLabel className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 px-2 py-1">
                                {group.label}
                              </SelectLabel>
                              {group.options.map((src) => (
                                <SelectItem key={src} value={src} className="text-xs pl-4">
                                  {src}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {/* Buyer Profile — pre-approval, financing, target close */}
                    <div>
                      <span className="text-[10px] text-muted-foreground block mb-1">Pre-Approved</span>
                      <Select
                        value={selectedClient.buyer_pre_approved ? "yes" : "no"}
                        onValueChange={(v) => updateClientField(selectedClient.id, "buyer_pre_approved", v === "yes")}
                      >
                        <SelectTrigger className="h-7 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="no">No</SelectItem>
                          <SelectItem value="yes">Yes</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <span className="text-[10px] text-muted-foreground block mb-1">Financing</span>
                      <Select
                        value={selectedClient.buyer_financing_type ?? "unknown"}
                        onValueChange={(v) => updateClientField(selectedClient.id, "buyer_financing_type", v === "unknown" ? null : v)}
                      >
                        <SelectTrigger className="h-7 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.keys(BUYER_FINANCING_LABELS) as BuyerFinancingType[]).map((k) => (
                            <SelectItem key={k} value={k} className="text-xs">{BUYER_FINANCING_LABELS[k]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {selectedClient.buyer_pre_approved && (
                      <div>
                        <span className="text-[10px] text-muted-foreground block mb-1">Pre-Approval Amount</span>
                        <Input
                          type="number"
                          placeholder="$"
                          value={selectedClient.buyer_pre_approval_amount ?? ""}
                          onChange={(e) => updateClientField(selectedClient.id, "buyer_pre_approval_amount", e.target.value ? Number(e.target.value) : null)}
                          className="h-7 text-xs"
                        />
                      </div>
                    )}
                    <InlineEdit
                      label="Target Close Date"
                      value={selectedClient.buyer_target_close_date ?? ""}
                      type="date"
                      onSave={(v) => updateClientField(selectedClient.id, "buyer_target_close_date", v || null)}
                      placeholder="Expected close…"
                    />
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

                {/* Mortgage Estimate — only for buyer clients with a budget set */}
                {selectedClient.property_interest_type === "budget" &&
                  selectedClient.property_interest &&
                  selectedClient.property_interest > 0 && (
                    <MortgageEstimateSection price={selectedClient.property_interest} />
                  )}

                {/* Relationships */}
                <div className="rounded-2xl border border-violet-200/60 bg-violet-50/30 dark:bg-violet-950/10 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-violet-700 dark:text-violet-400 flex items-center gap-2">
                      <div className="h-5 w-5 rounded-md bg-violet-100 dark:bg-violet-900 flex items-center justify-center">
                        <Link2 className="h-3 w-3 text-violet-600 dark:text-violet-400" />
                      </div>
                      Relationships
                    </h3>
                    <div className="flex gap-1">
                      {/* Quick referral button — pre-selects "referred" type */}
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1 h-6 text-[10px] text-violet-400 border-violet-400/40 hover:border-violet-400/70 hover:text-violet-300"
                        onClick={() => {
                          setLinkRelType("referred");
                          setLinkRelOpen(true);
                          setLinkRelSearch("");
                        }}
                      >
                        <GitBranch className="h-3 w-3" />
                        Referral
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1 h-6 text-[10px]"
                        onClick={() => {
                          setLinkRelType("spouse");
                          setLinkRelOpen((v) => !v);
                          setLinkRelSearch("");
                        }}
                      >
                        <Link2 className="h-3 w-3" />
                        Link
                      </Button>
                    </div>
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
                    <div className="py-2 text-center space-y-1">
                      <p className="text-xs text-muted-foreground">No linked clients.</p>
                      <p className="text-[10px] text-muted-foreground/60">
                        Use <span className="font-medium text-violet-400">Referral</span> to track who referred this client,
                        or <span className="font-medium">Link</span> for family connections.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {clientRelationships.map((rel) => {
                        const otherId = rel.client_id_a === selectedClient.id ? rel.client_id_b : rel.client_id_a;
                        const other = clientById.get(otherId);
                        if (!other) return null;
                        const isReferral = rel.relationship_type === "referred" || rel.relationship_type === "referrer";
                        return (
                          <div
                            key={rel.id}
                            className={cn(
                              "flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-muted/30 transition-colors cursor-pointer",
                              isReferral && "bg-violet-500/5 hover:bg-violet-500/10",
                            )}
                            onClick={() => openDetailPanel(otherId)}
                          >
                            <div className={cn(
                              "h-7 w-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0",
                              isReferral ? "bg-violet-500/15 text-violet-400" : "bg-primary/10 text-primary",
                            )}>
                              {isReferral
                                ? <GitBranch className="h-3.5 w-3.5" />
                                : other.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <span className="text-sm font-medium text-foreground truncate block">{other.name}</span>
                              {isReferral && (
                                <span className="text-[10px] text-violet-400/80 leading-none">
                                  {rel.relationship_type === "referred" ? "Referred this client" : "This client referred them"}
                                </span>
                              )}
                            </div>
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-[9px] py-0 shrink-0",
                                isReferral && "border-violet-400/40 text-violet-400 bg-violet-500/10",
                              )}
                            >
                              {RELATIONSHIP_TYPE_LABELS[rel.relationship_type as RelationshipType] ?? rel.relationship_type}
                            </Badge>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* AI Actions */}
                <div className="rounded-2xl border border-indigo-200/60 bg-indigo-50/30 dark:bg-indigo-950/10 p-4 space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-400 flex items-center gap-2">
                    <div className="h-5 w-5 rounded-md bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center">
                      <Sparkles className="h-3 w-3 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    AI Actions
                  </h3>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      className="h-8 rounded-lg text-[11px] font-medium border border-dashed border-indigo-200 text-indigo-600 hover:bg-indigo-100/50 hover:border-indigo-300 dark:text-indigo-400 dark:hover:bg-indigo-900/30 transition-colors flex items-center justify-center gap-1.5"
                      onClick={async () => {
                        if (!selectedClient?.email) {
                          toast.error("Add an email address first");
                          return;
                        }
                        toast.info("Drafting referral ask…");
                        try {
                          const res = await fetch("/api/ai/draft-outreach", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              client_id: selectedClient.id,
                              opportunity_type: "referral_ask",
                            }),
                          });
                          if (res.ok) {
                            toast.success("Referral ask drafted — check Flight Control");
                          } else {
                            const err = await res.json().catch(() => ({}));
                            toast.error(err.error || "Failed to draft referral ask");
                          }
                        } catch {
                          toast.error("Failed to draft referral ask");
                        }
                      }}
                    >
                      🤝 Ask for Referral
                    </button>
                    <button
                      className="h-8 rounded-lg text-[11px] font-medium border border-dashed border-indigo-200 text-indigo-600 hover:bg-indigo-100/50 hover:border-indigo-300 dark:text-indigo-400 dark:hover:bg-indigo-900/30 transition-colors flex items-center justify-center gap-1.5"
                      onClick={async () => {
                        if (!selectedClient?.email) {
                          toast.error("Add an email address first");
                          return;
                        }
                        toast.info("Drafting check-in…");
                        try {
                          const res = await fetch("/api/ai/draft-outreach", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              client_id: selectedClient.id,
                              opportunity_type: "past_client_check_in",
                            }),
                          });
                          if (res.ok) {
                            toast.success("Check-in drafted — check Flight Control");
                          } else {
                            const err = await res.json().catch(() => ({}));
                            toast.error(err.error || "Failed to draft check-in");
                          }
                        } catch {
                          toast.error("Failed to draft check-in");
                        }
                      }}
                    >
                      👋 Check In
                    </button>
                    <button
                      className="h-8 rounded-lg text-[11px] font-medium border border-dashed border-indigo-200 text-indigo-600 hover:bg-indigo-100/50 hover:border-indigo-300 dark:text-indigo-400 dark:hover:bg-indigo-900/30 transition-colors flex items-center justify-center gap-1.5"
                      onClick={async () => {
                        if (!selectedClient?.email) {
                          toast.error("Add an email address first");
                          return;
                        }
                        toast.info("Drafting review request…");
                        try {
                          const res = await fetch("/api/ai/draft-outreach", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              client_id: selectedClient.id,
                              opportunity_type: "review_request",
                            }),
                          });
                          if (res.ok) {
                            toast.success("Review request drafted — check Flight Control");
                          } else {
                            const err = await res.json().catch(() => ({}));
                            toast.error(err.error || "Failed to draft review request");
                          }
                        } catch {
                          toast.error("Failed to draft review request");
                        }
                      }}
                    >
                      ⭐ Request Review
                    </button>
                    <button
                      className="h-8 rounded-lg text-[11px] font-medium border border-dashed border-indigo-200 text-indigo-600 hover:bg-indigo-100/50 hover:border-indigo-300 dark:text-indigo-400 dark:hover:bg-indigo-900/30 transition-colors flex items-center justify-center gap-1.5"
                      onClick={async () => {
                        if (!selectedClient?.email) {
                          toast.error("Add an email address first");
                          return;
                        }
                        toast.info("Drafting anniversary message…");
                        try {
                          const res = await fetch("/api/ai/draft-outreach", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              client_id: selectedClient.id,
                              opportunity_type: "closing_anniversary",
                            }),
                          });
                          if (res.ok) {
                            toast.success("Anniversary message drafted — check Flight Control");
                          } else {
                            const err = await res.json().catch(() => ({}));
                            toast.error(err.error || "Failed to draft message");
                          }
                        } catch {
                          toast.error("Failed to draft message");
                        }
                      }}
                    >
                      🎉 Anniversary Note
                    </button>
                  </div>
                </div>

                {/* Notes Log */}
                <div className="rounded-2xl border border-slate-200/60 bg-slate-50/40 dark:bg-slate-900/20 p-4 space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 flex items-center gap-2">
                    <div className="h-5 w-5 rounded-md bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                      <FileText className="h-3 w-3 text-slate-500 dark:text-slate-400" />
                    </div>
                    Notes
                  </h3>

                  {/* Add note input */}
                  <div className="flex gap-2">
                    <Textarea
                      placeholder="Add a note…"
                      value={newNoteText}
                      onChange={(e) => setNewNoteText(e.target.value)}
                      rows={2}
                      className="text-sm resize-none bg-white/60 dark:bg-slate-900/40 flex-1"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && newNoteText.trim()) {
                          e.preventDefault();
                          (async () => {
                            if (!selectedClient || guardSandboxWrite(sandbox.sandboxMode)) return;
                            const supabase = createClient();
                            const { data: { user } } = await supabase.auth.getUser();
                            if (!user) return;
                            const { data, error } = await supabase
                              .from("client_notes")
                              .insert({ user_id: user.id, client_id: selectedClient.id, content: newNoteText.trim() })
                              .select()
                              .single();
                            if (!error && data) {
                              setClientNotes((prev) => [data as ClientNote, ...prev]);
                              setNewNoteText("");
                              markMemoryStaleClient(selectedClient.id);
                            }
                          })();
                        }
                      }}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      className="self-end shrink-0"
                      disabled={!newNoteText.trim()}
                      onClick={async () => {
                        if (!selectedClient || guardSandboxWrite(sandbox.sandboxMode)) return;
                        const supabase = createClient();
                        const { data: { user } } = await supabase.auth.getUser();
                        if (!user) return;
                        const { data, error } = await supabase
                          .from("client_notes")
                          .insert({ user_id: user.id, client_id: selectedClient.id, content: newNoteText.trim() })
                          .select()
                          .single();
                        if (!error && data) {
                          setClientNotes((prev) => [data as ClientNote, ...prev]);
                          setNewNoteText("");
                          markMemoryStaleClient(selectedClient.id);
                        }
                      }}
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      Save
                    </Button>
                  </div>

                  {/* Notes log */}
                  {clientNotes.length > 0 && (
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {clientNotes.map((note) => (
                        <div
                          key={note.id}
                          className="group flex items-start gap-2 rounded-lg border border-slate-200/50 dark:border-slate-700/50 bg-white/60 dark:bg-slate-900/40 px-3 py-2"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{note.content}</p>
                            <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
                              {new Date(note.created_at).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" })}
                              {" · "}
                              {new Date(note.created_at).toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit" })}
                            </p>
                          </div>
                          <button
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-red-50 dark:hover:bg-red-950/30 text-slate-400 hover:text-red-500"
                            title="Delete note"
                            onClick={async () => {
                              if (guardSandboxWrite(sandbox.sandboxMode)) return;
                              const supabase = createClient();
                              const { error } = await supabase
                                .from("client_notes")
                                .delete()
                                .eq("id", note.id);
                              if (!error) {
                                setClientNotes((prev) => prev.filter((n) => n.id !== note.id));
                                if (selectedClient) markMemoryStaleClient(selectedClient.id);
                              }
                            }}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Activity section */}
                <div className="rounded-2xl border border-blue-200/60 bg-blue-50/30 dark:bg-blue-950/10 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-blue-700 dark:text-blue-400 flex items-center gap-2">
                      <div className="h-5 w-5 rounded-md bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                        <Activity className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                      </div>
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

                {/* Tasks section */}
                <div className="rounded-2xl border border-orange-200/60 bg-orange-50/30 dark:bg-orange-950/10 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-orange-700 dark:text-orange-400 flex items-center gap-2">
                      <div className="h-5 w-5 rounded-md bg-orange-100 dark:bg-orange-900 flex items-center justify-center">
                        <ListTodo className="h-3 w-3 text-orange-600 dark:text-orange-400" />
                      </div>
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
                                <span className={cn("text-[10px] font-semibold border rounded-full px-2.5 py-0.5 shrink-0", PRIORITY_STYLES[task.priority])}>{task.priority}</span>
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

                {/* Property Showings */}
                <ShowingsSection
                  clientId={selectedClient.id}
                  clientName={selectedClient.name}
                  showings={selectedClientShowings}
                  onShowingsChange={(updated) => {
                    // Replace this client's showings in the global list
                    const otherShowings = localShowings.filter((s) => s.client_id !== selectedClient.id);
                    setLocalShowings([...updated, ...otherShowings]);
                  }}
                />

                {/* Listing Appointments */}
                <div className="rounded-2xl border border-orange-200/60 bg-orange-50/30 dark:bg-orange-950/10 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-orange-700 dark:text-orange-400 flex items-center gap-2">
                      <div className="h-5 w-5 rounded-md bg-orange-100 dark:bg-orange-900 flex items-center justify-center">
                        <CalendarDays className="h-3 w-3 text-orange-600 dark:text-orange-400" />
                      </div>
                      Listing Appointments
                    </h3>
                    <button
                      onClick={() => setShowAddApptForm((v) => !v)}
                      className="flex items-center gap-0.5 text-[10px] text-orange-600 hover:text-orange-700 font-medium"
                    >
                      <Plus className="h-3 w-3" /> Add
                    </button>
                  </div>

                  {showAddApptForm && (
                    <div className="space-y-2 bg-white/60 dark:bg-orange-900/20 rounded-lg p-3 border border-orange-100 dark:border-orange-800/30">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-[10px] text-muted-foreground block mb-1">Date *</span>
                          <Input
                            type="date"
                            className="h-7 text-xs"
                            value={newApptForm.appointment_date}
                            onChange={(e) => setNewApptForm((f) => ({ ...f, appointment_date: e.target.value }))}
                          />
                        </div>
                        <div>
                          <span className="text-[10px] text-muted-foreground block mb-1">Est. List Price</span>
                          <Input
                            type="number"
                            placeholder="$"
                            className="h-7 text-xs"
                            value={newApptForm.estimated_list_price}
                            onChange={(e) => setNewApptForm((f) => ({ ...f, estimated_list_price: e.target.value }))}
                          />
                        </div>
                      </div>
                      <div>
                        <span className="text-[10px] text-muted-foreground block mb-1">Property Address</span>
                        <Input
                          className="h-7 text-xs"
                          placeholder="123 Main St…"
                          value={newApptForm.property_address}
                          onChange={(e) => setNewApptForm((f) => ({ ...f, property_address: e.target.value }))}
                        />
                      </div>
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => setShowAddApptForm(false)}
                          className="text-[10px] text-muted-foreground hover:text-foreground px-2 py-1"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={addListingAppointment}
                          disabled={!newApptForm.appointment_date}
                          className="text-[10px] bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white px-3 py-1 rounded-md font-medium"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  )}

                  {selectedClientListingAppointments.length === 0 && !showAddApptForm ? (
                    <p className="text-xs text-muted-foreground text-center py-1">No listing appointments recorded.</p>
                  ) : (
                    <div className="space-y-2">
                      {[...selectedClientListingAppointments]
                        .sort((a, b) => b.appointment_date.localeCompare(a.appointment_date))
                        .map((appt) => {
                          const accuracy =
                            appt.estimated_list_price != null && appt.actual_sale_price != null && appt.actual_sale_price > 0
                              ? Math.round((1 - Math.abs(appt.estimated_list_price - appt.actual_sale_price) / appt.actual_sale_price) * 100)
                              : null;
                          return (
                            <div key={appt.id} className="py-2 px-3 rounded-lg bg-white/50 dark:bg-orange-900/20 border border-orange-100/60 dark:border-orange-800/30 space-y-2">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  <p className="text-xs font-medium truncate">{appt.property_address || "No address"}</p>
                                  <p className="text-[10px] text-muted-foreground">{fmtDate(appt.appointment_date)}</p>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  <Select
                                    value={appt.status}
                                    onValueChange={(v) => updateApptField(appt.id, "status", v)}
                                  >
                                    <SelectTrigger className="h-6 text-[9px] w-28 border-dashed bg-transparent">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {(Object.keys(LISTING_STATUS_LABELS) as ListingStatus[]).map((s) => (
                                        <SelectItem key={s} value={s} className="text-xs">{LISTING_STATUS_LABELS[s]}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <button
                                    onClick={() => deleteListingAppointment(appt.id)}
                                    className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-destructive"
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                </div>
                              </div>
                              {/* Price tracking */}
                              <div className="grid grid-cols-3 gap-1.5">
                                <div>
                                  <span className="text-[9px] text-muted-foreground block mb-0.5">Est. List</span>
                                  <Input
                                    type="number"
                                    placeholder="$"
                                    className="h-6 text-[10px] px-2"
                                    value={appt.estimated_list_price ?? ""}
                                    onChange={(e) => updateApptField(appt.id, "estimated_list_price", e.target.value ? Number(e.target.value) : null)}
                                  />
                                </div>
                                <div>
                                  <span className="text-[9px] text-muted-foreground block mb-0.5">List Price</span>
                                  <Input
                                    type="number"
                                    placeholder="$"
                                    className="h-6 text-[10px] px-2"
                                    value={appt.actual_list_price ?? ""}
                                    onChange={(e) => updateApptField(appt.id, "actual_list_price", e.target.value ? Number(e.target.value) : null)}
                                  />
                                </div>
                                <div>
                                  <span className="text-[9px] text-muted-foreground block mb-0.5">Sold For</span>
                                  <Input
                                    type="number"
                                    placeholder="$"
                                    className="h-6 text-[10px] px-2"
                                    value={appt.actual_sale_price ?? ""}
                                    onChange={(e) => updateApptField(appt.id, "actual_sale_price", e.target.value ? Number(e.target.value) : null)}
                                  />
                                </div>
                              </div>
                              {accuracy !== null && (
                                <p className={cn("text-[9px] font-medium", accuracy >= 95 ? "text-green-600" : accuracy >= 85 ? "text-amber-600" : "text-red-500")}>
                                  Price accuracy: {accuracy}%
                                </p>
                              )}
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>

                {/* Deal History */}
                {clientDeals.length > 0 && (
                  <div className="rounded-2xl border border-green-200/60 bg-green-50/30 dark:bg-green-950/10 p-4 space-y-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-green-700 dark:text-green-400 flex items-center gap-2">
                      <div className="h-5 w-5 rounded-md bg-green-100 dark:bg-green-900 flex items-center justify-center">
                        <DollarSign className="h-3 w-3 text-green-600 dark:text-green-400" />
                      </div>
                      Deal History
                    </h3>
                    <div className="space-y-1.5">
                      {clientDeals.map((deal) => (
                        <div key={deal.id} className="py-1.5 px-2 rounded-lg bg-white/50 dark:bg-green-900/20 border border-green-100/60 dark:border-green-800/30 space-y-1.5">
                            <div className="flex items-center justify-between">
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-medium text-foreground truncate">
                                  {deal.address || "No address"}
                                </p>
                                <div className="flex items-center gap-2 mt-0.5">
                                  {deal.side && (
                                    <span className={cn("text-[9px] font-semibold border rounded-full px-2 py-0 shrink-0", SIDE_STYLES[deal.side]?.cls)}>
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
                            {/* Property use — only relevant for buyer-side deals */}
                            {deal.side !== "seller" && (
                              <Select
                                value={deal.property_use ?? "_none"}
                                onValueChange={(v) => updateClientRecordField(deal.id, "property_use", v === "_none" ? null : v)}
                              >
                                <SelectTrigger className="h-6 text-[10px] border-dashed bg-transparent">
                                  <SelectValue placeholder="Property use…" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="_none">Unknown</SelectItem>
                                  {(Object.keys(PROPERTY_USE_LABELS) as PropertyUse[]).map((u) => (
                                    <SelectItem key={u} value={u} className="text-xs">
                                      {PROPERTY_USE_LABELS[u]}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}

                            {/* Listing URL + MLS auto-populate */}
                            <div className="pt-1 flex gap-1">
                              <Input
                                type="url"
                                placeholder="MLS / listing URL…"
                                className="h-6 text-[10px] px-2 border-dashed flex-1"
                                defaultValue={deal.listing_url ?? ""}
                                id={`listing-url-${deal.id}`}
                                onBlur={(e) => {
                                  const v = e.target.value.trim() || null;
                                  if (v !== (deal.listing_url ?? null)) updateClientRecordField(deal.id, "listing_url", v);
                                }}
                              />
                              <button
                                className="h-6 px-2 rounded text-[9px] border border-dashed text-muted-foreground hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors whitespace-nowrap"
                                onClick={async () => {
                                  const urlInput = document.getElementById(`listing-url-${deal.id}`) as HTMLInputElement | null;
                                  const listingUrl = urlInput?.value?.trim();
                                  if (!listingUrl) {
                                    toast.error("Enter a Realtor.ca URL first");
                                    return;
                                  }
                                  toast.info("Looking up listing…");
                                  try {
                                    const res = await fetch("/api/mls-lookup", {
                                      method: "POST",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({ url: listingUrl }),
                                    });
                                    if (!res.ok) {
                                      const err = await res.json().catch(() => ({}));
                                      toast.error(err.error || "Could not fetch listing data");
                                      return;
                                    }
                                    const specs = await res.json();
                                    // Auto-fill any returned specs that have values
                                    const updates: Record<string, unknown> = {};
                                    if (specs.bedrooms != null) updates.bedrooms = specs.bedrooms;
                                    if (specs.bathrooms != null) updates.bathrooms = specs.bathrooms;
                                    if (specs.square_feet != null) updates.square_feet = specs.square_feet;
                                    if (specs.lot_acres != null) updates.lot_acres = specs.lot_acres;
                                    if (specs.garage != null) updates.garage = specs.garage;
                                    if (specs.waterfront != null) updates.waterfront = specs.waterfront;

                                    if (Object.keys(updates).length > 0) {
                                      // Save listing URL too
                                      updates.listing_url = listingUrl;
                                      const { error } = await supabase
                                        .from("client_records")
                                        .update(updates)
                                        .eq("id", deal.id);
                                      if (!error) {
                                        toast.success(`Auto-filled ${Object.keys(updates).length - 1} property fields`);
                                        router.refresh();
                                      } else {
                                        toast.error("Saved lookup data partially");
                                      }
                                    } else {
                                      toast.info("No property data found — enter details manually");
                                    }
                                  } catch {
                                    toast.error("Failed to look up listing");
                                  }
                                }}
                              >
                                Fetch
                              </button>
                            </div>

                            {/* Property specs */}
                            <div className="grid grid-cols-3 gap-1.5 pt-1">
                              <div>
                                <span className="text-[9px] text-muted-foreground block mb-0.5">Beds</span>
                                <Input
                                  type="number" min={0}
                                  className="h-6 text-[10px] px-2"
                                  defaultValue={deal.bedrooms ?? ""}
                                  onBlur={(e) => {
                                    const v = e.target.value ? Number(e.target.value) : null;
                                    if (v !== (deal.bedrooms ?? null)) updateClientRecordField(deal.id, "bedrooms", v);
                                  }}
                                />
                              </div>
                              <div>
                                <span className="text-[9px] text-muted-foreground block mb-0.5">Baths</span>
                                <Input
                                  type="number" min={0} step={0.5}
                                  className="h-6 text-[10px] px-2"
                                  defaultValue={deal.bathrooms ?? ""}
                                  onBlur={(e) => {
                                    const v = e.target.value ? Number(e.target.value) : null;
                                    if (v !== (deal.bathrooms ?? null)) updateClientRecordField(deal.id, "bathrooms", v);
                                  }}
                                />
                              </div>
                              <div>
                                <span className="text-[9px] text-muted-foreground block mb-0.5">Sq Ft</span>
                                <Input
                                  type="number" min={0}
                                  className="h-6 text-[10px] px-2"
                                  defaultValue={deal.square_feet ?? ""}
                                  onBlur={(e) => {
                                    const v = e.target.value ? Number(e.target.value) : null;
                                    if (v !== (deal.square_feet ?? null)) updateClientRecordField(deal.id, "square_feet", v);
                                  }}
                                />
                              </div>
                            </div>
                            <div className="grid grid-cols-3 gap-1.5">
                              <div>
                                <span className="text-[9px] text-muted-foreground block mb-0.5">Lot (acres)</span>
                                <Input
                                  type="number" min={0} step={0.01}
                                  className="h-6 text-[10px] px-2"
                                  defaultValue={deal.lot_acres ?? ""}
                                  onBlur={(e) => {
                                    const v = e.target.value ? Number(e.target.value) : null;
                                    if (v !== (deal.lot_acres ?? null)) updateClientRecordField(deal.id, "lot_acres", v);
                                  }}
                                />
                              </div>
                              <div className="flex items-end gap-1.5 pb-0.5">
                                <button
                                  className={cn("h-6 px-2 rounded text-[10px] border transition-colors", deal.garage ? "bg-green-100 dark:bg-green-900/40 border-green-300 dark:border-green-700 text-green-700 dark:text-green-400" : "border-dashed text-muted-foreground hover:border-slate-400")}
                                  onClick={() => updateClientRecordField(deal.id, "garage", !deal.garage)}
                                >
                                  Garage
                                </button>
                              </div>
                              <div className="flex items-end gap-1.5 pb-0.5">
                                <button
                                  className={cn("h-6 px-2 rounded text-[10px] border transition-colors", deal.waterfront ? "bg-blue-100 dark:bg-blue-900/40 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-400" : "border-dashed text-muted-foreground hover:border-slate-400")}
                                  onClick={() => updateClientRecordField(deal.id, "waterfront", !deal.waterfront)}
                                >
                                  Waterfront
                                </button>
                              </div>
                            </div>

                            {/* Condition tracking — only for deals without a close date yet, or recent deals */}
                            <div className="grid grid-cols-2 gap-1.5 pt-1">
                              <div>
                                <span className="text-[9px] text-muted-foreground block mb-0.5">Condition date</span>
                                <Input
                                  type="date"
                                  className="h-6 text-[10px] px-2"
                                  defaultValue={deal.condition_date ?? ""}
                                  onBlur={(e) => {
                                    const v = e.target.value || null;
                                    if (v !== (deal.condition_date ?? null)) updateClientRecordField(deal.id, "condition_date", v);
                                  }}
                                />
                              </div>
                              <div>
                                <span className="text-[9px] text-muted-foreground block mb-0.5">Status</span>
                                <Select
                                  value={deal.condition_status ?? "pending"}
                                  onValueChange={(v) => updateClientRecordField(deal.id, "condition_status", v)}
                                >
                                  <SelectTrigger className="h-6 text-[10px] border-dashed bg-transparent">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="pending" className="text-xs">Pending</SelectItem>
                                    <SelectItem value="waived" className="text-xs">Waived</SelectItem>
                                    <SelectItem value="firmed" className="text-xs">Firmed</SelectItem>
                                    <SelectItem value="collapsed" className="text-xs">Collapsed</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>

                            {/* AI listing description generator */}
                            {(deal.bedrooms != null || deal.bathrooms != null || deal.square_feet != null) && (
                              <div className="pt-1 flex gap-1">
                                <button
                                  className="flex-1 h-7 rounded text-[10px] border border-dashed text-violet-600 hover:border-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors flex items-center justify-center gap-1"
                                  onClick={async () => {
                                    toast.info("Generating listing description…");
                                    try {
                                      const res = await fetch("/api/ai/listing-description", {
                                        method: "POST",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({
                                          client_record_id: deal.id,
                                          client_id: selectedClient?.id,
                                        }),
                                      });
                                      if (!res.ok) {
                                        const err = await res.json().catch(() => ({}));
                                        toast.error(err.error || "Failed to generate description");
                                        return;
                                      }
                                      const result = await res.json();
                                      const fullText = `${result.description}\n\n---\n\nSocial Media Post:\n${result.social_post}`;
                                      await navigator.clipboard.writeText(fullText);
                                      toast.success("Listing description copied to clipboard!");
                                    } catch {
                                      toast.error("Failed to generate description");
                                    }
                                  }}
                                >
                                  ✨ Generate Description
                                </button>
                                <button
                                  className="h-7 px-2 rounded text-[9px] border border-dashed text-slate-500 hover:border-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
                                  title="Generate without emojis"
                                  onClick={async () => {
                                    toast.info("Generating (no emojis)…");
                                    try {
                                      const res = await fetch("/api/ai/listing-description", {
                                        method: "POST",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({
                                          client_record_id: deal.id,
                                          client_id: selectedClient?.id,
                                          no_emoji: true,
                                        }),
                                      });
                                      if (!res.ok) {
                                        const err = await res.json().catch(() => ({}));
                                        toast.error(err.error || "Failed to generate description");
                                        return;
                                      }
                                      const result = await res.json();
                                      const fullText = `${result.description}\n\n---\n\nSocial Media Post:\n${result.social_post}`;
                                      await navigator.clipboard.writeText(fullText);
                                      toast.success("Description (no emojis) copied to clipboard!");
                                    } catch {
                                      toast.error("Failed to generate description");
                                    }
                                  }}
                                >
                                  No emoji
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* ADD CLIENT DIALOG                                                   */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      <Dialog open={addClientOpen} onOpenChange={(open) => {
        setAddClientOpen(open);
        if (!open) {
          setVoiceBanner(false);
          setVoiceDraft(null);
          setNewClientName("");
          setNewClientEmail("");
          setNewClientPhone("");
          setNewClientStatus("boarding");
          setNewClientSource("");
          setNewClientTags([]);
          setNewClientStreet("");
          setNewClientUnit("");
          setNewClientCity("");
          setNewClientProvince("");
          setNewClientPostal("");
          setNewClientCountry("Canada");
        }
      }}>
        <DialogContent className="sm:max-w-md w-[95vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-4 w-4" />
              Add Client
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            {/* Voice pre-fill banner */}
            {voiceBanner && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
                <div className="flex items-start gap-2">
                  <span className="text-base leading-none mt-0.5">✨</span>
                  <p className="text-[11px] text-amber-800 leading-snug">
                    Pre-filled from voice — please review and edit before saving.
                    {voiceDraft?.missingFields && voiceDraft.missingFields.length > 0 && (
                      <span className="block mt-0.5 text-amber-600">
                        Still needed: {voiceDraft.missingFields.join(", ")}
                      </span>
                    )}
                  </p>
                </div>
                {voiceDraft?.transcript_cleaned && (
                  <details className="mt-1.5">
                    <summary className="text-[10px] text-amber-700 cursor-pointer hover:text-amber-900 font-medium select-none">
                      View raw transcript
                    </summary>
                    <p className="mt-1 text-[10px] text-amber-700/80 leading-relaxed bg-amber-100/50 rounded px-2 py-1.5 italic">
                      &ldquo;{voiceDraft.transcript_cleaned}&rdquo;
                    </p>
                  </details>
                )}
              </div>
            )}
            <div className="space-y-1">
              <Label className="text-xs">Name <span className="text-red-500">*</span></Label>
              <Input
                autoFocus
                placeholder="Full name"
                value={newClientName}
                onChange={(e) => setNewClientName(e.target.value)}
                className={cn("h-8 text-sm", voiceTint("name"))}
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
                  className={cn("h-8 text-sm", voiceTint("email"))}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Phone</Label>
                <Input
                  type="tel"
                  placeholder="(613) 555-0123"
                  value={newClientPhone}
                  onChange={(e) => setNewClientPhone(e.target.value)}
                  className={cn("h-8 text-sm", voiceTint("phone"))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Flight Status</Label>
                <Select value={newClientStatus} onValueChange={(v) => setNewClientStatus(v as ClientStatus)}>
                  <SelectTrigger className={cn("h-8 text-sm", voiceTint("status"))}>
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
                  className={cn("h-8 text-sm", voiceTint("source"))}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Tags</Label>
              <TagPicker value={newClientTags} onChange={setNewClientTags} />
            </div>

            {/* Address (optional) */}
            <div className="space-y-2 pt-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Address (optional)
              </p>
              <div className="space-y-2">
                <Input
                  placeholder="Street address"
                  value={newClientStreet}
                  onChange={(e) => setNewClientStreet(e.target.value)}
                  className={cn("h-8 text-sm", voiceTint("street"))}
                />
                <Input
                  placeholder="Unit / Suite / Apt"
                  value={newClientUnit}
                  onChange={(e) => setNewClientUnit(e.target.value)}
                  className={cn("h-8 text-sm", voiceTint("unit"))}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  placeholder="City"
                  value={newClientCity}
                  onChange={(e) => setNewClientCity(e.target.value)}
                  className={cn("h-8 text-sm", voiceTint("city"))}
                />
                <Input
                  placeholder={getCountryLabels(newClientCountry).provinceLabel}
                  value={newClientProvince}
                  onChange={(e) => setNewClientProvince(e.target.value)}
                  className={cn("h-8 text-sm", voiceTint("province"))}
                />
                <Input
                  placeholder={getCountryLabels(newClientCountry).postalPlaceholder || getCountryLabels(newClientCountry).postalLabel}
                  value={newClientPostal}
                  onChange={(e) => setNewClientPostal(e.target.value)}
                  className={cn("h-8 text-sm", voiceTint("postal"))}
                />
                <Input
                  placeholder="Country"
                  value={newClientCountry}
                  onChange={(e) => setNewClientCountry(e.target.value)}
                  className={cn("h-8 text-sm", voiceTint("country"))}
                />
              </div>
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
      <Dialog open={importOpen} onOpenChange={(open) => {
        setImportOpen(open);
        if (!open) {
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
          setImportAsNewLeads(false);
        }
      }}>
        <DialogContent className="sm:max-w-lg w-[95vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-4 w-4" />
              Import Contacts
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
                Upload a CSV or Excel file with your contacts. The first row should be column headers.
                {" "}
                <button
                  type="button"
                  className="text-primary underline underline-offset-2 hover:text-primary/80"
                  onClick={() => {
                    const csv = "Name,Email,Phone,Street Address,City,Province,Postal Code,Country,Lead Source\nJane Smith,jane@example.com,902-555-0123,123 Main St,Halifax,NS,B3H 1A1,Canada,Referral\n";
                    const blob = new Blob([csv], { type: "text/csv" });
                    const url = URL.createObjectURL(blob);
                    const a = Object.assign(document.createElement("a"), { href: url, download: "agent-runway-import-template.csv" });
                    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
                  }}
                >
                  Download template
                </button>
              </p>
              <div
                className="border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-primary/40 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm font-medium text-foreground">
                  Click to upload contacts
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  .csv or .xlsx files
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
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
              {/* Import intent toggle */}
              <div
                className={cn(
                  "rounded-xl border p-3.5 cursor-pointer transition-colors select-none",
                  importAsNewLeads
                    ? "border-amber-500/40 bg-amber-500/8"
                    : "border-border/50 bg-muted/20 hover:bg-muted/40",
                )}
                onClick={() => setImportAsNewLeads((v) => !v)}
              >
                <div className="flex items-start gap-3">
                  <div className={cn(
                    "mt-0.5 h-4 w-4 shrink-0 rounded border-2 flex items-center justify-center transition-colors",
                    importAsNewLeads ? "border-amber-500 bg-amber-500" : "border-muted-foreground/40",
                  )}>
                    {importAsNewLeads && <CheckCheck className="h-2.5 w-2.5 text-white" />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground leading-tight">
                      These are new leads I haven&apos;t contacted yet
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                      {importAsNewLeads
                        ? "Contacts will be added as Boarding — contact alerts will apply."
                        : "Default: contacts added as Cruising (past clients / sphere). No speed-to-lead alerts."}
                    </p>
                  </div>
                </div>
              </div>

              {/* Progress bar */}
              {importProgress && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{importProgress.phase}</span>
                    <span>{importProgress.current.toLocaleString()} / {importProgress.total.toLocaleString()}</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-blue-500 transition-all duration-300"
                      style={{ width: `${importProgress.total > 0 ? Math.round((importProgress.current / importProgress.total) * 100) : 0}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  disabled={importLoading}
                  onClick={handleImport}
                >
                  {importLoading ? "Importing…" : "Import Contacts"}
                </Button>
                <Button variant="ghost" onClick={() => setImportStep("map")} disabled={importLoading}>
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
                  {importResult.enriched > 0
                    ? `, ${importResult.enriched} enriched`
                    : ""}
                  {importResult.skipped > 0
                    ? `, ${importResult.skipped} skipped (duplicates or errors)`
                    : ""}
                  .
                </p>
              </div>
              {importResult.errors.length > 0 && (
                <details className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <summary className="text-xs font-medium text-amber-800 cursor-pointer">
                    {importResult.errors.length} warning{importResult.errors.length !== 1 ? "s" : ""} — click to expand
                  </summary>
                  <ul className="mt-2 space-y-0.5 max-h-40 overflow-y-auto text-xs text-amber-700">
                    {importResult.errors.slice(0, 50).map((msg, i) => (
                      <li key={i}>{msg}</li>
                    ))}
                    {importResult.errors.length > 50 && (
                      <li className="font-medium">…and {importResult.errors.length - 50} more</li>
                    )}
                  </ul>
                </details>
              )}
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

      {/* ══ Archive Dialog ══ */}
      <Dialog open={archiveDialogOpen} onOpenChange={setArchiveDialogOpen}>
        <DialogContent className="sm:max-w-sm w-[95vw]">
          <DialogHeader>
            <DialogTitle>Move to Hangar</DialogTitle>
            <DialogDescription>
              {selectedClient?.name} will be hidden from your active client list but all their history and deals will be preserved.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label className="text-xs text-muted-foreground">Reason for archiving</Label>
            <Select value={archiveReason} onValueChange={(v) => setArchiveReason(v as ArchiveReason)}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="deceased">Deceased</SelectItem>
                <SelectItem value="moved_away">Moved Away</SelectItem>
                <SelectItem value="do_not_contact">Do Not Contact</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setArchiveDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={() => {
                if (selectedClient) handleArchiveClient(selectedClient.id, archiveReason);
              }}
            >
              <Archive className="mr-2 h-4 w-4" />
              Move to Hangar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══ Delete Dialog ══ */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-sm w-[95vw]">
          <DialogHeader>
            <DialogTitle>Permanently delete {selectedClient?.name}?</DialogTitle>
            <DialogDescription>
              All activities and tasks for this client will be deleted. Deal history records are preserved — they remain in your History with no client link.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={deleteLoading}
              onClick={() => {
                if (selectedClient) handleDeleteClient(selectedClient.id);
              }}
            >
              {deleteLoading ? "Deleting…" : "Delete Forever"}
            </Button>
          </DialogFooter>
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
    blue:    { topBorder: "border-t-blue-500",    iconBg: "bg-blue-100",    iconColor: "text-blue-600" },
    violet:  { topBorder: "border-t-violet-500",  iconBg: "bg-violet-100",  iconColor: "text-violet-600" },
    emerald: { topBorder: "border-t-emerald-500", iconBg: "bg-emerald-100", iconColor: "text-emerald-600" },
    amber:   { topBorder: "border-t-amber-500",   iconBg: "bg-amber-100",   iconColor: "text-amber-600" },
  };
  const s = accentMap[accent];
  return (
    <Card className={cn("rounded-xl border-t-4 bg-white shadow-sm hover:shadow-md transition-shadow", s.topBorder)}>
      <CardContent className="pt-3 pb-3 px-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {label}
            </span>
            <p className="text-xl font-bold text-foreground tabular-nums leading-tight mt-0.5">
              {value}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>
          </div>
          <div className={cn("rounded-lg p-2 shrink-0 mt-0.5", s.iconBg)}>
            <span className={s.iconColor}>{icon}</span>
          </div>
        </div>
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

const FLIGHT_STAGES: ClientStatus[] = ["boarding", "taxiing", "approach", "in_flight", "landed", "cruising"];

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
          onKeyDown={(e) => {
            // Enter: commit and exit edit mode
            if (e.key === "Enter") { (e.target as HTMLInputElement).blur(); }
            // Tab: let onBlur handle the save; browser naturally moves focus to
            // the next tabIndex={0} InlineEdit, whose onFocus activates it
            if (e.key === "Escape") { e.preventDefault(); setLocalVal(value); setEditing(false); }
          }}
          className="h-7 text-xs"
        />
      </div>
    );
  }

  return (
    <div
      className="cursor-pointer group"
      tabIndex={0}
      onClick={() => { setLocalVal(value); setEditing(true); }}
      onFocus={() => { setLocalVal(value); setEditing(true); }}
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
