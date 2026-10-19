/**
 * The phone's decision before iOS Messages opens with a queued text: send
 * only on the server's explicit yes; a consent refusal or a text that left
 * the queue takes it off the list; anything else (offline, a 5xx) fails
 * closed and keeps it queued.
 */
import { describe, expect, it } from "vitest";
import { textCheckOutcome } from "../queued-text-check";

describe("textCheckOutcome", () => {
  it("sends only on a 2xx with ok: true", () => {
    expect(textCheckOutcome(200, { ok: true })).toEqual({ send: true });
    expect(textCheckOutcome(200, { ok: false })).toMatchObject({ send: false });
    expect(textCheckOutcome(200, null)).toMatchObject({ send: false });
  });

  it("a consent refusal says call instead, with the server's reason, and drops the text", () => {
    const reason = "Sam unsubscribed from your texts on October 1, 2026, so Agent Runway won't draft a text.";
    expect(textCheckOutcome(403, { ok: false, code: "NO_CONSENT", error: reason })).toEqual({
      send: false, removeFromQueue: true, title: "Call instead", message: reason,
    });
  });

  it("a text no longer queued is dropped", () => {
    expect(textCheckOutcome(409, { ok: false, code: "NOT_QUEUED", error: "This was already sent." })).toMatchObject({ send: false, removeFromQueue: true });
    expect(textCheckOutcome(404, { ok: false, code: "NOT_FOUND" })).toMatchObject({ send: false, removeFromQueue: true });
  });

  it("fails closed and keeps the text queued with no answer, a server error or unreadable consent", () => {
    for (const [status, body] of [[null, null], [500, {}], [503, { ok: false, code: "CONSENT_UNREADABLE", error: "x" }], [401, { error: "Unauthorized" }]] as const) {
      const out = textCheckOutcome(status, body);
      expect(out).toMatchObject({ send: false, removeFromQueue: false });
    }
  });
});
