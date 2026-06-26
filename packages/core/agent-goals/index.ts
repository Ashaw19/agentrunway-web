/**
 * Agent Goals — canonical field schema, option lists, and helpers.
 *
 * Shared between the web Settings "Your Voice, Your Rules" section
 * (`apps/web/app/(app)/settings/settings-content.tsx`, Part C of the AI
 * Profile card) and the mobile Business Identity screen
 * (`apps/mobile/app/(app)/profile/business-identity.tsx`, which renders the
 * full AI Profile card — Business Identity + Voice/Rules — in one place to
 * match the single web card).
 *
 * Lifted from the web Settings file during the mobile Settings parity build
 * (audit gap #14, follow-up to the Business Identity dispatch). Before this
 * lift the suppressed-topic option list and the `completed` derivation lived
 * only in the web JSX/handler — porting to mobile would have duplicated the
 * list and the completion rule with no enforcement, so a future content edit
 * on either side would silently drift. This module is the single source of
 * truth, mirroring the existing `@agent-runway/core/business-identity` module.
 *
 * Both surfaces import the option arrays and `computeAgentGoalsCompleted`
 * from here. Display labels live on the lists; surface-specific styling
 * (Tailwind class strings on web, theme tokens on mobile) stays with each
 * surface.
 *
 * The `AgentGoals` row type itself remains in
 * `packages/core/types/database.ts` to keep the row-shape canonical location
 * stable. This module imports it for convenience.
 *
 * NOTE on scope: web surfaces editable UI for exactly three of the six
 * AgentGoals fields — `signature_phrases`, `hard_nogos`, and
 * `suppressed_topics`. `primary_goal` and `secondary_goals` are read from
 * existing data and preserved on save but have NO editor on web. Mobile
 * mirrors this exactly: it edits the same three fields and spreads the other
 * two through unchanged. Adding an editor for the other fields would be
 * web-parity work web has not itself done.
 */
import type { AgentGoals } from "../types/database";

// ── Option lists ───────────────────────────────────────────────────────────
//
// `{ val, label }` tuples so consumers can map straight over without
// re-declaring labels. `val` is the persisted DB value; `label` is the
// human-readable English string (mobile overlays these from i18n translation
// files; web consumes labels directly).

export interface AgentGoalsOption<V extends string = string> {
  val: V;
  label: string;
}

/**
 * Suppressed topics — multi-select. Maps to AgentGoals.suppressed_topics
 * (string[]). Topics the agent has asked the AI to stay quiet about in its
 * responses. The four values are the persisted DB values referenced in the
 * `AgentGoals` row-type comment in `packages/core/types/database.ts`.
 */
export const SUPPRESSED_TOPIC_OPTIONS: AgentGoalsOption<
  "tax_advice" | "pricing" | "business_growth" | "crm_health"
>[] = [
  { val: "tax_advice", label: "Tax Advice" },
  { val: "pricing", label: "Pricing Conversations" },
  { val: "business_growth", label: "Business Growth Tips" },
  { val: "crm_health", label: "CRM Advice" },
];

// ── Empty / default state ──────────────────────────────────────────────────

/**
 * Canonical empty AgentGoals. Surfaces that need to render the "not yet
 * configured" state start here. Mirrors the inline default in
 * `apps/web/app/(app)/settings/settings-content.tsx` so a user opening
 * Settings vs. opening the mobile screen sees identical defaults pre-save.
 */
export const EMPTY_AGENT_GOALS: AgentGoals = {
  completed: false,
  primary_goal: "",
  secondary_goals: [],
  signature_phrases: "",
  hard_nogos: "",
  suppressed_topics: [],
};

// ── Completion derivation ──────────────────────────────────────────────────

/**
 * The `completed` flag on AgentGoals is *derived*, not persisted by the user
 * directly. The rule (from the web settings handler `saveAiProfile`): goals
 * are "completed" if the user has set a primary_goal OR any signature_phrases
 * OR any hard_nogos.
 *
 * Lifted here so web and mobile cannot drift. Behaviour preserved exactly:
 *
 *   completed: !!(primary_goal || signature_phrases || hard_nogos)
 *
 * `primary_goal` has no editor on either surface today, but it is part of the
 * rule and is preserved through saves, so it stays in the derivation.
 */
export function computeAgentGoalsCompleted(goals: AgentGoals): boolean {
  return !!(
    goals.primary_goal ||
    goals.signature_phrases ||
    goals.hard_nogos
  );
}

// ── Re-exports for ergonomic single-import ─────────────────────────────────

export type { AgentGoals };
