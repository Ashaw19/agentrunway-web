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
 *   Autonomous          — logContactActivity, updateClientStatus,
 *                         updateClientNotes, updateClientDetails,
 *                         updatePipelineDealStage, updatePipelineDealProbability,
 *                         updatePipelineDealCloseDate, updateGCIGoal,
 *                         archiveClient, linkClientReferral
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
