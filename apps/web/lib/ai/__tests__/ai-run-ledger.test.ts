/**
 * The AI run ledger middleware (lib/ai/run-ledger.ts) and the provider
 * without Helicone (lib/ai/provider.ts).
 *
 * Every model call is logged once, with feature, user, tokens, estimated
 * cost, latency and outcome, and NEVER its prompt or completion. The ledger
 * headers never reach the provider. A logging failure never reaches the
 * caller. Runs against the AI SDK's own mock model; no network.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { generateText, streamText, wrapLanguageModel } from "ai";
import { MockLanguageModelV3, convertArrayToReadableStream } from "ai/test";
import {
  AI_LEDGER_HEADERS,
  createAIRunLedgerMiddleware,
  estimateCostUsd,
  runInBackground,
  setAIRunRecorderForTests,
  takeLedgerMeta,
  usageCounts,
  type AiRunInsert,
} from "../run-ledger";
import { ANTHROPIC_API_BASE_URL, MODEL_PRICES, aiCallHeaders, heliconeHeaders, models } from "../provider";

const USER = "11111111-2222-4333-8444-555555555555";
const SECRET_PROMPT = "Draft a note to Pat Example at 12 Example St";
const SECRET_REPLY = "Hi Pat, congratulations on the new home";

const usage = {
  inputTokens: { total: 1200, noCache: 200, cacheRead: 900, cacheWrite: 100 },
  outputTokens: { total: 300, text: 300, reasoning: undefined },
};

function mockModel(over: Partial<ConstructorParameters<typeof MockLanguageModelV3>[0]> = {}) {
  return new MockLanguageModelV3({
    provider: "anthropic.messages",
    modelId: "claude-sonnet-4-6",
    doGenerate: async () => ({
      content: [{ type: "text", text: SECRET_REPLY }],
      finishReason: { unified: "stop", raw: "end_turn" },
      usage,
      warnings: [],
    }),
    doStream: async () => ({
      stream: convertArrayToReadableStream([
        { type: "stream-start", warnings: [] },
        { type: "text-start", id: "t" },
        { type: "text-delta", id: "t", delta: SECRET_REPLY },
        { type: "text-end", id: "t" },
        { type: "finish", finishReason: { unified: "stop", raw: "end_turn" }, usage },
      ]),
    }),
    ...over,
  });
}

let rows: AiRunInsert[];
beforeEach(() => {
  rows = [];
  setAIRunRecorderForTests((r) => rows.push(r));
});
afterEach(() => setAIRunRecorderForTests(null));

const ledger = createAIRunLedgerMiddleware(MODEL_PRICES);

describe("aiRunLedgerMiddleware", () => {
  it("logs a generate call once: feature, user, tokens, cost, outcome; no prompt or reply", async () => {
    const inner = mockModel();
    const model = wrapLanguageModel({ model: inner, middleware: ledger });
    const { text } = await generateText({
      model,
      prompt: SECRET_PROMPT,
      headers: aiCallHeaders({ userId: USER, feature: "draft-outreach", sessionId: "req-1" }),
    });
    expect(text).toBe(SECRET_REPLY);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      user_id: USER,
      feature: "draft-outreach",
      request_id: "req-1",
      model_id: "claude-sonnet-4-6",
      call_type: "generate",
      input_tokens: 1200,
      output_tokens: 300,
      cache_read_tokens: 900,
      cache_write_tokens: 100,
      outcome: "ok",
      error_class: null,
      finish_reason: "stop",
    });
    // 200 uncached x $3 + 900 x $0.30 + 100 x $3.75 + 300 x $15, per million.
    expect(rows[0].estimated_cost_usd).toBeCloseTo((200 * 3 + 900 * 0.3 + 100 * 3.75 + 300 * 15) / 1e6, 9);
    expect(rows[0].latency_ms).toBeGreaterThanOrEqual(0);
    const stored = JSON.stringify(rows[0]);
    expect(stored).not.toContain("Pat");
    expect(stored).not.toContain("congratulations");
  });

  it("takes the ledger headers off the request before it reaches the provider", async () => {
    const inner = mockModel();
    const model = wrapLanguageModel({ model: inner, middleware: ledger });
    await generateText({
      model,
      prompt: "hello",
      headers: { ...aiCallHeaders({ userId: USER, feature: "chat" }), "x-ar-tax-safety-inject": "1" },
    });
    const sent = inner.doGenerateCalls[0].headers ?? {};
    for (const h of Object.values(AI_LEDGER_HEADERS)) expect(Object.keys(sent).map((k) => k.toLowerCase())).not.toContain(h);
    // Other headers (the Opus tax-safety signal) still go through.
    expect(sent["x-ar-tax-safety-inject"]).toBe("1");
  });

  it("logs a stream when it finishes, with its usage", async () => {
    const model = wrapLanguageModel({ model: mockModel(), middleware: ledger });
    const result = streamText({ model, prompt: SECRET_PROMPT, headers: aiCallHeaders({ userId: USER, feature: "chat" }) });
    let text = "";
    for await (const chunk of result.textStream) text += chunk;
    expect(text).toBe(SECRET_REPLY);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ call_type: "stream", outcome: "ok", input_tokens: 1200, output_tokens: 300, feature: "chat" });
  });

  it("logs a failed call with the error's class and status, never its message, and rethrows", async () => {
    const err = Object.assign(new Error(`overloaded while reading: ${SECRET_PROMPT}`), { name: "AI_APICallError", statusCode: 529 });
    const model = wrapLanguageModel({
      model: mockModel({ doGenerate: async () => { throw err; } }),
      middleware: ledger,
    });
    await expect(generateText({ model, prompt: SECRET_PROMPT, maxRetries: 0 })).rejects.toThrow();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ outcome: "error", error_class: "AI_APICallError 529", feature: "unknown", user_id: null });
    expect(JSON.stringify(rows[0])).not.toContain("Pat");
  });

  it("logs an aborted call as aborted", async () => {
    const controller = new AbortController();
    const model = wrapLanguageModel({
      model: mockModel({
        doGenerate: async () => {
          controller.abort();
          throw Object.assign(new Error("aborted"), { name: "AbortError" });
        },
      }),
      middleware: ledger,
    });
    await expect(generateText({ model, prompt: "x", abortSignal: controller.signal, maxRetries: 0 })).rejects.toThrow();
    expect(rows[0]?.outcome).toBe("aborted");
  });

  it("a recorder that throws never reaches the caller", async () => {
    setAIRunRecorderForTests(() => {
      throw new Error("ledger down");
    });
    const model = wrapLanguageModel({ model: mockModel(), middleware: ledger });
    await expect(generateText({ model, prompt: "x" })).resolves.toMatchObject({ text: SECRET_REPLY });
  });
});

describe("runInBackground", () => {
  it("starts the work at once, outside a request too, and swallows its errors", async () => {
    let ran = false;
    runInBackground(async () => {
      ran = true;
    });
    runInBackground(async () => {
      throw new Error("ledger down");
    });
    expect(ran).toBe(true); // started synchronously, before any await
    await new Promise((r) => setTimeout(r, 0));
  });
});

describe("ledger metadata and cost", () => {
  it("a malformed user id is dropped rather than failing the insert", () => {
    expect(takeLedgerMeta({ [AI_LEDGER_HEADERS.userId]: "not-a-uuid", [AI_LEDGER_HEADERS.feature]: "chat" }).meta).toEqual({
      userId: null,
      feature: "chat",
      requestId: null,
    });
  });

  it("an unpriced model is logged with no cost", () => {
    expect(estimateCostUsd(undefined, usageCounts(usage))).toBeNull();
  });

  it("every pinned model has a price", () => {
    for (const m of [models.fast, models.default, models.complex, models.fallback]) {
      const id = (m as { modelId: string }).modelId;
      expect(MODEL_PRICES[id], id).toBeDefined();
    }
  });
});

describe("provider without Helicone", () => {
  const providerSrc = readFileSync(path.join(__dirname, "..", "provider.ts"), "utf8");

  it("no call is routed through the Helicone proxy: every Anthropic client is pinned to api.anthropic.com", () => {
    expect(ANTHROPIC_API_BASE_URL).toBe("https://api.anthropic.com/v1");
    const baseUrls = [...providerSrc.matchAll(/baseURL:\s*([^,\n]+)/g)].map((m) => m[1].trim());
    expect(baseUrls).toEqual(["ANTHROPIC_API_BASE_URL", "ANTHROPIC_API_BASE_URL"]);
    expect(providerSrc).not.toMatch(/Helicone-Auth/);
    expect(providerSrc).not.toMatch(/process\.env\.HELICONE_API_KEY/);
  });

  it("a request goes to api.anthropic.com even when ANTHROPIC_BASE_URL is set in the environment", async () => {
    const seen: string[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      seen.push(String(input instanceof Request ? input.url : input));
      return new Response(JSON.stringify({ type: "error", error: { type: "authentication_error", message: "x" } }), { status: 401 });
    }) as typeof fetch;
    const saved = { base: process.env.ANTHROPIC_BASE_URL, key: process.env.ANTHROPIC_API_KEY };
    process.env.ANTHROPIC_BASE_URL = "https://proxy.example.invalid";
    process.env.ANTHROPIC_API_KEY ||= "sk-ant-test-placeholder";
    try {
      await generateText({ model: models.fast, prompt: "hi", maxRetries: 0 }).catch(() => {});
    } finally {
      globalThis.fetch = original;
      for (const [k, v] of [["ANTHROPIC_BASE_URL", saved.base], ["ANTHROPIC_API_KEY", saved.key]] as const) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
    expect(seen).toEqual(["https://api.anthropic.com/v1/messages"]);
  });

  it("aiCallHeaders always carries the feature, and the old name still works", () => {
    expect(aiCallHeaders({ feature: "receipt-ocr" })).toEqual({ [AI_LEDGER_HEADERS.feature]: "receipt-ocr" });
    expect(heliconeHeaders({ userId: USER, feature: "chat" })).toEqual(aiCallHeaders({ userId: USER, feature: "chat" }));
  });

  it("every model in the provider is wrapped in the ledger", () => {
    // wrapLanguageModel keeps provider and modelId; the wrapper is a plain
    // object, not the provider's class instance.
    for (const m of [models.fast, models.default, models.complex, models.fallback]) {
      expect(Object.getPrototypeOf(m)).toBe(Object.prototype);
    }
  });
});
