import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { McpTool } from "./index.ts";
import { PIPELINE_STAGE_DEFAULTS } from "../../_shared/core/types/database.ts";

const STAGE_DEFAULTS: Record<string, number> = PIPELINE_STAGE_DEFAULTS;

export function getPipelineTools(supabase: SupabaseClient, userId: string): McpTool[] {
  return [
    // ── get_pipeline ────────────────────────────────────────────────────
    {
      name: "get_pipeline",
      description:
        "Returns all active pipeline deals with their stage, estimated GCI, probability, expected close date, and client name.",
      inputSchema: {
        type: "object",
        properties: {
          stage: {
            type: "string",
            enum: ["lead", "showing", "offer", "conditional", "firm"],
            description: "Filter to a specific pipeline stage. Omit for all active deals.",
          },
        },
        additionalProperties: false,
      },
      annotations: {
        title: "Pipeline Deals",
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
      handler: async (args) => {
        const { stage } = args as { stage?: string };

        let query = supabase
          .from("pipeline_deals")
          .select("id, address, estimated_price, estimated_commission_pct, stage, side, probability_override, expected_close_date, client_name, notes, created_at")
          .eq("user_id", userId)
          .neq("stage", "closed")
          .order("stage", { ascending: false }); // firm first

        if (stage) query = query.eq("stage", stage);

        const { data, error } = await query;
        if (error) throw error;

        const deals = (data ?? []).map((d) => {
          const prob = d.probability_override ?? STAGE_DEFAULTS[d.stage] ?? 0.5;
          const estGCI = (d.estimated_price ?? 0) * (d.estimated_commission_pct ?? 0.025);
          return {
            id: d.id,
            address: d.address,
            stage: d.stage,
            side: d.side,
            estimated_price: d.estimated_price,
            estimated_gci: Math.round(estGCI),
            weighted_gci: Math.round(estGCI * prob),
            probability_pct: Math.round(prob * 100),
            expected_close_date: d.expected_close_date,
            client_name: d.client_name,
          };
        });

        const totalWeighted = deals.reduce((s, d) => s + d.weighted_gci, 0);
        const totalEstimated = deals.reduce((s, d) => s + d.estimated_gci, 0);

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              deal_count: deals.length,
              total_estimated_gci: totalEstimated,
              total_weighted_gci: totalWeighted,
              filter_stage: stage ?? "all",
              deals,
            }, null, 2),
          }],
        };
      },
    },

    // ── get_pipeline_forecast ───────────────────────────────────────────
    {
      name: "get_pipeline_forecast",
      description:
        "Returns a stage-by-stage breakdown of the pipeline with deal counts, estimated GCI, and weighted GCI per stage. Shows coverage ratio vs annual goal.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: {
        title: "Pipeline Forecast",
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
      handler: async () => {
        const [pipelineRes, settingsRes] = await Promise.all([
          supabase
            .from("pipeline_deals")
            .select("estimated_price, estimated_commission_pct, stage, probability_override")
            .eq("user_id", userId)
            .neq("stage", "closed"),
          supabase
            .from("user_settings")
            .select("goal_gci")
            .eq("user_id", userId)
            .maybeSingle(),
        ]);

        if (pipelineRes.error) throw pipelineRes.error;
        const deals = pipelineRes.data ?? [];
        const goalGCI = settingsRes.data?.goal_gci ?? 0;

        // Stage summary
        const stageOrder = ["lead", "showing", "offer", "conditional", "firm"];
        const stageSummary = stageOrder.map((stage) => {
          const stageDeals = deals.filter((d) => d.stage === stage);
          const estimated = stageDeals.reduce((s, d) => s + (d.estimated_price ?? 0) * (d.estimated_commission_pct ?? 0.025), 0);
          const weighted = stageDeals.reduce((s, d) => {
            const prob = d.probability_override ?? STAGE_DEFAULTS[stage] ?? 0.5;
            return s + (d.estimated_price ?? 0) * (d.estimated_commission_pct ?? 0.025) * prob;
          }, 0);
          return {
            stage,
            default_probability_pct: Math.round((STAGE_DEFAULTS[stage] ?? 0.5) * 100),
            deal_count: stageDeals.length,
            estimated_gci: Math.round(estimated),
            weighted_gci: Math.round(weighted),
          };
        });

        const totalWeighted = stageSummary.reduce((s, r) => s + r.weighted_gci, 0);
        const totalEstimated = stageSummary.reduce((s, r) => s + r.estimated_gci, 0);
        const coverageRatio = goalGCI > 0 ? Math.round((totalWeighted / goalGCI) * 100) / 100 : null;

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              total_deals: deals.length,
              total_estimated_gci: totalEstimated,
              total_weighted_gci: totalWeighted,
              goal_gci: goalGCI,
              coverage_ratio: coverageRatio,
              // State-only coverage descriptor — describes the ratio, not what
              // to do about it. Personas layer interpretation per their own
              // voice rules (see CREW_CONSTITUTION money-proximate guidance).
              coverage_interpretation: coverageRatio == null ? null
                : coverageRatio >= 1.5 ? "Coverage at or above 1.5× goal"
                : coverageRatio >= 1.0 ? "Coverage at or above 1.0× goal"
                : coverageRatio >= 0.6 ? "Coverage between 0.6× and 1.0× goal"
                : "Coverage below 0.6× goal",
              by_stage: stageSummary,
            }, null, 2),
          }],
        };
      },
    },
  ];
}
