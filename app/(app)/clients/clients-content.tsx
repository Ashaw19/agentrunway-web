"use client";

import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
  buyer:  { label: "Buyer",  cls: "bg-teal-50 text-teal-700 border-teal-200" },
  seller: { label: "Seller", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  both:   { label: "Both",   cls: "bg-violet-50 text-violet-700 border-violet-200" },
};

type SortKey = "gci" | "deals" | "recent" | "name";

function sortGroups(groups: ClientGroup[], sort: SortKey): ClientGroup[] {
  return [...groups].sort((a, b) => {
    switch (sort) {
      case "gci":    return b.totalGCI - a.totalGCI;
      case "deals":  return b.dealCount - a.dealCount;
      case "recent": return (b.lastDeal ?? "").localeCompare(a.lastDeal ?? "");
      case "name":   return a.name.localeCompare(b.name);
      default:       return 0;
    }
  });
}

function formatDate(iso: string) {
  try {
    return new Date(iso + "T12:00:00").toLocaleDateString("en-CA", {
      month: "short", day: "numeric", year: "numeric",
    });
  } catch { return iso; }
}

// ─────────────────────────────────────────────────────────────────────────────

export function ClientsContent({ clients, records }: Props) {
  const [search, setSearch]             = useState("");
  const [filterSide, setFilterSide]     = useState<"all" | "buyer" | "seller" | "both">("all");
  const [filterSource, setFilterSource] = useState<string>("all");
  const [sortKey, setSortKey]           = useState<SortKey>("gci");
  const [tab, setTab]                   = useState<"clients" | "insights">("clients");

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
    return sortGroups(f, sortKey);
  }, [grouped, search, filterSide, filterSource, sortKey]);

  const hasAnyData = records.length > 0;

  return (
    <div className="space-y-6">
      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-b border-border/60 pb-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Clients</h1>
          <p className="text-sm text-muted-foreground">
            Client value intelligence — your most valuable relationships, by the numbers.
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
                    ? `Your top 5 clients generate ${concentrationPct}% of your GCI. Strong relationships, but consider broadening your base.`
                    : concentrationPct > 40
                    ? `Your top 5 clients generate ${concentrationPct}% of your GCI — moderately concentrated.`
                    : `Well-diversified. Your top 5 clients account for ${concentrationPct}% of GCI — no over-reliance on any single relationship.`}
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
              <span className="text-muted-foreground/40 text-xs">|</span>
              <select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as SortKey)}
                className="rounded-full px-3 py-1 text-xs font-semibold border border-border bg-card text-muted-foreground hover:border-primary/40 transition-colors cursor-pointer outline-none"
              >
                <option value="gci">Sort: Most GCI</option>
                <option value="deals">Sort: Most Deals</option>
                <option value="recent">Sort: Most Recent</option>
                <option value="name">Sort: Name A–Z</option>
              </select>
            </div>
          </div>

          {/* Client cards */}
          {filtered.length === 0 ? (
            <Card className="rounded-2xl border-slate-200 shadow-sm">
              <CardContent className="py-12 text-center text-muted-foreground">
                {!hasAnyData
                  ? "No clients yet. Import a brokerage report or career tracker from the History page to populate your client database."
                  : "No clients match your search."}
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((group) => {
                const sides   = [...new Set(group.deals.map((d) => d.side).filter(Boolean))];
                const srcs    = [...new Set(group.deals.map((d) => d.source).filter(Boolean))];
                const isRepeat = group.dealCount > 1;

                return (
                  <Card
                    key={group.clientId ?? group.name}
                    className={cn(
                      "rounded-2xl shadow-sm border transition-shadow hover:shadow-md",
                      isRepeat ? "border-violet-200" : "border-border",
                    )}
                  >
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-sm font-semibold text-foreground leading-snug">
                          {group.name}
                        </CardTitle>
                        {isRepeat && (
                          <Badge variant="outline" className="text-[10px] bg-violet-50 text-violet-700 border-violet-200 shrink-0">
                            Repeat
                          </Badge>
                        )}
                      </div>
                      {sides.length > 0 && (
                        <div className="flex gap-1 flex-wrap mt-0.5">
                          {sides.map((side) => {
                            if (!side) return null;
                            const style = SIDE_STYLES[side];
                            return style ? (
                              <span key={side} className={cn("text-[10px] font-semibold border rounded px-1.5 py-0.5", style.cls)}>
                                {style.label}
                              </span>
                            ) : null;
                          })}
                        </div>
                      )}
                    </CardHeader>

                    <CardContent className="space-y-2 pt-0">
                      {/* Deal rows */}
                      <div className="space-y-1.5">
                        {group.deals
                          .sort((a, b) => (b.close_date ?? "").localeCompare(a.close_date ?? ""))
                          .map((deal, di) => (
                            <div key={di} className="flex items-start justify-between gap-2 text-[11px]">
                              <div className="min-w-0">
                                <p className="text-foreground/80 truncate">{deal.address ?? "—"}</p>
                                <p className="text-muted-foreground">
                                  {deal.year}
                                  {deal.close_date ? ` · ${formatDate(deal.close_date)}` : ""}
                                  {deal.source ? ` · ${deal.source}` : ""}
                                </p>
                              </div>
                              <span className="font-semibold text-foreground/90 tabular-nums shrink-0">
                                {fmtCurrency(deal.gci ?? 0)}
                              </span>
                            </div>
                          ))}
                      </div>

                      {/* Lifetime stats footer (always shown — even single deal shows avg context) */}
                      <div className={cn(
                        "pt-2 flex items-center justify-between text-[11px]",
                        group.dealCount > 1 && "border-t border-border/40",
                      )}>
                        <span className="text-muted-foreground">
                          {group.dealCount > 1
                            ? `${group.dealCount} deals · avg ${fmtCurrency(group.avgDeal)}`
                            : `avg ${fmtCurrency(group.avgDeal)} / deal`}
                          {group.years.length > 1 && ` · ${group.years[group.years.length - 1]}–${group.years[0]}`}
                        </span>
                        {group.dealCount > 1 && (
                          <span className="font-bold text-foreground tabular-nums">
                            {fmtCurrency(group.totalGCI)}
                          </span>
                        )}
                      </div>

                      {/* Source badges */}
                      {srcs.length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-0.5">
                          {srcs.map((src) => src && (
                            <span key={src} className="text-[10px] text-slate-500 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5">
                              {src}
                            </span>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Empty state */}
      {!hasAnyData && (
        <Card className="rounded-2xl border-slate-200 shadow-sm">
          <CardContent className="py-12 text-center text-muted-foreground">
            No clients yet. Import a brokerage report or career tracker from the History page to populate your client database.
          </CardContent>
        </Card>
      )}
    </div>
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
