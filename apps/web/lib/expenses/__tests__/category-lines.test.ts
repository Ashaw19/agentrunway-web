/**
 * Category rows add up to the total (2026-10-13).
 *
 * The Reports overview's "Expenses by Category" table and donut, and the
 * business report PDF, listed RECEIPTS per category under a Total row that
 * was `expensesYTD`: receipts, the per-item monthly figures and the Recurring
 * Expenses list. An account with a lease in the list saw category rows that
 * came thousands short of the Total beneath them, and a Monthly column whose
 * rows left the list out as well.
 *
 * The rows are now the engine's lines sorted into categories
 * (`expenseCategoryRows`), the grouping the Expenses page already used. A
 * line lands under exactly one row, so the rows add up by construction.
 */
import { describe, expect, it } from "vitest";
import {
  UNFILED_CATEGORY_TITLE,
  expenseCategoryRows,
  groupExpenseLinesByCategory,
  linesMonthly,
  linesYtd,
} from "../category-lines";
import {
  trackedExpensesByCategory,
  ytdExpenseTotals,
} from "@agent-runway/core/engines/t2125-expenses-engine";
import type { RecurringExpense } from "@agent-runway/core/types/database";

const NOT_REGISTERED = { gstHstRegistered: false, vehicleBusinessUsePct: 0.8, homeOfficeBusinessUsePct: 0.2 };
// 13 Oct 2026: ten months have started.
const NOW = new Date(2026, 9, 13, 12);

function recurring(overrides: Partial<RecurringExpense>): RecurringExpense {
  return {
    id: "re-1",
    user_id: "u1",
    name: "Lease",
    amount: 500,
    category_key: "vehicle_payment",
    frequency: "monthly",
    day_of_month: 1,
    month_of_year: null,
    hst_included: false,
    hst_amount: 0,
    vehicle_pct_applicable: true,
    notes: "",
    start_date: "2026-01-01",
    end_date: null,
    is_active: true,
    created_at: "2026-01-01T12:00:00Z",
    updated_at: "2026-01-01T12:00:00Z",
    ...overrides,
  };
}

const CATEGORIES = [
  { key: "vehicle", title: "Vehicle", items: [{ key: "vehicle_fuel", monthly_recurring: 0 }, { key: "vehicle_payment", monthly_recurring: 0 }] },
  { key: "office_tech", title: "Office & Tech", items: [{ key: "office_phone", monthly_recurring: 90 }, { key: "office_software", monthly_recurring: 0 }] },
  { key: "marketing", title: "Marketing", items: [{ key: "marketing_ads", monthly_recurring: 0 }, { key: "my_custom_item", monthly_recurring: 25 }] },
  { key: "education", title: "Education", items: [{ key: "edu_courses", monthly_recurring: 0 }] },
];

const RECEIPTS = [
  { category_key: "vehicle_fuel", total_amount: 400, tax_amount: 0 },
  { category_key: "marketing_ads", total_amount: 1200, tax_amount: 0 },
  // Filed under the whole category (an older row) and under a built-in item
  // this user has no row for: both still belong to a category shown here.
  { category_key: "marketing", total_amount: 50, tax_amount: 0 },
  { category_key: "office_supplies", total_amount: 30, tax_amount: 0 },
  // No category, and a key nothing here knows.
  { category_key: null, total_amount: 70, tax_amount: 0 },
  { category_key: "payroll_wages", total_amount: 15, tax_amount: 0 },
];

const totals = ytdExpenseTotals({
  receipts: RECEIPTS,
  recurring: [recurring({}), recurring({ id: "re-2", name: "Coaching", amount: 1200, frequency: "annual", month_of_year: 12, category_key: "edu_courses", vehicle_pct_applicable: false })],
  expenseItems: CATEGORIES.flatMap((c) => c.items),
  ctx: NOT_REGISTERED,
  now: NOW,
});
const rows = expenseCategoryRows(totals.tracked.lines, CATEGORIES);
const rowByTitle = Object.fromEntries(rows.map((r) => [r.title, r]));

describe("expenseCategoryRows", () => {
  it("the YTD column adds up to YTD Expenses", () => {
    expect(rows.reduce((s, r) => s + r.ytd, 0)).toBe(totals.expensesYTD);
    // receipts 1,765 + phone 900 + custom 250 + lease 5,000 (the December fee hasn't come up yet)
    expect(totals.expensesYTD).toBe(1765 + 900 + 250 + 5000);
  });

  it("the Monthly column adds up to Monthly Recurring", () => {
    expect(rows.reduce((s, r) => s + r.monthly, 0)).toBe(totals.monthlyRecurring);
    expect(totals.monthlyRecurring).toBe(90 + 25 + 500 + 100);
  });

  it("the Deductible column adds up to the deductible total", () => {
    expect(rows.reduce((s, r) => s + r.deductible, 0)).toBeCloseTo(totals.tracked.deductibleTotal, 10);
  });

  it("a category row holds its receipts, its monthly figures and its recurring expenses", () => {
    expect(rowByTitle["Vehicle"]).toMatchObject({ key: "vehicle", ytd: 400 + 5000, monthly: 500 });
    expect(rowByTitle["Office & Tech"]).toMatchObject({ ytd: 30 + 900, monthly: 90 });
    expect(rowByTitle["Marketing"]).toMatchObject({ ytd: 1200 + 50 + 250, monthly: 25 });
    // An annual fee due in December: nothing year to date, 100 a month.
    expect(rowByTitle["Education"]).toMatchObject({ ytd: 0, monthly: 100 });
  });

  it("what has no category row goes in one last row, never nowhere", () => {
    const unfiled = rows[rows.length - 1];
    expect(unfiled).toMatchObject({ key: null, title: UNFILED_CATEGORY_TITLE, ytd: 70 + 15, monthly: 0 });
    expect(unfiled.lines.map((l) => l.key)).toEqual(["payroll_wages", null]);
  });

  it("receipts per category alone (the old table) came short of the same total", () => {
    const receiptsOnly = CATEGORIES.reduce(
      (sum, cat) => sum + cat.items.reduce((s, i) => s + (totals.receipts.byKey[i.key] ?? 0), 0),
      0,
    );
    expect(receiptsOnly).toBe(1600);
    expect(totals.expensesYTD - receiptsOnly).toBe(6315);
  });

  it("every row is returned, so hiding the empty ones can't change what the rest add up to", () => {
    const empty = expenseCategoryRows([], CATEGORIES);
    expect(empty.map((r) => r.title)).toEqual(["Vehicle", "Office & Tech", "Marketing", "Education", UNFILED_CATEGORY_TITLE]);
    expect(empty.every((r) => r.ytd === 0 && r.monthly === 0 && r.lines.length === 0)).toBe(true);
  });

  it("two categories with one key share the lines once", () => {
    const twice = expenseCategoryRows(totals.tracked.lines, [...CATEGORIES, { key: "vehicle", title: "Vehicle (again)", items: [] }]);
    expect(twice.reduce((s, r) => s + r.ytd, 0)).toBe(totals.expensesYTD);
    expect(twice.find((r) => r.title === "Vehicle (again)")?.ytd).toBe(0);
  });
});

describe("groupExpenseLinesByCategory", () => {
  const grouped = groupExpenseLinesByCategory(totals.tracked.lines, CATEGORIES);

  it("every line is under one category or unfiled", () => {
    const placed = Object.values(grouped.linesByCatKey).flat().length + grouped.unfiledLines.length;
    expect(placed).toBe(totals.tracked.lines.length);
    expect(linesYtd(Object.values(grouped.linesByCatKey).flat()) + linesYtd(grouped.unfiledLines)).toBe(totals.expensesYTD);
    expect(linesMonthly(Object.values(grouped.linesByCatKey).flat()) + linesMonthly(grouped.unfiledLines)).toBe(totals.monthlyRecurring);
  });

  it("finds a line by expense item and by recurring expense", () => {
    expect(grouped.lineByItemKey.get("office_phone")).toMatchObject({ rawAmount: 900, monthlyAmount: 90 });
    expect(grouped.lineByRecurringId.get("re-1")).toMatchObject({ source: "recurring", rawAmount: 5000, monthlyAmount: 500 });
    // A recurring expense is never the item's line, even on the same key.
    expect(grouped.lineByItemKey.get("vehicle_payment")).toBeUndefined();
  });

  it("a category that isn't shown sends its lines to unfiled (the Expenses page hides payroll)", () => {
    const withoutMarketing = groupExpenseLinesByCategory(totals.tracked.lines, CATEGORIES.filter((c) => c.key !== "marketing"));
    expect(withoutMarketing.linesByCatKey.marketing).toBeUndefined();
    expect(linesYtd(withoutMarketing.unfiledLines)).toBe(70 + 15 + 1200 + 50 + 250);
  });
});

describe("one rule for which category a key belongs to", () => {
  it("a built-in item the user has no row for sits under its category, not in the unfiled row", () => {
    // `office_supplies` is not one of this user's items; it is still Office & Tech.
    expect(rowByTitle["Office & Tech"].lines.map((l) => l.key)).toContain("office_supplies");
  });

  it("an older row filed under the whole category sits under that category", () => {
    expect(rowByTitle["Marketing"].lines.map((l) => l.key)).toContain("marketing");
  });

  it("the user's own item is found under the category it was added to", () => {
    expect(rowByTitle["Marketing"].lines.map((l) => l.key)).toContain("my_custom_item");
  });

  it("the tax cards and Flight Crew read the same grouping (trackedExpensesByCategory)", () => {
    const tracked = trackedExpensesByCategory(totals.tracked.lines, CATEGORIES);
    for (const cat of CATEGORIES) {
      expect(tracked.categories[cat.key]?.ytd ?? 0, cat.key).toBe(rowByTitle[cat.title].ytd);
    }
  });
});
