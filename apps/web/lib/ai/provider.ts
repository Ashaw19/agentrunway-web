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

  /** Opus 4.7 — $5/$25 per MTok. Forecasting, scenario modeling, complex advisory. */
  complex: anthropic("claude-opus-4-7"),

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

export { anthropic, groq };
