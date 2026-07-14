import { describe, expect, it } from "vitest";
import {
  clusterDuplicateClients,
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

  it("throws if none of the given ids match any client (misuse guard)", () => {
    const clients = [client("1", "Bob", null, null, "2026-01-01")];
    expect(() => pickSuggestedPrimary(clients, ["not-in-list"])).toThrow();
  });
});
