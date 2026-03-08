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
} from "lucide-react";
import { fmtCurrency } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import type { ClientRecord } from "@/lib/types/database";

interface Props {
  clients: ClientRecord[];
}

// Group individual deal records by (normalised) client name so repeat
// clients appear as a single card with their full deal history.
function groupClients(records: ClientRecord[]) {
  const map = new Map<string, { name: string; deals: ClientRecord[] }>();
  for (const r of records) {
    const key = r.name.trim().toLowerCase();
    if (!map.has(key)) map.set(key, { name: r.name, deals: [] });
    map.get(key)!.deals.push(r);
  }
  return Array.from(map.values()).sort((a, b) => {
    // Sort by most recent deal year desc, then name
    const aYear = Math.max(...a.deals.map((d) => d.year ?? 0));
    const bYear = Math.max(...b.deals.map((d) => d.year ?? 0));
    if (bYear !== aYear) return bYear - aYear;
    return a.name.localeCompare(b.name);
  });
}

const SIDE_STYLES: Record<string, { label: string; cls: string }> = {
  buyer:  { label: "Buyer",  cls: "bg-teal-50 text-teal-700 border-teal-200" },
  seller: { label: "Seller", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  both:   { label: "Both",   cls: "bg-violet-50 text-violet-700 border-violet-200" },
};

export function ClientsContent({ clients }: Props) {
  const [search, setSearch] = useState("");
  const [filterSide, setFilterSide] = useState<"all" | "buyer" | "seller" | "both">("all");
  const [filterSource, setFilterSource] = useState<string>("all");

  // Aggregate stats
  const totalGCI    = clients.reduce((s, r) => s + (r.gci ?? 0), 0);
  const grouped     = useMemo(() => groupClients(clients), [clients]);
  const repeatCount = grouped.filter((g) => g.deals.length > 1).length;

  // Unique sources for filter pill
  const sources = useMemo(() => {
    const s = new Set(clients.map((r) => r.source).filter(Boolean) as string[]);
    return Array.from(s).sort();
  }, [clients]);

  // Filtered groups
  const filtered = useMemo(() => {
    return grouped.filter((g) => {
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
  }, [grouped, search, filterSide, filterSource]);

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

      {/* ── Summary KPI strip ─────────────────────────────────────────────── */}
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
          value={String(repeatCount)}
          sub="dealt with more than once"
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

      {/* ── Search + filters ──────────────────────────────────────────────── */}
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
        </div>
      </div>

      {/* ── Client cards ──────────────────────────────────────────────────── */}
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
            const totalGCI = group.deals.reduce((s, d) => s + (d.gci ?? 0), 0);
            const years    = [...new Set(group.deals.map((d) => d.year).filter(Boolean))].sort((a, b) => (b ?? 0) - (a ?? 0));
            const sources  = [...new Set(group.deals.map((d) => d.source).filter(Boolean))];
            const sides    = [...new Set(group.deals.map((d) => d.side).filter(Boolean))];
            const isRepeat = group.deals.length > 1;

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

                  {/* Footer stats */}
                  {group.deals.length > 1 && (
                    <div className="border-t border-border/40 pt-2 flex items-center justify-between text-[11px]">
                      <span className="text-muted-foreground">
                        {group.deals.length} deals · {years.join(", ")}
                      </span>
                      <span className="font-bold text-foreground tabular-nums">
                        {fmtCurrency(totalGCI)}
                      </span>
                    </div>
                  )}

                  {sources.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-0.5">
                      {sources.map((src) => src && (
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
