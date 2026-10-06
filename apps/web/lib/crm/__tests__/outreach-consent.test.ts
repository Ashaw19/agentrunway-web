import { describe, it, expect } from "vitest";
import { lastClosedDealByClient, outreachChannel } from "../outreach-consent";

/**
 * CASL gate for Flight Control email drafts.
 *
 * Implied consent from a purchase lasts two years. When a past client's most
 * recent closed deal is older than that by the day the message would go out,
 * Flight Control offers a call instead of drafting an email.
 */

// Local-noon "today" so the suite is timezone-independent.
const TODAY = new Date(2026, 9, 6, 12); // 2026-10-06

describe("lastClosedDealByClient", () => {
  it("keeps the most recent close per client", () => {
    const map = lastClosedDealByClient([
      { client_id: "a", close_date: "2021-05-01", condition_status: "firmed" },
      { client_id: "a", close_date: "2025-03-10", condition_status: "firmed" },
      { client_id: "b", close_date: "2019-08-20", condition_status: null },
    ]);
    expect(map.get("a")).toBe("2025-03-10");
    expect(map.get("b")).toBe("2019-08-20");
  });

  it("ignores collapsed deals — a collapsed deal is not a purchase", () => {
    const map = lastClosedDealByClient([
      { client_id: "a", close_date: "2020-01-15", condition_status: "firmed" },
      { client_id: "a", close_date: "2026-06-01", condition_status: "collapsed" },
    ]);
    expect(map.get("a")).toBe("2020-01-15");
  });

  it("ignores records with no close date or no client", () => {
    const map = lastClosedDealByClient([
      { client_id: "a", close_date: null },
      { client_id: null, close_date: "2026-01-01" },
    ]);
    expect(map.size).toBe(0);
  });
});

describe("outreachChannel", () => {
  it("does not gate clients with no closed deal (consent basis unknown to the app)", () => {
    expect(outreachChannel(undefined, "2026-10-10", TODAY)).toBe("email");
  });

  it("allows email inside the two-year window", () => {
    expect(outreachChannel("2024-11-20", "2026-10-06", TODAY)).toBe("email");
  });

  it("offers a call once the last deal is more than two years old", () => {
    expect(outreachChannel("2024-08-01", "2026-10-06", TODAY)).toBe("call");
  });

  it("treats the exact two-year mark as lapsed", () => {
    expect(outreachChannel("2024-10-06", "2026-10-06", TODAY)).toBe("call");
    expect(outreachChannel("2024-10-07", "2026-10-06", TODAY)).toBe("email");
  });

  it("measures at the trigger date when it is in the future", () => {
    // Lapses 2026-10-15. A message meant for 10-20 goes out after that.
    expect(outreachChannel("2024-10-15", "2026-10-20", TODAY)).toBe("call");
    expect(outreachChannel("2024-10-15", "2026-10-10", TODAY)).toBe("email");
  });

  it("measures at today when the trigger date has already passed", () => {
    // Post-close lookbacks carry past trigger dates — the send is today.
    expect(outreachChannel("2024-10-01", "2026-09-20", TODAY)).toBe("call");
  });

  it("gates multi-year closing anniversaries with no newer deal", () => {
    // 5-year anniversary of the client's only deal.
    expect(outreachChannel("2021-10-12", "2026-10-12", TODAY)).toBe("call");
  });

  it("does not shift a day when the date-only value is parsed", () => {
    // Regression guard for the #268 class: a date-only string parsed as UTC
    // midnight lands on the previous local day west of Greenwich.
    expect(outreachChannel("2024-10-07", "2026-10-06", TODAY)).toBe("email");
  });
});
