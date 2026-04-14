/**
 * Agent Runway MCP Server — Supabase Edge Function
 *
 * Exposes Agent Runway business data to MCP-compatible AI clients
 * (Claude, Cursor, etc.) via the Model Context Protocol.
 *
 * Transport:  Streamable HTTP (current MCP standard, replaces SSE)
 * Auth:       Supabase OAuth 2.1 Server — Bearer token per request
 * Gate:       Pro subscription or beta org membership required
 * URL:        https://wlxkvnbncfzkmxzexgxt.supabase.co/functions/v1/mcp-server
 *
 * Deploy:
 *   pnpm build:mcp-shared
 *   supabase functions deploy mcp-server --project-ref wlxkvnbncfzkmxzexgxt
 */

import { McpServer } from "npm:@modelcontextprotocol/sdk@1/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "npm:@modelcontextprotocol/sdk@1/server/web.js";
import { createClient } from "npm:@supabase/supabase-js@2";
import { checkIsPro } from "./pro-gate.ts";
import { registerAllTools } from "./tools/index.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, mcp-session-id",
  "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
};

// ── Request handler ────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  // ── Auth: extract Bearer token ───────────────────────────────────────────
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return jsonError(401, "Missing or invalid Authorization header.");
  }
  const token = authHeader.slice(7);

  // ── Auth: create RLS-enforced Supabase client ────────────────────────────
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ── Auth: verify user identity ───────────────────────────────────────────
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return jsonError(401, "Unauthorized. Please reconnect your Agent Runway account.");
  }

  // ── Gate: Pro subscription required ──────────────────────────────────────
  const isPro = await checkIsPro(supabase, user.id);
  if (!isPro) {
    return jsonError(
      403,
      "MCP access requires an Agent Runway Pro subscription. Visit https://agentrunway.ca/settings to upgrade.",
    );
  }

  // ── MCP: create server + transport per request (stateless mode) ──────────
  const server = new McpServer({
    name: "Agent Runway",
    version: "1.0.0",
  });

  // Register the server_info tool (always available)
  server.tool(
    "get_server_info",
    "Returns information about the Agent Runway MCP server, its version, and the list of available tools.",
    {},
    async () => ({
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
                // Phase 1 tools added in Steps 4–9:
                // "get_dashboard_kpis", "get_runway_score", "get_forecast", "get_tax_estimate",
                // "get_transactions", "get_transaction_summary",
                // "get_pipeline", "get_pipeline_forecast",
                // "get_clients", "get_client_detail",
                // "get_expenses", "get_mileage_summary",
                // "get_flight_control_priorities", "get_user_settings",
              ],
              phase: "Scaffold — Phase 1 tools coming in Steps 4–9",
            },
            null,
            2,
          ),
        },
      ],
    }),
  );

  // Register all domain tools (populated in Steps 4–9)
  registerAllTools(server, supabase, user.id);

  // ── MCP: handle the request ───────────────────────────────────────────────
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless — no session persistence
  });

  await server.connect(transport);

  const mcpResponse = await transport.handleRequest(req);

  // Add CORS headers to the MCP response
  const responseHeaders = new Headers(mcpResponse.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    responseHeaders.set(key, value);
  }

  return new Response(mcpResponse.body, {
    status: mcpResponse.status,
    headers: responseHeaders,
  });
});

// ── Helpers ────────────────────────────────────────────────────────────────

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}
