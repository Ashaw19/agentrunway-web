/**
 * Today's Actions Engine
 * ======================
 * Ranking behaviour: urgency-band dominance, dollar tiebreaks, the
 * buyer-prospect/pipeline-deal dedupe, and the one-action-per-client cap.
 */

import { describe, it, expect } from "vitest";
import {
  computeTodaysActions,
  type TodayOpportunityInput,
  type TodayDealInput,
} from "../today-actions-engine";
import type { BriefingItem } from "../crm-analytics-engine";
import type { PipelineDeal } from "../../types/database";

const AS_OF = new Date("2026-07-04T12:00:00Z");

function iso(daysFromNow: number): string {
  return new Date(AS_OF.getTime() + daysFromNow * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

function makeBriefingItem(overrides: Partial<BriefingItem> & { id: string; clientId: string }): BriefingItem {
  return {
    type: "vip_overdue",
    severity: "urgent",
    clientName: "Client " + overrides.clientId,
    title: "title",
    detail: "detail",
    ...overrides,
  };
}

function makeOpportunity(
  overrides: Partial<TodayOpportunityInput> & { id: string }
): TodayOpportunityInput {
  return {
    opportunity_type: "listing_appointment",
    status: "open",
    estimated_price: 500_000,
    estimated_commission_pct: 0.025,
    close_odds_pct: 0.5,
    expected_close_date: null,
    lost_reason: null,
    opportunity_date: iso(-5),
    updated_at: new Date(AS_OF).toISOString(),
    title: "123 Main St",
    client_id: null,
    ...overrides,
  };
}

function makeDeal(overrides: Partial<PipelineDeal> & { id: string }): TodayDealInput {
  const deal: PipelineDeal = {
    user_id: "u1",
    address: "456 Oak Ave",
    estimated_price: 600_000,
    estimated_commission_pct: 0.025,
    side: "buyer",
    stage: "offer",
    expected_close_date: null,
    client_name: "Deal Client",
    notes: "",
    probability_override: null,
    client_id: null,
    original_estimated_price: null,
    lost_reason: null,
    lost_at: null,
    created_at: new Date(AS_OF).toISOString(),
    updated_at: new Date(AS_OF).toISOString(),
    ...overrides,
  };
  return { deal, title: deal.address, clientId: deal.client_id };
}

describe("computeTodaysActions", () => {
  it("urgent briefing item outranks a mid-urgency opportunity regardless of dollars", () => {
    const actions = computeTodaysActions({
      briefingItems: [makeBriefingItem({ id: "b1", clientId: "c1", severity: "urgent" })],
      opportunities: [makeOpportunity({ id: "o1", estimated_price: 2_000_000 })],
      deals: [],
      clientGciById: { c1: 8_000 },
      asOf: AS_OF,
    });
    expect(actions[0].source).toBe("briefing");
    expect(actions[1].source).toBe("opportunity");
  });

  it("within the same urgency band, higher dollars win", () => {
    // attention briefing (65) and firm deal closing soon (55+20=75) share band 1;
    // the deal's weighted GCI (600k×2.5%×0.9 override) dwarfs the client GCI.
    const actions = computeTodaysActions({
      briefingItems: [makeBriefingItem({ id: "b1", clientId: "c1", severity: "attention" })],
      opportunities: [],
      deals: [
        makeDeal({
          id: "d1",
          stage: "firm",
          expected_close_date: iso(7),
          probability_override: 0.9,
        }),
      ],
      clientGciById: { c1: 500 },
      asOf: AS_OF,
    });
    expect(actions[0].source).toBe("deal");
  });

  it("dedupes a buyer prospect that is also a pipeline deal (shared id)", () => {
    const sharedId = "pd-123";
    const actions = computeTodaysActions({
      briefingItems: [],
      opportunities: [
        makeOpportunity({ id: sharedId, opportunity_type: "buyer_prospect", title: "Jane Buyer" }),
      ],
      deals: [makeDeal({ id: sharedId, stage: "offer", expected_close_date: iso(5) })],
      clientGciById: {},
      asOf: AS_OF,
    });
    const matching = actions.filter((a) => a.refId === sharedId);
    expect(matching).toHaveLength(1);
    // Offer stage + closing soon (75+20=95, band 2) beats opportunity base (50)
    expect(matching[0].source).toBe("deal");
  });

  it("caps at one action per client", () => {
    const actions = computeTodaysActions({
      briefingItems: [
        makeBriefingItem({ id: "b1", clientId: "c1", severity: "urgent" }),
        makeBriefingItem({ id: "b2", clientId: "c1", severity: "attention", type: "birthday_soon" }),
      ],
      opportunities: [],
      deals: [],
      clientGciById: { c1: 10_000 },
      asOf: AS_OF,
    });
    expect(actions.filter((a) => a.clientId === "c1")).toHaveLength(1);
    expect(actions[0].refId).toBe("b1");
  });

  it("excludes converted and lost opportunities", () => {
    const actions = computeTodaysActions({
      briefingItems: [],
      opportunities: [
        makeOpportunity({ id: "o1", status: "converted" }),
        makeOpportunity({ id: "o2", status: "lost" }),
        makeOpportunity({ id: "o3", status: "open" }),
      ],
      deals: [],
      clientGciById: {},
      asOf: AS_OF,
    });
    expect(actions).toHaveLength(1);
    expect(actions[0].refId).toBe("o3");
  });

  it("boosts stale opportunities above fresh identical ones", () => {
    const actions = computeTodaysActions({
      briefingItems: [],
      opportunities: [
        makeOpportunity({ id: "fresh", opportunity_date: iso(-3) }),
        makeOpportunity({ id: "stale", opportunity_date: iso(-40) }),
      ],
      deals: [],
      clientGciById: {},
      asOf: AS_OF,
    });
    expect(actions[0].refId).toBe("stale");
    expect(actions[0].detail).toContain("without movement");
  });
});
