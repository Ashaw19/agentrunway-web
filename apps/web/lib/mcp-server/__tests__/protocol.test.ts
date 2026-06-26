/**
 * Unit tests for the MCP server's pure JSON-RPC protocol core.
 *
 * WHY THESE LIVE HERE (and not next to the edge function):
 * `apps/web/supabase/functions/mcp-server/index.ts` is a Deno edge function —
 * it uses `Deno.serve`, `Deno.env`, and `npm:`/`./*.ts` import specifiers that
 * vitest (node + bundler resolution) cannot load, and `supabase/functions` is
 * excluded from both the vitest `include` glob and `tsconfig.json`. The pure
 * protocol layer was extracted into `protocol.ts` (no Deno globals, no `npm:`
 * imports) specifically so it can be exercised here at the unit level.
 *
 * The Supabase data layer is NOT mocked here — it is structurally absent from
 * `protocol.ts`. Auth (getUser + checkIsPro) lives in the HTTP shell above the
 * protocol layer, so these tests never touch auth. The only external
 * dependency the protocol layer has is a fire-and-forget usage logger, which
 * we stub with a tiny in-memory recorder (this is a UNIT test of the handler,
 * not an integration test — CLAUDE.md only forbids mocking the DB in
 * INTEGRATION tests).
 */

import { describe, expect, it, vi } from "vitest";
import {
  handleRpcMessage,
  isNotification,
  toHttpResponseInit,
  PROTOCOL_VERSION,
  type JsonRpcRequest,
  type ProtocolTool,
  type UsageLogger,
} from "../../../supabase/functions/mcp-server/protocol";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
};

/**
 * Real tool-registry composition, pinned for the count assertion:
 *   get_server_info (1, always-available)
 *   + analytics (5): get_dashboard_kpis, get_runway_score, get_forecast,
 *                    get_tax_estimate, get_hst_status
 *   + transactions (2): get_transactions, get_transaction_summary
 *   + pipeline (2): get_pipeline, get_pipeline_forecast
 *   + crm (2): get_clients, get_client_detail
 *   + expenses (2): get_expenses, get_mileage_summary
 *   + outreach (1): get_flight_control_priorities
 *   + settings (1): get_user_settings
 *   = 16 tools total.
 *
 * Verified 2026-06-26 against tools/*.ts (grep of `name:`) + tools/index.ts.
 * NOTE: the investigation finding said "17", and tools/index.ts's own `phase`
 * string still reads "17 tools live" — both are STALE. The real count is 16.
 */
const EXPECTED_TOOL_NAMES = [
  "get_server_info",
  "get_dashboard_kpis",
  "get_runway_score",
  "get_forecast",
  "get_tax_estimate",
  "get_hst_status",
  "get_transactions",
  "get_transaction_summary",
  "get_pipeline",
  "get_pipeline_forecast",
  "get_clients",
  "get_client_detail",
  "get_expenses",
  "get_mileage_summary",
  "get_flight_control_priorities",
  "get_user_settings",
] as const;

const EXPECTED_TOOL_COUNT = 16;

/** Build a stub registry mirroring the real registry's shape + count. */
function buildStubRegistry(): ProtocolTool[] {
  return EXPECTED_TOOL_NAMES.map((name) => ({
    name,
    description: `stub ${name}`,
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
    handler: async () => ({
      content: [{ type: "text" as const, text: JSON.stringify({ tool: name, ok: true }) }],
    }),
  }));
}

/** In-memory stub of the fire-and-forget usage logger. */
function buildLoggerStub() {
  const inserts: Array<Record<string, unknown>> = [];
  const insert = vi.fn((row: Record<string, unknown>) => {
    inserts.push(row);
    return { then: (onfulfilled: (res: { error: unknown }) => void) => onfulfilled({ error: null }) };
  });
  const from = vi.fn((_table: string) => ({ insert }));
  const logger: UsageLogger = { from } as unknown as UsageLogger;
  return { logger, inserts, from, insert };
}

const USER_ID = "user-under-test";

// ── isNotification ─────────────────────────────────────────────────────────────

describe("isNotification", () => {
  it("treats an absent id as a notification", () => {
    // No `id` key at all — the JSON-RPC notification signal.
    expect(isNotification({})).toBe(true);
  });

  it("treats an explicit undefined id as a notification", () => {
    expect(isNotification({ id: undefined })).toBe(true);
  });

  it("does NOT treat a string/number id as a notification", () => {
    expect(isNotification({ id: "1" })).toBe(false);
    expect(isNotification({ id: 7 })).toBe(false);
  });

  it("does NOT treat an explicit null id as a notification", () => {
    // JSON-RPC: a present-but-null id is a (discouraged) request, not a
    // notification. It must still receive a response envelope.
    expect(isNotification({ id: null })).toBe(false);
  });
});

// ── initialize ─────────────────────────────────────────────────────────────────

describe("handleRpcMessage — initialize", () => {
  it("returns protocolVersion 2024-11-05 + serverInfo + capabilities", async () => {
    const { logger } = buildLoggerStub();
    const msg: JsonRpcRequest = { jsonrpc: "2.0", id: 1, method: "initialize" };

    const result = await handleRpcMessage(msg, buildStubRegistry(), logger, USER_ID);

    expect(result.kind).toBe("response");
    if (result.kind !== "response") return;
    expect(result.body.id).toBe(1);
    const r = result.body.result as {
      protocolVersion: string;
      capabilities: { tools: unknown };
      serverInfo: { name: string; version: string };
    };
    expect(r.protocolVersion).toBe("2024-11-05");
    expect(r.protocolVersion).toBe(PROTOCOL_VERSION);
    expect(r.serverInfo).toEqual({ name: "Agent Runway", version: "1.0.0" });
    expect(r.capabilities).toEqual({ tools: {} });
  });
});

// ── tools/list ─────────────────────────────────────────────────────────────────

describe("handleRpcMessage — tools/list", () => {
  it("returns exactly 16 tools (the real registry count) with the expected names", async () => {
    const { logger } = buildLoggerStub();
    const registry = buildStubRegistry();
    const msg: JsonRpcRequest = { jsonrpc: "2.0", id: "tl", method: "tools/list" };

    const result = await handleRpcMessage(msg, registry, logger, USER_ID);

    expect(result.kind).toBe("response");
    if (result.kind !== "response") return;
    const tools = (result.body.result as { tools: Array<{ name: string }> }).tools;
    expect(tools).toHaveLength(EXPECTED_TOOL_COUNT);
    expect(tools.map((t) => t.name)).toEqual([...EXPECTED_TOOL_NAMES]);
  });

  it("faithfully returns whatever count the registry contains (no hidden hardcode)", async () => {
    const { logger } = buildLoggerStub();
    const tiny: ProtocolTool[] = [
      {
        name: "only_one",
        description: "d",
        inputSchema: { type: "object" },
        handler: async () => ({ content: [{ type: "text" as const, text: "x" }] }),
      },
    ];
    const msg: JsonRpcRequest = { jsonrpc: "2.0", id: 1, method: "tools/list" };

    const result = await handleRpcMessage(msg, tiny, logger, USER_ID);

    if (result.kind !== "response") throw new Error("expected response");
    expect((result.body.result as { tools: unknown[] }).tools).toHaveLength(1);
  });

  it("omits annotations key when a tool has none", async () => {
    const { logger } = buildLoggerStub();
    const noAnno: ProtocolTool[] = [
      {
        name: "bare",
        description: "d",
        inputSchema: { type: "object" },
        handler: async () => ({ content: [{ type: "text" as const, text: "x" }] }),
      },
    ];
    const msg: JsonRpcRequest = { jsonrpc: "2.0", id: 1, method: "tools/list" };

    const result = await handleRpcMessage(msg, noAnno, logger, USER_ID);
    if (result.kind !== "response") throw new Error("expected response");
    const tool = (result.body.result as { tools: Array<Record<string, unknown>> }).tools[0]!;
    expect(tool).not.toHaveProperty("annotations");
    expect(tool).toMatchObject({ name: "bare", description: "d" });
  });
});

// ── tools/call ─────────────────────────────────────────────────────────────────

describe("handleRpcMessage — tools/call", () => {
  it("happy path: invokes a readonly tool and returns its content", async () => {
    const { logger, inserts } = buildLoggerStub();
    const msg: JsonRpcRequest = {
      jsonrpc: "2.0",
      id: 42,
      method: "tools/call",
      params: { name: "get_runway_score", arguments: {} },
    };

    const result = await handleRpcMessage(msg, buildStubRegistry(), logger, USER_ID);

    expect(result.kind).toBe("response");
    if (result.kind !== "response") return;
    expect(result.body.id).toBe(42);
    const content = (result.body.result as { content: Array<{ type: string; text: string }> }).content;
    expect(content[0]!.type).toBe("text");
    expect(JSON.parse(content[0]!.text)).toEqual({ tool: "get_runway_score", ok: true });

    // Fire-and-forget usage logging fired with the right shape.
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({
      user_id: USER_ID,
      tool_name: "get_runway_score",
      is_error: false,
    });
    expect(typeof inserts[0]!.latency_ms).toBe("number");
  });

  it("unknown tool → JSON-RPC error -32602", async () => {
    const { logger, inserts } = buildLoggerStub();
    const msg: JsonRpcRequest = {
      jsonrpc: "2.0",
      id: 7,
      method: "tools/call",
      params: { name: "does_not_exist", arguments: {} },
    };

    const result = await handleRpcMessage(msg, buildStubRegistry(), logger, USER_ID);

    expect(result.kind).toBe("response");
    if (result.kind !== "response") return;
    expect(result.body.error).toEqual({ code: -32602, message: "Unknown tool: does_not_exist" });
    expect(result.body.result).toBeUndefined();
    // No usage row logged for an unknown tool.
    expect(inserts).toHaveLength(0);
  });

  it("handler throw → -32603 Internal error, and still logs is_error:true", async () => {
    const { logger, inserts } = buildLoggerStub();
    const throwing: ProtocolTool[] = [
      {
        name: "boom",
        description: "d",
        inputSchema: { type: "object" },
        handler: async () => {
          throw new Error("kaboom");
        },
      },
    ];
    const msg: JsonRpcRequest = {
      jsonrpc: "2.0",
      id: 9,
      method: "tools/call",
      params: { name: "boom", arguments: {} },
    };

    const result = await handleRpcMessage(msg, throwing, logger, USER_ID);

    if (result.kind !== "response") throw new Error("expected response");
    expect(result.body.error).toEqual({ code: -32603, message: "Internal error" });
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({ tool_name: "boom", is_error: true });
  });
});

// ── notifications (the fix) ─────────────────────────────────────────────────────

describe("handleRpcMessage — notifications", () => {
  it("notifications/initialized (no id) → notification result (no JSON-RPC envelope)", async () => {
    const { logger } = buildLoggerStub();
    const msg = { jsonrpc: "2.0", method: "notifications/initialized" } as JsonRpcRequest;

    const result = await handleRpcMessage(msg, buildStubRegistry(), logger, USER_ID);

    expect(result).toEqual({ kind: "notification" });
  });

  it("ANY id-less notifications/* method → notification (not special-cased to initialized)", async () => {
    const { logger } = buildLoggerStub();
    const msg = { jsonrpc: "2.0", method: "notifications/cancelled" } as JsonRpcRequest;

    const result = await handleRpcMessage(msg, buildStubRegistry(), logger, USER_ID);

    expect(result).toEqual({ kind: "notification" });
  });

  it("an id-less message of ANY method is a notification (id presence, not method name, decides)", async () => {
    const { logger } = buildLoggerStub();
    const msg = { jsonrpc: "2.0", method: "tools/list" } as JsonRpcRequest;

    const result = await handleRpcMessage(msg, buildStubRegistry(), logger, USER_ID);

    expect(result).toEqual({ kind: "notification" });
  });
});

// ── unknown method (with id) ─────────────────────────────────────────────────────

describe("handleRpcMessage — unknown method", () => {
  it("unknown method WITH id → JSON-RPC error -32601 Method not found", async () => {
    const { logger } = buildLoggerStub();
    const msg: JsonRpcRequest = { jsonrpc: "2.0", id: 5, method: "resources/list" };

    const result = await handleRpcMessage(msg, buildStubRegistry(), logger, USER_ID);

    expect(result.kind).toBe("response");
    if (result.kind !== "response") return;
    expect(result.body.id).toBe(5);
    expect(result.body.error).toEqual({ code: -32601, message: "Method not found" });
  });
});

// ── ping regression (id-bearing empty-result method) ─────────────────────────────

describe("handleRpcMessage — ping", () => {
  it("ping (has id) still returns an empty-result envelope — id-less rule must not break it", async () => {
    const { logger } = buildLoggerStub();
    const msg: JsonRpcRequest = { jsonrpc: "2.0", id: 99, method: "ping" };

    const result = await handleRpcMessage(msg, buildStubRegistry(), logger, USER_ID);

    expect(result.kind).toBe("response");
    if (result.kind !== "response") return;
    expect(result.body).toEqual({ jsonrpc: "2.0", id: 99, result: {} });
  });
});

// ── HTTP mapping (transport contract) ────────────────────────────────────────────

describe("toHttpResponseInit", () => {
  it("notification → 202 Accepted, empty (null) body, NO Content-Type, CORS preserved", () => {
    const init = toHttpResponseInit({ kind: "notification" }, CORS_HEADERS);
    expect(init.status).toBe(202);
    expect(init.body).toBeNull();
    expect(init.headers).not.toHaveProperty("Content-Type");
    expect(init.headers["Access-Control-Allow-Origin"]).toBe("*");
  });

  it("response → 200 OK, JSON-serialized envelope, Content-Type application/json, CORS preserved", () => {
    const init = toHttpResponseInit(
      { kind: "response", body: { jsonrpc: "2.0", id: 1, result: { ok: true } } },
      CORS_HEADERS,
    );
    expect(init.status).toBe(200);
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(init.headers["Access-Control-Allow-Origin"]).toBe("*");
    expect(JSON.parse(init.body as string)).toEqual({ jsonrpc: "2.0", id: 1, result: { ok: true } });
  });

  it("end-to-end: a notifications/initialized message maps to a 202/empty-body HTTP init", async () => {
    const { logger } = buildLoggerStub();
    const msg = { jsonrpc: "2.0", method: "notifications/initialized" } as JsonRpcRequest;

    const handled = await handleRpcMessage(msg, buildStubRegistry(), logger, USER_ID);
    const init = toHttpResponseInit(handled, CORS_HEADERS);

    expect(init.status).toBe(202);
    expect(init.body).toBeNull();
  });
});
