import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { McpTool } from "./index.ts";
import {
  computeOpportunityKpis,
  OPPORTUNITY_DEFAULT_ODDS,
  type OpportunityRow,
} from "../lib/opportunity-conversion-engine.ts";

// ─── Loss-reason vocabulary ───────────────────────────────────────────────
// Inlined from packages/core/lib/opportunity-loss-reasons.ts. The DB enforces
// validity via CHECK on all three source tables; this guard returns a clean
// error before the RPC round-trip so the persona gets actionable feedback.
const OPPORTUNITY_LOSS_REASONS = [
  "chose_other_agent",
  "decided_not_to_transact",
  "price_disagreement",
  "timing_deferred",
  "out_of_area",
  "financing_fell_through",
  "lost_contact",
  "other",
] as const;

type OpportunitySource = "listing_appointment" | "buyer_prospect" | "referral";

// Chat utterances express odds/commission as PERCENTAGES ("60% odds",
// "2.5% commission"). The DB columns are numeric fractions (0.0000–1.0000 /
// 0.000000–…). normalizePct converts a 0–100 percentage to a 0–1 fraction.
// A value already in [0,1] is passed through (so "0.6" also works).
function normalizePct(v: number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  if (v > 1) return v / 100;
  return v;
}

function days_since_jan1(now: Date): number {
  const jan1 = Date.UTC(now.getUTCFullYear(), 0, 1);
  return Math.max(1, Math.ceil((now.getTime() - jan1) / 86_400_000));
}

export function getOpportunityTools(supabase: SupabaseClient, userId: string): McpTool[] {
  return [
    // ── list_opportunities ──────────────────────────────────────────────
    {
      name: "list_opportunities",
      description:
        "Returns pre-transactional opportunities (listing appointments, buyer prospects, referrals) from the unified opportunities view, plus a KPI summary (open count, weighted pre-contract GCI, appointment-to-contract conversion %, loss rate, top loss reasons) over a trailing 90-day window and year-to-date. Optionally filter by opportunity type or status.",
      inputSchema: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["listing_appointment", "buyer_prospect", "referral"],
            description: "Filter to one opportunity type. Omit for all types.",
          },
          status: {
            type: "string",
            enum: ["open", "converted", "lost"],
            description: "Filter by status. Omit for all statuses (KPIs need converted+lost rows to compute rates).",
          },
        },
        additionalProperties: false,
      },
      annotations: {
        title: "Opportunities",
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
      handler: async (args) => {
        const { type, status } = args as { type?: string; status?: string };

        let query = supabase
          .from("opportunities_v")
          .select(
            "id, opportunity_type, title, client_id, opportunity_date, expected_close_date, estimated_price, estimated_commission_pct, close_odds_pct, status, lost_reason, converted_to_pipeline_deal_id, converted_to_listing_appointment_id, notes, created_at, updated_at",
          )
          .eq("user_id", userId)
          .order("expected_close_date", { ascending: true, nullsFirst: false });

        if (type) query = query.eq("opportunity_type", type);
        if (status) query = query.eq("status", status);

        const { data, error } = await query;
        if (error) throw error;

        const rows: OpportunityRow[] = (data ?? []).map((r) => ({
          id: r.id,
          opportunity_type: r.opportunity_type,
          status: r.status,
          estimated_price: r.estimated_price,
          estimated_commission_pct: r.estimated_commission_pct,
          close_odds_pct: r.close_odds_pct,
          expected_close_date: r.expected_close_date,
          lost_reason: r.lost_reason,
          opportunity_date: r.opportunity_date,
          updated_at: r.updated_at,
        }));

        const now = new Date();
        const kpis90d = computeOpportunityKpis(rows, 90, now);
        const kpisYtd = computeOpportunityKpis(rows, days_since_jan1(now), now);

        const opportunities = (data ?? []).map((r) => ({
          id: r.id,
          type: r.opportunity_type,
          title: r.title,
          client_id: r.client_id,
          status: r.status,
          opportunity_date: r.opportunity_date,
          expected_close_date: r.expected_close_date,
          estimated_price: r.estimated_price,
          estimated_commission_pct: r.estimated_commission_pct,
          estimated_gci: Math.round((r.estimated_price ?? 0) * (r.estimated_commission_pct ?? 0.025)),
          close_odds_pct: r.close_odds_pct,
          lost_reason: r.lost_reason,
          notes: r.notes,
        }));

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              count: opportunities.length,
              filters: { type: type ?? "all", status: status ?? "all" },
              opportunities,
              kpis_90d: {
                open_count: kpis90d.openCount,
                weighted_gci: Math.round(kpis90d.weightedGci),
                conversion_rate_pct: kpis90d.conversionRatePct == null ? null : Math.round(kpis90d.conversionRatePct * 100),
                loss_rate_pct: kpis90d.lossRatePct == null ? null : Math.round(kpis90d.lossRatePct * 100),
                top_loss_reasons: kpis90d.topLossReasons,
              },
              kpis_ytd: {
                open_count: kpisYtd.openCount,
                weighted_gci: Math.round(kpisYtd.weightedGci),
                conversion_rate_pct: kpisYtd.conversionRatePct == null ? null : Math.round(kpisYtd.conversionRatePct * 100),
                loss_rate_pct: kpisYtd.lossRatePct == null ? null : Math.round(kpisYtd.lossRatePct * 100),
                top_loss_reasons: kpisYtd.topLossReasons,
              },
            }, null, 2),
          }],
        };
      },
    },

    // ── create_opportunity ──────────────────────────────────────────────
    {
      name: "create_opportunity",
      description:
        "Logs a new pre-transactional opportunity. type='listing_appointment' inserts a listing appointment (name=property address, appointment_date used). type='buyer_prospect' inserts a buyer-side pipeline deal at stage 'lead' (client_id REQUIRED). type='referral' inserts a referral lead (name=referred person; referrer_name and referral_type optional). Odds and commission accept a percentage (e.g. 60 for 60%) or a fraction (0.6). Defaults when omitted: listing 40% / buyer 25% / referral 20% odds; 2.5% commission.",
      inputSchema: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["listing_appointment", "buyer_prospect", "referral"],
            description: "Which kind of opportunity to log.",
          },
          name: {
            type: "string",
            description: "Property address (listing_appointment), client display name (buyer_prospect), or referred person's name (referral).",
          },
          estimated_price: { type: "number", description: "Estimated list price / budget / referral value in dollars." },
          estimated_commission_pct: { type: "number", description: "Commission as a percentage (default 2.5) or fraction (0.025)." },
          close_odds_pct: { type: "number", description: "Close odds as a percentage (e.g. 60) or fraction (0.6). Omit to use the type default." },
          expected_close_date: { type: "string", description: "Expected close date (YYYY-MM-DD)." },
          appointment_date: { type: "string", description: "Listing-appointment date/time (YYYY-MM-DD). Required for listing_appointment." },
          client_id: { type: "string", description: "Linked client UUID. REQUIRED for buyer_prospect." },
          referrer_name: { type: "string", description: "Referral only: who made the referral." },
          referral_type: {
            type: "string",
            enum: ["seller", "buyer", "unknown"],
            description: "Referral only: which side the referral is for (default 'unknown').",
          },
          notes: { type: "string", description: "Free-text notes." },
        },
        required: ["type", "name"],
        additionalProperties: false,
      },
      annotations: {
        title: "Log Opportunity",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
      handler: async (args) => {
        const a = args as {
          type: OpportunitySource;
          name: string;
          estimated_price?: number;
          estimated_commission_pct?: number;
          close_odds_pct?: number;
          expected_close_date?: string;
          appointment_date?: string;
          client_id?: string;
          referrer_name?: string;
          referral_type?: string;
          notes?: string;
        };

        const odds = normalizePct(a.close_odds_pct);
        const commission = normalizePct(a.estimated_commission_pct);

        if (a.type === "listing_appointment") {
          const { data, error } = await supabase
            .from("listing_appointments")
            .insert({
              user_id: userId,
              property_address: a.name,
              appointment_date: a.appointment_date ?? new Date().toISOString().slice(0, 10),
              estimated_list_price: a.estimated_price ?? null,
              estimated_commission_pct: commission,
              close_odds_pct: odds,
              expected_close_date: a.expected_close_date ?? null,
              client_id: a.client_id ?? null,
              notes: a.notes ?? null,
              status: "scheduled",
            })
            .select("id")
            .single();
          if (error) throw error;
          return ok({ created: "listing_appointment", id: data.id, default_odds_pct: Math.round(OPPORTUNITY_DEFAULT_ODDS.listing_appointment * 100) });
        }

        if (a.type === "buyer_prospect") {
          if (!a.client_id) {
            throw new Error("buyer_prospect requires client_id — a buyer prospect must be linked to an existing client record. Use get_clients to resolve the client first.");
          }
          const { data, error } = await supabase
            .from("pipeline_deals")
            .insert({
              user_id: userId,
              side: "buyer",
              stage: "lead",
              client_name: a.name,
              address: "",
              estimated_price: a.estimated_price ?? 0,
              estimated_commission_pct: commission ?? 0.025,
              probability_override: odds,
              expected_close_date: a.expected_close_date ?? null,
              client_id: a.client_id,
              notes: a.notes ?? "",
            })
            .select("id")
            .single();
          if (error) throw error;
          return ok({ created: "buyer_prospect", id: data.id, pipeline_deal_id: data.id, default_odds_pct: Math.round(OPPORTUNITY_DEFAULT_ODDS.buyer_prospect * 100) });
        }

        // referral
        const { data, error } = await supabase
          .from("referral_opportunities")
          .insert({
            user_id: userId,
            referred_person_name: a.name,
            referrer_name: a.referrer_name ?? null,
            referral_type: a.referral_type ?? "unknown",
            estimated_price: a.estimated_price ?? null,
            estimated_commission_pct: commission ?? 0.025,
            close_odds_pct: odds ?? OPPORTUNITY_DEFAULT_ODDS.referral,
            expected_close_date: a.expected_close_date ?? null,
            client_id: a.client_id ?? null,
            notes: a.notes ?? null,
          })
          .select("id")
          .single();
        if (error) throw error;
        return ok({ created: "referral", id: data.id, default_odds_pct: Math.round(OPPORTUNITY_DEFAULT_ODDS.referral * 100) });
      },
    },

    // ── promote_opportunity ─────────────────────────────────────────────
    {
      name: "promote_opportunity",
      description:
        "Promotes a listing appointment or a referral into a real pipeline deal via an atomic RPC. Listing appointment → seller-side pipeline deal at stage 'showing'. Referral → either a new listing appointment OR a buyer-side pipeline deal (target REQUIRED for referral). NOTE: buyer prospects are NOT promoted here — they already are pipeline deals; use advance_buyer_prospect_stage to move them forward.",
      inputSchema: {
        type: "object",
        properties: {
          opportunity_id: { type: "string", description: "The opportunity row's UUID (id from list_opportunities)." },
          opportunity_source: {
            type: "string",
            enum: ["listing_appointment", "referral"],
            description: "Which source table the opportunity lives in.",
          },
          target: {
            type: "string",
            enum: ["listing_appointment", "buyer_prospect"],
            description: "Referral only: convert into a listing appointment or a buyer prospect.",
          },
          buyer_stage: {
            type: "string",
            enum: ["lead", "showing"],
            description: "Referral → buyer_prospect only: starting stage for the new buyer deal (default 'lead').",
          },
        },
        required: ["opportunity_id", "opportunity_source"],
        additionalProperties: false,
      },
      annotations: {
        title: "Promote Opportunity",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
      handler: async (args) => {
        const a = args as {
          opportunity_id: string;
          opportunity_source: "listing_appointment" | "referral";
          target?: "listing_appointment" | "buyer_prospect";
          buyer_stage?: "lead" | "showing";
        };

        if (a.opportunity_source === "listing_appointment") {
          const { data, error } = await supabase.rpc("fn_promote_listing_appointment", {
            p_listing_id: a.opportunity_id,
          });
          if (error) throw error;
          return ok({ promoted: "listing_appointment", new_pipeline_deal_id: data });
        }

        // referral
        if (!a.target) {
          throw new Error("Promoting a referral requires target: 'listing_appointment' or 'buyer_prospect'.");
        }
        const { data, error } = await supabase.rpc("fn_promote_referral", {
          p_referral_id: a.opportunity_id,
          p_target: a.target,
          p_buyer_stage: a.buyer_stage ?? "lead",
        });
        if (error) throw error;
        return ok({ promoted: "referral", target: a.target, result: data });
      },
    },

    // ── advance_buyer_prospect_stage ────────────────────────────────────
    {
      name: "advance_buyer_prospect_stage",
      description:
        "Advances a buyer-prospect pipeline deal to a contracted stage (offer / conditional / firm) via an atomic RPC. Once advanced past 'showing' the deal reclassifies as a converted opportunity and leaves the Opportunities section. Buyer prospects advance; they do NOT promote.",
      inputSchema: {
        type: "object",
        properties: {
          pipeline_deal_id: { type: "string", description: "The buyer-side pipeline deal UUID." },
          stage: {
            type: "string",
            enum: ["offer", "conditional", "firm"],
            description: "The contracted stage to advance to.",
          },
        },
        required: ["pipeline_deal_id", "stage"],
        additionalProperties: false,
      },
      annotations: {
        title: "Advance Buyer Prospect",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
      handler: async (args) => {
        const a = args as { pipeline_deal_id: string; stage: "offer" | "conditional" | "firm" };
        const { data, error } = await supabase.rpc("fn_advance_buyer_stage", {
          p_deal_id: a.pipeline_deal_id,
          p_stage: a.stage,
        });
        if (error) throw error;
        return ok({ advanced: a.pipeline_deal_id, stage: a.stage, result: data });
      },
    },

    // ── mark_opportunity_lost ───────────────────────────────────────────
    {
      name: "mark_opportunity_lost",
      description:
        "Marks an opportunity lost with a structured reason via an atomic RPC. lost_reason must be one of: chose_other_agent, decided_not_to_transact, price_disagreement, timing_deferred, out_of_area, financing_fell_through, lost_contact, other. When reason is 'other', notes are required. Lost is terminal.",
      inputSchema: {
        type: "object",
        properties: {
          opportunity_id: { type: "string", description: "The opportunity row's UUID." },
          opportunity_source: {
            type: "string",
            enum: ["listing_appointment", "buyer_prospect", "referral"],
            description: "Which source table the opportunity lives in.",
          },
          lost_reason: {
            type: "string",
            enum: [
              "chose_other_agent",
              "decided_not_to_transact",
              "price_disagreement",
              "timing_deferred",
              "out_of_area",
              "financing_fell_through",
              "lost_contact",
              "other",
            ],
            description: "Structured loss reason.",
          },
          notes: { type: "string", description: "Free-text context. REQUIRED when lost_reason='other'." },
        },
        required: ["opportunity_id", "opportunity_source", "lost_reason"],
        additionalProperties: false,
      },
      annotations: {
        title: "Mark Opportunity Lost",
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
      handler: async (args) => {
        const a = args as {
          opportunity_id: string;
          opportunity_source: OpportunitySource;
          lost_reason: string;
          notes?: string;
        };

        if (!(OPPORTUNITY_LOSS_REASONS as readonly string[]).includes(a.lost_reason)) {
          throw new Error(
            `Invalid lost_reason '${a.lost_reason}'. Must be one of: ${OPPORTUNITY_LOSS_REASONS.join(", ")}.`,
          );
        }
        if (a.lost_reason === "other" && (!a.notes || !a.notes.trim())) {
          throw new Error("notes are required when lost_reason is 'other'. Provide a short explanation of why the opportunity was lost.");
        }

        const { data, error } = await supabase.rpc("fn_mark_opportunity_lost", {
          p_id: a.opportunity_id,
          p_source: a.opportunity_source,
          p_lost_reason: a.lost_reason,
          p_notes: a.notes ?? null,
        });
        if (error) throw error;
        return ok({ marked_lost: a.opportunity_id, reason: a.lost_reason, result: data });
      },
    },
  ];
}

function ok(payload: Record<string, unknown>) {
  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify(payload, null, 2),
    }],
  };
}
