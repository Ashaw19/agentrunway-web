"use client";

import { useState, useMemo } from "react";
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
} from "lucide-react";
import { fmtCurrency } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import type { Client, ClientRecord } from "@/lib/types/database";

interface Props {
  clients: Client[];      // master identity records from the clients table
  records: ClientRecord[]; // deal records from client_records (may have client_id or null)
}

// ── Types ─────────────────────────────────────────────────────────────────────

type ClientGroup = {
  clientId: string | null; // null = unlinked (pre-migration or name not matched)
  name: string;
  deals: ClientRecord[];
  totalGCI: number;        // lifetime across ALL imported years
  dealCount: number;       // total deals across ALL imported years
  avgDeal: number;
  lastDeal: string | null; // most recent close_date
  years: number[];         // distinct years with deals, sorted desc
};

// ── Build client groups ───────────────────────────────────────────────────────
// Priority:
//   1. Records with client_id → grouped by that ID (canonical)
//   2. Records without client_id but name matches a client → attributed to that client
//   3. Records with no match → virtual group keyed by normalised name

function buildAllGroups(clients: Client[], records: ClientRecord[]): ClientGroup[] {
  // name_search → client.id lookup
  const nameToId = new Map(clients.map((c) => [c.name_search, c.id]));
  const clientById = new Map(clients.map((c) => [c.id, c]));

  const buckets = new Map<string, ClientRecord[]>();

  for (const r of records) {
    const key =
      r.client_id ??
      nameToId.get(r.name.trim().toLowerCase()) ??
      `__v__${r.name.trim().toLowerCase()}`; // virtual key for unlinked
    const b = buckets.get(key) ?? [];
    b.push(r);
    buckets.set(key, b);
  }

  const groups: ClientGroup[] = [];

  // Proper client groups (linked)
  for (const client of clients) {
    const deals = buckets.get(client.id) ?? [];
    if (deals.length > 0) {
      groups.push(makeGroup(client.id, client.name, deals));
    }
  }

  // Virtual groups (unlinked records with no matching client)
  for (const [key, deals] of buckets) {
    if (key.startsWith("__v__")) {
      groups.push(makeGroup(null, deals[0].name, deals));
    }
  }

  return groups.sort((a, b) => b.totalGCI - a.totalGCI);
}

function makeGroup(clientId: string | null, name: string, deals: ClientRecord[]): ClientGroup {
  const totalGCI = Math.round(deals.reduce((s, d) => s + (d.gci ?? 0), 0) * 100) / 100;
  const dealCount = deals.length;
  const avgDeal = dealCount > 0 ? Math.round(totalGCI / dealCount) : 0;
  const sortedDates = deals
    .map((d) => d.close_date)
    .filter(Boolean)
    .sort()
    .reverse();
  const lastDeal = (sortedDates[0] as string | undefined) ?? null;
  const years = [
    ...new Set(deals.map((d) => d.year).filter((y): y is number => y !== null)),
  ].sort((a, b) => b - a);
  return { clientId, name, deals, totalGCI, dealCount, avgDeal, lastDeal, years };
}

// ── Source insights ───────────────────────────────────────────────────────────
type SourceStat = { source: string; deals: number; totalGCI: number; avgGCI: number };

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
    .map(([source, s]) => ({ source, ...s, avgGCI: Math.round(s.totalGCI / s.deals) }))
    .sort((a, b) => b.totalGCI - a.totalGCI);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const SIDE_STYLES: Record<string, { label: string; cls: string }> = {
  buyer:  { label: "Buyer",  cls: "bg-blue-50 text-blue-700 border-blue-200" },
  seller: { label: "Seller", cls: "bg-purple-50 text-purple-700 border-purple-200" },
  both:   { label: "Both",   cls: "bg-teal-50 text-teal-700 border-teal-200" },
};

type SortCol = "name" | "deals" | "gci" | "avg" | "last" | "years" | "side";
type SortDir = "asc" | "desc";

function dominantSide(deals: ClientRecord[]): "buyer" | "seller" | "both" {
  const counts = { buyer: 0, seller: 0, both: 0 };
  deals.forEach((d) => { if (d.side) counts[d.side as keyof typeof counts]++; });
  return (Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]) as "buyer" | "seller" | "both";
}

function sortTableGroups(groups: ClientGroup[], col: SortCol, dir: SortDir): ClientGroup[] {
  return [...groups].sort((a, b) => {
    let cmp = 0;
    switch (col) {
      case "name":  cmp = a.name.localeCompare(b.name); break;
      case "deals": cmp = a.dealCount - b.dealCount; break;
      case "gci":   cmp = a.totalGCI - b.totalGCI; break;
      case "avg":   cmp = a.avgDeal - b.avgDeal; break;
      case "last":
        if (!a.lastDeal && !b.lastDeal) cmp = 0;
        else if (!a.lastDeal) cmp = 1;   // nulls to bottom
        else if (!b.lastDeal) cmp = -1;
        else cmp = a.lastDeal.localeCompare(b.lastDeal);
        break;
      case "years": cmp = a.years.length - b.years.length; break;
      case "side":  cmp = dominantSide(a.deals).localeCompare(dominantSide(b.deals)); break;
      default:      cmp = 0;
    }
    return dir === "asc" ? cmp : -cmp;
  });
}

function formatLastDeal(iso: string): string {
  try {
    return new Date(iso + "T12:00:00").toLocaleDateString("en-CA", {
      month: "short", year: "numeric",
    });
  } catch { return iso; }
}


// ─────────────────────────────────────────────────────────────────────────────

export function ClientsContent({ clients, records }: Props) {
  const [search, setSearch]             = useState("");
  const [filterSide, setFilterSide]     = useState<"all" | "buyer" | "seller" | "both">("all");
  const [filterSource, setFilterSource] = useState<string>("all");
  const [sortCol, setSortCol]           = useState<SortCol>("gci");
  const [sortDir, setSortDir]           = useState<SortDir>("desc");
  const [tab, setTab]                   = useState<"clients" | "insights">("clients");

  function handleSort(col: SortCol) {
    if (col === sortCol) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
  }

  // ── Core data ───────────────────────────────────────────────────────────────
  const grouped     = useMemo(() => buildAllGroups(clients, records), [clients, records]);
  const totalGCI    = useMemo(() => grouped.reduce((s, g) => s + g.totalGCI, 0), [grouped]);
  const repeatCount = grouped.filter((g) => g.dealCount > 1).length;
  const repeatRate  = grouped.length > 0 ? Math.round((repeatCount / grouped.length) * 100) : 0;
  const totalDeals  = grouped.reduce((s, g) => s + g.dealCount, 0);

  // Insights data
  const topClients  = useMemo(
    () => [...grouped].sort((a, b) => b.totalGCI - a.totalGCI).slice(0, 5),
    [grouped],
  );
  const sourceStats = useMemo(() => computeSourceStats(records), [records]);
  const topSource   = sourceStats[0] ?? null;

  // Concentration: top 1 / 3 / 5 as % of total GCI
  const sortedByGCI = useMemo(
    () => [...grouped].sort((a, b) => b.totalGCI - a.totalGCI),
    [grouped],
  );
  const concentrationPct = totalGCI > 0
    ? Math.round((sortedByGCI.slice(0, 5).reduce((s, g) => s + g.totalGCI, 0) / totalGCI) * 100)
    : 0;

  // Available sources for filter
  const sources = useMemo(
    () => [...new Set(records.map((r) => r.source).filter(Boolean) as string[])].sort(),
    [records],
  );

  // ── Filtered + sorted groups ─────────────────────────────────────────────
  const filtered = useMemo(() => {
    const f = grouped.filter((g) => {
      if (search) {
        const q = search.toLowerCase();
        if (!g.name.toLowerCase().includes(q) &&
            !g.deals.some((d) => d.address?.toLowerCase().includes(q))) return false;
      }
      if (filterSide !== "all" && !g.deals.some((d) => d.side === filterSide)) return false;
      if (filterSource !== "all" && !g.deals.some((d) => d.source === filterSource)) return false;
      return true;
    });
    return sortTableGroups(f, sortCol, sortDir);
  }, [grouped, search, filterSide, filterSource, sortCol, sortDir]);

  const hasAnyData = records.length > 0;

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
      {hasAnyData && (
        <div className="flex gap-1 border-b border-border/60 pb-0">
          {(["clients", "insights"] as const).map((t) => (
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
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
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
                const pct = totalGCI > 0 ? Math.round((c.totalGCI / totalGCI) * 100) : 0;
                return (
                  <div key={c.name} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={cn(
                          "text-[11px] font-bold w-5 text-center shrink-0",
                          i === 0 ? "text-amber-600" : "text-slate-400",
                        )}>#{i + 1}</span>
                        <span className="text-sm font-medium text-foreground truncate">{c.name}</span>
                        {c.dealCount > 1 && (
                          <Badge variant="outline" className="text-[9px] bg-violet-50 text-violet-700 border-violet-200 shrink-0 py-0">
                            ×{c.dealCount}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-xs text-muted-foreground">{pct}%</span>
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
                  const topN    = sortedByGCI.slice(0, n);
                  const topNGCI = topN.reduce((s, g) => s + g.totalGCI, 0);
                  const pct     = totalGCI > 0 ? Math.round((topNGCI / totalGCI) * 100) : 0;
                  const color   = pct > 60 ? "bg-amber-400" : pct > 40 ? "bg-blue-400" : "bg-emerald-400";
                  return (
                    <div key={n} className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground w-20 shrink-0">
                        Top {n} client{n !== 1 ? "s" : ""}
                      </span>
                      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className={cn("h-full rounded-full transition-all", color)}
                          style={{ width: `${Math.max(pct, 2)}%` }}
                        />
                      </div>
                      <span className="text-xs font-semibold tabular-nums w-8 text-right">{pct}%</span>
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
                        <th className="text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground pb-2 pr-4">Source</th>
                        <th className="text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground pb-2 px-3">Deals</th>
                        <th className="text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground pb-2 px-3">Total GCI</th>
                        <th className="text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground pb-2 pl-3">Avg / Deal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {sourceStats.map((s) => (
                        <tr key={s.source} className="group hover:bg-muted/30 transition-colors">
                          <td className="py-2 pr-4 font-medium text-foreground">{s.source}</td>
                          <td className="py-2 px-3 text-right tabular-nums text-muted-foreground">{s.deals}</td>
                          <td className="py-2 px-3 text-right tabular-nums font-semibold text-foreground">{fmtCurrency(s.totalGCI)}</td>
                          <td className="py-2 pl-3 text-right tabular-nums text-muted-foreground">{fmtCurrency(s.avgGCI)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {topSource && (
                  <p className="mt-3 text-xs text-muted-foreground border-t border-border/40 pt-3">
                    <span className="font-semibold text-foreground">{topSource.source}</span> is your top source —{" "}
                    {topSource.deals} deal{topSource.deals !== 1 ? "s" : ""} generating {fmtCurrency(topSource.totalGCI)}.
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Repeat client insight */}
          {grouped.length >= 3 && (
            <Card className={cn(
              "rounded-2xl shadow-sm",
              repeatRate >= 20
                ? "border-violet-200 bg-gradient-to-br from-violet-50 to-indigo-50"
                : "border-border",
            )}>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Star className={cn("h-4 w-4", repeatRate >= 20 ? "text-violet-500" : "text-muted-foreground")} />
                  Repeat Client Rate
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-3">
                <div className="flex items-end gap-3">
                  <p className="text-4xl font-bold tabular-nums text-foreground">{repeatRate}%</p>
                  <p className="text-sm text-muted-foreground pb-1">
                    {repeatCount} of {grouped.length} clients returned for another deal
                  </p>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      repeatRate >= 30 ? "bg-violet-500" : repeatRate >= 15 ? "bg-violet-400" : "bg-slate-300",
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
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Repeat Clients</p>
                    {grouped
                      .filter((g) => g.dealCount > 1)
                      .sort((a, b) => b.dealCount - a.dealCount)
                      .slice(0, 8)
                      .map((g) => (
                        <div key={g.name} className="flex items-center justify-between text-xs">
                          <span className="text-foreground font-medium truncate mr-2">{g.name}</span>
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
                      <option key={src} value={src}>{src}</option>
                    ))}
                  </select>
                </>
              )}
            </div>
          </div>

          {/* Sortable client table */}
          {!hasAnyData ? (
            <Card className="rounded-2xl border-slate-200 shadow-sm">
              <CardContent className="py-12 text-center text-muted-foreground">
                No clients yet. Import a brokerage report or career tracker from the History page to populate your client database.
              </CardContent>
            </Card>
          ) : (
            <Card className="rounded-2xl shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b border-border/60 hover:bg-transparent">
                      <SortableHead col="name"  label="Client"       active={sortCol} dir={sortDir} onSort={handleSort} className="pl-4" />
                      <SortableHead col="deals" label="Deals"        active={sortCol} dir={sortDir} onSort={handleSort} className="text-right" />
                      <SortableHead col="gci"   label="Lifetime GCI" active={sortCol} dir={sortDir} onSort={handleSort} className="text-right" />
                      <SortableHead col="avg"   label="Avg / Deal"   active={sortCol} dir={sortDir} onSort={handleSort} className="text-right" />
                      <SortableHead col="last"  label="Last Deal"    active={sortCol} dir={sortDir} onSort={handleSort} className="text-right" />
                      <SortableHead col="years" label="Years Active" active={sortCol} dir={sortDir} onSort={handleSort} />
                      <SortableHead col="side"  label="Side"         active={sortCol} dir={sortDir} onSort={handleSort} className="pr-4" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">
                          No clients match your search.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filtered.map((group) => {
                        const isRepeat = group.dealCount > 1;
                        const side     = dominantSide(group.deals);
                        const sideStyle = SIDE_STYLES[side];
                        return (
                          <TableRow
                            key={group.clientId ?? group.name}
                            className="hover:bg-muted/30 transition-colors"
                          >
                            {/* Client */}
                            <TableCell className="pl-4 py-3">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-semibold shrink-0">
                                  {group.name.charAt(0).toUpperCase()}
                                </div>
                                <span className="font-medium text-foreground text-sm truncate">
                                  {group.name}
                                </span>
                                {isRepeat && (
                                  <Badge variant="outline" className="text-[10px] bg-violet-50 text-violet-700 border-violet-200 shrink-0 py-0">
                                    ×{group.dealCount}
                                  </Badge>
                                )}
                              </div>
                            </TableCell>

                            {/* Deals */}
                            <TableCell className="text-right tabular-nums text-sm text-muted-foreground py-3">
                              {group.dealCount}
                            </TableCell>

                            {/* Lifetime GCI */}
                            <TableCell className="text-right tabular-nums text-sm font-semibold text-foreground py-3">
                              {fmtCurrency(group.totalGCI)}
                            </TableCell>

                            {/* Avg / Deal */}
                            <TableCell className="text-right tabular-nums text-sm text-muted-foreground py-3">
                              {fmtCurrency(group.avgDeal)}
                            </TableCell>

                            {/* Last Deal */}
                            <TableCell className="text-right text-sm text-muted-foreground py-3 whitespace-nowrap">
                              {group.lastDeal ? formatLastDeal(group.lastDeal) : "—"}
                            </TableCell>

                            {/* Years Active */}
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

                            {/* Side */}
                            <TableCell className="pr-4 py-3">
                              {sideStyle && (
                                <span className={cn(
                                  "text-[10px] font-semibold border rounded px-1.5 py-0.5 whitespace-nowrap",
                                  sideStyle.cls,
                                )}>
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

    </div>
  );
}

// ── Sortable table header cell ────────────────────────────────────────────────

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

// ── Summary KPI card ──────────────────────────────────────────────────────────

function SummaryCard({
  icon, label, value, sub, accent,
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
    <Card className={cn("rounded-2xl border shadow-sm bg-gradient-to-br to-card", accentMap[accent])}>
      <CardContent className="pt-4 pb-3 px-4">
        <div className="flex items-center gap-1.5 mb-1">
          {icon}
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
        </div>
        <p className="text-2xl font-bold text-foreground tabular-nums">{value}</p>
        <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>
      </CardContent>
    </Card>
  );
}
