/**
 * The MCP server's expense figures are the dashboard's (2026-10-13).
 *
 * Until this date the MCP tools summed `expense_items.ytd_amount`, a column
 * the app stopped writing when receipts replaced it. An account with
 * recorded expenses read as $0 (or as whatever the column last held), so
 * `ytd_expenses`, `ytd_net_income`, the tax estimate and `get_expenses` all
 * disagreed with the dashboard. `get_hst_status` reported a manually typed
 * settings number as the ITCs, which no account had filled in: $0.
 *
 * The dashboard (app/(app)/dashboard/page.tsx) makes one engine call,
 * `ytdExpenseTotals` (t2125-expenses-engine), over:
 *
 *   receipts   receipt_expenses, expense_date on or after Jan 1 (Atlantic year)
 *   recurring  recurring_expenses where is_active
 *   items      expense_items: each item's monthly estimate × months elapsed
 *
 *   expensesYTD = per expense item, the larger of its receipts and its
 *                 monthly estimate; plus receipts with no category; plus
 *                 recurring year to date
 *   still to come = monthly estimates × months after this one + recurring
 *                   charges after today
 *   annualExpenses = expensesYTD + still to come
 *
 * all net of the GST/HST a registrant claims as input tax credits
 * (expense-totals-engine, #297). It is the Expenses page's "YTD Expenses".
 * Until 2026-10-13 the dashboard and these tools compared the receipt TOTAL
 * with the estimate TOTAL instead and kept the larger, which dropped the
 * smaller side whole.
 *
 * These tests run the real tool handlers (tool-harness.ts) on fixtures and
 * compare them with figures worked out by hand in the comments, and with the
 * dashboard's call over the rows its queries return. They also pin the
 * dashboard's own lines: if the dashboard's inputs change, the pin fails and
 * names what to update on the MCP side.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { expenseTaxContext } from "@agent-runway/core/engines/expense-totals-engine";
import { ytdExpenseTotals } from "@agent-runway/core/engines/t2125-expenses-engine";
import {
  projectedYearEndGCI,
  seasonalFractionElapsed,
} from "@agent-runway/core/engines/projection-engine";
import { atlanticNoon } from "@agent-runway/core/lib/local-date";
import type { RecurringExpense } from "@agent-runway/core/types/database";
import { WEB_ROOT } from "./registry-source";
import { callTool, fakeSupabase, loadTools, type FakeSupabase, type Row } from "./tool-harness";

const USER = "user-under-test";
const OTHER = "someone-else";

/** Noon Atlantic on Tuesday 13 Oct 2026: the 10th month, Q3's deadline still ahead. */
const OCT_13 = new Date("2026-10-13T15:00:00Z");

// ── Fixtures ───────────────────────────────────────────────────────────────

function recurringRow(overrides: Partial<RecurringExpense>): RecurringExpense {
  return {
    id: "re",
    user_id: USER,
    name: "Recurring",
    amount: 0,
    category_key: "prof_board_mls",
    frequency: "monthly",
    day_of_month: 1,
    month_of_year: null,
    hst_included: true,
    hst_amount: 0,
    vehicle_pct_applicable: false,
    notes: "",
    start_date: "2026-01-01",
    end_date: null,
    is_active: true,
    created_at: "2026-01-01T12:00:00Z",
    updated_at: "2026-01-01T12:00:00Z",
    ...overrides,
  };
}

interface FixtureOptions {
  registered?: boolean;
  /** expense_items.monthly_recurring on the dues line (the legacy monthly estimate). */
  legacyMonthly?: number;
}

type ReceiptRow = {
  user_id: string;
  expense_date: string;
  category_key: string | null;
  total_amount: number;
  tax_amount: number | null;
};

type ItemRow = {
  user_id: string;
  key: string;
  title: string;
  ytd_amount: number;
  monthly_recurring: number;
  expense_categories: { key: string; title: string };
};

interface Fixture {
  /** Every table, as the fake client serves it. */
  tables: Record<string, Row[]>;
  settings: {
    user_id: string;
    gst_hst_registered: boolean;
    vehicle_business_use_pct: number;
    home_office_business_use_pct: number;
  };
  receipts: ReceiptRow[];
  recurring: RecurringExpense[];
  items: ItemRow[];
}

/**
 * A New Brunswick agent (15% HST) at 50% vehicle business use and a 20%
 * home office. Neither is the column default (80% and 0%), so a tool that
 * forgets to read one of them gets different numbers.
 */
function fixtures({ registered = true, legacyMonthly = 20 }: FixtureOptions = {}): Fixture {
  const settings = {
    user_id: USER,
    province: "newBrunswick",
    gst_hst_registered: registered,
    vehicle_business_use_pct: 0.5,
    home_office_business_use_pct: 0.2,
    brokerage_withholds_hst: false,
    filing_frequency: "quarterly",
    // The manually typed number get_hst_status used to report as the ITCs.
    gst_hst_paid_on_expenses: 4321,
    business_number: null,
    goal_gci: 200000,
    goal_transactions: 20,
    ytd_gci: 0,
    ytd_transactions: 0,
    use_national_seasonality: false,
    national_quarter_pcts: null,
    split_preset: "p100_0",
    post_cap_threshold_gci: 0,
    post_cap_agent_pct: 1,
    post_cap_brokerage_pct: 0,
    tx_fee_rate_pct: 0,
    tx_fee_annual_cap: 0,
    monthly_brokerage_fee: 0,
    comp_plan: "simple_split",
    runway_score_snapshot: { score: 72, grade: "C", month: "2026-10", components: [] },
  };

  const receipts: ReceiptRow[] = [
    // Registrant at 50% vehicle use →                                              net     ITC
    { user_id: USER, expense_date: "2026-02-01", category_key: "prof_board_mls", total_amount: 115, tax_amount: 15 }, //  100.00  15.00
    { user_id: USER, expense_date: "2026-05-20", category_key: "meals_client", total_amount: 57.5, tax_amount: 7.5 }, //   53.75   3.75
    { user_id: USER, expense_date: "2026-07-04", category_key: "vehicle_fuel", total_amount: 230, tax_amount: 30 }, //    200.00  15.00
    { user_id: USER, expense_date: "2026-08-08", category_key: null, total_amount: 46, tax_amount: 6 }, //                 40.00   6.00
    { user_id: USER, expense_date: "2026-09-09", category_key: "office_hardware", total_amount: 50, tax_amount: null }, // 50.00   0.00
    // Last year's, and another account's: never counted.
    { user_id: USER, expense_date: "2025-12-31", category_key: "prof_board_mls", total_amount: 1150, tax_amount: 150 },
    { user_id: OTHER, expense_date: "2026-03-03", category_key: "prof_board_mls", total_amount: 9999, tax_amount: 999 },
  ];

  const recurring: RecurringExpense[] = [
    // $575 a month, $75 HST, vehicle use: ITC 37.50, personal 37.50 → net 500.
    recurringRow({ id: "lease", name: "Car lease", amount: 575, hst_amount: 75, category_key: "vehicle_payment", vehicle_pct_applicable: true }),
    // $230 a quarter from Jan 15, $30 HST → net 200. Oct 15 has not come yet on Oct 13.
    recurringRow({ id: "dues", name: "Board dues", amount: 230, hst_amount: 30, frequency: "quarterly", day_of_month: 15, month_of_year: 1, start_date: "2025-01-01" }),
    recurringRow({ id: "old", name: "Cancelled", amount: 1000, hst_amount: 130, is_active: false }),
    recurringRow({ id: "theirs", user_id: OTHER, name: "Not mine", amount: 999, hst_amount: 0 }),
  ];

  const prof = { key: "prof", title: "Professional" };
  const vehicle = { key: "vehicle", title: "Vehicle" };
  // `ytd_amount` is the dead column: 7,777 must never reach an output.
  const items: ItemRow[] = [
    { user_id: USER, key: "prof_board_mls", title: "Board & MLS dues", ytd_amount: 7777, monthly_recurring: legacyMonthly, expense_categories: prof },
    { user_id: USER, key: "vehicle_fuel", title: "Fuel", ytd_amount: 0, monthly_recurring: 0, expense_categories: vehicle },
    { user_id: USER, key: "vehicle_payment", title: "Lease or loan payment", ytd_amount: 0, monthly_recurring: 0, expense_categories: vehicle },
    { user_id: OTHER, key: "prof_board_mls", title: "Board & MLS dues", ytd_amount: 5000, monthly_recurring: 5000, expense_categories: prof },
  ];

  const tables: Record<string, Row[]> = {
    user_settings: [settings, { ...settings, user_id: OTHER, gst_hst_registered: false }],
    transactions: [
      { user_id: USER, status: "closed", date: "2026-03-10", sale_price: 400000, commission_pct: 0.025, gci_override: null, team_split_pct: null },
      { user_id: USER, status: "closed", date: "2026-06-01", sale_price: 0, commission_pct: null, gci_override: 20000, team_split_pct: null },
      { user_id: USER, status: "closed", date: "2025-11-20", sale_price: 900000, commission_pct: 0.025, gci_override: null, team_split_pct: null },
      { user_id: OTHER, status: "closed", date: "2026-04-04", sale_price: 900000, commission_pct: 0.025, gci_override: null, team_split_pct: null },
    ],
    pipeline_deals: [],
    listing_appointments: [],
    history_items: [],
    receipt_expenses: receipts,
    recurring_expenses: recurring.map((r) => ({ ...r })),
    expense_items: items,
  };

  return { tables, settings, receipts, recurring, items };
}

/** The logbook rows of an account that has never kept one. */
const NO_LOGBOOK = { vehicles: [], periods: [], readings: [], trips: [] };

/**
 * The dashboard's expenses over the same fixture rows: the rows its queries
 * return, then its one engine call (page.tsx).
 */
function dashboardExpenses(fx: Fixture) {
  const today = atlanticNoon();
  const dashYear = today.getFullYear();

  const settingsRow = fx.settings;
  const receiptRows = fx.receipts.filter((r) => r.user_id === USER && r.expense_date >= `${dashYear}-01-01`);
  const recurringRows = fx.recurring.filter((r) => r.user_id === USER && r.is_active === true);
  const expenseItems = fx.items.filter((i) => i.user_id === USER);

  const expenseTotals = ytdExpenseTotals({
    receipts: receiptRows,
    recurring: recurringRows,
    expenseItems,
    // The fixture has no logbook rows, so the dashboard's loader
    // (loadVehicleLogbook) would return empty lists: the declared share.
    ctx: expenseTaxContext(settingsRow, { rows: NO_LOGBOOK, year: dashYear }),
    now: today,
  });
  const { expensesYTD, monthlyRecurring, expensesRemaining } = expenseTotals;

  // dashboard-content.tsx
  const annualExpenses = expensesYTD + expensesRemaining;

  // next-year-plan.tsx: the plan's "Business expenses" row.
  const { expensesNextYear } = expenseTotals;

  return { expensesYTD, monthlyRecurring, expensesRemaining, annualExpenses, expensesNextYear };
}

type ExpenseLine = { key: string | null; title: string; category: string; ytd_amount: number; monthly_recurring: number; end_date?: string };
type ExpensesOutput = {
  disclaimer: string;
  amounts: string;
  total_ytd: number;
  total_monthly_recurring: number;
  next_year_expenses: { year: number; total: number; recurring: number; formula: string };
  ytd_components: { receipts: number; monthly_estimates_above_receipts: number; recurring: number; formula: string };
  by_category: Array<{ category: string; ytd_total: number; monthly_recurring: number; top_items: string[] }>;
  all_items: ExpenseLine[];
};

async function analytics(db: FakeSupabase) {
  return loadTools("analytics.ts", "getAnalyticsTools", db, USER);
}
async function expenses(db: FakeSupabase) {
  return loadTools("expenses.ts", "getExpenseTools", db, USER);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(OCT_13);
});
afterEach(() => {
  vi.useRealTimers();
});

// ── get_dashboard_kpis ─────────────────────────────────────────────────────

describe("get_dashboard_kpis — expenses are the dashboard's", () => {
  it("registrant: receipts + monthly estimates + recurring, net of ITCs, not expense_items.ytd_amount", async () => {
    const fx = fixtures();
    const db = fakeSupabase(fx.tables);
    const out = await callTool(await analytics(db), "get_dashboard_kpis");

    // Receipts 443.75, of which 100 is board dues. The dues line also has a
    // $20 monthly estimate: 20 × 10 = 200, the larger of the two for that
    // item, so 100 more. Plus lease 500 × 10 + dues 200 × 3 = 6,143.75.
    expect(dashboardExpenses(fx).expensesYTD).toBe(6143.75);
    expect(out.ytd_expenses).toBe(6144);
    expect(out.ytd_gci).toBe(30000);
    expect(out.ytd_net_income).toBe(23856);
  });

  it("an estimate on one item no longer vanishes behind receipts on the others", async () => {
    const fx = fixtures();
    const out = await callTool(await analytics(fakeSupabase(fx.tables)), "get_dashboard_kpis");

    // The rule this replaced compared the totals: max(443.75 of receipts,
    // 200 of estimates) + 5,600 = 6,043.75, as if the estimate were not there.
    const largerOfTheTotals = Math.max(443.75, 20 * 10) + 5600;
    expect(dashboardExpenses(fx).expensesYTD - largerOfTheTotals).toBe(100);
    expect(out.ytd_expenses).toBe(Math.round(largerOfTheTotals + 100));
  });

  it("someone not registered for GST/HST: the amounts paid", async () => {
    const fx = fixtures({ registered: false });
    const out = await callTool(await analytics(fakeSupabase(fx.tables)), "get_dashboard_kpis");

    // 498.50 of receipts (dues 115, so the 200 estimate adds 85) + lease
    // 575 × 10 + dues 230 × 3.
    expect(dashboardExpenses(fx).expensesYTD).toBe(7023.5);
    expect(out.ytd_expenses).toBe(Math.round(7023.5));
  });

  it("an item's monthly estimate stands in for that item's receipts when it is the larger", async () => {
    const fx = fixtures({ legacyMonthly: 100 });
    const out = await callTool(await analytics(fakeSupabase(fx.tables)), "get_dashboard_kpis");

    // Board dues: 100 × 10 months = 1,000 against 100 of receipts. The other
    // 343.75 of receipts are on other items and still count.
    expect(dashboardExpenses(fx).expensesYTD).toBe(1000 + 343.75 + 5600);
    expect(out.ytd_expenses).toBe(6944);
  });

  it("reads the dashboard's tables with the dashboard's filters", async () => {
    const db = fakeSupabase(fixtures().tables);
    await callTool(await analytics(db), "get_dashboard_kpis");

    expect(db.queriesFor("receipt_expenses")).toEqual([
      {
        table: "receipt_expenses",
        columns: "category_key, total_amount, tax_amount",
        filters: [`eq(user_id,${USER})`, "gte(expense_date,2026-01-01)"],
        limit: 10000,
      },
    ]);
    expect(db.queriesFor("recurring_expenses")).toEqual([
      {
        table: "recurring_expenses",
        columns: "*",
        filters: [`eq(user_id,${USER})`, "eq(is_active,true)"],
        limit: 10000,
      },
    ]);

    const [items] = db.queriesFor("expense_items");
    expect(items.filters).toEqual([`eq(user_id,${USER})`]);
    expect(items.columns).toContain("monthly_recurring");
    // The estimate counts per item, so the item key is read with it.
    expect(items.columns.split(",").map((c) => c.trim())).toContain("key");
    expect(items.columns).not.toContain("ytd_amount");

    const settingsColumns = db.queriesFor("user_settings").map((q) => q.columns).join(", ");
    // The three inputs of expenseTaxContext.
    expect(settingsColumns).toContain("gst_hst_registered");
    expect(settingsColumns).toContain("vehicle_business_use_pct");
    expect(settingsColumns).toContain("home_office_business_use_pct");
  });

  it("on Dec 31 evening (already Jan 1 in UTC) the year is still the Atlantic one", async () => {
    vi.setSystemTime(new Date("2027-01-01T02:00:00Z")); // 10 pm AST, Dec 31 2026
    const fx = fixtures();
    const db = fakeSupabase(fx.tables);
    const out = await callTool(await analytics(db), "get_dashboard_kpis");

    expect(db.queriesFor("receipt_expenses")[0].filters).toContain("gte(expense_date,2026-01-01)");
    // Receipts 443.75 + 140 (the dues estimate, 20 × 12 = 240, over its 100
    // of receipts) + lease 500 × 12 + dues 200 × 4. In UTC it would be 2027:
    // no receipts yet and one month of the lease.
    expect(dashboardExpenses(fx).expensesYTD).toBe(7383.75);
    expect(out.ytd_expenses).toBe(7384);
  });
});

// ── get_tax_estimate ───────────────────────────────────────────────────────

describe("get_tax_estimate — projected net income uses the dashboard's expenses", () => {
  it("projected GCI less (expenses YTD + what is still to come this year)", async () => {
    const fx = fixtures();
    const out = await callTool(await analytics(fakeSupabase(fx.tables)), "get_tax_estimate");

    const dash = dashboardExpenses(fx);
    // 100% split, no fees: the agent's net is the projected GCI itself.
    const fraction = seasonalFractionElapsed([0.25, 0.25, 0.25, 0.25], new Date());
    const projectedGCI = projectedYearEndGCI(30000, 0, fraction, 200000);
    // dashboard-content.tsx: annualExpenses = expensesYTD + expensesRemaining.
    // Still to come on Oct 13: the lease on Nov 1 and Dec 1 (500 each), the
    // dues charge on Oct 15 (200, a real charge, not two months of a third of
    // it), and the legacy monthly figure for November and December (20 each).
    expect(dash.expensesRemaining).toBe(1000 + 200 + 40);
    expect(out.projected_net_income).toBe(Math.max(0, Math.round(projectedGCI - dash.annualExpenses)));
  });

  it("an explicit override_income is used as given", async () => {
    const out = await callTool(await analytics(fakeSupabase(fixtures().tables)), "get_tax_estimate", { override_income: 90000 });
    expect(out.projected_net_income).toBe(90000);
  });

  it("a cash-method agent's estimate counts last year's closing paid this year (core/engines/tax-year.ts)", async () => {
    // The fixture's November 20, 2025 closing ($22,500 GCI), paid January 9, 2026.
    const withPaidDate = (method: "accrual" | "cash") => {
      const fx = fixtures();
      return {
        ...fx.tables,
        user_settings: fx.tables.user_settings.map((r) => ({ ...r, income_reporting_method: method })),
        transactions: fx.tables.transactions.map((t) =>
          t.date === "2025-11-20" ? { ...t, commission_paid_date: "2026-01-09" } : { ...t, commission_paid_date: null },
        ),
      };
    };
    const cash = await callTool(await analytics(fakeSupabase(withPaidDate("cash"))), "get_tax_estimate");
    const accrual = await callTool(await analytics(fakeSupabase(withPaidDate("accrual"))), "get_tax_estimate");

    expect(cash.income_reporting_method).toBe("cash");
    expect(cash.tax_year_gci_adjustment).toBe(22_500);
    expect(accrual.income_reporting_method).toBe("accrual");
    expect(accrual.tax_year_gci_adjustment).toBe(0);
    // 100% split, no fees: the projected net moves by the commission itself.
    expect(cash.projected_net_income).toBe((accrual.projected_net_income as number) + 22_500);
    expect(cash.total_burden as number).toBeGreaterThan(accrual.total_burden as number);
    // Production stays on the closing date: the deal count the estimate divides by.
    expect(cash.projected_deal_count).toBe(accrual.projected_deal_count);
  });
});

// ── get_hst_status ─────────────────────────────────────────────────────────

describe("get_hst_status — ITCs come from receipts and recurring expenses", () => {
  it("registrant: itcForExpense over this year's receipts plus recurring charged to date", async () => {
    const out = await callTool(await analytics(fakeSupabase(fixtures().tables)), "get_hst_status");

    // Receipts 15 + 3.75 + 15 + 6 = 39.75. Lease: ten payments × 75 × 50% =
    // 375. Dues: Jan, Apr, Jul × 30 = 90. Total 504.75.
    expect(out.ytd_collected).toBe(4500); // 30,000 × 15%
    expect(out.itcs_paid_on_expenses).toBe(505);
    expect(out.net_owing).toBe(3995); // 4,500 − 504.75
    // The typed-in settings number is not an input any more.
    expect(JSON.stringify(out)).not.toContain("4321");
  });

  it("someone not registered claims no ITCs", async () => {
    const out = await callTool(await analytics(fakeSupabase(fixtures({ registered: false }).tables)), "get_hst_status");
    expect(out.ytd_collected).toBe(0);
    expect(out.itcs_paid_on_expenses).toBe(0);
    expect(out.net_owing).toBe(0);
  });

  it("does not read user_settings.gst_hst_paid_on_expenses", async () => {
    const db = fakeSupabase(fixtures().tables);
    await callTool(await analytics(db), "get_hst_status");
    for (const q of db.queriesFor("user_settings")) {
      expect(q.columns).not.toContain("gst_hst_paid_on_expenses");
    }
  });

  it("next filing deadline comes from filing-period-engine: Q4 is due Jan 31, not Mar 31", async () => {
    const tools = await analytics(fakeSupabase(fixtures().tables));
    expect((await callTool(tools, "get_hst_status")).next_filing_period).toEqual({
      label: "Q3 2026", period_start: "2026-07-01", period_end: "2026-09-30", deadline: "2026-10-31",
    });

    const q4 = { label: "Q4 2026", period_start: "2026-10-01", period_end: "2026-12-31", deadline: "2027-01-31" };
    vi.setSystemTime(new Date("2026-11-15T15:00:00Z"));
    expect((await callTool(tools, "get_hst_status")).next_filing_period).toEqual(q4);

    // In January the next deadline is still last year's Q4, not Q1's Apr 30.
    vi.setSystemTime(new Date("2027-01-15T15:00:00Z"));
    expect((await callTool(tools, "get_hst_status")).next_filing_period).toEqual(q4);
    vi.setSystemTime(new Date("2027-02-01T15:00:00Z"));
    expect((await callTool(tools, "get_hst_status")).next_filing_period).toMatchObject({ label: "Q1 2027", deadline: "2027-04-30" });
  });
});

// ── get_expenses ───────────────────────────────────────────────────────────

describe("get_expenses — the same total, with its lines", () => {
  it("total_ytd equals get_dashboard_kpis.ytd_expenses", async () => {
    const fx = fixtures();
    const out = await callTool<ExpensesOutput>(await expenses(fakeSupabase(fx.tables)), "get_expenses");
    const kpis = await callTool(await analytics(fakeSupabase(fx.tables)), "get_dashboard_kpis");

    expect(out.total_ytd).toBe(6143.75);
    expect(Math.round(out.total_ytd)).toBe(kpis.ytd_expenses);
    expect(out.total_monthly_recurring).toBe(586.67); // 20 + 500 + 200/3
    // 2027: 12 × the $20 monthly estimate, 12 lease charges of 500, 4 of dues at 200.
    expect(out.next_year_expenses).toMatchObject({ year: 2027, total: 7040, recurring: 6800 });
    expect(out.next_year_expenses.total).toBe(dashboardExpenses(fx).expensesNextYear);
    expect(out.ytd_components).toMatchObject({ receipts: 443.75, monthly_estimates_above_receipts: 100, recurring: 5600 });
    const { receipts, monthly_estimates_above_receipts, recurring } = out.ytd_components;
    expect(receipts + monthly_estimates_above_receipts + recurring).toBe(out.total_ytd);
  });

  it("lists receipts by expense line and each recurring expense, and they add up to the total", async () => {
    const out = await callTool<ExpensesOutput>(await expenses(fakeSupabase(fixtures().tables)), "get_expenses");
    const items = out.all_items;

    const line = (title: string) => items.find((i) => i.title === title);
    // 100 of receipts and a $20 monthly estimate (200 so far): the larger, once.
    expect(line("Board & MLS dues")).toMatchObject({ key: "prof_board_mls", category: "Professional", ytd_amount: 200, monthly_recurring: 20 });
    expect(line("Fuel")).toMatchObject({ key: "vehicle_fuel", category: "Vehicle", ytd_amount: 200 });
    expect(line("Car lease")).toMatchObject({ key: "vehicle_payment", category: "Vehicle", ytd_amount: 5000, monthly_recurring: 500 });
    expect(line("Board dues")).toMatchObject({ key: "prof_board_mls", category: "Professional", ytd_amount: 600, monthly_recurring: 66.67 });
    // A receipt saved with no category is still an expense (#270).
    expect(line("Uncategorized receipts")).toMatchObject({ key: null, ytd_amount: 40 });
    // A receipt whose key has no expense line of its own is still listed.
    expect(items.find((i) => i.key === "office_hardware")).toMatchObject({ ytd_amount: 50 });
    expect(line("Cancelled")).toBeUndefined();
    expect(line("Not mine")).toBeUndefined();

    const sum = items.reduce((s, i) => s + i.ytd_amount, 0);
    expect(sum).toBeCloseTo(out.total_ytd, 2);
    expect(items.reduce((s, i) => s + i.monthly_recurring, 0)).toBeCloseTo(out.total_monthly_recurring, 2);

    const categories = out.by_category;
    expect(categories.reduce((s, c) => s + c.ytd_total, 0)).toBeCloseTo(out.total_ytd, 2);
    expect(categories[0]).toMatchObject({ category: "Vehicle", ytd_total: 5200 });
  });

  it("a receipt or recurring expense filed under a category key lands in that category", async () => {
    const fx = fixtures();
    fx.tables.receipt_expenses.push({ user_id: USER, expense_date: "2026-04-01", category_key: "prof", total_amount: 10, tax_amount: null });
    fx.tables.recurring_expenses.push({ ...recurringRow({ id: "wash", name: "Car wash", amount: 20, category_key: "vehicle" }) });
    const out = await callTool<ExpensesOutput>(await expenses(fakeSupabase(fx.tables)), "get_expenses");

    expect(out.all_items.find((i) => i.key === "prof")).toMatchObject({ category: "Professional", ytd_amount: 10 });
    expect(out.all_items.find((i) => i.title === "Car wash")).toMatchObject({ category: "Vehicle", ytd_amount: 200 });
  });

  it("an expense under a built-in item the agent has no row for still lands in that item's category", async () => {
    // The production shape: recurring expenses under standard vehicle keys on
    // an account with no matching expense_items rows. The web's category
    // tables file them under Vehicle (expenseCategoryResolver); so does this.
    const fx = fixtures();
    fx.tables.recurring_expenses.push({ ...recurringRow({ id: "ins", name: "Car insurance", amount: 100, category_key: "vehicle_insurance" }) });
    const out = await callTool<ExpensesOutput>(await expenses(fakeSupabase(fx.tables)), "get_expenses");

    expect(fx.items.some((i) => i.key === "vehicle_insurance")).toBe(false);
    expect(out.all_items.find((i) => i.title === "Car insurance")).toMatchObject({ category: "Vehicle", ytd_amount: 1000 });
    // A key under a category the agent doesn't have at all has no title to show.
    expect(out.all_items.find((i) => i.key === "office_hardware")).toMatchObject({ category: "Other" });
  });

  it("an item whose monthly estimate exceeds its receipts shows the estimate on its own line, and the lines still add up", async () => {
    const fx = fixtures({ legacyMonthly: 100 });
    const out = await callTool<ExpensesOutput>(await expenses(fakeSupabase(fx.tables)), "get_expenses");

    // Board dues: 100 × 10 months = 1,000 of estimate against 100 of receipts.
    expect(out.total_ytd).toBe(6943.75);
    expect(out.all_items.find((i) => i.title === "Board & MLS dues")).toMatchObject({ ytd_amount: 1000, monthly_recurring: 100 });
    expect(out.ytd_components.monthly_estimates_above_receipts).toBe(900);
    // No filler line: every dollar of the total is on the line it belongs to.
    expect(out.all_items.find((i) => i.category === "Monthly estimates")).toBeUndefined();
    expect(out.all_items.reduce((s, i) => s + i.ytd_amount, 0)).toBeCloseTo(out.total_ytd, 2);
    expect(out.by_category.reduce((s, c) => s + c.ytd_total, 0)).toBeCloseTo(out.total_ytd, 2);
  });

  it("never reports the dead ytd_amount column", async () => {
    const db = fakeSupabase(fixtures().tables);
    const out = await callTool(await expenses(db), "get_expenses");
    expect(JSON.stringify(out)).not.toContain("7777");
    for (const q of db.queriesFor("expense_items")) expect(q.columns).not.toContain("ytd_amount");
  });

  it("says whether the amounts are net of ITCs", async () => {
    const registrant = await callTool<ExpensesOutput>(await expenses(fakeSupabase(fixtures().tables)), "get_expenses");
    const notRegistered = await callTool<ExpensesOutput>(await expenses(fakeSupabase(fixtures({ registered: false }).tables)), "get_expenses");
    expect(registrant.amounts).toMatch(/net of the GST\/HST/i);
    expect(notRegistered.amounts).toMatch(/as paid/i);
    expect(notRegistered.total_ytd).toBe(7023.5);
    // A home bill is never "as paid": the label says what share it counts at.
    expect(notRegistered.amounts).toContain("Home Office bills count at the 20% home office share, not in full.");
    expect(registrant.disclaimer).toMatch(/^Estimate only\./);

    const noShare = fixtures();
    noShare.tables.user_settings = noShare.tables.user_settings.map((s) => ({ ...s, home_office_business_use_pct: 0 }));
    const out = await callTool<ExpensesOutput>(await expenses(fakeSupabase(noShare.tables)), "get_expenses");
    expect(out.amounts).toContain("No home office share is set, so Home Office bills count for $0.");
  });
});

// ── Failed reads ───────────────────────────────────────────────────────────

describe("a failed expense read is an error, never $0 of expenses", () => {
  // With the expenses silently missing, net income and the tax estimate
  // would come out too high and look valid. protocol.ts turns the throw into
  // a JSON-RPC error.
  it.each(["receipt_expenses", "recurring_expenses", "expense_items", "user_settings"])(
    "%s: the expense tools reject",
    async (table) => {
      const db = () => fakeSupabase(fixtures().tables, { failTables: [table] });
      await expect(callTool(await analytics(db()), "get_dashboard_kpis")).rejects.toMatchObject({
        message: `simulated read failure on ${table}`,
      });
      await expect(callTool(await analytics(db()), "get_tax_estimate")).rejects.toBeDefined();
      await expect(callTool(await analytics(db()), "get_hst_status")).rejects.toBeDefined();
      await expect(callTool(await expenses(db()), "get_expenses")).rejects.toBeDefined();
    },
  );

  it("a brand-new account (no settings row, no expenses) gets zeros, not an error", async () => {
    const db = fakeSupabase({});
    expect(await callTool(await analytics(db), "get_dashboard_kpis")).toMatchObject({ ytd_expenses: 0, ytd_net_income: 0 });
    expect(await callTool(await analytics(db), "get_hst_status")).toMatchObject({ itcs_paid_on_expenses: 0, net_owing: 0 });
    expect(await callTool<ExpensesOutput>(await expenses(db), "get_expenses")).toMatchObject({ total_ytd: 0, all_items: [] });
    expect(await callTool(await analytics(db), "get_tax_estimate")).toMatchObject({ projected_net_income: 0 });
  });
});

// ── Home Office bills ──────────────────────────────────────────────────────

describe("Home Office bills count at the workspace share, as on the dashboard", () => {
  // A $230 power bill with $30 HST, at a 20% workspace. Registrant: ITC 6,
  // the bill before tax is 200, and 20% of it (40) is the expense.
  function withPowerBill(options: FixtureOptions = {}): Fixture {
    const fx = fixtures(options);
    // `fx.receipts` is the array the fake client serves as receipt_expenses.
    fx.receipts.push({ user_id: USER, expense_date: "2026-03-03", category_key: "home_utilities", total_amount: 230, tax_amount: 30 });
    return fx;
  }

  it("get_dashboard_kpis and get_expenses: 40 of the 230, not 230 and not 0", async () => {
    const fx = withPowerBill();
    const kpis = await callTool(await analytics(fakeSupabase(fx.tables)), "get_dashboard_kpis");
    const out = await callTool<ExpensesOutput>(await expenses(fakeSupabase(fx.tables)), "get_expenses");

    expect(dashboardExpenses(fx).expensesYTD).toBe(6143.75 + 40);
    expect(kpis.ytd_expenses).toBe(6184);
    expect(out.total_ytd).toBe(6183.75);
    expect(out.all_items.find((i) => i.key === "home_utilities")).toMatchObject({ ytd_amount: 40 });
  });

  it("get_hst_status: the ITC on the bill is the workspace share of its HST", async () => {
    const out = await callTool(await analytics(fakeSupabase(withPowerBill().tables)), "get_hst_status");
    expect(out.itcs_paid_on_expenses).toBe(511); // 504.75 + 30 × 20%
  });

  it("not registered: 20% of the whole bill, HST included", async () => {
    const fx = withPowerBill({ registered: false });
    const kpis = await callTool(await analytics(fakeSupabase(fx.tables)), "get_dashboard_kpis");
    expect(dashboardExpenses(fx).expensesYTD).toBe(7023.5 + 46);
    expect(kpis.ytd_expenses).toBe(Math.round(7023.5 + 46));
  });
});

// ── A charge later this month, and an expense that has ended ───────────────

describe("a recurring expense counts from its charge day, for expenses and ITCs alike", () => {
  // The base fixture charges on the 1st and the 15th. This one is charged on
  // the 20th: $115 a month with $15 HST, an ordinary expense (net 100, ITC 15).
  // Until 2026-10-13 the expenses counted October from the 1st (ten charges)
  // while the ITCs counted the charge day (nine): 150 of GST/HST came off the
  // expenses and 135 was claimed.
  function withRow(row: RecurringExpense): Fixture {
    const fx = fixtures();
    fx.recurring.push(row);
    fx.tables.recurring_expenses.push({ ...row });
    return fx;
  }
  const withPhonePlan = () =>
    withRow(recurringRow({ id: "phone", name: "Phone plan", amount: 115, hst_amount: 15, day_of_month: 20, start_date: "2025-06-01" }));

  const OCT_20 = new Date("2026-10-20T15:00:00Z");

  it("on Oct 13 nine charges are expenses, and nine charges of HST are ITCs", async () => {
    const fx = withPhonePlan();
    const kpis = await callTool(await analytics(fakeSupabase(fx.tables)), "get_dashboard_kpis");
    const hst = await callTool(await analytics(fakeSupabase(fx.tables)), "get_hst_status");
    const out = await callTool<ExpensesOutput>(await expenses(fakeSupabase(fx.tables)), "get_expenses");

    // 6,143.75 without it (see get_dashboard_kpis above), plus nine charges.
    expect(dashboardExpenses(fx).expensesYTD).toBe(6143.75 + 9 * 100);
    expect(kpis.ytd_expenses).toBe(7044);
    expect(out.total_ytd).toBe(7043.75);
    expect(out.all_items.find((i) => i.title === "Phone plan")).toMatchObject({ ytd_amount: 900, monthly_recurring: 100 });
    expect(out.all_items.reduce((s, i) => s + i.ytd_amount, 0)).toBeCloseTo(out.total_ytd, 2);
    // 504.75 without it, plus 9 × 15: the GST/HST that came off the expenses.
    expect(hst.itcs_paid_on_expenses).toBe(640);
  });

  it("on Oct 20 the tenth charge is in both", async () => {
    vi.setSystemTime(OCT_20);
    const fx = withPhonePlan();
    const kpis = await callTool(await analytics(fakeSupabase(fx.tables)), "get_dashboard_kpis");
    const hst = await callTool(await analytics(fakeSupabase(fx.tables)), "get_hst_status");

    // The quarterly dues were charged on Oct 15 as well: 200 net, 30 of HST.
    expect(dashboardExpenses(fx).expensesYTD).toBe(6143.75 + 200 + 10 * 100);
    expect(kpis.ytd_expenses).toBe(7344);
    expect(hst.itcs_paid_on_expenses).toBe(685); // 504.75 + 30 + 10 × 15 = 684.75
  });

  it("the year's expenses behind the tax estimate do not move when the charge lands", async () => {
    const fx = withPhonePlan();
    const projected = async () => {
      const out = await callTool(await analytics(fakeSupabase(fx.tables)), "get_tax_estimate");
      const fraction = seasonalFractionElapsed([0.25, 0.25, 0.25, 0.25], new Date());
      return { out, projectedGCI: projectedYearEndGCI(30000, 0, fraction, 200000), dash: dashboardExpenses(fx) };
    };

    // 7,383.75 without it (6,143.75 to date; still to come: the dues'
    // monthly estimate for two months, two lease payments and the Oct 15
    // dues), plus twelve charges of 100: three of them (Oct 20, Nov 20,
    // Dec 20) still to come on Oct 13, two on Oct 20.
    const before = await projected();
    expect(before.dash.annualExpenses).toBe(8583.75);
    expect(before.out.projected_net_income).toBe(Math.round(before.projectedGCI - 8583.75));

    vi.setSystemTime(OCT_20);
    const after = await projected();
    expect(after.dash.annualExpenses).toBe(8583.75);
    expect(after.out.projected_net_income).toBe(Math.round(after.projectedGCI - 8583.75));
  });

  it("an expense with an end date keeps its charges up to that date, in the expenses and in the ITCs", async () => {
    // Ended Mar 31 and still active: Jan, Feb and Mar 1 count, nothing since.
    const fx = withRow(recurringRow({ id: "ended", name: "Old CRM", amount: 115, hst_amount: 15, end_date: "2026-03-31" }));
    const kpis = await callTool(await analytics(fakeSupabase(fx.tables)), "get_dashboard_kpis");
    const hst = await callTool(await analytics(fakeSupabase(fx.tables)), "get_hst_status");
    const out = await callTool<ExpensesOutput>(await expenses(fakeSupabase(fx.tables)), "get_expenses");

    expect(dashboardExpenses(fx).expensesYTD).toBe(6143.75 + 3 * 100);
    expect(kpis.ytd_expenses).toBe(6444);
    expect(out.all_items.find((i) => i.title === "Old CRM")).toMatchObject({ ytd_amount: 300 });
    expect(hst.itcs_paid_on_expenses).toBe(550); // 504.75 + 3 × 15 = 549.75
    // Nothing more of it is projected for the rest of the year.
    expect(dashboardExpenses(fx).annualExpenses).toBe(7383.75 + 300);
  });

  // The monthly figure is what the list is expected to cost from here on.
  // Until 2026-10-13 it had no date, so an ended expense stayed in it.
  it("an ended expense is out of the monthly figures, and its line carries the end date", async () => {
    const fx = withRow(recurringRow({ id: "ended", name: "Old CRM", amount: 115, hst_amount: 15, end_date: "2026-03-31" }));
    const out = await callTool<ExpensesOutput>(await expenses(fakeSupabase(fx.tables)), "get_expenses");
    const without = await callTool<ExpensesOutput>(await expenses(fakeSupabase(fixtures().tables)), "get_expenses");

    expect(out.all_items.find((i) => i.title === "Old CRM")).toEqual({
      key: "prof_board_mls", title: "Old CRM", category: "Professional",
      ytd_amount: 300, monthly_recurring: 0, end_date: "2026-03-31",
    });
    expect(out.total_monthly_recurring).toBe(without.total_monthly_recurring);
    expect(out.next_year_expenses).toEqual(without.next_year_expenses);
    expect(out.total_monthly_recurring).toBeCloseTo(dashboardExpenses(fx).monthlyRecurring, 2);
    expect(out.all_items.reduce((s, i) => s + i.monthly_recurring, 0)).toBeCloseTo(out.total_monthly_recurring, 2);
    // Its year to date is still in the total.
    expect(out.total_ytd).toBe(without.total_ytd + 300);
  });

  it("an end date still ahead: the expense stays in the monthly figures until the day after", async () => {
    const fx = withRow(recurringRow({ id: "ending", name: "Office rent", amount: 115, hst_amount: 15, end_date: "2026-10-13" }));
    const without = await callTool<ExpensesOutput>(await expenses(fakeSupabase(fixtures().tables)), "get_expenses");

    const today = await callTool<ExpensesOutput>(await expenses(fakeSupabase(fx.tables)), "get_expenses");
    expect(today.all_items.find((i) => i.title === "Office rent")).toMatchObject({ monthly_recurring: 100, end_date: "2026-10-13" });
    expect(today.total_monthly_recurring).toBe(without.total_monthly_recurring + 100);

    vi.setSystemTime(new Date("2026-10-14T15:00:00Z"));
    const tomorrow = await callTool<ExpensesOutput>(await expenses(fakeSupabase(fx.tables)), "get_expenses");
    expect(tomorrow.all_items.find((i) => i.title === "Office rent")).toMatchObject({ monthly_recurring: 0, end_date: "2026-10-13" });
    expect(tomorrow.total_monthly_recurring).toBe(without.total_monthly_recurring);
  });

  it("on the evening of its end date (already the next day in UTC) the expense is still in the monthly figure", async () => {
    // 10 pm Atlantic on Oct 13 is 01:00 UTC on Oct 14.
    vi.setSystemTime(new Date("2026-10-14T01:00:00Z"));
    const fx = withRow(recurringRow({ id: "ending", name: "Office rent", amount: 115, hst_amount: 15, end_date: "2026-10-13" }));
    const out = await callTool<ExpensesOutput>(await expenses(fakeSupabase(fx.tables)), "get_expenses");
    expect(out.all_items.find((i) => i.title === "Office rent")).toMatchObject({ monthly_recurring: 100 });
  });

  it("a line with no end date carries none", async () => {
    const out = await callTool<ExpensesOutput>(await expenses(fakeSupabase(fixtures().tables)), "get_expenses");
    for (const line of out.all_items) expect(line).not.toHaveProperty("end_date");
  });

  // Next year's expenses are the figure the dashboard's next-year plan
  // deducts: the charge dates that fall in that year. Until 2026-10-13 this
  // tool reported the monthly figure × 12 as `projected_annual_recurring`,
  // which counted an expense known to stop for the whole of next year.
  it("next year leaves out an expense that ends on Dec 31, while the monthly figure still carries it", async () => {
    const fx = withRow(recurringRow({ id: "ending", name: "Office rent", amount: 115, hst_amount: 15, end_date: "2026-12-31" }));
    const out = await callTool<ExpensesOutput>(await expenses(fakeSupabase(fx.tables)), "get_expenses");
    const without = await callTool<ExpensesOutput>(await expenses(fakeSupabase(fixtures().tables)), "get_expenses");

    expect(out.total_monthly_recurring).toBe(without.total_monthly_recurring + 100);
    expect(out.next_year_expenses).toEqual(without.next_year_expenses);
    expect(out.next_year_expenses.total).toBe(dashboardExpenses(fx).expensesNextYear);
    expect(out).not.toHaveProperty("projected_annual_recurring");
  });

  it("next year counts an expense that ends or starts part-way through it by its charge dates", async () => {
    const ends = withRow(recurringRow({ id: "ends", name: "Office rent", amount: 115, hst_amount: 15, end_date: "2027-06-30" }));
    const endsOut = await callTool<ExpensesOutput>(await expenses(fakeSupabase(ends.tables)), "get_expenses");
    // January through June: six charges of 100 net.
    expect(endsOut.next_year_expenses).toMatchObject({ year: 2027, total: 7640, recurring: 7400 });
    expect(endsOut.next_year_expenses.total).toBe(dashboardExpenses(ends).expensesNextYear);

    const starts = withRow(recurringRow({ id: "starts", name: "New CRM", amount: 115, hst_amount: 15, start_date: "2027-07-01" }));
    const startsOut = await callTool<ExpensesOutput>(await expenses(fakeSupabase(starts.tables)), "get_expenses");
    // July through December. It is scheduled, so the monthly figure already has it.
    expect(startsOut.next_year_expenses).toMatchObject({ year: 2027, total: 7640, recurring: 7400 });
    expect(startsOut.total_monthly_recurring).toBe(endsOut.total_monthly_recurring);
  });

  it("next year is named, and on Dec 31 evening (already Jan 1 in UTC) it is still the coming Atlantic year", async () => {
    vi.setSystemTime(new Date("2027-01-01T02:00:00Z"));
    const out = await callTool<ExpensesOutput>(await expenses(fakeSupabase(fixtures().tables)), "get_expenses");
    expect(out.next_year_expenses.year).toBe(2027);
    expect(out.next_year_expenses.formula).toMatch(/charge dates/);
  });
});

// ── get_runway_score ───────────────────────────────────────────────────────

describe("get_runway_score — reports the stored snapshot, computes nothing", () => {
  it("reads only user_settings.runway_score_snapshot", async () => {
    const db = fakeSupabase(fixtures().tables);
    const out = await callTool(await analytics(db), "get_runway_score");

    expect(out.score).toBe(72);
    expect(db.queries.map((q) => q.table)).toEqual(["user_settings"]);
    expect(db.queries[0].columns).toBe("runway_score_snapshot");
  });
});

// ── Source pins ────────────────────────────────────────────────────────────

const read = (rel: string) => readFileSync(path.join(WEB_ROOT, rel), "utf8");
const squash = (src: string) => src.replace(/\s+/g, " ");
/** Source with comments removed, so a comment that names a dead column doesn't trip a pin. */
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("the dashboard lines the MCP mirrors have not moved", () => {
  // If one of these fails, the dashboard's expense inputs changed. Make the
  // same change in `loadExpenseInputs` (supabase/functions/mcp-server/lib/
  // expense-inputs.ts), then update the pin. The formula itself can't move
  // apart: both sides call `ytdExpenseTotals` (packages/core/engines/
  // t2125-expenses-engine.ts).
  it("page.tsx: receipts, recurring and item queries, Atlantic calendar, one engine call", () => {
    const page = squash(read("app/(app)/dashboard/page.tsx"));
    for (const line of [
      'const today = atlanticNoon();',
      'const dashYear = today.getFullYear();',
      '.from("receipt_expenses") .select("category_key, total_amount, tax_amount") .eq("user_id", user.id) .gte("expense_date", `${dashYear}-01-01`) .limit(10000)',
      '.from("recurring_expenses") .select("*") .eq("user_id", user.id) .eq("is_active", true) .limit(10000)',
      '.from("expense_items") .select("*") .eq("user_id", user.id) .limit(10000)',
      // The vehicle share: the logbook's for the year when it covers it (2026-10-18).
      "const logbookPromise = loadVehicleLogbook(supabase, user.id, dashYear);",
      "const expenseCtx = expenseTaxContext(settingsRow, await logbookPromise);",
      "const expenseTotals = ytdExpenseTotals({ receipts: receiptTotalsResult.data, recurring: (recurringExpResult.data ?? []) as RecurringExpense[], expenseItems: expItemResult.data, ctx: expenseCtx, now: today, });",
      "expensesYTD={expenseTotals.expensesYTD}",
      "monthlyRecurring={expenseTotals.monthlyRecurring}",
      "expensesRemaining={expenseTotals.expensesRemaining}",
      "expensesNextYear={expenseTotals.expensesNextYear}",
    ]) {
      expect(page, line).toContain(line);
    }
  });

  it("dashboard-content.tsx: takes the two totals as given and combines nothing", () => {
    const content = squash(code(read("app/(app)/dashboard/dashboard-content.tsx")));
    for (const line of [
      "const annualExpenses = expensesYTD + expensesRemaining;",
      // Expenses are net of ITCs, so no ITC comes off the HST owing as well.
      "const ytdHstOnExpenses = 0;",
    ]) {
      expect(content, line).toContain(line);
    }
    // The rule this replaced: the larger of the receipt total and the
    // monthly-figure total, worked out in the component.
    expect(content).not.toMatch(/const expensesYTD\b|const monthlyRecurring\b|legacyRecurringYTDEstimate|legacyMonthlyRecurring/);
  });

  it("the dashboard's logbook loader: the core rows, the year, the Atlantic day", () => {
    const load = squash(read("lib/vehicle-logbook/load.ts"));
    expect(load).toContain("const rows = await loadLogbookRowsOrNull(supabase, userId, year);");
    expect(load).toContain("return { rows, year, today: atlanticISODate() };");
  });

  it("the MCP loader makes the dashboard's call", () => {
    const loader = squash(read("supabase/functions/mcp-server/lib/expense-inputs.ts"));
    expect(loader).toContain("totals: ytdExpenseTotals({ receipts, recurring, expenseItems: items, ctx: taxCtx, now: today }),");
    // The same logbook rows and year the dashboard's loader passes.
    expect(loader).toContain("loadLogbookRowsOrNull(supabase, userId, year),");
    expect(loader).toContain("const taxCtx = expenseTaxContext(settingsRes.data, { rows: logbookRows, year, today: todayISO });");
  });
});

describe("the MCP server reads no dead or manual expense column", () => {
  const MCP = "supabase/functions/mcp-server";
  const sources = () =>
    ["tools/analytics.ts", "tools/expenses.ts", "lib/expense-inputs.ts", "lib/effective-cash.ts", "lib/hst-engine.ts"]
      .map((f) => ({ file: f, src: code(read(`${MCP}/${f}`)) }));

  it("expense_items.ytd_amount: nothing has written it since receipts replaced it", () => {
    // Column names reach PostgREST as strings (select lists, order keys).
    // `ytd_amount` as a field of a tool's own output is not a read.
    const strings = (src: string) =>
      [...src.matchAll(/"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g)].map((m) => m[0]);
    expect(strings('.select("key, ytd_amount")').join()).toMatch(/\bytd_amount\b/);
    expect(strings(".select(`\n  key, ytd_amount\n`)").join()).toMatch(/\bytd_amount\b/);
    for (const { file, src } of sources()) {
      expect(strings(src).filter((str) => /\bytd_amount\b/.test(str)), file).toEqual([]);
    }
  });

  it("user_settings.gst_hst_paid_on_expenses: a typed-in number, not the ITCs on recorded expenses", () => {
    for (const { file, src } of sources()) expect(src, file).not.toMatch(/gst_hst_paid_on_expenses/);
  });

  it("the tools total expenses through the canonical engine, never by hand", () => {
    const loader = read(`${MCP}/lib/expense-inputs.ts`);
    expect(loader).toContain("ytdExpenseTotals(");
    expect(loader).toContain("inputTaxCreditsForPeriod(");
    expect(loader).toContain("_shared/core/engines/expense-totals-engine.ts");
    expect(loader).toContain("_shared/core/engines/t2125-expenses-engine.ts");
    for (const file of ["tools/analytics.ts", "tools/expenses.ts"]) {
      const src = code(read(`${MCP}/${file}`));
      expect(src, file).toContain("loadExpenseInputs(");
      expect(src, file).not.toMatch(/\.from\(\s*["'](?:receipt_expenses|recurring_expenses|expense_items)["']/);
    }
  });

  it("effective-cash mirror: expenses arrive net, so it takes no ITC off anything", () => {
    // packages/core/engines/effective-cash.ts dropped its ITC estimate in
    // #297 (`ytdHstOnExpenses = 0`). The Deno mirror only carries the
    // net-for-tax and pipeline helpers and never had one: keep it that way.
    const mirror = code(read(`${MCP}/lib/effective-cash.ts`));
    expect(mirror).not.toMatch(/HstOnExpenses|hstRate|1 \+ rate/);
    expect(squash(mirror)).toContain("const annualExpenses = expensesYTD + expensesRemaining;");
    const core = squash(read("../../packages/core/engines/effective-cash.ts"));
    expect(core).toContain("const annualExpenses = expensesYTD + expensesRemaining;");
    // Still to come is the engine's count of charge dates, on both sides.
    expect(read(`${MCP}/tools/analytics.ts`)).toContain("expenseInputs.totals.expensesRemaining");
    expect(read("../../packages/core/engines/t2125-expenses-engine.ts")).toContain(
      "expensesRemaining: remainingYearExpenses(legacyMonthlyRecurring, recurringRemaining, inputs.now),",
    );
    expect(core).toContain("const ytdHstOnExpenses = 0;");
  });
});
