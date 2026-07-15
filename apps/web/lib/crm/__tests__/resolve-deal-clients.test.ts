import { describe, expect, it } from "vitest";
import { applyPrimaryOverrides, buildCoPartyRows, computeHouseholdActivityIds, planDealClients } from "../resolve-deal-clients";

const LIMIT = 200;

describe("planDealClients — attribution", () => {
  it("attributes a couple's deal to whichever party sorts first alphabetically", () => {
    // Deterministic tie-break, not word order: "jane smith" < "john smith".
    const plan = planDealClients(["John & Jane Smith"], LIMIT);
    expect(plan.primaryByRawName.get("John & Jane Smith")).toBe("Jane Smith");
    expect(plan.coPartiesByRawName.get("John & Jane Smith")).toEqual(["John Smith"]);
  });

  it("creates BOTH people as contacts even though only one holds the deal", () => {
    const plan = planDealClients(["John & Jane Smith"], LIMIT);
    expect(plan.allParties.sort()).toEqual(["Jane Smith", "John Smith"]);
  });

  it("produces exactly one primary per deal — never two rows for one deal", () => {
    // This is the no-double-count guarantee: a deal maps to ONE primary.
    const plan = planDealClients(["John & Jane Smith", "Bob and Mary Wilson"], LIMIT);
    expect(plan.primaryByRawName.size).toBe(2);
  });

  it("attributes an individual's deal to that individual, with no co-parties", () => {
    const plan = planDealClients(["John Smith"], LIMIT);
    expect(plan.primaryByRawName.get("John Smith")).toBe("John Smith");
    expect(plan.coPartiesByRawName.has("John Smith")).toBe(false);
  });

  it("keeps an organization whole and attributes to it", () => {
    const plan = planDealClients(["Smith & Sons Realty Ltd"], LIMIT);
    expect(plan.primaryByRawName.get("Smith & Sons Realty Ltd")).toBe("Smith & Sons Realty Ltd");
    expect(plan.allParties).toEqual(["Smith & Sons Realty Ltd"]);
    expect(plan.coPartiesByRawName.size).toBe(0);
  });

  it("handles a three-party deal: one primary, two co-parties, alphabetical", () => {
    // "bob smith" < "jane smith" < "john smith".
    const plan = planDealClients(["John & Jane & Bob Smith"], LIMIT);
    expect(plan.primaryByRawName.get("John & Jane & Bob Smith")).toBe("Bob Smith");
    expect(plan.coPartiesByRawName.get("John & Jane & Bob Smith")).toEqual([
      "Jane Smith",
      "John Smith",
    ]);
  });

  it("attributes the same couple to the same primary regardless of word order, within one batch", () => {
    const plan = planDealClients(["John & Jane Smith", "Jane & John Smith"], LIMIT);
    expect(plan.primaryByRawName.get("John & Jane Smith")).toBe("Jane Smith");
    expect(plan.primaryByRawName.get("Jane & John Smith")).toBe("Jane Smith");
  });

  it("attributes the same couple to the same primary across two separate calls (no shared state)", () => {
    const planA = planDealClients(["John & Jane Smith"], LIMIT);
    const planB = planDealClients(["Jane & John Smith"], LIMIT);
    expect(planA.primaryByRawName.get("John & Jane Smith")).toBe(
      planB.primaryByRawName.get("Jane & John Smith"),
    );
  });
});

describe("planDealClients — person deduplication", () => {
  it("dedupes the same person appearing across two deals", () => {
    const plan = planDealClients(["John Smith", "John Smith"], LIMIT);
    expect(plan.allParties).toEqual(["John Smith"]);
  });

  it("dedupes a person by match key, not raw spelling (case/whitespace)", () => {
    const plan = planDealClients(["John Smith", "  john   SMITH  "], LIMIT);
    expect(plan.allParties).toEqual(["John Smith"]);
  });

  it("dedupes a person who appears both solo and in a couple", () => {
    // John bought alone in 2019 and with Jane in 2021 — one John contact.
    const plan = planDealClients(["John Smith", "John & Jane Smith"], LIMIT);
    expect(plan.allParties.sort()).toEqual(["Jane Smith", "John Smith"]);
    expect(plan.primaryByRawName.size).toBe(2);
  });

  it("dedupes an accented name against its normalized twin (Acadian names)", () => {
    // toNameSearch strips diacritics, so these are the same person.
    const plan = planDealClients(["Réjean Thériault", "Rejean Theriault"], LIMIT);
    expect(plan.allParties).toHaveLength(1);
  });
});

describe("planDealClients — edge inputs", () => {
  it("ignores blank and whitespace-only names", () => {
    const plan = planDealClients(["", "   ", "John Smith"], LIMIT);
    expect(plan.allParties).toEqual(["John Smith"]);
    expect(plan.primaryByRawName.size).toBe(1);
  });

  it("returns an empty plan for no input", () => {
    const plan = planDealClients([], LIMIT);
    expect(plan.allParties).toEqual([]);
    expect(plan.primaryByRawName.size).toBe(0);
  });

  it("truncates each party to the field limit", () => {
    const plan = planDealClients(["Bartholomew & Wilhelmina Fotheringay"], 10);
    for (const p of plan.allParties) expect(p.length).toBeLessThanOrEqual(10);
  });

  it("does not collide two genuinely different people", () => {
    const plan = planDealClients(["John Smith", "Jane Doe"], LIMIT);
    expect(plan.allParties).toHaveLength(2);
  });
});

describe("applyPrimaryOverrides", () => {
  it("redirects a joint deal's primary to the persisted override", () => {
    const plan = planDealClients(["John & Jane Smith"], LIMIT);
    // Default (alphabetical) would be Jane; override says John.
    const johnKey = "john smith";
    const override = new Map([["jane smith", johnKey], [johnKey, johnKey]]);
    const overridden = applyPrimaryOverrides(plan, override);
    expect(overridden.primaryByRawName.get("John & Jane Smith")).toBe("John Smith");
    expect(overridden.coPartiesByRawName.get("John & Jane Smith")).toEqual(["Jane Smith"]);
  });

  it("never redirects a solo deal, even if that person has a household override", () => {
    // Jane is linked to John with John as household primary, but THIS deal
    // only names Jane alone — it must stay attributed to Jane.
    const plan = planDealClients(["Jane Smith"], LIMIT);
    const override = new Map([["jane smith", "john smith"], ["john smith", "john smith"]]);
    const overridden = applyPrimaryOverrides(plan, override);
    expect(overridden.primaryByRawName.get("Jane Smith")).toBe("Jane Smith");
    expect(overridden.coPartiesByRawName.has("Jane Smith")).toBe(false);
  });

  it("leaves the deterministic default in place when no override exists", () => {
    const plan = planDealClients(["John & Jane Smith"], LIMIT);
    const overridden = applyPrimaryOverrides(plan, new Map());
    expect(overridden.primaryByRawName.get("John & Jane Smith")).toBe("Jane Smith");
  });

  it("only redirects when the override target is actually named on this deal", () => {
    // An override exists for a totally unrelated pair — must not affect this deal.
    const plan = planDealClients(["John & Jane Smith"], LIMIT);
    const override = new Map([["bob wilson", "mary wilson"], ["mary wilson", "mary wilson"]]);
    const overridden = applyPrimaryOverrides(plan, override);
    expect(overridden.primaryByRawName.get("John & Jane Smith")).toBe("Jane Smith");
  });
});

describe("buildCoPartyRows", () => {
  it("builds one row per co-party, keyed to the deal's real client_records id", () => {
    const recordIdByExtId = new Map([["deal-1|c:john", "record-uuid-1"]]);
    const coPartyIdsByExtId = new Map([["deal-1|c:john", ["jane-uuid"]]]);
    const rows = buildCoPartyRows("user-1", recordIdByExtId, coPartyIdsByExtId);
    expect(rows).toEqual([
      { user_id: "user-1", client_record_id: "record-uuid-1", co_client_id: "jane-uuid" },
    ]);
  });

  it("builds multiple rows for a multi-party deal", () => {
    const recordIdByExtId = new Map([["deal-1", "record-1"]]);
    const coPartyIdsByExtId = new Map([["deal-1", ["co-a", "co-b"]]]);
    const rows = buildCoPartyRows("user-1", recordIdByExtId, coPartyIdsByExtId);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.co_client_id).sort()).toEqual(["co-a", "co-b"]);
  });

  it("produces nothing for a deal with no co-parties", () => {
    const recordIdByExtId = new Map([["deal-1", "record-1"]]);
    const rows = buildCoPartyRows("user-1", recordIdByExtId, new Map());
    expect(rows).toEqual([]);
  });

  it("skips a deal whose client_records id isn't known (e.g. an edited row that was skipped on re-import)", () => {
    const recordIdByExtId = new Map<string, string>(); // deal-1 not in this map
    const coPartyIdsByExtId = new Map([["deal-1", ["co-a"]]]);
    const rows = buildCoPartyRows("user-1", recordIdByExtId, coPartyIdsByExtId);
    expect(rows).toEqual([]);
  });
});

describe("computeHouseholdActivityIds", () => {
  it("returns the set of client ids that appear as a co-party on any deal", () => {
    const coParties = [
      { id: "1", user_id: "u", client_record_id: "r1", co_client_id: "jane", created_at: "" },
      { id: "2", user_id: "u", client_record_id: "r2", co_client_id: "bob", created_at: "" },
    ];
    expect(computeHouseholdActivityIds(coParties)).toEqual(new Set(["jane", "bob"]));
  });

  it("returns an empty set for no co-parties", () => {
    expect(computeHouseholdActivityIds([])).toEqual(new Set());
  });
});
