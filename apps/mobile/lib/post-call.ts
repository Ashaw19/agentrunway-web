/**
 * The after-call sheet's rules. A call placed from Next up is kept as the
 * pending call (useNextUpStore.pendingCall); when the app comes back to the
 * front the dashboard asks how it went, but only within 2 hours of dialling.
 * An older pending call is let go without asking.
 */

/** How long after dialling the dashboard still asks how the call went. */
export const POST_CALL_WINDOW_MS = 2 * 60 * 60 * 1000;

/** True within 2 hours of dialling. A call stamped after `now` (a clock moved back) never asks. */
export function shouldAskAfterCall(pending: { at: number } | null, now: number): boolean {
  if (!pending || !Number.isFinite(pending.at)) return false;
  const elapsed = now - pending.at;
  return elapsed >= 0 && elapsed < POST_CALL_WINDOW_MS;
}

/** The tel: link for a number as typed on file: its digits, and a leading + when it has one. */
export function telUrl(phone: string | null | undefined): string | null {
  const trimmed = phone?.trim() ?? "";
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;
  return `tel:${trimmed.startsWith("+") ? "+" : ""}${digits}`;
}
