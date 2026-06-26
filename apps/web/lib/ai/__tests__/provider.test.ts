/**
 * Regression tests for `opusWithTaskBudgetFetch`.
 *
 * Context: on 2026-04-22 (commit 08003c9) we fixed a silent production
 * regression where the Opus task-budget payload was posted as
 *   output_config.task_budget: { tokens: 40000 }
 * instead of Anthropic's public-beta shape
 *   output_config.task_budget: { type: "tokens", total: 40000 }
 * Anthropic 400'd every complex-tier (Opus) request and the chat
 * route's safeUserErrorMessage fallback was shown to every user on every
 * tax/forecast/scenario prompt. The SDK happily serialized the wrong shape
 * because nothing asserted on the outgoing body.
 *
 * These tests would have caught that regression before it shipped.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { validateTaxCopy } from "@agent-runway/core/tax-copy";
import {
  opusWithTaskBudgetFetch,
  OPUS_TASK_BUDGET_TOKENS,
  TAX_SAFETY_INJECT_HEADER,
  TAX_SAFETY_SYSTEM_MESSAGE,
} from "../provider";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

type CapturedCall = {
  input: Parameters<typeof fetch>[0];
  init: Parameters<typeof fetch>[1];
};

function installFetchStub(): { stub: ReturnType<typeof vi.fn>; calls: CapturedCall[] } {
  const calls: CapturedCall[] = [];
  const stub = vi.fn(async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    calls.push({ input, init });
    return new Response("{}", {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  globalThis.fetch = stub as unknown as typeof fetch;
  return { stub, calls };
}

describe("opusWithTaskBudgetFetch", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("injects output_config.task_budget with Anthropic's public-beta shape for Opus models", async () => {
    const { calls } = installFetchStub();

    await opusWithTaskBudgetFetch(ANTHROPIC_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-opus-4-8",
        max_tokens: 4096,
        messages: [{ role: "user", content: "hello" }],
      }),
    });

    expect(calls).toHaveLength(1);
    const forwardedBody = JSON.parse(calls[0]!.init!.body as string) as Record<
      string,
      unknown
    >;

    const outputConfig = forwardedBody.output_config as Record<string, unknown>;
    expect(outputConfig).toBeDefined();
    expect(outputConfig.task_budget).toEqual({
      type: "tokens",
      total: OPUS_TASK_BUDGET_TOKENS,
    });

    // Belt-and-suspenders: the broken shape must not appear anywhere.
    const serialized = calls[0]!.init!.body as string;
    expect(serialized).not.toMatch(/"tokens"\s*:\s*40000/);
    expect(serialized).toContain('"type":"tokens"');
    expect(serialized).toContain('"total":40000');
  });

  it("passes Sonnet requests through unchanged (no output_config injected)", async () => {
    const { calls } = installFetchStub();

    const originalBody = JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      messages: [{ role: "user", content: "hello" }],
    });

    await opusWithTaskBudgetFetch(ANTHROPIC_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: originalBody,
    });

    expect(calls).toHaveLength(1);
    const forwardedBody = JSON.parse(calls[0]!.init!.body as string) as Record<
      string,
      unknown
    >;
    expect(forwardedBody.output_config).toBeUndefined();
    expect(forwardedBody.model).toBe("claude-sonnet-4-6");
  });

  it("passes non-POST requests through unchanged", async () => {
    const { calls } = installFetchStub();

    await opusWithTaskBudgetFetch(ANTHROPIC_URL, {
      method: "GET",
      headers: { "content-type": "application/json" },
    });

    expect(calls).toHaveLength(1);
    // init passed through by reference — no body, no output_config.
    expect(calls[0]!.init?.method).toBe("GET");
    expect((calls[0]!.init as RequestInit | undefined)?.body).toBeUndefined();
  });

  it("passes non-JSON bodies through unchanged", async () => {
    const { calls } = installFetchStub();

    await opusWithTaskBudgetFetch(ANTHROPIC_URL, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "not-json-at-all",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]!.init?.body).toBe("not-json-at-all");
  });

  it("sets the task-budgets-2026-03-13 beta header on patched Opus requests", async () => {
    const { calls } = installFetchStub();

    await opusWithTaskBudgetFetch(ANTHROPIC_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-opus-4-8",
        max_tokens: 4096,
        messages: [{ role: "user", content: "hello" }],
      }),
    });

    const forwardedHeaders = new Headers(calls[0]!.init!.headers);
    const beta = forwardedHeaders.get("anthropic-beta");
    expect(beta).toBeTruthy();
    expect(beta!).toContain("task-budgets-2026-03-13");
  });

  it("merges the beta identifier into an existing anthropic-beta header without duplicating", async () => {
    const { calls } = installFetchStub();

    await opusWithTaskBudgetFetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "anthropic-beta": "prompt-caching-2024-07-31",
      },
      body: JSON.stringify({
        model: "claude-opus-4-8",
        max_tokens: 4096,
        messages: [{ role: "user", content: "hello" }],
      }),
    });

    const beta = new Headers(calls[0]!.init!.headers).get("anthropic-beta")!;
    expect(beta).toContain("prompt-caching-2024-07-31");
    expect(beta).toContain("task-budgets-2026-03-13");

    // Running twice should not append it again.
    await opusWithTaskBudgetFetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "anthropic-beta": "task-budgets-2026-03-13",
      },
      body: JSON.stringify({
        model: "claude-opus-4-8",
        max_tokens: 4096,
        messages: [{ role: "user", content: "hello" }],
      }),
    });

    const secondBeta = new Headers(calls[1]!.init!.headers).get(
      "anthropic-beta",
    )!;
    const occurrences = secondBeta.split("task-budgets-2026-03-13").length - 1;
    expect(occurrences).toBe(1);
  });

  it("preserves an existing output_config.effort when injecting task_budget (composition with per-persona effort)", async () => {
    // In production the SDK serializes `providerOptions.anthropic.effort` into
    // `output_config.effort` BEFORE this fetch hook runs. The hook must spread
    // the existing output_config (keeping effort) and add task_budget alongside
    // it — never clobber effort. This guards the P2-B + Task Budgets composition.
    const { calls } = installFetchStub();

    await opusWithTaskBudgetFetch(ANTHROPIC_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-opus-4-8",
        max_tokens: 4096,
        output_config: { effort: "high" },
        messages: [{ role: "user", content: "hello" }],
      }),
    });

    const forwardedBody = JSON.parse(calls[0]!.init!.body as string) as Record<
      string,
      unknown
    >;
    const outputConfig = forwardedBody.output_config as Record<string, unknown>;
    expect(outputConfig.effort).toBe("high");
    expect(outputConfig.task_budget).toEqual({
      type: "tokens",
      total: OPUS_TASK_BUDGET_TOKENS,
    });
  });

  it("never sets task_budget.remaining — the server tracks countdown and setting it invalidates prompt cache prefix", async () => {
    const { calls } = installFetchStub();

    await opusWithTaskBudgetFetch(ANTHROPIC_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-opus-4-8",
        max_tokens: 4096,
        messages: [{ role: "user", content: "hello" }],
      }),
    });

    const forwardedBody = JSON.parse(calls[0]!.init!.body as string) as Record<
      string,
      unknown
    >;
    const taskBudget = (forwardedBody.output_config as Record<string, unknown>)
      .task_budget as Record<string, unknown>;

    expect(taskBudget).not.toHaveProperty("remaining");
    expect(Object.keys(taskBudget).sort()).toEqual(["total", "type"]);
  });
});

describe("opusWithTaskBudgetFetch — mid-conversation tax-safety system message", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  const opusBody = (messages: Array<{ role: string; content: unknown }>) =>
    JSON.stringify({
      model: "claude-opus-4-8",
      max_tokens: 4096,
      system: "STATIC CACHED SYSTEM PREFIX",
      messages,
    });

  it("appends the tax-safety system message to the tail when the trigger header is '1' (Opus)", async () => {
    const { calls } = installFetchStub();

    await opusWithTaskBudgetFetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [TAX_SAFETY_INJECT_HEADER]: "1",
      },
      body: opusBody([{ role: "user", content: "what's my HST owing for Q2?" }]),
    });

    const forwardedBody = JSON.parse(calls[0]!.init!.body as string) as {
      messages: Array<{ role: string; content: string }>;
    };
    const last = forwardedBody.messages[forwardedBody.messages.length - 1]!;
    expect(last.role).toBe("system");
    expect(last.content).toBe(TAX_SAFETY_SYSTEM_MESSAGE);
    // It is the FINAL element (Anthropic placement: must be last or followed
    // by assistant), and it follows a user turn (not messages[0]).
    expect(forwardedBody.messages).toHaveLength(2);
    expect(forwardedBody.messages[0]!.role).toBe("user");
  });

  it("does NOT inject when the trigger header is absent (but still injects task_budget)", async () => {
    const { calls } = installFetchStub();

    await opusWithTaskBudgetFetch(ANTHROPIC_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: opusBody([{ role: "user", content: "forecast my Q3 GCI" }]),
    });

    const forwardedBody = JSON.parse(calls[0]!.init!.body as string) as {
      messages: Array<{ role: string; content: string }>;
      output_config: Record<string, unknown>;
    };
    expect(forwardedBody.messages).toHaveLength(1);
    expect(forwardedBody.messages[0]!.role).toBe("user");
    // Task budget composition is unaffected by the tax-safety path.
    expect(forwardedBody.output_config.task_budget).toEqual({
      type: "tokens",
      total: OPUS_TASK_BUDGET_TOKENS,
    });
  });

  it("NEVER injects on Sonnet even if the trigger header is present (Sonnet 400s on a system message in messages)", async () => {
    const { calls } = installFetchStub();

    await opusWithTaskBudgetFetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [TAX_SAFETY_INJECT_HEADER]: "1",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 4096,
        system: "STATIC CACHED SYSTEM PREFIX",
        messages: [{ role: "user", content: "what's my HST owing?" }],
      }),
    });

    // Non-Opus bodies pass through entirely untouched (early return before any
    // injection), so the system message must not appear anywhere.
    const serialized = calls[0]!.init!.body as string;
    expect(serialized).not.toContain(TAX_SAFETY_SYSTEM_MESSAGE);
    const forwardedBody = JSON.parse(serialized) as {
      messages: Array<{ role: string }>;
    };
    expect(forwardedBody.messages).toHaveLength(1);
    expect(forwardedBody.messages[0]!.role).toBe("user");
  });

  it("strips the internal trigger header from the forwarded request (it is not an Anthropic field)", async () => {
    const { calls } = installFetchStub();

    await opusWithTaskBudgetFetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [TAX_SAFETY_INJECT_HEADER]: "1",
      },
      body: opusBody([{ role: "user", content: "tax question" }]),
    });

    const forwardedHeaders = new Headers(calls[0]!.init!.headers);
    expect(forwardedHeaders.get(TAX_SAFETY_INJECT_HEADER)).toBeNull();
  });

  it("leaves the cached system prefix and pre-existing messages byte-identical (cache-prefix invariant)", async () => {
    const { calls } = installFetchStub();

    const priorMessages = [
      { role: "user", content: "earlier question" },
      { role: "assistant", content: "earlier answer" },
      { role: "user", content: "what's my instalment estimate?" },
    ];

    await opusWithTaskBudgetFetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [TAX_SAFETY_INJECT_HEADER]: "1",
      },
      body: opusBody(priorMessages),
    });

    const forwardedBody = JSON.parse(calls[0]!.init!.body as string) as {
      system: string;
      messages: Array<{ role: string; content: string }>;
    };
    // Static system prefix unchanged → prompt cache prefix not invalidated.
    expect(forwardedBody.system).toBe("STATIC CACHED SYSTEM PREFIX");
    // All prior messages identical and in order; exactly one trailing append.
    expect(forwardedBody.messages.slice(0, 3)).toEqual(priorMessages);
    expect(forwardedBody.messages).toHaveLength(4);
    expect(forwardedBody.messages[3]!.role).toBe("system");
  });

  it("is idempotent — does not double-inject if the tail is already the tax-safety message", async () => {
    const { calls } = installFetchStub();

    await opusWithTaskBudgetFetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [TAX_SAFETY_INJECT_HEADER]: "1",
      },
      body: opusBody([
        { role: "user", content: "tax question" },
        { role: "system", content: TAX_SAFETY_SYSTEM_MESSAGE },
      ]),
    });

    const forwardedBody = JSON.parse(calls[0]!.init!.body as string) as {
      messages: Array<{ role: string }>;
    };
    const systemCount = forwardedBody.messages.filter(
      (m) => m.role === "system",
    ).length;
    expect(systemCount).toBe(1);
    expect(forwardedBody.messages).toHaveLength(2);
  });

  it("does not inject when the last message is not a user/assistant turn (placement guard)", async () => {
    const { calls } = installFetchStub();

    // Degenerate/empty messages — nothing valid to follow. Must not produce a
    // messages[0] system message.
    await opusWithTaskBudgetFetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [TAX_SAFETY_INJECT_HEADER]: "1",
      },
      body: opusBody([]),
    });

    const forwardedBody = JSON.parse(calls[0]!.init!.body as string) as {
      messages: Array<{ role: string }>;
    };
    expect(forwardedBody.messages).toHaveLength(0);
  });

  it("composes with task_budget and effort on an injected turn (all three present, output_config intact)", async () => {
    const { calls } = installFetchStub();

    await opusWithTaskBudgetFetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [TAX_SAFETY_INJECT_HEADER]: "1",
      },
      body: JSON.stringify({
        model: "claude-opus-4-8",
        max_tokens: 4096,
        system: "STATIC CACHED SYSTEM PREFIX",
        output_config: { effort: "high" },
        messages: [{ role: "user", content: "Q2 HST owing?" }],
      }),
    });

    const forwardedBody = JSON.parse(calls[0]!.init!.body as string) as {
      output_config: Record<string, unknown>;
      messages: Array<{ role: string; content: string }>;
    };
    expect(forwardedBody.output_config.effort).toBe("high");
    expect(forwardedBody.output_config.task_budget).toEqual({
      type: "tokens",
      total: OPUS_TASK_BUDGET_TOKENS,
    });
    const last = forwardedBody.messages[forwardedBody.messages.length - 1]!;
    expect(last.role).toBe("system");
    expect(last.content).toBe(TAX_SAFETY_SYSTEM_MESSAGE);
  });

  it("the tax-safety system message itself passes the info-not-advice lint (no forbidden-verb creep)", () => {
    // Self-consistency: the string that ENFORCES info-not-advice must itself
    // clear AR's canonical tax-copy lint. Mirrors tax-copy/disclaimer.test.ts.
    // Locks the wording against re-introducing a negated forbidden-verb list
    // (which seeds the banned tokens into the model's most-recent context and
    // would fail validateTaxCopy hard).
    const errors = validateTaxCopy(TAX_SAFETY_SYSTEM_MESSAGE).filter(
      (d) => d.level === "error",
    );
    expect(errors).toEqual([]);
  });
});
