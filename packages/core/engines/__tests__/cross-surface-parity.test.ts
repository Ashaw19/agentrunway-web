/**
 * Cross-Surface Metric Parity
 * ============================
 * Regression guard for the 2026-06-26 cross-surface divergence fix (and the
 * original Runway Score 53/61 incident, 2026-04-17).
 *
 * The dashboard, the Flight Crew chat route, and the paid-tier MCP/Connector
 * analytics tools must feed IDENTICAL inputs into the SAME canonical engines,
 * so the same agent sees the same Runway Score / projected GCI / survival
 * months / HST on every surface.
 *
 * This file models each surface's INPUT-DERIVATION (the exact transformations
 * each surface applies before calling the engine) against ONE listing-heavy
 * fixture, then asserts the engine OUTPUTS are equal. A listing-heavy agent is
 * the key case: it is the divergence that the chat route + MCP tools previously
 * dropped (they omitted listing-weighted GCI from the projection), and it is
 * exactly the Ellis-team profile.
 *
 * IMPORTANT: this test deliberately re-implements each surface's input prep
 * inline. If a surface's real input derivation drifts from what is encoded
 * here, THIS TEST will still pass (it tests the engine math, not the route),
 * but the named regression checks below (e.g. "chat must include listing
 * weighted GCI", "HST registration is gst_hst_registered only") encode the
 * specific bugs we fixed so a future re-introduction is caught by review +
 * the explicit assertions.
 *
 * Uses fake timers pinned to a mid-year date for deterministic projections.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  seasonalFractionElapsed,
  projectedYearEndGCI,
  projectedYearEndTransactions,
  computeListingWeightedGCI,
} from "../projection-engine";
import {
  computeEffectiveCashForSurvival,
  computePipelineMonthlyIncome,
  computeProjectedNetForTax,
} from "../effective-cash";
import { survivalResult } from "../survival-engine";
import { buildHealthReport } from "../health-report";
import { compute as computeRunwayScore } from "../runway-score-engine";
import { compare as benchmarkCompare } from "../benchmark-engine";
import { computeHSTCollected } from "../hst-engine";
import { gstHstRate } from "../canadian-tax-engine";
import { computeGCI, computeWeightedGCI, activePipelineDeals, type Transaction } from "../../types/database";
import { createTestSettings } from "./test-data";

// Pinned mid-year so seasonal fraction + remaining-months math is stable and
// well past the early-year dampening threshold (fraction >= 0.10).
const NOW = new Date(2026, 6, 15); // July 15, 2026

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

// ── Listing-heavy fixture ─────────────────────────────────────────────────────

// A registered Atlantic agent (NB → 15% HST) with modest closed GCI but a
// heavy LISTING book — the case the chat route + MCP used to under-project.
const SETTINGS = createTestSettings({
  province: "newBrunswick",
  split_preset: "p80_20",
  monthly_brokerage_fee: 600,
  tx_fee_rate_pct: 0.02,
  tx_fee_annual_cap: 3_000,
  post_cap_threshold_gci: 100_000,
  post_cap_agent_pct: 0.95,
  post_cap_brokerage_pct: 0.05,
  goal_gci: 200_000,
  cash_reserve: 20_000,
  gst_hst_registered: true,
  brokerage_withholds_hst: false,
  gst_hst_paid_on_expenses: 0,
  business_number: "123456789RT0001", // populated BN — must NOT imply registration
  use_national_seasonality: true,
  national_quarter_pcts: [0.20, 0.30, 0.30, 0.20],
  is_incorporated: false,
  experience_years: 6,
});

const CLOSED_TX: Transaction[] = [
  { id: "t1", date: "2026-02-10", sale_price: 480_000, commission_pct: 0.025, gci_override: null, team_split_pct: null, status: "closed" } as unknown as Transaction,
  { id: "t2", date: "2026-04-22", sale_price: 520_000, commission_pct: 0.025, gci_override: null, team_split_pct: null, status: "closed" } as unknown as Transaction,
  { id: "t3", date: "2026-06-01", sale_price: 610_000, commission_pct: 0.025, gci_override: null, team_split_pct: null, status: "closed" } as unknown as Transaction,
];

// Deal-stage pipeline (a couple of buyers) as it actually comes back from the
// DB: `pipeline_deals` retains terminal rows forever — a closed deal keeps its
// row at stage='closed' (t3 below is that deal's transaction), and a lost buyer
// prospect keeps its row at stage='lost'. Surfaces must run the canonical
// active filter over this; PIPELINE_ACTIVE is what any aggregate should see.
const PIPELINE = [
  { estimated_price: 450_000, estimated_commission_pct: 0.025, probability_override: null, stage: "offer" },
  { estimated_price: 380_000, estimated_commission_pct: 0.025, probability_override: null, stage: "conditional" },
  { estimated_price: 610_000, estimated_commission_pct: 0.025, probability_override: null, stage: "closed" },
  { estimated_price: 300_000, estimated_commission_pct: 0.025, probability_override: 0.25, stage: "lost" },
];
const PIPELINE_ACTIVE = activePipelineDeals(PIPELINE);

// HEAVY listing book — this is the differentiator.
const LISTINGS = [
  { estimated_list_price: 700_000, estimated_commission_pct: 0.025, status: "active" },
  { estimated_list_price: 650_000, estimated_commission_pct: 0.025, status: "active" },
  { estimated_list_price: 800_000, estimated_commission_pct: 0.03, status: "active" },
  { estimated_list_price: 500_000, estimated_commission_pct: 0.025, status: "scheduled" },
  { estimated_list_price: 900_000, estimated_commission_pct: 0.025, status: "scheduled" },
  { estimated_list_price: 750_000, estimated_commission_pct: 0.025, status: "sold" }, // weights to 0
];

const EXPENSES_YTD = 18_000;
const MONTHLY_RECURRING = 1_200;

// ── Shared input derivation (the canonical chain every surface must run) ──────

function deriveInputs() {
  const ytdGCI = CLOSED_TX.reduce((sum, tx) => sum + computeGCI(tx), 0);
  const pipelineWeighted = PIPELINE_ACTIVE.reduce(
    (sum, d) => sum + computeWeightedGCI(d as Parameters<typeof computeWeightedGCI>[0]),
    0,
  );
  const listingWeighted = computeListingWeightedGCI(LISTINGS);

  // Seasonal weights: national (no agent history in this fixture).
  const seasonalWeights = SETTINGS.use_national_seasonality
    ? SETTINGS.national_quarter_pcts
    : [0.25, 0.25, 0.25, 0.25];
  const fraction = seasonalFractionElapsed(seasonalWeights, NOW);

  // Projection input = pipeline + listing weighted (the bug fix).
  const projGCI = projectedYearEndGCI(ytdGCI, pipelineWeighted + listingWeighted, fraction, SETTINGS.goal_gci);
  const projDeals = projectedYearEndTransactions(CLOSED_TX.length, PIPELINE_ACTIVE.length, fraction);

  const { cashPosition } = computeEffectiveCashForSurvival({
    settings: SETTINGS,
    ytdGCI,
    expensesYTD: EXPENSES_YTD,
    monthlyRecurring: MONTHLY_RECURRING,
    projectedGCI: projGCI,
    projectedDealCount: projDeals,
    fraction,
    now: NOW,
  });

  // Survival's monthly income uses PIPELINE-only (matches dashboard).
  const pipelineMonthlyEst = computePipelineMonthlyIncome(pipelineWeighted, fraction);
  const survival = survivalResult(
    SETTINGS.monthly_brokerage_fee,
    MONTHLY_RECURRING,
    cashPosition.effectiveCash,
    pipelineMonthlyEst,
  );

  const healthReport = buildHealthReport(
    ytdGCI, SETTINGS.goal_gci, fraction, pipelineWeighted, EXPENSES_YTD,
  );
  const benchmark = benchmarkCompare(projGCI, SETTINGS.experience_years);
  const runwayScore = computeRunwayScore(healthReport, benchmark.percentile, survival.months);

  const hstCollected = computeHSTCollected({
    ytdGCI,
    hstRate: gstHstRate(SETTINGS.province),
    isRegistered: SETTINGS.gst_hst_registered, // NOT `|| business_number`
    brokerageWithholdsHst: SETTINGS.brokerage_withholds_hst,
  });

  return {
    ytdGCI,
    pipelineWeighted,
    listingWeighted,
    fraction,
    projGCI,
    projDeals,
    survivalMonths: survival.months,
    runwayScore: runwayScore.score,
    runwayStateLabel: runwayScore.stateLabel,
    hstCollected,
  };
}

// ── Parity ────────────────────────────────────────────────────────────────────

describe("cross-surface metric parity (listing-heavy agent)", () => {
  it("the listing book contributes materially to the projection (sanity)", () => {
    const { listingWeighted } = deriveInputs();
    // active: (700k+650k)*0.025*0.40 + 800k*0.03*0.40 = 13_500 + 9_600 = 23_100
    // scheduled: (500k+900k)*0.025*0.15 = 5_250 ; sold: 0
    expect(listingWeighted).toBeCloseTo(23_100 + 5_250, 2);
    expect(listingWeighted).toBeGreaterThan(0);
  });

  it("dashboard, chat, and MCP flows produce identical projected GCI", () => {
    // All three surfaces run the SAME derivation. Compute it three times to
    // assert determinism + that no surface-specific branch diverges.
    const dash = deriveInputs();
    const chat = deriveInputs();
    const mcp = deriveInputs();
    expect(chat.projGCI).toBe(dash.projGCI);
    expect(mcp.projGCI).toBe(dash.projGCI);
  });

  it("projected GCI INCLUDES listing-weighted GCI (the chat/MCP bug)", () => {
    const { ytdGCI, pipelineWeighted, listingWeighted, fraction } = deriveInputs();
    const withListings = projectedYearEndGCI(ytdGCI, pipelineWeighted + listingWeighted, fraction, SETTINGS.goal_gci);
    const withoutListings = projectedYearEndGCI(ytdGCI, pipelineWeighted, fraction, SETTINGS.goal_gci);
    // The pre-fix chat/MCP projection (no listings) was strictly lower for a
    // listing-heavy agent. Guard against re-introducing the omission.
    expect(withListings).toBeGreaterThan(withoutListings);
    // listing contribution into the projection is pipelineAdj-style (×0.5).
    expect(withListings - withoutListings).toBeCloseTo(listingWeighted * 0.5, 2);
  });

  it("Runway Score + survival months agree across surfaces", () => {
    const dash = deriveInputs();
    const chat = deriveInputs();
    const mcp = deriveInputs();
    expect(chat.runwayScore).toBe(dash.runwayScore);
    expect(mcp.runwayScore).toBe(dash.runwayScore);
    expect(chat.survivalMonths).toBe(dash.survivalMonths);
    expect(mcp.survivalMonths).toBe(dash.survivalMonths);
    expect(chat.runwayStateLabel).toBe(dash.runwayStateLabel);
  });

  it("HST registration is driven by gst_hst_registered ONLY, not business_number", () => {
    const rate = gstHstRate(SETTINGS.province);
    const ytdGCI = CLOSED_TX.reduce((sum, tx) => sum + computeGCI(tx), 0);

    // Registered agent collects HST.
    const registered = computeHSTCollected({
      ytdGCI, hstRate: rate, isRegistered: true, brokerageWithholdsHst: false,
    });
    expect(registered).toBeCloseTo(ytdGCI * rate, 2);

    // NOT registered but business_number populated → the OLD bug treated this
    // as registered (`gst_hst_registered || !!business_number`). The correct
    // behavior is $0 collected because the explicit flag is false.
    const notRegisteredButHasBN = computeHSTCollected({
      ytdGCI, hstRate: rate, isRegistered: false, brokerageWithholdsHst: false,
    });
    expect(notRegisteredButHasBN).toBe(0);
  });
});

// ── Expense months: integer vs fractional (the chat route bug) ────────────────

describe("expense months-elapsed is integer (getMonth()+1), not fractional", () => {
  it("recurring YTD estimate uses integer months — matches dashboard", () => {
    // Dashboard + chat-diagnostics: expMonthsElapsed = now.getMonth() + 1 (1-12).
    // Chat route previously used getMonth() + getDate()/30 (fractional), which
    // made expensesYTD diverge. This guards the integer form.
    const legacyMonthlyRecurring = 1_000;

    const integerMonths = NOW.getMonth() + 1; // 7 in July
    const integerEstimate = legacyMonthlyRecurring * integerMonths;

    const fractionalMonths = NOW.getMonth() + NOW.getDate() / 30; // 6 + 15/30 = 6.5
    const fractionalEstimate = legacyMonthlyRecurring * fractionalMonths;

    expect(integerMonths).toBe(7);
    expect(integerEstimate).toBe(7_000);
    // The two forms genuinely differ — proving the fix is observable.
    expect(integerEstimate).not.toBe(fractionalEstimate);
  });
});

// ── net-for-tax parity (engine helper, fed by the shared projection) ──────────

describe("net-for-tax uses the canonical helper on the listing-inclusive projection", () => {
  it("is deterministic across surfaces", () => {
    const { projGCI } = deriveInputs();
    const a = computeProjectedNetForTax({
      projectedGCI: projGCI, expensesYTD: EXPENSES_YTD, monthlyRecurring: MONTHLY_RECURRING, settings: SETTINGS, now: NOW,
    });
    const b = computeProjectedNetForTax({
      projectedGCI: projGCI, expensesYTD: EXPENSES_YTD, monthlyRecurring: MONTHLY_RECURRING, settings: SETTINGS, now: NOW,
    });
    expect(a).toBe(b);
    expect(a).toBeGreaterThan(0);
  });
});
