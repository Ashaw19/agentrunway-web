// ============================================================================
// CRM Analytics Engine
// Pure-function engine: outreach KPIs, contact frequency, overdue detection,
// speed-to-lead, and source funnel computations.
// ============================================================================

import type {
  Client,
  ClientRecord,
  ContactActivity,
  ActivityType,
  ClientStatus,
} from "../types/database";

// ── Input / Output Types ────────────────────────────────────────────────────

export interface CrmDashboardInput {
  clients: Client[];
  activities: ContactActivity[];
  records: ClientRecord[];
  periodDays: number; // 30 | 60 | 90
}

export interface CrmDashboardResult {
  kpis: {
    totalTouchpoints: number;
    avgContactsPerClient: number;
    overdueCount: number;
    touchpointTrend: number; // % vs prior period, positive = up
  };
  frequencyBuckets: FrequencyBucket[];
  overdueClients: OverdueClient[];
  activityBreakdown: ActivityBreakdownItem[];
}

export interface FrequencyBucket {
  label: string;
  count: number;
  pct: number;
}

export interface OverdueClient {
  clientId: string;
  name: string;
  daysSinceContact: number;
  lastActivityType: ActivityType | null;
  lastContactDate: string | null;
  status: ClientStatus;
}

export interface ActivityBreakdownItem {
  type: ActivityType;
  label: string;
  count: number;
  pct: number;
}

// Speed to Lead

export interface SpeedToLeadResult {
  kpis: {
    medianResponseHours: number | null;
    bestResponseHours: number | null;
    worstResponseHours: number | null;
    pctWithin1Hour: number;
    pctWithin24Hours: number;
    totalMeasurable: number;
  };
  bySource: SpeedBySource[];
}

export interface SpeedBySource {
  source: string;
  avgResponseHours: number;
  count: number;
}

// Source Funnel

export interface SourceFunnelResult {
  rows: SourceFunnelRow[];
  bestConverting: string | null;
  highestGCI: string | null;
}

export interface SourceFunnelRow {
  source: string;
  totalLeads: number;
  contacted: number;
  contactedPct: number;
  active: number;
  activePct: number;
  closed: number;
  closedPct: number;
  totalGCI: number;
  avgGCI: number;
}

// ── Activity type labels (kept in sync with database.ts) ────────────────────

const ACTIVITY_LABELS: Record<ActivityType, string> = {
  call: "Call",
  email: "Email",
  text: "Text",
  showing: "Showing",
  meeting: "Meeting",
  offer: "Offer",
  note: "Note",
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function daysBetween(a: Date, b: Date): number {
  return Math.floor(Math.abs(a.getTime() - b.getTime()) / 86_400_000);
}

function hoursBetween(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / 3_600_000;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

// ── 1. CRM Dashboard ───────────────────────────────────────────────────────

export function computeCrmDashboard(input: CrmDashboardInput): CrmDashboardResult {
  const { clients, activities, periodDays } = input;
  const now = new Date();

  // Cutoff for current period
  const periodStart = new Date(now);
  periodStart.setDate(periodStart.getDate() - periodDays);

  // Prior period for trend comparison
  const priorStart = new Date(periodStart);
  priorStart.setDate(priorStart.getDate() - periodDays);

  // Activities in current & prior periods
  const currentActivities = activities.filter(
    (a) => new Date(a.activity_date) >= periodStart,
  );
  const priorActivities = activities.filter((a) => {
    const d = new Date(a.activity_date);
    return d >= priorStart && d < periodStart;
  });

  // KPIs
  const totalTouchpoints = currentActivities.length;
  const clientsWithActivity = new Set(currentActivities.map((a) => a.client_id));
  const avgContactsPerClient =
    clientsWithActivity.size > 0
      ? Math.round((totalTouchpoints / clientsWithActivity.size) * 10) / 10
      : 0;

  const touchpointTrend =
    priorActivities.length > 0
      ? Math.round(
          ((totalTouchpoints - priorActivities.length) /
            priorActivities.length) *
            100,
        )
      : totalTouchpoints > 0
      ? 100
      : 0;

  // Overdue: clients with no activity in 30+ days (among non-landed/cruising)
  const lastActivityByClient = new Map<string, Date>();
  for (const a of activities) {
    const d = new Date(a.activity_date);
    const existing = lastActivityByClient.get(a.client_id);
    if (!existing || d > existing) {
      lastActivityByClient.set(a.client_id, d);
    }
  }

  const lastActivityTypeByClient = new Map<string, ActivityType>();
  // Activities are assumed sorted desc, so the first found per client is latest
  for (const a of activities) {
    if (!lastActivityTypeByClient.has(a.client_id)) {
      lastActivityTypeByClient.set(a.client_id, a.type);
    }
  }

  const activeStatuses: ClientStatus[] = ["boarding", "taxiing", "in_flight"];
  const overdueClients: OverdueClient[] = [];

  for (const client of clients) {
    if (!activeStatuses.includes(client.status)) continue;

    const lastDate = lastActivityByClient.get(client.id);
    const daysSince = lastDate ? daysBetween(now, lastDate) : 999;

    if (daysSince >= 30) {
      overdueClients.push({
        clientId: client.id,
        name: client.name,
        daysSinceContact: daysSince,
        lastActivityType: lastActivityTypeByClient.get(client.id) ?? null,
        lastContactDate: lastDate ? lastDate.toISOString().slice(0, 10) : null,
        status: client.status,
      });
    }
  }

  overdueClients.sort((a, b) => b.daysSinceContact - a.daysSinceContact);

  // Contact frequency distribution per client in the period
  const contactCounts = new Map<string, number>();
  for (const c of clients) {
    contactCounts.set(c.id, 0);
  }
  for (const a of currentActivities) {
    contactCounts.set(a.client_id, (contactCounts.get(a.client_id) ?? 0) + 1);
  }

  const bucketDefs: { label: string; min: number; max: number }[] = [
    { label: "0", min: 0, max: 0 },
    { label: "1–2", min: 1, max: 2 },
    { label: "3–5", min: 3, max: 5 },
    { label: "6+", min: 6, max: Infinity },
  ];

  const totalClients = clients.length || 1;
  const frequencyBuckets: FrequencyBucket[] = bucketDefs.map((b) => {
    const count = [...contactCounts.values()].filter(
      (n) => n >= b.min && n <= b.max,
    ).length;
    return {
      label: b.label,
      count,
      pct: Math.round((count / totalClients) * 100),
    };
  });

  // Activity breakdown by type in period
  const typeCounts = new Map<ActivityType, number>();
  for (const a of currentActivities) {
    typeCounts.set(a.type, (typeCounts.get(a.type) ?? 0) + 1);
  }

  const totalForBreakdown = currentActivities.length || 1;
  const activityBreakdown: ActivityBreakdownItem[] = (
    Object.keys(ACTIVITY_LABELS) as ActivityType[]
  )
    .map((type) => ({
      type,
      label: ACTIVITY_LABELS[type],
      count: typeCounts.get(type) ?? 0,
      pct: Math.round(((typeCounts.get(type) ?? 0) / totalForBreakdown) * 100),
    }))
    .filter((b) => b.count > 0)
    .sort((a, b) => b.count - a.count);

  return {
    kpis: {
      totalTouchpoints,
      avgContactsPerClient,
      overdueCount: overdueClients.length,
      touchpointTrend,
    },
    frequencyBuckets,
    overdueClients,
    activityBreakdown,
  };
}

// ── 2. Speed to Lead ────────────────────────────────────────────────────────

export function computeSpeedToLead(clients: Client[]): SpeedToLeadResult {
  // Only clients with both created_at and first_contacted_at
  const measurable = clients.filter(
    (c) => c.created_at && c.first_contacted_at,
  );

  const responseTimes = measurable.map((c) =>
    hoursBetween(new Date(c.created_at), new Date(c.first_contacted_at!)),
  );

  const totalMeasurable = responseTimes.length;

  const kpis = {
    medianResponseHours: median(responseTimes),
    bestResponseHours:
      responseTimes.length > 0 ? Math.min(...responseTimes) : null,
    worstResponseHours:
      responseTimes.length > 0 ? Math.max(...responseTimes) : null,
    pctWithin1Hour:
      totalMeasurable > 0
        ? Math.round(
            (responseTimes.filter((h) => h <= 1).length / totalMeasurable) *
              100,
          )
        : 0,
    pctWithin24Hours:
      totalMeasurable > 0
        ? Math.round(
            (responseTimes.filter((h) => h <= 24).length / totalMeasurable) *
              100,
          )
        : 0,
    totalMeasurable,
  };

  // By source
  const sourceMap = new Map<string, number[]>();
  for (const c of measurable) {
    const source = c.lead_source || "Unknown";
    if (!sourceMap.has(source)) sourceMap.set(source, []);
    sourceMap.get(source)!.push(
      hoursBetween(new Date(c.created_at), new Date(c.first_contacted_at!)),
    );
  }

  const bySource: SpeedBySource[] = [...sourceMap.entries()]
    .map(([source, hours]) => ({
      source,
      avgResponseHours:
        Math.round((hours.reduce((s, h) => s + h, 0) / hours.length) * 10) /
        10,
      count: hours.length,
    }))
    .sort((a, b) => a.avgResponseHours - b.avgResponseHours);

  return { kpis, bySource };
}

// ── 3. Source Funnel ────────────────────────────────────────────────────────

export function computeSourceFunnel(
  clients: Client[],
  records: ClientRecord[],
  activities: ContactActivity[],
): SourceFunnelResult {
  // Clients with a lead_source
  const sourcedClients = clients.filter((c) => c.lead_source);

  // Build sets for contacted / active / closed per source
  const contactedSet = new Set(activities.map((a) => a.client_id));

  const activeStatuses: ClientStatus[] = ["taxiing", "in_flight"];
  const closedStatuses: ClientStatus[] = ["landed", "cruising"];

  // GCI by client
  const gciByClient = new Map<string, number>();
  for (const r of records) {
    if (r.client_id) {
      gciByClient.set(r.client_id, (gciByClient.get(r.client_id) ?? 0) + r.gci);
    }
  }

  // Aggregate by source
  const sourceData = new Map<
    string,
    {
      total: number;
      contacted: number;
      active: number;
      closed: number;
      gci: number;
    }
  >();

  for (const c of sourcedClients) {
    const source = c.lead_source!;
    if (!sourceData.has(source)) {
      sourceData.set(source, { total: 0, contacted: 0, active: 0, closed: 0, gci: 0 });
    }
    const d = sourceData.get(source)!;
    d.total++;
    if (contactedSet.has(c.id)) d.contacted++;
    if (activeStatuses.includes(c.status)) d.active++;
    if (closedStatuses.includes(c.status)) d.closed++;
    d.gci += gciByClient.get(c.id) ?? 0;
  }

  const rows: SourceFunnelRow[] = [...sourceData.entries()]
    .map(([source, d]) => ({
      source,
      totalLeads: d.total,
      contacted: d.contacted,
      contactedPct: d.total > 0 ? Math.round((d.contacted / d.total) * 100) : 0,
      active: d.active,
      activePct: d.total > 0 ? Math.round((d.active / d.total) * 100) : 0,
      closed: d.closed,
      closedPct: d.total > 0 ? Math.round((d.closed / d.total) * 100) : 0,
      totalGCI: d.gci,
      avgGCI: d.closed > 0 ? Math.round(d.gci / d.closed) : 0,
    }))
    .sort((a, b) => b.totalLeads - a.totalLeads);

  const bestConverting =
    rows.length > 0
      ? [...rows].sort((a, b) => b.closedPct - a.closedPct)[0]?.source ?? null
      : null;

  const highestGCI =
    rows.length > 0
      ? [...rows].sort((a, b) => b.totalGCI - a.totalGCI)[0]?.source ?? null
      : null;

  return { rows, bestConverting, highestGCI };
}
