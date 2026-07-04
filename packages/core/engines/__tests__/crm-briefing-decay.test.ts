/**
 * Intelligence Briefing — relationship_decay rule (rule 3b)
 * =========================================================
 * Verifies the rhythm-based decay integration: a client whose contact
 * cadence breaks triggers a relationship_decay item, SLA rules keep
 * precedence, and import suppression applies.
 *
 * Fixtures are COMPLETE Client objects (no `as` casts — repo rule).
 */

import { describe, it, expect } from "vitest";
import { computeIntelligenceBriefing } from "../crm-analytics-engine";
import type { Client, ContactActivity } from "../../types/database";

const NOW = Date.now();

function iso(daysAgo: number): string {
  return new Date(NOW - daysAgo * 86_400_000).toISOString();
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
    first_contacted_at: iso(200),
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
    created_at: iso(300),
    updated_at: iso(1),
    ...overrides,
  };
}

function activityRun(clientId: string, daysAgoList: number[]): ContactActivity[] {
  return daysAgoList.map((d, i) => ({
    id: `${clientId}_act_${i}`,
    user_id: "u1",
    client_id: clientId,
    type: "call",
    description: "",
    activity_date: iso(d),
    created_at: iso(d),
  }));
}

describe("computeIntelligenceBriefing — relationship_decay", () => {
  it("flags a client whose own rhythm has broken (ratio ≥ 3 → urgent)", () => {
    // Weekly rhythm (gaps of 7d), then 21+ days of silence → ratio ≥ 3
    const client = makeClient({ id: "c1", name: "Rhythm Breaker" });
    const acts = activityRun("c1", [43, 36, 29, 22]); // gaps 7,7,7; last 22d ago
    const result = computeIntelligenceBriefing([client], acts, []);
    const decay = result.items.find((i) => i.type === "relationship_decay");
    expect(decay).toBeDefined();
    expect(decay!.severity).toBe("urgent");
    expect(decay!.clientId).toBe("c1");
    expect(decay!.daysValue).toBe(22);
  });

  it("classifies moderate rhythm break (2x–3x) as attention", () => {
    const client = makeClient({ id: "c2", name: "Cooling Off" });
    const acts = activityRun("c2", [36, 29, 22, 15]); // gaps 7,7,7; last 15d → ratio ~2.1
    const result = computeIntelligenceBriefing([client], acts, []);
    const decay = result.items.find((i) => i.type === "relationship_decay");
    expect(decay).toBeDefined();
    expect(decay!.severity).toBe("attention");
  });

  it("does not flag a client still inside their normal rhythm", () => {
    const client = makeClient({ id: "c3", name: "On Cadence" });
    const acts = activityRun("c3", [21, 14, 7, 2]); // last contact 2d ago
    const result = computeIntelligenceBriefing([client], acts, []);
    expect(result.items.find((i) => i.type === "relationship_decay")).toBeUndefined();
  });

  it("requires 3+ activities — sparse history cannot trigger decay", () => {
    const client = makeClient({ id: "c4", name: "Sparse History" });
    const acts = activityRun("c4", [60, 30]); // only 2 activities
    const result = computeIntelligenceBriefing([client], acts, []);
    expect(result.items.find((i) => i.type === "relationship_decay")).toBeUndefined();
  });

  it("yields precedence to SLA rules under the one-item-per-client cap", () => {
    // VIP with both decay pattern AND 14d+ silence → only the VIP item
    const client = makeClient({ id: "c5", name: "Vip Decayer", tags: ["VIP"] });
    const acts = activityRun("c5", [43, 36, 29, 22]);
    const result = computeIntelligenceBriefing([client], acts, []);
    const types = result.items.filter((i) => i.clientId === "c5").map((i) => i.type);
    expect(types).toContain("vip_overdue");
    expect(types).not.toContain("relationship_decay");
  });

  it("suppresses decay for freshly imported clients (grace window)", () => {
    const client = makeClient({
      id: "c6",
      name: "Just Imported",
      imported_at: iso(2), // inside 7-day grace
    });
    const acts = activityRun("c6", [43, 36, 29, 22]);
    const result = computeIntelligenceBriefing([client], acts, []);
    expect(result.items.find((i) => i.type === "relationship_decay")).toBeUndefined();
  });

  it("skips archived clients entirely", () => {
    const client = makeClient({ id: "c7", name: "Archived", archived_at: iso(5) });
    const acts = activityRun("c7", [43, 36, 29, 22]);
    const result = computeIntelligenceBriefing([client], acts, []);
    expect(result.items.filter((i) => i.clientId === "c7")).toHaveLength(0);
  });
});
