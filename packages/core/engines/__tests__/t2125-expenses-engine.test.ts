/**
 * T2125 expenses from tracked expenses (2026-10-13).
 *
 * Found while shipping #297: the T2125 pre-fill and the Expenses page's
 * "Est. Tax Deductible YTD" card were built from receipts and the legacy
 * per-item monthly figure only. The Recurring Expenses list
 * (`recurring_expenses`, migration 00108) never reached a T2125 line, so a
 * vehicle lease or board dues kept there counted in "YTD Expenses" on every
 * screen and in no deduction. Receipts saved under a category-level key
 * ("vehicle", "marketing") were dropped the same way.
 *
 * `buildT2125Expenses` is the one place that decides what each tracked
 * expense counts for on the T2125. The Reports page feeds its entries to
 * `computeT2125`; the Expenses page reads its lines. So the two agree.
 *
 * Fixtures are $115 paid with $15 HST unless a test says otherwise, and
 * "now" is 15 June 2026 (six monthly occurrences to date).
 */
import { describe, expect, it } from "vitest";
import { buildT2125Expenses, ytdExpenseTotals, ytdExpensesGstHstIncluded } from "../t2125-expenses-engine";
import {
  EXPENSE_KEY_TO_T2125,
  HOME_OFFICE_KEY_TO_COST,
  computeT2125,
  isHomeOfficeKey,
  t2125EntriesFromAmounts,
  t2125ExpenseLine,
  t2125LineForExpenseKey,
} from "../t2125-engine";
import { aggregateReceiptTotals, recurringExpensesNetOfItc } from "../expense-totals-engine";
import { computeGST34, isMealOrEntertainmentKey, isVehicleKey, itcForExpense } from "../gst34-engine";
import { getFilingPeriods } from "../filing-period-engine";
import { recurringHSTEntriesForPeriod, recurringYTD, totalRecurringMonthly, totalRecurringYTD } from "../recurring-expense-engine";
import { createTestSettings } from "./test-data";
import type { RecurringExpense } from "../../types/database";

const REGISTRANT = { gstHstRegistered: true, vehicleBusinessUsePct: 0.8, homeOfficeBusinessUsePct: 0.15 };
const NOT_REGISTERED = { ...REGISTRANT, gstHstRegistered: false };
const JUN_15 = new Date(2026, 5, 15, 12);
const NO_RECEIPTS = { byKey: {}, uncategorized: 0, homeOfficeCosts: {} };
/** Receipt totals already keyed, for tests that don't need the ITC maths. */
const receiptsByKey = (byKey: Record<string, number>, uncategorized = 0) => ({ byKey, uncategorized, homeOfficeCosts: {} });

function recurring(overrides: Partial<RecurringExpense>): RecurringExpense {
  return {
    id: "re-1",
    user_id: "u1",
    name: "Board dues",
    amount: 115,
    category_key: "prof_board_mls",
    frequency: "monthly",
    day_of_month: 1,
    month_of_year: null,
    hst_included: true,
    hst_amount: 15,
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

const LEASE = recurring({ id: "re-lease", name: "Lease", category_key: "vehicle_payment", vehicle_pct_applicable: true });
const MEAL = recurring({ id: "re-meal", name: "Client lunch club", category_key: "meals_client" });

function build(
  recurringExpenses: RecurringExpense[],
  ctx = REGISTRANT,
  extra: Partial<Parameters<typeof buildT2125Expenses>[0]> = {},
) {
  return buildT2125Expenses({
    receiptTotals: NO_RECEIPTS,
    expenseItems: [],
    recurringExpenses,
    ctx,
    now: JUN_15,
    ...extra,
  });
}

describe("t2125LineForExpenseKey — every key has a line", () => {
  it("an expense item key keeps its own line", () => {
    for (const [key, map] of Object.entries(EXPENSE_KEY_TO_T2125)) {
      expect(t2125LineForExpenseKey(key)).toBe(map);
    }
  });

  // Migration 00175 moved rows filed under a whole category to that
  // category's first-choice item. A stray one is treated as that same item,
  // so it counts exactly as a moved row does.
  const CATEGORY_KEY_TO_ITEM: [string, string][] = [
    ["vehicle", "vehicle_fuel"],
    ["marketing", "marketing_ads"],
    ["office_tech", "office_supplies"],
    ["professional", "prof_accounting"],
    ["professional_fees", "prof_accounting"],
    ["insurance_licenses", "prof_licensing"],
    ["education", "edu_courses"],
    ["education_dev", "edu_courses"],
    ["meals", "meals_client"],
    ["travel_meals", "meals_client"],
    ["entertainment", "ent_client"],
    ["other", "other_misc"],
  ];

  it("a category-level key takes the line and limits of the item migration 00175 moved such rows to", () => {
    for (const [categoryKey, itemKey] of CATEGORY_KEY_TO_ITEM) {
      expect(t2125LineForExpenseKey(categoryKey), categoryKey).toBe(EXPENSE_KEY_TO_T2125[itemKey]);
    }
    expect(t2125LineForExpenseKey("vehicle")).toMatchObject({ lineNumber: "9281", applyVehicleUse: true });
    expect(t2125LineForExpenseKey("marketing").lineNumber).toBe("8521");
    expect(t2125LineForExpenseKey("professional_fees").lineNumber).toBe("8860");
    expect(t2125LineForExpenseKey("travel_meals")).toMatchObject({ lineNumber: "8523", deductiblePct: 0.5 });
  });

  it("the meal keys the GST34 engine used to list on its own are still 50% on line 8523", () => {
    for (const key of ["meals", "entertainment", "meals_entertainment", "client_meals"]) {
      expect(t2125LineForExpenseKey(key), key).toMatchObject({ lineNumber: "8523", deductiblePct: 0.5, applyVehicleUse: false });
    }
  });

  it("a key with no item behind it (a custom item, a hidden category's, none at all) is line 9270 at 100%", () => {
    for (const key of ["custom_1712345", "corp_legal", "payroll", "", null, undefined]) {
      expect(t2125LineForExpenseKey(key), String(key)).toMatchObject({ lineNumber: "9270", deductiblePct: 1, applyVehicleUse: false });
    }
  });

  it("a key that happens to be an Object.prototype name is an ordinary unknown key", () => {
    for (const key of ["constructor", "toString", "hasOwnProperty"]) {
      expect(t2125LineForExpenseKey(key), key).toMatchObject({ lineNumber: "9270", deductiblePct: 1 });
      expect(isHomeOfficeKey(key), key).toBe(false);
    }
  });

  it("the GST34 ITC limits read the same map: a key can't be a meal for one and not the other", () => {
    for (const key of [...Object.keys(EXPENSE_KEY_TO_T2125), ...CATEGORY_KEY_TO_ITEM.map(([k]) => k), "meals_entertainment", "client_meals", "custom_1"]) {
      const line = t2125LineForExpenseKey(key);
      expect(isMealOrEntertainmentKey(key), key).toBe(line.deductiblePct === 0.5);
      expect(isVehicleKey(key), key).toBe(line.applyVehicleUse);
    }
  });
});

describe("t2125ExpenseLine — one expense", () => {
  it("a recurring expense flagged vehicle-use takes the business-use share and goes on line 9281, whatever its key", () => {
    const line = t2125ExpenseLine({ key: "other_misc", amount: 100, vehicleUse: true }, 0.8);
    expect(line).toMatchObject({ lineNumber: "9281", isVehicle: true, isMeals: false, vehicleUsePct: 0.8, rawAmount: 100 });
    expect(line.deductibleAmount).toBeCloseTo(80, 10);
  });

  it("a vehicle key takes the business-use share whether or not the flag is set (the same OR as itcForExpense)", () => {
    const flagged = t2125ExpenseLine({ key: "vehicle_payment", amount: 100, vehicleUse: true }, 0.8);
    const unflagged = t2125ExpenseLine({ key: "vehicle_payment", amount: 100, vehicleUse: false }, 0.8);
    const noFlag = t2125ExpenseLine({ key: "vehicle_payment", amount: 100 }, 0.8);
    for (const line of [flagged, unflagged, noFlag]) {
      expect(line.lineNumber).toBe("9281");
      expect(line.deductibleAmount).toBeCloseTo(80, 10);
    }
    // itcForExpense makes the same call on the tax.
    expect(itcForExpense(15, "vehicle_payment", 0.8, false).claimable).toBeCloseTo(12, 10);
    expect(itcForExpense(15, "other_misc", 0.8, true).claimable).toBeCloseTo(12, 10);
  });

  it("a flagged meal keeps the 50% limit and stays on line 8523", () => {
    const line = t2125ExpenseLine({ key: "meals_client", amount: 100, vehicleUse: true }, 0.8);
    expect(line).toMatchObject({ lineNumber: "8523", isMeals: true, deductiblePct: 0.5, vehicleUsePct: 0.8 });
    expect(line.deductibleAmount).toBeCloseTo(40, 10);
  });

  it("an unflagged ordinary expense is untouched by the vehicle share", () => {
    expect(t2125ExpenseLine({ key: "prof_board_mls", amount: 100 }, 0.8)).toMatchObject({
      lineNumber: "8760", deductibleAmount: 100, vehicleUsePct: 1, isVehicle: false,
    });
  });
});

describe("buildT2125Expenses — recurring expenses reach the T2125", () => {
  it("non-registrant: six months of board dues, as paid, on line 8760", () => {
    const r = build([recurring({})], NOT_REGISTERED);
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0]).toMatchObject({ source: "recurring", recurringId: "re-1", key: "prof_board_mls", lineNumber: "8760", rule: "full" });
    expect(r.lines[0].rawAmount).toBe(690);
    expect(r.deductibleTotal).toBe(690);
    expect(r.ytdTotal).toBe(690);
    expect(r.entries).toEqual([{ key: "prof_board_mls", amount: 690, vehicleUse: false }]);
  });

  it("registrant: the same dues are net of the HST claimed as an ITC", () => {
    const r = build([recurring({})], REGISTRANT);
    expect(r.lines[0].rawAmount).toBe(600);
    expect(r.deductibleTotal).toBe(600);
  });

  it("registrant, vehicle-flagged lease: the business share of the pre-tax cost, on line 9281", () => {
    const r = build([LEASE], REGISTRANT);
    // Each $115 payment: $12 ITC, $3 personal-use HST, $100 left; 80% of that.
    expect(r.lines[0]).toMatchObject({ lineNumber: "9281", rule: "vehicle", isVehicle: true, vehicleUsePct: 0.8 });
    expect(r.lines[0].rawAmount).toBeCloseTo(600, 10);
    expect(r.lines[0].deductibleAmount).toBeCloseTo(480, 10);
    expect(r.byRule.vehicle).toBeCloseTo(480, 10);
    expect(r.byRule.full).toBe(0);
  });

  it("non-registrant, vehicle-flagged lease: the business share of what was paid", () => {
    const r = build([LEASE], NOT_REGISTERED);
    expect(r.lines[0].rawAmount).toBe(690);
    expect(r.lines[0].deductibleAmount).toBeCloseTo(552, 10);
  });

  it("the lease's deduction plus the ITC the GST34 claims is the business share of what was paid, never more", () => {
    const r = build([LEASE], REGISTRANT);
    const [h1] = getFilingPeriods("annual", 2026);
    const itc = recurringHSTEntriesForPeriod([LEASE], h1.startDate, "2026-06-15");
    const gst34 = computeGST34({
      province: "newBrunswick",
      period: h1,
      frequency: "annual",
      periodTransactions: [],
      periodReceipts: itc.map((e) => ({ total_amount: null, ...e })),
      instalmentsPaid: 0,
      vehicleBusinessUsePct: 0.8,
    });
    expect(gst34.line108).toBeCloseTo(72, 10);
    expect(r.deductibleTotal + gst34.line108).toBeCloseTo(0.8 * 690, 10);
  });

  it("a lease whose vehicle box was left unticked still gets the vehicle rule from its key", () => {
    const unticked = build([{ ...LEASE, vehicle_pct_applicable: false }], REGISTRANT);
    const ticked = build([LEASE], REGISTRANT);
    expect(unticked.deductibleTotal).toBeCloseTo(ticked.deductibleTotal, 10);
    expect(unticked.lines[0].lineNumber).toBe("9281");
  });

  it("a non-vehicle key with the vehicle box ticked follows the box, as the GST34 does", () => {
    const carWash = recurring({ id: "re-wash", category_key: "other_misc", vehicle_pct_applicable: true });
    const r = build([carWash], REGISTRANT);
    expect(r.lines[0]).toMatchObject({ lineNumber: "9281", rule: "vehicle" });
    expect(r.lines[0].rawAmount).toBeCloseTo(600, 10);
    expect(r.lines[0].deductibleAmount).toBeCloseTo(480, 10);
  });

  it("registrant, a recurring meal: 50% of the amount less the half of the HST that is an ITC", () => {
    const r = build([MEAL], REGISTRANT);
    // Each $115: $7.50 ITC, $107.50 left; 50% of that.
    expect(r.lines[0]).toMatchObject({ lineNumber: "8523", rule: "meals", isMeals: true });
    expect(r.lines[0].rawAmount).toBe(645);
    expect(r.lines[0].deductibleAmount).toBe(322.5);
    expect(r.byRule.meals).toBe(322.5);
  });

  it("non-registrant, a recurring meal: 50% of what was paid", () => {
    const r = build([MEAL], NOT_REGISTERED);
    expect(r.lines[0].rawAmount).toBe(690);
    expect(r.lines[0].deductibleAmount).toBe(345);
  });

  it("counts only occurrences that have happened: an annual fee due in November is not in June's figure", () => {
    const annual = recurring({ id: "re-annual", frequency: "annual", month_of_year: 11, amount: 1150, hst_amount: 150 });
    const june = build([annual], REGISTRANT);
    expect(june.lines[0].rawAmount).toBe(0);
    expect(june.entries).toEqual([]);
    expect(june.deductibleTotal).toBe(0);

    const december = build([annual], REGISTRANT, { now: new Date(2026, 11, 1, 12) });
    expect(december.deductibleTotal).toBe(1000);
  });

  it("this month's charge is not on the line before its day, and is on it from that day", () => {
    // Monthly on the 20th: Jan 20 to May 20 have happened by 15 June.
    const onThe20th = recurring({ day_of_month: 20 });
    expect(build([onThe20th], NOT_REGISTERED).lines[0].rawAmount).toBe(5 * 115);
    expect(build([onThe20th], NOT_REGISTERED, { now: new Date(2026, 5, 20, 12) }).lines[0].rawAmount).toBe(6 * 115);
  });

  it("an expense that ended in March keeps January to March and adds nothing after", () => {
    const r = build([recurring({ end_date: "2026-03-31" })], NOT_REGISTERED);
    expect(r.lines[0].rawAmount).toBe(3 * 115);
    expect(r.deductibleTotal).toBe(3 * 115);
  });

  it("the line and the GST34 ITC count the same charges (registrant, charge day still ahead)", () => {
    const onThe20th = recurring({ day_of_month: 20 });
    const line = build([onThe20th], REGISTRANT).lines[0];
    const [itc] = recurringHSTEntriesForPeriod([onThe20th], "2026-01-01", "2026-06-15");
    // $100 net and $15 HST a charge: five of each.
    expect(line.rawAmount).toBe(500);
    expect(itc.tax_amount).toBe(75);
  });

  it("a home bill's whole cost behind line 9945 counts the same charges as its share", () => {
    const internet = recurring({ id: "re-net", category_key: "home_internet", day_of_month: 20 });
    const r = build([internet], REGISTRANT);
    // Five charges of $100 before HST: the costs whole, the line at 15%.
    expect(r.homeOfficeCosts).toEqual({ home_internet: 500 });
    expect(r.lines[0].rawAmount).toBeCloseTo(75, 10);
  });

  it("a recurring expense that starts later this year adds nothing yet", () => {
    const r = build([recurring({ start_date: "2026-11-01" })], NOT_REGISTERED);
    expect(r.lines[0].rawAmount).toBe(0);
    expect(r.entries).toEqual([]);
  });

  it("uses recurringYTD for the count, on the net amount (quarterly: two of four by mid-June)", () => {
    const quarterly = recurring({ id: "re-q", frequency: "quarterly", month_of_year: 1, amount: 345, hst_amount: 45 });
    const r = build([quarterly], REGISTRANT);
    const [net] = recurringExpensesNetOfItc([quarterly], REGISTRANT);
    expect(r.lines[0].rawAmount).toBe(recurringYTD(net, JUN_15));
    expect(r.lines[0].rawAmount).toBe(600);
  });

  it("skips an inactive recurring expense", () => {
    const r = build([recurring({ is_active: false })], REGISTRANT);
    expect(r.lines).toEqual([]);
    expect(r.deductibleTotal).toBe(0);
  });

  it("a recurring expense filed under a whole category is not dropped", () => {
    const r = build([recurring({ category_key: "professional_fees" })], NOT_REGISTERED);
    expect(r.lines[0]).toMatchObject({ lineNumber: "8860", rule: "full" });
    expect(r.deductibleTotal).toBe(690);
  });

  it("a recurring expense under a custom item is not dropped: line 9270 at 100%", () => {
    const r = build([recurring({ category_key: "custom_1712345" })], NOT_REGISTERED);
    expect(r.lines[0]).toMatchObject({ lineNumber: "9270", rule: "full" });
    expect(r.deductibleTotal).toBe(690);
  });

  it("a recurring expense filed under the category-level vehicle key gets the vehicle rule", () => {
    const r = build([recurring({ category_key: "vehicle" })], NOT_REGISTERED);
    expect(r.lines[0]).toMatchObject({ lineNumber: "9281", rule: "vehicle" });
    expect(r.deductibleTotal).toBeCloseTo(552, 10);
  });

  it("handles null lists", () => {
    const r = buildT2125Expenses({ receiptTotals: NO_RECEIPTS, expenseItems: null, recurringExpenses: undefined, ctx: REGISTRANT, now: JUN_15 });
    expect(r).toEqual({ lines: [], entries: [], homeOfficeCosts: {}, ytdTotal: 0, monthlyTotal: 0, deductibleTotal: 0, byRule: { full: 0, meals: 0, vehicle: 0, home: 0 } });
  });
});

// An expense that really ended keeps its row, active, with an end date: its
// charges to that date stay on the T2125 lines. `monthlyAmount` is what the
// row is expected to cost each month from here on, so it is $0 from the day
// after the end date (recurringMonthlyRunRate).
describe("buildT2125Expenses — a recurring expense with an end date", () => {
  const ended = recurring({ end_date: "2026-03-31" });

  it("ended: its charges to date stay, and nothing is expected each month", () => {
    const r = build([ended], NOT_REGISTERED);
    expect(r.lines[0].rawAmount).toBe(3 * 115);
    expect(r.lines[0].monthlyAmount).toBe(0);
    expect(r.ytdTotal).toBe(3 * 115);
    expect(r.monthlyTotal).toBe(0);
    expect(r.deductibleTotal).toBe(3 * 115);
  });

  it("was in the monthly total through its end date, and out the day after", () => {
    expect(build([ended], NOT_REGISTERED, { now: new Date(2026, 2, 31, 12) }).monthlyTotal).toBe(115);
    expect(build([ended], NOT_REGISTERED, { now: new Date(2026, 3, 1, 12) }).monthlyTotal).toBe(0);
  });

  it("an end date still ahead leaves the monthly amount in", () => {
    const r = build([recurring({ end_date: "2026-12-31" })], NOT_REGISTERED);
    expect(r.lines[0].monthlyAmount).toBe(115);
    expect(r.monthlyTotal).toBe(115);
  });

  it("registrant: a running row's monthly amount is net of the ITC, an ended row's is $0", () => {
    const r = build([recurring({ id: "running" }), recurring({ id: "ended", end_date: "2026-03-31" })], REGISTRANT);
    expect(r.lines.map((l) => [l.recurringId, l.monthlyAmount])).toEqual([["running", 100], ["ended", 0]]);
    expect(r.monthlyTotal).toBe(100);
  });

  it("the ended row keeps its line, so the Expenses page row still finds its year to date", () => {
    const r = build([ended], REGISTRANT);
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0].recurringId).toBe("re-1");
    expect(r.lines[0].rawAmount).toBe(300);
  });

  it("a row that has not started yet: nothing to date, and its monthly amount counts (a scheduled cost)", () => {
    const r = build([recurring({ start_date: "2026-11-01" })], NOT_REGISTERED);
    expect(r.lines[0].rawAmount).toBe(0);
    expect(r.lines[0].monthlyAmount).toBe(115);
  });
});

describe("buildT2125Expenses — receipts and the legacy monthly figure", () => {
  it("one line per expense key, with the key's own limit", () => {
    const receiptTotals = aggregateReceiptTotals(
      [
        { category_key: "office_supplies", total_amount: 115, tax_amount: 15 },
        { category_key: "meals_client", total_amount: 115, tax_amount: 15 },
        { category_key: "vehicle_fuel", total_amount: 115, tax_amount: 15 },
      ],
      REGISTRANT,
    );
    const r = build([], REGISTRANT, { receiptTotals });
    const byKey = Object.fromEntries(r.lines.map((l) => [l.key, l]));
    expect(byKey.office_supplies).toMatchObject({ source: "item", rule: "full", deductibleAmount: 100 });
    expect(byKey.meals_client).toMatchObject({ rule: "meals", deductibleAmount: 53.75 });
    expect(byKey.vehicle_fuel.rule).toBe("vehicle");
    expect(byKey.vehicle_fuel.deductibleAmount).toBeCloseTo(80, 10);
    expect(r.deductibleTotal).toBeCloseTo(233.75, 10);
    expect(r.ytdTotal).toBeCloseTo(receiptTotals.total, 10);
  });

  it("a key with both receipts and a monthly figure counts the larger, not the sum", () => {
    const items = [{ key: "office_phone", monthly_recurring: 100 }];
    // Six months elapsed by 15 June: the estimate is $600.
    const below = build([], NOT_REGISTERED, { receiptTotals: receiptsByKey({ office_phone: 250 }), expenseItems: items });
    expect(below.lines).toHaveLength(1);
    expect(below.lines[0].rawAmount).toBe(600);

    const above = build([], NOT_REGISTERED, { receiptTotals: receiptsByKey({ office_phone: 900 }), expenseItems: items });
    expect(above.lines[0].rawAmount).toBe(900);
  });

  it("the monthly figure fills in for a key with no receipts, through the current month", () => {
    const r = build([], NOT_REGISTERED, {
      expenseItems: [{ key: "office_phone", monthly_recurring: "100.00" }, { key: "office_software", monthly_recurring: 0 }, { key: "edu_books", monthly_recurring: null }],
    });
    expect(r.lines.map((l) => [l.key, l.rawAmount])).toEqual([["office_phone", 600]]);
    expect(build([], NOT_REGISTERED, { expenseItems: [{ key: "office_phone", monthly_recurring: 100 }], now: new Date(2026, 11, 31, 12) }).ytdTotal).toBe(1200);
  });

  it("a receipt key with no expense item (category-level, custom, hidden category) is still counted", () => {
    const r = build([], NOT_REGISTERED, {
      receiptTotals: receiptsByKey({ vehicle: 200, marketing: 300, entertainment: 100, corp_legal: 50 }),
    });
    const byKey = Object.fromEntries(r.lines.map((l) => [l.key, l]));
    expect(byKey.vehicle).toMatchObject({ lineNumber: "9281", rule: "vehicle" });
    expect(byKey.vehicle.deductibleAmount).toBeCloseTo(160, 10);
    expect(byKey.marketing).toMatchObject({ lineNumber: "8521", deductibleAmount: 300 });
    expect(byKey.entertainment).toMatchObject({ lineNumber: "8523", deductibleAmount: 50 });
    expect(byKey.corp_legal).toMatchObject({ lineNumber: "9270", deductibleAmount: 50 });
    expect(r.ytdTotal).toBe(650);
  });

  it("receipts with no category are counted once, on line 9270", () => {
    const r = build([], NOT_REGISTERED, { receiptTotals: receiptsByKey({ office_supplies: 80 }, 40) });
    const uncategorized = r.lines.find((l) => l.source === "uncategorized");
    expect(uncategorized).toMatchObject({ key: null, lineNumber: "9270", rawAmount: 40, deductibleAmount: 40, rule: "full" });
    expect(r.ytdTotal).toBe(120);
    expect(r.deductibleTotal).toBe(120);
  });

  it("a recurring expense and receipts on the same key are both counted (separate lines)", () => {
    const r = build([recurring({})], NOT_REGISTERED, { receiptTotals: receiptsByKey({ prof_board_mls: 50 }) });
    expect(r.lines.map((l) => [l.source, l.rawAmount])).toEqual([["item", 50], ["recurring", 690]]);
    expect(r.ytdTotal).toBe(740);
  });
});

describe("buildT2125Expenses — Home Office bills", () => {
  // A home bill counts at the home office share (15% here) in every expense
  // total, and reaches the T2125 whole, as a cost behind line 9945. It is
  // never an expense line and never in line 9369.
  const receiptTotals = aggregateReceiptTotals(
    [
      { category_key: "home_utilities", total_amount: 345, tax_amount: 45 },
      { category_key: "home_mortgage_interest", total_amount: 1000, tax_amount: null },
    ],
    REGISTRANT,
  );
  const internet = recurring({ id: "re-net", name: "Home internet", category_key: "home_internet" });

  it("every home key resolves to a home line, including the category key", () => {
    for (const key of Object.keys(HOME_OFFICE_KEY_TO_COST)) {
      expect(isHomeOfficeKey(key)).toBe(true);
      expect(t2125LineForExpenseKey(key), key).toMatchObject({ lineNumber: "9945", applyHomeUse: true });
    }
    expect(t2125LineForExpenseKey("office_supplies").applyHomeUse ?? false).toBe(false);
  });

  it("the share is the line; the whole bills are the T2125 costs", () => {
    const r = build([internet], REGISTRANT, { receiptTotals });
    const byKey = Object.fromEntries(r.lines.map((l) => [l.key, l]));
    expect(byKey.home_utilities).toMatchObject({ source: "item", rule: "home", lineNumber: "9945", rawAmount: 45, deductibleAmount: 45 });
    expect(byKey.home_mortgage_interest).toMatchObject({ rule: "home", rawAmount: 150, deductibleAmount: 150 });
    // Six payments of $100 before HST, at 15%.
    expect(byKey.home_internet).toMatchObject({ source: "recurring", recurringId: "re-net", rule: "home" });
    expect(byKey.home_internet.rawAmount).toBeCloseTo(90, 10);
    expect(r.byRule.home).toBeCloseTo(285, 10);
    expect(r.deductibleTotal).toBeCloseTo(285, 10);
    expect(r.ytdTotal).toBeCloseTo(285, 10);
    expect(r.entries).toEqual([]);
    expect(r.homeOfficeCosts).toEqual({ home_utilities: 300, home_mortgage_interest: 1000, home_internet: 600 });
  });

  it("computeT2125 puts them on line 9945 at the share, and nowhere in line 9369", () => {
    const r = build([internet, recurring({})], REGISTRANT, { receiptTotals });
    const settings = createTestSettings({ gst_hst_registered: true, home_office_business_use_pct: 0.15, vehicle_business_use_pct: 0.8 });
    const t = computeT2125({ settings, transactions: [], expenses: r.entries, homeOfficeCosts: r.homeOfficeCosts, ccaAssets: [], taxYear: 2026 });
    expect(t.line9945_homeOfficeDeduction).toBeCloseTo(r.byRule.home, 10);
    expect(t.line9369_totalExpenses).toBeCloseTo(600, 10);
    expect(t.line9369_totalExpenses).toBeCloseTo(r.deductibleTotal - r.byRule.home, 10);
    expect(t.line9270_otherExpenses).toBe(0);
  });

  it("a recurring expense filed under the Home Office category itself is a home bill, not line 9270", () => {
    const r = build([recurring({ id: "re-home", category_key: "home_office" })], NOT_REGISTERED);
    expect(r.lines[0]).toMatchObject({ rule: "home", lineNumber: "9945" });
    expect(r.lines[0].rawAmount).toBeCloseTo(690 * 0.15, 10);
    expect(r.entries).toEqual([]);
    expect(r.homeOfficeCosts).toEqual({ home_office: 690 });
  });

  it("a home entry handed to computeT2125 is never an expense line", () => {
    const settings = createTestSettings({ home_office_business_use_pct: 0.15 });
    const t = computeT2125({
      settings,
      transactions: [],
      expenses: [{ key: "home_utilities", amount: 45 }, { key: "home_office", amount: 10 }],
      ccaAssets: [],
      taxYear: 2026,
    });
    expect(t.expenseLines).toEqual([]);
    expect(t.line9369_totalExpenses).toBe(0);
  });

  it("the vehicle box on a home bill changes nothing (itcForExpense treats it as a home bill too)", () => {
    const plain = build([internet], REGISTRANT);
    const ticked = build([{ ...internet, vehicle_pct_applicable: true }], REGISTRANT);
    expect(ticked.lines[0]).toMatchObject({ rule: "home", isVehicle: false });
    expect(ticked.deductibleTotal).toBeCloseTo(plain.deductibleTotal, 10);
  });

  it("a legacy monthly figure on a home item is not counted: home bills are logged one by one", () => {
    const r = build([], NOT_REGISTERED, { expenseItems: [{ key: "home_utilities", monthly_recurring: 200 }] });
    expect(r.lines).toEqual([]);
    expect(r.homeOfficeCosts).toEqual({});
  });
});

describe("buildT2125Expenses — totals", () => {
  const receiptTotals = aggregateReceiptTotals(
    [
      { category_key: "office_supplies", total_amount: 115, tax_amount: 15 },
      { category_key: "meals_client", total_amount: 115, tax_amount: 15 },
      { category_key: null, total_amount: 23, tax_amount: 3 },
    ],
    REGISTRANT,
  );
  const list = [recurring({}), LEASE, MEAL];

  it("byRule adds up to the deductible total, and the lines to both totals", () => {
    const r = build(list, REGISTRANT, { receiptTotals });
    expect(r.byRule.full + r.byRule.meals + r.byRule.vehicle + r.byRule.home).toBeCloseTo(r.deductibleTotal, 10);
    expect(r.lines.reduce((s, l) => s + l.deductibleAmount, 0)).toBeCloseTo(r.deductibleTotal, 10);
    expect(r.lines.reduce((s, l) => s + l.rawAmount, 0)).toBeCloseTo(r.ytdTotal, 10);
  });

  it("with no legacy monthly figures, the YTD total is the dashboard's: every receipt plus recurring YTD, net", () => {
    const r = build(list, REGISTRANT, { receiptTotals });
    const dashboard = receiptTotals.total + totalRecurringYTD(recurringExpensesNetOfItc(list, REGISTRANT), JUN_15);
    expect(r.ytdTotal).toBeCloseTo(dashboard, 10);
  });
});

describe("computeT2125 from the built entries", () => {
  const settings = (registered: boolean) =>
    createTestSettings({ gst_hst_registered: registered, vehicle_business_use_pct: 0.8, province: "newBrunswick" });
  const list = [recurring({}), LEASE, MEAL];

  it("registrant: recurring board dues, a lease and a meal land on lines 8760, 9281 and 8523", () => {
    const built = build(list, REGISTRANT);
    const t = computeT2125({ settings: settings(true), transactions: [], expenses: built.entries, ccaAssets: [], taxYear: 2026 });
    expect(t.line8760_licencesMemberships).toBe(600);
    expect(t.line9281_motorVehicle).toBeCloseTo(480, 10);
    expect(t.line8523_mealsEntertainmentGross).toBe(645);
    expect(t.line8523_mealsEntertainment50pct).toBe(322.5);
    expect(t.line9369_totalExpenses).toBeCloseTo(1402.5, 10);
  });

  it("non-registrant: the same three, GST/HST included", () => {
    const built = build(list, NOT_REGISTERED);
    const t = computeT2125({ settings: settings(false), transactions: [], expenses: built.entries, ccaAssets: [], taxYear: 2026 });
    expect(t.line8760_licencesMemberships).toBe(690);
    expect(t.line9281_motorVehicle).toBeCloseTo(552, 10);
    expect(t.line8523_mealsEntertainment50pct).toBe(345);
    expect(t.line9369_totalExpenses).toBeCloseTo(1587, 10);
  });

  it("line 9369 is the Expenses page's deductible total: one calculation, two screens", () => {
    for (const ctx of [REGISTRANT, NOT_REGISTERED]) {
      const built = build([...list, recurring({ id: "re-fc", category_key: "professional_fees" })], ctx, {
        receiptTotals: receiptsByKey({ vehicle: 200, office_supplies: 80, ent_events: 60 }, 40),
        expenseItems: [{ key: "office_phone", monthly_recurring: 100 }],
      });
      const t = computeT2125({ settings: settings(ctx.gstHstRegistered), transactions: [], expenses: built.entries, ccaAssets: [], taxYear: 2026 });
      expect(t.line9369_totalExpenses).toBeCloseTo(built.deductibleTotal - built.byRule.home, 10);
      expect(t.expenseLines.reduce((s, l) => s + l.rawAmount, 0)).toBeCloseTo(built.ytdTotal, 10);
    }
  });

  it("the old input (receipts and legacy figures by key) left every recurring expense out", () => {
    const receiptTotals = receiptsByKey({ office_supplies: 80 });
    const before = computeT2125({ settings: settings(false), transactions: [], expenses: t2125EntriesFromAmounts(receiptTotals.byKey), ccaAssets: [], taxYear: 2026 });
    const built = build(list, NOT_REGISTERED, { receiptTotals });
    const after = computeT2125({ settings: settings(false), transactions: [], expenses: built.entries, ccaAssets: [], taxYear: 2026 });
    expect(before.line9369_totalExpenses).toBe(80);
    expect(after.line9369_totalExpenses - before.line9369_totalExpenses).toBeCloseTo(1587, 10);
  });

  it("an entry with a key that has no line of its own is on line 9270, not dropped", () => {
    const t = computeT2125({
      settings: settings(false),
      transactions: [],
      expenses: [{ key: "marketing", amount: 300 }, { key: null, amount: 40 }, { key: "custom_1", amount: 10 }],
      ccaAssets: [],
      taxYear: 2026,
    });
    expect(t.line8521_advertising).toBe(300);
    expect(t.line9270_otherExpenses).toBe(50);
    expect(t.line9369_totalExpenses).toBe(350);
  });

  it("ignores zero and negative amounts", () => {
    const t = computeT2125({
      settings: settings(false),
      transactions: [],
      expenses: [{ key: "office_supplies", amount: 0 }, { key: "office_supplies", amount: -5 }],
      ccaAssets: [],
      taxYear: 2026,
    });
    expect(t.expenseLines).toEqual([]);
    expect(t.line9369_totalExpenses).toBe(0);
  });
});

// Until 2026-10-13 two rules combined receipts with the per-item monthly
// figure. The Expenses page and the T2125 took the larger PER KEY
// (buildT2125Expenses). The dashboard, Reports, Forecast, Overhead,
// Altimeter, Scenarios, Flight Crew, the weekly digest and the Connector took
// the larger of the two TOTALS, which dropped the smaller side whole. An
// account with a monthly figure on one item and receipts on another saw a
// higher "YTD Expenses" on the Expenses page than on its dashboard.
//
// `ytdExpenseTotals` is now the one call: its total IS the sum of the
// Expenses page's lines.
describe("ytdExpenseTotals — one year-to-date total for every screen", () => {
  // 13 Oct 2026: October is the 10th month, so 10 months have started.
  const NOW = new Date(2026, 9, 13, 12);

  const receipts = [
    { category_key: "prof_board_mls", total_amount: 115, tax_amount: 15 }, // net 100
    { category_key: "meals_client", total_amount: 57.5, tax_amount: 7.5 }, // ITC 3.75 → net 53.75
    { category_key: "vehicle_fuel", total_amount: 230, tax_amount: 30 }, // 80% use: ITC 24, personal 6 → net 200
  ];
  // $575 a month with $75 HST, vehicle use: ITC 60, personal 15 → net 500.
  const lease = recurring({
    id: "lease", name: "Lease", amount: 575, hst_amount: 75,
    category_key: "vehicle_payment", vehicle_pct_applicable: true, start_date: "2026-01-01",
  });
  // A $20 monthly figure on an item with no receipts: 20 × 10 months = 200.
  const expenseItems = [{ key: "office_phone", monthly_recurring: 20 }, { key: "office_software", monthly_recurring: 0 }];

  it("a monthly figure on one item and receipts on another both count", () => {
    const t = ytdExpenseTotals({ receipts, recurring: [lease], expenseItems, ctx: REGISTRANT, now: NOW });
    expect(t.expensesYTD).toBe(353.75 + 200 + 5000);

    // The rule this replaces: the larger of the two totals, so the $200 of
    // monthly figures vanished behind $353.75 of receipts on other items.
    const largerOfTheTotals = Math.max(353.75, 20 * 10) + 5000;
    expect(t.expensesYTD - largerOfTheTotals).toBe(200);
  });

  it("is the Expenses page's total: the sum of the engine lines for the same rows", () => {
    const t = ytdExpenseTotals({ receipts, recurring: [lease], expenseItems, ctx: REGISTRANT, now: NOW });
    const page = buildT2125Expenses({
      receiptTotals: aggregateReceiptTotals(receipts, REGISTRANT),
      expenseItems,
      recurringExpenses: [lease],
      ctx: REGISTRANT,
      now: NOW,
    });
    expect(t.expensesYTD).toBe(page.ytdTotal);
    expect(t.tracked).toEqual(page);
    expect(t.tracked.lines.reduce((s, l) => s + l.rawAmount, 0)).toBe(t.expensesYTD);
    expect(t.receipts).toEqual(aggregateReceiptTotals(receipts, REGISTRANT));
  });

  it("receipts and a monthly figure on the SAME item count once: the larger, never the sum", () => {
    const larger = ytdExpenseTotals({
      receipts, recurring: [lease], expenseItems: [{ key: "prof_board_mls", monthly_recurring: 100 }], ctx: REGISTRANT, now: NOW,
    });
    // Board dues: 100 × 10 = 1,000 against 100 of receipts. The other two receipts still count.
    expect(larger.expensesYTD).toBe(1000 + 53.75 + 200 + 5000);
    expect(larger.estimatesAboveReceipts).toBe(900);

    const smaller = ytdExpenseTotals({
      receipts, recurring: [lease], expenseItems: [{ key: "prof_board_mls", monthly_recurring: 5 }], ctx: REGISTRANT, now: NOW,
    });
    expect(smaller.expensesYTD).toBe(353.75 + 5000);
    expect(smaller.estimatesAboveReceipts).toBe(0);
  });

  it("the three parts add up to the total", () => {
    const t = ytdExpenseTotals({ receipts, recurring: [lease], expenseItems, ctx: REGISTRANT, now: NOW });
    expect(t.receiptYTD).toBe(353.75);
    expect(t.estimatesAboveReceipts).toBe(200);
    expect(t.recurringYTD).toBe(5000);
    expect(t.receiptYTD + t.estimatesAboveReceipts + t.recurringYTD).toBe(t.expensesYTD);
  });

  it("monthly: the per-item figures plus the Recurring Expenses list, and the lines add up to it", () => {
    const t = ytdExpenseTotals({ receipts, recurring: [lease], expenseItems, ctx: REGISTRANT, now: NOW });
    expect(t.legacyMonthlyRecurring).toBe(20);
    expect(t.recurringMonthly).toBe(500);
    expect(t.monthlyRecurring).toBe(520);
    expect(t.recurringMonthly).toBe(totalRecurringMonthly(recurringExpensesNetOfItc([lease], REGISTRANT), NOW));
    expect(t.tracked.lines.reduce((s, l) => s + l.monthlyAmount, 0)).toBe(t.monthlyRecurring);
    expect(t.tracked.monthlyTotal).toBe(t.monthlyRecurring);

    const byKey = Object.fromEntries(t.tracked.lines.map((l) => [l.source + ":" + l.key, l.monthlyAmount]));
    expect(byKey).toEqual({
      "item:prof_board_mls": 0, // receipts only: nothing is expected again next month
      "item:meals_client": 0,
      "item:vehicle_fuel": 0,
      "item:office_phone": 20,
      "recurring:vehicle_payment": 500,
    });
  });

  it("a recurring expense that ended on 30 June: its year to date stays, and it is out of every monthly figure", () => {
    const endedLease = { ...lease, end_date: "2026-06-30" };
    const t = ytdExpenseTotals({ receipts, recurring: [endedLease], expenseItems, ctx: REGISTRANT, now: NOW });
    expect(t.recurringYTD).toBe(6 * 500); // Jan 1 to Jun 1
    expect(t.expensesYTD).toBe(353.75 + 200 + 3000);
    expect(t.recurringMonthly).toBe(0);
    expect(t.monthlyRecurring).toBe(20); // the per-item figure only
    expect(t.tracked.monthlyTotal).toBe(20);
    expect(t.recurringMonthly).toBe(totalRecurringMonthly(recurringExpensesNetOfItc([endedLease], REGISTRANT), NOW));
  });

  it("non-registrant: every part is the amount paid", () => {
    const t = ytdExpenseTotals({ receipts, recurring: [lease], expenseItems, ctx: NOT_REGISTERED, now: NOW });
    expect(t.receiptYTD).toBe(402.5);
    expect(t.recurringMonthly).toBe(575);
    expect(t.recurringYTD).toBe(5750);
    expect(t.monthlyRecurring).toBe(595);
    expect(t.expensesYTD).toBe(402.5 + 200 + 5750);
  });

  it("the same total with the GST/HST left in is what someone not registered would see", () => {
    const inputs = { receipts, recurring: [lease], expenseItems, ctx: REGISTRANT, now: NOW };
    expect(ytdExpensesGstHstIncluded(inputs)).toBe(ytdExpenseTotals({ ...inputs, ctx: NOT_REGISTERED }).expensesYTD);
    expect(ytdExpensesGstHstIncluded(inputs)).toBeGreaterThan(ytdExpenseTotals(inputs).expensesYTD);
    expect(ytdExpensesGstHstIncluded({ ...inputs, ctx: NOT_REGISTERED })).toBe(6352.5);
  });

  it("a monthly figure and a Recurring Expenses row on the same item both count (two entries the user made)", () => {
    const t = ytdExpenseTotals({
      receipts: [], recurring: [lease], expenseItems: [{ key: "vehicle_payment", monthly_recurring: 300 }], ctx: REGISTRANT, now: NOW,
    });
    expect(t.tracked.lines.map((l) => [l.source, l.rawAmount])).toEqual([["item", 3000], ["recurring", 5000]]);
    expect(t.expensesYTD).toBe(8000);
    expect(t.monthlyRecurring).toBe(800);
  });

  it("a home bill counts at the workspace share, as in every other total", () => {
    // $230 power bill with $30 HST at a 15% workspace: ITC 4.50, the bill
    // before tax is 200, and 15% of that is the expense.
    const power = { category_key: "home_utilities", total_amount: 230, tax_amount: 30 };
    const withBill = ytdExpenseTotals({ receipts: [...receipts, power], recurring: [lease], expenseItems, ctx: REGISTRANT, now: NOW });
    expect(withBill.receiptYTD).toBe(353.75 + 30);
    expect(withBill.expensesYTD).toBe(5553.75 + 30);
    // No workspace share set (the column default): the bill counts for nothing.
    const noShare = ytdExpenseTotals({
      receipts: [...receipts, power], recurring: [lease], expenseItems,
      ctx: { ...REGISTRANT, homeOfficeBusinessUsePct: 0 }, now: NOW,
    });
    expect(noShare.expensesYTD).toBe(5553.75);
  });

  it("a monthly figure on a home item counts in neither figure: home bills are logged one by one", () => {
    const t = ytdExpenseTotals({
      receipts: [], recurring: [], expenseItems: [{ key: "home_utilities", monthly_recurring: 200 }], ctx: REGISTRANT, now: NOW,
    });
    expect(t.expensesYTD).toBe(0);
    expect(t.monthlyRecurring).toBe(0);
  });

  it("months elapsed is the calendar month (1 to 12), never a fraction of one", () => {
    const only = { receipts: [], recurring: [], expenseItems: [{ key: "office_phone", monthly_recurring: 100 }], ctx: REGISTRANT };
    expect(ytdExpenseTotals({ ...only, now: new Date(2026, 0, 31, 12) }).expensesYTD).toBe(100);
    expect(ytdExpenseTotals({ ...only, now: new Date(2026, 11, 1, 12) }).expensesYTD).toBe(1200);
  });

  it("inactive recurring rows count nothing, and the stored rows are left as entered", () => {
    const off = recurring({ id: "off", is_active: false });
    const t = ytdExpenseTotals({ receipts: [], recurring: [off, lease], expenseItems: [], ctx: REGISTRANT, now: NOW });
    expect(t.recurringMonthly).toBe(500);
    expect(t.recurringYTD).toBe(5000);
    expect(lease.amount).toBe(575);
  });

  it("accepts PostgREST's numeric strings and null lists", () => {
    const t = ytdExpenseTotals({
      receipts: null, recurring: undefined,
      expenseItems: [{ key: "office_phone", monthly_recurring: "12.50" }, { key: "edu_books", monthly_recurring: null }, { key: "edu_courses" }],
      ctx: REGISTRANT, now: NOW,
    });
    expect(t.legacyMonthlyRecurring).toBe(12.5);
    expect(t.expensesYTD).toBe(125);
    expect(ytdExpenseTotals({ receipts: null, recurring: null, expenseItems: null, ctx: REGISTRANT, now: NOW }).expensesYTD).toBe(0);
  });
});

// ── Next year's expenses ───────────────────────────────────────────────────
//
// The dashboard's next-year plan (year-plan-engine) takes one figure for the
// year's business expenses. Until 2026-10-13 it was `monthlyRecurring` × 12:
// what the list costs each month today, twelve times. A lease with an end
// date of Dec 31 was counted for all of next year until Jan 1, and a row
// starting in July for the whole year.
//
// A Recurring Expenses row has dates, so it counts by the charge dates that
// fall in next year. A per-item monthly figure has none: twelve months of it.
describe("ytdExpenseTotals — next year's expenses, for the dashboard's plan", () => {
  const NOW = new Date(2026, 9, 13, 12);
  const nextYear = (
    rows: RecurringExpense[],
    expenseItems: { key: string; monthly_recurring?: number | string | null }[] = [],
    ctx = REGISTRANT,
    now = NOW,
  ) => ytdExpenseTotals({ receipts: [], recurring: rows, expenseItems, ctx, now });

  it("a recurring expense with no end date is twelve charges, net of ITC", () => {
    // $115 with $15 HST: 100 for a registrant, 115 for someone who is not.
    expect(nextYear([recurring({})]).expensesNextYear).toBe(1200);
    expect(nextYear([recurring({})]).recurringNextYear).toBe(1200);
    expect(nextYear([recurring({})], [], NOT_REGISTERED).expensesNextYear).toBe(1380);
  });

  it("one that ends on Dec 31 this year is not in next year, while today's monthly figure still carries it", () => {
    const t = nextYear([recurring({ end_date: "2026-12-31" })]);
    expect(t.monthlyRecurring).toBe(100);
    expect(t.expensesNextYear).toBe(0);
  });

  it("one that ends part-way through next year counts up to its end date", () => {
    expect(nextYear([recurring({ end_date: "2027-06-30" })]).expensesNextYear).toBe(600);
  });

  it("one that starts part-way through next year counts from its start date", () => {
    const t = nextYear([recurring({ start_date: "2027-07-01" })]);
    expect(t.expensesNextYear).toBe(600);
    // Scheduled, so already in today's monthly figure: × 12 would be a full year.
    expect(t.monthlyRecurring * 12).toBe(1200);
  });

  it("an annual fee counts once, in full, on its date", () => {
    const dues = recurring({ frequency: "annual", amount: 1150, hst_amount: 150, month_of_year: 11, day_of_month: 1 });
    expect(nextYear([dues]).expensesNextYear).toBe(1000);
    // Ended before the renewal date: none of it, where a twelfth a month × 12 counted it all.
    expect(nextYear([{ ...dues, end_date: "2027-06-30" }]).expensesNextYear).toBe(0);
  });

  it("a per-item monthly figure has no dates: twelve months of it", () => {
    const t = nextYear([], [{ key: "office_phone", monthly_recurring: 20 }]);
    expect(t.recurringNextYear).toBe(0);
    expect(t.expensesNextYear).toBe(240);
  });

  it("is the monthly figures × 12 plus the recurring list's charges next year", () => {
    const t = nextYear(
      [recurring({ id: "a" }), recurring({ id: "b", end_date: "2026-12-31" }), recurring({ id: "c", end_date: "2027-03-31" })],
      [{ key: "office_phone", monthly_recurring: 20 }, { key: "marketing_digital", monthly_recurring: "30" }],
    );
    expect(t.recurringNextYear).toBe(1200 + 0 + 300);
    expect(t.expensesNextYear).toBe(50 * 12 + 1500);
    // The figure it replaces counted all three rows for the whole year.
    expect(t.monthlyRecurring * 12).toBe((50 + 300) * 12);
  });

  it("with nothing dated it is the monthly figure × 12, as before", () => {
    const t = nextYear([recurring({ id: "a" }), recurring({ id: "b", amount: 230, hst_amount: 30 })], [{ key: "office_phone", monthly_recurring: 20 }]);
    expect(t.expensesNextYear).toBe(t.monthlyRecurring * 12);
  });

  it("receipts are not projected into next year", () => {
    const t = ytdExpenseTotals({
      receipts: [{ category_key: "prof_board_mls", total_amount: 115, tax_amount: 15 }],
      recurring: [], expenseItems: [], ctx: REGISTRANT, now: NOW,
    });
    expect(t.expensesYTD).toBe(100);
    expect(t.expensesNextYear).toBe(0);
  });

  it("a vehicle or home row counts as it does in every other total", () => {
    // Lease $575 with $75 HST at 80% use: ITC 60, personal 15 → 500 a charge.
    const lease = recurring({ id: "lease", amount: 575, hst_amount: 75, category_key: "vehicle_payment", vehicle_pct_applicable: true });
    expect(nextYear([lease]).expensesNextYear).toBe(6000);
    // A $200 home internet bill with no HST recorded, at the 15% share: 30 a charge.
    const internet = recurring({ id: "net", amount: 200, hst_amount: 0, hst_included: false, category_key: "home_utilities" });
    expect(nextYear([internet]).expensesNextYear).toBeCloseTo(360, 6);
  });

  it("a paused row counts nothing", () => {
    expect(nextYear([recurring({ is_active: false })]).expensesNextYear).toBe(0);
  });

  it("next year is the year after the anchor's", () => {
    const endsMid2027 = recurring({ end_date: "2027-06-30" });
    expect(nextYear([endsMid2027], [], REGISTRANT, new Date(2026, 11, 31, 12)).expensesNextYear).toBe(600);
    // On Jan 1 2027 the plan is 2028's, and the row is over by then.
    expect(nextYear([endsMid2027], [], REGISTRANT, new Date(2027, 0, 1, 12)).expensesNextYear).toBe(0);
  });

  it("accepts null lists", () => {
    const t = ytdExpenseTotals({ receipts: null, recurring: null, expenseItems: null, ctx: REGISTRANT, now: NOW });
    expect(t.recurringNextYear).toBe(0);
    expect(t.expensesNextYear).toBe(0);
  });
});
