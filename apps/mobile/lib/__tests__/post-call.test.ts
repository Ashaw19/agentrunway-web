/**
 * The after-call sheet (lib/post-call.ts): when the app comes back to the
 * front after a call placed from Next up, it asks how the call went, but only
 * within 2 hours of dialling. An older pending call is let go.
 */
import { describe, expect, it } from "vitest";
import { POST_CALL_WINDOW_MS, shouldAskAfterCall, telUrl } from "../post-call";

const MIN = 60_000;
const dialled = Date.UTC(2026, 9, 19, 15, 0, 0);

describe("shouldAskAfterCall", () => {
  it("asks within 2 hours of dialling", () => {
    expect(shouldAskAfterCall({ at: dialled }, dialled + 5 * MIN)).toBe(true);
    expect(shouldAskAfterCall({ at: dialled }, dialled + 119 * MIN)).toBe(true);
  });

  it("doesn't ask past 2 hours", () => {
    expect(shouldAskAfterCall({ at: dialled }, dialled + 121 * MIN)).toBe(false);
    expect(POST_CALL_WINDOW_MS).toBe(120 * MIN);
  });

  it("doesn't ask with no call waiting, or a call stamped after now", () => {
    expect(shouldAskAfterCall(null, dialled)).toBe(false);
    expect(shouldAskAfterCall({ at: dialled + 10 * MIN }, dialled)).toBe(false);
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
