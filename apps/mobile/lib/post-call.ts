/**
 * The after-call sheet's rules. A call placed from Next up is kept as the
 * pending call (useNextUpStore.pendingCall); when the app comes back to the
 * front the dashboard asks how it went, but only if the app went to the
 * background after the call was placed (R34), and only within 2 hours of
 * dialling.
 *
 * iOS asks "Call …?" before it dials. While that prompt is up the app is
 * only inactive; a call takes the phone and sends the app to the
 * background. So a return to the front with no trip to the background is a
 * cancelled prompt: there was no call to ask about, and the pending call is
 * let go (a later trip away mustn't ask about it). So is an older one.
 */

/** How long after dialling the dashboard still asks how the call went. */
export const POST_CALL_WINDOW_MS = 2 * 60 * 60 * 1000;

/** A pending call, as the store keeps it: when it was placed, and when the app then went to the background. */
export interface CallTimes {
  at: number;
  backgroundedAt?: number | null;
}

/**
 * True when the app went to the background after the call was placed, and
 * it's within 2 hours of dialling. A call stamped after `now` (a clock moved
 * back) never asks.
 */
export function shouldAskAfterCall(pending: CallTimes | null, now: number): boolean {
  if (!pending || !Number.isFinite(pending.at)) return false;
  const away = pending.backgroundedAt;
  if (typeof away !== "number" || !Number.isFinite(away) || away < pending.at) return false;
  const elapsed = now - pending.at;
  return elapsed >= 0 && elapsed < POST_CALL_WINDOW_MS;
}

/**
 * The app is back in front: ask how the call went, let the pending call go
 * (the prompt was cancelled, or it's too old), or nothing is waiting.
 */
export function afterCallReturn(pending: CallTimes | null, now: number): "ask" | "clear" | "none" {
  if (!pending) return "none";
  return shouldAskAfterCall(pending, now) ? "ask" : "clear";
}

/** The tel: link for a number as typed on file: its digits, and a leading + when it has one. */
export function telUrl(phone: string | null | undefined): string | null {
  const trimmed = phone?.trim() ?? "";
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;
  return `tel:${trimmed.startsWith("+") ? "+" : ""}${digits}`;
}
