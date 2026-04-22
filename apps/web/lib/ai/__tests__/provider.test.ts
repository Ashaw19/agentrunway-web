/**
 * Regression tests for `opusWithTaskBudgetFetch`.
 *
 * Context: on 2026-04-22 (commit 08003c9) we fixed a silent production
 * regression where the Opus task-budget payload was posted as
 *   output_config.task_budget: { tokens: 40000 }
 * instead of Anthropic's public-beta shape
 *   output_config.task_budget: { type: "tokens", total: 40000 }
 * Anthropic 400'd every complex-tier (Opus 4.7) request and the chat
 * route's safeUserErrorMessage fallback was shown to every user on every
 * tax/forecast/scenario prompt. The SDK happily serialized the wrong shape
 * because nothing asserted on the outgoing body.
 *
 * These tests would have caught that regression before it shipped.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  opusWithTaskBudgetFetch,
  OPUS_TASK_BUDGET_TOKENS,
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
        model: "claude-opus-4-7",
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
        model: "claude-opus-4-7",
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
        model: "claude-opus-4-7",
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
        model: "claude-opus-4-7",
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

  it("never sets task_budget.remaining — the server tracks countdown and setting it invalidates prompt cache prefix", async () => {
    const { calls } = installFetchStub();

    await opusWithTaskBudgetFetch(ANTHROPIC_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-opus-4-7",
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
