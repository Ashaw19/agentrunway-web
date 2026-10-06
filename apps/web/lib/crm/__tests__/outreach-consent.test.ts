import { describe, it, expect } from "vitest";
import {
  emailConsentLapsedReason,
  lapsedPastClients,
  lastClosedDealByClient,
  outreachChannel,
  withCoBuyerDeals,
} from "../outreach-consent";

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

describe("emailConsentLapsedReason", () => {
  const reason = emailConsentLapsedReason("Sam Lee", "2023-05-01");

  it("names the client and when their last deal closed", () => {
    expect(reason).toContain("Sam Lee");
    expect(reason).toContain("May 2023");
  });

  it("states the CASL two-year rule and offers a call", () => {
    expect(reason).toMatch(/CASL/);
    expect(reason).toMatch(/2 years/);
    expect(reason).toMatch(/call|phone/i);
  });

  it("says the app has no record of express consent", () => {
    expect(reason).toMatch(/express/i);
  });

  it("states the rule without prescriptive or legal-advice wording", () => {
    expect(reason).not.toMatch(/\b(should|must|recommend|need to)\b/i);
    expect(reason).not.toContain("—");
  });

  it("does not shift the month for a first-of-month close date", () => {
    // #268 class: "2023-05-01" parsed as UTC midnight is April 30 west of Greenwich.
    expect(emailConsentLapsedReason("Sam", "2023-05-01")).not.toContain("April");
  });
});

describe("lapsedPastClients", () => {
  it("lists past clients whose most recent closed deal is two or more years old", () => {
    const ids = lapsedPastClients([
      { client_id: "old",    close_date: "2021-04-01", condition_status: "firmed" },
      { client_id: "recent", close_date: "2025-08-15", condition_status: "firmed" },
      { client_id: "repeat", close_date: "2019-06-01", condition_status: "firmed" },
      { client_id: "repeat", close_date: "2025-01-10", condition_status: null },
    ], TODAY);
    expect(ids).toEqual(["old"]);
  });

  it("ignores collapsed deals when finding the most recent purchase", () => {
    const ids = lapsedPastClients([
      { client_id: "a", close_date: "2022-02-01", condition_status: "firmed" },
      { client_id: "a", close_date: "2026-05-01", condition_status: "collapsed" },
      { client_id: "b", close_date: "2026-05-01", condition_status: "collapsed" },
    ], TODAY);
    expect(ids).toEqual(["a"]);
  });

  it("treats the exact two-year mark as lapsed", () => {
    expect(lapsedPastClients([{ client_id: "a", close_date: "2024-10-06" }], TODAY)).toEqual(["a"]);
    expect(lapsedPastClients([{ client_id: "a", close_date: "2024-10-07" }], TODAY)).toEqual([]);
  });
});

describe("withCoBuyerDeals", () => {
  // A couple's deal is one client_records row held by one spouse (#257).
  // The other spouse is linked through client_record_co_parties.
  const deals = [
    { id: "r1", client_id: "pat", close_date: "2021-04-01", condition_status: "firmed" },
  ];

  it("credits a co-buyer with the deal they were named on", () => {
    const map = lastClosedDealByClient(
      withCoBuyerDeals(deals, [{ client_record_id: "r1", co_client_id: "jo" }]),
    );
    expect(map.get("jo")).toBe("2021-04-01");
    expect(map.get("pat")).toBe("2021-04-01");
  });

  it("puts a lapsed co-buyer on the lapsed list", () => {
    const ids = lapsedPastClients(
      withCoBuyerDeals(deals, [{ client_record_id: "r1", co_client_id: "jo" }]),
      TODAY,
    );
    expect(ids).toEqual(["jo", "pat"]);
  });

  it("keeps a co-buyer's own newer deal as their most recent", () => {
    const map = lastClosedDealByClient(withCoBuyerDeals(
      [...deals, { id: "r2", client_id: "jo", close_date: "2025-09-01", condition_status: "firmed" }],
      [{ client_record_id: "r1", co_client_id: "jo" }],
    ));
    expect(map.get("jo")).toBe("2025-09-01");
  });

  it("does not credit a collapsed deal to the co-buyer", () => {
    const map = lastClosedDealByClient(withCoBuyerDeals(
      [{ id: "r1", client_id: "pat", close_date: "2021-04-01", condition_status: "collapsed" }],
      [{ client_record_id: "r1", co_client_id: "jo" }],
    ));
    expect(map.has("jo")).toBe(false);
  });

  it("ignores co-party links to deals that aren't in the list", () => {
    const map = lastClosedDealByClient(
      withCoBuyerDeals(deals, [{ client_record_id: "missing", co_client_id: "jo" }]),
    );
    expect(map.has("jo")).toBe(false);
  });
});
