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
// HISTORY / STATUS (2026-06-26): the Vercel AI SDK's Anthropic provider at
// 3.0.66 did NOT expose `output_config` in its providerOptions schema — unknown
// fields were stripped by zod before serialization — which is WHY the task
// budget is injected via this `fetch` passthrough rather than providerOptions.
//
// As of `@ai-sdk/anthropic` 3.0.74 the SDK now natively serializes BOTH
// `providerOptions.anthropic.effort` → `output_config.effort` (auto-adds the
// `effort-2025-11-24` beta) AND `providerOptions.anthropic.taskBudget` →
// `output_config.task_budget` (auto-adds `task-budgets-2026-03-13`). So this
// fetch hack is no longer strictly required for task_budget — a follow-up
// could migrate it to providerOptions and delete this passthrough. It is left
// in place for now because (a) it is battle-tested and regression-covered
// (see provider.test.ts), and (b) migrating it is a separate refactor with its
// own risk surface. The two paths COMPOSE safely: the SDK serializes
// `output_config.effort` before this hook runs, and the hook spreads the
// existing `output_config` before adding `task_budget` (verified by the
// "preserves an existing output_config.effort" test). This hooks at the HTTP
// layer like Andrew's existing Helicone proxy and leaves all other provider
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

// ── Mid-conversation tax-safety system message (Opus 4.8 only) ──────────────
// Opus 4.8 supports a `role: "system"` message appended to the `messages`
// array (a mid-conversation system message — no beta header required). The
// Vercel AI SDK CANNOT carry this: `convertToAnthropicMessagesPrompt` throws
// `UnsupportedFunctionalityError` on a second system message separated by
// user/assistant turns. So we inject it at the fetch layer, the same place
// the task budget is injected.
//
// WHY: keeps the tax-information-not-advice constraint always in scope on the
// Navigator boundary (and on tax-drift turns for any persona) WITHOUT bloating
// the cached static system prefix. The static `system` field stays byte-
// identical, so the prompt-cache prefix is never invalidated — we only append
// an uncached trailing message.
//
// SCOPE: Opus 4.8 ONLY. Sonnet/Haiku 400 with "role 'system' is not supported
// on this model" if a system message appears in `messages`. The fetch is only
// attached to the Opus provider, AND we re-check the model id, AND the route
// only sets the trigger header on the relevant turns.
//
// TRIGGER: the chat route sets the `X-AR-Tax-Safety-Inject` header (see
// TAX_SAFETY_INJECT_HEADER) when the turn is Navigator-relevant or tax-topic-
// relevant. We do NOT inject on every Opus turn — that would add cache churn
// and tokens to forecast/scenario turns that aren't tax. Only header-flagged
// turns get the message.
//
// PHRASING: stated as operating CONTEXT, not an override COMMAND. No
// "ignore the user" / "regardless of what was asked" / "disregard prior
// instructions" language — 4.8 is trained to resist instructions that work
// against the user, and that protection applies to the system role too. We
// state the constraint as the product's standing operating context.
const TAX_SAFETY_INJECT_HEADER = "x-ar-tax-safety-inject";

const TAX_SAFETY_SYSTEM_MESSAGE =
  "Operating context for this product's tax-related content: tax output here is " +
  "information, not advice. It surfaces published CRA rules and engine-computed " +
  "estimates so the user can have a better-informed conversation with their own " +
  "accountant. Stay in indicative, descriptive language — words like indicates, " +
  "estimates, may, could, based on. Keep tax framing descriptive rather than " +
  "prescriptive or directive: describe what the rules and the engine output " +
  "indicate, not what the user is being told to do about it. " +
  "Name gray areas and defer them to the user's accountant rather than interpreting " +
  "them. Every substantive tax response carries the estimate-and-verify disclaimer. " +
  "If the conversation drifts into tax territory and the Navigator persona handles " +
  "finance and tax, the natural move is to let Navigator speak to it. This context " +
  "complements the system instructions; it does not override the user's actual question.";

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

  // ── Mid-conversation tax-safety system message ────────────────────────────
  // Only when the route flags the turn as Navigator/tax-relevant. Appended to
  // the TAIL of body.messages so:
  //   - the cached `body.system` prefix is untouched (no cache invalidation);
  //   - all pre-existing messages are untouched (we only push one element);
  //   - placement satisfies Anthropic's rules — it follows the last user/
  //     assistant turn, is never messages[0], and is the final element.
  // The trigger header is dropped from the forwarded request (it's an internal
  // signal, not an Anthropic API field). Idempotent: if the tail is already
  // this exact system message, we don't append a second one.
  const shouldInjectTaxSafety =
    mergedHeaders.get(TAX_SAFETY_INJECT_HEADER) === "1";
  mergedHeaders.delete(TAX_SAFETY_INJECT_HEADER);

  if (shouldInjectTaxSafety && Array.isArray(body.messages)) {
    const messages = body.messages as Array<{ role?: unknown; content?: unknown }>;
    const last = messages[messages.length - 1];
    const lastRole = last && typeof last.role === "string" ? last.role : undefined;

    // Defensive placement guard: only inject when there is a preceding turn to
    // follow (so the system message is never messages[0]) and that turn is a
    // user or assistant turn (Anthropic requires the mid-conv system message to
    // follow a user/assistant-with-tool turn). The chat route always ends with
    // the latest user message, so this holds in the normal flow — including the
    // very first user turn (messages === [{ user }] → append → [{ user }, { system }]).
    const placementOk =
      messages.length > 0 && (lastRole === "user" || lastRole === "assistant");

    // Idempotency: do not double-inject if a prior pass already appended it.
    const alreadyInjected =
      lastRole === "system" &&
      typeof last?.content === "string" &&
      last.content === TAX_SAFETY_SYSTEM_MESSAGE;

    if (placementOk && !alreadyInjected) {
      messages.push({
        role: "system",
        content: TAX_SAFETY_SYSTEM_MESSAGE,
      });
    }
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
   * Opus 4.8 — $5/$25 per MTok. Forecasting, scenario modeling, complex advisory.
   *
   * Same request surface as Opus 4.7 (no new breaking changes): adaptive
   * thinking only, sampling params removed, Task Budgets beta unchanged.
   * Higher intelligence ceiling and stronger long-horizon coherence at the
   * same price — the charter's intended model (provider was pinned to 4.7).
   *
   * Uses the Opus-specific provider instance that injects an output_config
   * task budget (40K tokens) via fetch passthrough. See the
   * `opusWithTaskBudgetFetch` definition above. Paired with the chat route's
   * `maxOutputTokens` ceiling as the hard cap.
   */
  complex: anthropicOpus("claude-opus-4-8"),

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

export {
  anthropic,
  anthropicOpus,
  groq,
  opusWithTaskBudgetFetch,
  OPUS_TASK_BUDGET_TOKENS,
  TAX_SAFETY_INJECT_HEADER,
  TAX_SAFETY_SYSTEM_MESSAGE,
};

/**
 * Anthropic beta header identifier for Task Budgets (public beta).
 * Pass this in `providerOptions.anthropic.anthropicBeta` on streamText/
 * generateText calls that use the Opus (complex) tier so the SDK includes
 * the `anthropic-beta` header. The fetch passthrough above also injects it
 * as a safety net, but setting it at the SDK layer is the correct path.
 */
export const TASK_BUDGETS_BETA_HEADER = "task-budgets-2026-03-13";
