// ─────────────────────────────────────────────────────────────────────────────
// Self-serve data export — engine
// ─────────────────────────────────────────────────────────────────────────────
// Builds a ZIP containing CSVs of every user-owned table, plus a manifest.json
// describing what's inside. Used by /api/account/export and any future admin
// flow that needs to export a single user's data (PIPEDA / Law 25 portability).
//
// Sensitive fields (OAuth tokens, share tokens) are REDACTED before serializing
// — the user already has access to those credentials through the connected-
// account UI; baking them into a downloadable file just creates a leak vector.
//
// Errors per-table are tolerated: if one query fails, the others still export
// and the failure is recorded in manifest.json under `errors`. Better to ship
// a partial export than to fail the whole download.
// ─────────────────────────────────────────────────────────────────────────────

import JSZip from "jszip";
import { createAdminClient } from "@/lib/supabase/admin";
import { log } from "@/lib/logger";

/**
 * Tables that hold per-user rows scoped by `user_id`. Each becomes one CSV
 * inside the ZIP. Add new tables here as the schema grows.
 *
 * `redactColumns` strips secrets (OAuth tokens, share tokens) before serializing.
 */
interface ExportTable {
  table: string;
  filename: string;
  description: string;
  redactColumns?: readonly string[];
}

// Inventory of every public.* table that has a user_id column scoped to
// auth.users. Verified against the live schema on 2026-04-15. Intentionally
// excludes:
//   - rate_limits             (system rate-limit counters, not user data)
// Verified missing: no `newsletter_*` user-owned tables exist.
const EXPORT_TABLES: readonly ExportTable[] = [
  // ── Account & profile ─────────────────────────────────────────────────────
  { table: "user_settings", filename: "account-settings.csv", description: "Profile, preferences, tax config" },
  { table: "business_settings", filename: "business-settings.csv", description: "Business identity and configuration" },
  { table: "notification_preferences", filename: "notification-preferences.csv", description: "Email/push notification preferences" },
  { table: "consent_records", filename: "consent-records.csv", description: "Consent grants (privacy law artifact)" },

  // ── Money & transactions ──────────────────────────────────────────────────
  { table: "transactions", filename: "transactions.csv", description: "Closed and pending real estate transactions" },
  { table: "pipeline_deals", filename: "pipeline.csv", description: "Prospective deals and pipeline stages" },
  { table: "history_items", filename: "history.csv", description: "Year-by-year historical GCI and deal counts" },
  { table: "referrals", filename: "referrals.csv", description: "Referral fee tracking" },

  // ── Expenses & taxes ──────────────────────────────────────────────────────
  { table: "expense_categories", filename: "expense-categories.csv", description: "Expense category buckets" },
  { table: "expense_items", filename: "expenses.csv", description: "Line-item business expenses" },
  { table: "recurring_expenses", filename: "recurring-expenses.csv", description: "Recurring expense templates" },
  { table: "recurring_expense_entries", filename: "recurring-expense-entries.csv", description: "Recurring expense ledger entries" },
  { table: "receipt_expenses", filename: "receipt-expenses.csv", description: "Expenses parsed from uploaded receipts" },
  { table: "mileage_logs", filename: "mileage-logs.csv", description: "Vehicle mileage logs" },
  { table: "t2125_cca_assets", filename: "t2125-cca-assets.csv", description: "Capital cost allowance assets (T2125)" },

  // ── CRM & clients ─────────────────────────────────────────────────────────
  { table: "clients", filename: "clients.csv", description: "CRM clients" },
  { table: "client_notes", filename: "client-notes.csv", description: "Notes attached to clients" },
  { table: "client_records", filename: "client-records.csv", description: "Legacy client records" },
  { table: "client_relationships", filename: "client-relationships.csv", description: "Client relationship graph" },
  { table: "client_memory_profiles", filename: "client-memory-profiles.csv", description: "AI memory profiles for clients" },
  { table: "contact_activities", filename: "contact-activities.csv", description: "CRM contact activities" },
  { table: "contact_tasks", filename: "contact-tasks.csv", description: "CRM tasks and follow-ups" },
  { table: "testimonials", filename: "testimonials.csv", description: "Collected client testimonials" },
  { table: "flight_plans", filename: "flight-plans.csv", description: "Onboarding and coaching flight plans" },

  // ── Listings, showings, properties ────────────────────────────────────────
  { table: "listing_appointments", filename: "listing-appointments.csv", description: "Listing presentation appointments" },
  { table: "property_showings", filename: "property-showings.csv", description: "Property showings" },
  { table: "property_analyses", filename: "property-analyses.csv", description: "Property valuations and analyses" },

  // ── Calendar, email, document sync (integrations & content) ──────────────
  { table: "calendar_events", filename: "calendar-events.csv", description: "Synced calendar events" },
  { table: "drive_documents", filename: "drive-documents.csv", description: "Synced documents (legacy data; document sync is not currently offered)" },
  { table: "inbound_emails", filename: "inbound-emails.csv", description: "Emails received in your inbox" },
  { table: "email_warmup_status", filename: "email-warmup-status.csv", description: "Email deliverability warmup state" },

  // ── Outreach, nurture, social ────────────────────────────────────────────
  { table: "nurture_sequences", filename: "nurture-sequences.csv", description: "Drip / nurture campaigns" },
  { table: "outreach_queue", filename: "outreach-queue.csv", description: "Pending outreach actions" },
  { table: "social_posts", filename: "social-posts.csv", description: "Drafted and published social posts" },

  // ── Insights, analytics ──────────────────────────────────────────────────
  { table: "precomputed_insights", filename: "precomputed-insights.csv", description: "Cached AI-generated insights" },
  { table: "chat_analytics", filename: "chat-analytics.csv", description: "Flight Crew chat usage analytics" },

  // ── Notifications & telemetry ────────────────────────────────────────────
  { table: "milestones", filename: "milestones.csv", description: "Achievement notifications" },
  { table: "notification_log", filename: "notification-log.csv", description: "Past notifications sent to you" },
  { table: "import_telemetry", filename: "import-history.csv", description: "Audit trail of CSV/document imports" },
  { table: "mcp_events", filename: "mcp-events.csv", description: "MCP / Flight Crew activity log" },
  { table: "user_security_events", filename: "security-events.csv", description: "Per-user security audit events (auth, billing, etc.)" },

  // ── Team-leader rows you own ──────────────────────────────────────────────
  { table: "agent_profiles", filename: "team-agents.csv", description: "Team members you manage (team-leader feature)" },
  { table: "team_deals", filename: "team-deals.csv", description: "Deals shared with team members" },
  { table: "organization_members", filename: "organization-memberships.csv", description: "Your memberships in organizations" },
  { table: "org_agent_performance", filename: "org-agent-performance.csv", description: "Your performance rows inside organizations" },

  // ── Connected accounts (sensitive — tokens redacted) ─────────────────────
  {
    table: "google_connections",
    filename: "connected-accounts-google.csv",
    description: "Legacy connected-account records (third-party account integrations are not currently offered; OAuth tokens redacted)",
    redactColumns: ["access_token_enc", "refresh_token_enc", "calendar_sync_token"],
  },
  {
    table: "email_connections",
    filename: "email-connections.csv",
    description: "Connected email accounts (passwords + tokens redacted)",
    redactColumns: ["access_token_enc", "refresh_token_enc", "smtp_password_enc", "calendar_sync_token"],
  },
  {
    table: "plaid_items",
    filename: "bank-connections.csv",
    description: "Legacy bank-connection records (bank-account connectivity is a planned future capability; access tokens redacted)",
    redactColumns: ["access_token"],
  },
  { table: "plaid_transactions", filename: "bank-transactions.csv", description: "Imported bank transactions (legacy data)" },
  {
    table: "social_connections",
    filename: "social-connections.csv",
    description: "Connected social accounts (OAuth tokens redacted)",
    redactColumns: ["access_token", "page_access_token"],
  },
  {
    table: "accountant_shares",
    filename: "accountant-shares.csv",
    description: "Read-only grants to accountants (share tokens redacted)",
    redactColumns: ["token"],
  },
  {
    table: "push_tokens",
    filename: "push-tokens.csv",
    description: "Mobile push notification device tokens (redacted)",
    redactColumns: ["expo_push_token"],
  },
  {
    table: "receipt_upload_tokens",
    filename: "receipt-upload-tokens.csv",
    description: "Short-lived receipt upload tokens (redacted)",
    redactColumns: ["token"],
  },
] as const;

interface ExportManifest {
  exported_at: string;
  user_id: string;
  user_email: string | null;
  app_version: string;
  files: Array<{
    filename: string;
    table: string;
    rows: number;
    description: string;
    redacted_columns?: readonly string[];
  }>;
  errors: Array<{ table: string; message: string }>;
  notes: string[];
}

export interface BuildExportResult {
  zip: Buffer;
  manifest: ExportManifest;
}

/**
 * Build a ZIP export of every user-owned row, ready to stream back to the user.
 */
export async function buildUserExport(
  userId: string,
  userEmail: string | null,
): Promise<BuildExportResult> {
  const admin = createAdminClient();
  const zip = new JSZip();

  const manifest: ExportManifest = {
    exported_at: new Date().toISOString(),
    user_id: userId,
    user_email: userEmail,
    app_version: process.env.NEXT_PUBLIC_APP_VERSION ?? "unknown",
    files: [],
    errors: [],
    notes: [
      "OAuth tokens and accountant share tokens are redacted from this export.",
      "If you need machine-readable equivalents to re-import elsewhere, the CSVs use the same column names as the underlying tables.",
      "This export reflects only your data. Team-shared rows authored by other users on your team are omitted.",
    ],
  };

  for (const spec of EXPORT_TABLES) {
    try {
      const { data, error } = await admin
        .from(spec.table)
        .select("*")
        .eq("user_id", userId);

      if (error) {
        manifest.errors.push({ table: spec.table, message: error.message });
        log.warn(
          { table: spec.table, err: error.message },
          "[export] table query failed — skipping",
        );
        continue;
      }

      const rows = (data ?? []) as Array<Record<string, unknown>>;
      const redacted = spec.redactColumns
        ? rows.map((row) => redactRow(row, spec.redactColumns!))
        : rows;

      zip.file(spec.filename, rowsToCsv(redacted));
      manifest.files.push({
        filename: spec.filename,
        table: spec.table,
        rows: rows.length,
        description: spec.description,
        ...(spec.redactColumns ? { redacted_columns: spec.redactColumns } : {}),
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      manifest.errors.push({ table: spec.table, message });
      log.error({ table: spec.table, err: e }, "[export] unexpected table failure");
    }
  }

  zip.file("manifest.json", JSON.stringify(manifest, null, 2));
  zip.file("README.txt", README_TEXT);

  const buffer = await zip.generateAsync({ type: "nodebuffer" });

  return { zip: buffer, manifest };
}

// ── helpers ──────────────────────────────────────────────────────────────────

function redactRow(
  row: Record<string, unknown>,
  cols: readonly string[],
): Record<string, unknown> {
  const out = { ...row };
  for (const col of cols) {
    if (col in out && out[col] != null) {
      out[col] = "[REDACTED]";
    }
  }
  return out;
}

/**
 * Convert an array of row objects to RFC 4180 CSV. Handles nulls, JSON values,
 * embedded quotes / commas / newlines. Empty input returns an empty string.
 */
function rowsToCsv(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) return "";

  // Union of keys across all rows so a row missing a column still aligns.
  const headers = Array.from(
    rows.reduce((set, row) => {
      Object.keys(row).forEach((k) => set.add(k));
      return set;
    }, new Set<string>()),
  );

  const lines: string[] = [headers.map(csvEscape).join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => csvEscape(serializeCell(row[h]))).join(","));
  }
  return lines.join("\r\n");
}

function serializeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString();
  // Objects/arrays → JSON. Keeps JSONB columns useful.
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function csvEscape(value: string): string {
  if (value === "") return "";
  // Prevent Excel/Sheets formula injection by prefixing dangerous leading characters.
  const first = value.charAt(0);
  if (first === "=" || first === "+" || first === "-" || first === "@" || first === "|" || first === "\t") {
    value = "'" + value;
  }
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

const README_TEXT = `Agent Runway — your data export
================================

This ZIP contains a copy of all data Agent Runway holds about your account,
in CSV format. Each file corresponds to one underlying table; manifest.json
describes what's where, when this export was generated, and which sensitive
columns were redacted.

What's redacted and why
-----------------------
We redact OAuth access/refresh tokens and accountant-share tokens. These
function as passwords to other services — including them in a downloadable
file would create a long-lived credential outside our security perimeter.
You can re-issue any of these credentials from Settings if needed.

Need a different format?
------------------------
Reach out to support@agentrunway.ca and we'll work with you. We can also
provide an admin-mediated export of stored documents, AI conversation
history, or anything else that isn't in this MVP export.

Questions about your privacy rights?
------------------------------------
PIPEDA and Quebec's Law 25 give you the right to a portable copy of your
personal information. This export is how we honour that. For a full list
of what we collect and why, see https://agentrunway.ca/privacy.

---
© 2026 Agent Runway Inc. — Canada Corporation No. 1786542-2
Registered office: New Brunswick, Canada
`;
