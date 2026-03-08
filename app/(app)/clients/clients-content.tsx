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
} from "lucide-react";
import { fmtCurrency } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import type { ClientRecord } from "@/lib/types/database";

interface Props {
  clients: ClientRecord[];
}

// ── Types ─────────────────────────────────────────────────────────────────────

type ClientGroup = {
  name: string;
  deals: ClientRecord[];
  totalGCI: number;
  dealCount: number;
};

// ── Group individual deal records by (normalised) client name ────────────────
function groupClients(records: ClientRecord[]): ClientGroup[] {
  const map = new Map<string, ClientGroup>();
  for (const r of records) {
    const key = r.name.trim().toLowerCase();
    if (!map.has(key)) map.set(key, { name: r.name, deals: [], totalGCI: 0, dealCount: 0 });
    const g = map.get(key)!;
    g.deals.push(r);
    g.totalGCI  = Math.round((g.totalGCI + (r.gci ?? 0)) * 100) / 100;
    g.dealCount++;
  }
  // Default sort: most GCI first
  return Array.from(map.values()).sort((a, b) => b.totalGCI - a.totalGCI);
}

// ── Source insights ───────────────────────────────────────────────────────────
type SourceStat = {
  source: string;
  deals: number;
  totalGCI: number;
  avgGCI: number;
};

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

// ── Side badge config ─────────────────────────────────────────────────────────
const SIDE_STYLES: Record<string, { label: string; cls: string }> = {
  buyer:  { label: "Buyer",  cls: "bg-teal-50 text-teal-700 border-teal-200" },
  seller: { label: "Seller", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  both:   { label: "Both",   cls: "bg-violet-50 text-violet-700 border-violet-200" },
};

// ── Sort options ──────────────────────────────────────────────────────────────
type SortKey = "gci" | "deals" | "recent" | "name";

function sortGroups(groups: ClientGroup[], sort: SortKey): ClientGroup[] {
  return [...groups].sort((a, b) => {
    switch (sort) {
      case "gci":    return b.totalGCI - a.totalGCI;
      case "deals":  return b.dealCount - a.dealCount;
      case "recent": {
        const aYear = Math.max(...a.deals.map((d) => d.year ?? 0));
        const bYear = Math.max(...b.deals.map((d) => d.year ?? 0));
        return bYear !== aYear ? bYear - aYear : a.name.localeCompare(b.name);
      }
      case "name":   return a.name.localeCompare(b.name);
      default:       return 0;
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────

export function ClientsContent({ clients }: Props) {
  const [search, setSearch]           = useState("");
  const [filterSide, setFilterSide]   = useState<"all" | "buyer" | "seller" | "both">("all");
  const [filterSource, setFilterSource] = useState<string>("all");
  const [sortKey, setSortKey]         = useState<SortKey>("gci");
  const [tab, setTab]                 = useState<"clients" | "insights">("clients");

  // ── Aggregates ──────────────────────────────────────────────────────────────
  const totalGCI    = clients.reduce((s, r) => s + (r.gci ?? 0), 0);
  const grouped     = useMemo(() => groupClients(clients), [clients]);
  const repeatCount = grouped.filter((g) => g.dealCount > 1).length;
  const repeatRate  = grouped.length > 0 ? Math.round((repeatCount / grouped.length) * 100) : 0;

  // Top clients by GCI
  const topClients  = useMemo(() => [...grouped].sort((a, b) => b.totalGCI - a.totalGCI).slice(0, 5), [grouped]);

  // Source stats
  const sourceStats = useMemo(() => computeSourceStats(clients), [clients]);
  const topSource   = sourceStats[0] ?? null;

  // Unique sources for filter
  const sources = useMemo(() => {
    const s = new Set(clients.map((r) => r.source).filter(Boolean) as string[]);
    return Array.from(s).sort();
  }, [clients]);

  // ── Filtered + sorted groups ─────────────────────────────────────────────
  const filtered = useMemo(() => {
    const f = grouped.filter((g) => {
      if (search) {
        const q = search.toLowerCase();
        if (!g.name.toLowerCase().includes(q) &&
            !g.deals.some((d) => d.address?.toLowerCase().includes(q))) return false;
      }
      if (filterSide !== "all") {
        if (!g.deals.some((d) => d.side === filterSide)) return false;
      }
      if (filterSource !== "all") {
        if (!g.deals.some((d) => d.source === filterSource)) return false;
      }
      return true;
    });
    return sortGroups(f, sortKey);
  }, [grouped, search, filterSide, filterSource, sortKey]);

  return (
    <div className="space-y-6">
      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-b border-border/60 pb-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Clients</h1>
          <p className="text-sm text-muted-foreground">
            Everyone you&apos;ve served — imported from your history and brokerage reports.
          </p>
        </div>
      </div>

      {/* ── Summary KPI strip ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard
          icon={<Users className="h-4 w-4 text-blue-500" />}
          label="Total Clients"
          value={String(grouped.length)}
          sub="unique names"
          accent="blue"
        />
        <SummaryCard
          icon={<RepeatIcon className="h-4 w-4 text-violet-500" />}
          label="Repeat Clients"
          value={`${repeatCount} (${repeatRate}%)`}
          sub="more than one deal"
          accent="violet"
        />
        <SummaryCard
          icon={<TrendingUp className="h-4 w-4 text-emerald-500" />}
          label="Total GCI"
          value={fmtCurrency(totalGCI)}
          sub="from all imported deals"
          accent="emerald"
        />
        <SummaryCard
          icon={<Home className="h-4 w-4 text-amber-500" />}
          label="Total Deals"
          value={String(clients.length)}
          sub="deal records saved"
          accent="amber"
        />
      </div>

      {/* ── Tabs ─────────────────────────────────────────────────────────── */}
      {clients.length > 0 && (
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
      {/* INSIGHTS TAB */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {tab === "insights" && clients.length > 0 && (
        <div className="space-y-6">

          {/* Top 5 clients by GCI */}
          <Card className="rounded-2xl border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-amber-800 flex items-center gap-2">
                <Trophy className="h-4 w-4 text-amber-500" />
                Top Clients by GCI
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
                        <span className="text-sm font-bold text-foreground tabular-nums">{fmtCurrency(c.totalGCI)}</span>
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

          {/* Source performance */}
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
                    <span className="font-semibold text-foreground">{topSource.source}</span> is your top source — {topSource.deals} deal{topSource.deals !== 1 ? "s" : ""} generating {fmtCurrency(topSource.totalGCI)} in GCI.
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Repeat client insight */}
          {grouped.length >= 3 && (
            <Card className={cn(
              "rounded-2xl shadow-sm",
              repeatRate >= 20 ? "border-violet-200 bg-gradient-to-br from-violet-50 to-indigo-50" : "border-border",
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
                    {repeatCount} of {grouped.length} clients came back for more
                  </p>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className={cn("h-full rounded-full transition-all", repeatRate >= 30 ? "bg-violet-500" : repeatRate >= 15 ? "bg-violet-400" : "bg-slate-300")}
                    style={{ width: `${Math.min(repeatRate, 100)}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {repeatRate >= 30
                    ? "Excellent loyalty — your clients keep coming back."
                    : repeatRate >= 15
                    ? "Good repeat rate. Nurturing past clients could grow this further."
                    : "Opportunity to build more repeat business through follow-ups and stay-in-touch strategies."}
                </p>
                {repeatCount > 0 && (
                  <div className="pt-1 space-y-1">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Repeat Clients</p>
                    {grouped
                      .filter((g) => g.dealCount > 1)
                      .sort((a, b) => b.dealCount - a.dealCount)
                      .slice(0, 8)
                      .map((g) => {
                        const years = [...new Set(g.deals.map((d) => d.year).filter(Boolean))].sort((a, b) => (b ?? 0) - (a ?? 0));
                        return (
                          <div key={g.name} className="flex items-center justify-between text-xs">
                            <span className="text-foreground font-medium truncate mr-2">{g.name}</span>
                            <span className="text-muted-foreground shrink-0">
                              {g.dealCount} deals · {years.join(", ")}
                            </span>
                          </div>
                        );
                      })}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* CLIENTS TAB */}
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

            {/* Side filter pills */}
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
                {clients.length === 0
                  ? "No clients yet. Import a brokerage report or career tracker from the History page to populate your client database."
                  : "No clients match your search."}
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((group) => {
                const years   = [...new Set(group.deals.map((d) => d.year).filter(Boolean))].sort((a, b) => (b ?? 0) - (a ?? 0));
                const srcs    = [...new Set(group.deals.map((d) => d.source).filter(Boolean))];
                const sides   = [...new Set(group.deals.map((d) => d.side).filter(Boolean))];
                const isRepeat = group.dealCount > 1;

                return (
                  <Card
                    key={group.name}
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
                          .sort((a, b) => (b.year ?? 0) - (a.year ?? 0))
                          .map((deal, di) => (
                            <div key={di} className="flex items-start justify-between gap-2 text-[11px]">
                              <div className="min-w-0">
                                <p className="text-foreground/80 truncate">
                                  {deal.address ?? "—"}
                                </p>
                                <p className="text-muted-foreground">
                                  {deal.year}{deal.close_date ? ` · ${formatDate(deal.close_date)}` : ""}
                                  {deal.source ? ` · ${deal.source}` : ""}
                                </p>
                              </div>
                              <span className="font-semibold text-foreground/90 tabular-nums shrink-0">
                                {fmtCurrency(deal.gci ?? 0)}
                              </span>
                            </div>
                          ))}
                      </div>

                      {/* Footer stats for repeat clients */}
                      {group.dealCount > 1 && (
                        <div className="border-t border-border/40 pt-2 flex items-center justify-between text-[11px]">
                          <span className="text-muted-foreground">
                            {group.dealCount} deals · {years.join(", ")}
                          </span>
                          <span className="font-bold text-foreground tabular-nums">
                            {fmtCurrency(group.totalGCI)}
                          </span>
                        </div>
                      )}

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

      {/* Empty state (no data at all) */}
      {clients.length === 0 && (
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
        <div className="flex items-center gap-1.5 mb-1">{icon}<span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span></div>
        <p className="text-2xl font-bold text-foreground tabular-nums">{value}</p>
        <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>
      </CardContent>
    </Card>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  try {
    return new Date(iso + "T12:00:00").toLocaleDateString("en-CA", { month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}
