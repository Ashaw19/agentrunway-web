import { describe, it, expect } from "vitest";
import { relativeTime } from "../relative-time";

const now = 1_000_000_000_000; // fixed anchor

describe("relativeTime", () => {
  it("reads 'just now' under 45 seconds", () => {
    expect(relativeTime(now, now)).toBe("just now");
    expect(relativeTime(now - 44_000, now)).toBe("just now");
  });

  it("switches to minutes at/after 45 seconds", () => {
    expect(relativeTime(now - 45_000, now)).toBe("1m ago");
    expect(relativeTime(now - 5 * 60_000, now)).toBe("5m ago");
    expect(relativeTime(now - 59 * 60_000, now)).toBe("59m ago");
  });

  it("switches to hours past 60 minutes", () => {
    expect(relativeTime(now - 90 * 60_000, now)).toBe("2h ago"); // rounds
    expect(relativeTime(now - 5 * 3_600_000, now)).toBe("5h ago");
  });

  it("switches to days past 24 hours", () => {
    expect(relativeTime(now - 25 * 3_600_000, now)).toBe("1d ago");
    expect(relativeTime(now - 3 * 86_400_000, now)).toBe("3d ago");
  });

  it("never goes negative when the anchor is in the future (clock skew)", () => {
    expect(relativeTime(now + 10_000, now)).toBe("just now");
  });
});
