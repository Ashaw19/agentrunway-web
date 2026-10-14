/**
 * The Scenario Engine's seed is the dashboard's projection (2026-10-14).
 *
 * The Scenarios page and Overhead's "Scenarios" tab built the seed from
 * `national_quarter_pcts` alone (whether or not the agent had the national
 * pattern switched on, and ignoring their own history), projected GCI from the
 * pipeline alone (no listing appointments), counted deals to date where the
 * dashboard divides by projected deals, left the pipeline income estimate out
 * of the runway and fixed the benchmark at the 50th percentile. "Your
 * Projection", which says it is based on the dashboard's data, could show a
 * different projected GCI, tax, per-deal tax portion, cash runway and Runway
 * Score.
 *
 * This file restates the dashboard's chain (dashboard-content.tsx) on its own,
 * from the same rows, and holds the seed and the "Your Projection" column to
 * it for five kinds of agent.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestSettings } from "@agent-runway/core/engines/__tests__/test-data";
import {
  computeListingWeightedGCI,
  projectedYearEndGCI,
  projectedYearEndTransactions,
  seasonalFractionElapsed,
} from "@agent-runway/core/engines/projection-engine";
import { computeEffectiveCashForSurvival } from "@agent-runway/core/engines/effective-cash";
import { computePlanGross } from "@agent-runway/core/engines/real-compensation-engine";
import { calculate as calculateTax, gstHstRate } from "@agent-runway/core/engines/canadian-tax-engine";
import { computeHSTCollected } from "@agent-runway/core/engines/hst-engine";
import { computeCashPosition } from "@agent-runway/core/engines/cash-position-engine";
import { survivalResult } from "@agent-runway/core/engines/survival-engine";
import { buildHealthReport } from "@agent-runway/core/engines/health-report";
import { compute as computeRunwayScore } from "@agent-runway/core/engines/runway-score-engine";
import { compare as benchmarkCompare } from "@agent-runway/core/engines/benchmark-engine";
import { localISODate } from "@agent-runway/core/lib/local-date";
import {
  activePipelineDeals,
  computeGCI,
  computeWeightedGCI,
  type HistoryItem,
  type ListingAppointment,
  type PipelineDeal,
  type PipelineStage,
  type Transaction,
  type UserSettings,
} from "@agent-runway/core/types/database";
import { getPlaybook } from "@/lib/troubleshooting-playbooks";
import { classifyTopicMulti } from "@/lib/troubleshooting-classifier";
import { KNOWLEDGE_BASE } from "@/lib/knowledge-base";
import {
  buildScenarioSeed,
  computeScenarioResult,
  seedScenarioInputs,
  type ScenarioSeedData,
} from "../scenario-seed";

// Mid-July, midday Atlantic: past the early-year dampening, far from a day,
// month or quarter boundary in any zone the tests run in.
const NOW = new Date("2026-07-15T15:00:00Z");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

// ── Rows, as the dashboard page reads them ──────────────────────────────────

const STAMP = "2026-01-01T00:00:00Z";

function closed(id: string, date: string, sale_price: number): Transaction {
  return {
    id, user_id: "u1", date, address: "", sale_price, commission_pct: 0.025, gci_override: null,
    side: "buyer", status: "closed", client_name: "", notes: "", team_split_pct: null,
    pipeline_deal_id: null, created_at: STAMP, updated_at: STAMP,
  };
}

function deal(id: string, stage: PipelineStage, estimated_price: number): PipelineDeal {
  return {
    id, user_id: "u1", address: "", estimated_price, estimated_commission_pct: 0.025, side: "buyer", stage,
    expected_close_date: null, client_name: "", notes: "", probability_override: null, client_id: null,
    original_estimated_price: null, lost_reason: null, lost_at: null, created_at: STAMP, updated_at: STAMP,
  };
}

function listing(id: string, status: "scheduled" | "active", estimated_list_price: number): ListingAppointment {
  return {
    id, user_id: "u1", client_id: null, appointment_date: "2026-07-01", property_address: null,
    estimated_list_price, actual_list_price: null, actual_sale_price: null, status,
    estimated_commission_pct: 0.025, expected_close_date: null, listing_agreement_date: null, notes: null,
    close_odds_pct: null, lost_reason: null, converted_to_pipeline_deal_id: null,
    created_at: STAMP, updated_at: STAMP,
  };
}

function history(year: number, quarter_gci: number[]): HistoryItem {
  return {
    id: `h${year}`, user_id: "u1", year, annual_gci: quarter_gci.reduce((a, b) => a + b, 0), annual_tx: 10,
    quarter_gci, quarter_tx: [2, 3, 3, 2], is_locked: false, split_pct: null,
    annual_expenses: 0, annual_mileage_km: 0, annual_mileage_deduct: 0, created_at: STAMP, updated_at: STAMP,
  };
}

const TRANSACTIONS = [
  closed("t1", "2026-02-10", 480_000),
  closed("t2", "2026-04-22", 520_000),
  closed("t3", "2026-06-01", 610_000),
];

// The table keeps terminal rows: a closed deal's row and a lost buyer's.
const PIPELINE = [
  deal("d1", "offer", 450_000),
  deal("d2", "conditional", 380_000),
  deal("d3", "closed", 610_000),
  deal("d4", "lost", 300_000),
];

const LISTINGS = [
  listing("l1", "active", 700_000),
  listing("l2", "active", 650_000),
  listing("l3", "scheduled", 900_000),
];

// The agent's own pattern: two years with quarterly GCI, heavier in spring.
const HISTORY = [history(2025, [20_000, 55_000, 40_000, 15_000]), history(2024, [18_000, 50_000, 45_000, 17_000])];

const EXPENSES = { expensesYTD: 18_000, monthlyRecurring: 1_200, expensesRemaining: 6_000 };

function settingsWith(over: Partial<UserSettings>): UserSettings {
  return createTestSettings({
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
    use_national_seasonality: false,
    national_quarter_pcts: [0.15, 0.35, 0.3, 0.2],
    is_incorporated: false,
    experience_years: 6,
    ...over,
  });
}

interface Fixture {
  name: string;
  settings: UserSettings;
  transactions: Transaction[];
  pipelineDeals: PipelineDeal[];
  listings: ListingAppointment[];
  historyItems: HistoryItem[];
}

const FIXTURES: Fixture[] = [
  {
    name: "own seasonal pattern (two history years), national pattern switched off",
    settings: settingsWith({}),
    transactions: TRANSACTIONS, pipelineDeals: PIPELINE, listings: [], historyItems: HISTORY,
  },
  {
    name: "no history, national pattern switched off: four equal quarters",
    settings: settingsWith({}),
    transactions: TRANSACTIONS, pipelineDeals: PIPELINE, listings: [], historyItems: [],
  },
  {
    name: "national pattern switched on, with listing appointments",
    settings: settingsWith({ use_national_seasonality: true }),
    transactions: TRANSACTIONS, pipelineDeals: PIPELINE, listings: LISTINGS, historyItems: [],
  },
  {
    name: "listing appointments and the agent's own pattern",
    settings: settingsWith({ use_national_seasonality: true }),
    transactions: TRANSACTIONS, pipelineDeals: PIPELINE, listings: LISTINGS, historyItems: HISTORY,
  },
  {
    name: "REAL plan: the year's cash runs the per-deal waterfall over the closed deals",
    settings: settingsWith({ comp_plan: "real", real_join_date: "2025-03-01" }),
    transactions: TRANSACTIONS, pipelineDeals: PIPELINE, listings: LISTINGS, historyItems: HISTORY,
  },
];

// ── The dashboard's chain, restated from dashboard-content.tsx ──────────────

function dashboard(f: Fixture) {
  const settings = f.settings;
  const now = new Date();
  const ytdGCI = f.transactions.reduce((sum, tx) => sum + computeGCI(tx), 0);
  const ytdDealCount = f.transactions.length;
  const planDeals = f.transactions.map((tx) => ({ id: tx.id, date: tx.date, gci: computeGCI(tx) }));

  const livePipelineDeals = activePipelineDeals(f.pipelineDeals);
  const pipelineWeightedGCI = livePipelineDeals.reduce((sum, d) => sum + computeWeightedGCI(d), 0);
  const pipelineCount = livePipelineDeals.length;
  const listingWeightedGCI = computeListingWeightedGCI(f.listings);

  const agentSeasonalWeights = (() => {
    const withData = f.historyItems.filter((h) => h.quarter_gci.some((v) => (v ?? 0) > 0));
    if (withData.length < 2) return null;
    const avgQ = [0, 1, 2, 3].map((q) => withData.reduce((sum, h) => sum + (h.quarter_gci[q] ?? 0), 0) / withData.length);
    const total = avgQ.reduce((a, b) => a + b, 0);
    return total > 0 ? avgQ.map((v) => v / total) : null;
  })();
  const seasonalWeights =
    agentSeasonalWeights ??
    (settings.use_national_seasonality ? (settings.national_quarter_pcts ?? [0.25, 0.25, 0.25, 0.25]) : [0.25, 0.25, 0.25, 0.25]);
  const fraction = seasonalFractionElapsed(seasonalWeights);
  const goalGCI = settings.goal_gci ?? 0;
  const projectedGCI = projectedYearEndGCI(ytdGCI, pipelineWeightedGCI + listingWeightedGCI, fraction, goalGCI);
  const benchmark = benchmarkCompare(projectedGCI, settings.experience_years ?? null);

  const remainingMonths = Math.max(1, 12 - Math.floor(fraction * 12));
  const pipelineMonthlyEst = fraction > 0 ? pipelineWeightedGCI / remainingMonths : 0;

  const annualExpenses = EXPENSES.expensesYTD + EXPENSES.expensesRemaining;
  const projectedDealCount = projectedYearEndTransactions(ytdDealCount, pipelineCount, fraction);
  const projectedNet =
    computePlanGross(settings, projectedGCI, { dealCount: projectedDealCount, asOf: localISODate() }).grossAfterPlan -
    settings.monthly_brokerage_fee * 12;
  const netForTax = Math.max(0, projectedNet - annualExpenses);
  const taxResult = calculateTax(netForTax, settings.province, Math.max(projectedDealCount, 1));

  const ytdHstCollected = computeHSTCollected({
    ytdGCI,
    hstRate: gstHstRate(settings.province),
    isRegistered: settings.gst_hst_registered ?? false,
    brokerageWithholdsHst: settings.brokerage_withholds_hst ?? false,
  });
  const { grossAfterPlan } = computePlanGross(settings, ytdGCI, {
    deals: planDeals,
    windowStart: `${now.getFullYear()}-01-01`,
    windowEnd: `${now.getFullYear() + 1}-01-01`,
    asOf: localISODate(now),
  });
  const cashPosition = computeCashPosition({
    ytdGCI,
    ytdAgentNet: Math.max(0, grossAfterPlan - settings.monthly_brokerage_fee * (now.getMonth() + 1)),
    ytdExpenses: EXPENSES.expensesYTD,
    ytdTaxSetAside: taxResult.totalBurden * Math.min(fraction, 1),
    ytdHstCollected,
    ytdHstOnExpenses: 0,
    brokerageWithholdsHst: settings.brokerage_withholds_hst ?? false,
    manualCashReserve: settings.cash_reserve ?? 0,
    fractionElapsed: fraction,
  });

  const survival = survivalResult(
    settings.monthly_brokerage_fee,
    EXPENSES.monthlyRecurring,
    cashPosition.effectiveCash,
    pipelineMonthlyEst,
  );
  const healthReport = buildHealthReport(ytdGCI, goalGCI, fraction, pipelineWeightedGCI, EXPENSES.expensesYTD);
  const runwayScore = computeRunwayScore(healthReport, benchmark.percentile, survival.months);

  return {
    fraction, pipelineWeightedGCI, projectedGCI, projectedDealCount, taxResult,
    effectiveCash: cashPosition.effectiveCash, survival, runwayScore,
  };
}

// ── The seed before 2026-10-14 (overhead/page.tsx and scenarios/page.tsx) ───

function seedBefore(f: Fixture) {
  const ytdGCI = f.transactions.reduce((sum, tx) => sum + computeGCI(tx), 0);
  const live = activePipelineDeals(f.pipelineDeals);
  const pipelineWeightedGCI = live.reduce((sum, d) => sum + computeWeightedGCI(d), 0);
  const quarterPcts = f.settings.national_quarter_pcts ?? [0.25, 0.25, 0.25, 0.25];
  const fraction = seasonalFractionElapsed(quarterPcts);
  const projectedAnnualGCI = projectedYearEndGCI(ytdGCI, pipelineWeightedGCI, fraction, f.settings.goal_gci ?? 0);
  const projectedDealCount = projectedYearEndTransactions(f.transactions.length, live.length, fraction);
  const cashReserve = computeEffectiveCashForSurvival({
    settings: f.settings,
    ytdGCI,
    // The pages left the deals out: an empty list is that (the analytic simulation).
    transactions: [],
    expensesYTD: EXPENSES.expensesYTD,
    expensesRemaining: EXPENSES.expensesRemaining,
    projectedGCI: projectedAnnualGCI,
    projectedDealCount,
    fraction,
  }).cashPosition.effectiveCash;
  return { quarterPcts, projectedAnnualGCI, dealCount: f.transactions.length, cashReserve };
}

function seedFor(f: Fixture): ScenarioSeedData {
  return buildScenarioSeed({
    settings: f.settings,
    transactions: f.transactions,
    carryOverTx: [],
    pipelineDeals: f.pipelineDeals,
    listings: f.listings,
    historyItems: f.historyItems,
    expenses: EXPENSES,
  });
}

describe.each(FIXTURES)("Scenario Engine seed = the dashboard's projection: $name", (f) => {
  it("the fixture shows the old seed's difference (sanity)", () => {
    const d = dashboard(f);
    const before = seedBefore(f);
    const differs =
      Math.abs(before.projectedAnnualGCI - d.projectedGCI) > 1 ||
      Math.abs(seasonalFractionElapsed(before.quarterPcts) - d.fraction) > 1e-6 ||
      before.dealCount !== d.projectedDealCount ||
      Math.abs(before.cashReserve - d.effectiveCash) > 1;
    expect(differs).toBe(true);
  });

  it("projects GCI and deals the way the dashboard does", () => {
    const d = dashboard(f);
    const seed = seedFor(f);
    expect(seed.projectedAnnualGCI).toBeCloseTo(d.projectedGCI, 6);
    expect(seed.projectedDealCount).toBe(d.projectedDealCount);
    expect(seed.pipelineWeightedGCI).toBeCloseTo(d.pipelineWeightedGCI, 6);
  });

  it("its quarter weights give the dashboard's seasonal fraction", () => {
    expect(seasonalFractionElapsed(seedFor(f).quarterPcts)).toBeCloseTo(dashboard(f).fraction, 12);
  });

  it("its cash is the dashboard's cash position", () => {
    expect(seedFor(f).cashReserve).toBeCloseTo(dashboard(f).effectiveCash, 6);
  });

  it("\"Your Projection\" shows the dashboard's tax, per-deal tax portion, cash runway and Runway Score", () => {
    const d = dashboard(f);
    const seed = seedFor(f);
    const current = computeScenarioResult(seed, seedScenarioInputs(seed));
    expect(current.taxOwed).toBeCloseTo(d.taxResult.totalBurden, 6);
    expect(current.perDealSetAside).toBeCloseTo(d.taxResult.perDealSetAside, 6);
    expect(current.quarterlyInstalment).toBeCloseTo(d.taxResult.quarterlyEstimate, 6);
    expect(current.survivalMonths).toBeCloseTo(d.survival.months, 9);
    expect(current.pipelineMonthlyIncome).toBeCloseTo(d.survival.monthlyIncome, 9);
    expect(current.runwayScore).toBe(d.runwayScore.score);
    expect(current.runwayGrade).toBe(d.runwayScore.grade);
  });
});

describe("Scenario Engine seed: the cases the old seed got wrong", () => {
  it("an agent with two history years gets their own pattern, not the national one", () => {
    const f = FIXTURES[0];
    const before = seedBefore(f);
    const seed = seedFor(f);
    expect(seed.quarterPcts).not.toEqual(before.quarterPcts);
    expect(seasonalFractionElapsed(seed.quarterPcts)).not.toBeCloseTo(seasonalFractionElapsed(before.quarterPcts), 3);
  });

  it("an agent with the national pattern switched off and no history gets four equal quarters", () => {
    expect(seedFor(FIXTURES[1]).quarterPcts).toEqual([0.25, 0.25, 0.25, 0.25]);
  });

  it("listing appointments raise projected GCI by half their weighted GCI, as on the dashboard", () => {
    const f = FIXTURES[2];
    const without = seedFor({ ...f, listings: [] });
    const withListings = seedFor(f);
    expect(withListings.projectedAnnualGCI - without.projectedAnnualGCI).toBeCloseTo(computeListingWeightedGCI(LISTINGS) * 0.5, 6);
    // The pipeline figure the Runway Score and the runway read stays the pipeline's.
    expect(withListings.pipelineWeightedGCI).toBe(without.pipelineWeightedGCI);
  });

  it("the deal count is the projected year-end count, not deals to date", () => {
    const f = FIXTURES[1];
    expect(seedFor(f).projectedDealCount).toBe(dashboard(f).projectedDealCount);
    expect(seedFor(f).projectedDealCount).toBeGreaterThan(f.transactions.length);
  });

  it("the runway nets the pipeline income estimate", () => {
    const seed = seedFor(FIXTURES[1]);
    const current = computeScenarioResult(seed, seedScenarioInputs(seed));
    expect(current.pipelineMonthlyIncome).toBeGreaterThan(0);
    const cashOverBurn = survivalResult(seed.monthlyBrokerageFee, seed.monthlyRecurring, seed.cashReserve).months;
    expect(current.survivalMonths).toBeGreaterThan(cashOverBurn);
  });

  it("no settings row: no goal, four equal quarters, no cash", () => {
    const seed = buildScenarioSeed({
      settings: null, transactions: TRANSACTIONS, carryOverTx: [], pipelineDeals: PIPELINE, listings: [], historyItems: [], expenses: EXPENSES,
    });
    expect(seed.goalGCI).toBe(0);
    expect(seed.quarterPcts).toEqual([0.25, 0.25, 0.25, 0.25]);
    expect(seed.cashReserve).toBe(0);
  });
});

describe("Scenario Engine: the What If column", () => {
  it("with nothing changed it is \"Your Projection\"", () => {
    const seed = seedFor(FIXTURES[3]);
    const current = computeScenarioResult(seed, seedScenarioInputs(seed));
    const unchanged = computeScenarioResult(seed, { ...seedScenarioInputs(seed) });
    expect(unchanged).toEqual(current);
  });

  it("a higher GCI moves the benchmark the way it would on the dashboard", () => {
    const seed = seedFor(FIXTURES[3]);
    const inputs = seedScenarioInputs(seed);
    const higher = computeScenarioResult(seed, { ...inputs, annualGCI: inputs.annualGCI + 150_000 });
    const healthReport = buildHealthReport(
      seed.ytdGCI, seed.goalGCI, seasonalFractionElapsed(seed.quarterPcts), seed.pipelineWeightedGCI, seed.expensesYTD,
    );
    const expected = computeRunwayScore(
      healthReport,
      benchmarkCompare(inputs.annualGCI + 150_000, seed.experienceYears).percentile,
      higher.survivalMonths,
    );
    expect(higher.runwayScore).toBe(expected.score);
  });
});

// ── The pages read the dashboard page's rows ────────────────────────────────

const WEB = path.resolve(__dirname, "../..");
const read = (rel: string) => readFileSync(path.join(WEB, rel), "utf8");

/** The query chain from `.from("<table>")` to its `.limit(`, whitespace collapsed. */
function query(src: string, table: string): string {
  const start = src.indexOf(`.from("${table}")`);
  if (start < 0) return "";
  const end = src.indexOf(".limit(", start);
  return src.slice(start, end).replace(/\s+/g, " ").trim();
}

const SEED_PAGES = ["app/(app)/scenarios/page.tsx", "app/(app)/overhead/page.tsx"] as const;
const DASHBOARD_PAGE = read("app/(app)/dashboard/page.tsx");

describe.each(SEED_PAGES)("%s builds the seed through buildScenarioSeed", (page) => {
  const src = read(page);

  it("calls the one builder and works out no projection of its own", () => {
    expect(src).toContain("buildScenarioSeed(");
    for (const own of ["national_quarter_pcts", "seasonalFractionElapsed", "projectedYearEndGCI", "computeEffectiveCashForSurvival"]) {
      expect(src, own).not.toContain(own);
    }
  });

  it("reads listing appointments and history with the dashboard page's queries", () => {
    for (const table of ["listing_appointments", "history_items"]) {
      expect(query(src, table), table).not.toBe("");
      expect(query(src, table), table).toBe(query(DASHBOARD_PAGE, table));
    }
  });
});

describe("Scenarios page copy", () => {
  const content = read("app/(app)/scenarios/scenarios-content.tsx");

  it("labels the deal count as the projected count", () => {
    expect(content).toContain(">Projected Deal Count</label>");
  });

  it("says the deal count changes the tax on a REAL plan, and only the per-deal portion on a simple split", () => {
    const taxAt = (comp_plan: "simple_split" | "real", dealCount: number) => {
      const seed = buildScenarioSeed({
        settings: settingsWith({ comp_plan, real_join_date: "2025-03-01" }),
        transactions: [], carryOverTx: [], pipelineDeals: [], listings: [], historyItems: [], expenses: EXPENSES,
      });
      return computeScenarioResult(seed, { ...seedScenarioInputs(seed), annualGCI: 250_000, dealCount }).taxOwed;
    };
    expect(taxAt("simple_split", 8)).toBe(taxAt("simple_split", 20));
    expect(taxAt("real", 8)).not.toBe(taxAt("real", 20));
    expect(content).toMatch(/seed\.comp\?\.comp_plan === "real"\s*\?\s*"Changes the per-deal tax portion, and your plan's per-deal fees and so the tax"/);
    expect(content).toContain('"Only changes the per-deal tax portion. Total tax stays the same"');
  });
});

// ── Flight Crew's knowledge ─────────────────────────────────────────────────

describe("Flight Crew: the Scenario Engine's seed", () => {
  const playbook = getPlaybook("scenarios");
  const kb = KNOWLEDGE_BASE.split("\n").find((line) => line.startsWith("**SCENARIOS**")) ?? "";

  it("the playbook says Your Projection is the dashboard's figures, and what changed", () => {
    expect(playbook).toMatch(/Your Projection/);
    expect(playbook).toMatch(/Changed 2026-10-14/);
    for (const part of ["seasonal", "listing appointments", "projected deal count", "pipeline income", "benchmark"]) {
      expect(playbook.toLowerCase(), part).toContain(part);
    }
  });

  it("the knowledge base describes the page as it is, both places it appears", () => {
    expect(kb).toMatch(/Overhead/);
    expect(kb).toMatch(/Your Projection/);
    expect(kb).toMatch(/Changed 2026-10-14/);
    expect(kb).not.toMatch(/Conservative\/Base\/Optimistic/);
  });

  it("a question about Scenarios not matching the dashboard reaches the playbook", () => {
    const topics = classifyTopicMulti("why does the scenario engine show a different projected GCI than my dashboard?").map((t) => t.topic);
    expect(topics).toContain("scenarios");
  });
});
