import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { getAnalyticsTools } from "./analytics.ts";
import { getTransactionTools } from "./transactions.ts";
import { getPipelineTools } from "./pipeline.ts";
import { getCrmTools } from "./crm.ts";
import { getExpenseTools } from "./expenses.ts";
import { getOutreachTools } from "./outreach.ts";
import { getSettingsTools } from "./settings.ts";

// Each tool: name, description, JSON Schema for input, and async handler
export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: unknown) => Promise<McpToolResult>;
}

export interface McpToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

export function buildToolRegistry(
  supabase: SupabaseClient,
  userId: string,
): McpTool[] {
  return [
    // Always available
    {
      name: "get_server_info",
      description:
        "Returns information about the Agent Runway MCP server, its version, and the list of available tools.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      handler: async () => ({
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                name: "Agent Runway",
                version: "1.0.0",
                description:
                  "Real estate business analytics for Canadian agents — transactions, pipeline, CRM, expenses, forecasts, and AI insights.",
                url: "https://agentrunway.ca",
                available_tools: [
                  "get_server_info",
                  // Analytics (Step 4)
                  "get_dashboard_kpis", "get_runway_score", "get_forecast", "get_tax_estimate",
                  // Transactions (Step 5)
                  "get_transactions", "get_transaction_summary",
                  // Pipeline (Step 6)
                  "get_pipeline", "get_pipeline_forecast",
                  // CRM (Step 7)
                  "get_clients", "get_client_detail",
                  // Expenses (Step 8)
                  "get_expenses", "get_mileage_summary",
                  // Outreach + Settings (Step 9)
                  "get_flight_control_priorities", "get_user_settings",
                ],
                phase: "Phase 1 complete — all 16 tools live",
              },
              null,
              2,
            ),
          },
        ],
      }),
    },
    // Domain tools — populated per step
    ...getAnalyticsTools(supabase, userId),    // Step 4
    ...getTransactionTools(supabase, userId),  // Step 5
    ...getPipelineTools(supabase, userId),     // Step 6
    ...getCrmTools(supabase, userId),          // Step 7
    ...getExpenseTools(supabase, userId),      // Step 8
    ...getOutreachTools(supabase, userId),     // Step 9
    ...getSettingsTools(supabase, userId),     // Step 9
  ];
}
