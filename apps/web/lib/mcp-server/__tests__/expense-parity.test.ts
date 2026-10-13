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
 * The dashboard (app/(app)/dashboard/page.tsx + dashboard-content.tsx):
 *
 *   receipts   receipt_expenses, expense_date on or after Jan 1 (Atlantic year)
 *   recurring  recurring_expenses where is_active
 *   legacy     expense_items.monthly_recurring × months elapsed
 *   expensesYTD = max(receipts, legacy) + recurring YTD
 *
 * all net of the GST/HST a registrant claims as input tax credits
 * (expense-totals-engine, #297).
 *
 * These tests run the real tool handlers (tool-harness.ts) on fixtures and
 * compare them with that chain, computed here from the same engines the
 * dashboard calls. They also pin the dashboard's own lines: if the
 * dashboard's inputs or formula change, the pin fails and names what to
 * update on the MCP side.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  aggregateReceiptTotals,
  expenseTaxContext,
  recurringExpensesNetOfItc,
} from "@agent-runway/core/engines/expense-totals-engine";
import {
  totalRecurringMonthly,
  totalRecurringYTD,
} from "@agent-runway/core/engines/recurring-expense-engine";
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

/**
 * The dashboard's expense chain over the same fixture rows: the rows its
 * queries return (page.tsx), then page.tsx and dashboard-content.tsx line
 * for line.
 */
function dashboardExpenses(fx: Fixture) {
  const today = atlanticNoon();
  const dashYear = today.getFullYear();

  const settingsRow = fx.settings;
  const receiptRows = fx.receipts.filter((r) => r.user_id === USER && r.expense_date >= `${dashYear}-01-01`);
  const recurringRows = fx.recurring.filter((r) => r.user_id === USER && r.is_active === true);
  const expenseItems = fx.items.filter((i) => i.user_id === USER);

  // page.tsx
  const taxCtx = expenseTaxContext(settingsRow);
  const recurringExpenses = recurringExpensesNetOfItc(recurringRows, taxCtx);
  const recurringExpMonthly = totalRecurringMonthly(recurringExpenses);
  const recurringExpYTD = totalRecurringYTD(recurringExpenses, today);
  const receiptYTD = aggregateReceiptTotals(receiptRows, taxCtx).total;

  // dashboard-content.tsx
  const receiptTotal = receiptYTD;
  const legacyMonthlyRecurring = expenseItems.reduce((s, i) => s + Number(i.monthly_recurring), 0);
  const monthlyRecurring = legacyMonthlyRecurring + recurringExpMonthly;
  const expMonthsElapsed = today.getMonth() + 1;
  const legacyRecurringYTDEstimate = legacyMonthlyRecurring * expMonthsElapsed;
  const expensesYTD = Math.max(receiptTotal, legacyRecurringYTDEstimate) + recurringExpYTD;

  return { expensesYTD, monthlyRecurring, receiptYTD, recurringExpYTD, legacyRecurringYTDEstimate };
}

type ExpenseLine = { key: string | null; title: string; category: string; ytd_amount: number; monthly_recurring: number };
type ExpensesOutput = {
  disclaimer: string;
  amounts: string;
  total_ytd: number;
  total_monthly_recurring: number;
  projected_annual_recurring: number;
  ytd_components: { receipts: number; recurring: number; monthly_estimates: number };
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
  it("registrant: receipts + recurring, net of ITCs, not expense_items.ytd_amount", async () => {
    const fx = fixtures();
    const db = fakeSupabase(fx.tables);
    const out = await callTool(await analytics(db), "get_dashboard_kpis");

    // Receipts 443.75 (legacy estimate 20 × 10 = 200 is smaller) + lease
    // 500 × 10 + dues 200 × 3 = 6,043.75.
    expect(dashboardExpenses(fx).expensesYTD).toBe(6043.75);
    expect(out.ytd_expenses).toBe(6044);
    expect(out.ytd_gci).toBe(30000);
    expect(out.ytd_net_income).toBe(23956);
  });

  it("someone not registered for GST/HST: the amounts paid", async () => {
    const fx = fixtures({ registered: false });
    const out = await callTool(await analytics(fakeSupabase(fx.tables)), "get_dashboard_kpis");

    // 498.50 of receipts + lease 575 × 10 + dues 230 × 3.
    expect(dashboardExpenses(fx).expensesYTD).toBe(6938.5);
    expect(out.ytd_expenses).toBe(Math.round(6938.5));
  });

  it("the legacy monthly estimate stands in for receipts when it is the larger", async () => {
    const fx = fixtures({ legacyMonthly: 100 });
    const out = await callTool(await analytics(fakeSupabase(fx.tables)), "get_dashboard_kpis");

    // 100 × 10 months = 1,000 > 443.75 of receipts.
    expect(dashboardExpenses(fx).expensesYTD).toBe(6600);
    expect(out.ytd_expenses).toBe(6600);
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
    // Receipts 443.75 + lease 500 × 12 + dues 200 × 4. In UTC it would be
    // 2027: no receipts yet and one month of the lease.
    expect(dashboardExpenses(fx).expensesYTD).toBe(7243.75);
    expect(out.ytd_expenses).toBe(7244);
  });
});

// ── get_tax_estimate ───────────────────────────────────────────────────────

describe("get_tax_estimate — projected net income uses the dashboard's expenses", () => {
  it("projected GCI less (expenses YTD + monthly recurring × months left)", async () => {
    const fx = fixtures();
    const out = await callTool(await analytics(fakeSupabase(fx.tables)), "get_tax_estimate");

    const dash = dashboardExpenses(fx);
    // 100% split, no fees: the agent's net is the projected GCI itself.
    const fraction = seasonalFractionElapsed([0.25, 0.25, 0.25, 0.25], new Date());
    const projectedGCI = projectedYearEndGCI(30000, 0, fraction, 200000);
    // dashboard-content.tsx: annualExpenses = expensesYTD + monthlyRecurring × expRemainingMonths
    const annualExpenses = dash.expensesYTD + dash.monthlyRecurring * (12 - 10);

    expect(dash.monthlyRecurring).toBeCloseTo(20 + 500 + 200 / 3, 10);
    expect(out.projected_net_income).toBe(Math.max(0, Math.round(projectedGCI - annualExpenses)));
  });

  it("an explicit override_income is used as given", async () => {
    const out = await callTool(await analytics(fakeSupabase(fixtures().tables)), "get_tax_estimate", { override_income: 90000 });
    expect(out.projected_net_income).toBe(90000);
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

    expect(out.total_ytd).toBe(6043.75);
    expect(Math.round(out.total_ytd)).toBe(kpis.ytd_expenses);
    expect(out.total_monthly_recurring).toBe(586.67); // 20 + 500 + 200/3
    expect(out.projected_annual_recurring).toBe(7040);
    expect(out.ytd_components).toMatchObject({ receipts: 443.75, recurring: 5600, monthly_estimates: 200 });
  });

  it("lists receipts by expense line and each recurring expense, and they add up to the total", async () => {
    const out = await callTool<ExpensesOutput>(await expenses(fakeSupabase(fixtures().tables)), "get_expenses");
    const items = out.all_items;

    const line = (title: string) => items.find((i) => i.title === title);
    expect(line("Board & MLS dues")).toMatchObject({ key: "prof_board_mls", category: "Professional", ytd_amount: 100, monthly_recurring: 20 });
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

  it("when the monthly estimates exceed the receipts, the difference is its own line and the lines still add up", async () => {
    const fx = fixtures({ legacyMonthly: 100 });
    const out = await callTool<ExpensesOutput>(await expenses(fakeSupabase(fx.tables)), "get_expenses");

    // 100 × 10 months = 1,000 of estimates against 443.75 of receipts.
    expect(out.total_ytd).toBe(6600);
    expect(out.all_items.find((i) => i.title === "Monthly estimates above receipts")).toMatchObject({
      key: null, category: "Monthly estimates", ytd_amount: 556.25,
    });
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
    expect(notRegistered.total_ytd).toBe(6938.5);
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

    expect(dashboardExpenses(fx).expensesYTD).toBe(6043.75 + 40);
    expect(kpis.ytd_expenses).toBe(6084);
    expect(out.total_ytd).toBe(6083.75);
    expect(out.all_items.find((i) => i.key === "home_utilities")).toMatchObject({ ytd_amount: 40 });
  });

  it("get_hst_status: the ITC on the bill is the workspace share of its HST", async () => {
    const out = await callTool(await analytics(fakeSupabase(withPowerBill().tables)), "get_hst_status");
    expect(out.itcs_paid_on_expenses).toBe(511); // 504.75 + 30 × 20%
  });

  it("not registered: 20% of the whole bill, HST included", async () => {
    const fx = withPowerBill({ registered: false });
    const kpis = await callTool(await analytics(fakeSupabase(fx.tables)), "get_dashboard_kpis");
    expect(dashboardExpenses(fx).expensesYTD).toBe(6938.5 + 46);
    expect(kpis.ytd_expenses).toBe(Math.round(6938.5 + 46));
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
  // If one of these fails, the dashboard's expense inputs or formula changed.
  // Make the same change in `ytdExpenseTotals` (packages/core/engines/
  // expense-totals-engine.ts) and `loadExpenseInputs` (supabase/functions/
  // mcp-server/lib/expense-inputs.ts), then update the pin.
  it("page.tsx: receipts and recurring queries, Atlantic calendar, net of ITCs", () => {
    const page = squash(read("app/(app)/dashboard/page.tsx"));
    for (const line of [
      'const today = atlanticNoon();',
      'const dashYear = today.getFullYear();',
      '.from("receipt_expenses") .select("category_key, total_amount, tax_amount") .eq("user_id", user.id) .gte("expense_date", `${dashYear}-01-01`) .limit(10000)',
      '.from("recurring_expenses") .select("*") .eq("user_id", user.id) .eq("is_active", true) .limit(10000)',
      '.from("expense_items") .select("*") .eq("user_id", user.id) .limit(10000)',
      "const taxCtx = expenseTaxContext(settingsRow);",
      "const recurringExpMonthly = totalRecurringMonthly(recurringExpenses);",
      "const recurringExpYTD = totalRecurringYTD(recurringExpenses, today);",
      "const receiptYTD = aggregateReceiptTotals(receiptTotalsResult.data, taxCtx).total;",
    ]) {
      expect(page, line).toContain(line);
    }
  });

  it("dashboard-content.tsx: max(receipts, legacy monthly × months) + recurring", () => {
    const content = squash(read("app/(app)/dashboard/dashboard-content.tsx"));
    for (const line of [
      "const receiptTotal = receiptYTD;",
      "sum + cat.items.reduce((s, i) => s + Number(i.monthly_recurring), 0)",
      "const monthlyRecurring = legacyMonthlyRecurring + recurringExpMonthly;",
      "const expMonthsElapsed = now.getMonth() + 1;",
      "const legacyRecurringYTDEstimate = legacyMonthlyRecurring * expMonthsElapsed;",
      "const expensesYTD = Math.max(receiptTotal, legacyRecurringYTDEstimate) + recurringExpYTD;",
      "const annualExpenses = expensesYTD + monthlyRecurring * expRemainingMonths;",
      // Expenses are net of ITCs, so no ITC comes off the HST owing as well.
      "const ytdHstOnExpenses = 0;",
    ]) {
      expect(content, line).toContain(line);
    }
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
    expect(squash(mirror)).toContain("const annualExpenses = expensesYTD + monthlyRecurring * expRemainingMonths;");
    const core = squash(read("../../packages/core/engines/effective-cash.ts"));
    expect(core).toContain("const annualExpenses = expensesYTD + monthlyRecurring * expRemainingMonths;");
    expect(core).toContain("const ytdHstOnExpenses = 0;");
  });
});
