import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { getAnalyticsTools } from "./analytics.ts";
import { getTransactionTools } from "./transactions.ts";
import { getPipelineTools } from "./pipeline.ts";
import { getOpportunityTools } from "./opportunities.ts";
import { getCrmTools } from "./crm.ts";
import { getExpenseTools } from "./expenses.ts";
import { getLogbookTools } from "./logbook.ts";
import { getOutreachTools } from "./outreach.ts";
import { getSettingsTools } from "./settings.ts";
import { getCaptureTools } from "./capture.ts";
import { getConsentTools } from "./consent.ts";
import { getAiActivityTools } from "./ai-activity.ts";
import { getStatementImportTools } from "./statement-import.ts";

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

/**
 * `accessToken` is the caller's own Supabase session token (the Bearer token
 * this request came with). Only capture_note uses it, to call the web app's
 * /api/voice-extract as that user.
 */
export function buildToolRegistry(
  supabase: SupabaseClient,
  userId: string,
  accessToken: string,
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
                  // Pre-Transactional Opportunities
                  "list_opportunities", "create_opportunity", "promote_opportunity",
                  "advance_buyer_prospect_stage", "mark_opportunity_lost",
                  // CRM (Step 7)
                  "get_clients", "get_client_detail",
                  // Expenses (Step 8)
                  "get_expenses", "get_mileage_summary",
                  // Vehicle logbook (CRA's simplified logbook, 2026-10-18)
                  "get_logbook_status", "start_logbook_period", "log_mileage",
                  "record_odometer_reading",
                  // Outreach + Settings (Step 9)
                  "get_flight_control_priorities", "get_user_settings",
                  // Note capture (a pasted note → proposed writes → save)
                  "capture_note", "save_captured_note",
                  // CASL consent ledger (00183)
                  "get_client_consent", "list_consent_lapsing", "record_consent", "withdraw_consent",
                  // AI run ledger (00182)
                  "get_ai_activity",
                  // Statement imports (Expenses → Imports)
                  "list_import_review_lines", "draft_line_categories", "explain_import_line",
                  "match_receipt_to_line", "confirm_import_lines",
                ],
                phase: "Phase 1 + Opportunities + Note capture + CASL consent + Vehicle logbook + AI activity + Statement imports — 37 tools live",
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
    ...getOpportunityTools(supabase, userId),  // Pre-Transactional Opportunities
    ...getCrmTools(supabase, userId),          // Step 7
    ...getExpenseTools(supabase, userId),      // Step 8
    ...getLogbookTools(supabase, userId),      // Vehicle logbook
    ...getOutreachTools(supabase, userId),     // Step 9
    ...getSettingsTools(supabase, userId),     // Step 9
    ...getCaptureTools(supabase, userId, accessToken), // Note capture (2026-10-18)
    ...getConsentTools(supabase, userId),      // CASL consent ledger (00183)
    ...getAiActivityTools(supabase, userId),   // AI run ledger (00182)
    ...getStatementImportTools(supabase, userId), // Statement imports
  ];
}
