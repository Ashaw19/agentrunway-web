import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { McpTool } from "./index.ts";

export function getSettingsTools(supabase: SupabaseClient, userId: string): McpTool[] {
  return [
    // ── get_user_settings ────────────────────────────────────────────────
    {
      name: "get_user_settings",
      description:
        "Returns the agent's profile and business settings: goals, province, brokerage info, subscription status, and CRM preferences. Does not return sensitive financial credentials.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: {
        title: "User Settings",
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
      handler: async () => {
        const { data, error } = await supabase
          .from("user_settings")
          .select([
            "display_name", "brokerage_name", "province",
            "goal_gci", "goal_transactions", "goal_volume",
            "subscription_tier", "subscription_status",
            "board_code", "board_subregion",
            "is_incorporated", "corp_type",
            "gst_hst_registered",
            "experience_years", "estimated_weekly_hours",
            "cash_reserve",
            "use_national_seasonality",
          ].join(", "))
          .eq("user_id", userId)
          .maybeSingle();

        if (error) throw error;
        if (!data) {
          return {
            content: [{
              type: "text" as const,
              text: JSON.stringify({ found: false, message: "No settings found. The user may not have completed onboarding." }, null, 2),
            }],
          };
        }

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              profile: {
                display_name: data.display_name,
                brokerage_name: data.brokerage_name,
                province: data.province,
                experience_years: data.experience_years,
                estimated_weekly_hours: data.estimated_weekly_hours,
              },
              goals: {
                goal_gci: data.goal_gci,
                goal_transactions: data.goal_transactions,
                goal_volume: data.goal_volume,
              },
              business: {
                board_code: data.board_code,
                board_subregion: data.board_subregion,
                is_incorporated: data.is_incorporated,
                corp_type: data.corp_type,
                gst_hst_registered: data.gst_hst_registered,
                cash_reserve: data.cash_reserve,
              },
              subscription: {
                tier: data.subscription_tier,
                status: data.subscription_status,
              },
              seasonality: {
                use_national: data.use_national_seasonality,
              },
            }, null, 2),
          }],
        };
      },
    },
  ];
}
