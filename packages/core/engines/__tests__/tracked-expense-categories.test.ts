/**
 * Which expense categories an agent tracks (2026-10-13).
 *
 * `expense_items.ytd_amount` is a dead column: nothing has written it since
 * receipts replaced it (only `0` on item creation). The tax cards on the
 * Dashboard, Forecast and Overhead pages still asked it "does this agent have
 * marketing expenses?", so an agent with a year of receipts was told
 * marketing, licensing, meals and professional development were not tracked.
 * In production that day both accounts with recorded expenses were affected.
 *
 * The answer now comes from the tracked expense lines (`buildT2125Expenses`):
 * receipts this year, the per-item monthly figure and the Recurring Expenses
 * list, arranged by the agent's own categories.
 *
 * "now" is 15 June 2026 (six monthly occurrences to date).
 */
import { describe, expect, it } from "vitest";
import {
  buildT2125Expenses,
  expenseCategoryResolver,
  isTrackedLine,
  trackedExpensesByCategory,
  type ExpenseCategoryKeys,
} from "../t2125-expenses-engine";
import { EXPENSE_KEY_TO_T2125, expenseItemKeyFor } from "../t2125-engine";
import { deductionTrackingFlags } from "../tax-optimization-engine";
import type { RecurringExpense } from "../../types/database";

const NOT_REGISTERED = { gstHstRegistered: false, vehicleBusinessUsePct: 0.8, homeOfficeBusinessUsePct: 0.15 };
const JUN_15 = new Date(2026, 5, 15, 12);

/** The seeded categories (seed_default_expenses), with one custom item under Marketing. */
const CATEGORIES: ExpenseCategoryKeys[] = [
  { key: "vehicle", items: [{ key: "vehicle_fuel" }, { key: "vehicle_service" }] },
  { key: "marketing", items: [{ key: "marketing_ads" }, { key: "marketing_gifts" }, { key: "custom_ab12cd34_1700000000000" }] },
  { key: "office_tech", items: [{ key: "office_supplies" }, { key: "office_hardware" }] },
  { key: "professional", items: [{ key: "prof_board_mls" }, { key: "prof_licensing" }, { key: "prof_accounting" }] },
  { key: "education", items: [{ key: "edu_courses" }] },
  { key: "meals", items: [{ key: "meals_client" }] },
  { key: "entertainment", items: [{ key: "ent_client" }] },
  { key: "other", items: [{ key: "other_misc" }] },
  { key: "home_office", items: [{ key: "home_utilities" }] },
];

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

function lines(input: {
  receipts?: Record<string, number>;
  uncategorized?: number;
  monthly?: Record<string, number>;
  recurring?: RecurringExpense[];
}) {
  return buildT2125Expenses({
    receiptTotals: { byKey: input.receipts ?? {}, uncategorized: input.uncategorized ?? 0, homeOfficeCosts: {} },
    expenseItems: Object.entries(input.monthly ?? {}).map(([key, monthly_recurring]) => ({ key, monthly_recurring })),
    recurringExpenses: input.recurring ?? [],
    ctx: NOT_REGISTERED,
    now: JUN_15,
  }).lines;
}

describe("expenseCategoryResolver — which category an expense key sits under", () => {
  const categoryOf = expenseCategoryResolver(CATEGORIES);

  it("an item key resolves to the agent's own category for it", () => {
    expect(categoryOf("vehicle_fuel")).toBe("vehicle");
    expect(categoryOf("prof_board_mls")).toBe("professional");
    expect(categoryOf("office_hardware")).toBe("office_tech");
  });

  it("a custom item counts for the category it was added to", () => {
    expect(categoryOf("custom_ab12cd34_1700000000000")).toBe("marketing");
  });

  it("the agent's own placement wins over the standard one", () => {
    const moved = expenseCategoryResolver([{ key: "other", items: [{ key: "marketing_gifts" }] }]);
    expect(moved("marketing_gifts")).toBe("other");
  });

  it("a category key is its own category", () => {
    expect(categoryOf("vehicle")).toBe("vehicle");
    expect(categoryOf("home_office")).toBe("home_office");
  });

  // Prod, 2026-10-13: two active recurring expenses filed under
  // vehicle_insurance and vehicle_payment on an account with no such item
  // rows. They are vehicle costs all the same.
  it("a standard key the agent has no item for resolves to its seeded category", () => {
    expect(categoryOf("vehicle_payment")).toBe("vehicle");
    expect(categoryOf("vehicle_insurance")).toBe("vehicle");
    expect(categoryOf("prof_eo")).toBe("professional");
    expect(categoryOf("payroll_wages")).toBe("payroll");
    expect(categoryOf("corp_legal")).toBe("corp_admin");
    expect(categoryOf("home_rent")).toBe("home_office");
  });

  it("works with no category rows at all", () => {
    const bare = expenseCategoryResolver(null);
    expect(bare("marketing_ads")).toBe("marketing");
    expect(bare("edu_books")).toBe("education");
    expect(bare("office_tech")).toBe("office_tech");
  });

  it("every key with a T2125 line of its own has a category", () => {
    const bare = expenseCategoryResolver([]);
    const expected: Record<string, string> = {
      vehicle_: "vehicle", marketing_: "marketing", office_: "office_tech", prof_: "professional",
      edu_: "education", meals_: "meals", ent_: "entertainment", other_: "other", home_: "home_office",
    };
    for (const key of Object.keys(EXPENSE_KEY_TO_T2125)) {
      const prefix = Object.keys(expected).find((p) => key.startsWith(p));
      expect(prefix, key).toBeDefined();
      expect(bare(key), key).toBe(expected[prefix!]);
    }
  });

  it("a category-level key from before 2026-10-13 follows the item it stands for", () => {
    expect(expenseItemKeyFor("professional_fees")).toBe("prof_accounting");
    expect(expenseItemKeyFor("vehicle_fuel")).toBe("vehicle_fuel");
    expect(categoryOf("professional_fees")).toBe("professional");
    expect(categoryOf("insurance_licenses")).toBe("professional");
    expect(categoryOf("education_dev")).toBe("education");
    expect(categoryOf("travel_meals")).toBe("meals");
  });

  it("no key, or a key nothing recognizes, has no category", () => {
    expect(categoryOf(null)).toBeNull();
    expect(categoryOf(undefined)).toBeNull();
    expect(categoryOf("")).toBeNull();
    expect(categoryOf("custom_zz99zz99_1")).toBeNull();
  });
});

describe("trackedExpensesByCategory — the tracked lines by category", () => {
  it("receipts, the monthly figure and recurring expenses all count, under their category", () => {
    const tracked = trackedExpensesByCategory(
      lines({
        receipts: { vehicle_fuel: 900, marketing_ads: 250, custom_ab12cd34_1700000000000: 50 },
        monthly: { prof_licensing: 20 },                       // 20 x 6 months
        recurring: [recurring({ id: "re-dues", amount: 100 })], // 100 x 6 occurrences
      }),
      CATEGORIES,
    );
    expect(tracked.categories.vehicle).toEqual({ ytd: 900, keys: ["vehicle_fuel"] });
    expect(tracked.categories.marketing.ytd).toBe(300);
    expect(tracked.categories.marketing.keys.sort()).toEqual(["custom_ab12cd34_1700000000000", "marketing_ads"]);
    expect(tracked.categories.professional.ytd).toBe(720);
    expect(tracked.categories.professional.keys.sort()).toEqual(["prof_board_mls", "prof_licensing"]);
    expect(tracked.categories.education).toBeUndefined();
    expect(tracked.unfiledYtd).toBe(0);
  });

  it("adds up to the builder's year-to-date total", () => {
    const input = {
      receipts: { vehicle_fuel: 900.1, meals_client: 61.25, custom_zz99zz99_1: 12.4 },
      uncategorized: 40,
      monthly: { office_supplies: 15 },
      recurring: [recurring({ id: "a", amount: 33.33 }), recurring({ id: "b", category_key: "vehicle_payment", amount: 410 })],
    };
    const built = buildT2125Expenses({
      receiptTotals: { byKey: input.receipts, uncategorized: input.uncategorized, homeOfficeCosts: {} },
      expenseItems: [{ key: "office_supplies", monthly_recurring: 15 }],
      recurringExpenses: input.recurring,
      ctx: NOT_REGISTERED,
      now: JUN_15,
    });
    const tracked = trackedExpensesByCategory(built.lines, CATEGORIES);
    const total = Object.values(tracked.categories).reduce((s, c) => s + c.ytd, 0) + tracked.unfiledYtd;
    expect(total).toBeCloseTo(built.ytdTotal, 2);
    // Receipts with no category and the unknown custom key have no category row.
    expect(tracked.unfiledYtd).toBeCloseTo(52.4, 2);
  });

  it("a recurring expense not yet charged this year is tracked at $0", () => {
    // Annual dues that renew in November: nothing to date in June.
    const annual = recurring({ id: "re-annual", frequency: "annual", month_of_year: 11, amount: 1200 });
    const built = lines({ recurring: [annual] });
    expect(built).toHaveLength(1);
    expect(built[0].rawAmount).toBe(0);
    expect(isTrackedLine(built[0])).toBe(true);
    expect(trackedExpensesByCategory(built, CATEGORIES).categories.professional).toEqual({ ytd: 0, keys: ["prof_board_mls"] });
  });

  it("an inactive recurring expense is not tracked", () => {
    const built = lines({ recurring: [recurring({ is_active: false })] });
    expect(trackedExpensesByCategory(built, CATEGORIES).categories).toEqual({});
  });

  it("an item line with no amount is not tracked", () => {
    expect(isTrackedLine({ key: "vehicle_fuel", rawAmount: 0, source: "item" })).toBe(false);
    expect(isTrackedLine({ key: "vehicle_fuel", rawAmount: 0.01, source: "item" })).toBe(true);
  });
});

describe("deductionTrackingFlags — the tax cards' 'already tracked' inputs", () => {
  const NONE = {
    hasProfDevExpenses: false,
    hasMarketingExpenses: false,
    hasClientGiftExpenses: false,
    hasMealExpenses: false,
    hasLicensingExpenses: false,
  };

  it("nothing recorded: nothing is tracked", () => {
    expect(deductionTrackingFlags(lines({}), CATEGORIES)).toEqual(NONE);
  });

  // The bug: receipts alone left every flag false, because the flags read
  // expense_items.ytd_amount (never written) and the monthly figure.
  it("receipts alone set the flags", () => {
    const flags = deductionTrackingFlags(
      lines({ receipts: { edu_courses: 400, marketing_ads: 250, meals_client: 60, prof_board_mls: 900 } }),
      CATEGORIES,
    );
    expect(flags).toEqual({
      hasProfDevExpenses: true,
      hasMarketingExpenses: true,
      hasClientGiftExpenses: false,
      hasMealExpenses: true,
      hasLicensingExpenses: true,
    });
  });

  it("a recurring expense sets its category's flag, before its first charge of the year too", () => {
    const dues = recurring({ id: "re-annual", frequency: "annual", month_of_year: 11, amount: 1200 });
    expect(deductionTrackingFlags(lines({ recurring: [dues] }), CATEGORIES)).toEqual({ ...NONE, hasLicensingExpenses: true });
  });

  it("the monthly figure on an expense item still counts", () => {
    expect(deductionTrackingFlags(lines({ monthly: { edu_courses: 50 } }), CATEGORIES)).toEqual({ ...NONE, hasProfDevExpenses: true });
  });

  it("client gifts need the gifts item; they also count as marketing", () => {
    const flags = deductionTrackingFlags(lines({ receipts: { marketing_gifts: 120 } }), CATEGORIES);
    expect(flags).toEqual({ ...NONE, hasMarketingExpenses: true, hasClientGiftExpenses: true });
  });

  it("entertainment shares T2125 line 8523 with meals", () => {
    expect(deductionTrackingFlags(lines({ receipts: { ent_client: 80 } }), CATEGORIES)).toEqual({ ...NONE, hasMealExpenses: true });
  });

  it("a custom item under Marketing counts as marketing", () => {
    const flags = deductionTrackingFlags(lines({ receipts: { custom_ab12cd34_1700000000000: 75 } }), CATEGORIES);
    expect(flags).toEqual({ ...NONE, hasMarketingExpenses: true });
  });

  it("vehicle, office and uncategorized expenses set none of the five", () => {
    const flags = deductionTrackingFlags(
      lines({ receipts: { vehicle_fuel: 900, office_hardware: 1500 }, uncategorized: 40 }),
      CATEGORIES,
    );
    expect(flags).toEqual(NONE);
  });

  it("a category the agent named differently is not the standard one", () => {
    // The demo dashboard's sample data: "professional_fees" / "education_training"
    // categories with their own item keys.
    const demo: ExpenseCategoryKeys[] = [
      { key: "marketing", items: [{ key: "digital_advertising" }] },
      { key: "professional_fees", items: [{ key: "board_mls_dues" }] },
      { key: "education_training", items: [{ key: "courses_designations" }] },
    ];
    const flags = deductionTrackingFlags(
      lines({ monthly: { digital_advertising: 1000, board_mls_dues: 350, courses_designations: 200 } }),
      demo,
    );
    expect(flags).toEqual({ ...NONE, hasMarketingExpenses: true });
  });
});
