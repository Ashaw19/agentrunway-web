/**
 * Today's briefing: the ✕ is saved (briefing_dismissals, 00192)
 * ==============================================================
 * Andrew (2026-11-17) dismissed every item in the CRM tab's briefing, then
 * refreshed, and they all came back: the ✕ was page state only. Each item now
 * carries a dismissKey, and computeIntelligenceBriefing leaves dismissed keys
 * out BEFORE its caps, so with more than ten check-ins waiting the next one
 * moves up (his choice, the same 2026-11-17).
 *
 * Fixtures are COMPLETE Client / ContactActivity objects (no `as` casts, repo rule).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { briefingDismissKey, computeIntelligenceBriefing } from "../crm-analytics-engine";
import type { Client, ContactActivity } from "../../types/database";

const NOW = new Date(2026, 10, 17, 12, 0, 0);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

function iso(daysAgo: number): string {
  return new Date(NOW.getTime() - daysAgo * 86_400_000).toISOString();
}

function makeClient(overrides: Partial<Client> & { id: string; name: string }): Client {
  return {
    user_id: "u1",
    name_search: overrides.name.toLowerCase(),
    first_name: null,
    last_name: null,
    email: "x@example.com",
    phone: "506-555-0100",
    birthdate: null,
    tags: [],
    lead_source: null,
    last_contact_at: null,
    notes: null,
    status: "cruising",
    city: null,
    province_region: null,
    street_address: null,
    unit_number: null,
    postal_code: null,
    country: "Canada",
    phone_type: "mobile",
    secondary_email: null,
    secondary_phone: null,
    secondary_phone_type: "mobile",
    property_interest: null,
    property_interest_type: "budget",
    timeframe: null,
    preferred_contact: "phone",
    first_contacted_at: iso(2000),
    archived_at: null,
    archive_reason: null,
    communication_tone: "friendly",
    buyer_pre_approved: null,
    buyer_pre_approval_amount: null,
    buyer_financing_type: null,
    buyer_target_close_date: null,
    buyer_target_area: null,
    imported_at: null,
    scheduled_for: null,
    scheduled_phrase: null,
    engagement_score: 0,
    engagement_updated_at: null,
    created_at: iso(3000),
    updated_at: iso(1),
    ...overrides,
  };
}

function makeActivity(clientId: string, daysAgo: number, id = `a_${clientId}_${daysAgo}`): ContactActivity {
  return {
    id,
    user_id: "u1",
    client_id: clientId,
    type: "call",
    description: "Call",
    activity_date: iso(daysAgo),
    created_at: iso(daysAgo),
  };
}

/** n long-term contacts with no contact logged, named so they sort c01, c02, ... */
function longTermContacts(n: number): Client[] {
  return Array.from({ length: n }, (_, i) => {
    const id = `c${String(i + 1).padStart(2, "0")}`;
    return makeClient({ id, name: `Contact ${id}`, first_contacted_at: null });
  });
}

const checkIns = (items: { type: string }[]) => items.filter((i) => i.type === "past_client_check_in");

describe("briefing dismissKey", () => {
  it("a check-in with no contact logged is keyed to 'none'", () => {
    const [c] = longTermContacts(1);
    const { items } = computeIntelligenceBriefing([c], [], []);
    expect(checkIns(items)).toHaveLength(1);
    expect(items[0].dismissKey).toBe(`checkin_${c.id}@none`);
  });

  it("a check-in is keyed to the last contact's day", () => {
    const c = makeClient({ id: "c1", name: "Lapsed" });
    const act = makeActivity(c.id, 400);
    const { items } = computeIntelligenceBriefing([c], [act], []);
    expect(items[0].dismissKey).toBe(`checkin_c1@${act.activity_date.slice(0, 10)}`);
  });

  it("items that already name their occurrence keep their id", () => {
    expect(briefingDismissKey({ id: "bday_c1_2026", type: "birthday_soon" })).toBe("bday_c1_2026");
    expect(briefingDismissKey({ id: "ann_c1_2019-11", type: "closing_anniversary" })).toBe("ann_c1_2019-11");
    expect(briefingDismissKey({ id: "timeframe_c1", type: "timeframe_approaching" }, { timeframe: "asap" })).toBe("timeframe_c1@asap");
  });

  it("with nothing dismissed every item carries a key and the list is unchanged", () => {
    const clients = longTermContacts(3);
    const a = computeIntelligenceBriefing(clients, [], []);
    const b = computeIntelligenceBriefing(clients, [], [], undefined, new Date(), { dismissedKeys: new Set() });
    expect(a.items.every((i) => i.dismissKey.length > 0)).toBe(true);
    expect(b.items.map((i) => i.dismissKey)).toEqual(a.items.map((i) => i.dismissKey));
  });
});

describe("dismissed briefing items stay dismissed", () => {
  it("a dismissed check-in is left out, and the counts follow", () => {
    const clients = longTermContacts(3);
    const first = computeIntelligenceBriefing(clients, [], []);
    const gone = first.items[0].dismissKey;
    const after = computeIntelligenceBriefing(clients, [], [], undefined, new Date(), { dismissedKeys: new Set([gone]) });
    expect(after.items.map((i) => i.dismissKey)).not.toContain(gone);
    expect(after.totalCount).toBe(first.totalCount - 1);
    expect(after.attentionCount + after.upcomingCount + after.urgentCount).toBe(after.totalCount);
  });

  it("with more than ten check-ins waiting, dismissing the ten shown moves the next ones up", () => {
    const clients = longTermContacts(15);
    const first = computeIntelligenceBriefing(clients, [], []);
    expect(checkIns(first.items)).toHaveLength(10);
    const shown = new Set(first.items.map((i) => i.dismissKey));
    const after = computeIntelligenceBriefing(clients, [], [], undefined, new Date(), { dismissedKeys: shown });
    const next = checkIns(after.items) as { dismissKey: string }[];
    expect(next).toHaveLength(5);
    expect(next.some((i) => shown.has(i.dismissKey))).toBe(false);
  });

  it("when every check-in is dismissed the briefing is empty", () => {
    const clients = longTermContacts(4);
    const keys = new Set(computeIntelligenceBriefing(clients, [], []).items.map((i) => i.dismissKey));
    const after = computeIntelligenceBriefing(clients, [], [], undefined, new Date(), { dismissedKeys: keys });
    expect(after.totalCount).toBe(0);
  });

  it("logging a contact ends the dismissal: once quiet again, the check-in comes back", () => {
    const c = makeClient({ id: "c1", name: "Lapsed" });
    const old = makeActivity(c.id, 400);
    const before = computeIntelligenceBriefing([c], [old], []);
    const dismissed = new Set([before.items[0].dismissKey]);
    expect(computeIntelligenceBriefing([c], [old], [], undefined, new Date(), { dismissedKeys: dismissed }).totalCount).toBe(0);
    // A newer contact, itself 200 days ago: the client has gone quiet again since.
    const newer = makeActivity(c.id, 200);
    const later = computeIntelligenceBriefing([c], [old, newer], [], undefined, new Date(), { dismissedKeys: dismissed });
    expect(checkIns(later.items)).toHaveLength(1);
  });
});

describe("Dismiss all check-ins", () => {
  it("checkInsDue lists every check-in due, past the ten shown", () => {
    const clients = longTermContacts(15);
    const r = computeIntelligenceBriefing(clients, [], []);
    expect(checkIns(r.items)).toHaveLength(10);
    expect(r.checkInsDue).toHaveLength(15);
    expect(new Set(r.checkInsDue.map((t) => t.clientId)).size).toBe(15);
  });

  it("dismissing every key in checkInsDue leaves no check-ins", () => {
    const clients = longTermContacts(15);
    const keys = new Set(computeIntelligenceBriefing(clients, [], []).checkInsDue.map((t) => t.dismissKey));
    const after = computeIntelligenceBriefing(clients, [], [], undefined, new Date(), { dismissedKeys: keys });
    expect(checkIns(after.items)).toHaveLength(0);
    expect(after.checkInsDue).toHaveLength(0);
  });

  it("checkInsDue holds only check-ins", () => {
    const vip = makeClient({ id: "v1", name: "VIP", tags: ["VIP"], status: "boarding" });
    const r = computeIntelligenceBriefing([vip, ...longTermContacts(2)], [], []);
    expect(r.items.some((i) => i.type === "vip_overdue")).toBe(true);
    expect(r.checkInsDue.map((t) => t.clientId).sort()).toEqual(["c01", "c02"]);
  });
});

