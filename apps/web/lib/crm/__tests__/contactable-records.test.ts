import { describe, it, expect } from "vitest";
import { contactableRecords } from "../contactable-records";

/**
 * Regression suite: archived clients must not generate AI outreach.
 *
 * Archiving writes only clients.archived_at — never clients.status, never
 * client_records. The detectors iterate client_records, so an archived client's
 * records stay eligible forever unless gated against the archived-filtered
 * client map. A 'deceased' or 'do_not_contact' archive leaking through here is
 * a real-world harm, not just a bad metric.
 */

// Stand-in for the archived-filtered `clients` fetch: archived clients are
// simply absent from this map, exactly as in the route.
const clientMap = new Map<string, { name: string }>([
  ["active-1", { name: "Jane Doe" }],
  ["active-2", { name: "Sam O'Brien" }],
]);

const rec = (client_id: string | null) => ({ id: `r-${client_id}`, client_id });

describe("contactableRecords", () => {
  it("drops records belonging to an archived client", () => {
    // "archived-1" was archived (deceased / do_not_contact) → absent from the map.
    const records = [rec("active-1"), rec("archived-1"), rec("active-2")];
    expect(contactableRecords(records, clientMap).map((r) => r.client_id)).toEqual([
      "active-1",
      "active-2",
    ]);
  });

  it("drops records with a null client_id — nobody to contact", () => {
    expect(contactableRecords([rec(null), rec("active-1")], clientMap)).toHaveLength(1);
  });

  it("keeps every record when all clients are active", () => {
    const records = [rec("active-1"), rec("active-2"), rec("active-1")];
    expect(contactableRecords(records, clientMap)).toHaveLength(3);
  });

  it("returns nothing when every client is archived", () => {
    const records = [rec("archived-1"), rec("archived-2")];
    expect(contactableRecords(records, clientMap)).toEqual([]);
  });

  it("returns nothing against an empty client map", () => {
    // Guards the degenerate case: a failed clients fetch must not open the gate.
    expect(contactableRecords([rec("active-1")], new Map())).toEqual([]);
  });

  it("handles an empty record set", () => {
    expect(contactableRecords([], clientMap)).toEqual([]);
  });

  it("preserves the full record shape, not just the id", () => {
    const records = [{ client_id: "active-1", close_date: "2025-07-25", gci: 14_500 }];
    expect(contactableRecords(records, clientMap)).toEqual([
      { client_id: "active-1", close_date: "2025-07-25", gci: 14_500 },
    ]);
  });
});
