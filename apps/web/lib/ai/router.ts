/**
 * AI Model Router
 *
 * Selects the appropriate model tier based on the classified topic
 * and message complexity. Extends the existing troubleshooting-classifier
 * (which already does zero-latency keyword scoring) with model tier mapping.
 *
 * Target split: 60% Haiku (fast) / 30% Sonnet (default) / 10% Opus (complex)
 */

import { type TroubleshootingTopic } from "@/lib/troubleshooting-classifier";
import { type ModelTier, models } from "./provider";
import { type Persona } from "@/lib/flight-crew/personas";

/**
 * Per-request reasoning depth (`output_config.effort`) on Opus 4.5+/Sonnet 4.6.
 * The `@ai-sdk/anthropic` provider (≥3.0.74) accepts this as
 * `providerOptions.anthropic.effort` and auto-adds the `effort-2025-11-24`
 * beta header. Allowed values: "low" | "medium" | "high" | "xhigh" | "max".
 *
 * NOT supported on Haiku 4.5 (the `fast` tier) — passing it there 400s. Callers
 * must gate on tier (see `personaEffort`).
 */
export type ReasoningEffort = "low" | "medium" | "high" | "xhigh" | "max";

/**
 * Map a Flight Crew persona to its reasoning-effort budget. Tuned to what each
 * persona's work demands:
 *
 * - Navigator (finance/tax reasoning): `high` — tax is the accuracy-sensitive
 *   wedge; under-reasoning here risks the info-not-advice safety surface.
 * - Captain (orchestrator/routing): `medium` — balances coherence with cost.
 * - Dispatcher (clients/pipeline ops): `low` — fast, operational CRM actions.
 *
 * Returns `undefined` for the `fast` (Haiku) tier and the Groq `fallback`,
 * because `effort` is unsupported there and would 400. Effort only applies on
 * the `default` (Sonnet 4.6) and `complex` (Opus 4.8) tiers.
 */
const PERSONA_TO_EFFORT: Record<Persona, ReasoningEffort> = {
  navigator: "high",
  captain: "medium",
  dispatcher: "low",
};

export function personaEffort(
  persona: Persona,
  tier: ModelTier,
): ReasoningEffort | undefined {
  if (tier === "fast" || tier === "fallback") return undefined;
  return PERSONA_TO_EFFORT[persona];
}

/**
 * Map classified topics to model tiers.
 *
 * fast (Haiku):     Simple lookups, greetings, feature questions, onboarding
 * default (Sonnet): Analysis, CRM insights, outreach drafts, troubleshooting
 * complex (Opus):   Forecasting, tax optimization, scenario modeling
 */
const TOPIC_TO_TIER: Record<TroubleshootingTopic, ModelTier> = {
  // Fast tier — simple, factual, lookup-style
  "onboarding":      "fast",
  "settings":        "fast",
  "voice":           "fast",
  "import":          "fast",
  "social":          "fast",
  "general":         "fast",

  // Default tier — analysis and reasoning
  "runway-score":    "default",
  "pipeline":        "default",
  "expenses":        "default",
  "crm":             "default",
  "flight-control":  "default",
  "transactions":    "default",
  "survival":        "default",
  "benchmark":       "default",
  "teams":           "default",
  "referrals":       "default",
  "mileage":         "default",
  "recurring-expenses": "default",
  "bank-sync":       "default",
  "email-integration": "fast",
  "altimeter":       "default",

  // Complex tier — deep financial reasoning
  "tax":             "complex",
  "forecast":        "complex",
  "overhead":        "complex",
  "scenarios":       "complex",
};

/**
 * Keywords that force upgrade to a higher tier regardless of topic.
 * Checked against the user message.
 */
const COMPLEXITY_UPGRADES: { pattern: RegExp; minTier: ModelTier }[] = [
  // Force complex for scenario modeling / deep analysis
  { pattern: /what if|scenario|model|simulate|compare.*option|incorporate|dividend.*salary/i, minTier: "complex" },
  { pattern: /forecast|projection|predict|monte carlo|probability/i, minTier: "complex" },
  { pattern: /tax.*optimi|corporate.*tax|prec|t2125.*detail/i, minTier: "complex" },

  // Force default for anything that needs reasoning
  { pattern: /why|how|explain|analyze|breakdown|deep dive|compare/i, minTier: "default" },
  { pattern: /suggest|recommend|strategy|plan|improve/i, minTier: "default" },
];

const TIER_RANK: Record<ModelTier, number> = {
  fast: 0,
  default: 1,
  complex: 2,
  fallback: 0,
};

/**
 * Select the appropriate model tier for a given topic and message.
 *
 * @param topics - Classified topics from troubleshooting-classifier
 * @param userMessage - The raw user message for complexity checking
 * @param isTroubleshooting - Whether troubleshooting context was injected
 * @returns The model tier and resolved model reference
 */
export function selectModelTier(
  topics: TroubleshootingTopic[],
  userMessage: string,
  isTroubleshooting: boolean,
): { tier: ModelTier; model: typeof models[keyof typeof models] } {
  // Start with topic-based tier
  const primaryTopic = topics[0] ?? "general";
  let tier = TOPIC_TO_TIER[primaryTopic] ?? "fast";

  // Troubleshooting always gets at least default (needs step-by-step reasoning)
  if (isTroubleshooting && TIER_RANK[tier] < TIER_RANK["default"]) {
    tier = "default";
  }

  // Check for complexity upgrade patterns
  for (const { pattern, minTier } of COMPLEXITY_UPGRADES) {
    if (pattern.test(userMessage) && TIER_RANK[minTier] > TIER_RANK[tier]) {
      tier = minTier;
    }
  }

  return { tier, model: models[tier] };
}

/**
 * Select model tier for non-chat AI routes.
 * Simpler version — just returns the model for a given tier name.
 */
export function getModel(tier: ModelTier) {
  return models[tier];
}
