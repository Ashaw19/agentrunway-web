/**
 * The phone app's reading of /api/mobile/outreach/text-check, the server's
 * last-moment CASL check before iOS Messages opens with a queued text
 * (consent ledger, 00183). Pure, so the decision the phone makes is tested
 * here (apps/mobile has no test runner).
 *
 * Fails closed: no answer (offline, a timeout, a server error) means the
 * text isn't opened.
 */

export type TextCheckOutcome =
  | { send: true }
  | { send: false; removeFromQueue: boolean; title: string; message: string };

/**
 * `status` is the HTTP status, or null when the request never got an
 * answer. `body` is the parsed JSON (anything).
 */
export function textCheckOutcome(status: number | null, body: unknown): TextCheckOutcome {
  const b = (body && typeof body === "object" ? body : {}) as { ok?: unknown; code?: unknown; error?: unknown };
  if (status !== null && status >= 200 && status < 300 && b.ok === true) return { send: true };
  const error = typeof b.error === "string" && b.error.trim() ? b.error : null;
  const code = typeof b.code === "string" ? b.code : null;
  if (code === "NO_CONSENT") {
    return { send: false, removeFromQueue: true, title: "Call instead", message: error ?? "Their consent doesn't cover this text any more." };
  }
  if (code === "NOT_FOUND" || code === "NOT_QUEUED") {
    return { send: false, removeFromQueue: true, title: "Not in your queue", message: error ?? "This text isn't waiting to be sent any more." };
  }
  return {
    send: false,
    removeFromQueue: false,
    title: "Couldn't check consent",
    message: status === null
      ? "Agent Runway checks each text's consent before it opens. Check your connection and try again."
      : error ?? "Agent Runway couldn't check this text's consent. Try again in a moment.",
  };
}
