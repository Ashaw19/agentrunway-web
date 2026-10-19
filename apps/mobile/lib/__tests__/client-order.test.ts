/**
 * The phone's Clients list puts top clients first in the web Clients table's
 * default order (2026-10-19). The web order here is not retyped: it is the
 * table's own buildAllGroups + sortTableGroups(CLIENTS_TABLE_DEFAULT_SORT)
 * from core, given what the web page reads (co-parties included, clients by
 * name then id). Synthetic names only; complete ClientRecord fixtures.
 */
import { describe, it, expect } from "vitest";
import {
  buildAllGroups,
  CLIENTS_TABLE_DEFAULT_SORT,
  sortTableGroups,
} from "@agent-runway/core/lib/client-groups";
import { toNameSearch } from "@agent-runway/core/lib/client-identity";
import type { ClientRecord, ClientRecordCoParty } from "@agent-runway/core/types/database";
import { orderTopClientsFirst, topClients, type OrderableClient } from "../client-order";

type Row = OrderableClient & { name_search: string; status: string };

function row(id: string, name: string, lastContact: string | null, status = "cruising"): Row {
  return { id, name, name_search: toNameSearch(name), last_contact_at: lastContact, status };
}

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

// ── Fixture ──────────────────────────────────────────────────────────────────
const clients: Row[] = [
  // Household: the deal is on Jordan; Riley is its co-party (no GCI).
  row("c-jordan", "Jordan Testcase", "2026-01-10T15:00:00+00:00"),
  row("c-riley", "Riley Testcase", "2026-10-01T15:00:00+00:00"),
  // A $50,000 collapsed deal must not lift Casey above the $12,000 pair.
  row("c-casey", "Casey Fixture", "2026-09-01T15:00:00+00:00", "in_flight"),
  // GCI tie at $12,000: Alex before Morgan (A to Z), though Morgan was contacted later.
  row("c-morgan", "Morgan Sample", "2026-10-18T15:00:00+00:00", "boarding"),
  row("c-alex", "Alex Sample", "2025-03-01T15:00:00+00:00"),
  // Deal recorded without a client_id, matched on the name.
  row("c-quinn", "Quinn Placeholder", null),
  // Undated deal: still counts.
  row("c-sam", "Sam Undated", "2024-06-01T15:00:00+00:00"),
  // No GCI: a $0 deal, and three contacts with no deals.
  row("c-pat", "Pat Zerogci", "2026-05-05T15:00:00+00:00"),
  row("c-taylor", "Taylor Nodeal", "2026-10-19T12:00:00+00:00", "boarding"),
  row("c-emery", "Emery Nodeal", "2025-12-24T15:00:00+00:00"),
  row("c-drew", "Drew Nodeal", null),
  row("c-blair", "Blair Nodeal", null),
];

const records: ClientRecord[] = [
  deal({ id: "r-household", client_id: "c-jordan", name: "Jordan & Riley Testcase", gci: 20_000 }),
  deal({ id: "r-casey-1", client_id: "c-casey", name: "Casey Fixture", gci: 8_000 }),
  deal({ id: "r-casey-2", client_id: "c-casey", name: "Casey Fixture", gci: 50_000, condition_status: "collapsed" }),
  deal({ id: "r-morgan", client_id: "c-morgan", name: "Morgan Sample", gci: 12_000 }),
  deal({ id: "r-alex-1", client_id: "c-alex", name: "Alex Sample", gci: 7_000 }),
  deal({ id: "r-alex-2", client_id: "c-alex", name: "Alex Sample", gci: 5_000, year: 2022, close_date: "2022-08-01" }),
  deal({ id: "r-quinn", client_id: null, name: "QUINN  Placeholder", gci: 5_000 }),
  deal({ id: "r-sam", client_id: "c-sam", name: "Sam Undated", gci: 3_000, close_date: null, year: null }),
  deal({ id: "r-pat", client_id: "c-pat", name: "Pat Zerogci", gci: 0 }),
  // Matches no contact: its own row on web, not a contact on the phone.
  deal({ id: "r-ghost", client_id: null, name: "Unlisted Buyer", gci: 30_000 }),
];

const coParties: ClientRecordCoParty[] = [
  { id: "cp-1", user_id: "u1", client_record_id: "r-household", co_client_id: "c-riley", created_at: "2024-01-01T00:00:00Z" },
];

/** The web Clients table's default order, from what crm/page.tsx reads. */
function webDefaultOrder(cl: Row[], recs: ClientRecord[], cps: ClientRecordCoParty[]) {
  const webFetchOrder = [...cl].sort((a, b) => a.name.localeCompare(b.name) || (a.id < b.id ? -1 : 1));
  return sortTableGroups(
    buildAllGroups(webFetchOrder, recs, cps),
    CLIENTS_TABLE_DEFAULT_SORT.col,
    CLIENTS_TABLE_DEFAULT_SORT.dir,
  );
}

const ids = (list: { id: string }[]) => list.map((c) => c.id);

describe("phone Clients list: top clients first, as on web", () => {
  const top = topClients(clients, records);
  const phone = orderTopClientsFirst(clients, top);
  const web = webDefaultOrder(clients, records, coParties);
  const webTop = web.filter((g) => g.clientId && g.totalGCI > 0);

  it("lists the contacts with GCI in exactly the web table's default order", () => {
    expect(ids(phone).slice(0, webTop.length)).toEqual(webTop.map((g) => g.clientId));
    expect(ids(phone).slice(0, webTop.length)).toEqual([
      "c-jordan", // $20,000 household deal
      "c-alex", //   $12,000 tie, A to Z
      "c-morgan", // $12,000 tie
      "c-casey", //  $8,000 (the $50,000 collapsed deal earned nothing)
      "c-quinn", //  $5,000 matched on the name
      "c-sam", //    $3,000 undated
    ]);
  });

  it("shows the same lifetime GCI the web table shows", () => {
    expect([...top.gciById]).toEqual(webTop.map((g) => [g.clientId, g.totalGCI]));
  });

  it("puts everyone without GCI after them by most recent contact, never contacted last (A to Z)", () => {
    const tail = ids(phone).slice(webTop.length);
    // Same people as web's $0 contacts (web lists them A to Z).
    expect([...tail].sort()).toEqual(
      web.filter((g) => g.clientId && !(g.totalGCI > 0)).map((g) => g.clientId).sort(),
    );
    expect(tail).toEqual(["c-taylor", "c-riley", "c-pat", "c-emery", "c-blair", "c-drew"]);
  });

  it("leaves out deal rows that match no contact, and moves no one for them", () => {
    expect(web.some((g) => g.clientId === null && g.totalGCI === 30_000)).toBe(true);
    expect(phone).toHaveLength(clients.length);
    expect(top.rankById.size).toBe(webTop.length);
  });

  it("co-parties don't change the order (the phone doesn't read them)", () => {
    const webWithout = webDefaultOrder(clients, records, []);
    expect(webWithout.map((g) => g.clientId)).toEqual(web.map((g) => g.clientId));
  });

  it("keeps the same order inside the Active and Cruising tabs and a search", () => {
    const position = new Map(ids(phone).map((id, i) => [id, i]));
    const inOrder = (list: Row[]) => ids(list).every((id, i, a) => i === 0 || position.get(a[i - 1])! < position.get(id)!);
    const active = orderTopClientsFirst(clients.filter((c) => c.status !== "cruising"), top);
    const cruising = orderTopClientsFirst(clients.filter((c) => c.status === "cruising"), top);
    const search = orderTopClientsFirst(clients.filter((c) => c.name.toLowerCase().includes("sample")), top);
    expect(ids(active)).toEqual(["c-morgan", "c-casey", "c-taylor"]);
    expect(ids(search)).toEqual(["c-alex", "c-morgan"]);
    expect(inOrder(active) && inOrder(cruising) && inOrder(search)).toBe(true);
  });

  it("doesn't depend on the order the rows were read in", () => {
    const shuffled = orderTopClientsFirst([...clients].reverse(), topClients([...clients].reverse(), [...records].reverse()));
    expect(ids(shuffled)).toEqual(ids(phone));
  });

  it("two contacts with the same name and the same GCI stay in the web's order", () => {
    const twins = [row("c-b2", "Jamie Same", null), row("c-a1", "Jamie Same", null)];
    const twinDeals = [
      deal({ id: "t1", client_id: "c-b2", name: "Jamie Same", gci: 9_000 }),
      deal({ id: "t2", client_id: "c-a1", name: "Jamie Same", gci: 9_000 }),
    ];
    const phoneTwins = orderTopClientsFirst(twins, topClients(twins, twinDeals));
    expect(ids(phoneTwins)).toEqual(webDefaultOrder(twins, twinDeals, []).map((g) => g.clientId));
  });

  it("an unsaved client (no name_search yet) still holds the deal recorded under its name", () => {
    const unsaved: OrderableClient[] = [{ id: "temp_1", name: "Quinn Placeholder", last_contact_at: null }];
    const t = topClients(unsaved, [deal({ id: "r1", name: "quinn placeholder", gci: 4_000 })]);
    expect(t.gciById.get("temp_1")).toBe(4_000);
  });
});
