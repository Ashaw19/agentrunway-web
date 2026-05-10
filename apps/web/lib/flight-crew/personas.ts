/**
 * lib/flight-crew/personas.ts
 *
 * Canonical metadata for the three Flight Crew personas. Single source of
 * truth consumed by every component that renders a persona — message bubbles,
 * avatars, the selector dropdown, @mention autocomplete, handoff seams.
 *
 * Design decisions (see memory/project_flight_crew_ui_design.md):
 * - Icons from lucide-react (no new dependencies)
 * - Accent colors in Tailwind token form, all cool-toned to harmonize with
 *   AR's existing blue/cyan/violet palette
 * - Captain is the default responder; Navigator + Dispatcher are specialists
 *
 * See also:
 * - memory/project_flight_crew_direction.md — 8 locked direction decisions
 * - memory/project_flight_crew_constitution.md — shared system prompt prefix
 * - memory/project_flight_crew_personas.md — per-persona system prompts
 * - memory/feedback_tax_information_not_advice.md — Navigator's tax posture
 */

import { Compass, Radio, type LucideIcon } from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import { Tailfin } from "@/components/icons/brand-icons";

/**
 * An icon component compatible with both lucide-react icons and AR's custom
 * brand-mark components. Both accept `className` and render as a sized SVG.
 */
type IconComponent = LucideIcon | ComponentType<SVGProps<SVGSVGElement>>;

// ── Types ────────────────────────────────────────────────────────────────────

/**
 * The three Flight Crew persona identifiers. Used as the `persona` field on
 * chat messages and anywhere persona-specific behavior is dispatched.
 */
export type Persona = "captain" | "navigator" | "dispatcher";

/**
 * Full metadata for rendering a persona in the UI. Colors are Tailwind token
 * names (not raw hex) so theming stays consistent with the rest of AR.
 */
export interface PersonaMeta {
  /** Kebab-case ID, used as the `persona` field on messages. */
  id: Persona;
  /** Display name shown in UI. */
  name: string;
  /** Short one-line domain description, shown beside the name in menus. */
  domain: string;
  /** Icon component (lucide-react or AR brand mark). */
  icon: IconComponent;
  /** Tailwind token for solid accent (borders, strong text). */
  accent: string;
  /** Tailwind token for subtle background tint (avatar fill, message bg). */
  accentBg: string;
  /** Tailwind text-color token for the persona name/label. */
  accentText: string;
}

// ── Canonical persona metadata ───────────────────────────────────────────────

export const CAPTAIN: PersonaMeta = {
  id: "captain",
  name: "Captain",
  domain: "strategic overview — default",
  icon: Tailfin,
  accent: "border-blue-600",
  accentBg: "bg-blue-600/10",
  accentText: "text-blue-400",
};

export const NAVIGATOR: PersonaMeta = {
  id: "navigator",
  name: "Navigator",
  domain: "finance, tax, runway",
  icon: Compass,
  accent: "border-cyan-600",
  accentBg: "bg-cyan-600/10",
  accentText: "text-cyan-400",
};

export const DISPATCHER: PersonaMeta = {
  id: "dispatcher",
  name: "Dispatcher",
  domain: "clients, pipeline, follow-ups",
  icon: Radio,
  accent: "border-violet-600",
  accentBg: "bg-violet-600/10",
  accentText: "text-violet-400",
};

/**
 * Ordered list of all personas. Order matters for UI rendering (dropdown,
 * @mention autocomplete): Captain first as the default, then specialists.
 */
export const CREW_PERSONAS = [CAPTAIN, NAVIGATOR, DISPATCHER] as const;

/**
 * Lookup map by persona ID. Prefer this to `CREW_PERSONAS.find()` in hot paths.
 */
export const PERSONA_BY_ID: Record<Persona, PersonaMeta> = {
  captain: CAPTAIN,
  navigator: NAVIGATOR,
  dispatcher: DISPATCHER,
};

/**
 * The default persona when no other is specified. Used as the active persona
 * on new conversations and as the fallback when a message has no explicit
 * `persona` field (e.g., legacy messages from before the Flight Crew ship).
 */
export const DEFAULT_PERSONA: Persona = "captain";

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Get persona metadata for a given ID, or fall back to the default.
 * Safe to call with unknown/legacy persona strings.
 */
export function getPersona(id: string | null | undefined): PersonaMeta {
  if (id && id in PERSONA_BY_ID) {
    return PERSONA_BY_ID[id as Persona];
  }
  return CAPTAIN;
}

/**
 * Detect an @mention of a crew persona at the start of a user message.
 * Returns the persona ID if found, else null.
 *
 * Examples:
 *   "@Navigator what's my Q3 instalment?"  →  "navigator"
 *   "@Nav quick question"                  →  "navigator"
 *   "hey can navigator help?"              →  null (no @)
 *   "ask @Dispatcher to draft a note"      →  "dispatcher"
 *
 * Case-insensitive. Accepts prefix matches ("Nav" → Navigator, "Cap" → Captain,
 * "Dis" → Dispatcher) so autocomplete-partial mentions work.
 */
export function parseMention(text: string): Persona | null {
  // Match @word (case-insensitive, up to 20 chars) anywhere in the message.
  // Take the first match only — multiple @mentions in one message default to
  // the first. Edge case for later iteration if real usage surfaces it.
  const match = text.match(/@([a-zA-Z]{1,20})/);
  if (!match) return null;

  const token = match[1].toLowerCase();

  // Exact match first
  if (token === "captain") return "captain";
  if (token === "navigator") return "navigator";
  if (token === "dispatcher") return "dispatcher";

  // Prefix match (at least 3 chars to disambiguate)
  if (token.length >= 3) {
    if ("captain".startsWith(token)) return "captain";
    if ("navigator".startsWith(token)) return "navigator";
    if ("dispatcher".startsWith(token)) return "dispatcher";
  }

  return null;
}

/**
 * Result of handoff detection. Includes the target persona to route to and
 * the truncated display text — when a persona over-generates past the
 * handoff sentence (emitting a handoff-then-answer hybrid), the extra text
 * is dropped so only the handoff sentence shows in the first bubble.
 */
export interface HandoffDetection {
  target: Persona;
  /**
   * The handoff sentence to display in the speaker's bubble. May be shorter
   * than the full generated text when the speaker over-generated past the
   * handoff phrase. Always ends with terminal punctuation if present.
   */
  displayText: string;
}

const HANDOFF_PHRASES = [
  "passing it over",
  "passing this over",
  "handing it over",
  "handing this over",
  "passing this to",
  "handing this to",
  "passing to",
] as const;

/**
 * Detect a narrated handoff in a completed assistant message. Returns the
 * target persona AND the handoff sentence (so the caller can truncate the
 * displayed message to just that sentence), or null if no handoff is
 * detected.
 *
 * Detection rules:
 * - Must contain a handoff phrase ("passing it over", "handing this over",
 *   "passing this to", etc.) within the first 300 characters — handoffs
 *   appear early; phrase mentions late in an answer are not handoffs.
 * - Must name a crew member (other than the current speaker) in the handoff
 *   sentence itself (not elsewhere in over-generated text).
 *
 * Over-generation handling:
 * - If a persona emits the handoff sentence and then keeps writing (e.g.
 *   Captain saying "...passing it over.\n\n---\n\nDispatcher here. Let me
 *   pull your data..."), we treat that as a successful handoff and TRUNCATE
 *   to the handoff sentence. The auto-router then fires the real target
 *   persona, which responds cleanly in its own bubble. Prior contract (if
 *   text > 400 chars, skip) was too conservative — it treated over-
 *   generation as a non-handoff and let the wrong persona "answer."
 *
 * Called client-side by ai-chat.tsx after a streaming response completes.
 *
 * Examples:
 *   "Navigator can speak to this — passing it over." (56 chars)
 *     → { target: "navigator", displayText: same }
 *
 *   "Dispatcher handles client follow-up — passing it over.\n\n---\n\n
 *    Dispatcher here. Let me pull your follow-up picture..."
 *     → { target: "dispatcher",
 *         displayText: "Dispatcher handles client follow-up — passing it over." }
 *     (the simulated "Dispatcher here…" text is dropped; the real Dispatcher
 *      persona responds in the next auto-routed turn)
 *
 *   "Your Q2 is $4,750. Navigator can dig deeper if you want." (57 chars,
 *    no handoff phrase) → null
 *
 *   "Passing it over." (no named target) → null
 */
export function detectHandoff(
  text: string,
  currentPersona: Persona,
): HandoffDetection | null {
  if (!text) return null;

  const lower = text.toLowerCase();

  // Find the earliest handoff phrase occurrence, if any.
  let earliestIdx = -1;
  let foundPhrase: string | null = null;
  for (const phrase of HANDOFF_PHRASES) {
    const idx = lower.indexOf(phrase);
    if (idx >= 0 && (earliestIdx === -1 || idx < earliestIdx)) {
      earliestIdx = idx;
      foundPhrase = phrase;
    }
  }
  if (earliestIdx === -1 || foundPhrase === null) return null;

  // Handoff phrase must appear near the start — phrases mid-answer are not
  // handoffs, they're answers that happen to mention the pattern.
  if (earliestIdx > 300) return null;

  // Extract the handoff sentence: everything up to the next sentence-ending
  // punctuation or newline AFTER the handoff phrase. We intentionally keep
  // the closing punctuation (period, exclamation, question mark) for a clean
  // display.
  const phraseEnd = earliestIdx + foundPhrase.length;
  const tail = text.slice(phraseEnd);
  const tailMatch = tail.match(/^[^.!?\n]*[.!?]?/);
  const handoffEndIdx = phraseEnd + (tailMatch?.[0].length ?? 0);
  const handoffSentence = text.slice(0, handoffEndIdx).trim();

  // The named target must appear in the handoff sentence itself.
  const sentenceLower = handoffSentence.toLowerCase();
  const candidates: Persona[] = ["navigator", "dispatcher", "captain"];
  for (const p of candidates) {
    if (p === currentPersona) continue;
    if (sentenceLower.includes(p)) {
      return { target: p, displayText: handoffSentence };
    }
  }
  return null;
}
