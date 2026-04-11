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
 *   Search (read-only)  — searchClients, searchPipelineDeals
 *   Create              — createClient, createPipelineDeal
 *   Autonomous          — logContactActivity, updateClientStatus,
 *                         updateClientNotes, updateClientDetails,
 *                         updatePipelineDealStage, updatePipelineDealProbability,
 *                         updatePipelineDealCloseDate, updatePipelineDealDetails,
 *                         updateGCIGoal, archiveClient, unarchiveClient,
 *                         linkClientReferral, removePipelineDeal
 *   Confirm-required    — logExpense, recordTransaction, updatePipelineDealValue
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

          return `✓ New client created — ${name.trim()}${details.length ? ` (${details.join(", ")})` : ""}, status: ${status ?? "boarding"}. Client ID: ${data.id}`;
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
          return `✓ Pipeline deal created — ${address} (${clientName}, ${side} side), $${estimatedPrice.toLocaleString()} list price, ~$${gci.toLocaleString()} GCI, stage: ${stage ?? "lead"}. Deal ID: ${data.id}`;
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

  };
}
