import { describe, it, expect } from "vitest";
import type { ClientRecord, ClientRecordCoParty } from "../../types/database";
import {
  buildAllGroups,
  CLIENTS_TABLE_DEFAULT_SORT,
  computeHouseholdActivityIds,
  dominantSide,
  isArchivedClient,
  sortTableGroups,
  type GroupableClient,
} from "../client-groups";

/**
 * Per-client deal totals and the Clients table sort, in core since 2026-10-19
 * so the phone's Clients list ranks top clients by the web's own rule. The
 * web suite (apps/web/lib/crm/__tests__/client-groups.test.ts) still covers
 * the totals; this one covers grouping, the default order and the helpers
 * that moved with it. Synthetic names only. Fixtures are complete
 * ClientRecord objects (no `as` casts, repo rule).
 */

function deal(overrides: Partial<ClientRecord> & { id: string }): ClientRecord {
  return {
    user_id: "u1",
    client_id: null,
    name: "Sample Person",
    side: "buyer",
    source: "SOI",
    address: "1 Test Rd",
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

function client(id: string, name: string, nameSearch = name.toLowerCase()): GroupableClient {
  return { id, name, name_search: nameSearch };
}

function coParty(recordId: string, coClientId: string): ClientRecordCoParty {
  return {
    id: `cp-${recordId}-${coClientId}`,
    user_id: "u1",
    client_record_id: recordId,
    co_client_id: coClientId,
    created_at: "2024-01-01T00:00:00Z",
  };
}

describe("buildAllGroups: which deals a client holds", () => {
  it("a deal belongs to its client_id, else to the contact whose name_search matches, else a row of its own", () => {
    const clients = [client("a", "Avery Sample"), client("b", "Blake Léger", "blake leger")];
    const records = [
      deal({ id: "r1", client_id: "a", name: "Someone Else", gci: 4_000 }),
      // No client_id: matched on toNameSearch (case, spacing, accent folded).
      deal({ id: "r2", name: "  BLAKE   Léger ", gci: 6_000 }),
      deal({ id: "r3", name: "Unlisted Buyer", gci: 9_000 }),
    ];
    const groups = buildAllGroups(clients, records, []);
    const byKey = new Map(groups.map((g) => [g.clientId ?? `ghost:${g.name}`, g]));
    expect(byKey.get("a")?.totalGCI).toBe(4_000);
    expect(byKey.get("b")?.totalGCI).toBe(6_000);
    expect(byKey.get("ghost:Unlisted Buyer")?.totalGCI).toBe(9_000);
    expect(groups).toHaveLength(3);
  });

  it("a collapsed deal earns nothing; an undated deal counts", () => {
    const groups = buildAllGroups(
      [client("a", "Avery Sample")],
      [
        deal({ id: "r1", client_id: "a", gci: 8_000 }),
        deal({ id: "r2", client_id: "a", gci: 50_000, condition_status: "collapsed" }),
        deal({ id: "r3", client_id: "a", gci: 2_000, close_date: null, year: null }),
      ],
      [],
    );
    expect(groups[0].totalGCI).toBe(10_000);
    expect(groups[0].dealCount).toBe(2);
    expect(groups[0].deals).toHaveLength(3);
  });

  it("a co-party is flagged for Household Activity but holds no GCI", () => {
    const clients = [client("p", "Jordan Testcase"), client("s", "Riley Testcase")];
    const records = [deal({ id: "r1", client_id: "p", gci: 20_000 })];
    const withCoParty = buildAllGroups(clients, records, [coParty("r1", "s")]);
    const spouse = withCoParty.find((g) => g.clientId === "s");
    expect(spouse?.hasHouseholdActivity).toBe(true);
    expect(spouse?.totalGCI).toBe(0);
    expect(withCoParty.find((g) => g.clientId === "p")?.totalGCI).toBe(20_000);
    // Co-parties change no total and no position.
    const without = buildAllGroups(clients, records, []);
    expect(withCoParty.map((g) => [g.clientId, g.totalGCI])).toEqual(without.map((g) => [g.clientId, g.totalGCI]));
  });

  it("every contact is listed, with or without deals", () => {
    const groups = buildAllGroups([client("a", "Avery Sample"), client("n", "Nodeal Person")], [], []);
    expect(groups.map((g) => g.clientId).sort()).toEqual(["a", "n"]);
    expect(groups.every((g) => g.totalGCI === 0)).toBe(true);
  });
});

describe("the Clients table's default order", () => {
  it("is Lifetime GCI, highest first", () => {
    expect(CLIENTS_TABLE_DEFAULT_SORT).toEqual({ col: "gci", dir: "desc" });
  });

  it("ranks by GCI, an exact tie by name A to Z, contacts without GCI A to Z after", () => {
    const clients = [
      client("m", "Morgan Sample"),
      client("z", "Zed Nodeal"),
      client("x", "Alex Sample"),
      client("j", "Jordan Testcase"),
      client("d", "Drew Nodeal"),
    ];
    const records = [
      deal({ id: "r1", client_id: "m", gci: 12_000 }),
      deal({ id: "r2", client_id: "x", gci: 12_000 }),
      deal({ id: "r3", client_id: "j", gci: 20_000 }),
    ];
    const sorted = sortTableGroups(
      buildAllGroups(clients, records, []),
      CLIENTS_TABLE_DEFAULT_SORT.col,
      CLIENTS_TABLE_DEFAULT_SORT.dir,
    );
    expect(sorted.map((g) => g.name)).toEqual([
      "Jordan Testcase",
      "Alex Sample",
      "Morgan Sample",
      "Drew Nodeal",
      "Zed Nodeal",
    ]);
  });

  it("a column sort keeps the order it ties in (stable)", () => {
    const groups = buildAllGroups(
      [client("a", "Avery Sample"), client("b", "Blake Sample"), client("c", "Casey Sample")],
      [
        deal({ id: "r1", client_id: "a", gci: 5_000 }),
        deal({ id: "r2", client_id: "b", gci: 5_000 }),
        deal({ id: "r3", client_id: "c", gci: 5_000 }),
      ],
      [],
    );
    expect(sortTableGroups(groups, "gci", "desc").map((g) => g.clientId)).toEqual(["a", "b", "c"]);
    expect(sortTableGroups(groups, "gci", "asc").map((g) => g.clientId)).toEqual(["a", "b", "c"]);
    expect(sortTableGroups(groups, "name", "desc").map((g) => g.clientId)).toEqual(["c", "b", "a"]);
  });
});

describe("helpers that moved with the groups", () => {
  it("dominantSide is the most common side, null without one", () => {
    expect(dominantSide([deal({ id: "1", side: "seller" }), deal({ id: "2", side: "seller" }), deal({ id: "3" })])).toBe("seller");
    expect(dominantSide([deal({ id: "1", side: null })])).toBeNull();
    expect(dominantSide([])).toBeNull();
  });

  it("isArchivedClient: in the Hangar when archived_at is set", () => {
    expect(isArchivedClient({ archived_at: "2026-09-01T00:00:00Z" })).toBe(true);
    expect(isArchivedClient({ archived_at: null })).toBe(false);
    expect(isArchivedClient({})).toBe(false);
  });

  it("computeHouseholdActivityIds lists every co-party once", () => {
    expect(computeHouseholdActivityIds([coParty("r1", "s"), coParty("r2", "s"), coParty("r3", "t")])).toEqual(new Set(["s", "t"]));
    expect(computeHouseholdActivityIds([])).toEqual(new Set());
  });
});
