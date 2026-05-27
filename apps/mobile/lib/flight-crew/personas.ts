/**
 * apps/mobile/lib/flight-crew/personas.ts
 *
 * Mobile-side canonical metadata for the three Flight Crew personas.
 * Mirrors `apps/web/lib/flight-crew/personas.ts` 1:1 — same persona IDs,
 * same accent intent — adapted for React Native:
 *   - hex colors instead of Tailwind tokens (mobile has no Tailwind)
 *   - lucide-react-native instead of lucide-react
 *   - Tailfin imported from a mobile-native SVG component
 *
 * Server-side prompts, routing logic, and tools all live in the web app
 * (`apps/web/lib/flight-crew/*`, `apps/web/lib/ai/tools.ts`). Mobile is a
 * thin UI client of `/api/chat` — this file is rendering metadata only.
 *
 * Source rules (DO NOT deviate without ai-flight-crew-champion sign-off):
 * - memory/project_flight_crew_direction.md (8 locked decisions)
 * - memory/project_flight_crew_ui_design.md (icons + accent colors)
 * - memory/project_mobile_parity_audit_2026-05-26.md gap #1
 */

import { Compass, Radio } from "lucide-react-native";
import type { ComponentType } from "react";
import { Tailfin } from "@/components/icons/Tailfin";

// ── Types ────────────────────────────────────────────────────────────────────

/**
 * Icon component compatible with both lucide-react-native icons and AR's
 * own mobile brand-mark components. We use a structural component type
 * (not `LucideIcon`) because the brand mark accepts a narrower `size`
 * (number only, no string) — and every consumer only ever passes a number.
 * This keeps both icon shapes assignable without an explicit union.
 */
export type IconComponent = ComponentType<{
  size?: number;
  color?: string;
  strokeWidth?: number;
}>;

/**
 * The three Flight Crew persona identifiers. Mirrors web's `Persona` type.
 * Used as the `persona` field on chat messages and on the /api/chat payload.
 */
export type Persona = "captain" | "navigator" | "dispatcher";

/**
 * Full metadata for rendering a persona in the mobile UI. Accent values
 * are RN-compatible hex strings (not Tailwind tokens). Each persona has
 * a solid color for icons + strong text, a translucent tint for avatar
 * backgrounds, and a slightly lighter text shade used when the persona's
 * name is rendered inline.
 *
 * Color choices match the web design system at the same OKLCH targets:
 *   - Captain     = blue-600    (#3B5EF6, matches mobile theme.primary)
 *   - Navigator   = cyan-600    (#0891B2)
 *   - Dispatcher  = violet-600  (#7C3AED)
 */
export interface PersonaMeta {
  id: Persona;
  /** Display name. */
  name: string;
  /** One-line domain description, shown beside the name in selector blocks. */
  domain: string;
  /** Icon component. */
  icon: IconComponent;
  /** Solid accent — used for icon strokes, focused borders, send-button tint. */
  accent: string;
  /** Translucent accent tint — used for avatar background, message bubble bg. */
  accentTint: string;
  /** Slightly lighter text color used for the persona's name inline. */
  accentText: string;
}

// ── Canonical persona metadata ───────────────────────────────────────────────

export const CAPTAIN: PersonaMeta = {
  id: "captain",
  name: "Captain",
  domain: "strategic overview — default",
  icon: Tailfin,
  accent: "#3B5EF6",
  accentTint: "rgba(59, 94, 246, 0.14)",
  accentText: "#6380F8",
};

export const NAVIGATOR: PersonaMeta = {
  id: "navigator",
  name: "Navigator",
  domain: "finance, tax, runway",
  icon: Compass,
  accent: "#0891B2",
  accentTint: "rgba(8, 145, 178, 0.14)",
  accentText: "#22D3EE",
};

export const DISPATCHER: PersonaMeta = {
  id: "dispatcher",
  name: "Dispatcher",
  domain: "clients, pipeline, follow-ups",
  icon: Radio,
  accent: "#7C3AED",
  accentTint: "rgba(124, 58, 237, 0.14)",
  accentText: "#A78BFA",
};

/** Ordered list (Captain first as default). Drives selector + autocomplete. */
export const CREW_PERSONAS = [CAPTAIN, NAVIGATOR, DISPATCHER] as const;

/** Lookup map by persona ID. */
export const PERSONA_BY_ID: Record<Persona, PersonaMeta> = {
  captain: CAPTAIN,
  navigator: NAVIGATOR,
  dispatcher: DISPATCHER,
};

/** Default when no persona is specified — matches web. */
export const DEFAULT_PERSONA: Persona = "captain";

// ── Helpers (mirrors web's helpers character-for-character) ──────────────────

/**
 * Get persona metadata for a given ID; fall back to Captain for unknown /
 * legacy IDs (matches web's `getPersona`).
 */
export function getPersona(id: string | null | undefined): PersonaMeta {
  if (id && id in PERSONA_BY_ID) {
    return PERSONA_BY_ID[id as Persona];
  }
  return CAPTAIN;
}

/**
 * Detect an @mention of a crew persona in a user message. Identical rule
 * set to web — case-insensitive, prefix match >=3 chars, first match wins.
 * Examples:
 *   "@Navigator what's my Q3 instalment?"  -> "navigator"
 *   "@Nav quick question"                  -> "navigator"
 *   "hey can navigator help?"              -> null  (no @)
 */
export function parseMention(text: string): Persona | null {
  const match = text.match(/@([a-zA-Z]{1,20})/);
  if (!match) return null;
  const token = match[1].toLowerCase();
  if (token === "captain") return "captain";
  if (token === "navigator") return "navigator";
  if (token === "dispatcher") return "dispatcher";
  if (token.length >= 3) {
    if ("captain".startsWith(token)) return "captain";
    if ("navigator".startsWith(token)) return "navigator";
    if ("dispatcher".startsWith(token)) return "dispatcher";
  }
  return null;
}

/**
 * Result of handoff detection. Mirrors web exactly.
 */
export interface HandoffDetection {
  target: Persona;
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
 * Detect a narrated handoff in a completed assistant message. Logic copied
 * from `apps/web/lib/flight-crew/personas.ts` — do not drift. See web for
 * full inline rule documentation.
 *
 * Returns `{ target, displayText }` if a handoff is detected (caller can
 * truncate the speaker's bubble to `displayText` and auto-route a follow-up
 * /api/chat call to `target`), or `null` otherwise.
 */
export function detectHandoff(
  text: string,
  currentPersona: Persona,
): HandoffDetection | null {
  if (!text) return null;
  const lower = text.toLowerCase();

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
  if (earliestIdx > 300) return null;

  const phraseEnd = earliestIdx + foundPhrase.length;
  const tail = text.slice(phraseEnd);
  const tailMatch = tail.match(/^[^.!?\n]*[.!?]?/);
  const handoffEndIdx = phraseEnd + (tailMatch?.[0].length ?? 0);
  const handoffSentence = text.slice(0, handoffEndIdx).trim();

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
