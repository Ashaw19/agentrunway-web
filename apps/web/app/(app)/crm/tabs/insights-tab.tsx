"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Trophy,
  Star,
  PieChart,
  BarChart3,
  Award,
  DollarSign,
  Layers,
  Target,
  Users2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtCurrency, fmtCompact } from "@/lib/formatters";
import type {
  Client,
  ClientRecord,
  ContactActivity,
  ListingAppointment,
} from "@/lib/types/database";
import { computeSourceFunnel } from "@/lib/engines/crm-analytics-engine";
import { SummaryCard } from "../shared";

// ── Types ───────────────────────────────────────────────────────────────────

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

type SourceStat = { source: string; deals: number; totalGCI: number; avgGCI: number };

// ── Props ───────────────────────────────────────────────────────────────────

interface InsightsTabProps {
  clients: Client[];
  records: ClientRecord[];
  activities: ContactActivity[];
  grouped: ClientGroup[];
  totalGCI: number;
  sourceStats: SourceStat[];
  topSource: SourceStat | null;
  listingAppointments: ListingAppointment[];
}

// ── Component ───────────────────────────────────────────────────────────────

export function InsightsTab({
  clients,
  records,
  activities,
  grouped,
  totalGCI,
  sourceStats,
  topSource,
  listingAppointments,
}: InsightsTabProps) {
  // ── Source Funnel ─────────────────────────────────────────────────────────
  const funnel = useMemo(
    () => computeSourceFunnel(clients, records, activities),
    [clients, records, activities],
  );

  const sortedByGCI = useMemo(
    () => [...grouped].sort((a, b) => b.totalGCI - a.totalGCI),
    [grouped],
  );

  const topClients = useMemo(
    () => sortedByGCI.slice(0, 5),
    [sortedByGCI],
  );

  const concentrationPct =
    totalGCI > 0
      ? Math.round(
          (sortedByGCI.slice(0, 5).reduce((s, g) => s + g.totalGCI, 0) / totalGCI) * 100,
        )
      : 0;

  // Only clients who have closed at least one deal are eligible to be "repeat" clients.
  // Using the full CRM roster as the denominator inflates the rate with contacts who
  // have never transacted (pipeline leads, imports, etc.).
  // A "closed" deal requires a non-null close_date and must not be collapsed.
  const closedCount = (g: (typeof grouped)[number]) =>
    g.deals.filter((d) => d.close_date !== null && d.condition_status !== "collapsed").length;
  const transactionalClients = grouped.filter((g) => closedCount(g) >= 1);
  const repeatCount = transactionalClients.filter((g) => closedCount(g) > 1).length;
  const repeatRate = transactionalClients.length > 0
    ? Math.round((repeatCount / transactionalClients.length) * 100)
    : 0;

  // ── Listing Price Accuracy ──────────────────────────────────────────────────
  // Only computed when at least one appointment has both estimated and actual sale price.
  const listingAccuracy = useMemo(() => {
    const complete = listingAppointments.filter(
      (a) => a.estimated_list_price != null && a.actual_sale_price != null && a.actual_sale_price > 0,
    );
    if (!complete.length) return null;
    // Clamp at 0 so a wildly-off estimate (>2× actual) doesn't render as a negative %.
    const accuracies = complete.map((a) =>
      Math.max(
        0,
        (1 - Math.abs(a.estimated_list_price! - a.actual_sale_price!) / a.actual_sale_price!) * 100,
      ),
    );
    const avg = Math.round(accuracies.reduce((s, v) => s + v, 0) / accuracies.length);
    const best  = Math.round(Math.max(...accuracies));
    const worst = Math.round(Math.min(...accuracies));
    return { avg, best, worst, count: complete.length, total: listingAppointments.length };
  }, [listingAppointments]);

  // ── Buyer Pipeline ──────────────────────────────────────────────────────────
  // "Tracked buyer" = client with a pre-approval amount or a budget on file.
  // "Converted buyer" = tracked buyer who has at least one closed deal in records.
  const buyerPipeline = useMemo(() => {
    const tracked = clients.filter(
      (c) =>
        c.buyer_pre_approval_amount != null ||
        (c.property_interest_type === "budget" && c.property_interest != null),
    );
    if (!tracked.length) return null;
    const closedIds = new Set(records.map((r) => r.client_id));
    const converted  = tracked.filter((c) => closedIds.has(c.id)).length;
    const preApproved = tracked.filter((c) => c.buyer_pre_approved).length;
    const budgets = tracked
      .map((c) => c.buyer_pre_approval_amount ?? c.property_interest ?? 0)
      .filter((v) => v > 0);
    const avgBudget = budgets.length ? budgets.reduce((s, v) => s + v, 0) / budgets.length : 0;
    const conversionRate = Math.round((converted / tracked.length) * 100);
    return { total: tracked.length, preApproved, avgBudget, converted, conversionRate };
  }, [clients, records]);

  return (
    <div className="space-y-6">
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* NEW: Source Funnel Report                                          */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {funnel.rows.length > 0 && (
        <>
          <Card className="rounded-2xl border-indigo-200 bg-gradient-to-br from-indigo-50 to-violet-50 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-indigo-800 flex items-center gap-2">
                <Layers className="h-4 w-4 text-indigo-500" />
                Source Funnel Report
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-indigo-200/60">
                      <th className="text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground pb-2 pr-3">Source</th>
                      <th className="text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground pb-2 px-2">Leads</th>
                      <th className="text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground pb-2 px-2 w-24">→ Contacted</th>
                      <th className="text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground pb-2 px-2 w-24">→ Active</th>
                      <th className="text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground pb-2 px-2 w-24">→ Closed</th>
                      <th className="text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground pb-2 pl-2">GCI</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-indigo-100/60">
                    {funnel.rows.map((row) => (
                      <tr key={row.source} className="group hover:bg-indigo-50/40 transition-colors">
                        <td className="py-2.5 pr-3 font-medium text-foreground">{row.source}</td>
                        <td className="py-2.5 px-2 text-right tabular-nums text-muted-foreground">{row.totalLeads}</td>
                        <td className="py-2.5 px-2">
                          <div className="flex items-center gap-1.5">
                            <div className="flex-1 h-2 rounded-full bg-indigo-100 overflow-hidden">
                              <div className="h-full rounded-full bg-sky-400" style={{ width: `${Math.max(row.contactedPct, 2)}%` }} />
                            </div>
                            <span className="text-[10px] tabular-nums text-muted-foreground w-7 text-right">{row.contactedPct}%</span>
                          </div>
                        </td>
                        <td className="py-2.5 px-2">
                          <div className="flex items-center gap-1.5">
                            <div className="flex-1 h-2 rounded-full bg-indigo-100 overflow-hidden">
                              <div className="h-full rounded-full bg-amber-400" style={{ width: `${Math.max(row.activePct, 2)}%` }} />
                            </div>
                            <span className="text-[10px] tabular-nums text-muted-foreground w-7 text-right">{row.activePct}%</span>
                          </div>
                        </td>
                        <td className="py-2.5 px-2">
                          <div className="flex items-center gap-1.5">
                            <div className="flex-1 h-2 rounded-full bg-indigo-100 overflow-hidden">
                              <div className="h-full rounded-full bg-emerald-400" style={{ width: `${Math.max(row.closedPct, 2)}%` }} />
                            </div>
                            <span className="text-[10px] tabular-nums text-muted-foreground w-7 text-right">{row.closedPct}%</span>
                          </div>
                        </td>
                        <td className="py-2.5 pl-2 text-right tabular-nums font-semibold text-foreground">
                          {row.totalGCI > 0 ? fmtCurrency(row.totalGCI) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Source Comparison Cards */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <SummaryCard
              icon={<Award className="h-4 w-4 text-emerald-500" />}
              label="Best Converting"
              value={funnel.bestConverting ?? "—"}
              sub="highest close rate"
              accent="emerald"
            />
            <SummaryCard
              icon={<DollarSign className="h-4 w-4 text-amber-500" />}
              label="Highest GCI"
              value={funnel.highestGCI ?? "—"}
              sub="top revenue source"
              accent="amber"
            />
            <SummaryCard
              icon={<Layers className="h-4 w-4 text-violet-500" />}
              label="Sources Tracked"
              value={String(funnel.rows.length)}
              sub="with lead attribution"
              accent="violet"
            />
          </div>
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* EXISTING: Top 5 Clients by Lifetime GCI                           */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
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

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* EXISTING: Client Concentration                                     */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
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
              const pct = totalGCI > 0 ? Math.round((topNGCI / totalGCI) * 100) : 0;
              const color =
                pct > 60 ? "bg-amber-400" : pct > 40 ? "bg-blue-400" : "bg-emerald-400";
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

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* EXISTING: Lead Source Performance                                   */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
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
                <span className="font-semibold text-foreground">{topSource.source}</span>{" "}
                is your top source — {topSource.deals} deal{topSource.deals !== 1 ? "s" : ""}{" "}
                generating {fmtCurrency(topSource.totalGCI)}.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* EXISTING: Repeat Client Rate                                       */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {transactionalClients.length >= 2 && (
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
                {repeatCount} of {transactionalClients.length} clients with closed deals
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
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Repeat Clients
                </p>
                {grouped
                  .filter((g) => closedCount(g) > 1)
                  .sort((a, b) => closedCount(b) - closedCount(a))
                  .slice(0, 8)
                  .map((g) => (
                    <div key={g.name} className="flex items-center justify-between text-xs">
                      <span className="text-foreground font-medium truncate mr-2">{g.name}</span>
                      <span className="text-muted-foreground shrink-0">
                        {closedCount(g)} deals · {g.years.join(", ")}
                      </span>
                    </div>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* List-to-Sale Accuracy                                              */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {listingAccuracy && (
        <Card
          className={cn(
            "rounded-2xl shadow-sm",
            listingAccuracy.avg >= 95
              ? "border-orange-200 bg-gradient-to-br from-orange-50 to-amber-50"
              : "border-border",
          )}
        >
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Target className={cn("h-4 w-4", listingAccuracy.avg >= 95 ? "text-orange-500" : "text-muted-foreground")} />
              List-to-Sale Accuracy
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-3">
            <div className="flex items-end gap-3">
              <p className="text-4xl font-bold tabular-nums text-foreground">{listingAccuracy.avg}%</p>
              <p className="text-sm text-muted-foreground pb-1">avg across {listingAccuracy.count} tracked listing{listingAccuracy.count !== 1 ? "s" : ""}</p>
            </div>
            <p className="text-[11px] text-muted-foreground -mt-1">
              How close your CMA estimate landed vs the actual sale price.
            </p>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  listingAccuracy.avg >= 97 ? "bg-green-500" : listingAccuracy.avg >= 90 ? "bg-orange-400" : "bg-slate-300",
                )}
                style={{ width: `${Math.min(listingAccuracy.avg, 100)}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {listingAccuracy.avg >= 97
                ? "Exceptional pricing accuracy — your estimates closely match final sale prices."
                : listingAccuracy.avg >= 90
                ? "Good accuracy. Refining your CMA process could close the gap further."
                : "There is room to improve pricing estimates. Review market comps at appointment time."}
            </p>
            {listingAccuracy.count > 1 && (
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div className="text-xs">
                  <span className="text-muted-foreground">Best: </span>
                  <span className="font-medium text-green-600">{listingAccuracy.best}%</span>
                </div>
                <div className="text-xs">
                  <span className="text-muted-foreground">Worst: </span>
                  <span className={cn("font-medium", listingAccuracy.worst >= 90 ? "text-foreground" : "text-red-500")}>{listingAccuracy.worst}%</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* Buyer Pipeline                                                     */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {buyerPipeline && (
        <Card
          className={cn(
            "rounded-2xl shadow-sm",
            buyerPipeline.conversionRate >= 30
              ? "border-sky-200 bg-gradient-to-br from-sky-50 to-blue-50"
              : "border-border",
          )}
        >
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Users2 className={cn("h-4 w-4", buyerPipeline.conversionRate >= 30 ? "text-sky-500" : "text-muted-foreground")} />
              Buyer Pipeline
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-3xl font-bold tabular-nums text-foreground">{buyerPipeline.conversionRate}%</p>
                <p className="text-xs text-muted-foreground mt-0.5">conversion rate</p>
              </div>
              <div>
                <p className="text-3xl font-bold tabular-nums text-foreground">{fmtCompact(buyerPipeline.avgBudget)}</p>
                <p className="text-xs text-muted-foreground mt-0.5">avg buyer budget</p>
              </div>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  buyerPipeline.conversionRate >= 40 ? "bg-sky-500" : buyerPipeline.conversionRate >= 20 ? "bg-sky-400" : "bg-slate-300",
                )}
                style={{ width: `${Math.min(buyerPipeline.conversionRate, 100)}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{buyerPipeline.total} buyer{buyerPipeline.total !== 1 ? "s" : ""} tracked</span>
              <span>{buyerPipeline.converted} converted · {buyerPipeline.preApproved} pre-approved</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {buyerPipeline.conversionRate >= 40
                ? "Strong buyer conversion — your qualification process is working well."
                : buyerPipeline.conversionRate >= 20
                ? "Healthy conversion. Consistent follow-up on pre-approved buyers will grow this."
                : "Low conversion rate. Consider tightening buyer qualification at intake."}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
