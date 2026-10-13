/**
 * Flight Crew expense context is built from the tracked expenses
 * (2026-10-13).
 *
 * Until this date the chat route's "[MISSING DEDUCTIONS]", "[DOCUMENTATION]"
 * and "[CCA OPPORTUNITY]" lines, and the expense diagnostic's category lines,
 * read `expense_items.ytd_amount`. Nothing has written that column since
 * receipts replaced it, so receipts never counted: an agent with a year of
 * them was described as having $0 recorded. The "Professional fees" check
 * also matched on the prefix "professional", which no expense item key
 * carries (they are "prof_..."), so receipts could not have cleared it.
 *
 * "now" is 15 June 2026 (six monthly occurrences to date).
 */
import { describe, expect, it } from "vitest";
import { buildT2125Expenses } from "@agent-runway/core/engines/t2125-expenses-engine";
import type { RecurringExpense } from "@agent-runway/core/types/database";
import {
  ccaOpportunityLine,
  documentationLine,
  expenseCategoryBreakdown,
  expenseItemsOf,
  missingDeductionsLine,
  receiptBackedLines,
  trackedExpenseCounts,
  untrackedCoreCategories,
  type ExpenseCategoryRow,
} from "../expense-tax-intel";

const NOT_REGISTERED = { gstHstRegistered: false, vehicleBusinessUsePct: 0.8, homeOfficeBusinessUsePct: 0.15 };
const JUN_15 = new Date(2026, 5, 15, 12);

const item = (key: string, monthly_recurring = 0) => ({ key, monthly_recurring });

/** The seeded categories as the chat route selects them. */
function categories(monthly: Record<string, number> = {}): ExpenseCategoryRow[] {
  const m = (key: string) => item(key, monthly[key] ?? 0);
  return [
    { key: "vehicle", title: "Vehicle", expense_items: [m("vehicle_fuel"), m("vehicle_service")] },
    { key: "marketing", title: "Marketing", expense_items: [m("marketing_ads"), m("marketing_gifts")] },
    { key: "office_tech", title: "Office & Tech", expense_items: [m("office_supplies"), m("office_software"), m("office_hardware")] },
    { key: "professional", title: "Professional Fees", expense_items: [m("prof_board_mls"), m("prof_licensing")] },
    { key: "meals", title: "Meals", expense_items: [m("meals_client")] },
  ];
}

function recurring(overrides: Partial<RecurringExpense>): RecurringExpense {
  return {
    id: "re-1",
    user_id: "u1",
    name: "Board dues",
    amount: 100,
    category_key: "prof_board_mls",
    frequency: "monthly",
    day_of_month: 1,
    month_of_year: null,
    hst_included: false,
    hst_amount: 0,
    vehicle_pct_applicable: false,
    notes: "",
    start_date: "2025-01-01",
    end_date: null,
    is_active: true,
    created_at: "2025-01-01T12:00:00Z",
    updated_at: "2025-01-01T12:00:00Z",
    ...overrides,
  };
}

function tracked(input: {
  receipts?: Record<string, number>;
  uncategorized?: number;
  cats?: ExpenseCategoryRow[];
  recurring?: RecurringExpense[];
}) {
  const cats = input.cats ?? categories();
  const built = buildT2125Expenses({
    receiptTotals: { byKey: input.receipts ?? {}, uncategorized: input.uncategorized ?? 0, homeOfficeCosts: {} },
    expenseItems: expenseItemsOf(cats),
    recurringExpenses: input.recurring ?? [],
    ctx: NOT_REGISTERED,
    now: JUN_15,
  });
  return { lines: built.lines, ytdTotal: built.ytdTotal, cats };
}

describe("[MISSING DEDUCTIONS]", () => {
  it("nothing recorded: all four core categories are listed", () => {
    const { lines, cats } = tracked({});
    expect(untrackedCoreCategories(lines, cats)).toEqual([
      "Vehicle expenses (gas, insurance, lease)",
      "Marketing & advertising",
      "Office & technology",
      "Professional fees (MLS, licensing, E&O)",
    ]);
  });

  // The bug: receipts were invisible to this line.
  it("a category with receipts this year is not listed", () => {
    const { lines, cats } = tracked({ receipts: { vehicle_fuel: 900, marketing_ads: 250, office_software: 40, prof_board_mls: 800 } });
    expect(untrackedCoreCategories(lines, cats)).toEqual([]);
    expect(missingDeductionsLine({ closedDealsYTD: 5, lines, categories: cats })).toBeNull();
  });

  it("professional fees recorded under a prof_ key count (the old prefix matched none)", () => {
    const { lines, cats } = tracked({ receipts: { prof_licensing: 300 } });
    expect(untrackedCoreCategories(lines, cats)).not.toContain("Professional fees (MLS, licensing, E&O)");
  });

  it("a recurring expense and a monthly figure count for their categories", () => {
    const cats = categories({ office_supplies: 25 });
    const { lines } = tracked({ cats, recurring: [recurring({ category_key: "vehicle_payment", name: "Lease" })] });
    expect(untrackedCoreCategories(lines, cats)).toEqual([
      "Marketing & advertising",
      "Professional fees (MLS, licensing, E&O)",
    ]);
  });

  it("names the categories and no amounts, in neutral wording", () => {
    const { lines, cats } = tracked({ receipts: { vehicle_fuel: 900, office_supplies: 40, prof_board_mls: 800 } });
    const line = missingDeductionsLine({ closedDealsYTD: 4, lines, categories: cats });
    expect(line).toContain("[MISSING DEDUCTIONS] Agent has 4 closed deals YTD with $0 recorded in: Marketing & advertising ");
    expect(line).not.toContain("Vehicle expenses");
    expect(line).not.toContain("900");
    expect(line).not.toMatch(/\b(should|recommend|must|need to)\b/i);
  });

  it("is not emitted under three closed deals", () => {
    const { lines, cats } = tracked({});
    expect(missingDeductionsLine({ closedDealsYTD: 2, lines, categories: cats })).toBeNull();
    expect(missingDeductionsLine({ closedDealsYTD: 3, lines, categories: cats })).not.toBeNull();
  });
});

describe("[DOCUMENTATION]", () => {
  it("counts the lines with an amount and the ones with a receipt behind them", () => {
    const cats = categories({ prof_licensing: 20, vehicle_fuel: 10 });
    const receipts = { vehicle_fuel: 900, marketing_ads: 250 };
    const { lines } = tracked({ cats, receipts, uncategorized: 40, recurring: [recurring({}), recurring({ id: "re-2", category_key: "office_software" })] });
    // vehicle_fuel (receipts, larger than its monthly figure), marketing_ads,
    // uncategorized receipts: 3 with receipts. prof_licensing: monthly figure
    // only. Two recurring entries.
    expect(receiptBackedLines(lines, receipts)).toEqual({ withAmount: 6, withReceipts: 3, fromMonthlyFigure: 1, fromRecurringList: 2 });

    const line = documentationLine({ lines, receiptByKey: receipts, receiptCount: 37 });
    expect(line).toContain("[DOCUMENTATION] 3 of 6 expense lines with an amount this year have at least one receipt logged in Agent Runway (37 receipts logged YTD).");
    expect(line).toContain("The other 3: 1 from a monthly figure typed on an expense item, 2 from the Recurring Expenses list");
    expect(line).not.toMatch(/\b(should|recommend|must|need to)\b/i);
    expect(line).not.toMatch(/%/);
  });

  it("every line has receipts: says so with the counts only", () => {
    const receipts = { vehicle_fuel: 900 };
    const { lines } = tracked({ receipts });
    const line = documentationLine({ lines, receiptByKey: receipts, receiptCount: 12 });
    expect(line).toContain("1 of 1 expense lines");
    expect(line).not.toContain("The other");
  });

  it("a recurring expense not yet charged this year has no amount to document", () => {
    const annual = recurring({ frequency: "annual", month_of_year: 11, amount: 1200 });
    const { lines } = tracked({ recurring: [annual] });
    expect(receiptBackedLines(lines, {})).toEqual({ withAmount: 0, withReceipts: 0, fromMonthlyFigure: 0, fromRecurringList: 0 });
    expect(documentationLine({ lines, receiptByKey: {}, receiptCount: 0 })).toBeNull();
  });

  it("nothing recorded: no line", () => {
    expect(documentationLine({ lines: tracked({}).lines, receiptByKey: {}, receiptCount: 0 })).toBeNull();
  });
});

describe("[CCA OPPORTUNITY]", () => {
  it("is emitted when the hardware item is over $500 this year, from receipts", () => {
    expect(ccaOpportunityLine(tracked({ receipts: { office_hardware: 500.01 } }).lines)).toContain("[CCA OPPORTUNITY]");
  });

  it("is not emitted at $500 or under, or for other office spending", () => {
    expect(ccaOpportunityLine(tracked({ receipts: { office_hardware: 500 } }).lines)).toBeNull();
    expect(ccaOpportunityLine(tracked({ receipts: { office_software: 5000 } }).lines)).toBeNull();
    expect(ccaOpportunityLine(tracked({}).lines)).toBeNull();
  });

  it("a recurring charge under the hardware key is not a capital purchase", () => {
    const lease = recurring({ category_key: "office_hardware", amount: 200, name: "Printer lease" });
    expect(ccaOpportunityLine(tracked({ recurring: [lease] }).lines)).toBeNull();
  });
});

describe("expense diagnostic — year to date by category", () => {
  it("lists each category's tracked amount, largest first, by title", () => {
    const { lines, cats, ytdTotal } = tracked({
      receipts: { vehicle_fuel: 900, marketing_ads: 250, marketing_gifts: 100 },
      uncategorized: 40,
      recurring: [recurring({})], // 100 x 6 under Professional Fees
    });
    const rows = expenseCategoryBreakdown(lines, cats);
    expect(rows).toEqual([
      { name: "Vehicle", ytd: 900 },
      { name: "Professional Fees", ytd: 600 },
      { name: "Marketing", ytd: 350 },
      { name: "No category", ytd: 40 },
    ]);
    expect(rows.reduce((s, r) => s + r.ytd, 0)).toBeCloseTo(ytdTotal, 2);
  });

  it("a category with nothing recorded has no line", () => {
    const { lines, cats } = tracked({ receipts: { meals_client: 61.5 } });
    expect(expenseCategoryBreakdown(lines, cats)).toEqual([{ name: "Meals", ytd: 61.5 }]);
  });

  it("falls back to the category key when the agent has no row for it", () => {
    const { lines, cats } = tracked({ recurring: [recurring({ category_key: "edu_courses" })] });
    expect(expenseCategoryBreakdown(lines, cats)).toEqual([{ name: "education", ytd: 600 }]);
  });
});

describe("Expense Data line — lines and categories with an amount", () => {
  it("counts what is recorded, not the seeded list", () => {
    const cats = categories();
    expect(expenseItemsOf(cats)).toHaveLength(10);
    expect(trackedExpenseCounts(tracked({}).lines, cats)).toEqual({ lines: 0, categories: 0 });

    const { lines } = tracked({ receipts: { vehicle_fuel: 900, vehicle_service: 120, marketing_ads: 250 }, recurring: [recurring({})] });
    expect(trackedExpenseCounts(lines, cats)).toEqual({ lines: 4, categories: 3 });
  });
});
