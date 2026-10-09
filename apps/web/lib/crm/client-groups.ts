/**
 * Per-client deal totals for the CRM Clients page.
 *
 * One ClientGroup per client (plus one per unmatched deal-holder name) built
 * from client_records. Its totals feed the KPI strip (Lifetime GCI, avg / deal,
 * Total Deals), the Clients table, top clients, concentration %, achievement
 * badges, client tiers (computeClientValuations) and the closing-gift budget.
 *
 * Which deals count (dashboard-integrity-champion, 2026-10-09): every deal
 * except Collapsed ones, via the core excludeCollapsedDeals(). A collapsed deal
 * never closed, so it adds no GCI, no deal, no year and no badge, and it can't
 * size a closing gift. It stays in `deals` so Deal History still lists it and
 * its status can be changed back. Undated deals DO count: client_records only
 * come from history imports, so a missing close_date means the source sheet
 * had no date, not that the deal is still open. They are left off only what
 * needs a date (lastDeal, the GCI sparkline, anniversaries).
 */

import {
  excludeCollapsedDeals,
  type Client,
  type ClientRecord,
  type ClientRecordCoParty,
} from "@agent-runway/core/types/database";
import { toNameSearch } from "@/lib/crm/client-identity";
import { computeHouseholdActivityIds } from "@/lib/crm/resolve-deal-clients";

export type ClientGroup = {
  clientId: string | null;
  name: string;
  /** Every deal row, collapsed included (Deal History lists them all). */
  deals: ClientRecord[];
  /** Counted totals: collapsed deals excluded. */
  totalGCI: number;
  dealCount: number;
  avgDeal: number;
  lastDeal: string | null;
  years: number[];
  hasHouseholdActivity: boolean;
};

export type SourceStat = { source: string; deals: number; totalGCI: number; avgGCI: number };

export type AchievementBadgeId = "high_yield" | "frequent_flyer" | "silver_wings" | "tailwind_club" | "first_class";

export function buildAllGroups(
  clients: Client[],
  records: ClientRecord[],
  coParties: ClientRecordCoParty[],
): ClientGroup[] {
  const nameToId = new Map(clients.map((c) => [c.name_search, c.id]));
  const householdActivityIds = computeHouseholdActivityIds(coParties);

  const buckets = new Map<string, ClientRecord[]>();

  for (const r of records) {
    const key =
      r.client_id ??
      nameToId.get(toNameSearch(r.name)) ??
      `__v__${toNameSearch(r.name)}`;
    const b = buckets.get(key) ?? [];
    b.push(r);
    buckets.set(key, b);
  }

  const groups: ClientGroup[] = [];

  for (const client of clients) {
    const deals = buckets.get(client.id) ?? [];
    // Always include — clients with no records (e.g. FUB imports) must still appear
    groups.push(buildClientGroup(client.id, client.name, deals, householdActivityIds.has(client.id)));
  }

  for (const [key, deals] of buckets) {
    if (key.startsWith("__v__")) {
      groups.push(buildClientGroup(null, deals[0].name, deals, false));
    }
  }

  // Sort by GCI desc; break ties alphabetically so contacts-only clients are ordered
  return groups.sort((a, b) => {
    if (b.totalGCI !== a.totalGCI) return b.totalGCI - a.totalGCI;
    return a.name.localeCompare(b.name);
  });
}

export function buildClientGroup(
  clientId: string | null,
  name: string,
  deals: ClientRecord[],
  hasHouseholdActivity: boolean,
): ClientGroup {
  const counted = excludeCollapsedDeals(deals);
  const totalGCI =
    Math.round(counted.reduce((s, d) => s + (d.gci ?? 0), 0) * 100) / 100;
  const dealCount = counted.length;
  const avgDeal = dealCount > 0 ? Math.round(totalGCI / dealCount) : 0;
  const sortedDates = counted
    .map((d) => d.close_date)
    .filter((d): d is string => !!d)
    .sort()
    .reverse();
  const lastDeal = sortedDates[0] ?? null;
  const years = [
    ...new Set(
      counted.map((d) => d.year).filter((y): y is number => y !== null),
    ),
  ].sort((a, b) => b - a);
  return { clientId, name, deals, totalGCI, dealCount, avgDeal, lastDeal, years, hasHouseholdActivity };
}

export function computeSourceStats(records: ClientRecord[]): SourceStat[] {
  // Filter first: a source whose only deal collapsed must not appear with 0
  // deals (avgGCI would divide by zero).
  const map = new Map<string, { deals: number; totalGCI: number }>();
  for (const r of excludeCollapsedDeals(records)) {
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

/**
 * GCI the closing-gift budget is sized from: the most recent dated deal that
 * counts, falling back to the average counted deal (undated history only).
 * null = no budget (no deals, or every deal collapsed).
 */
export function rewardBudgetBasisGci(deals: ClientRecord[]): number | null {
  const counted = excludeCollapsedDeals(deals);
  if (!counted.length) return null;
  const latestDated = counted
    .filter((d) => d.close_date)
    .sort((a, b) => (b.close_date ?? "").localeCompare(a.close_date ?? ""))[0];
  return latestDated?.gci ?? counted.reduce((s, d) => s + (d.gci ?? 0), 0) / counted.length;
}

/** Achievement badges a client has earned, in display order. */
export function achievementBadgeIds(
  group: Pick<ClientGroup, "deals" | "dealCount" | "totalGCI">,
  firstClassThreshold: number,
): AchievementBadgeId[] {
  const ids: AchievementBadgeId[] = [];
  if (excludeCollapsedDeals(group.deals).some((d) => d.gci >= 10_000)) ids.push("high_yield");
  if (group.dealCount >= 2)  ids.push("frequent_flyer");
  if (group.dealCount >= 5)  ids.push("silver_wings");
  if (group.dealCount >= 10) ids.push("tailwind_club");
  if (group.totalGCI >= firstClassThreshold && firstClassThreshold > 0)
    ids.push("first_class");
  return ids;
}

/** Top-5% lifetime-GCI cut across ALL clients (the First Class badge). */
export function firstClassThreshold(groups: ClientGroup[]): number {
  if (groups.length === 0) return 0;
  const sorted = [...groups].sort((a, b) => b.totalGCI - a.totalGCI);
  const idx = Math.max(0, Math.ceil(sorted.length * 0.05) - 1);
  return sorted[idx]?.totalGCI ?? 0;
}

/**
 * Repeat rate. Only clients with at least one deal are in the denominator, so
 * contacts who never transacted (leads, sphere imports) don't dilute it.
 */
export function repeatClientStats(groups: ClientGroup[]): {
  transactionalClients: number;
  repeatCount: number;
  repeatRate: number;
} {
  // dealCount already excludes collapsed deals and keeps undated ones, so the
  // repeat rate and the Total Deals / Lifetime GCI beside it count the same deals.
  const transactional = groups.filter((g) => g.dealCount >= 1);
  const repeatCount = transactional.filter((g) => g.dealCount > 1).length;
  return {
    transactionalClients: transactional.length,
    repeatCount,
    repeatRate: transactional.length > 0 ? Math.round((repeatCount / transactional.length) * 100) : 0,
  };
}
