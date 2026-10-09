import { describe, it, expect } from "vitest";
import type { ClientRecord } from "@agent-runway/core/types/database";
import {
  achievementBadgeIds,
  buildClientGroup,
  computeSourceStats,
  firstClassThreshold,
  repeatClientStats,
  rewardBudgetBasisGci,
} from "../client-groups";

/**
 * CRM client totals: collapsed deals earned nothing
 * =================================================
 * A client_records row with condition_status = 'collapsed' never closed, but
 * it can still carry a close_date and a GCI. Before this suite the Clients
 * page summed it anyway: Lifetime GCI, Total Deals, avg / deal, the First
 * Class / Frequent Flyer badges, client tiers, top clients, concentration %,
 * Lead source totals and the closing-gift budget all counted money that was
 * never earned, while the repeat rate and the hover sparkline (which already
 * skip collapsed deals) disagreed with them on the same screen.
 *
 * Rule (dashboard-integrity-champion, 2026-10-09): a deal counts unless it is
 * Collapsed. Undated deals still count: client_records only come from history
 * imports, so a missing close_date means the source sheet had no date, not that
 * the deal is still open. They are left off only what needs a date (last deal,
 * the GCI sparkline, anniversaries).
 *
 * Fixtures are COMPLETE ClientRecord objects (no `as` casts, repo rule).
 */

function deal(overrides: Partial<ClientRecord> & { id: string }): ClientRecord {
  return {
    user_id: "u1",
    client_id: "c1",
    name: "Pat Example",
    side: "buyer",
    source: "SOI",
    address: "1 Main St",
    close_date: "2024-05-01",
    year: 2024,
    gci: 10_000,
    notes: null,
    property_use: "primary_residence",
    bedrooms: null,
    bathrooms: null,
    garage: null,
    lot_acres: null,
    waterfront: null,
    square_feet: null,
    listing_url: null,
    condition_date: null,
    condition_status: "pending",
    import_external_id: null,
    edited_at: null,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("buildClientGroup: collapsed deals are not counted", () => {
  const closed = deal({ id: "r1", close_date: "2023-04-01", year: 2023, gci: 8_000 });
  const collapsed = deal({
    id: "r2",
    close_date: "2025-09-01",
    year: 2025,
    gci: 12_000,
    condition_status: "collapsed",
  });

  it("a collapsed deal adds no GCI and is not a deal", () => {
    const g = buildClientGroup("c1", "Pat Example", [closed, collapsed], false);
    expect(g.totalGCI).toBe(8_000);
    expect(g.dealCount).toBe(1);
    expect(g.avgDeal).toBe(8_000);
  });

  it("a newer collapsed deal is not the client's last deal", () => {
    const g = buildClientGroup("c1", "Pat Example", [closed, collapsed], false);
    expect(g.lastDeal).toBe("2023-04-01");
  });

  it("a collapsed deal's year is not an active year", () => {
    const g = buildClientGroup("c1", "Pat Example", [closed, collapsed], false);
    expect(g.years).toEqual([2023]);
  });

  it("the collapsed deal stays in the deal list so Deal History still shows it", () => {
    const g = buildClientGroup("c1", "Pat Example", [closed, collapsed], false);
    expect(g.deals.map((d) => d.id)).toEqual(["r1", "r2"]);
  });

  it("a client whose only deal collapsed has $0, no deals and no last deal", () => {
    const g = buildClientGroup("c1", "Pat Example", [collapsed], false);
    expect(g.totalGCI).toBe(0);
    expect(g.dealCount).toBe(0);
    expect(g.avgDeal).toBe(0);
    expect(g.lastDeal).toBeNull();
    expect(g.years).toEqual([]);
  });

  it("control: pending, firmed, waived and unset statuses all count", () => {
    const g = buildClientGroup(
      "c1",
      "Pat Example",
      [
        deal({ id: "a", condition_status: "pending", gci: 1_000 }),
        deal({ id: "b", condition_status: "firmed", gci: 2_000 }),
        deal({ id: "c", condition_status: "waived", gci: 3_000 }),
        deal({ id: "d", condition_status: null, gci: 4_000 }),
      ],
      false,
    );
    expect(g.totalGCI).toBe(10_000);
    expect(g.dealCount).toBe(4);
  });
});

describe("computeSourceStats: collapsed deals are not counted", () => {
  it("a collapsed deal adds no deal and no GCI to its source", () => {
    const stats = computeSourceStats([
      deal({ id: "r1", source: "SOI", gci: 6_000 }),
      deal({ id: "r2", source: "SOI", gci: 20_000, condition_status: "collapsed" }),
    ]);
    expect(stats).toEqual([{ source: "SOI", deals: 1, totalGCI: 6_000, avgGCI: 6_000 }]);
  });

  it("a source whose only deal collapsed is not listed (and is never the top source)", () => {
    const stats = computeSourceStats([
      deal({ id: "r1", source: "SOI", gci: 6_000 }),
      deal({ id: "r2", source: "Zillow", gci: 90_000, condition_status: "collapsed" }),
    ]);
    expect(stats.map((s) => s.source)).toEqual(["SOI"]);
  });
});

describe("rewardBudgetBasisGci: the closing gift is sized from a deal that closed", () => {
  it("uses the most recent deal that closed, not a newer collapsed one", () => {
    const basis = rewardBudgetBasisGci([
      deal({ id: "r1", close_date: "2023-04-01", gci: 8_000 }),
      deal({ id: "r2", close_date: "2025-09-01", gci: 30_000, condition_status: "collapsed" }),
    ]);
    expect(basis).toBe(8_000);
  });

  it("no budget when the client's only deal collapsed", () => {
    const basis = rewardBudgetBasisGci([
      deal({ id: "r1", close_date: "2025-09-01", gci: 30_000, condition_status: "collapsed" }),
    ]);
    expect(basis).toBeNull();
  });

  it("no budget when the client has no deals", () => {
    expect(rewardBudgetBasisGci([])).toBeNull();
  });
});

describe("achievementBadgeIds: badges come from deals that closed", () => {
  it("a collapsed $10K+ deal earns no High Yield badge", () => {
    const g = buildClientGroup(
      "c1",
      "Pat Example",
      [
        deal({ id: "r1", gci: 4_000 }),
        deal({ id: "r2", gci: 25_000, condition_status: "collapsed" }),
      ],
      false,
    );
    expect(achievementBadgeIds(g, 0)).not.toContain("high_yield");
  });

  it("one closed deal plus one collapsed deal is not a Frequent Flyer", () => {
    const g = buildClientGroup(
      "c1",
      "Pat Example",
      [deal({ id: "r1" }), deal({ id: "r2", condition_status: "collapsed" })],
      false,
    );
    expect(achievementBadgeIds(g, 0)).not.toContain("frequent_flyer");
  });

  it("control: two closed deals, one $10K+, earn Frequent Flyer and High Yield", () => {
    const g = buildClientGroup(
      "c1",
      "Pat Example",
      [deal({ id: "r1", gci: 12_000 }), deal({ id: "r2", gci: 3_000 })],
      false,
    );
    expect(achievementBadgeIds(g, 0)).toEqual(["high_yield", "frequent_flyer"]);
  });
});

describe("firstClassThreshold: the top-5% cut is set by closed GCI", () => {
  it("a client carried only by a collapsed deal does not set the First Class bar", () => {
    const groups = [
      buildClientGroup("big", "Big Collapse", [
        deal({ id: "x", client_id: "big", gci: 90_000, condition_status: "collapsed" }),
      ], false),
      buildClientGroup("a", "Client A", [deal({ id: "a1", client_id: "a", gci: 9_000 })], false),
      buildClientGroup("b", "Client B", [deal({ id: "b1", client_id: "b", gci: 4_000 })], false),
    ];
    expect(firstClassThreshold(groups)).toBe(9_000);
  });

  it("no First Class bar when nobody has closed GCI", () => {
    expect(firstClassThreshold([])).toBe(0);
  });
});

describe("undated and future-dated deals still count", () => {
  it("an undated deal adds GCI, a deal and its year, but is not the last deal", () => {
    const g = buildClientGroup(
      "c1",
      "Pat Example",
      [
        deal({ id: "r1", close_date: "2022-06-01", year: 2022, gci: 5_000 }),
        deal({ id: "r2", close_date: null, year: 2024, gci: 7_000 }),
      ],
      false,
    );
    expect(g.totalGCI).toBe(12_000);
    expect(g.dealCount).toBe(2);
    expect(g.years).toEqual([2024, 2022]);
    expect(g.lastDeal).toBe("2022-06-01");
  });

  it("a future-dated deal counts", () => {
    const g = buildClientGroup(
      "c1",
      "Pat Example",
      [deal({ id: "r1", close_date: "2099-01-01", year: 2099, gci: 3_000 })],
      false,
    );
    expect(g.totalGCI).toBe(3_000);
    expect(g.dealCount).toBe(1);
  });

  it("the gift budget uses the most recent dated deal, not an undated one", () => {
    const basis = rewardBudgetBasisGci([
      deal({ id: "r1", close_date: "2022-06-01", gci: 5_000 }),
      deal({ id: "r2", close_date: null, gci: 40_000 }),
    ]);
    expect(basis).toBe(5_000);
  });

  it("with no dated deal, the gift budget falls back to the average closed deal", () => {
    const basis = rewardBudgetBasisGci([
      deal({ id: "r1", close_date: null, gci: 4_000 }),
      deal({ id: "r2", close_date: null, gci: 8_000 }),
      deal({ id: "r3", close_date: null, gci: 90_000, condition_status: "collapsed" }),
    ]);
    expect(basis).toBe(6_000);
  });
});

describe("repeatClientStats: repeat rate counts the same deals as the totals", () => {
  const group = (id: string, deals: ClientRecord[]) =>
    buildClientGroup(id, id, deals.map((d) => ({ ...d, client_id: id })), false);

  it("one closed deal plus one collapsed deal is not a repeat client", () => {
    const stats = repeatClientStats([
      group("a", [deal({ id: "a1" }), deal({ id: "a2", condition_status: "collapsed" })]),
    ]);
    expect(stats).toEqual({ transactionalClients: 1, repeatCount: 0, repeatRate: 0 });
  });

  it("a client whose only deal collapsed is not in the denominator", () => {
    const stats = repeatClientStats([
      group("a", [deal({ id: "a1" }), deal({ id: "a2" })]),
      group("b", [deal({ id: "b1", condition_status: "collapsed" })]),
    ]);
    expect(stats).toEqual({ transactionalClients: 1, repeatCount: 1, repeatRate: 100 });
  });

  it("an undated deal makes a client transactional", () => {
    const stats = repeatClientStats([
      group("a", [deal({ id: "a1", close_date: null }), deal({ id: "a2" })]),
      group("b", [deal({ id: "b1", close_date: null })]),
    ]);
    expect(stats).toEqual({ transactionalClients: 2, repeatCount: 1, repeatRate: 50 });
  });

  it("no clients with deals: 0%, not NaN", () => {
    expect(repeatClientStats([])).toEqual({ transactionalClients: 0, repeatCount: 0, repeatRate: 0 });
  });
});
