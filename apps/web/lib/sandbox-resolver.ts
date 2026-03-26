// ============================================================================
// Agent Runway — Sandbox Data Resolver
// Server-side utility for resolving sandbox vs real data on each page.
// Each page's server component calls these helpers to determine data source.
// ============================================================================

import type {
  UserSettings,
  SandboxDataset,
} from "@/lib/types/database";

/**
 * Type guard: returns true when sandbox mode is active and data is present.
 * When true, the page should use sandbox data instead of Supabase queries.
 */
export function isSandboxActive(
  settings: UserSettings | null,
): settings is UserSettings & { sandbox_data: SandboxDataset } {
  return (
    settings?.sandbox_mode === true &&
    settings?.sandbox_data != null &&
    typeof settings.sandbox_data === "object"
  );
}

/**
 * Extract typed sandbox data from settings.
 * Only call after isSandboxActive() returns true.
 * Provides safe defaults for fields that may not exist in older sandbox datasets
 * (generated before the full-app expansion).
 */
export function getSandboxData(settings: UserSettings): SandboxDataset {
  const raw = settings.sandbox_data as SandboxDataset;
  return {
    transactions: raw.transactions ?? [],
    pipelineDeals: raw.pipelineDeals ?? [],
    expenseCategories: raw.expenseCategories ?? [],
    historyItems: raw.historyItems ?? [],
    settingsOverrides: raw.settingsOverrides ?? {},
    // Full-app expansion fields — default to empty arrays for old datasets
    clients: raw.clients ?? [],
    contactActivities: raw.contactActivities ?? [],
    contactTasks: raw.contactTasks ?? [],
    clientRecords: raw.clientRecords ?? [],
    clientRelationships: raw.clientRelationships ?? [],
    flightPlans: raw.flightPlans ?? [],
    flightPlanSteps: raw.flightPlanSteps ?? [],
    propertyShowings: raw.propertyShowings ?? [],
    listingAppointments: raw.listingAppointments ?? [],
    outreachQueue: raw.outreachQueue ?? [],
    newsletterQueue: raw.newsletterQueue ?? [],
    mileageLogs: raw.mileageLogs ?? [],
    ccaAssets: raw.ccaAssets ?? [],
    receiptExpenses: raw.receiptExpenses ?? [],
    meta: raw.meta,
  };
}

/**
 * Merge sandbox settings overrides onto the base settings.
 * Returns a new settings object with sandbox values applied.
 */
export function mergeSandboxSettings(settings: UserSettings): UserSettings {
  const sb = getSandboxData(settings);
  return {
    ...settings,
    ...sb.settingsOverrides,
    // Always preserve sandbox control fields from real settings
    sandbox_mode: settings.sandbox_mode,
    sandbox_activated_at: settings.sandbox_activated_at,
    sandbox_expires_at: settings.sandbox_expires_at,
    sandbox_tier: settings.sandbox_tier,
    sandbox_data: settings.sandbox_data,
  };
}

/**
 * Get flat expense items array from sandbox categories.
 * Many pages fetch expense_items separately — this extracts them.
 */
export function getSandboxExpenseItems(sb: SandboxDataset) {
  return sb.expenseCategories.flatMap((cat) => cat.items);
}

/**
 * Get receipt expense YTD total from sandbox data.
 */
export function getSandboxReceiptYTD(sb: SandboxDataset): number {
  return sb.receiptExpenses.reduce((sum, r) => sum + r.total_amount, 0);
}

/**
 * Get mileage km total from sandbox data.
 */
export function getSandboxMileageTotal(sb: SandboxDataset): number {
  return sb.mileageLogs.reduce((sum, m) => sum + m.km, 0);
}

/**
 * Get receipt totals grouped by category key (for Reports page).
 */
export function getSandboxReceiptTotalsByKey(
  sb: SandboxDataset,
): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const r of sb.receiptExpenses) {
    totals[r.category_key] = (totals[r.category_key] ?? 0) + r.total_amount;
  }
  return totals;
}

/**
 * Get outreach queue items with client data joined (for Flight Control).
 * Mimics the Supabase join: outreach_queue with clients(name, city, province_region, email).
 */
export function getSandboxOutreachWithClients(sb: SandboxDataset) {
  const clientMap = new Map(sb.clients.map((c) => [c.id, c]));
  return sb.outreachQueue.map((item) => {
    const client = item.client_id ? clientMap.get(item.client_id) : null;
    return {
      ...item,
      clients: client
        ? {
            name: client.name,
            city: client.city,
            province_region: client.province_region,
            email: client.email,
          }
        : null,
    };
  });
}
