/**
 * lib/flags.ts
 *
 * Vercel Flags (Flags SDK) — kill-switch and targeting for the Flight Crew
 * rollout. Keeps the surface area minimal on purpose: three boolean flags,
 * all default true, all evaluated server-side in the chat API route only.
 *
 * Why flags here, not everywhere:
 * - The Ellis beta is about to start. If Navigator starts giving shaky tax
 *   reads or Dispatcher mis-routes persona handoffs, we need to drop that
 *   persona to Captain fallback without a code deploy.
 * - `flightCrewEnabled = false` is the master kill-switch. If it ever fires
 *   we force every request to Captain and emit a log line so Sentry picks
 *   it up.
 *
 * Provider: we don't set a Vercel Edge Config provider yet. With no
 * `adapter` wired up, each flag's `decide` function returns its
 * defaultValue — which is the intended behavior while flags are toggled
 * manually via Vercel Toolbar overrides during beta. When we're ready to
 * flip remotely without a deploy, wire `@flags-sdk/edge-config` into each
 * flag's `adapter` field.
 *
 * Flags SDK docs: https://flags-sdk.dev
 */

import { flag } from "flags/next";

/**
 * Master kill-switch for the entire Flight Crew feature.
 *
 * When false:
 *   - All personas fall back to Captain
 *   - The chat route logs the downgrade so we can see it in Sentry
 *   - UI (optional follow-up) can surface a maintenance banner
 *
 * Default: true (Flight Crew is live for Ellis beta).
 */
export const flightCrewEnabled = flag<boolean>({
  key: "flight-crew-enabled",
  description:
    "Master kill-switch for the Flight Crew feature. When false, all personas fall back to Captain.",
  defaultValue: true,
  decide: () => true,
  options: [
    { value: true, label: "On (Flight Crew active)" },
    { value: false, label: "Off (Captain-only fallback)" },
  ],
});

/**
 * Gates the Navigator persona (finance / tax / runway).
 *
 * When false:
 *   - Any request with `persona: "navigator"` is transparently downgraded to
 *     Captain. No error surfaced to the user. Captain handles the turn.
 *   - Useful as a safety valve if Navigator's tax posture drifts — we can
 *     pull it offline in seconds while we patch the persona prompt.
 *
 * Default: true.
 */
export const navigatorEnabled = flag<boolean>({
  key: "navigator-enabled",
  description:
    "Gates the Navigator persona. When false, Navigator requests transparently fall back to Captain.",
  defaultValue: true,
  decide: () => true,
  options: [
    { value: true, label: "On (Navigator active)" },
    { value: false, label: "Off (falls back to Captain)" },
  ],
});

/**
 * Gates the Dispatcher persona (clients / pipeline / follow-ups).
 *
 * When false: Dispatcher requests transparently fall back to Captain.
 *
 * Default: true.
 */
export const dispatcherEnabled = flag<boolean>({
  key: "dispatcher-enabled",
  description:
    "Gates the Dispatcher persona. When false, Dispatcher requests transparently fall back to Captain.",
  defaultValue: true,
  options: [
    { value: true, label: "On (Dispatcher active)" },
    { value: false, label: "Off (falls back to Captain)" },
  ],
  decide: () => true,
});

/**
 * All flags, grouped for discovery and the optional Flags Discovery Endpoint.
 * Keeping them in a single export makes it one-line to add more later.
 */
export const ALL_FLAGS = [
  flightCrewEnabled,
  navigatorEnabled,
  dispatcherEnabled,
] as const;
