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
import { buildToolRegistry } from "./tools/index.ts";
import {
  handleRpcMessage,
  toHttpResponseInit,
  type JsonRpcRequest,
  type JsonRpcResponse,
  type ProtocolTool,
  type UsageLogger,
} from "./protocol.ts";

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

  // NOTE: only a single JSON-RPC message is supported (no array/batch). A
  // batched array fails the `jsonrpc !== "2.0"` guard below and returns
  // Invalid Request — this is pre-existing behavior, unchanged here.
  if (rpcRequest.jsonrpc !== "2.0") {
    return mcpError(rpcRequest.id ?? null, -32600, "Invalid Request");
  }

  // ── MCP: build tool registry & route ─────────────────────────────────────
  // McpTool is structurally compatible with ProtocolTool (same fields the
  // router reads); cast keeps the protocol layer free of the npm: import.
  const tools = buildToolRegistry(supabase, user.id) as unknown as ProtocolTool[];
  const handled = await handleRpcMessage(
    rpcRequest,
    tools,
    supabase as unknown as UsageLogger,
    user.id,
  );

  // Notifications (no id) → 202 Accepted, empty body, no JSON-RPC envelope.
  // Requests (with id) → 200 OK, JSON-RPC result/error envelope.
  const { status, body, headers } = toHttpResponseInit(handled, CORS_HEADERS);
  return new Response(body, { status, headers });
});

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
