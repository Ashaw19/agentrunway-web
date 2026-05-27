/**
 * Cookie consent storage layer for mobile.
 *
 * Mirrors the web's PIPEDA / Quebec Law 25 compliant cookie-consent contract
 * (`apps/web/components/cookie-consent.tsx`). Keeps the same key name
 * (`ar-cookie-consent`) and the same two-state contract ("accepted" |
 * "declined" | null) so the disclosure surface is consistent across surfaces.
 *
 * Mobile note: today there are NO non-essential trackers in the Expo app
 * (no analytics SDK, no session replay). The banner exists for two reasons:
 *
 *   1. App Store privacy nutrition labels — Apple requires us to disclose
 *      tracking + obtain consent before any analytics SDK ships. Surface
 *      ready, hookup deferred.
 *   2. Parity discipline — when a non-essential tracker DOES land later
 *      (e.g. Mem0, Posthog, Sentry replay), the consent gate is already in
 *      place and the user has already made a recorded choice.
 *
 * Sentry is treated as essential for crash recovery and runs without
 * consent — matching web's posture (`apps/web/components/cookie-consent.tsx`
 * line 7).
 */

import { storage } from "./mmkv";

/** Storage key — kept identical to the web banner for cross-surface parity. */
export const COOKIE_CONSENT_KEY = "ar-cookie-consent";

export type CookieConsentChoice = "accepted" | "declined" | null;

/**
 * Read the user's current consent choice. Returns `null` when no choice has
 * been recorded yet — that's the trigger to show the banner.
 */
export function getCookieConsent(): CookieConsentChoice {
  try {
    const val = storage.getString(COOKIE_CONSENT_KEY);
    if (val === "accepted" || val === "declined") return val;
    return null;
  } catch {
    return null;
  }
}

/** Persist the user's choice. */
export function setCookieConsent(choice: "accepted" | "declined"): void {
  try {
    storage.set(COOKIE_CONSENT_KEY, choice);
  } catch {
    // Storage failures are non-fatal — the banner will just re-appear next
    // launch and the user can choose again.
  }
}

/** Convenience for callers that only need a boolean. */
export function hasConsentedToCookies(): boolean {
  return getCookieConsent() === "accepted";
}
