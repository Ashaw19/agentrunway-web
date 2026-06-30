import { describe, expect, it } from "vitest";
import {
  effectiveOdds,
  OPPORTUNITY_DEFAULT_ODDS,
  type OpportunityRow,
} from "../opportunity-conversion-engine";

function row(o: Partial<OpportunityRow>): OpportunityRow {
  return {
    id: "x",
    opportunity_type: "listing_appointment",
    status: "open",
    estimated_price: 400_000,
    estimated_commission_pct: 0.025,
    close_odds_pct: null,
    expected_close_date: null,
    lost_reason: null,
    opportunity_date: "2026-06-30",
    updated_at: "2026-06-30T00:00:00Z",
    ...o,
  };
}

describe("effectiveOdds", () => {
  it("returns close_odds_pct when set", () => {
    expect(effectiveOdds(row({ close_odds_pct: 0.66 }))).toBe(0.66);
  });

  it("falls back to listing default when null", () => {
    expect(effectiveOdds(row({ opportunity_type: "listing_appointment", close_odds_pct: null })))
      .toBe(OPPORTUNITY_DEFAULT_ODDS.listing_appointment);
  });

  it("falls back to buyer default when null", () => {
    expect(effectiveOdds(row({ opportunity_type: "buyer_prospect", close_odds_pct: null })))
      .toBe(OPPORTUNITY_DEFAULT_ODDS.buyer_prospect);
  });

  it("falls back to referral default when null", () => {
    expect(effectiveOdds(row({ opportunity_type: "referral", close_odds_pct: null })))
      .toBe(OPPORTUNITY_DEFAULT_ODDS.referral);
  });

  it("treats close_odds_pct=0 as explicit zero (not null)", () => {
    expect(effectiveOdds(row({ close_odds_pct: 0 }))).toBe(0);
  });
});

import { computeOpportunityWeightedGci } from "../opportunity-conversion-engine";

describe("computeOpportunityWeightedGci", () => {
  it("returns 0 for empty input", () => {
    expect(computeOpportunityWeightedGci([])).toBe(0);
  });

  it("only sums open rows (excludes converted and lost)", () => {
    const rows = [
      row({ id: "1", status: "open",      estimated_price: 400_000, estimated_commission_pct: 0.025, close_odds_pct: 0.5 }),
      row({ id: "2", status: "converted", estimated_price: 400_000, estimated_commission_pct: 0.025, close_odds_pct: 0.9 }),
      row({ id: "3", status: "lost",      estimated_price: 400_000, estimated_commission_pct: 0.025, close_odds_pct: 0.5 }),
    ];
    // only row 1: 400000 * 0.025 * 0.5 = 5000
    expect(computeOpportunityWeightedGci(rows)).toBe(5_000);
  });

  it("uses effective odds (null falls back to type default)", () => {
    const rows = [
      row({ opportunity_type: "listing_appointment", close_odds_pct: null, estimated_price: 400_000, estimated_commission_pct: 0.025 }),
      row({ opportunity_type: "buyer_prospect",      close_odds_pct: null, estimated_price: 500_000, estimated_commission_pct: 0.025 }),
    ];
    // listing: 400000 * 0.025 * 0.40 = 4000
    // buyer:   500000 * 0.025 * 0.25 = 3125
    expect(computeOpportunityWeightedGci(rows)).toBe(7_125);
  });

  it("treats null price or commission as zero contribution", () => {
    const rows = [
      row({ estimated_price: null,      estimated_commission_pct: 0.025, close_odds_pct: 0.5 }),
      row({ estimated_price: 400_000,   estimated_commission_pct: null,  close_odds_pct: 0.5 }),
    ];
    expect(computeOpportunityWeightedGci(rows)).toBe(0);
  });
});
