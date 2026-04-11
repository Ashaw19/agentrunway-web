/**
 * AI Advisor Write Tools
 *
 * Gives the AI Advisor the ability to act on behalf of the user —
 * creating and updating records across the Agent Runway data model.
 *
 * Architecture:
 * - createAgentTools(supabase, userId) returns all tool definitions
 * - Each tool validates inputs, writes to Supabase, and returns a
 *   natural-language result string the AI surfaces in its response
 * - Dollar-amount tools require confirmed: true before writing;
 *   when confirmed is false they return a preview for the AI to present
 * - All tools gracefully return error strings (never throw) so a tool
 *   failure never crashes the stream
 *
 * Tool categories:
 *   Search (read-only)  — searchClients, searchPipelineDeals, searchContactTasks,
 *                         searchExpenses, searchOutreachQueue, searchTransactions,
 *                         getClientSummary, getUpcomingAgenda
 *   Create              — createClient, createPipelineDeal, createContactTask,
 *                         createRecurringExpense, addPropertyShowing,
 *                         addListingAppointment
 *   Autonomous          — logContactActivity, updateClientStatus,
 *                         updateClientNotes, updateClientDetails,
 *                         updateClientTags, updatePipelineDealStage,
 *                         updatePipelineDealProbability, updatePipelineDealCloseDate,
 *                         updatePipelineDealDetails, updateGCIGoal,
 *                         updateUserSettings, archiveClient, unarchiveClient,
 *                         linkClientReferral, linkClientRelationship,
 *                         removePipelineDeal, completeContactTask,
 *                         skipOutreachItem, deleteContactActivity
 *   Confirm-required    — logExpense, logMileage, recordTransaction,
 *                         recordReferral, deleteExpense, addCCAAsset,
 *                         updateTransaction, deleteTransaction,
 *                         updatePipelineDealValue
 */

import { tool, type ToolSet } from "ai";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

// ── Types ────────────────────────────────────────────────────────────────────

const CLIENT_STATUSES = ["boarding", "scheduled", "in_flight", "cruising"] as const;
const ACTIVITY_TYPES = ["call", "email", "text", "showing", "meeting", "offer", "note"] as const;
const PIPELINE_STAGES = ["lead", "showing", "offer", "conditional", "firm", "closed"] as const;
const EXPENSE_CATEGORY_KEYS = ["vehicle", "marketing", "office_tech", "professional_fees", "travel_meals", "insurance_licenses", "education_dev", "other"] as const;
const TRANSACTION_SIDES = ["buyer", "seller", "both"] as const;
const ARCHIVE_REASONS = ["deceased", "moved_away", "do_not_contact", "other"] as const;

// ── Factory ──────────────────────────────────────────────────────────────────

/**
 * Create all AI Advisor tools bound to the authenticated Supabase client.
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
        city: z.string().optional().describe("Client city"),
        status: z.enum(CLIENT_STATUSES).default("boarding").describe("Initial flight status — defaults to 'boarding' (active lead)"),
        propertyInterest: z.number().optional().describe("Budget (buyer) or expected listing price (seller) in dollars"),
        propertyInterestType: z.enum(["budget", "listing"]).optional().describe("Whether the amount is a buyer budget or seller listing price"),
        side: z.enum(["buyer", "seller"]).optional().describe("Whether this client is a buyer or seller — helps set defaults"),
        timeframe: z.enum(["asap", "1_3_months", "3_6_months", "6_12_months", "12_plus", "unknown"]).optional().describe("Buying/selling timeframe"),
        notes: z.string().optional().describe("Any initial notes about the client"),
        leadSource: z.enum(["referral", "sphere", "open_house", "online", "sign_call", "cold_call", "door_knock", "social_media", "repeat", "other"]).optional().describe("How this client came to the agent"),
      }),
      execute: async ({ name, email, phone, city, status, propertyInterest, propertyInterestType, side, timeframe, notes, leadSource }) => {
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
          if (propertyInterest !== undefined) record.property_interest = propertyInterest;
          if (propertyInterestType) record.property_interest_type = propertyInterestType;
          else if (side === "seller") record.property_interest_type = "listing";
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
      description: "Update a client's flight status. Valid statuses: boarding (active lead, not yet under contract), scheduled (future intent — plans to act later), in_flight (under contract / transaction in progress), cruising (past client or long-term nurture).",
      inputSchema: z.object({
        clientId: z.string().uuid().describe("The client UUID from searchClients"),
        clientName: z.string().describe("Client name for confirmation message"),
        status: z.enum(CLIENT_STATUSES).describe("New flight status"),
      }),
      execute: async ({ clientId, clientName, status }) => {
        try {
          const { error } = await supabase
            .from("clients")
            .update({ status, updated_at: new Date().toISOString() })
            .eq("id", clientId)
            .eq("user_id", userId);

          if (error) return `Failed to update status: ${error.message}`;

          const statusLabels: Record<string, string> = {
            boarding: "Boarding (active lead)",
            scheduled: "Scheduled (future intent)",
            in_flight: "In-Flight (under contract)",
            cruising: "Cruising (past client / nurture)",
          };

          return `✓ ${clientName}'s status updated to ${statusLabels[status] ?? status}.`;
        } catch {
          return "Failed to update client status. Please try again.";
        }
      },
    }),

    // ── UPDATE CLIENT NOTES ───────────────────────────────────────────────────
    updateClientNotes: tool({
      description: "Add or update notes on a client's profile. Use mode 'append' to add to existing notes (default), or 'replace' to overwrite entirely.",
      inputSchema: z.object({
        clientId: z.string().uuid().describe("The client UUID from searchClients"),
        clientName: z.string().describe("Client name for confirmation message"),
        note: z.string().describe("The note text to add or set"),
        mode: z.enum(["append", "replace"]).default("append").describe("append adds to existing notes; replace overwrites"),
      }),
      execute: async ({ clientId, clientName, note, mode }) => {
        try {
          let finalNote = note;

          if (mode === "append") {
            const { data: existing } = await supabase
              .from("clients")
              .select("notes")
              .eq("id", clientId)
              .eq("user_id", userId)
              .single();

            const existingNotes = existing?.notes ?? "";
            const timestamp = new Date().toLocaleDateString("en-CA");
            finalNote = existingNotes
              ? `${existingNotes}\n\n[${timestamp}] ${note}`
              : `[${timestamp}] ${note}`;
          }

          const { error } = await supabase
            .from("clients")
            .update({ notes: finalNote, updated_at: new Date().toISOString() })
            .eq("id", clientId)
            .eq("user_id", userId);

          if (error) return `Failed to update notes: ${error.message}`;

          return `✓ Note ${mode === "append" ? "added to" : "updated on"} ${clientName}'s profile.`;
        } catch {
          return "Failed to update client notes. Please try again.";
        }
      },
    }),

    // ── UPDATE CLIENT DETAILS ─────────────────────────────────────────────────
    updateClientDetails: tool({
      description: "Update a client's key details such as budget, property interest, timeframe, preferred contact method, or financing details. Only pass the fields that need updating.",
      inputSchema: z.object({
        clientId: z.string().uuid().describe("The client UUID from searchClients"),
        clientName: z.string().describe("Client name for confirmation message"),
        propertyInterest: z.number().optional().describe("Budget (buyer) or expected listing price (seller) in dollars"),
        propertyInterestType: z.enum(["budget", "listing"]).optional().describe("Whether the amount is a buyer budget or seller listing price"),
        timeframe: z.enum(["asap", "1_3_months", "3_6_months", "6_12_months", "12_plus", "unknown"]).optional().describe("Buying/selling timeframe"),
        preferredContact: z.enum(["phone", "email", "text"]).optional().describe("Preferred contact method"),
        buyerPreApproved: z.boolean().optional().describe("Whether buyer is pre-approved for financing"),
        buyerPreApprovalAmount: z.number().optional().describe("Pre-approval amount in dollars"),
        buyerFinancingType: z.enum(["mortgage", "cash", "bridge", "unknown"]).optional().describe("Buyer financing type"),
        buyerTargetCloseDate: z.string().optional().describe("Target close date in YYYY-MM-DD format"),
        city: z.string().optional().describe("Client city"),
        email: z.string().optional().describe("Client email address"),
        phone: z.string().optional().describe("Client phone number"),
      }),
      execute: async ({ clientId, clientName, ...fields }) => {
        try {
          // Build update object from only the provided fields
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const updates: Record<string, any> = { updated_at: new Date().toISOString() };
          const changed: string[] = [];

          if (fields.propertyInterest !== undefined) { updates.property_interest = fields.propertyInterest; changed.push(`budget/price → $${fields.propertyInterest.toLocaleString()}`); }
          if (fields.propertyInterestType !== undefined) { updates.property_interest_type = fields.propertyInterestType; changed.push(`interest type → ${fields.propertyInterestType}`); }
          if (fields.timeframe !== undefined) { updates.timeframe = fields.timeframe; changed.push(`timeframe → ${fields.timeframe.replace(/_/g, " ")}`); }
          if (fields.preferredContact !== undefined) { updates.preferred_contact = fields.preferredContact; changed.push(`preferred contact → ${fields.preferredContact}`); }
          if (fields.buyerPreApproved !== undefined) { updates.buyer_pre_approved = fields.buyerPreApproved; changed.push(`pre-approved → ${fields.buyerPreApproved ? "yes" : "no"}`); }
          if (fields.buyerPreApprovalAmount !== undefined) { updates.buyer_pre_approval_amount = fields.buyerPreApprovalAmount; changed.push(`pre-approval amount → $${fields.buyerPreApprovalAmount.toLocaleString()}`); }
          if (fields.buyerFinancingType !== undefined) { updates.buyer_financing_type = fields.buyerFinancingType; changed.push(`financing → ${fields.buyerFinancingType}`); }
          if (fields.buyerTargetCloseDate !== undefined) { updates.buyer_target_close_date = fields.buyerTargetCloseDate; changed.push(`target close → ${fields.buyerTargetCloseDate}`); }
          if (fields.city !== undefined) { updates.city = fields.city; changed.push(`city → ${fields.city}`); }
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
      description: "Log a business expense. Requires confirmed: true before writing. When confirmed is false, return a preview for the agent to confirm. Category keys: vehicle, marketing, office_tech, professional_fees, travel_meals, insurance_licenses, education_dev, other.",
      inputSchema: z.object({
        vendor: z.string().describe("Business or vendor name (e.g. 'Shell', 'Facebook Ads', 'Rogers')"),
        amount: z.number().positive().describe("Expense total in dollars"),
        categoryKey: z.enum(EXPENSE_CATEGORY_KEYS).describe("Expense category key"),
        expenseDate: z.string().describe("Expense date in YYYY-MM-DD format"),
        notes: z.string().optional().describe("Optional notes about the expense"),
        confirmed: z.boolean().default(false).describe("Must be true to execute. When false, returns a preview for confirmation."),
      }),
      execute: async ({ vendor, amount, categoryKey, expenseDate, notes, confirmed }) => {
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

        if (!confirmed) {
          return `Ready to log: $${amount.toLocaleString()} expense at ${vendor} (${categoryLabels[categoryKey] ?? categoryKey}) on ${expenseDate}${notes ? ` — "${notes}"` : ""}. Confirm to save.`;
        }

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
      description: "Record a closed real estate transaction. Requires confirmed: true before writing. When confirmed is false, return a preview for the agent to confirm. Use gciOverride to enter the exact commission received; otherwise set salePrice and commissionPct and it will be calculated automatically.",
      inputSchema: z.object({
        address: z.string().describe("Property address"),
        clientName: z.string().describe("Client name"),
        side: z.enum(TRANSACTION_SIDES).describe("Agent side: buyer, seller, or both"),
        closeDate: z.string().describe("Close date in YYYY-MM-DD format"),
        salePrice: z.number().positive().optional().describe("Property sale price in dollars"),
        commissionPct: z.number().min(0).max(10).optional().describe("Commission rate as a percentage, e.g. 2.5 for 2.5%"),
        gciOverride: z.number().positive().optional().describe("Exact GCI received in dollars — use this instead of salePrice + commissionPct when you know the final commission amount"),
        notes: z.string().optional().describe("Optional transaction notes"),
        confirmed: z.boolean().default(false).describe("Must be true to execute. When false, returns a preview for confirmation."),
      }),
      execute: async ({ address, clientName, side, closeDate, salePrice, commissionPct, gciOverride, notes, confirmed }) => {
        // Calculate preview GCI for the confirmation message
        let previewGCI: number | null = null;
        if (gciOverride) {
          previewGCI = gciOverride;
        } else if (salePrice && commissionPct) {
          previewGCI = salePrice * (commissionPct / 100);
        }

        if (!confirmed) {
          const gciStr = previewGCI ? ` — GCI: $${previewGCI.toLocaleString()}` : "";
          const priceStr = salePrice ? ` at $${salePrice.toLocaleString()}` : "";
          return `Ready to record: ${address} (${clientName}, ${side} side)${priceStr}${gciStr}, closed ${closeDate}. Confirm to save.`;
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
      description: "Update the estimated sale price of a pipeline deal. Requires confirmed: true before writing.",
      inputSchema: z.object({
        dealId: z.string().uuid().describe("The deal UUID from searchPipelineDeals"),
        dealDescription: z.string().describe("Brief deal description for confirmation"),
        estimatedPrice: z.number().positive().describe("New estimated sale price in dollars"),
        confirmed: z.boolean().default(false).describe("Must be true to execute. When false, returns a preview for confirmation."),
      }),
      execute: async ({ dealId, dealDescription, estimatedPrice, confirmed }) => {
        if (!confirmed) {
          return `Ready to update: ${dealDescription} estimated price → $${estimatedPrice.toLocaleString()}. Confirm to save.`;
        }

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
        confirmed: z.boolean().default(false).describe("Must be true to execute. When false, returns a preview."),
      }),
      execute: async ({ tripDate, km, description, fromLocation, toLocation, confirmed }) => {
        const deduction = km * 0.72; // Simplified — engine handles 5K threshold

        if (!confirmed) {
          const route = fromLocation && toLocation ? ` (${fromLocation} → ${toLocation})` : "";
          return `Ready to log: ${km} km${route} on ${tripDate} — "${description}". Estimated deduction: $${deduction.toFixed(2)}. Confirm to save.`;
        }

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
            supabase.from("clients").select("name, status, email, phone, city, tags, notes, lead_source, timeframe, property_interest, property_interest_type, preferred_contact, buyer_pre_approved, buyer_pre_approval_amount, last_contact_at, created_at").eq("id", clientId).eq("user_id", userId).single(),
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
          if (c.city) parts.push(`City: ${c.city}`);
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
            supabase.from("clients").select("name, status, last_contact_at").eq("user_id", userId).is("archived_at", null).in("status", ["boarding", "in_flight"]).lt("last_contact_at", new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()).limit(10),
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
      description: "Set up a recurring business expense (monthly, quarterly, or annual). Use when the agent says 'I pay $X/month for...' or 'set up a recurring expense for...'",
      inputSchema: z.object({
        vendor: z.string().describe("Business or vendor name (e.g. 'Canva', 'Rogers', 'Desjardins Insurance')"),
        amount: z.number().positive().describe("Expense amount per period in dollars"),
        categoryKey: z.enum(EXPENSE_CATEGORY_KEYS).describe("Expense category key"),
        frequency: z.enum(["monthly", "quarterly", "annual"]).default("monthly").describe("How often this recurs"),
        notes: z.string().optional().describe("Optional notes"),
        confirmed: z.boolean().default(false).describe("Must be true to execute."),
      }),
      execute: async ({ vendor, amount, categoryKey, frequency, notes, confirmed }) => {
        const freqLabel = frequency ?? "monthly";
        if (!confirmed) {
          return `Ready to set up: $${amount.toLocaleString()}/${freqLabel} recurring expense at ${vendor} (${categoryKey.replace(/_/g, " ")}). This will auto-generate entries each ${freqLabel} period. Confirm to save.`;
        }

        try {
          const { error } = await supabase
            .from("recurring_expenses")
            .insert({
              user_id: userId,
              vendor,
              amount,
              category_key: categoryKey,
              frequency: freqLabel,
              is_active: true,
              notes: notes ?? null,
            });

          if (error) return `Failed to create recurring expense: ${error.message}`;

          return `✓ Recurring expense created — $${amount.toLocaleString()}/${freqLabel} at ${vendor}. Entries will auto-generate each period for you to confirm. Manage recurring expenses in **Expenses** (/expenses) under the **Recurring** tab.`;
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
      description: "Delete a receipt expense (e.g., duplicate entry). Always searchExpenses first to find the ID. Requires confirmation.",
      inputSchema: z.object({
        expenseId: z.string().uuid().describe("The expense UUID from searchExpenses"),
        expenseDescription: z.string().describe("Brief description for confirmation (e.g. '$45 at Shell on 2026-04-10')"),
        confirmed: z.boolean().default(false).describe("Must be true to execute."),
      }),
      execute: async ({ expenseId, expenseDescription, confirmed }) => {
        if (!confirmed) {
          return `Ready to delete expense: ${expenseDescription}. This cannot be undone. Confirm to proceed.`;
        }

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
        confirmed: z.boolean().default(false).describe("Must be true to execute."),
      }),
      execute: async ({ direction, partnerName, partnerBrokerage, clientName, propertyAddress, transactionType, referralFeePct, estimatedValue, notes, confirmed }) => {
        const feePct = referralFeePct ?? 25;
        const dirLabel = direction === "inbound" ? "received from" : "sent to";

        if (!confirmed) {
          return `Ready to log ${direction} referral: ${clientName} — ${dirLabel} ${partnerName}${partnerBrokerage ? ` (${partnerBrokerage})` : ""}, ${feePct}% fee${estimatedValue ? `, ~$${estimatedValue.toLocaleString()}` : ""}. Confirm to save.`;
        }

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
              referral_fee_pct: feePct / 100,
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
      description: "Add a capital cost allowance (CCA) asset for tax depreciation. Use when the agent mentions buying business equipment (laptop, camera, vehicle, etc.). Common CCA classes: Class 8 (office equipment/furniture, 20%), Class 10 (vehicles, 30%), Class 10.1 (passenger vehicles >$37,000, 30%), Class 12 (software/tools <$500, 100%), Class 50 (computers, 55%). The half-year rule applies automatically in the acquisition year.",
      inputSchema: z.object({
        description: z.string().describe("Asset description (e.g. 'MacBook Pro 16-inch', '2024 Honda CR-V')"),
        ccaClass: z.number().describe("CRA CCA class number (8, 10, 12, 50, etc.)"),
        classRate: z.number().min(0).max(100).describe("CCA rate as percentage (e.g. 20 for 20%, 55 for 55%)"),
        cost: z.number().positive().describe("Purchase cost in dollars"),
        acquisitionDate: z.string().describe("Purchase date YYYY-MM-DD"),
        businessUsePct: z.number().min(0).max(100).optional().describe("Business use percentage (default 100%)"),
        notes: z.string().optional().describe("Optional notes"),
        confirmed: z.boolean().default(false).describe("Must be true to execute."),
      }),
      execute: async ({ description, ccaClass, classRate, cost, acquisitionDate, businessUsePct, notes, confirmed }) => {
        const bizPct = (businessUsePct ?? 100) / 100;
        const rateDecimal = classRate / 100;
        const firstYearCCA = cost * bizPct * rateDecimal * 0.5; // half-year rule

        if (!confirmed) {
          return `Ready to add CCA asset: "${description}" — Class ${ccaClass} (${classRate}%), cost $${cost.toLocaleString()}, ${(bizPct * 100).toFixed(0)}% business use. First-year CCA deduction: ~$${firstYearCCA.toFixed(0)}. Confirm to save.`;
        }

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
      description: "Update details on a closed transaction. Use when the agent says 'change the sale price on that deal' or 'update the commission on [address]'. Requires confirmation for dollar changes.",
      inputSchema: z.object({
        transactionId: z.string().uuid().describe("The transaction UUID"),
        transactionDescription: z.string().describe("Brief description for confirmation"),
        address: z.string().optional().describe("Updated property address"),
        salePrice: z.number().optional().describe("Updated sale price in dollars"),
        commissionPct: z.number().min(0).max(10).optional().describe("Updated commission rate as percentage"),
        gciOverride: z.number().optional().describe("Updated exact GCI in dollars"),
        closeDate: z.string().optional().describe("Updated close date YYYY-MM-DD"),
        notes: z.string().optional().describe("Updated notes"),
        confirmed: z.boolean().default(false).describe("Must be true to execute."),
      }),
      execute: async ({ transactionId, transactionDescription, address, salePrice, commissionPct, gciOverride, closeDate, notes, confirmed }) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const updates: Record<string, any> = { updated_at: new Date().toISOString() };
        const changed: string[] = [];

        if (address !== undefined) { updates.address = address; changed.push(`address → ${address}`); }
        if (salePrice !== undefined) { updates.sale_price = salePrice; changed.push(`sale price → $${salePrice.toLocaleString()}`); }
        if (commissionPct !== undefined) { updates.commission_pct = commissionPct / 100; changed.push(`commission → ${commissionPct}%`); }
        if (gciOverride !== undefined) { updates.gci_override = gciOverride; changed.push(`GCI → $${gciOverride.toLocaleString()}`); }
        if (closeDate !== undefined) { updates.date = closeDate; changed.push(`close date → ${closeDate}`); }
        if (notes !== undefined) { updates.notes = notes; changed.push("notes updated"); }

        if (changed.length === 0) return "No fields to update were provided.";

        if (!confirmed) {
          return `Ready to update ${transactionDescription}: ${changed.join(", ")}. Confirm to save.`;
        }

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
      description: "Delete a closed transaction (e.g., duplicate or entered by mistake). This permanently removes it. Always confirm before executing.",
      inputSchema: z.object({
        transactionId: z.string().uuid().describe("The transaction UUID"),
        transactionDescription: z.string().describe("Brief description for confirmation"),
        confirmed: z.boolean().default(false).describe("Must be true to execute."),
      }),
      execute: async ({ transactionId, transactionDescription, confirmed }) => {
        if (!confirmed) {
          return `Ready to delete transaction: ${transactionDescription}. This cannot be undone and will affect your YTD GCI. Confirm to proceed.`;
        }

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
      description: "Delete a contact activity entry (e.g., duplicate or incorrect log). Use when the agent says 'remove that activity' or 'I logged that by mistake'.",
      inputSchema: z.object({
        activityId: z.string().uuid().describe("The activity UUID"),
        activityDescription: z.string().describe("Brief description for confirmation"),
      }),
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

  };
}
