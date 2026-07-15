import { describe, expect, it } from "vitest";
import { planDealClients } from "../resolve-deal-clients";

const LIMIT = 200;

describe("planDealClients — attribution", () => {
  it("attributes a couple's deal to the first-named party only", () => {
    const plan = planDealClients(["John & Jane Smith"], LIMIT);
    expect(plan.primaryByRawName.get("John & Jane Smith")).toBe("John Smith");
    expect(plan.coPartiesByRawName.get("John & Jane Smith")).toEqual(["Jane Smith"]);
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

  it("handles a three-party deal: one primary, two co-parties", () => {
    const plan = planDealClients(["John & Jane & Bob Smith"], LIMIT);
    expect(plan.primaryByRawName.get("John & Jane & Bob Smith")).toBe("John Smith");
    expect(plan.coPartiesByRawName.get("John & Jane & Bob Smith")).toEqual([
      "Jane Smith",
      "Bob Smith",
    ]);
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
