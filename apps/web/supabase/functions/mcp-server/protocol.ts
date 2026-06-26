/**
 * Agent Runway MCP Server — pure JSON-RPC 2.0 protocol core.
 *
 * This module deliberately contains NO Deno globals, NO `npm:` import
 * specifiers, and NO network/auth/DB access. It is the portable, unit-testable
 * heart of the MCP handler. `index.ts` is the thin Deno HTTP shell that:
 *   1. handles CORS + method gating,
 *   2. authenticates the Bearer token + Pro gate,
 *   3. builds the real tool registry,
 *   4. delegates the parsed JSON-RPC message to `handleRpcMessage` here,
 *   5. maps the discriminated result back onto an HTTP `Response` via
 *      `toHttpResponse`.
 *
 * Keeping the protocol layer free of runtime globals is what lets vitest
 * (node) exercise the JSON-RPC behavior — initialize / tools/list /
 * tools/call / notifications / unknown-method — without spinning up a Deno
 * edge runtime or a real Supabase connection.
 *
 * Protocol: MCP 2024-11-05 (PROTOCOL_VERSION). Do NOT bump here — the version
 * string is intentionally pinned and duplicated in app/mcp/page.tsx and the
 * registry-submission docs; a coordinated bump is a separate (deferred) task.
 */

export const PROTOCOL_VERSION = "2024-11-05";

// ── JSON-RPC types ───────────────────────────────────────────────────────────

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  /**
   * Per JSON-RPC 2.0, a message with NO `id` member is a *notification* and
   * MUST NOT receive a response. We model that as `id` being `undefined`
   * (absent) rather than `null` (an explicit, response-bearing id).
   */
  id?: string | number | null;
  method: string;
  params?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

// ── Tool shape (structural; matches McpTool from ./tools/index.ts) ────────────
// Defined locally so this module stays free of the `npm:` Supabase import that
// the real McpTool definition drags in. `index.ts` passes its McpTool[] here;
// the field set below is exactly what the router reads.

export interface ProtocolToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

export interface ProtocolTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: Record<string, unknown>;
  handler: (args: unknown) => Promise<ProtocolToolResult>;
}

/**
 * Minimal structural view of the Supabase client used only for fire-and-forget
 * usage logging. The real edge function passes a full SupabaseClient; tests
 * pass a tiny stub. Typed loosely on purpose — this layer never reads results.
 */
export interface UsageLogger {
  from(table: string): {
    insert(row: Record<string, unknown>): { then: (onfulfilled: (res: { error: unknown }) => void) => unknown };
  };
}

// ── Handler result (discriminated) ────────────────────────────────────────────
// A notification carries no body; a request carries a JSON-RPC envelope. The
// HTTP shell maps these to 202/empty and 200/JSON respectively.

export type RpcHandlerResult =
  | { kind: "notification" }
  | { kind: "response"; body: JsonRpcResponse };

/**
 * Returns true when a parsed JSON-RPC message is a *notification*: it has no
 * `id` member at all. An explicit `id: null` is NOT a notification (it is a
 * malformed-but-id-bearing request and still gets an error response).
 */
export function isNotification(message: { id?: unknown }): boolean {
  return !("id" in message) || message.id === undefined;
}

/**
 * Route a single parsed JSON-RPC message.
 *
 * Contract:
 *  - Notifications (no `id`) → `{ kind: "notification" }`. The caller returns
 *    HTTP 202 with an empty body and emits NO JSON-RPC envelope. This is true
 *    for ANY `notifications/*` method (or any other id-less message), not just
 *    `notifications/initialized`.
 *  - Requests (with `id`) → `{ kind: "response", body }` carrying the JSON-RPC
 *    result or error.
 */
export async function handleRpcMessage(
  message: JsonRpcRequest,
  tools: ProtocolTool[],
  logger: UsageLogger,
  userId: string,
): Promise<RpcHandlerResult> {
  // A notification (no id) gets NO response body, regardless of method.
  if (isNotification(message)) {
    return { kind: "notification" };
  }

  const id = message.id as string | number;
  const { method, params } = message;

  try {
    switch (method) {
      // MCP handshake
      case "initialize":
        return {
          kind: "response",
          body: {
            jsonrpc: "2.0",
            id,
            result: {
              protocolVersion: PROTOCOL_VERSION,
              capabilities: { tools: {} },
              serverInfo: { name: "Agent Runway", version: "1.0.0" },
            },
          },
        };

      case "ping":
        return { kind: "response", body: { jsonrpc: "2.0", id, result: {} } };

      // Tool discovery
      case "tools/list":
        return {
          kind: "response",
          body: {
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
            kind: "response",
            body: {
              jsonrpc: "2.0",
              id,
              error: { code: -32602, message: `Unknown tool: ${toolName}` },
            },
          };
        }

        const t0 = Date.now();
        let isError = false;
        let result: ProtocolToolResult;
        try {
          result = await tool.handler(toolArgs);
        } catch (handlerErr) {
          isError = true;
          throw handlerErr;
        } finally {
          // Fire-and-forget usage logging — never block the response.
          logger
            .from("mcp_events")
            .insert({ user_id: userId, tool_name: toolName!, latency_ms: Date.now() - t0, is_error: isError })
            .then(({ error: logErr }: { error: unknown }) => {
              if (logErr) {
                console.warn(
                  "[mcp-server] event log failed:",
                  (logErr as { message?: string })?.message ?? logErr,
                );
              }
            });
        }
        return { kind: "response", body: { jsonrpc: "2.0", id, result } };
      }

      default:
        return {
          kind: "response",
          body: {
            jsonrpc: "2.0",
            id,
            error: { code: -32601, message: "Method not found" },
          },
        };
    }
  } catch (err: unknown) {
    console.error("[mcp-server] Tool error:", err);
    return {
      kind: "response",
      body: { jsonrpc: "2.0", id, error: { code: -32603, message: "Internal error" } },
    };
  }
}

// ── HTTP mapping (transport-agnostic; uses Web-standard Response) ─────────────

export interface HttpResponseInit {
  status: number;
  /** null body for notifications (202). */
  body: string | null;
  headers: Record<string, string>;
}

/**
 * Map a protocol result onto the HTTP response *shape*. Returns a plain
 * descriptor (status / body / headers) so this stays testable without the
 * Web `Response` constructor; `index.ts` feeds it straight into `new Response`.
 *
 *  - notification → 202 Accepted, empty body, no Content-Type
 *  - response     → 200 OK, JSON-serialized envelope, Content-Type: json
 *
 * (MCP errors are carried inside the JSON-RPC envelope with HTTP 200, matching
 * the pre-existing `mcpError` behavior.)
 */
export function toHttpResponseInit(
  result: RpcHandlerResult,
  corsHeaders: Record<string, string>,
): HttpResponseInit {
  if (result.kind === "notification") {
    // 202 Accepted, no JSON-RPC envelope, no body.
    return { status: 202, body: null, headers: { ...corsHeaders } };
  }
  return {
    status: 200,
    body: JSON.stringify(result.body),
    headers: { "Content-Type": "application/json", ...corsHeaders },
  };
}
