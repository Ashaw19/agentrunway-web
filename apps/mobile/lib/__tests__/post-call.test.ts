/**
 * The after-call sheet (lib/post-call.ts): when the app comes back to the
 * front after a call placed from Next up, it asks how the call went, but only
 * if the app went to the background after the call was placed (R34: the
 * call itself takes the phone; cancelling iOS's "Call …?" prompt only makes
 * the app inactive for a moment), and only within 2 hours of dialling. A
 * pending call that never reached the background, or is older, is let go.
 */
import { describe, expect, it } from "vitest";
import { POST_CALL_WINDOW_MS, afterCallReturn, shouldAskAfterCall, telUrl } from "../post-call";

const MIN = 60_000;
const dialled = Date.UTC(2026, 9, 19, 15, 0, 0);
/** A call that took the phone: the app went to the background a second after dialling. */
const called = (at = dialled) => ({ at, backgroundedAt: at + 1_000 });

describe("shouldAskAfterCall", () => {
  it("asks within 2 hours of dialling, once the app went to the background", () => {
    expect(shouldAskAfterCall(called(), dialled + 5 * MIN)).toBe(true);
    expect(shouldAskAfterCall(called(), dialled + 119 * MIN)).toBe(true);
  });

  it("doesn't ask when the app never went to the background: the Call prompt was cancelled (R34)", () => {
    expect(shouldAskAfterCall({ at: dialled }, dialled + 5_000)).toBe(false);
    expect(shouldAskAfterCall({ at: dialled, backgroundedAt: null }, dialled + 5_000)).toBe(false);
  });

  it("doesn't count a background from before the call was placed", () => {
    expect(shouldAskAfterCall({ at: dialled, backgroundedAt: dialled - 1_000 }, dialled + 5 * MIN)).toBe(false);
  });

  it("doesn't ask past 2 hours", () => {
    expect(shouldAskAfterCall(called(), dialled + 121 * MIN)).toBe(false);
    expect(POST_CALL_WINDOW_MS).toBe(120 * MIN);
  });

  it("doesn't ask with no call waiting, or a call stamped after now", () => {
    expect(shouldAskAfterCall(null, dialled)).toBe(false);
    expect(shouldAskAfterCall(called(dialled + 10 * MIN), dialled)).toBe(false);
  });
});

describe("afterCallReturn: the app is back in front with a call waiting", () => {
  it("asks after a call that took the phone", () => {
    expect(afterCallReturn(called(), dialled + 3 * MIN)).toBe("ask");
  });

  it("lets go of a call whose prompt was cancelled, so a later trip away can't ask about it (R34)", () => {
    expect(afterCallReturn({ at: dialled }, dialled + 4_000)).toBe("clear");
  });

  it("lets go of a call past 2 hours", () => {
    expect(afterCallReturn(called(), dialled + 121 * MIN)).toBe("clear");
  });

  it("does nothing with no call waiting", () => {
    expect(afterCallReturn(null, dialled)).toBe("none");
  });
});

describe("telUrl", () => {
  it("dials the digits, keeping a leading +", () => {
    expect(telUrl("(506) 555-0101")).toBe("tel:5065550101");
    expect(telUrl("+1 506 555 0101")).toBe("tel:+15065550101");
  });

  it("is null with no digits to dial", () => {
    expect(telUrl(null)).toBeNull();
    expect(telUrl("  ")).toBeNull();
  });
});
