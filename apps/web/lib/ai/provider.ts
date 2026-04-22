/**
 * Centralized AI Provider Configuration
 *
 * Routes all LLM requests through Anthropic (Claude) as primary,
 * with Groq as the speed/cost fallback. All requests proxy through
 * Helicone for observability and per-user cost tracking.
 */

import { createAnthropic } from "@ai-sdk/anthropic";
import { createGroq } from "@ai-sdk/groq";

// ── Anthropic (Primary) ────────────────────────────────────────────────────
// When Helicone key is present, route through Helicone proxy for
// cost tracking and observability. Otherwise hit Anthropic directly.
const anthropicBaseURL = process.env.HELICONE_API_KEY
  ? "https://anthropic.helicone.ai/v1"
  : undefined; // default Anthropic URL

const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  baseURL: anthropicBaseURL,
  headers: process.env.HELICONE_API_KEY
    ? {
        "Helicone-Auth": `Bearer ${process.env.HELICONE_API_KEY}`,
      }
    : undefined,
});

// ── Anthropic (Opus with Task Budgets) ─────────────────────────────────────
// Task Budgets (public beta, header: `task-budgets-2026-03-13`) let us set a
// soft token ceiling for an entire agentic turn. Claude self-regulates as
// the budget depletes (wraps up gracefully rather than hard-cutting).
//
// The Vercel AI SDK's Anthropic provider (3.0.66) does not yet expose
// `output_config` in its providerOptions schema — unknown fields are stripped
// by zod before serialization. To inject it today, we use the provider's
// `fetch` passthrough to patch the outgoing request body right before it
// hits Anthropic's API. This is the same pattern Andrew's existing Helicone
// proxy uses (hooking at the HTTP layer) and leaves all other provider
// behaviour (cache_control, helicone headers, standard streaming) untouched.
//
// Pairing constraint (from Anthropic docs): task_budget is ADVISORY, not a
// hard cap. It must be paired with `max_tokens` as the absolute ceiling —
// we leave `maxOutputTokens` in the streamText call as-is. Also: we do NOT
// set `task_budget.remaining` on follow-up requests; the server tracks
// countdown, and setting it manually invalidates the prompt cache prefix.
//
// Budget sizing: 40,000 tokens is a generous starting point for a complex
// Opus conversation (tax/forecast/scenario modeling). Tune after observing
// p99 usage in Helicone. Opus-only — Haiku and Sonnet calls do not get a
// budget because (a) they're cheap, (b) the routing already caps complexity,
// (c) the bookkeeping overhead of task budgets isn't worth it at those tiers.
const OPUS_TASK_BUDGET_TOKENS = 40000;
const TASK_BUDGETS_BETA = "task-budgets-2026-03-13";

const opusWithTaskBudgetFetch: typeof fetch = async (input, init) => {
  // Only patch POSTs to /v1/messages with JSON bodies (the Anthropic Messages
  // API). Everything else passes through untouched.
  if (init?.method !== "POST" || typeof init.body !== "string") {
    return fetch(input, init);
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(init.body) as Record<string, unknown>;
  } catch {
    // Non-JSON body — passthrough.
    return fetch(input, init);
  }

  // Scope to Opus-only. The provider instance this fetch is attached to only
  // serves Opus, but belt-and-suspenders: check the model id too.
  const model = typeof body.model === "string" ? body.model : "";
  if (!model.startsWith("claude-opus")) {
    return fetch(input, init);
  }

  // Inject output_config.task_budget per Anthropic's public-beta shape:
  //   output_config: { task_budget: { type: "tokens", total: N } }
  // (docs.anthropic.com "Building with extended thinking" + task-budgets-2026-03-13
  // release notes). Earlier implementation used `{ tokens: N }` which Anthropic
  // 400s — the request never produced any stream chunks, so the chat API
  // surfaced the generic "Something went wrong with the AI" fallback on every
  // complex-tier (Opus) request. Do NOT set `remaining` — the server tracks
  // countdown across multi-step agentic loops; setting it manually invalidates
  // the prompt cache prefix.
  const existingOutputConfig =
    (body.output_config as Record<string, unknown> | undefined) ?? {};
  body.output_config = {
    ...existingOutputConfig,
    task_budget: {
      type: "tokens",
      total: OPUS_TASK_BUDGET_TOKENS,
    },
  };

  // Ensure the beta header is present. The SDK should already be setting it
  // via `anthropicBeta` in providerOptions, but merging here guarantees it
  // even if a caller forgets.
  const mergedHeaders = new Headers(init.headers);
  const existingBeta = mergedHeaders.get("anthropic-beta");
  if (existingBeta) {
    if (!existingBeta.includes(TASK_BUDGETS_BETA)) {
      mergedHeaders.set("anthropic-beta", `${existingBeta},${TASK_BUDGETS_BETA}`);
    }
  } else {
    mergedHeaders.set("anthropic-beta", TASK_BUDGETS_BETA);
  }

  return fetch(input, {
    ...init,
    headers: mergedHeaders,
    body: JSON.stringify(body),
  });
};

const anthropicOpus = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  baseURL: anthropicBaseURL,
  headers: process.env.HELICONE_API_KEY
    ? {
        "Helicone-Auth": `Bearer ${process.env.HELICONE_API_KEY}`,
      }
    : undefined,
  fetch: opusWithTaskBudgetFetch,
});

// ── Groq (Fallback) ────────────────────────────────────────────────────────
const groq = createGroq({
  apiKey: process.env.GROQ_API_KEY,
});

// ── Model References ────────────────────────────────────────────────────────
// 3-tier routing: fast (cheap/simple) → default (standard) → complex (expensive/deep)
export const models = {
  /** Haiku 4.5 — $1/$5 per MTok. Simple lookups, classifications, OCR extraction. */
  fast: anthropic("claude-haiku-4-5-20251001"),

  /** Sonnet 4.6 — $3/$15 per MTok. Conversations, analysis, drafts, CRM lookups. */
  default: anthropic("claude-sonnet-4-6"),

  /**
   * Opus 4.7 — $5/$25 per MTok. Forecasting, scenario modeling, complex advisory.
   *
   * Uses the Opus-specific provider instance that injects an output_config
   * task budget (40K tokens) via fetch passthrough. See the
   * `opusWithTaskBudgetFetch` definition above. Paired with the chat route's
   * `maxOutputTokens` ceiling as the hard cap.
   */
  complex: anthropicOpus("claude-opus-4-7"),

  /** Groq Llama 3.3 70B — $0.59/$0.79 per MTok. Speed fallback. */
  fallback: groq("llama-3.3-70b-versatile"),

  /** Groq Whisper — voice transcription (keep on Groq for speed). */
  whisper: groq("whisper-large-v3-turbo"),
} as const;

export type ModelTier = "fast" | "default" | "complex" | "fallback";

/**
 * Build Helicone tracking headers for per-user cost attribution.
 * These are passed to streamText/generateText via the `headers` option.
 */
export function heliconeHeaders(opts: {
  userId: string;
  feature: string;
  sessionId?: string;
}) {
  if (!process.env.HELICONE_API_KEY) return {};
  return {
    "Helicone-User-Id": opts.userId,
    "Helicone-Property-Feature": opts.feature,
    ...(opts.sessionId
      ? { "Helicone-Session-Id": opts.sessionId }
      : {}),
  };
}

/**
 * Select a model with Groq fallback.
 * Use this when you want automatic provider failover.
 */
export function getModelWithFallback(tier: ModelTier) {
  return {
    primary: models[tier === "fallback" ? "default" : tier],
    fallback: models.fallback,
  };
}

export { anthropic, anthropicOpus, groq, opusWithTaskBudgetFetch, OPUS_TASK_BUDGET_TOKENS };

/**
 * Anthropic beta header identifier for Task Budgets (public beta).
 * Pass this in `providerOptions.anthropic.anthropicBeta` on streamText/
 * generateText calls that use the Opus (complex) tier so the SDK includes
 * the `anthropic-beta` header. The fetch passthrough above also injects it
 * as a safety net, but setting it at the SDK layer is the correct path.
 */
export const TASK_BUDGETS_BETA_HEADER = "task-budgets-2026-03-13";
