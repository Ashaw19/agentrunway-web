/**
 * Public catalog of the MCP server's tools, rendered on /mcp.
 *
 * The real registry lives in the Deno edge function
 * (`supabase/functions/mcp-server/tools/`), which the Next app can't import.
 * `lib/mcp-server/__tests__/public-claims.test.ts` fails if this list, or a
 * tool's read/write label, drifts from the registered tools and their
 * `readOnlyHint` / `destructiveHint` annotations.
 */

export type McpToolAccess = "read" | "write";

export interface McpCatalogTool {
  name: string;
  desc: string;
  access: McpToolAccess;
  /** MCP destructiveHint: true. Only set on write tools. */
  destructive?: boolean;
}

export interface McpCatalogGroup {
  category: string;
  tools: McpCatalogTool[];
}

export const MCP_TOOL_CATALOG: McpCatalogGroup[] = [
  {
    category: "Analytics",
    tools: [
      { name: "get_dashboard_kpis", desc: "YTD GCI, transactions, expenses, pipeline, goal progress", access: "read" },
      { name: "get_runway_score", desc: "0-100 business health grade (A+ to F)", access: "read" },
      { name: "get_forecast", desc: "Projected year-end GCI from pace and pipeline", access: "read" },
      { name: "get_tax_estimate", desc: "Canadian income tax estimate with CPP, federal/provincial tax, quarterly instalments", access: "read" },
      { name: "get_hst_status", desc: "GST/HST estimate: collected, ITCs, net owing, next filing deadline", access: "read" },
    ],
  },
  {
    category: "Transactions",
    tools: [
      { name: "get_transactions", desc: "Closed deals with address, price, GCI, side, date", access: "read" },
      { name: "get_transaction_summary", desc: "GCI, deal count and volume by year", access: "read" },
    ],
  },
  {
    category: "Pipeline",
    tools: [
      { name: "get_pipeline", desc: "Active deals with stage, probability, weighted GCI", access: "read" },
      { name: "get_pipeline_forecast", desc: "Stage-by-stage breakdown with goal coverage ratio", access: "read" },
    ],
  },
  {
    category: "Opportunities",
    tools: [
      { name: "list_opportunities", desc: "Listing appointments, buyer prospects and referrals, with conversion KPIs", access: "read" },
      { name: "create_opportunity", desc: "Logs a new listing appointment, buyer prospect or referral", access: "write" },
      { name: "promote_opportunity", desc: "Turns a listing appointment or referral into a pipeline deal", access: "write" },
      { name: "advance_buyer_prospect_stage", desc: "Moves a buyer prospect to offer, conditional or firm", access: "write" },
      { name: "mark_opportunity_lost", desc: "Marks an opportunity lost, with a reason. Lost is a final status.", access: "write", destructive: true },
    ],
  },
  {
    category: "CRM",
    tools: [
      { name: "get_clients", desc: "Client list with flight status, contact info, property interest", access: "read" },
      { name: "get_client_detail", desc: "One client's contact info, recent activities and pipeline deals", access: "read" },
    ],
  },
  {
    category: "Expenses & Mileage",
    tools: [
      { name: "get_expenses", desc: "YTD expenses by category with recurring totals", access: "read" },
      { name: "get_mileage_summary", desc: "Business mileage log with CRA deduction", access: "read" },
    ],
  },
  {
    category: "Outreach & Settings",
    tools: [
      { name: "get_flight_control_priorities", desc: "Outreach queue: clients due for follow-up, with drafted messages waiting for review", access: "read" },
      { name: "get_user_settings", desc: "Profile, goals, business settings, subscription", access: "read" },
      { name: "get_server_info", desc: "Server version and the list of available tools", access: "read" },
    ],
  },
];

const allTools = MCP_TOOL_CATALOG.flatMap((g) => g.tools);

export const MCP_TOOL_COUNTS = {
  total: allTools.length,
  read: allTools.filter((t) => t.access === "read").length,
  write: allTools.filter((t) => t.access === "write").length,
};
