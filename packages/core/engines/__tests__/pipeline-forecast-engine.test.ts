/**
 * Pipeline Forecast Engine — Unit Tests
 * ======================================
 * Tests for the unified pipeline forecast engine that merges
 * deals, listing appointments, and buyer clients into a single
 * weighted-GCI forecast with accuracy tracking and funnel metrics.
 */

import { describe, it, expect } from "vitest";
import {
  computePipelineForecast,
  computePreTransactionalWeightedGCI,
  type PipelineForecastInput,
  type BuyerClient,
  type ClosedTransaction,
} from "../pipeline-forecast-engine";
import type { PipelineDeal, ListingAppointment } from "../../types/database";

// ── Helpers ─────────────────────────────────────────────────────────────────

const DEFAULT_COMMISSION = 0.025;

function makeDeal(overrides: Partial<PipelineDeal> & Pick<PipelineDeal, "id" | "stage" | "estimated_price">): PipelineDeal {
  return {
    user_id: "user-1",
    address: "123 Main St",
    estimated_commission_pct: DEFAULT_COMMISSION,
    side: "buyer",
    expected_close_date: null,
    client_name: "Test Client",
    notes: "",
    probability_override: null,
    client_id: null,
    original_estimated_price: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-03-01T00:00:00Z",
    ...overrides,
  };
}

function makeListing(overrides: Partial<ListingAppointment> & Pick<ListingAppointment, "id" | "status">): ListingAppointment {
  return {
    user_id: "user-1",
    client_id: null,
    appointment_date: "2026-03-01",
    property_address: "456 Oak Ave",
    estimated_list_price: 500_000,
    actual_list_price: null,
    actual_sale_price: null,
    estimated_commission_pct: null,
    expected_close_date: null,
    listing_agreement_date: null,
    notes: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-03-01T00:00:00Z",
    ...overrides,
  };
}

function makeBuyer(overrides: Partial<BuyerClient> & Pick<BuyerClient, "id" | "status" | "budget">): BuyerClient {
  return {
    name: "Buyer Client",
    preApproved: true,
    targetCloseDate: null,
    statusChangedAt: null,
    ...overrides,
  };
}

function emptyInput(overrides: Partial<PipelineForecastInput> = {}): PipelineForecastInput {
  return {
    pipelineDeals: [],
    listingAppointments: [],
    buyerClients: [],
    closedTransactions: [],
    defaultCommissionPct: DEFAULT_COMMISSION,
    ...overrides,
  };
}

// ── 1. Empty input ──────────────────────────────────────────────────────────

describe("computePipelineForecast — empty input", () => {
  it("returns zeroed results when all arrays are empty", () => {
    const result = computePipelineForecast(emptyInput());

    expect(result.items).toEqual([]);
    expect(result.totalWeightedGCI).toBe(0);
    expect(result.dealWeightedGCI).toBe(0);
    expect(result.listingWeightedGCI).toBe(0);
    expect(result.buyerWeightedGCI).toBe(0);
    expect(result.dealCount).toBe(0);
    expect(result.listingCount).toBe(0);
    expect(result.buyerCount).toBe(0);
    expect(result.accuracy.overallScore).toBeNull();
    expect(result.accuracy.listingAccuracy).toBeNull();
    expect(result.accuracy.dealAccuracy).toBeNull();
    expect(result.accuracy.sampleSize).toBe(0);
  });
});

// ── 2. Pipeline deals only ──────────────────────────────────────────────────

describe("computePipelineForecast — pipeline deals only", () => {
  const deals: PipelineDeal[] = [
    makeDeal({ id: "deal-1", stage: "lead", estimated_price: 500_000, estimated_commission_pct: 0.025, side: "buyer" }),
    makeDeal({ id: "deal-2", stage: "offer", estimated_price: 600_000, estimated_commission_pct: 0.025, side: "seller" }),
    makeDeal({ id: "deal-3", stage: "firm", estimated_price: 700_000, estimated_commission_pct: 0.03, side: "both" }),
  ];

  const result = computePipelineForecast(emptyInput({ pipelineDeals: deals }));

  it("produces 3 items all with source=deal", () => {
    expect(result.items).toHaveLength(3);
    expect(result.items.every((i) => i.source === "deal")).toBe(true);
  });

  it("maps lead stage to pre_qualifying unified stage", () => {
    const lead = result.items.find((i) => i.id === "deal-1")!;
    expect(lead.unifiedStage).toBe("pre_qualifying");
    expect(lead.probability).toBeCloseTo(0.1, 4);
  });

  it("maps offer stage to offer unified stage", () => {
    const offer = result.items.find((i) => i.id === "deal-2")!;
    expect(offer.unifiedStage).toBe("offer");
    expect(offer.probability).toBeCloseTo(0.5, 4);
    expect(offer.side).toBe("sell");
  });

  it("maps firm stage to firm unified stage", () => {
    const firm = result.items.find((i) => i.id === "deal-3")!;
    expect(firm.unifiedStage).toBe("firm");
    expect(firm.probability).toBeCloseTo(0.9, 4);
    expect(firm.side).toBe("both");
  });

  it("calculates correct weightedGCI per item", () => {
    // deal-1: 500000 * 0.025 = 12500 GCI * 0.1 prob = 1250
    const lead = result.items.find((i) => i.id === "deal-1")!;
    expect(lead.estimatedGCI).toBeCloseTo(12_500, 2);
    expect(lead.weightedGCI).toBeCloseTo(1_250, 2);

    // deal-2: 600000 * 0.025 = 15000 GCI * 0.5 prob = 7500
    const offer = result.items.find((i) => i.id === "deal-2")!;
    expect(offer.estimatedGCI).toBeCloseTo(15_000, 2);
    expect(offer.weightedGCI).toBeCloseTo(7_500, 2);

    // deal-3: 700000 * 0.03 = 21000 GCI * 0.9 prob = 18900
    const firm = result.items.find((i) => i.id === "deal-3")!;
    expect(firm.estimatedGCI).toBeCloseTo(21_000, 2);
    expect(firm.weightedGCI).toBeCloseTo(18_900, 2);
  });

  it("sums totalWeightedGCI correctly and listing/buyer weighted are 0", () => {
    // 1250 + 7500 + 18900 = 27650
    expect(result.totalWeightedGCI).toBeCloseTo(27_650, 2);
    expect(result.dealWeightedGCI).toBeCloseTo(27_650, 2);
    expect(result.listingWeightedGCI).toBe(0);
    expect(result.buyerWeightedGCI).toBe(0);
  });

  it("counts deals correctly", () => {
    expect(result.dealCount).toBe(3);
    expect(result.listingCount).toBe(0);
    expect(result.buyerCount).toBe(0);
  });
});

// ── 3. Listing appointments only ────────────────────────────────────────────

describe("computePipelineForecast — listing appointments only", () => {
  const listings: ListingAppointment[] = [
    makeListing({
      id: "list-1",
      status: "scheduled",
      estimated_list_price: 500_000,
      estimated_commission_pct: 0.03, // explicit commission
    }),
    makeListing({
      id: "list-2",
      status: "active",
      estimated_list_price: 650_000,
      estimated_commission_pct: null, // should fall back to defaultCommissionPct (0.025)
    }),
  ];

  const result = computePipelineForecast(emptyInput({ listingAppointments: listings }));

  it("produces 2 items with source=listing and side=sell", () => {
    expect(result.items).toHaveLength(2);
    expect(result.items.every((i) => i.source === "listing")).toBe(true);
    expect(result.items.every((i) => i.side === "sell")).toBe(true);
  });

  it("applies correct probabilities for scheduled and active", () => {
    const scheduled = result.items.find((i) => i.id === "list-1")!;
    expect(scheduled.probability).toBeCloseTo(0.15, 4);
    expect(scheduled.unifiedStage).toBe("pre_qualifying");

    const active = result.items.find((i) => i.id === "list-2")!;
    expect(active.probability).toBeCloseTo(0.40, 4);
    expect(active.unifiedStage).toBe("active");
  });

  it("uses explicit commission when set, fallback when null", () => {
    const scheduled = result.items.find((i) => i.id === "list-1")!;
    expect(scheduled.commissionPct).toBeCloseTo(0.03, 4);

    const active = result.items.find((i) => i.id === "list-2")!;
    expect(active.commissionPct).toBeCloseTo(0.025, 4);
  });

  it("calculates correct GCI and weightedGCI", () => {
    // list-1: 500000 * 0.03 = 15000 * 0.15 = 2250
    const scheduled = result.items.find((i) => i.id === "list-1")!;
    expect(scheduled.estimatedGCI).toBeCloseTo(15_000, 2);
    expect(scheduled.weightedGCI).toBeCloseTo(2_250, 2);

    // list-2: 650000 * 0.025 = 16250 * 0.40 = 6500
    const active = result.items.find((i) => i.id === "list-2")!;
    expect(active.estimatedGCI).toBeCloseTo(16_250, 2);
    expect(active.weightedGCI).toBeCloseTo(6_500, 2);
  });

  it("sums listing weighted GCI correctly", () => {
    expect(result.listingWeightedGCI).toBeCloseTo(8_750, 2);
    expect(result.totalWeightedGCI).toBeCloseTo(8_750, 2);
    expect(result.dealWeightedGCI).toBe(0);
    expect(result.buyerWeightedGCI).toBe(0);
  });
});

// ── 4. Buyer clients only ───────────────────────────────────────────────────

describe("computePipelineForecast — buyer clients only", () => {
  const buyers: BuyerClient[] = [
    makeBuyer({ id: "buy-1", status: "boarding", budget: 500_000, name: "Alice Buyer" }),
    makeBuyer({ id: "buy-2", status: "in_flight", budget: 700_000, name: "Bob Buyer" }),
  ];

  const result = computePipelineForecast(emptyInput({ buyerClients: buyers }));

  it("produces 2 items with source=buyer and side=buy", () => {
    expect(result.items).toHaveLength(2);
    expect(result.items.every((i) => i.source === "buyer")).toBe(true);
    expect(result.items.every((i) => i.side === "buy")).toBe(true);
  });

  it("applies correct probabilities for boarding and in_flight", () => {
    const boarding = result.items.find((i) => i.id === "buy-1")!;
    expect(boarding.probability).toBeCloseTo(0.10, 4);
    expect(boarding.unifiedStage).toBe("pre_qualifying");

    const inFlight = result.items.find((i) => i.id === "buy-2")!;
    expect(inFlight.probability).toBeCloseTo(0.25, 4);
    expect(inFlight.unifiedStage).toBe("active");
  });

  it("calculates GCI from budget * defaultCommissionPct", () => {
    // buy-1: 500000 * 0.025 = 12500 * 0.10 = 1250
    const boarding = result.items.find((i) => i.id === "buy-1")!;
    expect(boarding.estimatedGCI).toBeCloseTo(12_500, 2);
    expect(boarding.weightedGCI).toBeCloseTo(1_250, 2);

    // buy-2: 700000 * 0.025 = 17500 * 0.25 = 4375
    const inFlight = result.items.find((i) => i.id === "buy-2")!;
    expect(inFlight.estimatedGCI).toBeCloseTo(17_500, 2);
    expect(inFlight.weightedGCI).toBeCloseTo(4_375, 2);
  });

  it("sums buyer weighted GCI correctly", () => {
    expect(result.buyerWeightedGCI).toBeCloseTo(5_625, 2);
    expect(result.totalWeightedGCI).toBeCloseTo(5_625, 2);
    expect(result.dealWeightedGCI).toBe(0);
    expect(result.listingWeightedGCI).toBe(0);
  });
});

// ── 5. Mixed input (all three sources) ──────────────────────────────────────

describe("computePipelineForecast — mixed input", () => {
  const deal = makeDeal({ id: "deal-m", stage: "offer", estimated_price: 500_000, estimated_commission_pct: 0.025 });
  const listing = makeListing({ id: "list-m", status: "active", estimated_list_price: 600_000, estimated_commission_pct: 0.025 });
  const buyer = makeBuyer({ id: "buy-m", status: "in_flight", budget: 400_000 });

  const result = computePipelineForecast(emptyInput({
    pipelineDeals: [deal],
    listingAppointments: [listing],
    buyerClients: [buyer],
  }));

  it("includes all three items", () => {
    expect(result.items).toHaveLength(3);
    expect(result.items.map((i) => i.source).sort()).toEqual(["buyer", "deal", "listing"]);
  });

  it("sums totals from all three sources", () => {
    // deal: 500000 * 0.025 * 0.5 = 6250
    // listing: 600000 * 0.025 * 0.4 = 6000
    // buyer: 400000 * 0.025 * 0.25 = 2500
    expect(result.dealWeightedGCI).toBeCloseTo(6_250, 2);
    expect(result.listingWeightedGCI).toBeCloseTo(6_000, 2);
    expect(result.buyerWeightedGCI).toBeCloseTo(2_500, 2);
    expect(result.totalWeightedGCI).toBeCloseTo(14_750, 2);
  });

  it("counts each source correctly", () => {
    expect(result.dealCount).toBe(1);
    expect(result.listingCount).toBe(1);
    expect(result.buyerCount).toBe(1);
  });
});

// ── 6. Forecast accuracy — listing accuracy ─────────────────────────────────

describe("computePipelineForecast — listing accuracy", () => {
  const listings: ListingAppointment[] = [
    // Sold listing: estimated 500000, actual 480000 -> over-estimate
    makeListing({
      id: "sold-1",
      status: "sold",
      estimated_list_price: 500_000,
      actual_sale_price: 480_000,
    }),
    // Sold listing: estimated 400000, actual 420000 -> under-estimate
    makeListing({
      id: "sold-2",
      status: "sold",
      estimated_list_price: 400_000,
      actual_sale_price: 420_000,
    }),
    // Active listing: should not be counted for accuracy
    makeListing({ id: "active-1", status: "active", estimated_list_price: 300_000 }),
  ];

  const result = computePipelineForecast(emptyInput({ listingAppointments: listings }));

  it("computes listing accuracy from sold listings", () => {
    expect(result.accuracy.listingAccuracy).not.toBeNull();
    expect(result.accuracy.listingAccuracy!.sampleSize).toBe(2);
  });

  it("calculates correct average error percentage", () => {
    // sold-1 error: |500000-480000|/480000 = 20000/480000 ~ 0.04167
    // sold-2 error: |400000-420000|/420000 = 20000/420000 ~ 0.04762
    // avg: (0.04167 + 0.04762) / 2 ~ 0.04464
    expect(result.accuracy.listingAccuracy!.avgErrorPct).toBeCloseTo(0.04464, 3);
  });

  it("tracks over/under estimates", () => {
    expect(result.accuracy.listingAccuracy!.overEstimateCount).toBe(1);
    expect(result.accuracy.listingAccuracy!.underEstimateCount).toBe(1);
  });
});

// ── 7. Forecast accuracy — deal accuracy ────────────────────────────────────

describe("computePipelineForecast — deal accuracy", () => {
  const deals: PipelineDeal[] = [
    makeDeal({
      id: "deal-acc-1",
      stage: "closed",
      estimated_price: 450_000,
      original_estimated_price: 400_000,
    }),
    makeDeal({
      id: "deal-acc-2",
      stage: "closed",
      estimated_price: 550_000,
      original_estimated_price: 550_000,
    }),
  ];

  const closedTransactions: ClosedTransaction[] = [
    { id: "tx-1", salePrice: 420_000, pipelineDealId: "deal-acc-1" },
    { id: "tx-2", salePrice: 550_000, pipelineDealId: "deal-acc-2" },
  ];

  const result = computePipelineForecast(emptyInput({
    pipelineDeals: deals,
    closedTransactions,
  }));

  it("computes deal accuracy from matched closed transactions", () => {
    expect(result.accuracy.dealAccuracy).not.toBeNull();
    expect(result.accuracy.dealAccuracy!.sampleSize).toBe(2);
  });

  it("calculates correct average error percentage", () => {
    // deal-acc-1: |400000 - 420000| / 420000 = 20000/420000 ~ 0.04762
    // deal-acc-2: |550000 - 550000| / 550000 = 0
    // avg: (0.04762 + 0) / 2 ~ 0.02381
    expect(result.accuracy.dealAccuracy!.avgErrorPct).toBeCloseTo(0.02381, 3);
  });

  it("tracks under-estimate correctly", () => {
    expect(result.accuracy.dealAccuracy!.underEstimateCount).toBe(1); // deal-acc-1
    expect(result.accuracy.dealAccuracy!.overEstimateCount).toBe(0);
  });
});

// ── 8. Forecast accuracy — overall score ────────────────────────────────────

describe("computePipelineForecast — overall accuracy score", () => {
  const listings: ListingAppointment[] = [
    makeListing({
      id: "sold-os-1",
      status: "sold",
      estimated_list_price: 500_000,
      actual_sale_price: 480_000,
    }),
  ];
  const deals: PipelineDeal[] = [
    makeDeal({
      id: "deal-os-1",
      stage: "closed",
      estimated_price: 450_000,
      original_estimated_price: 400_000,
    }),
  ];
  const closedTransactions: ClosedTransaction[] = [
    { id: "tx-os-1", salePrice: 420_000, pipelineDealId: "deal-os-1" },
  ];

  const result = computePipelineForecast(emptyInput({
    listingAppointments: listings,
    pipelineDeals: deals,
    closedTransactions,
  }));

  it("computes overall score as weighted average of listing and deal accuracy", () => {
    // listing error: 20000/480000 ~ 0.04167, sample=1
    // deal error: 20000/420000 ~ 0.04762, sample=1
    // weighted avg: (0.04167*1 + 0.04762*1) / 2 ~ 0.04464
    // score = round(100 * (1 - 0.04464)) = round(95.536) = 96
    expect(result.accuracy.overallScore).toBe(96);
    expect(result.accuracy.sampleSize).toBe(2);
  });
});

// ── 9. Conversion funnel ────────────────────────────────────────────────────

describe("computePipelineForecast — conversion funnel", () => {
  const deals: PipelineDeal[] = [
    makeDeal({ id: "f1", stage: "lead", estimated_price: 100_000 }),
    makeDeal({ id: "f2", stage: "lead", estimated_price: 100_000 }),
    makeDeal({ id: "f3", stage: "lead", estimated_price: 100_000 }),
    makeDeal({ id: "f4", stage: "lead", estimated_price: 100_000 }),
    makeDeal({ id: "f5", stage: "lead", estimated_price: 100_000 }),
    makeDeal({ id: "f6", stage: "showing", estimated_price: 100_000 }),
    makeDeal({ id: "f7", stage: "showing", estimated_price: 100_000 }),
    makeDeal({ id: "f8", stage: "showing", estimated_price: 100_000 }),
    makeDeal({ id: "f9", stage: "offer", estimated_price: 100_000 }),
  ];

  const result = computePipelineForecast(emptyInput({ pipelineDeals: deals }));

  it("counts deals at each stage in the funnel", () => {
    const { dealFunnel } = result.funnel;
    const leadStep = dealFunnel.find((s) => s.stage === "lead")!;
    const showingStep = dealFunnel.find((s) => s.stage === "showing")!;
    const offerStep = dealFunnel.find((s) => s.stage === "offer")!;

    expect(leadStep.count).toBe(5);
    expect(showingStep.count).toBe(3);
    expect(offerStep.count).toBe(1);
  });

  it("has null conversion rate for first stage (lead)", () => {
    const { dealFunnel } = result.funnel;
    expect(dealFunnel[0].stage).toBe("lead");
    expect(dealFunnel[0].conversionRate).toBeNull();
  });

  it("calculates conversion rates between stages", () => {
    const { dealFunnel } = result.funnel;
    const showingStep = dealFunnel.find((s) => s.stage === "showing")!;
    const offerStep = dealFunnel.find((s) => s.stage === "offer")!;

    // showing/lead = 3/5 = 0.6
    expect(showingStep.conversionRate).toBeCloseTo(0.6, 4);
    // offer/showing = 1/3 ~ 0.333
    expect(offerStep.conversionRate).toBeCloseTo(1 / 3, 4);
  });

  it("shows zero counts for stages with no deals", () => {
    const { dealFunnel } = result.funnel;
    const conditionalStep = dealFunnel.find((s) => s.stage === "conditional")!;
    expect(conditionalStep.count).toBe(0);
    // conditional/offer = 0/1 = 0
    expect(conditionalStep.conversionRate).toBeCloseTo(0, 4);
  });
});

// ── 10. Filters correctly ───────────────────────────────────────────────────

describe("computePipelineForecast — filters", () => {
  it("excludes closed deals from items", () => {
    const deals: PipelineDeal[] = [
      makeDeal({ id: "active-deal", stage: "offer", estimated_price: 500_000 }),
      makeDeal({ id: "closed-deal", stage: "closed", estimated_price: 500_000 }),
    ];
    const result = computePipelineForecast(emptyInput({ pipelineDeals: deals }));
    expect(result.items).toHaveLength(1);
    expect(result.items[0].id).toBe("active-deal");
  });

  it("excludes sold/expired/withdrawn listings from items", () => {
    const listings: ListingAppointment[] = [
      makeListing({ id: "active-listing", status: "active" }),
      makeListing({ id: "sold-listing", status: "sold", actual_sale_price: 500_000 }),
      makeListing({ id: "expired-listing", status: "expired" }),
      makeListing({ id: "withdrawn-listing", status: "withdrawn" }),
    ];
    const result = computePipelineForecast(emptyInput({ listingAppointments: listings }));
    expect(result.items).toHaveLength(1);
    expect(result.items[0].id).toBe("active-listing");
  });

  it("only includes boarding and in_flight buyers as items", () => {
    // The engine expects pre-filtered buyers, but let's verify only
    // boarding/in_flight get proper probabilities
    const buyers: BuyerClient[] = [
      makeBuyer({ id: "b-boarding",  status: "boarding",  budget: 500_000 }),
      makeBuyer({ id: "b-in-flight", status: "in_flight", budget: 500_000 }),
    ];
    const result = computePipelineForecast(emptyInput({ buyerClients: buyers }));
    expect(result.items).toHaveLength(2);
    const statuses = result.items.map((i) => i.stage).sort();
    expect(statuses).toEqual(["boarding", "in_flight"]);
  });
});

// ── 11. computePreTransactionalWeightedGCI helper ───────────────────────────

describe("computePreTransactionalWeightedGCI", () => {
  it("returns listingWeightedGCI + buyerWeightedGCI", () => {
    const listing = makeListing({ id: "list-pt", status: "active", estimated_list_price: 600_000, estimated_commission_pct: 0.025 });
    const buyer = makeBuyer({ id: "buy-pt", status: "in_flight", budget: 400_000 });
    const deal = makeDeal({ id: "deal-pt", stage: "offer", estimated_price: 500_000 });

    const result = computePipelineForecast(emptyInput({
      pipelineDeals: [deal],
      listingAppointments: [listing],
      buyerClients: [buyer],
    }));

    // listing: 600000 * 0.025 * 0.4 = 6000
    // buyer: 400000 * 0.025 * 0.25 = 2500
    const preTransactional = computePreTransactionalWeightedGCI(result);
    expect(preTransactional).toBeCloseTo(8_500, 2);
    expect(preTransactional).toBeCloseTo(result.listingWeightedGCI + result.buyerWeightedGCI, 2);

    // Should NOT include deal weighted GCI
    expect(preTransactional).not.toBeCloseTo(result.totalWeightedGCI, 2);
  });

  it("returns 0 when no listings or buyers", () => {
    const result = computePipelineForecast(emptyInput({
      pipelineDeals: [makeDeal({ id: "d1", stage: "firm", estimated_price: 700_000 })],
    }));
    expect(computePreTransactionalWeightedGCI(result)).toBe(0);
  });
});
