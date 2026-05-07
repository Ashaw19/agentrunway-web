/**
 * Flight Crew Write Tools
 *
 * Gives the Flight Crew the ability to act on behalf of the user —
 * creating and updating records across the Agent Runway data model.
 *
 * Architecture:
 * - createAgentTools(supabase, userId) returns all tool definitions
 * - Each tool validates inputs, writes to Supabase, and returns a
 *   natural-language result string the AI surfaces in its response
 * - Write tools use needsApproval: true for human-in-the-loop gating —
 *   the AI surfaces a confirmation card and waits for user approval
 *   before executing. See NEEDS_APPROVAL_TOOLS set below.
 * - All tools gracefully return error strings (never throw) so a tool
 *   failure never crashes the stream
 *
 * Tool categories:
 *   Search (read-only)  — searchClients, searchClientsByFilter, searchPipelineDeals,
 *                         searchContactTasks, searchExpenses, searchOutreachQueue,
 *                         searchTransactions, searchActivities, searchMileageLogs,
 *                         searchReferrals, searchCCAAssets, searchFlightPlans,
 *                         searchListingAppointments, searchPropertyShowings,
 *                         searchRecurringExpenses, searchArchivedClients,
 *                         getClientSummary, getUpcomingAgenda,
 *                         getExpenseBreakdown, getPerformanceSummary,
 *                         comparePerformance, getQuickStats
 *   Create              — createClient, createPipelineDeal, createContactTask,
 *                         createRecurringExpense, addPropertyShowing,
 *                         addListingAppointment, createFlightPlan
 *   Update              — updateReferral, updateRecurringExpense,
 *                         updateCCAAsset, updateMileage, updatePropertyShowing
 *   Autonomous          — updatePipelineDealProbability, updatePipelineDealCloseDate,
 *                         updatePipelineDealDetails, updateGCIGoal,
 *                         updateUserSettings, archiveClient, unarchiveClient,
 *                         linkClientRelationship, removePipelineDeal,
 *                         completeContactTask, updateContactTask,
 *                         skipOutreachItem, manageFlightPlan
 *                         (none currently exposed via createCoreAgentTools)
 *   Needs-approval      — createClient, updateClientDetails, updateClientNotes,
 *                         updateClientStatus, updateClientTags, updateClientTone,
 *                         linkClientReferral, createPipelineDeal,
 *                         updatePipelineDealStage, logContactActivity,
 *                         createContactTask, createRecurringExpense,
 *                         deleteRecurringExpense, logExpense, logMileage,
 *                         updateExpense, recordReferral, recordTransaction,
 *                         updateTransaction, updatePipelineDealValue,
 *                         addCCAAsset, updateListingAppointment,
 *                         deleteExpense, deleteMileage, deleteTransaction,
 *                         deleteCCAAsset, deleteReferral,
 *                         deleteListingAppointment, deletePropertyShowing,
 *                         deleteContactActivity, deleteContactTask
 */

import { tool, type ToolSet } from "ai";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { OutreachOpportunityType, NewsletterTemplateType } from "@agent-runway/core/types/database";
import {
  draftOutreachForClient as draftOutreachForClientService,
  draftListingDescription as draftListingDescriptionService,
  draftNewsletter as draftNewsletterService,
  draftSocialPost as draftSocialPostService,
  type SocialPostTemplate,
} from "@/lib/ai/draft-services";

// ── Approval Gate ──────────────────────────────────────────────────────────
// Tools in this set require explicit user confirmation before executing.
// The Flight Crew will surface a confirmation card and wait for approval.
// Read-only tools (search*, get*) execute automatically — no gate needed.
export const NEEDS_APPROVAL_TOOLS = new Set([
  // Client mutations
  "createClient",
  "updateClientDetails",
  "updateClientNotes",
  "updateClientStatus",
  "updateClientTags",
  "updateClientTone",
  "linkClientReferral",
  // Pipeline mutations
  "createPipelineDeal",
  "updatePipelineDealStage",
  // Activity & task mutations
  "logContactActivity",
  "createContactTask",
  "deleteContactActivity",
  "deleteContactTask",
  // Expense mutations
  "createRecurringExpense",
  "deleteRecurringExpense",
  "logExpense",
  "logMileage",
  "updateExpense",
  "deleteExpense",
  "deleteMileage",
  // Referral mutations
  "recordReferral",
  "deleteReferral",
  // Transaction mutations
  "recordTransaction",
  "updateTransaction",
  "deleteTransaction",
  // Pipeline value mutations
  "updatePipelineDealValue",
  // CCA / tax assets
  "addCCAAsset",
  "deleteCCAAsset",
  // Listings & showings
  "updateListingAppointment",
  "deleteListingAppointment",
  "deletePropertyShowing",
]);

// Human-readable descriptions for approval cards
export const APPROVAL_DESCRIPTIONS: Record<string, (args: Record<string, unknown>) => string> = {
  // Client
  createClient: (args) =>
    `Add new client: ${args.name}${args.side ? ` (${args.side})` : ""}`,
  updateClientDetails: (args) =>
    `Update ${args.clientName ?? "client"}'s profile details`,
  updateClientNotes: (args) =>
    `Add note to ${args.clientName ?? "client"}: "${String(args.note ?? args.notes ?? "").slice(0, 60)}"`,
  updateClientStatus: (args) =>
    `Move ${args.clientName ?? "client"} to ${args.status}`,
  updateClientTags: (args) =>
    `${args.action === "remove" ? "Remove" : "Add"} tag "${args.tag}" ${args.action === "remove" ? "from" : "to"} ${args.clientName ?? "client"}`,
  updateClientTone: (args) =>
    `Set ${args.clientName ?? "client"}'s tone to ${args.tone}`,
  linkClientReferral: (args) =>
    `Link referral: ${args.referrerName ?? "referrer"} → ${args.referredName ?? "referred"}`,
  // Pipeline
  createPipelineDeal: (args) =>
    `Add pipeline deal: ${args.address ?? "new property"}${args.clientName ? ` for ${args.clientName}` : ""}`,
  updatePipelineDealStage: (args) =>
    `Move deal to ${args.stage}${args.address ? ` (${args.address})` : ""}`,
  // Activity & tasks
  logContactActivity: (args) =>
    `Log ${args.type} with ${args.clientName}: "${String(args.description).slice(0, 80)}"`,
  createContactTask: (args) =>
    `Create task for ${args.clientName}: "${args.title}" — due ${args.dueDate}`,
  // Expenses
  createRecurringExpense: (args) =>
    `Add recurring expense: ${args.vendor ?? args.description ?? "expense"} — $${args.amount}/mo`,
  deleteRecurringExpense: (args) =>
    `Remove recurring expense: ${args.vendor ?? args.description ?? args.expenseId ?? "expense"}`,
  logExpense: (args) =>
    `Log $${Number(args.amount).toLocaleString()} expense at ${args.vendor} on ${args.expenseDate}`,
  logMileage: (args) =>
    `Log ${args.km} km on ${args.tripDate}: "${String(args.description ?? "").slice(0, 60)}"`,
  updateExpense: (args) => {
    const changes: string[] = [];
    if (args.vendor) changes.push(`vendor → ${args.vendor}`);
    if (args.totalAmount !== undefined) changes.push(`amount → $${Number(args.totalAmount).toLocaleString()}`);
    if (args.categoryKey) changes.push(`category → ${args.categoryKey}`);
    if (args.expenseDate) changes.push(`date → ${args.expenseDate}`);
    if (args.notes !== undefined) changes.push("notes");
    return `Update expense: ${changes.length ? changes.join(", ") : "(details)"}`;
  },
  // Referrals
  recordReferral: (args) =>
    `Log ${args.direction} referral: ${args.clientName} ${args.direction === "inbound" ? "from" : "to"} ${args.partnerName}`,
  // Transactions
  recordTransaction: (args) => {
    const price = args.salePrice ? ` at $${Number(args.salePrice).toLocaleString()}` : "";
    const gci = args.gciOverride ? ` (GCI $${Number(args.gciOverride).toLocaleString()})` : "";
    return `Record transaction: ${args.address} — ${args.clientName} (${args.side}) closed ${args.closeDate}${price}${gci}`;
  },
  updateTransaction: (args) => {
    const changes: string[] = [];
    if (args.address) changes.push(`address → ${args.address}`);
    if (args.salePrice !== undefined) changes.push(`sale → $${Number(args.salePrice).toLocaleString()}`);
    if (args.commissionPct !== undefined) changes.push(`commission → ${args.commissionPct}%`);
    if (args.gciOverride !== undefined) changes.push(`GCI → $${Number(args.gciOverride).toLocaleString()}`);
    if (args.closeDate) changes.push(`close → ${args.closeDate}`);
    if (args.notes !== undefined) changes.push("notes");
    return `Update transaction ${args.transactionDescription ?? ""}: ${changes.length ? changes.join(", ") : "(details)"}`.trim();
  },
  // Pipeline value
  updatePipelineDealValue: (args) =>
    `Update ${args.dealDescription} estimated price → $${Number(args.estimatedPrice).toLocaleString()}`,
  // CCA assets
  addCCAAsset: (args) =>
    `Add CCA asset: "${args.description}" Class ${args.ccaClass} @ ${args.classRate}% — $${Number(args.cost).toLocaleString()}`,
  // Listings
  updateListingAppointment: (args) => {
    const changes: string[] = [];
    if (args.status) changes.push(`status → ${args.status}`);
    if (args.actualListPrice !== undefined) changes.push(`list $${Number(args.actualListPrice).toLocaleString()}`);
    if (args.actualSalePrice !== undefined) changes.push(`sold $${Number(args.actualSalePrice).toLocaleString()}`);
    if (args.expectedCloseDate) changes.push(`close ${args.expectedCloseDate}`);
    if (args.notes !== undefined) changes.push("notes");
    return `Update listing: ${changes.length ? changes.join(", ") : "(details)"}`;
  },
  // Deletes (destructive — irreversible)
  deleteExpense: (args) =>
    `Delete expense: ${args.expenseDescription ?? args.expenseId} — cannot be undone`,
  deleteMileage: (args) =>
    `Delete mileage entry: ${args.tripDescription ?? args.mileageId} — cannot be undone`,
  deleteTransaction: (args) =>
    `Delete transaction: ${args.transactionDescription ?? args.transactionId} — will adjust YTD GCI and pace`,
  deleteCCAAsset: (args) =>
    `Remove CCA asset: "${args.assetDescription ?? args.assetId}" from depreciation schedule`,
  deleteReferral: (args) =>
    `Delete referral: ${args.referralDescription ?? args.referralId} — cannot be undone`,
  deleteListingAppointment: (args) =>
    `Delete listing appointment: ${args.appointmentDescription ?? args.appointmentId}`,
  deletePropertyShowing: (args) =>
    `Delete property showing: ${args.showingDescription ?? args.showingId}`,
  deleteContactActivity: (args) =>
    `Delete activity: ${args.activityDescription ?? args.activityId}`,
  deleteContactTask: (args) =>
    `Delete task: "${args.taskTitle ?? args.taskId}"`,
};

// ── Types ────────────────────────────────────────────────────────────────────

const CLIENT_STATUSES = ["boarding", "scheduled", "in_flight", "cruising"] as const;
const ACTIVITY_TYPES = ["call", "email", "text", "showing", "meeting", "offer", "note"] as const;
const PIPELINE_STAGES = ["lead", "showing", "offer", "conditional", "firm", "closed"] as const;
const EXPENSE_CATEGORY_KEYS = ["vehicle", "marketing", "office_tech", "professional_fees", "travel_meals", "insurance_licenses", "education_dev", "other"] as const;
const TRANSACTION_SIDES = ["buyer", "seller", "both"] as const;
const ARCHIVE_REASONS = ["deceased", "moved_away", "do_not_contact", "other"] as const;

// ── Factory ──────────────────────────────────────────────────────────────────

/**
 * Create all Flight Crew tools bound to the authenticated Supabase client.
 * Pass the result directly to streamText({ tools: createAgentTools(...) }).
 */
export function createAgentTools(supabase: SupabaseClient, userId: string): ToolSet {
  return {

    // ── SEARCH: Find clients by name ─────────────────────────────────────────
    searchClients: tool({
      description: "Search for clients by name to find their ID before taking action. Always search first when the user mentions a client by name. Returns matching clients with their ID, name, and current flight status.",
      inputSchema: z.object({
        query: z.string().describe("The client name or partial name to search for"),
      }),
      execute: async ({ query }) => {
        try {
          const { data, error } = await supabase
            .from("clients")
            .select("id, name, status, last_contact_at")
            .eq("user_id", userId)
            .is("archived_at", null)
            .ilike("name", `%${query}%`)
            .limit(5);

          if (error) return `Search failed: ${error.message}`;
          if (!data || data.length === 0) return `No clients found matching "${query}". Ask the user to confirm the name.`;

          return data.map((c: { id: string; name: string; status: string; last_contact_at: string | null }) =>
            `${c.name} (ID: ${c.id}, Status: ${c.status}, Last contact: ${c.last_contact_at ? new Date(c.last_contact_at).toLocaleDateString("en-CA") : "never"})`
          ).join("\n");
        } catch {
          return "Client search temporarily unavailable.";
        }
      },
    }),

    // ── SEARCH: Find pipeline deals ───────────────────────────────────────────
    searchPipelineDeals: tool({
      description: "Search for pipeline deals by address or client name to find their ID before taking action. Always search first when the user mentions a specific deal.",
      inputSchema: z.object({
        query: z.string().describe("The property address or client name to search for"),
      }),
      execute: async ({ query }) => {
        try {
          const { data, error } = await supabase
            .from("pipeline_deals")
            .select("id, address, client_name, stage, estimated_price, expected_close_date")
            .eq("user_id", userId)
            .or(`address.ilike.%${query}%,client_name.ilike.%${query}%`)
            .limit(5);

          if (error) return `Search failed: ${error.message}`;
          if (!data || data.length === 0) return `No pipeline deals found matching "${query}". Ask the user to confirm the address or client name.`;

          return data.map((d: { id: string; address: string; client_name: string; stage: string; estimated_price: number; expected_close_date: string | null }) =>
            `${d.address} — ${d.client_name} (ID: ${d.id}, Stage: ${d.stage}, Price: $${Number(d.estimated_price).toLocaleString()}, Close: ${d.expected_close_date ?? "not set"})`
          ).join("\n");
        } catch {
          return "Pipeline deal search temporarily unavailable.";
        }
      },
    }),

    // ── CREATE CLIENT ─────────────────────────────────────────────────────────
    createClient: tool({
      description: "Create a new client in the CRM. Use this when the agent mentions a new person they're working with who doesn't exist yet. Always searchClients first to avoid duplicates. Returns the new client's UUID so you can chain it into createPipelineDeal if needed.",
      inputSchema: z.object({
        name: z.string().describe("Full name of the client (e.g. 'John Smith')"),
        email: z.string().optional().describe("Client email address"),
        phone: z.string().optional().describe("Client phone number"),
        city: z.string().optional().describe("Client's HOME city/address — NOT their buyer search area"),
        buyerTargetArea: z.string().optional().describe("Where the buyer is LOOKING to purchase (city, neighbourhood, or region)"),
        status: z.enum(CLIENT_STATUSES).default("boarding").describe("Initial flight status — defaults to 'boarding' (active lead)"),
        propertyInterest: z.number().optional().describe("Budget (buyer) or expected listing price (seller) in dollars"),
        propertyInterestType: z.enum(["budget", "listing"]).optional().describe("Whether the amount is a buyer budget or seller listing price"),
        side: z.enum(["buyer", "seller"]).optional().describe("Whether this client is a buyer or seller — helps set defaults"),
        timeframe: z.enum(["asap", "1_3_months", "3_6_months", "6_12_months", "12_plus", "unknown"]).optional().describe("Buying/selling timeframe"),
        notes: z.string().optional().describe("Any initial notes about the client"),
        leadSource: z.enum(["referral", "sphere", "open_house", "online", "sign_call", "cold_call", "door_knock", "social_media", "repeat", "other"]).optional().describe("How this client came to the agent"),
      }),
      needsApproval: true,
      execute: async ({ name, email, phone, city, buyerTargetArea, status, propertyInterest, propertyInterestType, side, timeframe, notes, leadSource }) => {
        try {
          const nameSearch = name.toLowerCase().trim();

          // Check for duplicate
          const { data: existing } = await supabase
            .from("clients")
            .select("id, name")
            .eq("user_id", userId)
            .eq("name_search", nameSearch)
            .is("archived_at", null)
            .limit(1);

          if (existing && existing.length > 0) {
            return `A client named "${existing[0].name}" already exists (ID: ${existing[0].id}). No new client created. Use their existing ID for any follow-up actions.`;
          }

          // Split name into first/last
          const nameParts = name.trim().split(/\s+/);
          const firstName = nameParts[0] ?? "";
          const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : "";

          // Build insert object
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const record: Record<string, any> = {
            user_id: userId,
            name: name.trim(),
            name_search: nameSearch,
            first_name: firstName,
            last_name: lastName,
            status: status ?? "boarding",
          };

          if (email) record.email = email;
          if (phone) record.phone = phone;
          if (city) record.city = city;
          if (buyerTargetArea) record.buyer_target_area = buyerTargetArea;
          if (propertyInterest !== undefined) record.property_interest = propertyInterest;
          if (propertyInterestType) record.property_interest_type = propertyInterestType;
          else if (side === "seller") record.property_interest_type = "listing";
          else if (side === "buyer") record.property_interest_type = "budget";
          if (timeframe) record.timeframe = timeframe;
          if (notes) record.notes = notes;
          if (leadSource) record.lead_source = leadSource;

          const { data, error } = await supabase
            .from("clients")
            .insert(record)
            .select("id")
            .single();

          if (error) return `Failed to create client: ${error.message}`;

          const details: string[] = [];
          if (city) details.push(city);
          if (side) details.push(side);
          if (propertyInterest) details.push(`$${propertyInterest.toLocaleString()}`);

          // Build follow-up: identify what important fields are still missing
          const missing: string[] = [];
          if (!email) missing.push("email");
          if (!phone) missing.push("phone");
          if (!city) missing.push("city");
          if (!leadSource) missing.push("lead source");
          if (!timeframe) missing.push("timeframe");
          if (propertyInterest === undefined) missing.push(side === "seller" ? "listing price" : "budget");

          let result = `✓ New client created — ${name.trim()}${details.length ? ` (${details.join(", ")})` : ""}, status: ${status ?? "boarding"}. Client ID: ${data.id}`;

          if (missing.length > 0) {
            result += `\n\nMISSING_FIELDS: ${missing.join(", ")}. Direct the agent to /crm to find ${name.trim()}'s profile and fill in the details.`;
          }

          return result;
        } catch {
          return "Failed to create client. Please try again.";
        }
      },
    }),

    // ── CREATE PIPELINE DEAL ──────────────────────────────────────────────────
    createPipelineDeal: tool({
      description: "Create a new pipeline deal (active or prospective listing/purchase). Use this when the agent mentions a new property they're working on. If the client already exists, pass their clientId to link it. Always searchClients first if a client name is mentioned.",
      inputSchema: z.object({
        address: z.string().describe("Property address (e.g. '44 Main Street, Saint John')"),
        clientName: z.string().describe("Client name associated with this deal"),
        clientId: z.string().uuid().optional().describe("UUID of the linked CRM client (from searchClients or createClient). Pass this to link the deal to the client record."),
        side: z.enum(TRANSACTION_SIDES).describe("Agent side: buyer, seller, or both"),
        estimatedPrice: z.number().min(0).describe("Expected sale/list price in dollars"),
        commissionPct: z.number().min(0).max(10).optional().describe("Commission rate as a percentage (e.g. 2.5 for 2.5%). Defaults to 2.5%"),
        stage: z.enum(PIPELINE_STAGES).default("lead").describe("Initial pipeline stage — defaults to 'lead'"),
        expectedCloseDate: z.string().optional().describe("Expected close date in YYYY-MM-DD format"),
        notes: z.string().optional().describe("Any notes about this deal"),
      }),
      needsApproval: true,
      execute: async ({ address, clientName, clientId, side, estimatedPrice, commissionPct, stage, expectedCloseDate, notes }) => {
        try {
          const commissionDecimal = commissionPct ? commissionPct / 100 : 0.025;

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const record: Record<string, any> = {
            user_id: userId,
            address,
            client_name: clientName,
            side,
            estimated_price: estimatedPrice,
            estimated_commission_pct: commissionDecimal,
            original_estimated_price: estimatedPrice,
            stage: stage ?? "lead",
            notes: notes ?? "",
          };

          if (clientId) record.client_id = clientId;
          if (expectedCloseDate) record.expected_close_date = expectedCloseDate;

          const { data, error } = await supabase
            .from("pipeline_deals")
            .insert(record)
            .select("id")
            .single();

          if (error) return `Failed to create pipeline deal: ${error.message}`;

          const gci = estimatedPrice * commissionDecimal;

          // Build follow-up: identify what's missing
          const missing: string[] = [];
          if (!expectedCloseDate) missing.push("expected close date");
          if (!clientId) missing.push("linked CRM client");
          if (!notes) missing.push("deal notes");

          let result = `✓ Pipeline deal created — ${address} (${clientName}, ${side} side), $${estimatedPrice.toLocaleString()} list price, ~$${gci.toLocaleString()} GCI, stage: ${stage ?? "lead"}. Deal ID: ${data.id}`;

          if (missing.length > 0) {
            result += `\n\nMISSING_FIELDS: ${missing.join(", ")}. Direct the agent to /pipeline to fill in remaining details.`;
          }

          return result;
        } catch {
          return "Failed to create pipeline deal. Please try again.";
        }
      },
    }),

    // ── LOG CONTACT ACTIVITY ─────────────────────────────────────────────────
    logContactActivity: tool({
      description: "Log a contact activity (call, email, text, showing, meeting, offer, or note) for a client. Also automatically updates the client's last contact date. Use this whenever the agent mentions they contacted, met, or interacted with a client.",
      inputSchema: z.object({
        clientId: z.string().uuid().describe("The client UUID from searchClients"),
        clientName: z.string().describe("Client name for confirmation message"),
        type: z.enum(ACTIVITY_TYPES).describe("Type of activity"),
        description: z.string().describe("Brief description of the activity"),
        activityDate: z.string().optional().describe("ISO date string (YYYY-MM-DD) — defaults to today if not provided"),
      }),
      needsApproval: true,
      execute: async ({ clientId, clientName, type, description, activityDate }) => {
        try {
          const now = new Date();
          const dateStr = activityDate ?? now.toISOString().split("T")[0];
          const activityTimestamp = activityDate
            ? new Date(activityDate + "T12:00:00").toISOString()
            : now.toISOString();

          // Read status BEFORE insert so we can detect Phase 3 auto-promotion.
          // The DB trigger update_client_last_contact() now both updates
          // last_contact_at AND auto-promotes cruising/scheduled → boarding
          // when a real touchpoint is logged (migration 00105).
          const { data: beforeRow } = await supabase
            .from("clients")
            .select("status")
            .eq("id", clientId)
            .eq("user_id", userId)
            .single();
          const oldStatus = beforeRow?.status as string | undefined;

          const { error: insertError } = await supabase.from("contact_activities").insert({
            user_id: userId,
            client_id: clientId,
            type,
            description,
            activity_date: activityTimestamp,
          });
          if (insertError) return `Failed to log activity: ${insertError.message}`;

          // Re-read status to see if the trigger promoted the client.
          const { data: afterRow } = await supabase
            .from("clients")
            .select("status")
            .eq("id", clientId)
            .eq("user_id", userId)
            .single();
          const newStatus = afterRow?.status as string | undefined;

          const promoted = oldStatus && newStatus && oldStatus !== newStatus;
          const base = `✓ Logged ${type} with ${clientName} on ${dateStr}. Last contact date updated.`;
          return promoted
            ? `${base} Auto-promoted from ${oldStatus} → ${newStatus}.`
            : base;
        } catch {
          return "Failed to log activity. Please try again.";
        }
      },
    }),

    // ── UPDATE CLIENT STATUS (FLIGHT STATUS) ─────────────────────────────────
    updateClientStatus: tool({
      description: "Update a client's flight status. Valid statuses: boarding (active lead, not yet under contract), scheduled (future intent — plans to act later, REQUIRES scheduledFor or scheduledPhrase), in_flight (under contract / transaction in progress), cruising (past client or long-term nurture).",
      inputSchema: z.object({
        clientId: z.string().uuid().describe("The client UUID from searchClients"),
        clientName: z.string().describe("Client name for confirmation message"),
        status: z.enum(CLIENT_STATUSES).describe("New flight status"),
        scheduledFor: z.string().optional().describe("REQUIRED when status='scheduled': ISO date (YYYY-MM-DD) the client plans to act. Set this OR scheduledPhrase."),
        scheduledPhrase: z.string().optional().describe("Vague timing phrase like 'after the holidays' or 'spring 2026'. Use when an exact date isn't known. Required (with scheduledFor as alternative) when status='scheduled'."),
      }),
      needsApproval: true,
      execute: async ({ clientId, clientName, status, scheduledFor, scheduledPhrase }) => {
        try {
          // Scheduled stage requires future-intent context; otherwise it becomes a data-dead end
          // (no detection engine has anything to surface).
          if (status === "scheduled" && !scheduledFor && !scheduledPhrase) {
            return "Cannot move to Scheduled without a target date. Please provide either scheduledFor (YYYY-MM-DD) or scheduledPhrase (e.g. 'spring 2026').";
          }

          const updates: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
          if (scheduledFor !== undefined) updates.scheduled_for = scheduledFor;
          if (scheduledPhrase !== undefined) updates.scheduled_phrase = scheduledPhrase;
          // Moving OUT of Scheduled — clear the future-intent fields so they don't linger as stale data.
          if (status !== "scheduled") {
            updates.scheduled_for = null;
            updates.scheduled_phrase = null;
          }

          const { error } = await supabase
            .from("clients")
            .update(updates)
            .eq("id", clientId)
            .eq("user_id", userId);

          if (error) return `Failed to update status: ${error.message}`;

          const statusLabels: Record<string, string> = {
            boarding: "Boarding (active lead)",
            scheduled: "Scheduled (future intent)",
            in_flight: "In-Flight (under contract)",
            cruising: "Cruising (past client / nurture)",
          };

          const timingNote =
            status === "scheduled" && (scheduledFor || scheduledPhrase)
              ? ` (target: ${scheduledFor ?? scheduledPhrase})`
              : "";

          return `✓ ${clientName}'s status updated to ${statusLabels[status] ?? status}${timingNote}.`;
        } catch {
          return "Failed to update client status. Please try again.";
        }
      },
    }),

    // ── UPDATE CLIENT NOTES ───────────────────────────────────────────────────
    updateClientNotes: tool({
      description: "Add a note to a client's notes log. Each call creates a new timestamped note entry visible in the client's Notes section.",
      inputSchema: z.object({
        clientId: z.string().uuid().describe("The client UUID from searchClients"),
        clientName: z.string().describe("Client name for confirmation message"),
        note: z.string().describe("The note text to add"),
      }),
      needsApproval: true,
      execute: async ({ clientId, clientName, note }) => {
        try {
          const { error } = await supabase
            .from("client_notes")
            .insert({
              user_id: userId,
              client_id: clientId,
              content: note,
            });

          if (error) return `Failed to add note: ${error.message}`;

          // Also touch the client's updated_at so it shows as recently modified
          await supabase
            .from("clients")
            .update({ updated_at: new Date().toISOString() })
            .eq("id", clientId)
            .eq("user_id", userId);

          return `✓ Note added to ${clientName}'s profile.`;
        } catch {
          return "Failed to add client note. Please try again.";
        }
      },
    }),

    // ── UPDATE CLIENT DETAILS ─────────────────────────────────────────────────
    updateClientDetails: tool({
      description: "Update a client's key details such as budget, property interest, timeframe, preferred contact method, or financing details. Only pass the fields that need updating.",
      inputSchema: z.object({
        clientId: z.string().uuid().describe("The client UUID from searchClients"),
        clientName: z.string().describe("Client name for confirmation message"),
        birthdate: z.string().optional().describe("Client birthday in YYYY-MM-DD format — triggers birthday outreach in Flight Control"),
        leadSource: z.enum(["referral", "sphere", "open_house", "online", "sign_call", "cold_call", "door_knock", "social_media", "repeat", "other"]).optional().describe("How this client was sourced"),
        provinceRegion: z.string().optional().describe("Client's province or region"),
        scheduledFor: z.string().optional().describe("Future date when client plans to act (YYYY-MM-DD)"),
        scheduledPhrase: z.string().optional().describe("Vague timing phrase like 'after the holidays' or 'spring 2026'"),
        secondaryEmail: z.string().optional().describe("Secondary email address"),
        secondaryPhone: z.string().optional().describe("Secondary phone number"),
        propertyInterest: z.number().optional().describe("Budget (buyer) or expected listing price (seller) in dollars"),
        propertyInterestType: z.enum(["budget", "listing"]).optional().describe("Whether the amount is a buyer budget or seller listing price"),
        timeframe: z.enum(["asap", "1_3_months", "3_6_months", "6_12_months", "12_plus", "unknown"]).optional().describe("Buying/selling timeframe"),
        preferredContact: z.enum(["phone", "email", "text"]).optional().describe("Preferred contact method"),
        buyerPreApproved: z.boolean().optional().describe("Whether buyer is pre-approved for financing"),
        buyerPreApprovalAmount: z.number().optional().describe("Pre-approval amount in dollars"),
        buyerFinancingType: z.enum(["mortgage", "cash", "bridge", "unknown"]).optional().describe("Buyer financing type"),
        buyerTargetCloseDate: z.string().optional().describe("Target close date in YYYY-MM-DD format"),
        city: z.string().optional().describe("Client's HOME city/address — NOT their buyer search area. Only use for where the client lives."),
        buyerTargetArea: z.string().optional().describe("Where the buyer is LOOKING to purchase (city, neighbourhood, or region). Use this instead of 'city' for search areas."),
        email: z.string().optional().describe("Client email address"),
        phone: z.string().optional().describe("Client phone number"),
      }),
      needsApproval: true,
      execute: async ({ clientId, clientName, ...fields }) => {
        try {
          // Build update object from only the provided fields
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const updates: Record<string, any> = { updated_at: new Date().toISOString() };
          const changed: string[] = [];

          if (fields.birthdate !== undefined) { updates.birthdate = fields.birthdate; changed.push(`birthday → ${fields.birthdate}`); }
          if (fields.leadSource !== undefined) { updates.lead_source = fields.leadSource; changed.push(`lead source → ${fields.leadSource}`); }
          if (fields.provinceRegion !== undefined) { updates.province_region = fields.provinceRegion; changed.push(`province/region → ${fields.provinceRegion}`); }
          if (fields.scheduledFor !== undefined) { updates.scheduled_for = fields.scheduledFor; changed.push(`scheduled for → ${fields.scheduledFor}`); }
          if (fields.scheduledPhrase !== undefined) { updates.scheduled_phrase = fields.scheduledPhrase; changed.push(`timing → "${fields.scheduledPhrase}"`); }
          if (fields.secondaryEmail !== undefined) { updates.secondary_email = fields.secondaryEmail; changed.push(`secondary email → ${fields.secondaryEmail}`); }
          if (fields.secondaryPhone !== undefined) { updates.secondary_phone = fields.secondaryPhone; changed.push(`secondary phone → ${fields.secondaryPhone}`); }
          if (fields.propertyInterest !== undefined) { updates.property_interest = fields.propertyInterest; changed.push(`budget/price → $${fields.propertyInterest.toLocaleString()}`); }
          if (fields.propertyInterestType !== undefined) { updates.property_interest_type = fields.propertyInterestType; changed.push(`interest type → ${fields.propertyInterestType}`); }
          if (fields.timeframe !== undefined) { updates.timeframe = fields.timeframe; changed.push(`timeframe → ${fields.timeframe.replace(/_/g, " ")}`); }
          if (fields.preferredContact !== undefined) { updates.preferred_contact = fields.preferredContact; changed.push(`preferred contact → ${fields.preferredContact}`); }
          if (fields.buyerPreApproved !== undefined) { updates.buyer_pre_approved = fields.buyerPreApproved; changed.push(`pre-approved → ${fields.buyerPreApproved ? "yes" : "no"}`); }
          if (fields.buyerPreApprovalAmount !== undefined) { updates.buyer_pre_approval_amount = fields.buyerPreApprovalAmount; changed.push(`pre-approval amount → $${fields.buyerPreApprovalAmount.toLocaleString()}`); }
          if (fields.buyerFinancingType !== undefined) { updates.buyer_financing_type = fields.buyerFinancingType; changed.push(`financing → ${fields.buyerFinancingType}`); }
          if (fields.buyerTargetCloseDate !== undefined) { updates.buyer_target_close_date = fields.buyerTargetCloseDate; changed.push(`target close → ${fields.buyerTargetCloseDate}`); }
          if (fields.city !== undefined) { updates.city = fields.city; changed.push(`home city → ${fields.city}`); }
          if (fields.buyerTargetArea !== undefined) { updates.buyer_target_area = fields.buyerTargetArea; changed.push(`buyer search area → ${fields.buyerTargetArea}`); }
          if (fields.email !== undefined) { updates.email = fields.email; changed.push(`email → ${fields.email}`); }
          if (fields.phone !== undefined) { updates.phone = fields.phone; changed.push(`phone → ${fields.phone}`); }

          if (changed.length === 0) return "No fields to update were provided.";

          const { error } = await supabase
            .from("clients")
            .update(updates)
            .eq("id", clientId)
            .eq("user_id", userId);

          if (error) return `Failed to update client: ${error.message}`;

          return `✓ ${clientName}'s profile updated: ${changed.join(", ")}.`;
        } catch {
          return "Failed to update client details. Please try again.";
        }
      },
    }),

    // ── UPDATE PIPELINE DEAL STAGE ────────────────────────────────────────────
    updatePipelineDealStage: tool({
      description: "Update the stage of a pipeline deal. Stages: lead → showing → offer → conditional → firm → closed.",
      inputSchema: z.object({
        dealId: z.string().uuid().describe("The deal UUID from searchPipelineDeals"),
        dealDescription: z.string().describe("Brief deal description for confirmation (e.g. '123 Elm St — Johnson')"),
        stage: z.enum(PIPELINE_STAGES).describe("New pipeline stage"),
      }),
      needsApproval: true,
      execute: async ({ dealId, dealDescription, stage }) => {
        try {
          const { error } = await supabase
            .from("pipeline_deals")
            .update({ stage, updated_at: new Date().toISOString() })
            .eq("id", dealId)
            .eq("user_id", userId);

          if (error) return `Failed to update deal stage: ${error.message}`;

          return `✓ ${dealDescription} moved to ${stage} stage.`;
        } catch {
          return "Failed to update pipeline deal stage. Please try again.";
        }
      },
    }),

    // ── UPDATE PIPELINE DEAL PROBABILITY ─────────────────────────────────────
    updatePipelineDealProbability: tool({
      description: "Set a custom probability override on a pipeline deal (0–100%). This overrides the default stage-based probability in the weighted pipeline calculation.",
      inputSchema: z.object({
        dealId: z.string().uuid().describe("The deal UUID from searchPipelineDeals"),
        dealDescription: z.string().describe("Brief deal description for confirmation"),
        probabilityPct: z.number().min(0).max(100).describe("Probability as a percentage, e.g. 65 for 65%"),
      }),
      execute: async ({ dealId, dealDescription, probabilityPct }) => {
        try {
          const probabilityOverride = probabilityPct / 100;
          const { error } = await supabase
            .from("pipeline_deals")
            .update({ probability_override: probabilityOverride, updated_at: new Date().toISOString() })
            .eq("id", dealId)
            .eq("user_id", userId);

          if (error) return `Failed to update probability: ${error.message}`;

          return `✓ ${dealDescription} probability set to ${probabilityPct}%.`;
        } catch {
          return "Failed to update deal probability. Please try again.";
        }
      },
    }),

    // ── UPDATE PIPELINE DEAL CLOSE DATE ──────────────────────────────────────
    updatePipelineDealCloseDate: tool({
      description: "Update the expected close date on a pipeline deal.",
      inputSchema: z.object({
        dealId: z.string().uuid().describe("The deal UUID from searchPipelineDeals"),
        dealDescription: z.string().describe("Brief deal description for confirmation"),
        closeDate: z.string().describe("New expected close date in YYYY-MM-DD format"),
      }),
      execute: async ({ dealId, dealDescription, closeDate }) => {
        try {
          const { error } = await supabase
            .from("pipeline_deals")
            .update({ expected_close_date: closeDate, updated_at: new Date().toISOString() })
            .eq("id", dealId)
            .eq("user_id", userId);

          if (error) return `Failed to update close date: ${error.message}`;

          return `✓ ${dealDescription} expected close date updated to ${closeDate}.`;
        } catch {
          return "Failed to update deal close date. Please try again.";
        }
      },
    }),

    // ── UPDATE GCI GOAL ───────────────────────────────────────────────────────
    updateGCIGoal: tool({
      description: "Update the agent's annual GCI goal. Use this when the agent explicitly tells you they are revising their income goal for the year.",
      inputSchema: z.object({
        goalGCI: z.number().positive().describe("New annual GCI goal in dollars"),
      }),
      execute: async ({ goalGCI }) => {
        try {
          const { error } = await supabase
            .from("user_settings")
            .update({ goal_gci: goalGCI, updated_at: new Date().toISOString() })
            .eq("user_id", userId);

          if (error) return `Failed to update GCI goal: ${error.message}`;

          return `✓ Annual GCI goal updated to $${goalGCI.toLocaleString()}. Your projections and pace metrics will reflect this immediately.`;
        } catch {
          return "Failed to update GCI goal. Please try again.";
        }
      },
    }),

    // ── ARCHIVE CLIENT ────────────────────────────────────────────────────────
    archiveClient: tool({
      description: "Archive a client, removing them from active views. This is reversible. Only do this when the agent explicitly asks to archive or remove a client. Always confirm with the agent before calling this tool.",
      inputSchema: z.object({
        clientId: z.string().uuid().describe("The client UUID from searchClients"),
        clientName: z.string().describe("Client name for confirmation message"),
        reason: z.enum(ARCHIVE_REASONS).describe("Reason for archiving"),
      }),
      execute: async ({ clientId, clientName, reason }) => {
        try {
          const { error } = await supabase
            .from("clients")
            .update({
              archived_at: new Date().toISOString(),
              archive_reason: reason,
              updated_at: new Date().toISOString(),
            })
            .eq("id", clientId)
            .eq("user_id", userId);

          if (error) return `Failed to archive client: ${error.message}`;

          return `✓ ${clientName} has been archived (reason: ${reason.replace(/_/g, " ")}). You can restore them from the CRM if needed.`;
        } catch {
          return "Failed to archive client. Please try again.";
        }
      },
    }),

    // ── LOG EXPENSE (confirm required) ────────────────────────────────────────
    logExpense: tool({
      description: "Log a business expense. Category keys: vehicle, marketing, office_tech, professional_fees, travel_meals, insurance_licenses, education_dev, other.",
      inputSchema: z.object({
        vendor: z.string().describe("Business or vendor name (e.g. 'Shell', 'Facebook Ads', 'Rogers')"),
        amount: z.number().positive().describe("Expense total in dollars"),
        categoryKey: z.enum(EXPENSE_CATEGORY_KEYS).describe("Expense category key"),
        expenseDate: z.string().describe("Expense date in YYYY-MM-DD format"),
        notes: z.string().optional().describe("Optional notes about the expense"),
      }),
      needsApproval: true,
      execute: async ({ vendor, amount, categoryKey, expenseDate, notes }) => {
        const categoryLabels: Record<string, string> = {
          vehicle: "Vehicle",
          marketing: "Marketing",
          office_tech: "Office & Tech",
          professional_fees: "Professional Fees",
          travel_meals: "Travel & Meals",
          insurance_licenses: "Insurance & Licenses",
          education_dev: "Education & Development",
          other: "Other",
        };

        try {
          const { error } = await supabase
            .from("receipt_expenses")
            .insert({
              user_id: userId,
              vendor,
              expense_date: expenseDate,
              total_amount: amount,
              category_key: categoryKey,
              notes: notes ?? null,
              currency: "CAD",
            });

          if (error) return `Failed to log expense: ${error.message}`;

          return `✓ $${amount.toLocaleString()} expense logged — ${vendor} (${categoryLabels[categoryKey] ?? categoryKey}) on ${expenseDate}.`;
        } catch {
          return "Failed to log expense. Please try again.";
        }
      },
    }),

    // ── RECORD CLOSED TRANSACTION (confirm required) ──────────────────────────
    recordTransaction: tool({
      description: "Record a closed real estate transaction. Gated by the approval card — just call the tool when the agent describes a deal they closed. Use gciOverride to enter the exact commission received; otherwise set salePrice and commissionPct and it will be calculated automatically.",
      inputSchema: z.object({
        address: z.string().describe("Property address"),
        clientName: z.string().describe("Client name"),
        side: z.enum(TRANSACTION_SIDES).describe("Agent side: buyer, seller, or both"),
        closeDate: z.string().describe("Close date in YYYY-MM-DD format"),
        salePrice: z.number().positive().optional().describe("Property sale price in dollars"),
        commissionPct: z.number().min(0).max(10).optional().describe("Commission rate as a percentage, e.g. 2.5 for 2.5%"),
        gciOverride: z.number().positive().optional().describe("Exact GCI received in dollars — use this instead of salePrice + commissionPct when you know the final commission amount"),
        notes: z.string().optional().describe("Optional transaction notes"),
      }),
      needsApproval: true,
      execute: async ({ address, clientName, side, closeDate, salePrice, commissionPct, gciOverride, notes }) => {
        // Calculate GCI for the success message
        let previewGCI: number | null = null;
        if (gciOverride) {
          previewGCI = gciOverride;
        } else if (salePrice && commissionPct) {
          previewGCI = salePrice * (commissionPct / 100);
        }

        try {
          if (!salePrice && !gciOverride) {
            return "Please provide either the sale price + commission rate, or the exact GCI amount.";
          }

          const { error } = await supabase
            .from("transactions")
            .insert({
              user_id: userId,
              date: closeDate,
              address,
              client_name: clientName,
              side,
              sale_price: salePrice ?? 0,
              commission_pct: commissionPct ? commissionPct / 100 : 0.025,
              gci_override: gciOverride ?? null,
              status: "closed",
              notes: notes ?? "",
            });

          if (error) return `Failed to record transaction: ${error.message}`;

          const gciStr = previewGCI ? ` GCI: $${previewGCI.toLocaleString()}.` : ".";
          return `✓ Transaction recorded — ${address} (${clientName}, ${side}) closed ${closeDate}.${gciStr} Your YTD metrics will update on next page refresh.`;
        } catch {
          return "Failed to record transaction. Please try again.";
        }
      },
    }),

    // ── UNARCHIVE CLIENT ───────────────────────────────────────────────────────
    unarchiveClient: tool({
      description: "Restore an archived client back to active status. Use when the agent wants to bring someone back from the archive/Hangar.",
      inputSchema: z.object({
        clientId: z.string().uuid().describe("The client UUID"),
        clientName: z.string().describe("Client name for confirmation message"),
      }),
      execute: async ({ clientId, clientName }) => {
        try {
          const { error } = await supabase
            .from("clients")
            .update({
              archived_at: null,
              archive_reason: null,
              status: "cruising",
              updated_at: new Date().toISOString(),
            })
            .eq("id", clientId)
            .eq("user_id", userId);

          if (error) return `Failed to restore client: ${error.message}`;

          return `✓ ${clientName} has been restored from the archive with status Cruising. You can update their status if needed.`;
        } catch {
          return "Failed to restore client. Please try again.";
        }
      },
    }),

    // ── REMOVE PIPELINE DEAL ─────────────────────────────────────────────────
    removePipelineDeal: tool({
      description: "Delete a pipeline deal that fell through or was entered by mistake. This permanently removes the deal. Always confirm with the agent before calling this tool.",
      inputSchema: z.object({
        dealId: z.string().uuid().describe("The deal UUID from searchPipelineDeals"),
        dealDescription: z.string().describe("Brief description for confirmation (e.g. '44 Main St — John Smith')"),
      }),
      execute: async ({ dealId, dealDescription }) => {
        try {
          const { error } = await supabase
            .from("pipeline_deals")
            .delete()
            .eq("id", dealId)
            .eq("user_id", userId);

          if (error) return `Failed to remove deal: ${error.message}`;

          return `✓ Pipeline deal removed — ${dealDescription}. This will no longer appear in your pipeline or forecasts.`;
        } catch {
          return "Failed to remove pipeline deal. Please try again.";
        }
      },
    }),

    // ── UPDATE PIPELINE DEAL DETAILS ─────────────────────────────────────────
    updatePipelineDealDetails: tool({
      description: "Update multiple fields on a pipeline deal at once — address, client name, side, commission rate, or notes. Only pass the fields that need updating. For stage, probability, close date, or estimated price, use the dedicated tools instead.",
      inputSchema: z.object({
        dealId: z.string().uuid().describe("The deal UUID from searchPipelineDeals"),
        dealDescription: z.string().describe("Brief deal description for confirmation"),
        address: z.string().optional().describe("New property address"),
        clientName: z.string().optional().describe("New client name"),
        clientId: z.string().uuid().optional().describe("Link or relink to a CRM client by their UUID"),
        side: z.enum(TRANSACTION_SIDES).optional().describe("New agent side: buyer, seller, or both"),
        commissionPct: z.number().min(0).max(10).optional().describe("New commission rate as percentage (e.g. 2.5 for 2.5%)"),
        notes: z.string().optional().describe("New deal notes (replaces existing)"),
      }),
      execute: async ({ dealId, dealDescription, ...fields }) => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const updates: Record<string, any> = { updated_at: new Date().toISOString() };
          const changed: string[] = [];

          if (fields.address !== undefined) { updates.address = fields.address; changed.push(`address → ${fields.address}`); }
          if (fields.clientName !== undefined) { updates.client_name = fields.clientName; changed.push(`client → ${fields.clientName}`); }
          if (fields.clientId !== undefined) { updates.client_id = fields.clientId; changed.push("linked to CRM client"); }
          if (fields.side !== undefined) { updates.side = fields.side; changed.push(`side → ${fields.side}`); }
          if (fields.commissionPct !== undefined) { updates.estimated_commission_pct = fields.commissionPct / 100; changed.push(`commission → ${fields.commissionPct}%`); }
          if (fields.notes !== undefined) { updates.notes = fields.notes; changed.push("notes updated"); }

          if (changed.length === 0) return "No fields to update were provided.";

          const { error } = await supabase
            .from("pipeline_deals")
            .update(updates)
            .eq("id", dealId)
            .eq("user_id", userId);

          if (error) return `Failed to update deal: ${error.message}`;

          return `✓ ${dealDescription} updated: ${changed.join(", ")}.`;
        } catch {
          return "Failed to update pipeline deal. Please try again.";
        }
      },
    }),

    // ── LINK CLIENT REFERRAL ───────────────────────────────────────────────────
    linkClientReferral: tool({
      description: "Create a referral relationship between two clients. Use this when the agent says 'X was referred by Y' or 'Y referred X to me'. Always search for both clients first to get their IDs. The referrer is the person who made the referral; the referred is the person who became a client because of it.",
      inputSchema: z.object({
        referrerId: z.string().uuid().describe("The UUID of the client who MADE the referral (the referrer)"),
        referrerName: z.string().describe("Name of the referring client"),
        referredId: z.string().uuid().describe("The UUID of the client who WAS REFERRED (the new client)"),
        referredName: z.string().describe("Name of the referred client"),
      }),
      needsApproval: true,
      execute: async ({ referrerId, referrerName, referredId, referredName }) => {
        try {
          // Check for existing relationship to avoid duplicates
          const { data: existing } = await supabase
            .from("client_relationships")
            .select("id")
            .eq("user_id", userId)
            .or(
              `and(client_id_a.eq.${referrerId},client_id_b.eq.${referredId}),and(client_id_a.eq.${referredId},client_id_b.eq.${referrerId})`,
            )
            .limit(1);

          if (existing && existing.length > 0) {
            return `${referrerName} and ${referredName} already have a relationship linked. No changes made.`;
          }

          // Store directionally: A = referrer, B = referred
          const { error } = await supabase
            .from("client_relationships")
            .insert({
              user_id: userId,
              client_id_a: referrerId,
              client_id_b: referredId,
              relationship_type: "referrer",
            });

          if (error) return `Failed to link referral: ${error.message}`;

          return `✓ Referral linked — ${referrerName} referred ${referredName} to you. This will show on both client profiles.`;
        } catch {
          return "Failed to link referral. Please try again.";
        }
      },
    }),

    // ── UPDATE PIPELINE DEAL VALUE (confirm required) ─────────────────────────
    updatePipelineDealValue: tool({
      description: "Update the estimated sale price of a pipeline deal. Gated by the approval card — just call the tool when the agent describes a price change.",
      inputSchema: z.object({
        dealId: z.string().uuid().describe("The deal UUID from searchPipelineDeals"),
        dealDescription: z.string().describe("Brief deal description for the approval card"),
        estimatedPrice: z.number().positive().describe("New estimated sale price in dollars"),
      }),
      needsApproval: true,
      execute: async ({ dealId, dealDescription, estimatedPrice }) => {
        try {
          const { error } = await supabase
            .from("pipeline_deals")
            .update({ estimated_price: estimatedPrice, updated_at: new Date().toISOString() })
            .eq("id", dealId)
            .eq("user_id", userId);

          if (error) return `Failed to update deal value: ${error.message}`;

          return `✓ ${dealDescription} estimated price updated to $${estimatedPrice.toLocaleString()}.`;
        } catch {
          return "Failed to update pipeline deal value. Please try again.";
        }
      },
    }),

    // ── CREATE CONTACT TASK ─────────────────────────────────────────────────
    createContactTask: tool({
      description: "Create a follow-up task or reminder for a client. Use this when the agent says 'remind me to call X next week' or 'I need to follow up with X about Y'. Tasks appear in the CRM and can have a due date and priority.",
      inputSchema: z.object({
        clientId: z.string().uuid().describe("The client UUID from searchClients"),
        clientName: z.string().describe("Client name for confirmation message"),
        title: z.string().describe("Task title (e.g. 'Follow up on pre-approval', 'Send listing docs')"),
        dueDate: z.string().describe("Due date in YYYY-MM-DD format"),
        priority: z.enum(["low", "normal", "high"]).default("normal").describe("Task priority"),
        notes: z.string().optional().describe("Additional task notes"),
      }),
      needsApproval: true,
      execute: async ({ clientId, clientName, title, dueDate, priority, notes }) => {
        try {
          const { error } = await supabase
            .from("contact_tasks")
            .insert({
              user_id: userId,
              client_id: clientId,
              title,
              due_date: dueDate,
              priority: priority ?? "normal",
              notes: notes ?? null,
            });

          if (error) return `Failed to create task: ${error.message}`;

          const priorityLabel = priority === "high" ? " (⚡ high priority)" : priority === "low" ? " (low priority)" : "";
          return `✓ Task created for ${clientName}: "${title}" — due ${dueDate}${priorityLabel}. You'll see this in their CRM profile at /crm.`;
        } catch {
          return "Failed to create task. Please try again.";
        }
      },
    }),

    // ── COMPLETE CONTACT TASK ────────────────────────────────────────────────
    completeContactTask: tool({
      description: "Mark a contact task as completed. Use when the agent says they've done something that matches an existing task, or explicitly asks to check off a task.",
      inputSchema: z.object({
        taskId: z.string().uuid().describe("The task UUID"),
        taskTitle: z.string().describe("Task title for confirmation message"),
      }),
      execute: async ({ taskId, taskTitle }) => {
        try {
          const { error } = await supabase
            .from("contact_tasks")
            .update({ completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
            .eq("id", taskId)
            .eq("user_id", userId);

          if (error) return `Failed to complete task: ${error.message}`;

          return `✓ Task completed: "${taskTitle}".`;
        } catch {
          return "Failed to complete task. Please try again.";
        }
      },
    }),

    // ── SEARCH CONTACT TASKS ─────────────────────────────────────────────────
    searchContactTasks: tool({
      description: "Search for open tasks — optionally filtered by client. Use this to find task IDs before completing them, or to show the agent their upcoming to-dos.",
      inputSchema: z.object({
        clientId: z.string().uuid().optional().describe("Filter tasks for a specific client"),
        includeCompleted: z.boolean().default(false).describe("Include completed tasks (default: only open)"),
      }),
      execute: async ({ clientId, includeCompleted }) => {
        try {
          let query = supabase
            .from("contact_tasks")
            .select("id, title, due_date, priority, notes, completed_at, client_id")
            .eq("user_id", userId)
            .order("due_date", { ascending: true })
            .limit(10);

          if (clientId) query = query.eq("client_id", clientId);
          if (!includeCompleted) query = query.is("completed_at", null);

          const { data, error } = await query;

          if (error) return `Task search failed: ${error.message}`;
          if (!data || data.length === 0) return clientId ? "No open tasks for this client." : "No open tasks found. Nice work!";

          return data.map((t: { id: string; title: string; due_date: string; priority: string; notes: string | null; completed_at: string | null }) => {
            const status = t.completed_at ? "✓ done" : `due ${t.due_date}`;
            const pri = t.priority === "high" ? " ⚡" : "";
            return `${t.title}${pri} — ${status} (ID: ${t.id})`;
          }).join("\n");
        } catch {
          return "Task search temporarily unavailable.";
        }
      },
    }),

    // ── LOG MILEAGE ──────────────────────────────────────────────────────────
    logMileage: tool({
      description: "Log a business mileage trip for CRA vehicle expense deduction. The deduction is automatically calculated using the current CRA rate ($0.72/km for first 5,000km, $0.66/km after). Use this when the agent mentions driving to a showing, listing, or client meeting.",
      inputSchema: z.object({
        tripDate: z.string().describe("Trip date in YYYY-MM-DD format — defaults to today"),
        km: z.number().positive().describe("Kilometres driven (one way or round trip — agent should specify)"),
        description: z.string().describe("Trip purpose (e.g. 'Showing at 44 Main St', 'Client meeting with John Smith')"),
        fromLocation: z.string().optional().describe("Starting point (e.g. 'Home office', '100 King St')"),
        toLocation: z.string().optional().describe("Destination (e.g. '44 Main Street, Saint John')"),
      }),
      needsApproval: true,
      execute: async ({ tripDate, km, description, fromLocation, toLocation }) => {
        const deduction = km * 0.72; // Simplified — engine handles 5K threshold

        try {
          const { error } = await supabase
            .from("mileage_logs")
            .insert({
              user_id: userId,
              trip_date: tripDate,
              km,
              description,
              from_location: fromLocation ?? null,
              to_location: toLocation ?? null,
              purpose: description,
            });

          if (error) return `Failed to log mileage: ${error.message}`;

          return `✓ Mileage logged — ${km} km on ${tripDate} for "${description}". Estimated deduction: ~$${deduction.toFixed(2)}. View all trips at /expenses (Mileage tab).`;
        } catch {
          return "Failed to log mileage. Please try again.";
        }
      },
    }),

    // ── UPDATE CLIENT TAGS ───────────────────────────────────────────────────
    updateClientTags: tool({
      description: "Add or remove tags on a client's profile. Tags help organize clients (e.g. 'VIP', 'Investor', 'First-Time Buyer', 'Referral Source'). Use mode 'add' to add tags or 'remove' to remove them.",
      inputSchema: z.object({
        clientId: z.string().uuid().describe("The client UUID from searchClients"),
        clientName: z.string().describe("Client name for confirmation message"),
        tags: z.array(z.string()).describe("Array of tag strings to add or remove"),
        mode: z.enum(["add", "remove"]).describe("'add' adds new tags, 'remove' removes specified tags"),
      }),
      needsApproval: true,
      execute: async ({ clientId, clientName, tags, mode }) => {
        try {
          // Fetch existing tags
          const { data: existing } = await supabase
            .from("clients")
            .select("tags")
            .eq("id", clientId)
            .eq("user_id", userId)
            .single();

          const currentTags: string[] = existing?.tags ?? [];

          let newTags: string[];
          if (mode === "add") {
            const tagSet = new Set([...currentTags, ...tags]);
            newTags = Array.from(tagSet);
          } else {
            const removeSet = new Set(tags.map(t => t.toLowerCase()));
            newTags = currentTags.filter(t => !removeSet.has(t.toLowerCase()));
          }

          const { error } = await supabase
            .from("clients")
            .update({ tags: newTags, updated_at: new Date().toISOString() })
            .eq("id", clientId)
            .eq("user_id", userId);

          if (error) return `Failed to update tags: ${error.message}`;

          const action = mode === "add" ? "added to" : "removed from";
          return `✓ Tags ${action} ${clientName}: ${tags.join(", ")}. Current tags: ${newTags.length > 0 ? newTags.join(", ") : "none"}.`;
        } catch {
          return "Failed to update client tags. Please try again.";
        }
      },
    }),

    // ── UPDATE USER SETTINGS ─────────────────────────────────────────────────
    updateUserSettings: tool({
      description: "Update the agent's business settings. Use this when the agent mentions changing their commission split, province, brokerage, or other settings. Only pass the fields that need updating.",
      inputSchema: z.object({
        commissionSplit: z.enum(["p70_30", "p75_25", "p80_20", "p85_15", "p90_10", "p95_5", "p100_0"]).optional().describe("Commission split preset (e.g. p80_20 = 80% agent / 20% brokerage)"),
        brokerageName: z.string().optional().describe("Brokerage/office name"),
        province: z.enum(["AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU", "ON", "PE", "QC", "SK", "YT"]).optional().describe("Agent's province code"),
        goalGCI: z.number().positive().optional().describe("Annual GCI goal in dollars"),
        goalTransactions: z.number().positive().optional().describe("Annual transaction count goal"),
        cashReserve: z.number().min(0).optional().describe("Manual cash reserve amount in dollars"),
        monthlyBrokerageFee: z.number().min(0).optional().describe("Monthly desk/brokerage fee in dollars"),
      }),
      execute: async ({ commissionSplit, brokerageName, province, goalGCI, goalTransactions, cashReserve, monthlyBrokerageFee }) => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const updates: Record<string, any> = { updated_at: new Date().toISOString() };
          const changed: string[] = [];

          if (commissionSplit) { updates.split_preset = commissionSplit; changed.push(`commission split → ${commissionSplit.replace("p", "").replace("_", "/")}`); }
          if (brokerageName) { updates.brokerage_name = brokerageName; changed.push(`brokerage → ${brokerageName}`); }
          if (province) { updates.province = province; changed.push(`province → ${province}`); }
          if (goalGCI !== undefined) { updates.goal_gci = goalGCI; changed.push(`GCI goal → $${goalGCI.toLocaleString()}`); }
          if (goalTransactions !== undefined) { updates.goal_transactions = goalTransactions; changed.push(`transaction goal → ${goalTransactions}`); }
          if (cashReserve !== undefined) { updates.cash_reserve = cashReserve; changed.push(`cash reserve → $${cashReserve.toLocaleString()}`); }
          if (monthlyBrokerageFee !== undefined) { updates.monthly_brokerage_fee = monthlyBrokerageFee; changed.push(`brokerage fee → $${monthlyBrokerageFee.toLocaleString()}/mo`); }

          if (changed.length === 0) return "No settings to update were provided.";

          const { error } = await supabase
            .from("user_settings")
            .update(updates)
            .eq("user_id", userId);

          if (error) return `Failed to update settings: ${error.message}`;

          return `✓ Settings updated: ${changed.join(", ")}. Your dashboard and projections will reflect these changes on refresh.`;
        } catch {
          return "Failed to update settings. Please try again.";
        }
      },
    }),

    // ── GET CLIENT SUMMARY (read-only power tool) ─────────────────────────
    getClientSummary: tool({
      description: "Get a comprehensive summary of a client — their profile details, recent activities, open tasks, pipeline deals, relationships, and deal history. Use this when the agent says 'tell me about [name]' or 'what do we know about [name]'. Always searchClients first to get the ID.",
      inputSchema: z.object({
        clientId: z.string().uuid().describe("The client UUID from searchClients"),
        clientName: z.string().describe("Client name for the summary header"),
      }),
      execute: async ({ clientId, clientName }) => {
        try {
          // Parallel queries for all client data
          const [clientRes, activitiesRes, tasksRes, dealsRes, relationshipsRes, transactionsRes] = await Promise.all([
            supabase.from("clients").select("name, status, email, phone, city, buyer_target_area, tags, notes, lead_source, timeframe, property_interest, property_interest_type, preferred_contact, buyer_pre_approved, buyer_pre_approval_amount, last_contact_at, created_at").eq("id", clientId).eq("user_id", userId).single(),
            supabase.from("contact_activities").select("type, description, activity_date").eq("client_id", clientId).eq("user_id", userId).order("activity_date", { ascending: false }).limit(5),
            supabase.from("contact_tasks").select("title, due_date, priority, completed_at").eq("client_id", clientId).eq("user_id", userId).is("completed_at", null).order("due_date", { ascending: true }).limit(5),
            supabase.from("pipeline_deals").select("address, stage, estimated_price, expected_close_date, side").eq("client_id", clientId).eq("user_id", userId).limit(5),
            supabase.from("client_relationships").select("client_id_a, client_id_b, relationship_type").eq("user_id", userId).or(`client_id_a.eq.${clientId},client_id_b.eq.${clientId}`).limit(5),
            supabase.from("transactions").select("address, date, sale_price, gci_override, side").eq("user_id", userId).ilike("client_name", `%${clientName}%`).limit(5),
          ]);

          const c = clientRes.data;
          if (!c) return `Could not find client data for ${clientName}.`;

          const parts: string[] = [];

          // Profile
          parts.push(`── ${clientName} ──`);
          parts.push(`Status: ${c.status} | Since: ${new Date(c.created_at).toLocaleDateString("en-CA")}`);
          if (c.email) parts.push(`Email: ${c.email}`);
          if (c.phone) parts.push(`Phone: ${c.phone}`);
          if (c.city) parts.push(`Home City: ${c.city}`);
          if (c.buyer_target_area) parts.push(`Search Area: ${c.buyer_target_area}`);
          if (c.lead_source) parts.push(`Lead Source: ${c.lead_source}`);
          if (c.tags?.length) parts.push(`Tags: ${c.tags.join(", ")}`);
          if (c.property_interest) parts.push(`${c.property_interest_type === "listing" ? "Listing Price" : "Budget"}: $${Number(c.property_interest).toLocaleString()}`);
          if (c.timeframe) parts.push(`Timeframe: ${c.timeframe.replace(/_/g, " ")}`);
          if (c.preferred_contact) parts.push(`Preferred Contact: ${c.preferred_contact}`);
          if (c.buyer_pre_approved) parts.push(`Pre-Approved: $${Number(c.buyer_pre_approval_amount ?? 0).toLocaleString()}`);
          if (c.last_contact_at) parts.push(`Last Contact: ${new Date(c.last_contact_at).toLocaleDateString("en-CA")}`);
          if (c.notes) parts.push(`Notes: ${c.notes.slice(0, 200)}${c.notes.length > 200 ? "..." : ""}`);

          // Recent activities
          const activities = activitiesRes.data ?? [];
          if (activities.length > 0) {
            parts.push(`\nRecent Activity (${activities.length}):`);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            activities.forEach((a: any) => parts.push(`  ${a.type} on ${new Date(a.activity_date).toLocaleDateString("en-CA")} — ${a.description}`));
          } else {
            parts.push("\nNo recent activity logged.");
          }

          // Open tasks
          const tasks = tasksRes.data ?? [];
          if (tasks.length > 0) {
            parts.push(`\nOpen Tasks (${tasks.length}):`);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            tasks.forEach((t: any) => parts.push(`  "${t.title}" — due ${t.due_date}${t.priority === "high" ? " ⚡" : ""}`));
          }

          // Pipeline deals
          const deals = dealsRes.data ?? [];
          if (deals.length > 0) {
            parts.push(`\nPipeline Deals (${deals.length}):`);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            deals.forEach((d: any) => parts.push(`  ${d.address} — ${d.side} side, ${d.stage} stage, $${Number(d.estimated_price).toLocaleString()}${d.expected_close_date ? `, close: ${d.expected_close_date}` : ""}`));
          }

          // Transaction history
          const txs = transactionsRes.data ?? [];
          if (txs.length > 0) {
            parts.push(`\nDeal History (${txs.length}):`);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            txs.forEach((t: any) => parts.push(`  ${t.address} — ${t.side} side, $${Number(t.sale_price).toLocaleString()}, closed ${t.date}`));
          }

          // Relationships
          const rels = relationshipsRes.data ?? [];
          if (rels.length > 0) {
            parts.push(`\nRelationships (${rels.length}):`);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            rels.forEach((r: any) => {
              const isA = r.client_id_a === clientId;
              const otherId = isA ? r.client_id_b : r.client_id_a;
              if (r.relationship_type === "referrer") {
                parts.push(`  ${isA ? "Referred" : "Referred by"} client ${otherId}`);
              } else {
                parts.push(`  ${r.relationship_type} — client ${otherId}`);
              }
            });
          }

          return parts.join("\n");
        } catch {
          return "Failed to load client summary. Please try again.";
        }
      },
    }),

    // ── GET UPCOMING AGENDA (read-only power tool) ──────────────────────────
    getUpcomingAgenda: tool({
      description: "Get the agent's upcoming agenda — open tasks, pending outreach, and stale clients needing attention. Use this when the agent says 'what's on my plate?', 'what should I focus on?', 'what do I have coming up?', or 'what's my agenda?'",
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const todayStr = new Date().toISOString().split("T")[0];
          const weekAhead = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

          const [tasksRes, outreachRes, staleRes] = await Promise.all([
            supabase.from("contact_tasks").select("title, due_date, priority, client_id").eq("user_id", userId).is("completed_at", null).order("due_date", { ascending: true }).limit(10),
            supabase.from("outreach_queue").select("client_id, opportunity_type, status, ai_subject, trigger_date").eq("user_id", userId).in("status", ["draft", "ready"]).order("trigger_date", { ascending: true }).limit(10),
            supabase.from("clients").select("name, status, last_contact_at").eq("user_id", userId).is("archived_at", null).in("status", ["boarding", "scheduled", "in_flight"]).lt("last_contact_at", new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()).limit(10),
          ]);

          const parts: string[] = ["── Your Agenda ──"];

          // Tasks
          const tasks = (tasksRes.data ?? []) as { title: string; due_date: string; priority: string }[];
          const overdue = tasks.filter(t => t.due_date < todayStr);
          const thisWeek = tasks.filter(t => t.due_date >= todayStr && t.due_date <= weekAhead);
          const later = tasks.filter(t => t.due_date > weekAhead);

          if (overdue.length > 0) {
            parts.push(`\n⚠ OVERDUE TASKS (${overdue.length}):`);
            overdue.forEach(t => parts.push(`  "${t.title}" — was due ${t.due_date}${t.priority === "high" ? " ⚡" : ""}`));
          }
          if (thisWeek.length > 0) {
            parts.push(`\nThis Week (${thisWeek.length} tasks):`);
            thisWeek.forEach(t => parts.push(`  "${t.title}" — due ${t.due_date}${t.priority === "high" ? " ⚡" : ""}`));
          }
          if (later.length > 0) {
            parts.push(`\nUpcoming (${later.length} tasks):`);
            later.forEach(t => parts.push(`  "${t.title}" — due ${t.due_date}`));
          }
          if (tasks.length === 0) parts.push("\n✓ No open tasks.");

          // Outreach
          const outreach = (outreachRes.data ?? []) as { opportunity_type: string; status: string; ai_subject: string | null; trigger_date: string }[];
          if (outreach.length > 0) {
            parts.push(`\nPending Outreach (${outreach.length}):`);
            outreach.forEach(o => {
              const type = o.opportunity_type.replace(/_/g, " ");
              parts.push(`  ${type} — ${o.status}${o.ai_subject ? `: "${o.ai_subject}"` : ""} (${o.trigger_date})`);
            });
            parts.push(`Review and send in **Flight Control** (/flight-control).`);
          }

          // Stale clients
          const stale = (staleRes.data ?? []) as { name: string; status: string; last_contact_at: string }[];
          if (stale.length > 0) {
            parts.push(`\nStale Clients (${stale.length} — no contact in 14+ days):`);
            stale.forEach(c => {
              const days = Math.floor((Date.now() - new Date(c.last_contact_at).getTime()) / (24 * 60 * 60 * 1000));
              parts.push(`  ${c.name} — ${days} days since last contact (${c.status})`);
            });
          }

          if (tasks.length === 0 && outreach.length === 0 && stale.length === 0) {
            return "All clear — no overdue tasks, pending outreach, or stale clients. You're in good shape!";
          }

          return parts.join("\n");
        } catch {
          return "Failed to load agenda. Please try again.";
        }
      },
    }),

    // ── CREATE RECURRING EXPENSE ─────────────────────────────────────────────
    createRecurringExpense: tool({
      description: "Set up a recurring monthly business expense. Use when the agent says 'I pay $X/month for...' or 'set up a recurring expense for...'",
      inputSchema: z.object({
        name: z.string().describe("Business or vendor name (e.g. 'Canva', 'Rogers', 'Desjardins Insurance')"),
        amount: z.number().positive().describe("Expense amount per month in dollars"),
        categoryKey: z.enum(EXPENSE_CATEGORY_KEYS).describe("Expense category key"),
        dayOfMonth: z.number().int().min(1).max(28).default(1).describe("Day of month the expense recurs (1-28)"),
        notes: z.string().optional().describe("Optional notes"),
      }),
      needsApproval: true,
      execute: async ({ name, amount, categoryKey, dayOfMonth, notes }) => {
        try {
          const { error } = await supabase
            .from("recurring_expenses")
            .insert({
              user_id: userId,
              name,
              amount,
              category_key: categoryKey,
              day_of_month: dayOfMonth,
              is_active: true,
              notes: notes ?? null,
            });

          if (error) return `Failed to create recurring expense: ${error.message}`;

          return `✓ Recurring expense created — $${amount.toLocaleString()}/month for ${name}, recurring on day ${dayOfMonth}. Entries will auto-generate each month for you to confirm. Manage recurring expenses in **Expenses** (/expenses) under the **Recurring** tab.`;
        } catch {
          return "Failed to create recurring expense. Please try again.";
        }
      },
    }),

    // ── SEARCH EXPENSES ──────────────────────────────────────────────────────
    searchExpenses: tool({
      description: "Search for expenses by vendor name to find their ID before deleting or reviewing. Returns matching expenses with IDs.",
      inputSchema: z.object({
        query: z.string().describe("Vendor name or partial name to search for"),
      }),
      execute: async ({ query }) => {
        try {
          const { data, error } = await supabase
            .from("receipt_expenses")
            .select("id, vendor, total_amount, expense_date, category_key")
            .eq("user_id", userId)
            .ilike("vendor", `%${query}%`)
            .order("expense_date", { ascending: false })
            .limit(10);

          if (error) return `Search failed: ${error.message}`;
          if (!data || data.length === 0) return `No expenses found matching "${query}".`;

          return data.map((e: { id: string; vendor: string; total_amount: number; expense_date: string; category_key: string }) =>
            `$${Number(e.total_amount).toLocaleString()} at ${e.vendor} on ${e.expense_date} (${e.category_key.replace(/_/g, " ")}) — ID: ${e.id}`
          ).join("\n");
        } catch {
          return "Expense search temporarily unavailable.";
        }
      },
    }),

    // ── DELETE EXPENSE ────────────────────────────────────────────────────────
    deleteExpense: tool({
      description: "Delete a receipt expense (e.g., duplicate entry). Always searchExpenses first to find the ID. Gated by the approval card.",
      inputSchema: z.object({
        expenseId: z.string().uuid().describe("The expense UUID from searchExpenses"),
        expenseDescription: z.string().describe("Brief description for the approval card (e.g. '$45 at Shell on 2026-04-10')"),
      }),
      needsApproval: true,
      execute: async ({ expenseId, expenseDescription }) => {
        try {
          const { error } = await supabase
            .from("receipt_expenses")
            .delete()
            .eq("id", expenseId)
            .eq("user_id", userId);

          if (error) return `Failed to delete expense: ${error.message}`;

          return `✓ Expense deleted — ${expenseDescription}. Your YTD expense totals will update on refresh.`;
        } catch {
          return "Failed to delete expense. Please try again.";
        }
      },
    }),

    // ── RECORD REFERRAL ──────────────────────────────────────────────────────
    recordReferral: tool({
      description: "Log a referral — inbound (another agent sent you a client) or outbound (you sent a client to another agent). Use when the agent mentions paying or receiving a referral fee.",
      inputSchema: z.object({
        direction: z.enum(["inbound", "outbound"]).describe("'inbound' = someone referred a client TO you. 'outbound' = you referred a client TO someone else."),
        partnerName: z.string().describe("Name of the referring/receiving agent or brokerage"),
        partnerBrokerage: z.string().optional().describe("Partner's brokerage name"),
        clientName: z.string().describe("Name of the referred client"),
        propertyAddress: z.string().optional().describe("Property address if known"),
        transactionType: z.enum(["buy", "sell", "both"]).optional().describe("Type of transaction"),
        referralFeePct: z.number().min(0).max(100).optional().describe("Referral fee as a percentage of GCI (default 25%)"),
        estimatedValue: z.number().optional().describe("Estimated referral fee amount in dollars"),
        notes: z.string().optional().describe("Optional notes"),
      }),
      needsApproval: true,
      execute: async ({ direction, partnerName, partnerBrokerage, clientName, propertyAddress, transactionType, referralFeePct, estimatedValue, notes }) => {
        const feePct = referralFeePct ?? 25;
        const dirLabel = direction === "inbound" ? "received from" : "sent to";

        try {
          const { error } = await supabase
            .from("referrals")
            .insert({
              user_id: userId,
              direction,
              partner_name: partnerName,
              partner_brokerage: partnerBrokerage ?? null,
              client_name: clientName,
              property_address: propertyAddress ?? null,
              transaction_type: transactionType ?? "buy",
              referral_fee_pct: feePct,
              estimated_value: estimatedValue ?? null,
              status: "active",
              notes: notes ?? null,
              referral_date: new Date().toISOString().split("T")[0],
            });

          if (error) return `Failed to record referral: ${error.message}`;

          return `✓ ${direction.charAt(0).toUpperCase() + direction.slice(1)} referral recorded — ${clientName} ${dirLabel} ${partnerName}, ${feePct}% fee. When the deal closes, update the actual fee paid at **Referrals** (/referrals).`;
        } catch {
          return "Failed to record referral. Please try again.";
        }
      },
    }),

    // ── SEARCH OUTREACH QUEUE ────────────────────────────────────────────────
    searchOutreachQueue: tool({
      description: "View pending outreach items in the Flight Control queue. Use when the agent asks 'what outreach do I have pending?' or 'what's in my outreach queue?'",
      inputSchema: z.object({
        status: z.enum(["draft", "ready", "all"]).default("all").describe("Filter by status: draft, ready, or all pending"),
      }),
      execute: async ({ status }) => {
        try {
          let query = supabase
            .from("outreach_queue")
            .select("id, client_id, opportunity_type, status, ai_subject, trigger_date")
            .eq("user_id", userId)
            .order("trigger_date", { ascending: true })
            .limit(10);

          if (status && status !== "all") {
            query = query.eq("status", status);
          } else {
            query = query.in("status", ["draft", "ready"]);
          }

          const { data, error } = await query;

          if (error) return `Search failed: ${error.message}`;
          if (!data || data.length === 0) return "No pending outreach items. Your queue is clear!";

          const items = data.map((o: { id: string; opportunity_type: string; status: string; ai_subject: string | null; trigger_date: string }) => {
            const type = o.opportunity_type.replace(/_/g, " ");
            return `${type} (${o.status}) — ${o.ai_subject ?? "no subject"}, due ${o.trigger_date} — ID: ${o.id}`;
          });

          return `Pending Outreach (${data.length}):\n${items.join("\n")}\n\nReview and send in **Flight Control** (/flight-control).`;
        } catch {
          return "Outreach queue search temporarily unavailable.";
        }
      },
    }),

    // ── SKIP OUTREACH ITEM ───────────────────────────────────────────────────
    skipOutreachItem: tool({
      description: "Skip/dismiss a pending outreach item (e.g., 'I already talked to Dave, skip that follow-up'). Always searchOutreachQueue first to find the ID.",
      inputSchema: z.object({
        outreachId: z.string().uuid().describe("The outreach item UUID from searchOutreachQueue"),
        outreachDescription: z.string().describe("Brief description for confirmation"),
      }),
      execute: async ({ outreachId, outreachDescription }) => {
        try {
          const { error } = await supabase
            .from("outreach_queue")
            .update({ status: "skipped", updated_at: new Date().toISOString() })
            .eq("id", outreachId)
            .eq("user_id", userId);

          if (error) return `Failed to skip outreach: ${error.message}`;

          return `✓ Outreach skipped — ${outreachDescription}. It won't appear in your queue anymore.`;
        } catch {
          return "Failed to skip outreach item. Please try again.";
        }
      },
    }),

    // ── ADD PROPERTY SHOWING ───────────────────────────────────────────────
    addPropertyShowing: tool({
      description: "Log a property showing for a buyer client. Use when the agent says 'I showed [address] to [name]' or 'we viewed [address] today'. Always searchClients first to get the client ID.",
      inputSchema: z.object({
        clientId: z.string().uuid().describe("The buyer client UUID from searchClients"),
        clientName: z.string().describe("Client name for confirmation"),
        propertyAddress: z.string().describe("Full property address shown"),
        showingDate: z.string().optional().describe("Showing date YYYY-MM-DD — defaults to today"),
        clientRating: z.number().min(1).max(5).optional().describe("Client's rating of the property (1–5)"),
        listingPrice: z.number().optional().describe("Listing price in dollars"),
        notes: z.string().optional().describe("Notes about the showing (client reaction, condition, etc.)"),
      }),
      execute: async ({ clientId, clientName, propertyAddress, showingDate, clientRating, listingPrice, notes }) => {
        try {
          const dateStr = showingDate ?? new Date().toISOString().split("T")[0];

          const { error } = await supabase
            .from("property_showings")
            .insert({
              user_id: userId,
              client_id: clientId,
              property_address: propertyAddress,
              showing_date: dateStr,
              client_rating: clientRating ?? null,
              listing_price: listingPrice ?? null,
              notes: notes ?? null,
            });

          if (error) return `Failed to log showing: ${error.message}`;

          // Count total showings for this client
          const { count } = await supabase
            .from("property_showings")
            .select("id", { count: "exact", head: true })
            .eq("client_id", clientId)
            .eq("user_id", userId);

          const ratingStr = clientRating ? ` — rated ${clientRating}/5` : "";
          return `✓ Showing logged for ${clientName} at ${propertyAddress} on ${dateStr}${ratingStr}. ${clientName} has now viewed ${count ?? "?"} properties total. View their showing history in the **CRM** (/crm).`;
        } catch {
          return "Failed to log property showing. Please try again.";
        }
      },
    }),

    // ── ADD LISTING APPOINTMENT ──────────────────────────────────────────────
    addListingAppointment: tool({
      description: "Schedule a listing appointment for a seller client. Use when the agent says 'I have a listing appointment with [name]' or 'listing presentation at [address] on [date]'. Always searchClients first.",
      inputSchema: z.object({
        clientId: z.string().uuid().describe("The seller client UUID from searchClients"),
        clientName: z.string().describe("Client name for confirmation"),
        propertyAddress: z.string().describe("Property address"),
        appointmentDate: z.string().describe("Appointment date YYYY-MM-DD"),
        estimatedListPrice: z.number().optional().describe("Agent's estimated list price in dollars"),
        notes: z.string().optional().describe("Notes about the appointment"),
      }),
      execute: async ({ clientId, clientName, propertyAddress, appointmentDate, estimatedListPrice, notes }) => {
        try {
          const { error } = await supabase
            .from("listing_appointments")
            .insert({
              user_id: userId,
              client_id: clientId,
              appointment_date: appointmentDate,
              property_address: propertyAddress,
              estimated_list_price: estimatedListPrice ?? null,
              status: "scheduled",
              notes: notes ?? null,
            });

          if (error) return `Failed to create listing appointment: ${error.message}`;

          const priceStr = estimatedListPrice ? ` (estimated $${estimatedListPrice.toLocaleString()})` : "";
          return `✓ Listing appointment scheduled — ${propertyAddress}${priceStr} with ${clientName} on ${appointmentDate}. Once the listing is secured, create a pipeline deal from **Pipeline** (/pipeline) to track it through to close.`;
        } catch {
          return "Failed to create listing appointment. Please try again.";
        }
      },
    }),

    // ── ADD CCA ASSET ────────────────────────────────────────────────────────
    addCCAAsset: tool({
      description: "Add a capital cost allowance (CCA) asset for tax depreciation. Use when the agent mentions buying business equipment (laptop, camera, vehicle, etc.). Common CCA classes: Class 8 (office equipment/furniture, 20%), Class 10 (vehicles, 30%), Class 10.1 (passenger vehicles >$37,000, 30%), Class 12 (software/tools <$500, 100%), Class 50 (computers, 55%). The half-year rule applies automatically in the acquisition year. Gated by the approval card.",
      inputSchema: z.object({
        description: z.string().describe("Asset description (e.g. 'MacBook Pro 16-inch', '2024 Honda CR-V')"),
        ccaClass: z.number().describe("CRA CCA class number (8, 10, 12, 50, etc.)"),
        classRate: z.number().min(0).max(100).describe("CCA rate as percentage (e.g. 20 for 20%, 55 for 55%)"),
        cost: z.number().positive().describe("Purchase cost in dollars"),
        acquisitionDate: z.string().describe("Purchase date YYYY-MM-DD"),
        businessUsePct: z.number().min(0).max(100).optional().describe("Business use percentage (default 100%)"),
        notes: z.string().optional().describe("Optional notes"),
      }),
      needsApproval: true,
      execute: async ({ description, ccaClass, classRate, cost, acquisitionDate, businessUsePct, notes }) => {
        const bizPct = (businessUsePct ?? 100) / 100;
        const rateDecimal = classRate / 100;
        const firstYearCCA = cost * bizPct * rateDecimal * 0.5; // half-year rule

        try {
          const { error } = await supabase
            .from("t2125_cca_assets")
            .insert({
              user_id: userId,
              cca_class: ccaClass,
              class_rate: rateDecimal,
              description,
              acquisition_date: acquisitionDate,
              original_cost: cost,
              business_use_pct: bizPct,
              opening_ucc: 0,
              additions_this_year: cost,
              notes: notes ?? null,
            });

          if (error) return `Failed to add CCA asset: ${error.message}`;

          return `✓ CCA asset added — "${description}", Class ${ccaClass} (${classRate}%), $${cost.toLocaleString()}. First-year CCA deduction: ~$${firstYearCCA.toFixed(0)} (half-year rule applied). View your full depreciation schedule at **Overhead** (/overhead) or **Reports** (/reports) → T2125 tab.`;
        } catch {
          return "Failed to add CCA asset. Please try again.";
        }
      },
    }),

    // ── LINK CLIENT RELATIONSHIP (non-referral) ─────────────────────────────
    linkClientRelationship: tool({
      description: "Link two clients as a non-referral relationship (spouse, family, colleague, other). For referral relationships, use linkClientReferral instead. Always searchClients first for both clients.",
      inputSchema: z.object({
        clientIdA: z.string().uuid().describe("First client UUID"),
        clientIdB: z.string().uuid().describe("Second client UUID"),
        nameA: z.string().describe("First client name"),
        nameB: z.string().describe("Second client name"),
        relationshipType: z.enum(["spouse", "family", "colleague", "other"]).describe("Relationship type"),
      }),
      execute: async ({ clientIdA, clientIdB, nameA, nameB, relationshipType }) => {
        try {
          // Sort alphabetically for non-referral (bidirectional) relationships
          const [sortedA, sortedB] = clientIdA < clientIdB ? [clientIdA, clientIdB] : [clientIdB, clientIdA];

          // Check for existing
          const { data: existing } = await supabase
            .from("client_relationships")
            .select("id")
            .eq("user_id", userId)
            .eq("client_id_a", sortedA)
            .eq("client_id_b", sortedB)
            .limit(1);

          if (existing && existing.length > 0) {
            return `${nameA} and ${nameB} already have a relationship linked. No changes made.`;
          }

          const { error } = await supabase
            .from("client_relationships")
            .insert({
              user_id: userId,
              client_id_a: sortedA,
              client_id_b: sortedB,
              relationship_type: relationshipType,
            });

          if (error) return `Failed to link relationship: ${error.message}`;

          return `✓ Relationship linked — ${nameA} and ${nameB} (${relationshipType}). This will show on both client profiles in the **CRM** (/crm).`;
        } catch {
          return "Failed to link relationship. Please try again.";
        }
      },
    }),

    // ── UPDATE TRANSACTION ───────────────────────────────────────────────────
    updateTransaction: tool({
      description: "Update details on a closed transaction. Use when the agent says 'change the sale price on that deal' or 'update the commission on [address]'. Gated by the approval card.",
      inputSchema: z.object({
        transactionId: z.string().uuid().describe("The transaction UUID"),
        transactionDescription: z.string().describe("Brief description for the approval card"),
        address: z.string().optional().describe("Updated property address"),
        salePrice: z.number().optional().describe("Updated sale price in dollars"),
        commissionPct: z.number().min(0).max(10).optional().describe("Updated commission rate as percentage"),
        gciOverride: z.number().optional().describe("Updated exact GCI in dollars"),
        closeDate: z.string().optional().describe("Updated close date YYYY-MM-DD"),
        notes: z.string().optional().describe("Updated notes"),
      }),
      needsApproval: true,
      execute: async ({ transactionId, transactionDescription, address, salePrice, commissionPct, gciOverride, closeDate, notes }) => {
        // Stamp edited_at so a future re-import doesn't stomp this approved correction.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const updates: Record<string, any> = {
          updated_at: new Date().toISOString(),
          edited_at:  new Date().toISOString(),
        };
        const changed: string[] = [];

        if (address !== undefined) { updates.address = address; changed.push(`address → ${address}`); }
        if (salePrice !== undefined) { updates.sale_price = salePrice; changed.push(`sale price → $${salePrice.toLocaleString()}`); }
        if (commissionPct !== undefined) { updates.commission_pct = commissionPct / 100; changed.push(`commission → ${commissionPct}%`); }
        if (gciOverride !== undefined) { updates.gci_override = gciOverride; changed.push(`GCI → $${gciOverride.toLocaleString()}`); }
        if (closeDate !== undefined) { updates.date = closeDate; changed.push(`close date → ${closeDate}`); }
        if (notes !== undefined) { updates.notes = notes; changed.push("notes updated"); }

        if (changed.length === 0) return "No fields to update were provided.";

        try {
          const { error } = await supabase
            .from("transactions")
            .update(updates)
            .eq("id", transactionId)
            .eq("user_id", userId);

          if (error) return `Failed to update transaction: ${error.message}`;

          return `✓ Transaction updated — ${transactionDescription}: ${changed.join(", ")}. YTD metrics will reflect this on refresh.`;
        } catch {
          return "Failed to update transaction. Please try again.";
        }
      },
    }),

    // ── DELETE TRANSACTION ────────────────────────────────────────────────────
    deleteTransaction: tool({
      description: "Delete a closed transaction (e.g., duplicate or entered by mistake). This permanently removes it. Gated by the approval card.",
      inputSchema: z.object({
        transactionId: z.string().uuid().describe("The transaction UUID"),
        transactionDescription: z.string().describe("Brief description for the approval card"),
      }),
      needsApproval: true,
      execute: async ({ transactionId, transactionDescription }) => {
        try {
          const { error } = await supabase
            .from("transactions")
            .delete()
            .eq("id", transactionId)
            .eq("user_id", userId);

          if (error) return `Failed to delete transaction: ${error.message}`;

          return `✓ Transaction deleted — ${transactionDescription}. Your YTD GCI, pace, and projections will update on refresh.`;
        } catch {
          return "Failed to delete transaction. Please try again.";
        }
      },
    }),

    // ── SEARCH TRANSACTIONS ──────────────────────────────────────────────────
    searchTransactions: tool({
      description: "Search for closed transactions by address or client name. Use this to find transaction IDs before updating or deleting.",
      inputSchema: z.object({
        query: z.string().describe("Property address or client name to search for"),
      }),
      execute: async ({ query }) => {
        try {
          const { data, error } = await supabase
            .from("transactions")
            .select("id, address, client_name, date, sale_price, gci_override, side, status")
            .eq("user_id", userId)
            .or(`address.ilike.%${query}%,client_name.ilike.%${query}%`)
            .order("date", { ascending: false })
            .limit(10);

          if (error) return `Search failed: ${error.message}`;
          if (!data || data.length === 0) return `No transactions found matching "${query}".`;

          return data.map((t: { id: string; address: string; client_name: string; date: string; sale_price: number; gci_override: number | null; side: string; status: string }) => {
            const gci = t.gci_override ? `GCI $${Number(t.gci_override).toLocaleString()}` : `$${Number(t.sale_price).toLocaleString()}`;
            return `${t.address} — ${t.client_name} (${t.side}, ${t.status}, ${gci}, ${t.date}) — ID: ${t.id}`;
          }).join("\n");
        } catch {
          return "Transaction search temporarily unavailable.";
        }
      },
    }),

    // ── DELETE CONTACT ACTIVITY ───────────────────────────────────────────────
    deleteContactActivity: tool({
      description: "Delete a contact activity entry (e.g., duplicate or incorrect log). Use when the agent says 'remove that activity' or 'I logged that by mistake'. Gated by the approval card.",
      inputSchema: z.object({
        activityId: z.string().uuid().describe("The activity UUID"),
        activityDescription: z.string().describe("Brief description for the approval card"),
      }),
      needsApproval: true,
      execute: async ({ activityId, activityDescription }) => {
        try {
          const { error } = await supabase
            .from("contact_activities")
            .delete()
            .eq("id", activityId)
            .eq("user_id", userId);

          if (error) return `Failed to delete activity: ${error.message}`;

          return `✓ Activity deleted — ${activityDescription}. Note: the client's last contact date is not automatically adjusted — it reflects the most recent remaining activity.`;
        } catch {
          return "Failed to delete activity. Please try again.";
        }
      },
    }),

    // ── UPDATE: Edit an existing expense ──────────────────────────────────────
    updateExpense: tool({
      description: "Update an existing expense (change amount, vendor, category, date, or notes). Use searchExpenses first to find the expense ID. Gated by the approval card.",
      inputSchema: z.object({
        expenseId: z.string().uuid().describe("The expense UUID from searchExpenses"),
        vendor: z.string().optional().describe("Updated vendor name"),
        totalAmount: z.number().optional().describe("Updated total amount"),
        categoryKey: z.enum(EXPENSE_CATEGORY_KEYS).optional().describe("Updated T2125 category"),
        expenseDate: z.string().optional().describe("Updated date (YYYY-MM-DD)"),
        notes: z.string().optional().describe("Updated notes"),
      }),
      needsApproval: true,
      execute: async ({ expenseId, vendor, totalAmount, categoryKey, expenseDate, notes }) => {
        try {
          // Fetch current expense so we can narrate the before/after diff in the result
          const { data: current, error: fetchErr } = await supabase
            .from("receipt_expenses")
            .select("vendor, total_amount, category_key, expense_date, notes")
            .eq("id", expenseId)
            .eq("user_id", userId)
            .single();

          if (fetchErr || !current) return `Expense not found (ID: ${expenseId}). Use searchExpenses to find the correct one.`;

          const changes: string[] = [];
          if (vendor && vendor !== current.vendor) changes.push(`vendor: ${current.vendor} → ${vendor}`);
          if (totalAmount !== undefined && totalAmount !== Number(current.total_amount)) changes.push(`amount: $${current.total_amount} → $${totalAmount}`);
          if (categoryKey && categoryKey !== current.category_key) changes.push(`category: ${current.category_key} → ${categoryKey}`);
          if (expenseDate && expenseDate !== current.expense_date) changes.push(`date: ${current.expense_date} → ${expenseDate}`);
          if (notes !== undefined && notes !== current.notes) changes.push(`notes updated`);

          if (changes.length === 0) return "No changes detected — the expense already matches what you described.";

          const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
          if (vendor) updateData.vendor = vendor;
          if (totalAmount !== undefined) updateData.total_amount = totalAmount;
          if (categoryKey) updateData.category_key = categoryKey;
          if (expenseDate) updateData.expense_date = expenseDate;
          if (notes !== undefined) updateData.notes = notes;

          const { error } = await supabase
            .from("receipt_expenses")
            .update(updateData)
            .eq("id", expenseId)
            .eq("user_id", userId);

          if (error) return `Failed to update expense: ${error.message}`;

          return `✓ Expense updated:\n${changes.join("\n")}\n\nYour YTD expense totals and tax estimates will reflect this change.`;
        } catch {
          return "Failed to update expense. Please try again.";
        }
      },
    }),

    // ── UPDATE: Edit a contact task ───────────────────────────────────────────
    updateContactTask: tool({
      description: "Update an existing contact task — change due date, priority, title, or notes. Use searchContactTasks first to find the task ID.",
      inputSchema: z.object({
        taskId: z.string().uuid().describe("The task UUID from searchContactTasks"),
        title: z.string().optional().describe("Updated task title"),
        dueDate: z.string().optional().describe("Updated due date (YYYY-MM-DD)"),
        priority: z.enum(["low", "normal", "high"]).optional().describe("Updated priority"),
        notes: z.string().optional().describe("Updated notes"),
      }),
      execute: async ({ taskId, title, dueDate, priority, notes }) => {
        try {
          const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
          const changes: string[] = [];

          if (title) { updateData.title = title; changes.push(`title → "${title}"`); }
          if (dueDate) { updateData.due_date = dueDate; changes.push(`due date → ${dueDate}`); }
          if (priority) { updateData.priority = priority; changes.push(`priority → ${priority}`); }
          if (notes !== undefined) { updateData.notes = notes; changes.push(`notes updated`); }

          if (changes.length === 0) return "No changes specified. What would you like to update on this task?";

          const { error } = await supabase
            .from("contact_tasks")
            .update(updateData)
            .eq("id", taskId)
            .eq("user_id", userId);

          if (error) return `Failed to update task: ${error.message}`;

          return `✓ Task updated: ${changes.join(", ")}`;
        } catch {
          return "Failed to update task. Please try again.";
        }
      },
    }),

    // ── UPDATE: Set client communication tone ────────────────────────────────
    updateClientTone: tool({
      description: "Set a client's communication tone preference (casual, friendly, professional, or formal). This controls the tone used by Flight Control when generating outreach drafts for this client.",
      inputSchema: z.object({
        clientId: z.string().uuid().describe("The client UUID from searchClients"),
        clientName: z.string().describe("Client name for confirmation message"),
        tone: z.enum(["casual", "friendly", "professional", "formal"]).describe("The communication tone to set"),
      }),
      needsApproval: true,
      execute: async ({ clientId, clientName, tone }) => {
        try {
          const { error } = await supabase
            .from("clients")
            .update({ communication_tone: tone, updated_at: new Date().toISOString() })
            .eq("id", clientId)
            .eq("user_id", userId);

          if (error) return `Failed to update tone: ${error.message}`;

          return `✓ ${clientName}'s communication tone set to **${tone}**. Flight Control will use this tone when generating outreach drafts for them.`;
        } catch {
          return "Failed to update communication tone. Please try again.";
        }
      },
    }),

    // ── SEARCH: Filter clients by status, tag, or tone ───────────────────────
    searchClientsByFilter: tool({
      description: "Search clients by flight status, tag, or communication tone. Use when the user asks 'show me all my VIP clients', 'who is in boarding?', or 'which clients are set to formal tone?'.",
      inputSchema: z.object({
        status: z.enum([...CLIENT_STATUSES]).optional().describe("Filter by flight status"),
        tag: z.string().optional().describe("Filter by tag (e.g., 'VIP', 'Investor', 'First-Time Buyer')"),
        tone: z.enum(["casual", "friendly", "professional", "formal"]).optional().describe("Filter by communication tone"),
        limit: z.number().optional().describe("Max results (default 15)"),
      }),
      execute: async ({ status, tag, tone, limit: maxResults }) => {
        try {
          let query = supabase
            .from("clients")
            .select("id, name, status, communication_tone, tags, last_contact_at")
            .eq("user_id", userId)
            .is("archived_at", null)
            .order("name")
            .limit(maxResults ?? 15);

          if (status) query = query.eq("status", status);
          if (tone) query = query.eq("communication_tone", tone);
          if (tag) query = query.contains("tags", [tag]);

          const { data, error } = await query;

          if (error) return `Search failed: ${error.message}`;
          if (!data || data.length === 0) {
            const filters = [status && `status=${status}`, tag && `tag=${tag}`, tone && `tone=${tone}`].filter(Boolean).join(", ");
            return `No clients found matching ${filters}.`;
          }

          const header = `Found ${data.length} client${data.length === 1 ? "" : "s"}:`;
          const list = data.map((c: { name: string; status: string; communication_tone: string; tags: string[] | null; last_contact_at: string | null }) =>
            `• ${c.name} — ${c.status}${c.tags?.length ? ` [${c.tags.join(", ")}]` : ""}${c.communication_tone !== "friendly" ? ` (${c.communication_tone} tone)` : ""} — last contact: ${c.last_contact_at ? new Date(c.last_contact_at).toLocaleDateString("en-CA") : "never"}`
          ).join("\n");

          return `${header}\n${list}`;
        } catch {
          return "Client search temporarily unavailable.";
        }
      },
    }),

    // ── SEARCH: Activities by date or type ────────────────────────────────────
    searchActivities: tool({
      description: "Search contact activities by date range, type, or client. Use when the user asks 'what did I do last week?', 'show me my calls from March', or 'what activities have I logged for Sarah?'.",
      inputSchema: z.object({
        clientId: z.string().uuid().optional().describe("Filter by client UUID"),
        activityType: z.enum([...ACTIVITY_TYPES]).optional().describe("Filter by type (call, email, text, showing, meeting, offer, note)"),
        startDate: z.string().optional().describe("Start of date range (YYYY-MM-DD)"),
        endDate: z.string().optional().describe("End of date range (YYYY-MM-DD)"),
        limit: z.number().optional().describe("Max results (default 20)"),
      }),
      execute: async ({ clientId, activityType, startDate, endDate, limit: maxResults }) => {
        try {
          let query = supabase
            .from("contact_activities")
            .select("id, type, description, activity_date, client_id, clients!inner(name)")
            .eq("user_id", userId)
            .order("activity_date", { ascending: false })
            .limit(maxResults ?? 20);

          if (clientId) query = query.eq("client_id", clientId);
          if (activityType) query = query.eq("type", activityType);
          if (startDate) query = query.gte("activity_date", `${startDate}T00:00:00`);
          if (endDate) query = query.lte("activity_date", `${endDate}T23:59:59`);

          const { data, error } = await query;

          if (error) return `Activity search failed: ${error.message}`;
          if (!data || data.length === 0) return "No activities found matching your criteria.";

          const header = `Found ${data.length} activit${data.length === 1 ? "y" : "ies"}:`;
          const list = data.map((a: Record<string, unknown>) => {
            const clientInfo = a.clients as { name: string } | { name: string }[] | null;
            const clientName = clientInfo ? (Array.isArray(clientInfo) ? clientInfo[0]?.name : clientInfo.name) : null;
            return `• ${new Date(a.activity_date as string).toLocaleDateString("en-CA")} — ${a.type}${clientName ? ` with ${clientName}` : ""}: ${(a.description as string) || "(no description)"}`;
          }).join("\n");

          return `${header}\n${list}`;
        } catch {
          return "Activity search temporarily unavailable.";
        }
      },
    }),

    // ── SEARCH: Mileage logs ──────────────────────────────────────────────────
    searchMileageLogs: tool({
      description: "Search mileage logs by date range or purpose. Use when the user asks 'how many km did I drive in March?', 'show me my mileage this month', or 'what trips have I logged?'.",
      inputSchema: z.object({
        startDate: z.string().optional().describe("Start of date range (YYYY-MM-DD)"),
        endDate: z.string().optional().describe("End of date range (YYYY-MM-DD)"),
        purpose: z.string().optional().describe("Filter by purpose keyword (e.g., 'showing', 'listing')"),
        limit: z.number().optional().describe("Max results (default 20)"),
      }),
      execute: async ({ startDate, endDate, purpose, limit: maxResults }) => {
        try {
          let query = supabase
            .from("mileage_logs")
            .select("id, trip_date, km, deduction, from_location, to_location, purpose")
            .eq("user_id", userId)
            .order("trip_date", { ascending: false })
            .limit(maxResults ?? 20);

          if (startDate) query = query.gte("trip_date", startDate);
          if (endDate) query = query.lte("trip_date", endDate);
          if (purpose) query = query.ilike("purpose", `%${purpose}%`);

          const { data, error } = await query;

          if (error) return `Mileage search failed: ${error.message}`;
          if (!data || data.length === 0) return "No mileage logs found matching your criteria.";

          const totalKm = data.reduce((sum: number, m: { km: number }) => sum + Number(m.km), 0);
          const totalDeduction = data.reduce((sum: number, m: { deduction: number }) => sum + Number(m.deduction), 0);

          const header = `Found ${data.length} trip${data.length === 1 ? "" : "s"} — ${totalKm.toFixed(1)} km total, $${totalDeduction.toFixed(2)} deduction:`;
          const list = data.map((m: { trip_date: string; km: number; deduction: number; from_location: string | null; to_location: string | null; purpose: string | null }) =>
            `• ${m.trip_date} — ${m.km} km ($${Number(m.deduction).toFixed(2)}) ${m.from_location ? `from ${m.from_location}` : ""}${m.to_location ? ` to ${m.to_location}` : ""}${m.purpose ? ` — ${m.purpose}` : ""}`
          ).join("\n");

          return `${header}\n${list}`;
        } catch {
          return "Mileage search temporarily unavailable.";
        }
      },
    }),

    // ── QUERY: Expense breakdown by category ──────────────────────────────────
    getExpenseBreakdown: tool({
      description: "Get a breakdown of expenses by T2125 category for a given period. Use when the user asks 'how much have I spent on marketing?', 'show me my expenses by category', or 'what are my biggest expense categories?'.",
      inputSchema: z.object({
        year: z.number().optional().describe("Year to filter (defaults to current year)"),
        startDate: z.string().optional().describe("Start of date range (YYYY-MM-DD) — overrides year"),
        endDate: z.string().optional().describe("End of date range (YYYY-MM-DD) — overrides year"),
      }),
      execute: async ({ year, startDate, endDate }) => {
        try {
          const currentYear = year ?? new Date().getFullYear();
          const start = startDate ?? `${currentYear}-01-01`;
          const end = endDate ?? `${currentYear}-12-31`;

          const { data, error } = await supabase
            .from("receipt_expenses")
            .select("category_key, total_amount")
            .eq("user_id", userId)
            .gte("expense_date", start)
            .lte("expense_date", end);

          if (error) return `Failed to fetch expenses: ${error.message}`;
          if (!data || data.length === 0) return `No expenses found for ${startDate ? `${start} to ${end}` : currentYear}.`;

          // Aggregate by category
          const byCategory: Record<string, { total: number; count: number }> = {};
          let grandTotal = 0;

          for (const exp of data) {
            const key = exp.category_key || "uncategorized";
            if (!byCategory[key]) byCategory[key] = { total: 0, count: 0 };
            byCategory[key].total += Number(exp.total_amount);
            byCategory[key].count += 1;
            grandTotal += Number(exp.total_amount);
          }

          // Sort by total descending
          const sorted = Object.entries(byCategory)
            .sort(([, a], [, b]) => b.total - a.total);

          const categoryLabels: Record<string, string> = {
            vehicle: "Vehicle & Mileage",
            marketing: "Marketing & Advertising",
            office_tech: "Office & Technology",
            professional_fees: "Professional Fees",
            travel_meals: "Travel & Meals",
            insurance_licenses: "Insurance & Licenses",
            education_dev: "Education & Development",
            other: "Other",
            uncategorized: "Uncategorized",
          };

          const header = `Expense Breakdown (${startDate ? `${start} to ${end}` : currentYear}):`;
          const list = sorted.map(([key, { total, count }]) => {
            const pct = grandTotal > 0 ? ((total / grandTotal) * 100).toFixed(1) : "0.0";
            return `• **${categoryLabels[key] || key}**: $${total.toFixed(2)} (${count} entries, ${pct}%)`;
          }).join("\n");

          return `${header}\n${list}\n\n**Total**: $${grandTotal.toFixed(2)} across ${data.length} entries`;
        } catch {
          return "Failed to generate expense breakdown. Please try again.";
        }
      },
    }),

    // ── QUERY: Performance summary (weekly/monthly/quarterly) ─────────────────
    getPerformanceSummary: tool({
      description: "Generate a performance summary for a period — pulls together transactions, expenses, activities, pipeline changes, and mileage into a narrative overview. Use when the user asks 'how was my month?', 'give me a weekly summary', or 'how's this quarter going?'.",
      inputSchema: z.object({
        period: z.enum(["week", "month", "quarter", "year"]).describe("The time period to summarize"),
        offset: z.number().optional().describe("How many periods back (0 = current, 1 = last, 2 = two ago). Default 0."),
      }),
      execute: async ({ period, offset: periodOffset }) => {
        try {
          const now = new Date();
          const off = periodOffset ?? 0;

          let startDate: Date;
          let endDate: Date;
          let periodLabel: string;

          if (period === "week") {
            const dayOfWeek = now.getDay();
            startDate = new Date(now);
            startDate.setDate(now.getDate() - dayOfWeek - (off * 7));
            endDate = new Date(startDate);
            endDate.setDate(startDate.getDate() + 6);
            periodLabel = off === 0 ? "this week" : off === 1 ? "last week" : `${off} weeks ago`;
          } else if (period === "month") {
            startDate = new Date(now.getFullYear(), now.getMonth() - off, 1);
            endDate = new Date(now.getFullYear(), now.getMonth() - off + 1, 0);
            periodLabel = startDate.toLocaleDateString("en-CA", { month: "long", year: "numeric" });
          } else if (period === "quarter") {
            const currentQ = Math.floor(now.getMonth() / 3);
            const targetQ = currentQ - off;
            const targetYear = now.getFullYear() + Math.floor(targetQ / 4);
            const adjustedQ = ((targetQ % 4) + 4) % 4;
            startDate = new Date(targetYear, adjustedQ * 3, 1);
            endDate = new Date(targetYear, adjustedQ * 3 + 3, 0);
            periodLabel = `Q${adjustedQ + 1} ${targetYear}`;
          } else {
            const targetYear = now.getFullYear() - off;
            startDate = new Date(targetYear, 0, 1);
            endDate = new Date(targetYear, 11, 31);
            periodLabel = `${targetYear}`;
          }

          const start = startDate.toISOString().split("T")[0];
          const end = endDate.toISOString().split("T")[0];

          // Parallel queries
          const [txResult, expResult, actResult, mileResult, pipeResult] = await Promise.allSettled([
            supabase
              .from("transactions")
              .select("sale_price, commission_pct, gci_override, team_split_pct, side, date")
              .eq("user_id", userId)
              .gte("date", start)
              .lte("date", end),
            supabase
              .from("receipt_expenses")
              .select("total_amount, category_key")
              .eq("user_id", userId)
              .gte("expense_date", start)
              .lte("expense_date", end),
            supabase
              .from("contact_activities")
              .select("type")
              .eq("user_id", userId)
              .gte("activity_date", `${start}T00:00:00`)
              .lte("activity_date", `${end}T23:59:59`),
            supabase
              .from("mileage_logs")
              .select("km, deduction")
              .eq("user_id", userId)
              .gte("trip_date", start)
              .lte("trip_date", end),
            supabase
              .from("pipeline_deals")
              .select("id, stage, estimated_price")
              .eq("user_id", userId)
              .gte("created_at", `${start}T00:00:00`)
              .lte("created_at", `${end}T23:59:59`),
          ]);

          const transactions = txResult.status === "fulfilled" ? txResult.value.data ?? [] : [];
          const expenses = expResult.status === "fulfilled" ? expResult.value.data ?? [] : [];
          const activities = actResult.status === "fulfilled" ? actResult.value.data ?? [] : [];
          const mileage = mileResult.status === "fulfilled" ? mileResult.value.data ?? [] : [];
          const newDeals = pipeResult.status === "fulfilled" ? pipeResult.value.data ?? [] : [];

          // Aggregate
          const totalGCI = transactions.reduce((s: number, t: { sale_price: number; commission_pct: number; gci_override: number | null; team_split_pct: number | null }) => {
            if (t.gci_override != null) return s + Number(t.gci_override);
            const raw = Number(t.sale_price) * Number(t.commission_pct);
            return s + (t.team_split_pct != null && Number(t.team_split_pct) > 0 ? raw * Number(t.team_split_pct) : raw);
          }, 0);
          const totalExpenses = expenses.reduce((s: number, e: { total_amount: number }) => s + Number(e.total_amount || 0), 0);
          const totalKm = mileage.reduce((s: number, m: { km: number }) => s + Number(m.km || 0), 0);
          const totalMileageDed = mileage.reduce((s: number, m: { deduction: number }) => s + Number(m.deduction || 0), 0);
          const pipelineValue = newDeals.reduce((s: number, d: { estimated_price: number }) => s + Number(d.estimated_price || 0), 0);

          // Activity breakdown
          const actByType: Record<string, number> = {};
          for (const a of activities) {
            actByType[a.type] = (actByType[a.type] || 0) + 1;
          }
          const actSummary = Object.entries(actByType).map(([t, c]) => `${c} ${t}${c > 1 ? "s" : ""}`).join(", ");

          const sections: string[] = [`📊 **Performance Summary — ${periodLabel}** (${start} to ${end})`];

          // Transactions
          if (transactions.length > 0) {
            sections.push(`\n💰 **Closed Deals**: ${transactions.length} transaction${transactions.length > 1 ? "s" : ""} — $${totalGCI.toFixed(2)} GCI`);
          } else {
            sections.push(`\n💰 **Closed Deals**: No transactions closed ${periodLabel}`);
          }

          // Pipeline
          if (newDeals.length > 0) {
            sections.push(`📋 **New Pipeline Deals**: ${newDeals.length} added — $${pipelineValue.toFixed(2)} total value`);
          }

          // Expenses
          if (expenses.length > 0) {
            const expenseRatio = totalGCI > 0 ? ((totalExpenses / totalGCI) * 100).toFixed(1) : "N/A";
            sections.push(`💸 **Expenses**: $${totalExpenses.toFixed(2)} across ${expenses.length} entries${totalGCI > 0 ? ` (${expenseRatio}% expense ratio)` : ""}`);
          }

          // Activities
          if (activities.length > 0) {
            sections.push(`📞 **Activities**: ${activities.length} total — ${actSummary}`);
          } else {
            sections.push(`📞 **Activities**: No activities logged ${periodLabel}`);
          }

          // Mileage
          if (mileage.length > 0) {
            sections.push(`🚗 **Mileage**: ${totalKm.toFixed(1)} km across ${mileage.length} trips — $${totalMileageDed.toFixed(2)} deduction`);
          }

          // Net
          if (totalGCI > 0 || totalExpenses > 0) {
            const net = totalGCI - totalExpenses;
            sections.push(`\n📈 **Net**: $${net.toFixed(2)} (GCI minus expenses)`);
          }

          return sections.join("\n");
        } catch {
          return "Failed to generate performance summary. Please try again.";
        }
      },
    }),

    // ── QUERY: Compare two periods ───────────────────────────────────────────
    comparePerformance: tool({
      description: "Compare performance between two time periods side by side. Use when the user asks 'how does this month compare to last month?', 'compare Q1 to Q2', or 'am I doing better than last year?'.",
      inputSchema: z.object({
        period: z.enum(["week", "month", "quarter", "year"]).describe("The time period unit"),
        periodAOffset: z.number().describe("How many periods back for period A (0 = current)"),
        periodBOffset: z.number().describe("How many periods back for period B (1 = last)"),
      }),
      execute: async ({ period, periodAOffset, periodBOffset }) => {
        try {
          const now = new Date();

          function getPeriodRange(off: number): { start: string; end: string; label: string } {
            let startDate: Date;
            let endDate: Date;
            let label: string;

            if (period === "week") {
              const dayOfWeek = now.getDay();
              startDate = new Date(now);
              startDate.setDate(now.getDate() - dayOfWeek - (off * 7));
              endDate = new Date(startDate);
              endDate.setDate(startDate.getDate() + 6);
              label = off === 0 ? "This week" : off === 1 ? "Last week" : `${off} weeks ago`;
            } else if (period === "month") {
              startDate = new Date(now.getFullYear(), now.getMonth() - off, 1);
              endDate = new Date(now.getFullYear(), now.getMonth() - off + 1, 0);
              label = startDate.toLocaleDateString("en-CA", { month: "long", year: "numeric" });
            } else if (period === "quarter") {
              const currentQ = Math.floor(now.getMonth() / 3);
              const targetQ = currentQ - off;
              const targetYear = now.getFullYear() + Math.floor(targetQ / 4);
              const adjustedQ = ((targetQ % 4) + 4) % 4;
              startDate = new Date(targetYear, adjustedQ * 3, 1);
              endDate = new Date(targetYear, adjustedQ * 3 + 3, 0);
              label = `Q${adjustedQ + 1} ${targetYear}`;
            } else {
              const targetYear = now.getFullYear() - off;
              startDate = new Date(targetYear, 0, 1);
              endDate = new Date(targetYear, 11, 31);
              label = `${targetYear}`;
            }

            return {
              start: startDate.toISOString().split("T")[0],
              end: endDate.toISOString().split("T")[0],
              label,
            };
          }

          async function getPeriodData(start: string, end: string) {
            const [txResult, expResult, actResult] = await Promise.allSettled([
              supabase.from("transactions").select("sale_price, commission_pct, gci_override, team_split_pct").eq("user_id", userId).gte("date", start).lte("date", end),
              supabase.from("receipt_expenses").select("total_amount").eq("user_id", userId).gte("expense_date", start).lte("expense_date", end),
              supabase.from("contact_activities").select("id").eq("user_id", userId).gte("activity_date", `${start}T00:00:00`).lte("activity_date", `${end}T23:59:59`),
            ]);

            const txData = txResult.status === "fulfilled" ? txResult.value.data ?? [] : [];
            const expData = expResult.status === "fulfilled" ? expResult.value.data ?? [] : [];
            const actData = actResult.status === "fulfilled" ? actResult.value.data ?? [] : [];

            return {
              deals: txData.length,
              gci: txData.reduce((s: number, t: { sale_price: number; commission_pct: number; gci_override: number | null; team_split_pct: number | null }) => {
                if (t.gci_override != null) return s + Number(t.gci_override);
                const raw = Number(t.sale_price) * Number(t.commission_pct);
                return s + (t.team_split_pct != null && Number(t.team_split_pct) > 0 ? raw * Number(t.team_split_pct) : raw);
              }, 0),
              expenses: expData.reduce((s: number, e: { total_amount: number }) => s + Number(e.total_amount || 0), 0),
              activities: actData.length,
            };
          }

          const rangeA = getPeriodRange(periodAOffset);
          const rangeB = getPeriodRange(periodBOffset);
          const [dataA, dataB] = await Promise.all([
            getPeriodData(rangeA.start, rangeA.end),
            getPeriodData(rangeB.start, rangeB.end),
          ]);

          function delta(a: number, b: number): string {
            if (b === 0) return a > 0 ? "↑ new" : "—";
            const pct = ((a - b) / b * 100).toFixed(0);
            return a > b ? `↑ ${pct}%` : a < b ? `↓ ${pct}%` : "→ same";
          }

          return [
            `📊 **${rangeA.label}** vs **${rangeB.label}**`,
            "",
            `| Metric | ${rangeA.label} | ${rangeB.label} | Change |`,
            `|--------|---------|---------|--------|`,
            `| Deals | ${dataA.deals} | ${dataB.deals} | ${delta(dataA.deals, dataB.deals)} |`,
            `| GCI | $${dataA.gci.toFixed(2)} | $${dataB.gci.toFixed(2)} | ${delta(dataA.gci, dataB.gci)} |`,
            `| Expenses | $${dataA.expenses.toFixed(2)} | $${dataB.expenses.toFixed(2)} | ${delta(dataA.expenses, dataB.expenses)} |`,
            `| Activities | ${dataA.activities} | ${dataB.activities} | ${delta(dataA.activities, dataB.activities)} |`,
            `| Net (GCI-Exp) | $${(dataA.gci - dataA.expenses).toFixed(2)} | $${(dataB.gci - dataB.expenses).toFixed(2)} | ${delta(dataA.gci - dataA.expenses, dataB.gci - dataB.expenses)} |`,
          ].join("\n");
        } catch {
          return "Failed to compare periods. Please try again.";
        }
      },
    }),

    // ── CREATE: Flight plan (automated follow-up sequence) ───────────────────
    createFlightPlan: tool({
      description: "Create a flight plan — an automated follow-up sequence that generates tasks or outreach at set intervals. Use when the user says 'create a follow-up sequence for new buyers', 'set up a nurture plan', or 'automate check-ins after closing'.",
      inputSchema: z.object({
        name: z.string().describe("Name for the flight plan (e.g., 'New Buyer Follow-Up', 'Post-Close Nurture')"),
        description: z.string().optional().describe("Brief description of the plan's purpose"),
        triggerStatus: z.enum([...CLIENT_STATUSES]).optional().describe("Auto-assign when client enters this status"),
        steps: z.array(z.object({
          delayDays: z.number().describe("Days after trigger/previous step to execute"),
          actionType: z.enum(["task", "outreach"]).describe("Create a task or generate outreach draft"),
          template: z.string().describe("Task title or outreach prompt (e.g., 'Check-in call', 'Send market update')"),
        })).min(1).max(10).describe("Sequence of steps, in order"),
      }),
      execute: async ({ name, description, triggerStatus, steps }) => {
        try {
          // Create the flight plan
          const { data: plan, error: planErr } = await supabase
            .from("flight_plans")
            .insert({
              user_id: userId,
              name,
              description: description ?? null,
              trigger_status: triggerStatus ?? null,
              is_active: true,
              is_system: false,
            })
            .select("id")
            .single();

          if (planErr || !plan) return `Failed to create flight plan: ${planErr?.message ?? "unknown error"}`;

          // Create the steps
          const stepInserts = steps.map((step, i) => ({
            flight_plan_id: plan.id,
            step_order: i + 1,
            delay_days: step.delayDays,
            action_type: step.actionType,
            template: step.template,
          }));

          const { error: stepsErr } = await supabase
            .from("flight_plan_steps")
            .insert(stepInserts);

          if (stepsErr) return `Flight plan created but steps failed: ${stepsErr.message}`;

          const stepSummary = steps.map((s, i) =>
            `  ${i + 1}. Day ${s.delayDays}: ${s.actionType === "task" ? "📋 Task" : "✉️ Outreach"} — "${s.template}"`
          ).join("\n");

          return `✓ Flight plan "${name}" created with ${steps.length} steps:\n${stepSummary}${triggerStatus ? `\n\nAuto-triggers when a client moves to **${triggerStatus}** status.` : "\n\nThis plan can be manually assigned to clients from their profile in the **CRM** (/crm)."}`;
        } catch {
          return "Failed to create flight plan. Please try again.";
        }
      },
    }),

    // ── UPDATE: Listing appointment status/details ────────────────────────────
    updateListingAppointment: tool({
      description: "Update a listing appointment — change status (scheduled/active/sold/expired/withdrawn/lost), actual list price, actual sale price, or dates. Use when the user says 'the listing at 44 Main just went live' or 'that listing sold'. Gated by the approval card.",
      inputSchema: z.object({
        appointmentId: z.string().uuid().describe("The listing appointment UUID"),
        status: z.enum(["scheduled", "active", "sold", "expired", "withdrawn", "lost"]).optional().describe("Updated status"),
        actualListPrice: z.number().optional().describe("Actual list price once listed"),
        actualSalePrice: z.number().optional().describe("Actual sale price once sold"),
        expectedCloseDate: z.string().optional().describe("Expected close date (YYYY-MM-DD)"),
        notes: z.string().optional().describe("Updated notes"),
      }),
      needsApproval: true,
      execute: async ({ appointmentId, status, actualListPrice, actualSalePrice, expectedCloseDate, notes }) => {
        try {
          const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
          const changed: string[] = [];

          if (status) { updates.status = status; changed.push(`status → ${status}`); }
          if (actualListPrice !== undefined) { updates.actual_list_price = actualListPrice; changed.push(`list price → $${actualListPrice.toLocaleString()}`); }
          if (actualSalePrice !== undefined) { updates.actual_sale_price = actualSalePrice; changed.push(`sale price → $${actualSalePrice.toLocaleString()}`); }
          if (expectedCloseDate) { updates.expected_close_date = expectedCloseDate; changed.push(`close date → ${expectedCloseDate}`); }
          if (notes !== undefined) { updates.notes = notes; changed.push("notes updated"); }

          if (changed.length === 0) return "No changes specified.";

          const { error } = await supabase
            .from("listing_appointments")
            .update(updates)
            .eq("id", appointmentId)
            .eq("user_id", userId);

          if (error) return `Failed to update listing appointment: ${error.message}`;

          return `✓ Listing appointment updated: ${changed.join(", ")}${status === "sold" ? "\n\nNice work! Consider recording this as a transaction and moving the client to Cruising status." : ""}`;
        } catch {
          return "Failed to update listing appointment. Please try again.";
        }
      },
    }),

    // ── UPDATE: Referral status and fee ───────────────────────────────────────
    updateReferral: tool({
      description: "Update a referral — change status (pending/active/closed/expired/cancelled), actual fee paid, or fee paid date. Use when the user says 'that referral deal closed' or 'I paid the referral fee'.",
      inputSchema: z.object({
        referralId: z.string().uuid().describe("The referral UUID"),
        partnerName: z.string().describe("Referral partner name for confirmation"),
        status: z.enum(["pending", "active", "closed", "expired", "cancelled"]).optional().describe("Updated status"),
        actualFeePaid: z.number().optional().describe("Actual referral fee paid in dollars"),
        feePaidDate: z.string().optional().describe("Date fee was paid (YYYY-MM-DD)"),
        notes: z.string().optional().describe("Updated notes"),
      }),
      execute: async ({ referralId, partnerName, status, actualFeePaid, feePaidDate, notes }) => {
        try {
          const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
          const changed: string[] = [];

          if (status) { updates.status = status; changed.push(`status → ${status}`); }
          if (actualFeePaid !== undefined) { updates.actual_fee_paid = actualFeePaid; changed.push(`fee paid → $${actualFeePaid.toLocaleString()}`); }
          if (feePaidDate) { updates.fee_paid_date = feePaidDate; changed.push(`fee date → ${feePaidDate}`); }
          if (notes !== undefined) { updates.notes = notes; changed.push("notes updated"); }

          if (changed.length === 0) return "No changes specified.";

          const { error } = await supabase
            .from("referrals")
            .update(updates)
            .eq("id", referralId)
            .eq("user_id", userId);

          if (error) return `Failed to update referral: ${error.message}`;

          return `✓ Referral with ${partnerName} updated: ${changed.join(", ")}. View all referrals at **Referrals** (/referrals).`;
        } catch {
          return "Failed to update referral. Please try again.";
        }
      },
    }),

    // ── UPDATE: Recurring expense ────────────────────────────────────────────
    updateRecurringExpense: tool({
      description: "Update or pause/resume a recurring expense. Use when the user says 'change my Mailchimp to $200/month', 'pause that recurring expense', or 'reactivate my MLS fees'.",
      inputSchema: z.object({
        recurringExpenseId: z.string().uuid().describe("The recurring expense UUID"),
        name: z.string().optional().describe("Updated vendor/name"),
        amount: z.number().optional().describe("Updated amount"),
        categoryKey: z.enum(EXPENSE_CATEGORY_KEYS).optional().describe("Updated T2125 category"),
        isActive: z.boolean().optional().describe("Set to false to pause, true to resume"),
        notes: z.string().optional().describe("Updated notes"),
      }),
      execute: async ({ recurringExpenseId, name, amount, categoryKey, isActive, notes }) => {
        try {
          const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
          const changed: string[] = [];

          if (name) { updates.name = name; changed.push(`name → "${name}"`); }
          if (amount !== undefined) { updates.amount = amount; changed.push(`amount → $${amount}`); }
          if (categoryKey) { updates.category_key = categoryKey; changed.push(`category → ${categoryKey}`); }
          if (isActive !== undefined) { updates.is_active = isActive; changed.push(isActive ? "reactivated" : "paused"); }
          if (notes !== undefined) { updates.notes = notes; changed.push("notes updated"); }

          if (changed.length === 0) return "No changes specified.";

          const { error } = await supabase
            .from("recurring_expenses")
            .update(updates)
            .eq("id", recurringExpenseId)
            .eq("user_id", userId);

          if (error) return `Failed to update recurring expense: ${error.message}`;

          return `✓ Recurring expense updated: ${changed.join(", ")}. Future entries will reflect these changes.`;
        } catch {
          return "Failed to update recurring expense. Please try again.";
        }
      },
    }),

    // ── DELETE: Recurring expense ─────────────────────────────────────────────
    deleteRecurringExpense: tool({
      description: "Delete a recurring expense template. Past confirmed entries remain; only future auto-generated entries stop.",
      inputSchema: z.object({
        recurringExpenseId: z.string().uuid().describe("The recurring expense UUID"),
        expenseName: z.string().describe("Name for confirmation"),
      }),
      needsApproval: true,
      execute: async ({ recurringExpenseId, expenseName }) => {
        try {
          const { error } = await supabase
            .from("recurring_expenses")
            .delete()
            .eq("id", recurringExpenseId)
            .eq("user_id", userId);

          if (error) return `Failed to delete recurring expense: ${error.message}`;

          return `✓ Recurring expense "${expenseName}" deleted. Past confirmed entries remain in your expense history.`;
        } catch {
          return "Failed to delete recurring expense. Please try again.";
        }
      },
    }),

    // ── UPDATE: CCA asset ────────────────────────────────────────────────────
    updateCCAAsset: tool({
      description: "Update a CCA asset — change description, business use percentage, or UCC balance.",
      inputSchema: z.object({
        assetId: z.string().uuid().describe("The CCA asset UUID"),
        description: z.string().optional().describe("Updated description"),
        businessUsePct: z.number().min(0).max(100).optional().describe("Updated business use percentage (0-100)"),
        notes: z.string().optional().describe("Updated notes"),
      }),
      execute: async ({ assetId, description, businessUsePct, notes }) => {
        try {
          const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
          const changed: string[] = [];

          if (description) { updates.description = description; changed.push(`description → "${description}"`); }
          if (businessUsePct !== undefined) { updates.business_use_pct = businessUsePct / 100; changed.push(`business use → ${businessUsePct.toFixed(0)}%`); }
          if (notes !== undefined) { updates.notes = notes; changed.push("notes updated"); }

          if (changed.length === 0) return "No changes specified.";

          const { error } = await supabase
            .from("t2125_cca_assets")
            .update(updates)
            .eq("id", assetId)
            .eq("user_id", userId);

          if (error) return `Failed to update CCA asset: ${error.message}`;

          return `✓ CCA asset updated: ${changed.join(", ")}. View your depreciation schedule at **Overhead** (/overhead).`;
        } catch {
          return "Failed to update CCA asset. Please try again.";
        }
      },
    }),

    // ── DELETE: CCA asset ────────────────────────────────────────────────────
    deleteCCAAsset: tool({
      description: "Delete a CCA asset from your depreciation schedule. Gated by the approval card.",
      inputSchema: z.object({
        assetId: z.string().uuid().describe("The CCA asset UUID"),
        assetDescription: z.string().describe("Description for the approval card"),
      }),
      needsApproval: true,
      execute: async ({ assetId, assetDescription }) => {
        try {
          const { error } = await supabase
            .from("t2125_cca_assets")
            .delete()
            .eq("id", assetId)
            .eq("user_id", userId);

          if (error) return `Failed to delete CCA asset: ${error.message}`;

          return `✓ CCA asset "${assetDescription}" removed. Your depreciation schedule at **Overhead** (/overhead) will update accordingly.`;
        } catch {
          return "Failed to delete CCA asset. Please try again.";
        }
      },
    }),

    // ── MANAGE: Flight plan lifecycle ─────────────────────────────────────────
    manageFlightPlan: tool({
      description: "Activate, deactivate, or delete a flight plan. Use when the user says 'pause that flight plan', 'turn on the buyer nurture sequence', or 'delete the post-close plan'.",
      inputSchema: z.object({
        action: z.enum(["activate", "deactivate", "delete"]).describe("What to do with the flight plan"),
        planName: z.string().describe("Flight plan name to search for"),
      }),
      execute: async ({ action, planName }) => {
        try {
          // Find the flight plan
          const { data: plans, error: searchErr } = await supabase
            .from("flight_plans")
            .select("id, name, is_active")
            .eq("user_id", userId)
            .ilike("name", `%${planName}%`)
            .limit(3);

          if (searchErr) return `Search failed: ${searchErr.message}`;
          if (!plans || plans.length === 0) return `No flight plan found matching "${planName}".`;

          const plan = plans[0];

          if (action === "delete") {
            const { error } = await supabase
              .from("flight_plans")
              .delete()
              .eq("id", plan.id)
              .eq("user_id", userId);

            if (error) return `Failed to delete: ${error.message}`;
            return `✓ Flight plan "${plan.name}" deleted. Clients previously assigned to this plan will no longer receive its steps.`;
          }

          const isActive = action === "activate";
          const { error } = await supabase
            .from("flight_plans")
            .update({ is_active: isActive, updated_at: new Date().toISOString() })
            .eq("id", plan.id)
            .eq("user_id", userId);

          if (error) return `Failed to ${action}: ${error.message}`;
          return `✓ Flight plan "${plan.name}" ${isActive ? "activated — it will now trigger for matching clients" : "deactivated — no new clients will receive its steps"}.`;
        } catch {
          return "Failed to manage flight plan. Please try again.";
        }
      },
    }),

    // ── SEARCH: Pipeline deals by stage ───────────────────────────────────────
    searchPipelineByStage: tool({
      description: "Search pipeline deals filtered by stage. Use when the user asks 'show me all conditional deals', 'what's in the offer stage?', or 'how many leads do I have?'.",
      inputSchema: z.object({
        stage: z.enum([...PIPELINE_STAGES]).optional().describe("Filter by stage (lead/showing/offer/conditional/firm/closed)"),
        side: z.enum([...TRANSACTION_SIDES]).optional().describe("Filter by buyer/seller/both"),
      }),
      execute: async ({ stage, side }) => {
        try {
          let query = supabase
            .from("pipeline_deals")
            .select("id, address, client_name, estimated_price, estimated_commission_pct, stage, side, expected_close_date, probability_override, notes")
            .eq("user_id", userId)
            .order("estimated_price", { ascending: false });

          if (stage) query = query.eq("stage", stage);
          if (side) query = query.eq("side", side);

          const { data, error } = await query;

          if (error) return `Search failed: ${error.message}`;
          if (!data || data.length === 0) {
            const filters = [stage && `stage=${stage}`, side && `side=${side}`].filter(Boolean).join(", ");
            return `No pipeline deals found${filters ? ` matching ${filters}` : ""}.`;
          }

          const totalValue = data.reduce((s: number, d: { estimated_price: number }) => s + Number(d.estimated_price || 0), 0);
          const header = `Found ${data.length} deal${data.length === 1 ? "" : "s"}${stage ? ` in ${stage} stage` : ""} — $${totalValue.toLocaleString()} total value:`;

          const list = data.map((d: { address: string; client_name: string; estimated_price: number; stage: string; side: string; expected_close_date: string | null }) =>
            `• ${d.address || "No address"} — ${d.client_name || "No client"} (${d.side}) — $${Number(d.estimated_price).toLocaleString()} — ${d.stage}${d.expected_close_date ? ` — close: ${d.expected_close_date}` : ""}`
          ).join("\n");

          return `${header}\n${list}`;
        } catch {
          return "Pipeline search temporarily unavailable.";
        }
      },
    }),

    // ── QUERY: Quick data counts ─────────────────────────────────────────────
    getQuickStats: tool({
      description: "Get quick data counts and totals. Use when the user asks 'how many clients do I have?', 'what's my pipeline total?', 'how many deals have I closed?', or similar quick lookup questions.",
      inputSchema: z.object({
        stat: z.enum([
          "active_clients",
          "total_clients",
          "archived_clients",
          "pipeline_count",
          "pipeline_value",
          "closed_deals_ytd",
          "ytd_gci",
          "ytd_expenses",
          "open_tasks",
          "overdue_tasks",
          "pending_outreach",
          "ytd_mileage",
          "active_referrals",
          "recurring_expense_count",
          "cca_asset_count",
        ]).describe("Which stat to look up"),
      }),
      execute: async ({ stat }) => {
        try {
          const currentYear = new Date().getFullYear();
          const ytdStart = `${currentYear}-01-01`;
          const todayISO = new Date().toISOString().split("T")[0];

          switch (stat) {
            case "active_clients": {
              const { count, error } = await supabase.from("clients").select("id", { count: "exact", head: true }).eq("user_id", userId).is("archived_at", null);
              if (error) return `Query failed: ${error.message}`;
              return `You have **${count ?? 0} active clients** in your CRM.`;
            }
            case "total_clients": {
              const { count, error } = await supabase.from("clients").select("id", { count: "exact", head: true }).eq("user_id", userId);
              if (error) return `Query failed: ${error.message}`;
              return `You have **${count ?? 0} total clients** (including archived).`;
            }
            case "archived_clients": {
              const { count, error } = await supabase.from("clients").select("id", { count: "exact", head: true }).eq("user_id", userId).not("archived_at", "is", null);
              if (error) return `Query failed: ${error.message}`;
              return `You have **${count ?? 0} archived clients** in the Hangar.`;
            }
            case "pipeline_count": {
              const { count, error } = await supabase.from("pipeline_deals").select("id", { count: "exact", head: true }).eq("user_id", userId);
              if (error) return `Query failed: ${error.message}`;
              return `You have **${count ?? 0} active pipeline deals**.`;
            }
            case "pipeline_value": {
              const { data, error } = await supabase.from("pipeline_deals").select("estimated_price").eq("user_id", userId);
              if (error) return `Query failed: ${error.message}`;
              const total = (data ?? []).reduce((s: number, d: { estimated_price: number }) => s + Number(d.estimated_price || 0), 0);
              return `Your pipeline total is **$${total.toLocaleString()}** across ${data?.length ?? 0} deals.`;
            }
            case "closed_deals_ytd": {
              const { count, error } = await supabase.from("transactions").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "closed").gte("date", ytdStart);
              if (error) return `Query failed: ${error.message}`;
              return `You've closed **${count ?? 0} deals** so far in ${currentYear}.`;
            }
            case "ytd_gci": {
              const { data, error } = await supabase.from("transactions").select("sale_price, commission_pct, gci_override, team_split_pct").eq("user_id", userId).eq("status", "closed").gte("date", ytdStart);
              if (error) return `Query failed: ${error.message}`;
              const total = (data ?? []).reduce((s: number, t: { sale_price: number; commission_pct: number; gci_override: number | null; team_split_pct: number | null }) => {
                if (t.gci_override != null) return s + Number(t.gci_override);
                const raw = Number(t.sale_price) * Number(t.commission_pct);
                return s + (t.team_split_pct != null && Number(t.team_split_pct) > 0 ? raw * Number(t.team_split_pct) : raw);
              }, 0);
              return `Your YTD GCI is **$${total.toLocaleString()}** from ${data?.length ?? 0} closed deals.`;
            }
            case "ytd_expenses": {
              const { data, error } = await supabase.from("receipt_expenses").select("total_amount").eq("user_id", userId).gte("expense_date", ytdStart);
              if (error) return `Query failed: ${error.message}`;
              const total = (data ?? []).reduce((s: number, e: { total_amount: number }) => s + Number(e.total_amount || 0), 0);
              return `Your YTD expenses total **$${total.toLocaleString()}** across ${data?.length ?? 0} entries.`;
            }
            case "open_tasks": {
              const { count, error } = await supabase.from("contact_tasks").select("id", { count: "exact", head: true }).eq("user_id", userId).is("completed_at", null);
              if (error) return `Query failed: ${error.message}`;
              return `You have **${count ?? 0} open tasks**.`;
            }
            case "overdue_tasks": {
              const { count, error } = await supabase.from("contact_tasks").select("id", { count: "exact", head: true }).eq("user_id", userId).is("completed_at", null).lt("due_date", todayISO);
              if (error) return `Query failed: ${error.message}`;
              return `You have **${count ?? 0} overdue tasks**.${(count ?? 0) > 0 ? " Use getUpcomingAgenda for details." : ""}`;
            }
            case "pending_outreach": {
              const { count, error } = await supabase.from("outreach_queue").select("id", { count: "exact", head: true }).eq("user_id", userId).in("status", ["draft", "ready"]);
              if (error) return `Query failed: ${error.message}`;
              return `You have **${count ?? 0} pending outreach items** in Flight Control.`;
            }
            case "ytd_mileage": {
              const { data, error } = await supabase.from("mileage_logs").select("km, deduction").eq("user_id", userId).gte("trip_date", ytdStart);
              if (error) return `Query failed: ${error.message}`;
              const km = (data ?? []).reduce((s: number, m: { km: number }) => s + Number(m.km || 0), 0);
              const ded = (data ?? []).reduce((s: number, m: { deduction: number }) => s + Number(m.deduction || 0), 0);
              return `YTD mileage: **${km.toFixed(0)} km** across ${data?.length ?? 0} trips — **$${ded.toFixed(2)} deduction**.`;
            }
            case "active_referrals": {
              const { count, error } = await supabase.from("referrals").select("id", { count: "exact", head: true }).eq("user_id", userId).in("status", ["pending", "active"]);
              if (error) return `Query failed: ${error.message}`;
              return `You have **${count ?? 0} active referrals** (pending or in progress).`;
            }
            case "recurring_expense_count": {
              const { count, error } = await supabase.from("recurring_expenses").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("is_active", true);
              if (error) return `Query failed: ${error.message}`;
              return `You have **${count ?? 0} active recurring expenses**.`;
            }
            case "cca_asset_count": {
              const { count, error } = await supabase.from("t2125_cca_assets").select("id", { count: "exact", head: true }).eq("user_id", userId);
              if (error) return `Query failed: ${error.message}`;
              return `You have **${count ?? 0} CCA assets** in your depreciation schedule.`;
            }
            default:
              return "Unknown stat requested.";
          }
        } catch {
          return "Failed to look up stat. Please try again.";
        }
      },
    }),

    // ── SEARCH: Referrals ───────────────────────────────────────────────────
    searchReferrals: tool({
      description: "Search referrals by partner name, client name, or status. Use to find referral IDs before updating or deleting.",
      inputSchema: z.object({
        query: z.string().optional().describe("Partner name or client name to search for"),
        status: z.enum(["pending", "active", "closed", "expired", "cancelled"]).optional().describe("Filter by status"),
      }),
      execute: async ({ query, status }) => {
        try {
          let q = supabase
            .from("referrals")
            .select("id, direction, partner_name, client_name, status, referral_fee_pct, estimated_value, actual_fee_paid, referral_date")
            .eq("user_id", userId)
            .order("referral_date", { ascending: false })
            .limit(10);

          if (status) q = q.eq("status", status);
          if (query) q = q.or(`partner_name.ilike.%${query}%,client_name.ilike.%${query}%`);

          const { data, error } = await q;
          if (error) return `Search failed: ${error.message}`;
          if (!data || data.length === 0) return "No referrals found matching your criteria.";

          return data.map((r: Record<string, unknown>) =>
            `• ${r.direction === "inbound" ? "⬅️" : "➡️"} ${r.partner_name} → ${r.client_name} (ID: ${r.id}) — ${r.status}, ${Number(r.referral_fee_pct)}% fee${Number(r.actual_fee_paid) > 0 ? `, $${Number(r.actual_fee_paid).toLocaleString()} paid` : ""}`
          ).join("\n");
        } catch { return "Referral search temporarily unavailable."; }
      },
    }),

    // ── SEARCH: CCA Assets ───────────────────────────────────────────────────
    searchCCAAssets: tool({
      description: "Search CCA assets by description. Use to find asset IDs before updating or deleting.",
      inputSchema: z.object({
        query: z.string().optional().describe("Description keyword to search for"),
      }),
      execute: async ({ query }) => {
        try {
          let q = supabase
            .from("t2125_cca_assets")
            .select("id, description, cca_class, original_cost, business_use_pct, opening_ucc, acquisition_date")
            .eq("user_id", userId)
            .order("acquisition_date", { ascending: false });

          if (query) q = q.ilike("description", `%${query}%`);

          const { data, error } = await q;
          if (error) return `Search failed: ${error.message}`;
          if (!data || data.length === 0) return query ? `No CCA assets found matching "${query}".` : "No CCA assets found.";

          return data.map((a: Record<string, unknown>) =>
            `• ${a.description} (ID: ${a.id}) — Class ${a.cca_class}, cost $${Number(a.original_cost).toLocaleString()}, ${(Number(a.business_use_pct) * 100).toFixed(0)}% business use, UCC $${Number(a.opening_ucc).toLocaleString()}`
          ).join("\n");
        } catch { return "CCA asset search temporarily unavailable."; }
      },
    }),

    // ── SEARCH: Flight Plans ──────────────────────────────────────────────────
    searchFlightPlans: tool({
      description: "List flight plans, optionally filtered by name or active status. Use to find plan IDs or see what plans exist.",
      inputSchema: z.object({
        query: z.string().optional().describe("Name keyword to search for"),
        activeOnly: z.boolean().optional().describe("Only show active plans"),
      }),
      execute: async ({ query, activeOnly }) => {
        try {
          let q = supabase
            .from("flight_plans")
            .select("id, name, description, trigger_status, is_active, is_system, flight_plan_steps(step_order, delay_days, action_type, template)")
            .eq("user_id", userId)
            .order("created_at", { ascending: false });

          if (query) q = q.ilike("name", `%${query}%`);
          if (activeOnly) q = q.eq("is_active", true);

          const { data, error } = await q;
          if (error) return `Search failed: ${error.message}`;
          if (!data || data.length === 0) return "No flight plans found.";

          return data.map((p: Record<string, unknown>) => {
            const steps = (p.flight_plan_steps as { step_order: number; delay_days: number; action_type: string; template: string }[]) ?? [];
            return `• ${p.name} (ID: ${p.id}) — ${p.is_active ? "🟢 Active" : "⚪ Inactive"}${p.trigger_status ? ` — triggers on ${p.trigger_status}` : ""} — ${steps.length} steps${steps.length > 0 ? `\n  ${steps.map(s => `Day ${s.delay_days}: ${s.action_type} — "${s.template}"`).join("\n  ")}` : ""}`;
          }).join("\n\n");
        } catch { return "Flight plan search temporarily unavailable."; }
      },
    }),

    // ── SEARCH: Listing Appointments ──────────────────────────────────────────
    searchListingAppointments: tool({
      description: "Search listing appointments by address, client, or status. Use to find appointment IDs before updating.",
      inputSchema: z.object({
        query: z.string().optional().describe("Property address or client name to search for"),
        status: z.enum(["scheduled", "active", "sold", "expired", "withdrawn", "lost"]).optional().describe("Filter by status"),
      }),
      execute: async ({ query, status }) => {
        try {
          let q = supabase
            .from("listing_appointments")
            .select("id, property_address, appointment_date, status, estimated_list_price, actual_list_price, actual_sale_price, client_id, clients(name)")
            .eq("user_id", userId)
            .order("appointment_date", { ascending: false })
            .limit(10);

          if (status) q = q.eq("status", status);
          if (query) q = q.or(`property_address.ilike.%${query}%`);

          const { data, error } = await q;
          if (error) return `Search failed: ${error.message}`;
          if (!data || data.length === 0) return "No listing appointments found.";

          return data.map((a: Record<string, unknown>) => {
            const client = a.clients as { name: string } | { name: string }[] | null;
            const clientName = client ? (Array.isArray(client) ? client[0]?.name : client.name) : "No client";
            return `• ${a.property_address || "No address"} (ID: ${a.id}) — ${clientName} — ${a.status} — date: ${a.appointment_date}${a.actual_list_price ? ` — listed at $${Number(a.actual_list_price).toLocaleString()}` : a.estimated_list_price ? ` — est. $${Number(a.estimated_list_price).toLocaleString()}` : ""}`;
          }).join("\n");
        } catch { return "Listing appointment search temporarily unavailable."; }
      },
    }),

    // ── SEARCH: Property Showings ─────────────────────────────────────────────
    searchPropertyShowings: tool({
      description: "Search property showings by address, client, or date range. Use to find showing IDs before updating or deleting.",
      inputSchema: z.object({
        query: z.string().optional().describe("Property address to search for"),
        clientId: z.string().uuid().optional().describe("Filter by client UUID"),
        startDate: z.string().optional().describe("Start date (YYYY-MM-DD)"),
        endDate: z.string().optional().describe("End date (YYYY-MM-DD)"),
      }),
      execute: async ({ query, clientId, startDate, endDate }) => {
        try {
          let q = supabase
            .from("property_showings")
            .select("id, property_address, showing_date, client_rating, listing_price, notes, client_id, clients(name)")
            .eq("user_id", userId)
            .order("showing_date", { ascending: false })
            .limit(15);

          if (query) q = q.ilike("property_address", `%${query}%`);
          if (clientId) q = q.eq("client_id", clientId);
          if (startDate) q = q.gte("showing_date", startDate);
          if (endDate) q = q.lte("showing_date", endDate);

          const { data, error } = await q;
          if (error) return `Search failed: ${error.message}`;
          if (!data || data.length === 0) return "No property showings found.";

          return data.map((s: Record<string, unknown>) => {
            const client = s.clients as { name: string } | { name: string }[] | null;
            const clientName = client ? (Array.isArray(client) ? client[0]?.name : client.name) : "Unknown";
            return `• ${s.property_address} (ID: ${s.id}) — ${clientName} — ${s.showing_date} — ${s.client_rating ? `${s.client_rating}/5` : "unrated"}${s.listing_price ? ` — $${Number(s.listing_price).toLocaleString()}` : ""}${s.notes ? ` — "${s.notes}"` : ""}`;
          }).join("\n");
        } catch { return "Property showing search temporarily unavailable."; }
      },
    }),

    // ── SEARCH: Recurring Expenses ────────────────────────────────────────────
    searchRecurringExpenses: tool({
      description: "Search recurring expenses by vendor name. Use to find IDs before updating, pausing, or deleting.",
      inputSchema: z.object({
        query: z.string().optional().describe("Vendor/name keyword to search for"),
        activeOnly: z.boolean().optional().describe("Only show active recurring expenses"),
      }),
      execute: async ({ query, activeOnly }) => {
        try {
          let q = supabase
            .from("recurring_expenses")
            .select("id, name, amount, category_key, day_of_month, is_active, start_date, notes")
            .eq("user_id", userId)
            .order("name");

          if (query) q = q.ilike("name", `%${query}%`);
          if (activeOnly) q = q.eq("is_active", true);

          const { data, error } = await q;
          if (error) return `Search failed: ${error.message}`;
          if (!data || data.length === 0) return query ? `No recurring expenses found matching "${query}".` : "No recurring expenses found.";

          return data.map((r: Record<string, unknown>) =>
            `• ${r.name} (ID: ${r.id}) — $${Number(r.amount).toFixed(2)}/month (day ${r.day_of_month}) — ${r.category_key} — ${r.is_active ? "🟢 Active" : "⚪ Paused"}${r.notes ? ` — "${r.notes}"` : ""}`
          ).join("\n");
        } catch { return "Recurring expense search temporarily unavailable."; }
      },
    }),

    // ── SEARCH: Archived Clients (Hangar) ─────────────────────────────────────
    searchArchivedClients: tool({
      description: "Search archived clients in the Hangar by name. Use when the user asks 'find [name] in the Hangar', 'who have I archived?', or before unarchiving a client.",
      inputSchema: z.object({
        query: z.string().optional().describe("Client name to search for (leave empty to list recent archives)"),
      }),
      execute: async ({ query }) => {
        try {
          let q = supabase
            .from("clients")
            .select("id, name, archived_at, archive_reason, email, phone")
            .eq("user_id", userId)
            .not("archived_at", "is", null)
            .order("archived_at", { ascending: false })
            .limit(10);

          if (query) q = q.ilike("name", `%${query}%`);

          const { data, error } = await q;
          if (error) return `Search failed: ${error.message}`;
          if (!data || data.length === 0) return query ? `No archived clients found matching "${query}".` : "No archived clients in the Hangar.";

          return `Found ${data.length} archived client${data.length === 1 ? "" : "s"} in the Hangar:\n` +
            data.map((c: Record<string, unknown>) =>
              `• ${c.name} (ID: ${c.id}) — archived ${c.archived_at ? new Date(c.archived_at as string).toLocaleDateString("en-CA") : "unknown"}${c.archive_reason ? ` — reason: ${c.archive_reason}` : ""}`
            ).join("\n");
        } catch { return "Archived client search temporarily unavailable."; }
      },
    }),

    // ── UPDATE: Mileage entry ─────────────────────────────────────────────────
    updateMileage: tool({
      description: "Update a mileage log entry — change km, date, locations, or purpose. Use searchMileageLogs first to find the entry ID.",
      inputSchema: z.object({
        mileageId: z.string().uuid().describe("The mileage log UUID"),
        km: z.number().optional().describe("Updated kilometres"),
        tripDate: z.string().optional().describe("Updated date (YYYY-MM-DD)"),
        fromLocation: z.string().optional().describe("Updated from location"),
        toLocation: z.string().optional().describe("Updated to location"),
        purpose: z.string().optional().describe("Updated purpose"),
      }),
      execute: async ({ mileageId, km, tripDate, fromLocation, toLocation, purpose }) => {
        try {
          const updates: Record<string, unknown> = {};
          const changed: string[] = [];

          if (km !== undefined) { updates.km = km; changed.push(`km → ${km}`); }
          if (tripDate) { updates.trip_date = tripDate; changed.push(`date → ${tripDate}`); }
          if (fromLocation) { updates.from_location = fromLocation; changed.push(`from → ${fromLocation}`); }
          if (toLocation) { updates.to_location = toLocation; changed.push(`to → ${toLocation}`); }
          if (purpose) { updates.purpose = purpose; changed.push(`purpose → ${purpose}`); }

          if (changed.length === 0) return "No changes specified.";

          const { error } = await supabase
            .from("mileage_logs")
            .update(updates)
            .eq("id", mileageId)
            .eq("user_id", userId);

          if (error) return `Failed to update mileage: ${error.message}`;
          return `✓ Mileage entry updated: ${changed.join(", ")}. Note: the CRA deduction will recalculate based on your YTD total km.`;
        } catch { return "Failed to update mileage. Please try again."; }
      },
    }),

    // ── DELETE: Mileage entry ─────────────────────────────────────────────────
    deleteMileage: tool({
      description: "Delete a mileage log entry. Use searchMileageLogs first to find the entry ID. Gated by the approval card.",
      inputSchema: z.object({
        mileageId: z.string().uuid().describe("The mileage log UUID"),
        tripDescription: z.string().describe("Brief description for the approval card"),
      }),
      needsApproval: true,
      execute: async ({ mileageId, tripDescription }) => {
        try {
          const { error } = await supabase
            .from("mileage_logs")
            .delete()
            .eq("id", mileageId)
            .eq("user_id", userId);

          if (error) return `Failed to delete mileage: ${error.message}`;
          return `✓ Mileage entry deleted — ${tripDescription}. Your YTD mileage totals and deductions will update.`;
        } catch { return "Failed to delete mileage. Please try again."; }
      },
    }),

    // ── DELETE: Contact task ──────────────────────────────────────────────────
    deleteContactTask: tool({
      description: "Delete a contact task. Use searchContactTasks first to find the task ID. Gated by the approval card.",
      inputSchema: z.object({
        taskId: z.string().uuid().describe("The task UUID"),
        taskTitle: z.string().describe("Task title for the approval card"),
      }),
      needsApproval: true,
      execute: async ({ taskId, taskTitle }) => {
        try {
          const { error } = await supabase
            .from("contact_tasks")
            .delete()
            .eq("id", taskId)
            .eq("user_id", userId);

          if (error) return `Failed to delete task: ${error.message}`;
          return `✓ Task "${taskTitle}" deleted.`;
        } catch { return "Failed to delete task. Please try again."; }
      },
    }),

    // ── DELETE: Referral ──────────────────────────────────────────────────────
    deleteReferral: tool({
      description: "Delete a referral record. Use searchReferrals first to find the referral ID. Gated by the approval card.",
      inputSchema: z.object({
        referralId: z.string().uuid().describe("The referral UUID"),
        referralDescription: z.string().describe("Description for the approval card"),
      }),
      needsApproval: true,
      execute: async ({ referralId, referralDescription }) => {
        try {
          const { error } = await supabase
            .from("referrals")
            .delete()
            .eq("id", referralId)
            .eq("user_id", userId);

          if (error) return `Failed to delete referral: ${error.message}`;
          return `✓ Referral deleted — ${referralDescription}. View remaining referrals at **Referrals** (/referrals).`;
        } catch { return "Failed to delete referral. Please try again."; }
      },
    }),

    // ── DELETE: Listing appointment ───────────────────────────────────────────
    deleteListingAppointment: tool({
      description: "Delete a listing appointment. Use searchListingAppointments first to find the ID. Gated by the approval card.",
      inputSchema: z.object({
        appointmentId: z.string().uuid().describe("The listing appointment UUID"),
        appointmentDescription: z.string().describe("Description for the approval card"),
      }),
      needsApproval: true,
      execute: async ({ appointmentId, appointmentDescription }) => {
        try {
          const { error } = await supabase
            .from("listing_appointments")
            .delete()
            .eq("id", appointmentId)
            .eq("user_id", userId);

          if (error) return `Failed to delete appointment: ${error.message}`;
          return `✓ Listing appointment deleted — ${appointmentDescription}.`;
        } catch { return "Failed to delete listing appointment. Please try again."; }
      },
    }),

    // ── UPDATE: Property showing ──────────────────────────────────────────────
    updatePropertyShowing: tool({
      description: "Update a property showing — change rating, notes, or listing price. Use searchPropertyShowings first to find the showing ID.",
      inputSchema: z.object({
        showingId: z.string().uuid().describe("The property showing UUID"),
        clientRating: z.number().min(1).max(5).optional().describe("Updated rating (1-5)"),
        listingPrice: z.number().optional().describe("Updated listing price"),
        notes: z.string().optional().describe("Updated notes"),
      }),
      execute: async ({ showingId, clientRating, listingPrice, notes }) => {
        try {
          const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
          const changed: string[] = [];

          if (clientRating !== undefined) { updates.client_rating = clientRating; changed.push(`rating → ${clientRating}/5`); }
          if (listingPrice !== undefined) { updates.listing_price = listingPrice; changed.push(`price → $${listingPrice.toLocaleString()}`); }
          if (notes !== undefined) { updates.notes = notes; changed.push("notes updated"); }

          if (changed.length === 0) return "No changes specified.";

          const { error } = await supabase
            .from("property_showings")
            .update(updates)
            .eq("id", showingId)
            .eq("user_id", userId);

          if (error) return `Failed to update showing: ${error.message}`;
          return `✓ Property showing updated: ${changed.join(", ")}.`;
        } catch { return "Failed to update property showing. Please try again."; }
      },
    }),

    // ── DELETE: Property showing ───────────────────────────────────────────��──
    deletePropertyShowing: tool({
      description: "Delete a property showing record. Use searchPropertyShowings first to find the showing ID. Gated by the approval card.",
      inputSchema: z.object({
        showingId: z.string().uuid().describe("The property showing UUID"),
        showingDescription: z.string().describe("Description for the approval card"),
      }),
      needsApproval: true,
      execute: async ({ showingId, showingDescription }) => {
        try {
          const { error } = await supabase
            .from("property_showings")
            .delete()
            .eq("id", showingId)
            .eq("user_id", userId);

          if (error) return `Failed to delete showing: ${error.message}`;
          return `✓ Property showing deleted — ${showingDescription}.`;
        } catch { return "Failed to delete property showing. Please try again."; }
      },
    }),

    // ─────────────────────────────────────────────────────────────────────────
    // DRAFTING TOOLS (Phase 2.2 — Captain + Dispatcher only)
    //
    // These four tools wrap the on-demand drafting routes so the Flight Crew
    // can produce drafts conversationally. All four are DRAFTS ONLY — nothing
    // is auto-sent. Outreach + newsletter writes go to their existing queue
    // tables with status="ready", visible in Flight Control. Listing
    // descriptions and social posts return inline (no DB persistence).
    //
    // Persona partitioning is enforced in createPersonaAgentTools below:
    //   - Dispatcher: draftOutreachForClient, draftListingDescription
    //   - Captain:    draftNewsletter, draftSocialPost
    //
    // Tools share their core logic with the API routes through
    // @/lib/ai/draft-services so prompt engineering and DB writes live in
    // exactly one place.
    // ─────────────────────────────────────────────────────────────────────────

    // ── DRAFT OUTREACH FOR CLIENT (Dispatcher) ───────────────────────────────
    draftOutreachForClient: tool({
      description: "Draft a personalized outreach message for a specific client based on their situation and the touchpoint type. Use searchClients first to resolve the client_id. The message is written to Flight Control as a DRAFT — it is NEVER sent automatically; the agent reviews and sends it. Choose the opportunity_type that matches the touchpoint reason (birthday, closing anniversary, mortgage renewal due/window, past-client check-in, timeframe approaching for active buyer/seller, property value milestone).",
      inputSchema: z.object({
        client_id: z.string().uuid().describe("The client UUID — get this from searchClients first"),
        opportunity_type: z.enum([
          "birthday",
          "closing_anniversary",
          "mortgage_renewal_due",
          "mortgage_renewal_window",
          "past_client_check_in",
          "timeframe_approaching",
          "property_value_milestone",
        ]).describe("Which kind of touchpoint to draft"),
      }),
      execute: async ({ client_id, opportunity_type }) => {
        try {
          const result = await draftOutreachForClientService({
            supabase,
            userId,
            clientId: client_id,
            opportunityType: opportunity_type as OutreachOpportunityType,
          });

          const who = result.clientName || "this client";

          if (result.status === "created") {
            return `✓ Outreach draft created for ${who} (${opportunity_type.replace(/_/g, " ")}). Review it in **Flight Control → Outreach Queue** before sending.`;
          }
          if (result.status === "existing") {
            return `An outreach draft for ${who} on this same opportunity already exists. Open **Flight Control → Outreach Queue** to review or send it.`;
          }
          // queued — either AI unavailable or a validation problem (no birthdate, no close date, etc.)
          if (result.reason && !result.queueItemId) {
            return `Couldn't draft outreach for ${who}: ${result.reason}.`;
          }
          return `Outreach draft for ${who} is queued — the AI service was unavailable. The cron retry will pick it up. Check **Flight Control → Outreach Queue** shortly.`;
        } catch (err) {
          console.error("[tool/draftOutreachForClient] error:", err);
          return "Drafting outreach failed. Try again in a moment, or draft it manually from Flight Control.";
        }
      },
    }),

    // ── DRAFT LISTING DESCRIPTION (Dispatcher) ────────────────────────────────
    draftListingDescription: tool({
      description: "Draft a listing description and paired social post for a client's property. Pass either client_record_id (preferred — pulls specs from the transaction record) or specs (manual entry). Returns the description and social post inline. Drafts only — the agent copies the text into MLS / social platforms.",
      inputSchema: z.object({
        client_record_id: z.string().uuid().optional().describe("The client_records UUID — preferred path; pulls bedrooms / baths / sq ft / etc. automatically"),
        client_id: z.string().uuid().optional().describe("Optional: client UUID for city fallback when client_record_id has no city"),
        specs: z.object({
          address: z.string().optional().nullable(),
          bedrooms: z.number().optional().nullable(),
          bathrooms: z.number().optional().nullable(),
          square_feet: z.number().optional().nullable(),
          lot_acres: z.number().optional().nullable(),
          garage: z.boolean().optional().nullable(),
          waterfront: z.boolean().optional().nullable(),
          city: z.string().optional().nullable(),
        }).optional().describe("Manual property specs — only use if client_record_id is unavailable. Needs at least 2 fields filled."),
        no_emoji: z.boolean().optional().describe("Set true to suppress emojis in the social post"),
      }),
      execute: async ({ client_record_id, client_id, specs, no_emoji }) => {
        try {
          if (!client_record_id && !specs) {
            return "Need either a client_record_id (for an existing transaction) or manual specs to draft a listing.";
          }

          const result = await draftListingDescriptionService({
            supabase,
            userId,
            clientRecordId: client_record_id,
            clientId: client_id,
            specs,
            noEmoji: no_emoji,
          });

          if ("error" in result) return `Couldn't draft listing: ${result.error}`;

          const description = result.description?.trim() || "(no description returned)";
          const socialPost = result.socialPost?.trim() || "";

          if (socialPost) {
            return `Listing description (drafts only — paste into your MLS / website):\n\n${description}\n\n— — —\n\nPaired social post:\n\n${socialPost}`;
          }
          return `Listing description:\n\n${description}`;
        } catch (err) {
          console.error("[tool/draftListingDescription] error:", err);
          return "Drafting the listing description failed. Try again, or use the listing tools in CRM directly.";
        }
      },
    }),

    // ── DRAFT NEWSLETTER (Captain) ────────────────────────────────────────────
    draftNewsletter: tool({
      description: "Draft a broadcast email newsletter for the agent's client list. Use template='boc_rate_change' for Bank of Canada rate-change announcements (requires old_rate + new_rate as percent decimals like 4.25 and 4.00); use template='custom' for any other topic (requires the topic field). The newsletter is written to Flight Control as a DRAFT — it is NEVER sent automatically; the agent reviews and sends it.",
      inputSchema: z.object({
        template: z.enum(["boc_rate_change", "custom"]).describe("Which template to use"),
        topic: z.string().optional().describe("Required when template='custom'. A short description of what the newsletter is about (e.g. 'spring market kickoff', 'new listing in Quispamsis')"),
        old_rate: z.number().optional().describe("Required when template='boc_rate_change'. The previous overnight rate as a percent (e.g. 4.25)"),
        new_rate: z.number().optional().describe("Required when template='boc_rate_change'. The new overnight rate as a percent (e.g. 4.00)"),
        effective_date: z.string().optional().describe("Optional, boc_rate_change only. ISO date the change takes effect"),
        notes: z.string().optional().describe("Optional. Free-form notes from the agent the AI should weave in"),
      }),
      execute: async ({ template, topic, old_rate, new_rate, effective_date, notes }) => {
        try {
          const result = await draftNewsletterService({
            supabase,
            userId,
            templateType: template as NewsletterTemplateType,
            oldRate: old_rate,
            newRate: new_rate,
            effectiveDate: effective_date,
            topic,
            notes,
          });

          if ("error" in result) return `Couldn't draft newsletter: ${result.error}`;

          if (result.status === "created") {
            return `✓ Newsletter draft created. Review it in **Flight Control → Newsletters** before sending — nothing has been sent.`;
          }
          return `Newsletter is queued — the AI service was unavailable. Check **Flight Control → Newsletters** shortly.`;
        } catch (err) {
          console.error("[tool/draftNewsletter] error:", err);
          return "Drafting the newsletter failed. Try again, or draft it manually from Flight Control → Newsletters.";
        }
      },
    }),

    // ── DRAFT SOCIAL POST (Captain) ───────────────────────────────────────────
    draftSocialPost: tool({
      description: "Draft a social media post (LinkedIn / Facebook / Instagram). Pick the template that matches the moment: listing_announcement (new listing), just_sold (closed deal), open_house (upcoming open house), market_update (general market read), client_win (client milestone). Use template='custom' for anything else — context is required for custom posts. Returns the draft inline; the agent copies it to whichever platform.",
      inputSchema: z.object({
        template: z.enum([
          "listing_announcement",
          "just_sold",
          "open_house",
          "market_update",
          "client_win",
          "custom",
        ]).describe("Which template to use"),
        context: z.string().optional().describe("Optional notes the agent wants reflected. REQUIRED when template='custom'."),
        client_name: z.string().optional().describe("Optional client name (first name preferred — only used if natural to mention)"),
        property_address: z.string().optional().describe("Optional property address if the post is about a specific listing"),
      }),
      execute: async ({ template, context, client_name, property_address }) => {
        try {
          if (template === "custom" && !context?.trim()) {
            return "Need a context note for a custom social post. Tell me what the post should be about.";
          }
          const draft = await draftSocialPostService({
            userId,
            template: template as SocialPostTemplate,
            context: context?.trim() || null,
            clientName: client_name?.trim() || null,
            propertyAddress: property_address?.trim() || null,
          });
          if (!draft) return "Drafting the social post failed — the AI service may be temporarily unavailable.";
          return `Social post draft (copy this to your platform of choice):\n\n${draft}`;
        } catch (err) {
          console.error("[tool/draftSocialPost] error:", err);
          return "Drafting the social post failed. Try again in a moment.";
        }
      },
    }),

    // ── GET WORKFLOW TEMPLATES (Dispatcher) ───────────────────────────────────
    // Phase 2.3 (HML gap-closure): Flight Status workflow library. Lets
    // Dispatcher proactively suggest a templated draft when a client has
    // moved to a new stage. Read-only — does NOT generate the draft. The
    // agent clicks "Draft" in the CRM client detail panel to actually
    // generate one (or asks Dispatcher to call draftOutreachForClient for
    // the specific opportunity).
    getWorkflowTemplates: tool({
      description: "List the Flight Status workflow email templates available for a specific client based on their current Flight Status stage (Boarding / Scheduled / In-Flight / Cruising) and whether they have a closed transaction on record. Also lists any pending workflow drafts already generated for this client. Use this to proactively suggest a templated draft when the agent mentions a stage transition. This tool is read-only — to actually generate a draft, the agent clicks Draft in the CRM client detail panel.",
      inputSchema: z.object({
        client_id: z.string().uuid().describe("The client UUID — get this from searchClients first"),
      }),
      execute: async ({ client_id }) => {
        try {
          // 1. Resolve client (ownership enforced)
          const { data: client, error: clientErr } = await supabase
            .from("clients")
            .select("id, name, first_name, last_name, status")
            .eq("id", client_id)
            .eq("user_id", userId)
            .is("archived_at", null)
            .single();

          if (clientErr || !client) {
            return "Couldn't find that client (or they're archived).";
          }

          const displayName = client.name?.trim()
            || [client.first_name, client.last_name].filter(Boolean).join(" ").trim()
            || "this client";

          // 2. Has closed record? (drives anniversary eligibility)
          const { count: closedCount } = await supabase
            .from("client_records")
            .select("id", { count: "exact", head: true })
            .eq("client_id", client_id)
            .eq("user_id", userId)
            .not("close_date", "is", null);
          const hasClosedRecord = (closedCount ?? 0) > 0;

          // 3. Map status → eligible trigger events (mirrors WorkflowSuggestionsPanel)
          const status = client.status as "boarding" | "scheduled" | "in_flight" | "cruising";
          const eligible: string[] = [];
          if (status === "boarding") eligible.push("new_lead");
          else if (status === "scheduled") eligible.push("showing_scheduled");
          else if (status === "in_flight") eligible.push("listing_active", "transaction_milestone");
          else if (status === "cruising") eligible.push("closing_day");
          if (hasClosedRecord) eligible.push("anniversary");

          if (eligible.length === 0) {
            return `${displayName} is in the ${status} stage with no closed records — no Flight Plan templates are available right now.`;
          }

          // 4. Load templates (RLS-scoped: system rows + own rows)
          const { data: templates, error: tmplErr } = await supabase
            .from("workflow_templates")
            .select("id, name, trigger_event")
            .in("trigger_event", eligible)
            .eq("is_active", true)
            .order("name");

          if (tmplErr) {
            console.error("[tool/getWorkflowTemplates] templates err:", tmplErr);
            return "Couldn't load Flight Plan templates right now.";
          }

          // 5. Pending drafts for this client
          const { data: pendingDrafts } = await supabase
            .from("workflow_drafts")
            .select("id, trigger_event, subject, generated_at")
            .eq("user_id", userId)
            .eq("client_id", client_id)
            .eq("status", "pending")
            .order("generated_at", { ascending: false })
            .limit(5);

          const lines: string[] = [];
          lines.push(`Flight Plan templates for ${displayName} (${status} stage):`);
          if (!templates || templates.length === 0) {
            lines.push("• None active.");
          } else {
            for (const t of templates) {
              lines.push(`• **${t.name}** (${t.trigger_event.replace(/_/g, " ")})`);
            }
          }

          if (pendingDrafts && pendingDrafts.length > 0) {
            lines.push("");
            lines.push(`Pending drafts already generated for ${displayName}:`);
            for (const d of pendingDrafts) {
              lines.push(`• "${d.subject}" — ${d.trigger_event.replace(/_/g, " ")}`);
            }
          }

          lines.push("");
          lines.push("To generate a draft, the agent opens the client in CRM and clicks **Draft** on the matching template — drafts only, never auto-sent.");

          return lines.join("\n");
        } catch (err) {
          console.error("[tool/getWorkflowTemplates] error:", err);
          return "Couldn't load Flight Plan templates right now.";
        }
      },
    }),

  };
}

/**
 * Create a CORE subset of Flight Crew tools for token-constrained requests.
 * ~28 tools instead of ~75 — reduces tool definition tokens by ~60%.
 * Includes: client CRUD, pipeline basics, activity/task, recurring expenses,
 * expense/mileage/referral logging, transactions, CCA assets, listing
 * appointment updates, client summary, filters, tone, and referral linking.
 */
export function createCoreAgentTools(supabase: SupabaseClient, userId: string): ToolSet {
  const all = createAgentTools(supabase, userId);
  return {
    // Read-only
    searchClients: all.searchClients,
    searchPipelineDeals: all.searchPipelineDeals,
    searchTransactions: all.searchTransactions,
    searchExpenses: all.searchExpenses,
    searchListingAppointments: all.searchListingAppointments,
    searchCCAAssets: all.searchCCAAssets,
    searchClientsByFilter: all.searchClientsByFilter,
    getClientSummary: all.getClientSummary,
    getQuickStats: all.getQuickStats,
    // Writes (client)
    createClient: all.createClient,
    updateClientDetails: all.updateClientDetails,
    updateClientNotes: all.updateClientNotes,
    updateClientStatus: all.updateClientStatus,
    updateClientTags: all.updateClientTags,
    updateClientTone: all.updateClientTone,
    linkClientReferral: all.linkClientReferral,
    // Writes (pipeline)
    createPipelineDeal: all.createPipelineDeal,
    updatePipelineDealStage: all.updatePipelineDealStage,
    updatePipelineDealValue: all.updatePipelineDealValue,
    // Writes (activity / tasks)
    logContactActivity: all.logContactActivity,
    createContactTask: all.createContactTask,
    // Writes (expenses / mileage / referrals)
    createRecurringExpense: all.createRecurringExpense,
    deleteRecurringExpense: all.deleteRecurringExpense,
    logExpense: all.logExpense,
    updateExpense: all.updateExpense,
    logMileage: all.logMileage,
    recordReferral: all.recordReferral,
    // Writes (transactions / CCA / listings)
    recordTransaction: all.recordTransaction,
    updateTransaction: all.updateTransaction,
    addCCAAsset: all.addCCAAsset,
    updateListingAppointment: all.updateListingAppointment,
  };
}

/**
 * Flight Crew persona ID — duplicated here rather than imported from
 * `/lib/flight-crew/personas` to avoid a Next.js client/server import issue
 * (personas.ts imports lucide-react for icons). The literal union is the
 * source of truth; ai-chat.tsx + route.ts both validate against it.
 */
type FlightCrewPersona = "captain" | "navigator" | "dispatcher";

/**
 * Per-persona tool allow-lists. Previously every persona got the full Core
 * tool set, which meant Captain could use Dispatcher's client-search tools
 * (and answer questions that should have been handed off) and Navigator
 * could touch Dispatcher's pipeline writes. Dogfooding Test A.2 caught
 * Captain answering "who haven't I followed up with" by calling client
 * tools despite a forceful prompt rule against doing so — prompt adherence
 * alone is unreliable when the model has tempting tools available.
 *
 * Partitioning rule:
 * - CAPTAIN → getQuickStats only (strategic synthesis). No client search,
 *   no transaction writes, no pipeline actions. If Captain is asked anything
 *   requiring a specific name, dollar figure, or stage change, it must hand
 *   off because it physically has no tool to answer.
 * - NAVIGATOR → money/finance tools (transactions, expenses, mileage, CCA,
 *   recurring expenses, listing-appointment reads for financial context).
 *   No client writes, no pipeline actions.
 * - DISPATCHER → people/pipeline tools (clients, pipeline, activities,
 *   tasks, listing appointment updates, referrals). No transaction writes,
 *   no expense logging.
 *
 * Listing appointments and referrals are shared in read form but partitioned
 * on writes — Dispatcher updates listing appointments as a pipeline action,
 * Navigator reads them for income context.
 */
export function createPersonaAgentTools(
  supabase: SupabaseClient,
  userId: string,
  persona: FlightCrewPersona,
): ToolSet {
  const all = createAgentTools(supabase, userId);

  if (persona === "captain") {
    // Strategic synthesis only — nothing domain-specific.
    // Captain's "how am I doing" answers come from data injected in the
    // system prompt (runway, pace, KPIs); getQuickStats is a small backup
    // for cross-domain dashboard questions.
    //
    // Drafting: Captain owns BROADCAST drafts (newsletters + social posts)
    // because those are direction-setting / content-strategy actions, not
    // per-client touches. Per-client drafts (outreach, listing descriptions)
    // belong to Dispatcher.
    return {
      getQuickStats: all.getQuickStats,
      draftNewsletter: all.draftNewsletter,
      draftSocialPost: all.draftSocialPost,
    };
  }

  if (persona === "navigator") {
    // Money + finance mechanics. No client or pipeline actions.
    return {
      // Reads
      searchTransactions: all.searchTransactions,
      searchExpenses: all.searchExpenses,
      searchListingAppointments: all.searchListingAppointments,
      searchCCAAssets: all.searchCCAAssets,
      getQuickStats: all.getQuickStats,
      // Writes — transactions, expenses, CCA, mileage
      createRecurringExpense: all.createRecurringExpense,
      deleteRecurringExpense: all.deleteRecurringExpense,
      logExpense: all.logExpense,
      updateExpense: all.updateExpense,
      logMileage: all.logMileage,
      recordTransaction: all.recordTransaction,
      updateTransaction: all.updateTransaction,
      addCCAAsset: all.addCCAAsset,
    };
  }

  // Dispatcher — people + pipeline. No financial writes.
  return {
    // Reads
    searchClients: all.searchClients,
    searchClientsByFilter: all.searchClientsByFilter,
    searchPipelineDeals: all.searchPipelineDeals,
    searchListingAppointments: all.searchListingAppointments,
    getClientSummary: all.getClientSummary,
    getQuickStats: all.getQuickStats,
    // Writes — clients
    createClient: all.createClient,
    updateClientDetails: all.updateClientDetails,
    updateClientNotes: all.updateClientNotes,
    updateClientStatus: all.updateClientStatus,
    updateClientTags: all.updateClientTags,
    updateClientTone: all.updateClientTone,
    linkClientReferral: all.linkClientReferral,
    recordReferral: all.recordReferral,
    // Writes — pipeline
    createPipelineDeal: all.createPipelineDeal,
    updatePipelineDealStage: all.updatePipelineDealStage,
    updatePipelineDealValue: all.updatePipelineDealValue,
    // Writes — activities / tasks / appointments
    logContactActivity: all.logContactActivity,
    createContactTask: all.createContactTask,
    updateListingAppointment: all.updateListingAppointment,
    // Drafting — per-client (Dispatcher's lane). Broadcast drafts (newsletter,
    // social post) live with Captain.
    draftOutreachForClient: all.draftOutreachForClient,
    draftListingDescription: all.draftListingDescription,
    // Flight Status workflow library (Phase 2.3) — read-only template lookup.
    // Lets Dispatcher proactively suggest a templated draft when a client
    // has changed stage. Generation happens in the CRM client detail panel.
    getWorkflowTemplates: all.getWorkflowTemplates,
  };
}
