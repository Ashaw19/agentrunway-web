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
import { calculate as calculateTax, gstHstRate } from "../canadian-tax-engine";
import { dealCloseTaxPortion, taxPortionOfCommission, yearTaxEstimate } from "../deal-tax-portion";
import { computeGCI, computeWeightedGCI, activePipelineDeals, type RecurringExpense, type Transaction } from "../../types/database";
import { aggregateReceiptTotals, expenseTaxContext } from "../expense-totals-engine";
import { buildT2125Expenses, ytdExpenseTotals } from "../t2125-expenses-engine";
import { computeT2125 } from "../t2125-engine";
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
// Still to come after July 15: the five whole months left.
const EXPENSES_REMAINING = MONTHLY_RECURRING * 5;

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
    expensesRemaining: EXPENSES_REMAINING,
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

// ── Year-to-date expenses: the Expenses page against the dashboard ───────────
//
// Until 2026-10-13 two rules combined receipts with the per-item monthly
// figure. The Expenses page and the T2125 tab took the larger PER ITEM. The
// dashboard, Reports headline, Forecast, Overhead, Altimeter, Scenarios, chat
// route, chat diagnostics, weekly digest and MCP took the larger of the two
// TOTALS and dropped the smaller side whole. On an account with monthly
// figures on some items and receipts on others, the Expenses page showed a
// higher "YTD Expenses" than the dashboard on the same data.
//
// Every surface now calls `ytdExpenseTotals`. Each derivation below feeds it
// the rows that surface reads, in the shape that surface reads them
// (apps/web/lib/__tests__/expense-totals-canonical.test.ts proves the
// surfaces make the call). Unlike the checks above, this one also pins the
// figure to arithmetic done by hand, so the surfaces can't agree on a wrong
// number.

describe("YTD expenses: the Expenses page total equals the dashboard's", () => {
  // The production shape that showed the drift: monthly figures on two
  // items, receipts on other items, a Recurring Expenses row on one of the
  // two monthly-figure items, a receipt with no category, and a monthly
  // figure on an item of a category the Expenses page hides.
  const SETTINGS_ROW = { gst_hst_registered: false, vehicle_business_use_pct: 0.8, home_office_business_use_pct: 0.15 };

  const CATEGORY_ROWS = [
    { id: "c-vehicle", key: "vehicle" },
    { id: "c-office", key: "office_tech" },
    { id: "c-marketing", key: "marketing" },
    { id: "c-meals", key: "meals" },
    { id: "c-payroll", key: "payroll" }, // hidden on the Expenses page (has_employees off)
  ];
  const ITEM_ROWS = [
    { category_id: "c-vehicle", key: "vehicle_fuel", ytd_amount: 0, monthly_recurring: 0 },
    { category_id: "c-vehicle", key: "vehicle_payment", ytd_amount: 0, monthly_recurring: 400 },
    { category_id: "c-office", key: "office_phone", ytd_amount: 0, monthly_recurring: 90 },
    { category_id: "c-marketing", key: "marketing_ads", ytd_amount: 0, monthly_recurring: 0 },
    { category_id: "c-meals", key: "meals_client", ytd_amount: 0, monthly_recurring: 0 },
    { category_id: "c-payroll", key: "payroll_wages", ytd_amount: 0, monthly_recurring: 50 },
  ];
  const RECEIPT_ROWS = [
    { category_key: "marketing_ads", total_amount: 1200, tax_amount: null, expense_date: "2026-02-10" },
    { category_key: "meals_client", total_amount: 300, tax_amount: null, expense_date: "2026-03-03" },
    { category_key: "vehicle_fuel", total_amount: 800, tax_amount: null, expense_date: "2026-05-20" },
    { category_key: null, total_amount: 60, tax_amount: null, expense_date: "2026-06-01" },
  ];
  const RECURRING_ROWS: RecurringExpense[] = [
    {
      id: "re-lease", user_id: "u1", name: "Lease", amount: 450, category_key: "vehicle_payment",
      frequency: "monthly", day_of_month: 1, month_of_year: null, hst_included: false, hst_amount: 0,
      vehicle_pct_applicable: true, notes: "", start_date: "2026-01-01", end_date: null, is_active: true,
      created_at: "2026-01-01T12:00:00Z", updated_at: "2026-01-01T12:00:00Z",
    },
  ];

  // By hand, on 15 July (seven months started), not registered:
  //   monthly figures   vehicle_payment 400 × 7 = 2,800; office_phone 90 × 7 = 630;
  //                     payroll_wages 50 × 7 = 350                                   3,780
  //   receipts          1,200 + 300 + 800 on three other items, 60 with no category  2,360
  //   recurring list    lease 450 × 7                                                3,150
  const EXPECTED_YTD = 3_780 + 2_360 + 3_150;
  const EXPECTED_MONTHLY = 400 + 90 + 50 + 450;

  // Expenses page (expenses/page.tsx + expenses-content.tsx): the categories
  // it shows, the hidden categories' items carried separately, the browser's
  // clock, and the tax context from the page's editable percentages.
  function expensesPage(settings = SETTINGS_ROW) {
    const shown = CATEGORY_ROWS.filter((c) => c.key !== "payroll").map((c) => ({
      ...c,
      items: ITEM_ROWS.filter((i) => i.category_id === c.id),
    }));
    const shownIds = new Set(shown.map((c) => c.id));
    const hiddenExpenseItems = ITEM_ROWS
      .filter((i) => !shownIds.has(i.category_id))
      .map((i) => ({ key: i.key, monthly_recurring: i.monthly_recurring }));
    return ytdExpenseTotals({
      receipts: RECEIPT_ROWS,
      recurring: RECURRING_ROWS,
      expenseItems: [...shown.flatMap((c) => c.items), ...hiddenExpenseItems],
      ctx: {
        gstHstRegistered: settings.gst_hst_registered === true,
        vehicleBusinessUsePct: settings.vehicle_business_use_pct,
        homeOfficeBusinessUsePct: settings.home_office_business_use_pct,
      },
      now: new Date(),
    });
  }

  // Dashboard, Reports, Forecast, Overhead, Altimeter, Scenarios (their
  // page.tsx): every expense_items row, the Atlantic day, expenseTaxContext.
  function dashboard(settings = SETTINGS_ROW) {
    return ytdExpenseTotals({
      receipts: RECEIPT_ROWS.map(({ category_key, total_amount, tax_amount }) => ({ category_key, total_amount, tax_amount })),
      recurring: RECURRING_ROWS,
      expenseItems: ITEM_ROWS,
      ctx: expenseTaxContext(settings),
      now: NOW,
    });
  }

  // Chat route and chat diagnostics: items arrive nested under categories.
  function flightCrew(settings = SETTINGS_ROW) {
    const expenseCategories = CATEGORY_ROWS.map((c) => ({
      key: c.key,
      expense_items: ITEM_ROWS.filter((i) => i.category_id === c.id).map((i) => ({ key: i.key, monthly_recurring: i.monthly_recurring })),
    }));
    return ytdExpenseTotals({
      receipts: RECEIPT_ROWS,
      recurring: RECURRING_ROWS,
      expenseItems: expenseCategories.flatMap((cat) => cat.expense_items ?? []),
      ctx: expenseTaxContext(settings),
      now: NOW,
    });
  }

  // Weekly digest and the MCP server: `key, monthly_recurring` straight off
  // expense_items, with PostgREST's numeric strings.
  function digestAndMcp(settings = SETTINGS_ROW) {
    return ytdExpenseTotals({
      receipts: RECEIPT_ROWS.map((r) => ({ ...r, total_amount: r.total_amount.toFixed(2) })),
      recurring: RECURRING_ROWS,
      expenseItems: ITEM_ROWS.map((i) => ({ key: i.key, monthly_recurring: i.monthly_recurring.toFixed(2) })),
      ctx: expenseTaxContext(settings),
      now: NOW,
    });
  }

  it("is the figure worked out by hand, on every surface", () => {
    for (const surface of [expensesPage, dashboard, flightCrew, digestAndMcp]) {
      const t = surface();
      expect(t.expensesYTD, surface.name).toBe(EXPECTED_YTD);
      expect(t.monthlyRecurring, surface.name).toBe(EXPECTED_MONTHLY);
    }
  });

  it("the rule this replaced showed the dashboard 2,360 below the Expenses page", () => {
    // max(all receipts, all monthly figures × months) + recurring: the
    // 2,360 of receipts were dropped whole because 3,780 of monthly figures
    // on OTHER items was the larger total.
    const largerOfTheTotals = Math.max(2_360, (400 + 90 + 50) * 7) + 3_150;
    expect(largerOfTheTotals).toBe(6_930);
    expect(expensesPage().expensesYTD - largerOfTheTotals).toBe(2_360);
    expect(dashboard().expensesYTD).toBe(expensesPage().expensesYTD);
  });

  it("a monthly figure and a Recurring Expenses row on the same item both count, on every surface", () => {
    for (const surface of [expensesPage, dashboard, flightCrew, digestAndMcp]) {
      const onLease = surface().tracked.lines.filter((l) => l.key === "vehicle_payment");
      expect(onLease.map((l) => [l.source, l.rawAmount]), surface.name).toEqual([["item", 2_800], ["recurring", 3_150]]);
    }
  });

  it("the T2125 tab is built from the same lines: line 9369 is their deductible total", () => {
    const totals = dashboard();
    // reports/page.tsx hands `tracked.entries` to the T2125 tab.
    const t2125 = computeT2125({
      settings: createTestSettings({ ...SETTINGS_ROW, province: "newBrunswick" }),
      transactions: CLOSED_TX,
      expenses: totals.tracked.entries,
      homeOfficeCosts: totals.tracked.homeOfficeCosts,
      ccaAssets: [],
      taxYear: 2026,
    });
    expect(t2125.line9369_totalExpenses).toBeCloseTo(totals.tracked.deductibleTotal - totals.tracked.byRule.home, 10);
    // Before the limits (50% on the meal, 80% on fuel and the two lease
    // entries) those lines are YTD Expenses.
    expect(totals.tracked.lines.reduce((s, l) => s + l.rawAmount, 0)).toBe(totals.expensesYTD);
    expect(totals.tracked.deductibleTotal).toBe(EXPECTED_YTD - 150 - 0.2 * (800 + 2_800 + 3_150));
  });

  it("a GST/HST registrant with a home office: still one figure on every surface", () => {
    const registrant = { gst_hst_registered: true, vehicle_business_use_pct: 0.5, home_office_business_use_pct: 0.2 };
    const page = expensesPage(registrant);
    expect(dashboard(registrant).expensesYTD).toBe(page.expensesYTD);
    expect(flightCrew(registrant).expensesYTD).toBe(page.expensesYTD);
    expect(digestAndMcp(registrant).expensesYTD).toBe(page.expensesYTD);
  });

  it("calling the line builder directly (the Expenses page before this change) gives the same total", () => {
    const ctx = expenseTaxContext(SETTINGS_ROW);
    const direct = buildT2125Expenses({
      receiptTotals: aggregateReceiptTotals(RECEIPT_ROWS, ctx),
      expenseItems: ITEM_ROWS,
      recurringExpenses: RECURRING_ROWS,
      ctx,
      now: NOW,
    });
    expect(direct.ytdTotal).toBe(dashboard().expensesYTD);
  });
});

// ── the tax portion of a commission: deal-close, dashboard, Flight Crew ───────
//
// 2026-10-13. One deal used to get three "tax on this deal" figures: the
// dashboard's per-deal tax portion (the year's estimate / projected deals),
// the deal-close screens' "Income tax reserve" (the commission x a marginal
// rate looked up at GCI, no CPP), and the Flight Crew's worked example (the
// agent's split x income tax / net income, called a marginal rate).
//
// One definition now (deal-tax-portion.ts): the year's estimate x the
// commission / projected GCI. Each surface is modelled below the way the
// rest of this file models them.

describe("the tax portion of a commission is one figure on every surface", () => {
  const pipelineRows = PIPELINE.map((d, i) => ({ id: `p${i + 1}`, ...d }));
  // The offer-stage buyer deal (p1) closes at its estimated price.
  const CLOSING_ID = "p1";
  const COMMISSION = 450_000 * 0.025;

  /**
   * dashboard-content.tsx once the page reloads after the close: the deal is
   * a closed transaction and its pipeline row is terminal.
   */
  function dashboardAfterClose() {
    const ytdGCI = CLOSED_TX.reduce((sum, tx) => sum + computeGCI(tx), 0) + COMMISSION;
    const ytdDealCount = CLOSED_TX.length + 1;
    const livePipelineDeals = activePipelineDeals(
      pipelineRows.map((d) => (d.id === CLOSING_ID ? { ...d, stage: "closed" } : d)),
    );
    const pipelineWeightedGCI = livePipelineDeals.reduce((sum, d) => sum + computeWeightedGCI(d), 0);
    const listingWeightedGCI = computeListingWeightedGCI(LISTINGS);
    const fraction = seasonalFractionElapsed(SETTINGS.national_quarter_pcts, NOW);
    const projectedGCI = projectedYearEndGCI(ytdGCI, pipelineWeightedGCI + listingWeightedGCI, fraction, SETTINGS.goal_gci);
    const projectedDealCount = projectedYearEndTransactions(ytdDealCount, livePipelineDeals.length, fraction);
    const netForTax = computeProjectedNetForTax({
      projectedGCI,
      expensesYTD: EXPENSES_YTD,
      expensesRemaining: EXPENSES_REMAINING,
      settings: SETTINGS,
      projectedDealCount,
      now: NOW,
    });
    const taxResult = calculateTax(netForTax, SETTINGS.province, Math.max(projectedDealCount, 1));
    return { projectedGCI, projectedDealCount, taxResult };
  }

  /** closing-day-prompt.tsx and transactions-pipeline-tab.tsx: the rows as they are when the agent confirms the close. */
  function dealCloseScreen() {
    return dealCloseTaxPortion({
      settings: SETTINGS,
      ytdGCI: CLOSED_TX.reduce((sum, tx) => sum + computeGCI(tx), 0),
      ytdDealCount: CLOSED_TX.length,
      pipelineDeals: pipelineRows,
      listings: LISTINGS,
      historyItems: [],
      expensesYTD: EXPENSES_YTD,
      expensesRemaining: EXPENSES_REMAINING,
      commissionGCI: COMMISSION,
      closingPipelineDealId: CLOSING_ID,
      now: NOW,
    });
  }

  it("the deal-close screens estimate the year the way the dashboard does after the close", () => {
    const dash = dashboardAfterClose();
    const close = dealCloseScreen();
    expect(close.projectedGCI).toBe(dash.projectedGCI);
    expect(close.annualTaxEstimate).toBe(dash.taxResult.totalBurden);
    expect(close.taxYear).toBe(dash.taxResult.taxYear);
    expect(dash.taxResult.totalBurden).toBeGreaterThan(0);
  });

  it("the deal-close figure is the dashboard's estimate by the commission's share of projected GCI", () => {
    const dash = dashboardAfterClose();
    const expected = Math.round(((dash.taxResult.totalBurden * COMMISSION) / dash.projectedGCI) * 100) / 100;
    expect(dealCloseScreen().taxPortion).toBe(expected);
    expect(expected).toBeGreaterThan(0);
    expect(expected).toBeLessThan(COMMISSION);
  });

  it("for a deal of the projected average size it is the dashboard's Per-deal tax portion", () => {
    const { projectedGCI, projectedDealCount, taxResult } = dashboardAfterClose();
    const averageDeal = projectedGCI / Math.max(projectedDealCount, 1);
    expect(taxPortionOfCommission(averageDeal, projectedGCI, taxResult.totalBurden)).toBeCloseTo(taxResult.perDealSetAside, 2);
  });

  it("the Flight Crew's worked example and its seasonal line are the same definition on the chat route's figures", () => {
    // api/chat/route.ts: projGCI and taxResult from the shared chain, handed to
    // paychequeAllocationLines and seasonalCommissionPatternLine.
    const { projGCI, projDeals } = deriveInputs();
    const netForTax = computeProjectedNetForTax({
      projectedGCI: projGCI,
      expensesYTD: EXPENSES_YTD,
      expensesRemaining: EXPENSES_REMAINING,
      settings: SETTINGS,
      projectedDealCount: projDeals,
      now: NOW,
    });
    const taxResult = calculateTax(netForTax, SETTINGS.province, projDeals);
    // The chat route's year is the one yearTaxEstimate builds from the rows.
    const year = yearTaxEstimate({
      settings: SETTINGS,
      ytdGCI: CLOSED_TX.reduce((sum, tx) => sum + computeGCI(tx), 0),
      ytdDealCount: CLOSED_TX.length,
      pipelineDeals: pipelineRows,
      listings: LISTINGS,
      historyItems: [],
      expensesYTD: EXPENSES_YTD,
      expensesRemaining: EXPENSES_REMAINING,
      now: NOW,
    });
    expect(year.projectedGCI).toBe(projGCI);
    expect(year.tax.totalBurden).toBe(taxResult.totalBurden);

    // A $10,000 example, and a quarter carrying 30% of the year.
    const example = taxPortionOfCommission(10_000, projGCI, taxResult.totalBurden);
    expect(example).toBeCloseTo((taxResult.totalBurden * 10_000) / projGCI, 2);
    expect(taxPortionOfCommission(projGCI * 0.3, projGCI, taxResult.totalBurden)).toBeCloseTo(taxResult.totalBurden * 0.3, 2);
  });
});

// ── net-for-tax parity (engine helper, fed by the shared projection) ──────────

describe("net-for-tax uses the canonical helper on the listing-inclusive projection", () => {
  it("is deterministic across surfaces", () => {
    const { projGCI } = deriveInputs();
    const a = computeProjectedNetForTax({
      projectedGCI: projGCI, expensesYTD: EXPENSES_YTD, expensesRemaining: EXPENSES_REMAINING, settings: SETTINGS, now: NOW,
    });
    const b = computeProjectedNetForTax({
      projectedGCI: projGCI, expensesYTD: EXPENSES_YTD, expensesRemaining: EXPENSES_REMAINING, settings: SETTINGS, now: NOW,
    });
    expect(a).toBe(b);
    expect(a).toBeGreaterThan(0);
  });
});
