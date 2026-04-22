import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { getAnalyticsTools } from "./analytics.ts";
import { getTransactionTools } from "./transactions.ts";
import { getPipelineTools } from "./pipeline.ts";
import { getCrmTools } from "./crm.ts";
import { getExpenseTools } from "./expenses.ts";
import { getOutreachTools } from "./outreach.ts";
import { getSettingsTools } from "./settings.ts";

// MCP tool annotations (per MCP spec).
// These are behavioral hints for clients — they do NOT enforce anything
// server-side. Claude and other clients use them to pick better UX (e.g.
// read-only tools can be called without a confirmation prompt, titles are
// shown in tool pickers, closed-world tools don't need network warnings).
export interface McpToolAnnotations {
  /** Human-readable title for UI display (e.g. "Year-End Forecast"). */
  title?: string;
  /** True if the tool does not modify the user's environment. */
  readOnlyHint?: boolean;
  /** True if the tool may perform destructive updates (default assumption when readOnly is false). */
  destructiveHint?: boolean;
  /** True if repeated calls with the same args have no additional effect. */
  idempotentHint?: boolean;
  /** True if the tool interacts with external systems / the open internet. */
  openWorldHint?: boolean;
}

// Each tool: name, description, JSON Schema for input, async handler, and optional annotations.
export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: McpToolAnnotations;
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
      annotations: {
        title: "Agent Runway Server Info",
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
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
                  "get_hst_status",
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
                phase: "Phase 1 complete — 17 tools live",
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
