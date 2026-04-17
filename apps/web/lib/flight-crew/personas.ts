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

import { Anchor, Compass, Radio, type LucideIcon } from "lucide-react";

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
  /** lucide-react icon component. */
  icon: LucideIcon;
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
  icon: Anchor,
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
