import { describe, expect, it } from "vitest";
import {
  clusterDuplicateClients,
  findPossibleDuplicatePairs,
  firstNamesAgree,
  pairKey,
  pickSuggestedPrimary,
  type ClusterableClient,
} from "../duplicate-detection";
import { clusterNameKey } from "../client-identity";

function client(
  id: string,
  name: string,
  email: string | null,
  phone: string | null,
  createdAt: string,
): ClusterableClient {
  return { id, name, email, phone, created_at: createdAt };
}

describe("clusterNameKey", () => {
  it("folds the curly right-single-quote that toNameSearch leaves alone", () => {
    expect(clusterNameKey("O’Brien")).toBe("o'brien");
  });
});

describe("clusterDuplicateClients", () => {
  it("returns no clusters when every client is distinct", () => {
    const clients = [
      client("1", "Alice Anderson", "alice@example.com", "5065551111", "2026-01-01"),
      client("2", "Bob Baker", "bob@example.com", "5065552222", "2026-01-02"),
    ];
    expect(clusterDuplicateClients(clients)).toEqual([]);
  });

  it("clusters two clients sharing a normalized name", () => {
    const clients = [
      client("1", "Bob Smith", null, null, "2026-01-01"),
      client("2", "  bob   SMITH  ", null, null, "2026-01-02"),
    ];
    const clusters = clusterDuplicateClients(clients);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].clientIds.sort()).toEqual(["1", "2"]);
    expect(clusters[0].matchedOn).toEqual(["name"]);
  });

  it("clusters two clients sharing an email but with different-looking names", () => {
    const clients = [
      client("1", "Robert Chen", "r.chen@example.com", null, "2026-01-01"),
      client("2", "Bob Chen", "R.CHEN@Example.com", null, "2026-01-02"),
    ];
    const clusters = clusterDuplicateClients(clients);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].matchedOn).toEqual(["email"]);
  });

  it("clusters two clients sharing a phone in different formats", () => {
    const clients = [
      client("1", "Jane Doe", null, "(506) 645-1559", "2026-01-01"),
      client("2", "J. Doe", null, "+1 506 645 1559", "2026-01-02"),
    ];
    const clusters = clusterDuplicateClients(clients);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].matchedOn).toEqual(["phone"]);
  });

  it("transitively chains a cluster across different match reasons", () => {
    // A and B share a phone; B and C share an email; A and C share nothing
    // directly. All three must end up in ONE cluster.
    const clients = [
      client("a", "Client A", "a@example.com", "5065551111", "2026-01-01"),
      client("b", "Client B", "shared@example.com", "5065551111", "2026-01-02"),
      client("c", "Client C", "shared@example.com", "5065559999", "2026-01-03"),
    ];
    const clusters = clusterDuplicateClients(clients);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].clientIds.sort()).toEqual(["a", "b", "c"]);
    expect(clusters[0].matchedOn.sort()).toEqual(["email", "phone"]);
  });

  it("does not cluster clients with no email/phone and different names", () => {
    const clients = [
      client("1", "Alice", null, null, "2026-01-01"),
      client("2", "Alicia", null, null, "2026-01-02"),
    ];
    expect(clusterDuplicateClients(clients)).toEqual([]);
  });

  it("ignores empty-string email/phone rather than clustering on blanks", () => {
    const clients = [
      client("1", "Alice", "", "", "2026-01-01"),
      client("2", "Bob", "", "", "2026-01-02"),
    ];
    expect(clusterDuplicateClients(clients)).toEqual([]);
  });

  it("handles a large-ish flat list without pairwise blow-up (perf sanity)", () => {
    const clients: ClusterableClient[] = Array.from({ length: 500 }, (_, i) =>
      client(String(i), `Distinct Person ${i}`, `person${i}@example.com`, null, "2026-01-01"),
    );
    // Two real duplicates hidden in the middle.
    clients.push(client("dup1", "Real Duplicate", "dup@example.com", null, "2026-01-01"));
    clients.push(client("dup2", "Real Duplicate", "dup@example.com", null, "2026-01-02"));
    const clusters = clusterDuplicateClients(clients);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].clientIds.sort()).toEqual(["dup1", "dup2"]);
  });

  it("sorts larger clusters first", () => {
    const clients = [
      client("1", "Pair One", "pair1@example.com", null, "2026-01-01"),
      client("2", "Pair One", "pair1@example.com", null, "2026-01-02"),
      client("3", "Trio", "trio@example.com", null, "2026-01-01"),
      client("4", "Trio", "trio@example.com", null, "2026-01-02"),
      client("5", "Trio", "trio@example.com", null, "2026-01-03"),
    ];
    const clusters = clusterDuplicateClients(clients);
    expect(clusters[0].clientIds).toHaveLength(3);
    expect(clusters[1].clientIds).toHaveLength(2);
  });
});

describe("pickSuggestedPrimary", () => {
  it("picks the earliest-created client as the suggested primary", () => {
    const clients = [
      client("1", "Bob Smith", null, null, "2026-03-01"),
      client("2", "Bob Smith", null, null, "2026-01-15"),
      client("3", "Bob Smith", null, null, "2026-02-10"),
    ];
    expect(pickSuggestedPrimary(clients, ["1", "2", "3"])).toBe("2");
  });

  it("prefers a record with a real name over one named with an email address (the merge keeps the primary's name)", () => {
    const clients = [
      client("old", "bob.smith@example.com", "bob.smith@example.com", null, "2025-01-01"),
      client("new", "Robert Smith", null, "5065550100", "2026-10-27"),
    ];
    expect(pickSuggestedPrimary(clients, ["old", "new"])).toBe("new");
  });

  it("throws if none of the given ids match any client (misuse guard)", () => {
    const clients = [client("1", "Bob", null, null, "2026-01-01")];
    expect(() => pickSuggestedPrimary(clients, ["not-in-list"])).toThrow();
  });
});

/**
 * Near-matches (2026-10-27): Andrew imported 103 iPhone contacts and asked
 * for email-only clients to be consolidated with the same people's phone
 * cards. Exact clustering never pairs "Bob Smith <bob@…>" with "Robert
 * Smith 506-…". These are suggestions only; nothing merges on its own.
 */
describe("firstNamesAgree", () => {
  it.each([
    ["robert", "robert"], ["rob", "robert"], ["robert", "bob"], ["bill", "william"],
    ["mike", "michael"], ["j", "john"], ["kate", "katherine"], ["jeanguy", "jean"],
  ])("%s / %s agree", (a, b) => expect(firstNamesAgree(a, b)).toBe(true));

  it.each([["jane", "john"], ["mark", "mike"], ["al", "alan"], ["", "john"], ["chris", "christian"].reverse() as [string, string]])(
    "%s / %s",
    (a, b) => {
      // "al"/"alan" is a listed nickname; a two-letter start alone isn't enough.
      const expected = (a === "al" && b === "alan") || (a === "christian" && b === "chris");
      expect(firstNamesAgree(a, b)).toBe(expected);
    },
  );
});

describe("findPossibleDuplicatePairs", () => {
  const near = (clients: ClusterableClient[], dismissed: string[] = []) =>
    findPossibleDuplicatePairs(clients, clusterDuplicateClients(clients), new Set(dismissed));

  it("an email-only client and the same person's phone card, by nickname", () => {
    const pairs = near([
      client("e", "Bob Smith", "bob@example.com", null, "2025-03-01"),
      client("p", "Robert Smith", null, "506-555-0100", "2026-10-27"),
    ]);
    expect(pairs).toEqual([{ clientIds: ["e", "p"], reasons: ["contact_split", "same_last_name", "first_names_match"] }]);
  });

  it("an email-only card named with its address, matched by the name in the address", () => {
    const pairs = near([
      client("e", "jsmith@example.com", "jsmith@example.com", null, "2025-03-01"),
      client("p", "John Smith", null, "506-555-0100", "2026-10-27"),
    ]);
    expect(pairs).toEqual([{ clientIds: ["e", "p"], reasons: ["contact_split", "email_has_name"] }]);
  });

  it("uses the first and last name columns when they're set", () => {
    const pairs = near([
      { ...client("e", "Smith, Robert", "rsmith@example.com", null, "2025-03-01"), first_name: "Robert", last_name: "Smith" },
      client("p", "Bob Smith", null, "506-555-0100", "2026-10-27"),
    ]);
    expect(pairs.map((p) => p.clientIds)).toEqual([["e", "p"]]);
  });

  it("two people sharing a surname are not suggested: Jane and John Smith", () => {
    expect(near([
      client("e", "Jane Smith", "jsmith@example.com", null, "2025-03-01"),
      client("p", "John Smith", null, "506-555-0100", "2026-10-27"),
    ])).toEqual([]);
    expect(near([
      client("1", "Mark Doyle", null, "506-555-0101", "2025-03-01"),
      client("2", "Mike Doyle", null, "506-555-0102", "2026-10-27"),
    ])).toEqual([]);
  });

  it("the same first and last name with different numbers is a suggestion, not a split", () => {
    const pairs = near([
      client("1", "Dave Leblanc", null, "506-555-0101", "2025-03-01"),
      client("2", "David LeBlanc", null, "506-555-0102", "2026-10-27"),
    ]);
    expect(pairs).toEqual([{ clientIds: ["1", "2"], reasons: ["same_last_name", "first_names_match"] }]);
  });

  it("leaves exact matches to the exact clusters", () => {
    expect(near([
      client("1", "Bob Smith", "bob@example.com", null, "2025-03-01"),
      client("2", "Bob Smith", null, "506-555-0100", "2026-10-27"),
    ])).toEqual([]);
  });

  it("a pair marked 'Not the same person' isn't suggested again", () => {
    const clients = [
      client("e", "Bob Smith", "bob@example.com", null, "2025-03-01"),
      client("p", "Robert Smith", null, "506-555-0100", "2026-10-27"),
    ];
    expect(near(clients, [pairKey("p", "e")])).toEqual([]);
  });

  it("email-and-phone splits come first", () => {
    const pairs = near([
      client("a1", "Dave Leblanc", null, "506-555-0101", "2025-03-01"),
      client("a2", "David Leblanc", null, "506-555-0102", "2025-03-02"),
      client("z1", "Bob Smith", "bob@example.com", null, "2025-03-01"),
      client("z2", "Robert Smith", null, "506-555-0100", "2026-10-27"),
    ]);
    expect(pairs.map((p) => p.clientIds[0])).toEqual(["z1", "a1"]);
  });

  it("never chains: two near-matches don't make a third", () => {
    const pairs = near([
      client("1", "Rob Smith", "rob@example.com", null, "2025-03-01"),
      client("2", "Robert Smith", null, "506-555-0100", "2026-10-27"),
      client("3", "Bert Smith", null, "506-555-0199", "2026-10-27"),
    ]);
    for (const p of pairs) expect(p.clientIds).toHaveLength(2);
  });

  it("stays quick on a large list", () => {
    // Names are letters only (digits are ignored when comparing names).
    const word = (n: number) => { let w = ""; do { w += String.fromCharCode(97 + (n % 26)); n = Math.floor(n / 26); } while (n > 0); return w; };
    const many: ClusterableClient[] = Array.from({ length: 3000 }, (_, i) =>
      client(String(i), `Fn${word(i)} Ln${word(i % 900)}`, i % 2 ? `x${word(i)}@example.com` : null, i % 2 ? null : `50655${String(i).padStart(5, "0")}`, "2026-01-01"),
    );
    const t = performance.now();
    near(many);
    expect(performance.now() - t).toBeLessThan(2000);
  });
});
