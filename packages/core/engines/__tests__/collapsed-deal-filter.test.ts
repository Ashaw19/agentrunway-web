import { describe, it, expect } from "vitest";
import { excludeCollapsedDeals } from "../../types/database";

/**
 * Canonical "this deal never closed" filter for client_records. Engines in
 * packages/core use it directly; it takes the minimal shape so web callers
 * with a narrower select can share it.
 */
describe("excludeCollapsedDeals", () => {
  it("drops collapsed deals and keeps every other condition status", () => {
    const deals = [
      { id: "a", condition_status: "collapsed" },
      { id: "b", condition_status: null },
      { id: "c", condition_status: "firmed" },
      { id: "d", condition_status: "waived" },
      { id: "e", condition_status: "pending" },
      { id: "f" },
    ];
    expect(excludeCollapsedDeals(deals).map((d) => d.id)).toEqual(["b", "c", "d", "e", "f"]);
  });

  it("returns an empty list for no deals", () => {
    expect(excludeCollapsedDeals([])).toEqual([]);
  });
});
