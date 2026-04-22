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
  ListingAppointment,
} from "../types/database";

// ── Intelligence Briefing types ──────────────────────────────────────────────

export type BriefingItemType =
  | "vip_overdue"
  | "uncontacted_lead"
  | "in_flight_stale"
  | "birthday_today"
  | "birthday_soon"
  | "closing_anniversary"
  | "mortgage_renewal_window"
  | "mortgage_renewal_due"
  | "past_client_check_in"
  | "timeframe_approaching"
  | "property_value_milestone"
  | "no_contact_info"
  | "possible_duplicate"
  | "listing_appointment_overdue"
  | "listing_stale";

export interface BriefingItem {
  id: string;
  type: BriefingItemType;
  severity: "urgent" | "attention" | "upcoming";
  clientId: string;
  clientName: string;
  title: string;
  detail: string;
  daysValue?: number;
}

export interface IntelligenceBriefingResult {
  items: BriefingItem[];
  urgentCount: number;
  attentionCount: number;
  upcomingCount: number;
  totalCount: number;
}

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
    touchpointTrend: number | null; // % vs prior period, positive = up; null = no prior data
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

  // Trend: % change vs prior period.  When there's no prior data we return
  // null (displayed as "New" in the UI) instead of a misleading 100%.
  const touchpointTrend =
    priorActivities.length > 0
      ? Math.round(
          ((totalTouchpoints - priorActivities.length) /
            priorActivities.length) *
            100,
        )
      : null; // No prior period → null (UI displays "New" instead of misleading 0%)

  // Overdue: clients with no activity in 30+ days (active stages only: boarding / in_flight)
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

  const activeStatuses: ClientStatus[] = ["boarding", "scheduled", "in_flight"];
  const overdueClients: OverdueClient[] = [];

  // Grace period: suppress imported clients from overdue alerts for 7 days
  // from import date, and indefinitely if no activity has ever been logged.
  // Without this, a fresh CSV import of 150+ clients floods the dashboard.
  const IMPORT_GRACE_DAYS = 7;

  for (const client of clients) {
    if (!activeStatuses.includes(client.status)) continue;

    const lastDate = lastActivityByClient.get(client.id);
    const daysSince = lastDate ? daysBetween(now, lastDate) : 999;

    const importedInGrace = !!client.imported_at &&
      (now.getTime() - new Date(client.imported_at).getTime()) < IMPORT_GRACE_DAYS * 86_400_000;
    const importedNoActivity = !!client.imported_at && daysSince === 999;
    if (importedInGrace || importedNoActivity) continue;

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

  const activeStatuses: ClientStatus[] = ["boarding", "scheduled", "in_flight"];

  // A client is "closed" only if they have at least one ClientRecord with a close_date.
  // Using status === "cruising" was wrong: auto-imported sphere contacts land in Cruising
  // without ever transacting, inflating close rates per source.
  const closedClientIds = new Set(
    records.filter((r) => r.client_id && r.close_date).map((r) => r.client_id as string),
  );

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
    if (closedClientIds.has(c.id)) d.closed++;
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

// ── 4. Intelligence Briefing ─────────────────────────────────────────────────
// Surfaces what a coordinator would catch in a morning review:
//   - VIP clients going dark (14-day threshold)
//   - Uncontacted new leads aging past 24h
//   - Active deals (in_flight) without contact in 7+ days
//   - Upcoming birthdays (next 14 days)
//   - Closing anniversaries (next 14 days)
//   - Active leads with no email or phone on file
//   - Possible duplicate records (same email or phone)

export function computeIntelligenceBriefing(
  clients: Client[],
  activities: ContactActivity[],
  records: ClientRecord[],
  listingAppointments?: ListingAppointment[],
): IntelligenceBriefingResult {
  const now = new Date();
  const items: BriefingItem[] = [];

  // ── Pre-compute last activity date per client ──────────────────────────────
  const lastActByClient = new Map<string, Date>();
  for (const a of activities) {
    const d = new Date(a.activity_date);
    const ex = lastActByClient.get(a.client_id);
    if (!ex || d > ex) lastActByClient.set(a.client_id, d);
  }

  // ── Pre-compute closing dates by client (for anniversary detection) ────────
  const closeDatesByClient = new Map<string, Date[]>();
  for (const r of records) {
    if (r.client_id && r.close_date) {
      if (!closeDatesByClient.has(r.client_id)) closeDatesByClient.set(r.client_id, []);
      closeDatesByClient.get(r.client_id)!.push(new Date(r.close_date + "T12:00:00"));
    }
  }

  const activeClients = clients.filter((c) => !c.archived_at);
  // Track which clients already have an "action needed" item (1 action item per client max)
  const hasActionItem = new Set<string>();

  for (const client of activeClients) {
    const isVip = client.tags.includes("VIP") || client.tags.includes("High Value");
    const lastAct = lastActByClient.get(client.id);
    const daysSince = lastAct
      ? Math.floor((now.getTime() - lastAct.getTime()) / 86_400_000)
      : 999;

    // Imported clients are suppressed from contact-recency alerts for 7 days from
    // import date, giving the agent time to work through the list without being
    // flooded immediately. After the grace period, normal alerting resumes.
    // Additionally, imported clients with zero activity ever logged are suppressed
    // indefinitely until the first activity is recorded.
    const IMPORT_GRACE_DAYS = 7;
    const importedInGrace = !!client.imported_at &&
      (now.getTime() - new Date(client.imported_at).getTime()) < IMPORT_GRACE_DAYS * 86_400_000;
    const importedNoActivity = !!client.imported_at && daysSince === 999;
    const importedSuppressed = importedInGrace || importedNoActivity;

    // ── 1. VIP / High Value overdue (threshold: 14 days) ──────────────────────
    if (!importedSuppressed && isVip && daysSince >= 14) {
      hasActionItem.add(client.id);
      items.push({
        id: `vip_${client.id}`,
        type: "vip_overdue",
        severity: daysSince >= 30 ? "urgent" : "attention",
        clientId: client.id,
        clientName: client.name,
        title: `${client.name} — VIP overdue`,
        detail: daysSince === 999 ? "Never contacted" : `${daysSince} days without contact`,
        daysValue: daysSince,
      });
    }

    // ── 2. Uncontacted new leads (boarding, no first contact, 24h+ old) ────────
    if (!importedSuppressed && !hasActionItem.has(client.id) && client.status === "boarding" && !client.first_contacted_at) {
      const ageHours = (now.getTime() - new Date(client.created_at).getTime()) / 3_600_000;
      if (ageHours >= 24) {
        hasActionItem.add(client.id);
        items.push({
          id: `new_lead_${client.id}`,
          type: "uncontacted_lead",
          severity: ageHours >= 48 ? "urgent" : "attention",
          clientId: client.id,
          clientName: client.name,
          title: `${client.name} — not yet contacted`,
          detail:
            ageHours >= 48
              ? `${Math.floor(ageHours / 24)}d old — speed to lead`
              : `${Math.floor(ageHours)}hr old — follow up today`,
          daysValue: Math.floor(ageHours / 24),
        });
      }
    }

    // ── 3. In-Flight stale (active deal, 7+ days no contact) ──────────────────
    if (!importedSuppressed && !hasActionItem.has(client.id) && client.status === "in_flight" && daysSince >= 7) {
      hasActionItem.add(client.id);
      items.push({
        id: `in_flight_${client.id}`,
        type: "in_flight_stale",
        severity: daysSince >= 14 ? "urgent" : "attention",
        clientId: client.id,
        clientName: client.name,
        title: `${client.name} — In-Flight, ${daysSince}d silent`,
        detail: "Active deal — clients expect regular updates",
        daysValue: daysSince,
      });
    }

    // ── 4. Birthday alerts (next 14 days) ──────────────────────────────────────
    if (client.birthdate) {
      const parts = client.birthdate.split("-");
      if (parts.length === 3) {
        const mm = parseInt(parts[1]) - 1;
        const dd = parseInt(parts[2]);
        if (!isNaN(mm) && !isNaN(dd) && mm >= 0 && mm <= 11 && dd >= 1 && dd <= 31) {
          const thisYearBday = new Date(now.getFullYear(), mm, dd);
          const nextBday =
            thisYearBday.getTime() < now.getTime() - 86_400_000
              ? new Date(now.getFullYear() + 1, mm, dd)
              : thisYearBday;
          const daysUntil = Math.floor((nextBday.getTime() - now.getTime()) / 86_400_000);
          if (daysUntil <= 14) {
            const label =
              daysUntil <= 0 ? "today!" : daysUntil === 1 ? "tomorrow" : `in ${daysUntil} days`;
            items.push({
              id: `bday_${client.id}_${nextBday.getFullYear()}`,
              type: daysUntil <= 1 ? "birthday_today" : "birthday_soon",
              severity: daysUntil <= 1 ? "urgent" : "upcoming",
              clientId: client.id,
              clientName: client.name,
              title: `${client.name} — birthday ${label}`,
              detail: nextBday.toLocaleDateString("en-CA", { month: "long", day: "numeric" }),
              daysValue: Math.max(0, daysUntil),
            });
          }
        }
      }
    }

    // ── 5. Closing anniversaries (next 14 days) ────────────────────────────────
    const closeDates = closeDatesByClient.get(client.id) ?? [];
    for (const cd of closeDates) {
      const thisYearAnn = new Date(now.getFullYear(), cd.getMonth(), cd.getDate());
      const nextAnn =
        thisYearAnn.getTime() < now.getTime() - 86_400_000
          ? new Date(now.getFullYear() + 1, cd.getMonth(), cd.getDate())
          : thisYearAnn;
      const daysUntil = Math.floor((nextAnn.getTime() - now.getTime()) / 86_400_000);
      const yearsAgo = nextAnn.getFullYear() - cd.getFullYear();
      if (daysUntil <= 14 && yearsAgo >= 1) {
        const label =
          daysUntil <= 0 ? "today!" : daysUntil === 1 ? "tomorrow" : `in ${daysUntil} days`;
        items.push({
          id: `ann_${client.id}_${cd.toISOString().slice(0, 7)}`,
          type: "closing_anniversary",
          severity: "upcoming",
          clientId: client.id,
          clientName: client.name,
          title: `${client.name} — ${yearsAgo}-year closing anniversary ${label}`,
          detail: nextAnn.toLocaleDateString("en-CA", { month: "long", day: "numeric" }),
          daysValue: Math.max(0, daysUntil),
        });
      }
    }

    // ── 6. Cruising check-in (long-term contact, 180+ days no contact) ─────────
    if (
      !importedSuppressed &&
      client.status === "cruising" &&
      daysSince >= 180
    ) {
      const hasClosing = (closeDatesByClient.get(client.id) ?? []).length > 0;
      const descriptor = hasClosing ? "past client" : "long-term contact";
      items.push({
        id: `checkin_${client.id}`,
        type: "past_client_check_in",
        severity: daysSince >= 365 ? "attention" : "upcoming",
        clientId: client.id,
        clientName: client.name,
        title: `${client.name} — ${descriptor}, check in soon`,
        detail:
          daysSince === 999
            ? "No contact logged yet"
            : `${daysSince} days since last contact`,
        daysValue: daysSince,
      });
    }

    // ── 7. Timeframe approaching ───────────────────────────────────────────────
    if (
      !hasActionItem.has(client.id) &&
      client.timeframe &&
      client.timeframe !== "unknown" &&
      client.timeframe !== "12_plus" &&
      (client.status === "boarding" || client.status === "scheduled")
    ) {
      const timeframeTotalDays: Record<string, number> = {
        asap: 14,
        "1_3_months": 90,
        "3_6_months": 180,
        "6_12_months": 365,
      };
      const totalDays = timeframeTotalDays[client.timeframe];
      if (totalDays !== undefined) {
        const ageDays =
          (now.getTime() - new Date(client.created_at).getTime()) / 86_400_000;
        const daysRemaining = totalDays - ageDays;
        const alertThreshold = Math.max(14, totalDays * 0.2);
        if (daysRemaining <= alertThreshold) {
          const timeframeLabel: Record<string, string> = {
            asap: "ASAP",
            "1_3_months": "1–3 Month",
            "3_6_months": "3–6 Month",
            "6_12_months": "6–12 Month",
          };
          const label = timeframeLabel[client.timeframe] ?? client.timeframe;
          hasActionItem.add(client.id);
          items.push({
            id: `timeframe_${client.id}`,
            type: "timeframe_approaching",
            severity: daysRemaining <= 0 ? "urgent" : "attention",
            clientId: client.id,
            clientName: client.name,
            title:
              daysRemaining <= 0
                ? `${client.name} — ${label} timeframe passed`
                : `${client.name} — ${label} timeframe ending soon`,
            detail:
              daysRemaining <= 0
                ? "Client's stated timeframe has passed — follow up on next steps"
                : `${Math.ceil(daysRemaining)} days left in their ${label} window`,
            daysValue: Math.max(0, Math.ceil(daysRemaining)),
          });
        }
      }
    }

    // ── 8. Missing contact info (active leads, no email AND no phone) ──────────
    if (
      !client.email &&
      !client.phone &&
      ["boarding", "scheduled", "in_flight"].includes(client.status)
    ) {
      items.push({
        id: `no_contact_${client.id}`,
        type: "no_contact_info",
        severity: "attention",
        clientId: client.id,
        clientName: client.name,
        title: `${client.name} — no contact info`,
        detail: "Active lead with no email or phone on file",
      });
    }
  }

  // ── 9. Mortgage renewal detection ────────────────────────────────────────────
  // Standard Canadian 5-year term:
  //   4.5–5.5 yrs since close = renewal imminent (mortgage_renewal_due)
  //   3.0–4.5 yrs since close = renewal planning window (mortgage_renewal_window)
  for (const client of activeClients) {
    const closeDates = closeDatesByClient.get(client.id) ?? [];
    if (closeDates.length === 0) continue;
    // Use most recent close date for renewal tracking
    const latestClose = [...closeDates].sort(
      (a, b) => b.getTime() - a.getTime(),
    )[0];
    const yearsSince =
      (now.getTime() - latestClose.getTime()) / (365.25 * 86_400_000);
    const renewalDate = new Date(
      latestClose.getFullYear() + 5,
      latestClose.getMonth(),
      latestClose.getDate(),
    );
    const daysUntilRenewal = Math.floor(
      (renewalDate.getTime() - now.getTime()) / 86_400_000,
    );

    if (yearsSince >= 4.5 && yearsSince < 5.5) {
      const label =
        daysUntilRenewal <= 0
          ? "overdue"
          : daysUntilRenewal === 1
          ? "in 1 day"
          : `in ${daysUntilRenewal} days`;
      items.push({
        id: `renewal_due_${client.id}_${latestClose.toISOString().slice(0, 7)}`,
        type: "mortgage_renewal_due",
        severity: daysUntilRenewal <= 90 ? "urgent" : "attention",
        clientId: client.id,
        clientName: client.name,
        title: `${client.name} — mortgage renewal ${label}`,
        detail: `5-yr term on ${latestClose.toLocaleDateString("en-CA", { month: "long", year: "numeric" })} close`,
        daysValue: Math.max(0, daysUntilRenewal),
      });
    } else if (yearsSince >= 3 && yearsSince < 4.5) {
      const monthsUntil = Math.round(
        (renewalDate.getTime() - now.getTime()) / (30.44 * 86_400_000),
      );
      items.push({
        id: `renewal_window_${client.id}_${latestClose.toISOString().slice(0, 7)}`,
        type: "mortgage_renewal_window",
        severity: "upcoming",
        clientId: client.id,
        clientName: client.name,
        title: `${client.name} — renewal window (~${monthsUntil} months)`,
        detail: `Start the renewal conversation — review rate options`,
        daysValue: Math.round(
          (renewalDate.getTime() - now.getTime()) / 86_400_000,
        ),
      });
    }
  }

  // ── 10. Property value milestone (15–30 day window, notable anniversary years) ─
  // Surfaces milestone anniversaries before the 14-day closing_anniversary window
  // kicks in, so the agent can prepare a CMA or market update in advance.
  const MILESTONE_YEARS = [1, 2, 3, 5, 7, 10, 15, 20, 25];
  for (const client of activeClients) {
    const closeDates = closeDatesByClient.get(client.id) ?? [];
    for (const cd of closeDates) {
      for (const yr of MILESTONE_YEARS) {
        const milestoneDate = new Date(
          cd.getFullYear() + yr,
          cd.getMonth(),
          cd.getDate(),
        );
        const daysUntil = Math.floor(
          (milestoneDate.getTime() - now.getTime()) / 86_400_000,
        );
        if (daysUntil >= 15 && daysUntil <= 30) {
          items.push({
            id: `value_${client.id}_${yr}yr_${cd.toISOString().slice(0, 7)}`,
            type: "property_value_milestone",
            severity: "upcoming",
            clientId: client.id,
            clientName: client.name,
            title: `${client.name} — ${yr}-year home anniversary in ${daysUntil} days`,
            detail: `Offer a complimentary market update or CMA`,
            daysValue: daysUntil,
          });
          break; // one milestone alert per close date
        }
      }
    }
  }

  // ── 7. Possible duplicates (shared email or phone across distinct records) ───
  const emailMap = new Map<string, string[]>();
  const phoneMap = new Map<string, string[]>();
  for (const c of activeClients) {
    if (c.email) {
      const key = c.email.trim().toLowerCase();
      if (!emailMap.has(key)) emailMap.set(key, []);
      emailMap.get(key)!.push(c.id);
    }
    if (c.phone) {
      const key = c.phone.replace(/\D/g, "").slice(-10);
      if (key.length >= 7) {
        if (!phoneMap.has(key)) phoneMap.set(key, []);
        phoneMap.get(key)!.push(c.id);
      }
    }
  }
  const clientById = new Map(activeClients.map((c) => [c.id, c]));
  const dupClientIds = new Set<string>();

  for (const [, ids] of [...emailMap, ...phoneMap]) {
    if (ids.length <= 1) continue;
    for (const id of ids) {
      if (dupClientIds.has(id)) continue;
      dupClientIds.add(id);
      const c = clientById.get(id);
      if (!c) continue;
      const others = ids
        .filter((x) => x !== id)
        .map((x) => clientById.get(x)?.name ?? "")
        .filter(Boolean);
      items.push({
        id: `dup_${id}`,
        type: "possible_duplicate",
        severity: "attention",
        clientId: id,
        clientName: c.name,
        title: `${c.name} — possible duplicate`,
        detail: `Shares contact info with: ${others.join(", ")}`,
      });
    }
  }

  // ── Listing Appointment Alerts ────────────────────────────────────────
  if (listingAppointments) {
    for (const la of listingAppointments) {
      // Overdue scheduled appointments (past appointment_date, still "scheduled")
      if (la.status === "scheduled" && la.appointment_date) {
        const apptDate = new Date(la.appointment_date + "T12:00:00");
        const daysOverdue = Math.floor((now.getTime() - apptDate.getTime()) / 86_400_000);
        if (daysOverdue >= 3) {
          items.push({
            id: `listing_overdue_${la.id}`,
            type: "listing_appointment_overdue",
            severity: daysOverdue >= 7 ? "urgent" : "attention",
            clientId: la.client_id ?? "",
            clientName: la.property_address ?? "Unknown property",
            title: `Listing appointment overdue — ${la.property_address ?? "unknown"}`,
            detail: `Scheduled ${daysOverdue} days ago, still not active`,
            daysValue: daysOverdue,
          });
        }
      }
      // Stale active listings (active 45+ days without selling)
      if (la.status === "active" && la.appointment_date) {
        const listDate = new Date(la.appointment_date + "T12:00:00");
        const daysActive = Math.floor((now.getTime() - listDate.getTime()) / 86_400_000);
        if (daysActive >= 45) {
          items.push({
            id: `listing_stale_${la.id}`,
            type: "listing_stale",
            severity: daysActive >= 90 ? "urgent" : "attention",
            clientId: la.client_id ?? "",
            clientName: la.property_address ?? "Unknown property",
            title: `Active listing stale — ${la.property_address ?? "unknown"}`,
            detail: `${daysActive} days on market without sale`,
            daysValue: daysActive,
          });
        }
      }
    }
  }

  // Sort: urgent first, then attention, then upcoming; ties broken by daysValue
  const sevOrder: Record<string, number> = { urgent: 0, attention: 1, upcoming: 2 };
  items.sort((a, b) => {
    const s = sevOrder[a.severity] - sevOrder[b.severity];
    if (s !== 0) return s;
    return (a.daysValue ?? 999) - (b.daysValue ?? 999);
  });

  // Cap repetitive alert types so the briefing stays actionable.
  // After a bulk CSV import (once the 7-day grace period expires) the agent
  // could have hundreds of uncontacted leads. Closing anniversaries and
  // property milestones can also flood for clients with multiple records.
  const UNCONTACTED_CAP = 5;
  const ANNIVERSARY_CAP_PER_CLIENT = 1; // one closing anniversary per client
  const MILESTONE_CAP_PER_CLIENT = 1;   // one property milestone per client
  const CHECKIN_CAP = 10;               // past client check-ins
  let uncontactedSeen = 0;
  let checkinSeen = 0;
  const anniversarySeen = new Map<string, number>();
  const milestoneSeen = new Map<string, number>();
  const cappedItems = items.filter((item) => {
    if (item.type === "uncontacted_lead") {
      if (uncontactedSeen >= UNCONTACTED_CAP) return false;
      uncontactedSeen++;
    }
    if (item.type === "past_client_check_in") {
      if (checkinSeen >= CHECKIN_CAP) return false;
      checkinSeen++;
    }
    if (item.type === "closing_anniversary" && item.clientId) {
      const cnt = anniversarySeen.get(item.clientId) ?? 0;
      if (cnt >= ANNIVERSARY_CAP_PER_CLIENT) return false;
      anniversarySeen.set(item.clientId, cnt + 1);
    }
    if (item.type === "property_value_milestone" && item.clientId) {
      const cnt = milestoneSeen.get(item.clientId) ?? 0;
      if (cnt >= MILESTONE_CAP_PER_CLIENT) return false;
      milestoneSeen.set(item.clientId, cnt + 1);
    }
    return true;
  });

  return {
    items: cappedItems,
    urgentCount: cappedItems.filter((i) => i.severity === "urgent").length,
    attentionCount: cappedItems.filter((i) => i.severity === "attention").length,
    upcomingCount: cappedItems.filter((i) => i.severity === "upcoming").length,
    totalCount: cappedItems.length,
  };
}
