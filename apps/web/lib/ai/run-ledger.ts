/**
 * AI run ledger: one `ai_runs` row per model call (migration 00182).
 *
 * `aiRunLedgerMiddleware` wraps every model in lib/ai/provider.ts, so every
 * generateText / streamText / generateObject call is logged without touching
 * its call site. The user, feature and request come from the headers
 * `aiCallHeaders()` adds (the old heliconeHeaders call sites); the
 * middleware takes them off the request so they never reach Anthropic.
 *
 * What a row holds: feature, model, token and cache counts, an estimated
 * cost (MODEL_PRICES), latency, and the outcome (ok, error, aborted) with the
 * error's class. Never the prompt or the completion: prompts carry client
 * details.
 *
 * Logging never blocks or fails the user's request: the insert runs after
 * the call settles, in the background (Next's `after`), through the service
 * role, and every error in it is swallowed.
 */

import type { LanguageModelMiddleware } from "ai";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AiRun, AiRunCallType, AiRunOutcome } from "@agent-runway/core/types/database";

// The provider-spec types, taken from `ai` (apps/web doesn't depend on
// @ai-sdk/provider directly).
type LanguageModelV3Middleware = LanguageModelMiddleware;
type WrapStreamOptions = Parameters<NonNullable<LanguageModelV3Middleware["wrapStream"]>>[0];
type LanguageModelV3 = WrapStreamOptions["model"];
type LanguageModelV3CallOptions = WrapStreamOptions["params"];
type StreamResult = Awaited<ReturnType<WrapStreamOptions["doStream"]>>;
type LanguageModelV3StreamPart = StreamResult["stream"] extends ReadableStream<infer P> ? P : never;
type LanguageModelV3Usage = Awaited<ReturnType<WrapStreamOptions["doGenerate"]>>["usage"];

// ── Call metadata headers ───────────────────────────────────────────────────

/** Headers that carry who and what a call is for, from aiCallHeaders(). */
export const AI_LEDGER_HEADERS = {
  userId: "x-ar-ai-user",
  feature: "x-ar-ai-feature",
  requestId: "x-ar-ai-request",
} as const;

const LEDGER_HEADER_NAMES = new Set<string>(Object.values(AI_LEDGER_HEADERS));

export interface AiCallMeta {
  userId: string | null;
  feature: string;
  requestId: string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The ledger metadata on a call, and its headers without it. */
export function takeLedgerMeta(headers: LanguageModelV3CallOptions["headers"]): {
  meta: AiCallMeta;
  headers: LanguageModelV3CallOptions["headers"];
} {
  const meta: AiCallMeta = { userId: null, feature: "unknown", requestId: null };
  if (!headers) return { meta, headers };
  const rest: Record<string, string | undefined> = {};
  let found = false;
  for (const [key, value] of Object.entries(headers)) {
    const k = key.toLowerCase();
    if (!LEDGER_HEADER_NAMES.has(k)) {
      rest[key] = value;
      continue;
    }
    found = true;
    const v = (value ?? "").trim();
    if (!v) continue;
    if (k === AI_LEDGER_HEADERS.userId) meta.userId = UUID_RE.test(v) ? v : null;
    else if (k === AI_LEDGER_HEADERS.feature) meta.feature = v.slice(0, 80);
    else if (k === AI_LEDGER_HEADERS.requestId) meta.requestId = v.slice(0, 100);
  }
  return { meta, headers: found ? rest : headers };
}

// ── Cost ────────────────────────────────────────────────────────────────────

/** List price in US dollars per million tokens. */
export interface ModelPrice {
  input: number;
  output: number;
}

/** Anthropic prompt caching: a cache read costs 0.1x input, a 5-minute cache write 1.25x. */
export const CACHE_READ_MULTIPLIER = 0.1;
export const CACHE_WRITE_MULTIPLIER = 1.25;

export interface UsageCounts {
  /** All input tokens, cached ones included. */
  inputTokens: number | null;
  outputTokens: number | null;
  cacheReadTokens: number | null;
  cacheWriteTokens: number | null;
  reasoningTokens: number | null;
}

export function usageCounts(usage: LanguageModelV3Usage | undefined): UsageCounts {
  const n = (v: number | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return {
    inputTokens: n(usage?.inputTokens?.total),
    outputTokens: n(usage?.outputTokens?.total),
    cacheReadTokens: n(usage?.inputTokens?.cacheRead),
    cacheWriteTokens: n(usage?.inputTokens?.cacheWrite),
    reasoningTokens: n(usage?.outputTokens?.reasoning),
  };
}

/** Estimated cost of one call at list prices, or null for a model with no price. */
export function estimateCostUsd(price: ModelPrice | undefined, u: UsageCounts): number | null {
  if (!price) return null;
  const cacheRead = u.cacheReadTokens ?? 0;
  const cacheWrite = u.cacheWriteTokens ?? 0;
  const uncached = Math.max(0, (u.inputTokens ?? 0) - cacheRead - cacheWrite);
  const usd =
    (uncached * price.input +
      cacheRead * price.input * CACHE_READ_MULTIPLIER +
      cacheWrite * price.input * CACHE_WRITE_MULTIPLIER +
      (u.outputTokens ?? 0) * price.output) /
    1_000_000;
  return Math.round(usd * 1_000_000) / 1_000_000;
}

// ── Errors ──────────────────────────────────────────────────────────────────

function isAbort(err: unknown): boolean {
  const e = err as { name?: string; code?: string } | null;
  return e?.name === "AbortError" || e?.name === "ResponseAborted" || e?.code === "ABORT_ERR";
}

/** "APICallError 529", "TypeError": the class and status, never the message. */
export function errorClass(err: unknown): string {
  if (err === null || err === undefined) return "unknown";
  if (typeof err !== "object") return typeof err;
  const e = err as { name?: unknown; statusCode?: unknown; constructor?: { name?: string } };
  const name = typeof e.name === "string" && e.name ? e.name : e.constructor?.name ?? "Error";
  const status = typeof e.statusCode === "number" ? ` ${e.statusCode}` : "";
  return `${name}${status}`.slice(0, 120);
}

// ── Recording ───────────────────────────────────────────────────────────────

/**
 * Run `work` in the background without holding up the response. The work
 * starts now; its promise is handed to Next's `after` (which waits on it
 * through the platform's waitUntil), else to Vercel's request context, else
 * left to finish on its own. Passing the PROMISE, not a callback, matters: a
 * callback registered after a streamed response has closed may never run.
 */
export function runInBackground(work: () => Promise<unknown>): void {
  let promise: Promise<unknown>;
  try {
    promise = work().catch(() => {});
  } catch {
    return;
  }
  try {
    after(promise);
    return;
  } catch {
    // Outside a request scope (a test, a script).
  }
  try {
    const ctx = (globalThis as Record<symbol, { get?: () => { waitUntil?: (p: Promise<unknown>) => void } } | undefined>)[
      Symbol.for("@vercel/request-context")
    ]?.get?.();
    ctx?.waitUntil?.(promise);
  } catch {
    // The promise still runs.
  }
}

export type AiRunInsert = Omit<AiRun, "created_at">;

/** Insert run rows through the service role. Swallows every error. */
export async function insertAIRun(row: AiRunInsert): Promise<void> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("ai_runs").insert(row);
    if (error) console.warn("[ai-ledger] ai_runs insert failed:", error.code ?? "", error.message);
  } catch (err) {
    // Missing service-role key (local dev, tests) or a network error.
    if (process.env.NODE_ENV === "production") console.warn("[ai-ledger] ai_runs insert threw:", errorClass(err));
  }
}

/** Swapped in tests to capture rows instead of writing them. */
let recordRun: (row: AiRunInsert) => void = (row) => runInBackground(() => insertAIRun(row));

export function setAIRunRecorderForTests(fn: ((row: AiRunInsert) => void) | null): void {
  recordRun = fn ?? ((row) => runInBackground(() => insertAIRun(row)));
}

// ── Request → latest run, so a tool's writes can name the call that asked ──

const LATEST_RUN_BY_REQUEST = new Map<string, string>();
const LATEST_RUN_LIMIT = 500;

/** The id of the most recent model call of a request, while it is in memory. */
export function latestRunIdForRequest(requestId: string | null | undefined): string | null {
  return requestId ? LATEST_RUN_BY_REQUEST.get(requestId) ?? null : null;
}

function rememberRun(requestId: string | null, runId: string): void {
  if (!requestId) return;
  LATEST_RUN_BY_REQUEST.delete(requestId);
  LATEST_RUN_BY_REQUEST.set(requestId, runId);
  if (LATEST_RUN_BY_REQUEST.size > LATEST_RUN_LIMIT) {
    const oldest = LATEST_RUN_BY_REQUEST.keys().next().value;
    if (oldest !== undefined) LATEST_RUN_BY_REQUEST.delete(oldest);
  }
}

// ── Middleware ──────────────────────────────────────────────────────────────

interface CallRecord {
  id: string;
  meta: AiCallMeta;
  model: LanguageModelV3;
  callType: AiRunCallType;
  startedAt: number;
}

function buildRow(
  call: CallRecord,
  prices: Readonly<Record<string, ModelPrice>>,
  outcome: AiRunOutcome,
  usage: LanguageModelV3Usage | undefined,
  finishReason: string | null,
  err: unknown,
): AiRunInsert {
  const u = usageCounts(usage);
  return {
    id: call.id,
    user_id: call.meta.userId,
    feature: call.meta.feature,
    provider: call.model.provider.slice(0, 60),
    model_id: call.model.modelId.slice(0, 100),
    request_id: call.meta.requestId,
    call_type: call.callType,
    input_tokens: u.inputTokens,
    output_tokens: u.outputTokens,
    cache_read_tokens: u.cacheReadTokens,
    cache_write_tokens: u.cacheWriteTokens,
    reasoning_tokens: u.reasoningTokens,
    estimated_cost_usd: estimateCostUsd(prices[call.model.modelId], u),
    latency_ms: Math.max(0, Math.round(Date.now() - call.startedAt)),
    outcome,
    error_class: outcome === "ok" ? null : err === undefined ? null : errorClass(err),
    finish_reason: finishReason ? finishReason.slice(0, 40) : null,
  };
}

function safeRecord(row: () => AiRunInsert): void {
  try {
    recordRun(row());
  } catch {
    // Logging must never reach the caller.
  }
}

/**
 * The ledger middleware for a set of model prices. Strips the ledger headers
 * and records each call when it settles (a stream: when it ends, errors or
 * is cancelled).
 */
export function createAIRunLedgerMiddleware(
  prices: Readonly<Record<string, ModelPrice>>,
): LanguageModelV3Middleware {
  const start = (model: LanguageModelV3, params: LanguageModelV3CallOptions, callType: AiRunCallType) => {
    const { meta, headers } = takeLedgerMeta(params.headers);
    const call: CallRecord = { id: crypto.randomUUID(), meta, model, callType, startedAt: Date.now() };
    rememberRun(meta.requestId, call.id);
    return { call, params: headers === params.headers ? params : { ...params, headers } };
  };

  return {
    specificationVersion: "v3",

    async wrapGenerate({ params, model }) {
      const { call, params: clean } = start(model, params, "generate");
      try {
        const result = await model.doGenerate(clean);
        safeRecord(() => buildRow(call, prices, "ok", result.usage, result.finishReason?.unified ?? null, undefined));
        return result;
      } catch (err) {
        const aborted = isAbort(err) || clean.abortSignal?.aborted === true;
        safeRecord(() => buildRow(call, prices, aborted ? "aborted" : "error", undefined, null, err));
        throw err;
      }
    },

    async wrapStream({ params, model }) {
      const { call, params: clean } = start(model, params, "stream");
      let result: StreamResult;
      try {
        result = await model.doStream(clean);
      } catch (err) {
        const aborted = isAbort(err) || clean.abortSignal?.aborted === true;
        safeRecord(() => buildRow(call, prices, aborted ? "aborted" : "error", undefined, null, err));
        throw err;
      }

      let usage: LanguageModelV3Usage | undefined;
      let finishReason: string | null = null;
      let streamError: unknown;
      let settled = false;
      const settle = (outcome: AiRunOutcome, err?: unknown) => {
        if (settled) return;
        settled = true;
        safeRecord(() => buildRow(call, prices, outcome, usage, finishReason, err));
      };

      const reader = result.stream.getReader();
      const stream = new ReadableStream<LanguageModelV3StreamPart>({
        async pull(controller) {
          try {
            const { done, value } = await reader.read();
            if (done) {
              settle(streamError === undefined ? "ok" : "error", streamError);
              controller.close();
              return;
            }
            if (value.type === "finish") {
              usage = value.usage;
              finishReason = value.finishReason?.unified ?? null;
            } else if (value.type === "error") {
              streamError = value.error;
            }
            controller.enqueue(value);
          } catch (err) {
            settle(isAbort(err) || clean.abortSignal?.aborted ? "aborted" : "error", err);
            controller.error(err);
          }
        },
        async cancel(reason) {
          settle("aborted");
          await reader.cancel(reason);
        },
      });

      return { ...result, stream };
    },
  };
}
