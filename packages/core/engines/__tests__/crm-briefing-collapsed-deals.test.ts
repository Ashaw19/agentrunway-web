/**
 * Intelligence Briefing + Source Funnel: collapsed deals are not closings
 * =======================================================================
 * A client_records row with condition_status = 'collapsed' never closed:
 * nobody moved in, nothing sold. It can still carry a close_date (the date
 * the deal was due to close), and before this suite the briefing treated
 * any close_date as a closing. That produced closing anniversaries, mortgage
 * renewal reminders, home-value milestones and "past client" check-ins for
 * deals that never happened, and a newer collapsed deal hid an older real
 * closing from the renewal rule (which keys on the most recent close).
 *
 * The source funnel had the same bug in its "closed" count.
 *
 * Time is pinned so the anniversary / renewal windows are deterministic.
 * Fixtures are COMPLETE Client / ClientRecord objects (no `as` casts, repo rule).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  computeIntelligenceBriefing,
  computeSourceFunnel,
} from "../crm-analytics-engine";
import type { Client, ClientRecord } from "../../types/database";

// Mid-June, local time. All windows below are computed from this instant.
const NOW = new Date(2026, 5, 15, 12, 0, 0);

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

function makeRecord(
  overrides: Partial<ClientRecord> & { id: string; client_id: string; close_date: string },
): ClientRecord {
  return {
    user_id: "u1",
    name: "Deal",
    side: "buyer",
    source: null,
    address: "1 Main St",
    year: Number(overrides.close_date.slice(0, 4)),
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
    condition_status: null,
    import_external_id: null,
    edited_at: null,
    created_at: iso(3000),
    updated_at: iso(1),
    ...overrides,
  };
}

type ConditionStatus = ClientRecord["condition_status"];

/** One client holding one deal; returns the briefing items of `type`. */
function itemsFor(
  type: string,
  closeDate: string,
  conditionStatus: ConditionStatus,
  clientOverrides: Partial<Client> = {},
) {
  const client = makeClient({ id: "c1", name: "Pat Example", ...clientOverrides });
  const record = makeRecord({
    id: "r1",
    client_id: "c1",
    close_date: closeDate,
    condition_status: conditionStatus,
  });
  return computeIntelligenceBriefing([client], [], [record]).items.filter(
    (i) => i.type === type,
  );
}

// Non-collapsed statuses a closed deal can carry. null is the common case
// (imports and most hand-entered history never set a condition).
const CLOSED_STATUSES: ConditionStatus[] = [null, "firmed", "waived"];

describe("computeIntelligenceBriefing: collapsed deals are not closings", () => {
  describe("closing_anniversary (2-year anniversary 5 days out)", () => {
    const CLOSE = "2024-06-20";

    it("a collapsed deal produces no closing anniversary", () => {
      expect(itemsFor("closing_anniversary", CLOSE, "collapsed")).toHaveLength(0);
    });

    it.each(CLOSED_STATUSES)("control: a closed deal (condition_status %s) does", (status) => {
      const items = itemsFor("closing_anniversary", CLOSE, status);
      expect(items).toHaveLength(1);
      expect(items[0].title).toContain("2-year closing anniversary");
    });
  });

  describe("property_value_milestone (1-year home anniversary ~3 weeks out)", () => {
    const CLOSE = "2025-07-05";

    it("a collapsed deal produces no home-value milestone", () => {
      expect(itemsFor("property_value_milestone", CLOSE, "collapsed")).toHaveLength(0);
    });

    it("control: a closed deal does", () => {
      const items = itemsFor("property_value_milestone", CLOSE, null);
      expect(items).toHaveLength(1);
      expect(items[0].title).toContain("1-year home anniversary in ");
    });
  });

  describe("mortgage_renewal_due (closed ~4.75 years ago)", () => {
    const CLOSE = "2021-09-15";

    it("a collapsed deal produces no renewal-due reminder", () => {
      expect(itemsFor("mortgage_renewal_due", CLOSE, "collapsed")).toHaveLength(0);
    });

    it("control: a closed deal does", () => {
      expect(itemsFor("mortgage_renewal_due", CLOSE, null)).toHaveLength(1);
    });
  });

  describe("mortgage_renewal_window (closed ~3.75 years ago)", () => {
    const CLOSE = "2022-09-15";

    it("a collapsed deal produces no renewal-window reminder", () => {
      expect(itemsFor("mortgage_renewal_window", CLOSE, "collapsed")).toHaveLength(0);
    });

    it("control: a closed deal does", () => {
      expect(itemsFor("mortgage_renewal_window", CLOSE, null)).toHaveLength(1);
    });
  });

  describe("past_client_check_in (Cruising, 180+ days without contact)", () => {
    // Old enough that no anniversary, milestone or renewal rule fires.
    const CLOSE = "2019-02-01";

    it("a client whose only deal collapsed is a long-term contact, not a past client", () => {
      const items = itemsFor("past_client_check_in", CLOSE, "collapsed");
      expect(items).toHaveLength(1);
      expect(items[0].title).toContain("long-term contact");
      expect(items[0].title).not.toContain("past client");
    });

    it("control: a client with a closed deal is a past client", () => {
      const items = itemsFor("past_client_check_in", CLOSE, null);
      expect(items).toHaveLength(1);
      expect(items[0].title).toContain("past client");
    });
  });

  it("a newer collapsed deal does not mask an older closed one for renewal", () => {
    // Real purchase ~4.75 years ago → renewal due. A later deal fell through
    // ~1.4 years ago. The renewal rule keys on the most recent close, so the
    // collapsed deal used to replace the real one and the reminder vanished.
    const client = makeClient({ id: "c1", name: "Pat Example" });
    const closed = makeRecord({ id: "r_closed", client_id: "c1", close_date: "2021-09-15" });
    const collapsed = makeRecord({
      id: "r_collapsed",
      client_id: "c1",
      close_date: "2025-01-10",
      condition_status: "collapsed",
    });

    const items = computeIntelligenceBriefing([client], [], [closed, collapsed]).items;
    const renewal = items.filter((i) => i.type === "mortgage_renewal_due");

    expect(renewal).toHaveLength(1);
    expect(renewal[0].id).toBe("renewal_due_c1_2021-09");
    expect(renewal[0].detail).toContain("September 2021");
  });

  it("a client with one collapsed and one closed deal is still a past client", () => {
    const client = makeClient({ id: "c1", name: "Pat Example" });
    const closed = makeRecord({ id: "r_closed", client_id: "c1", close_date: "2019-02-01" });
    const collapsed = makeRecord({
      id: "r_collapsed",
      client_id: "c1",
      close_date: "2020-02-01",
      condition_status: "collapsed",
    });

    const checkIn = computeIntelligenceBriefing([client], [], [closed, collapsed]).items.filter(
      (i) => i.type === "past_client_check_in",
    );
    expect(checkIn).toHaveLength(1);
    expect(checkIn[0].title).toContain("past client");
  });
});

describe("computeSourceFunnel: collapsed deals are not closings", () => {
  it("a lead whose only deal collapsed is not counted as closed", () => {
    const client = makeClient({ id: "c1", name: "Pat Example", lead_source: "SOI" });
    const record = makeRecord({
      id: "r1",
      client_id: "c1",
      close_date: "2025-03-01",
      condition_status: "collapsed",
    });

    const row = computeSourceFunnel([client], [record], []).rows.find((r) => r.source === "SOI");
    expect(row?.closed).toBe(0);
    expect(row?.closedPct).toBe(0);
  });

  it("control: a lead with a closed deal is counted as closed", () => {
    const client = makeClient({ id: "c1", name: "Pat Example", lead_source: "SOI" });
    const record = makeRecord({ id: "r1", client_id: "c1", close_date: "2025-03-01" });

    const row = computeSourceFunnel([client], [record], []).rows.find((r) => r.source === "SOI");
    expect(row?.closed).toBe(1);
    expect(row?.closedPct).toBe(100);
  });

  it("only the closed lead counts when a source has one closed and one collapsed", () => {
    const a = makeClient({ id: "a", name: "Client A", lead_source: "SOI" });
    const b = makeClient({ id: "b", name: "Client B", lead_source: "SOI" });
    const records = [
      makeRecord({ id: "ra", client_id: "a", close_date: "2025-03-01" }),
      makeRecord({
        id: "rb",
        client_id: "b",
        close_date: "2025-04-01",
        condition_status: "collapsed",
      }),
    ];

    const row = computeSourceFunnel([a, b], records, []).rows.find((r) => r.source === "SOI");
    expect(row?.closed).toBe(1);
    expect(row?.closedPct).toBe(50);
  });
});

describe("computeSourceFunnel: collapsed deals earned no GCI", () => {
  it("a collapsed deal's GCI is not added to the source total", () => {
    const client = makeClient({ id: "c1", name: "Pat Example", lead_source: "SOI" });
    const records = [
      makeRecord({ id: "r1", client_id: "c1", close_date: "2025-03-01", gci: 8_000 }),
      makeRecord({
        id: "r2",
        client_id: "c1",
        close_date: "2025-09-01",
        gci: 12_000,
        condition_status: "collapsed",
      }),
    ];

    const row = computeSourceFunnel([client], records, []).rows.find((r) => r.source === "SOI");
    expect(row?.totalGCI).toBe(8_000);
    expect(row?.avgGCI).toBe(8_000);
  });

  it("a source whose only deal collapsed shows $0 and is not the highest-GCI source", () => {
    const a = makeClient({ id: "a", name: "Client A", lead_source: "SOI" });
    const b = makeClient({ id: "b", name: "Client B", lead_source: "Zillow" });
    const records = [
      makeRecord({ id: "ra", client_id: "a", close_date: "2025-03-01", gci: 5_000 }),
      makeRecord({
        id: "rb",
        client_id: "b",
        close_date: "2025-04-01",
        gci: 50_000,
        condition_status: "collapsed",
      }),
    ];

    const result = computeSourceFunnel([a, b], records, []);
    expect(result.rows.find((r) => r.source === "Zillow")?.totalGCI).toBe(0);
    expect(result.highestGCI).toBe("SOI");
  });
});

describe("computeSourceFunnel: an undated deal is a closed deal", () => {
  // client_records only come from history imports; a null close_date means the
  // source sheet had no date. It still closed, so the funnel counts it the same
  // way the CRM's Lifetime GCI does (dashboard-integrity-champion, 2026-10-09).
  it("a lead whose only deal has no close date is counted as closed, with its GCI", () => {
    const client = makeClient({ id: "c1", name: "Pat Example", lead_source: "SOI" });
    const record = { ...makeRecord({ id: "r1", client_id: "c1", close_date: "2024-01-01", gci: 7_000 }), close_date: null };

    const row = computeSourceFunnel([client], [record], []).rows.find((r) => r.source === "SOI");
    expect(row?.closed).toBe(1);
    expect(row?.totalGCI).toBe(7_000);
    expect(row?.avgGCI).toBe(7_000);
  });

  it("avg GCI is per closed client: every client whose GCI counts is in Closed", () => {
    const a = makeClient({ id: "a", name: "Client A", lead_source: "SOI" });
    const b = makeClient({ id: "b", name: "Client B", lead_source: "SOI" });
    const records = [
      makeRecord({ id: "a1", client_id: "a", close_date: "2024-01-01", gci: 6_000 }),
      { ...makeRecord({ id: "b1", client_id: "b", close_date: "2024-01-01", gci: 4_000 }), close_date: null },
    ];

    const row = computeSourceFunnel([a, b], records, []).rows.find((r) => r.source === "SOI");
    expect(row?.closed).toBe(2);
    expect(row?.totalGCI).toBe(10_000);
    expect(row?.avgGCI).toBe(5_000);
  });
});
