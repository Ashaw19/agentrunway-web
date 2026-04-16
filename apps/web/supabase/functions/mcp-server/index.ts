/**
 * Agent Runway MCP Server — Supabase Edge Function
 *
 * Exposes Agent Runway business data to MCP-compatible AI clients
 * (Claude, Cursor, etc.) via the Model Context Protocol.
 *
 * Transport:  Streamable HTTP — manual JSON-RPC 2.0 handler
 *             (WebStandardStreamableHTTPServerTransport has a Deno
 *              subpath resolution issue; manual impl is simpler here)
 * Auth:       Bearer token (Supabase OAuth 2.1 access token)
 * Gate:       Pro subscription or beta org membership required
 * Protocol:   MCP 2024-11-05
 * URL:        https://wlxkvnbncfzkmxzexgxt.supabase.co/functions/v1/mcp-server
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import { checkIsPro } from "./pro-gate.ts";
import { buildToolRegistry, type McpTool } from "./tools/index.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const PROTOCOL_VERSION = "2024-11-05";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, mcp-session-id",
  "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
};

// ── Types ──────────────────────────────────────────────────────────────────

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string | number | null;
  method: string;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

// ── Request handler ────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  // Only accept POST for MCP
  if (req.method !== "POST") {
    return jsonError(405, "Method not allowed.");
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

  // ── MCP: parse JSON-RPC request ───────────────────────────────────────────
  let rpcRequest: JsonRpcRequest;
  try {
    rpcRequest = await req.json() as JsonRpcRequest;
  } catch {
    return mcpError(null, -32700, "Parse error");
  }

  if (rpcRequest.jsonrpc !== "2.0") {
    return mcpError(rpcRequest.id ?? null, -32600, "Invalid Request");
  }

  // ── MCP: build tool registry & route ─────────────────────────────────────
  const tools = buildToolRegistry(supabase, user.id);
  const response = await routeRequest(rpcRequest, tools, supabase, user.id);

  return new Response(JSON.stringify(response), {
    status: 200,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
});

// ── MCP protocol router ────────────────────────────────────────────────────

async function routeRequest(
  req: JsonRpcRequest,
  tools: McpTool[],
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<JsonRpcResponse> {
  const { method, id, params } = req;

  try {
    switch (method) {
      // MCP handshake
      case "initialize":
        return {
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: PROTOCOL_VERSION,
            capabilities: { tools: {} },
            serverInfo: { name: "Agent Runway", version: "1.0.0" },
          },
        };

      case "notifications/initialized":
        // Notification — no response body needed, but MCP spec allows empty result
        return { jsonrpc: "2.0", id, result: {} };

      case "ping":
        return { jsonrpc: "2.0", id, result: {} };

      // Tool discovery
      case "tools/list":
        return {
          jsonrpc: "2.0",
          id,
          result: {
            tools: tools.map(({ name, description, inputSchema, annotations }) => ({
              name,
              description,
              inputSchema,
              ...(annotations ? { annotations } : {}),
            })),
          },
        };

      // Tool invocation
      case "tools/call": {
        const p = params as { name?: string; arguments?: unknown };
        const toolName = p?.name;
        const toolArgs = p?.arguments ?? {};

        const tool = tools.find((t) => t.name === toolName);
        if (!tool) {
          return {
            jsonrpc: "2.0",
            id,
            error: { code: -32602, message: `Unknown tool: ${toolName}` },
          };
        }

        const t0 = Date.now();
        let isError = false;
        let result;
        try {
          result = await tool.handler(toolArgs);
        } catch (handlerErr) {
          isError = true;
          throw handlerErr;
        } finally {
          // Fire-and-forget usage logging — never block the response
          supabase
            .from("mcp_events")
            .insert({ user_id: userId, tool_name: toolName!, latency_ms: Date.now() - t0, is_error: isError })
            .then(({ error: logErr }) => { if (logErr) console.warn("[mcp-server] event log failed:", logErr.message); });
        }
        return { jsonrpc: "2.0", id, result };
      }

      default:
        return {
          jsonrpc: "2.0",
          id,
          error: { code: -32601, message: "Method not found" },
        };
    }
  } catch (err: unknown) {
    console.error("[mcp-server] Tool error:", err);
    return {
      jsonrpc: "2.0",
      id,
      error: { code: -32603, message: "Internal error" },
    };
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function mcpError(
  id: string | number | null,
  code: number,
  message: string,
): Response {
  const body: JsonRpcResponse = { jsonrpc: "2.0", id, error: { code, message } };
  return new Response(JSON.stringify(body), {
    status: 200, // MCP errors are returned as 200 with error in JSON-RPC body
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}
