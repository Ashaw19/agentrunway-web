/**
 * Expense totals net of input tax credits (2026-10-13).
 *
 * Found right after #296 (GST34 ITC limits): every expense total in the app
 * summed `receipt_expenses.total_amount` and `recurring_expenses.amount`,
 * both of which include GST/HST. For a GST/HST registrant that tax is
 * claimed back as an ITC on the GST34, so it was counted twice: once as an
 * ITC and again as a business expense. In a 15% HST province that is 13% of
 * every taxed expense ($15 of each $115), on the Expenses KPI, the expense
 * ratio, the T2125 lines and the income-tax estimate.
 *
 * CRA: deductible expenses include the GST/HST incurred on them, less any
 * ITC claimed (T4002 ch. 3; canada.ca "Business expenses"). A non-registrant
 * claims no ITC, so the full amount paid stays the expense.
 *
 * Fixtures are $115 paid with $15 HST unless a test says otherwise.
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_VEHICLE_BUSINESS_USE_PCT,
  aggregateReceiptTotals,
  expenseNetOfItc,
  expenseTaxContext,
  inputTaxCreditsForPeriod,
  recurringExpensesNetOfItc,
  recurringNetOfItc,
  remainingYearExpenses,
} from "../expense-totals-engine";
import { ytdExpenseTotals } from "../t2125-expenses-engine";
import { computeGST34 } from "../gst34-engine";
import { getFilingPeriods } from "../filing-period-engine";
import {
  recurringHSTEntriesForPeriod,
  totalRecurringMonthly,
  totalRecurringYTD,
} from "../recurring-expense-engine";
import { computeT2125, t2125EntriesFromAmounts } from "../t2125-engine";
import { createTestSettings } from "./test-data";
import type { RecurringExpense } from "../../types/database";

const REGISTRANT = { gstHstRegistered: true, vehicleBusinessUsePct: 0.8, homeOfficeBusinessUsePct: 0.15 };
const NOT_REGISTERED = { gstHstRegistered: false, vehicleBusinessUsePct: 0.8, homeOfficeBusinessUsePct: 0.15 };

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

describe("expenseTaxContext", () => {
  it("reads registration and vehicle use from user_settings", () => {
    expect(expenseTaxContext({ gst_hst_registered: true, vehicle_business_use_pct: 0.65, home_office_business_use_pct: 0 }))
      .toEqual({ gstHstRegistered: true, vehicleBusinessUsePct: 0.65, homeOfficeBusinessUsePct: 0 });
  });

  it("treats missing settings as not registered, with the column's default vehicle use", () => {
    expect(expenseTaxContext(null)).toEqual({ gstHstRegistered: false, vehicleBusinessUsePct: DEFAULT_VEHICLE_BUSINESS_USE_PCT, homeOfficeBusinessUsePct: 0 });
    expect(expenseTaxContext(undefined).gstHstRegistered).toBe(false);
    expect(expenseTaxContext({ gst_hst_registered: null, vehicle_business_use_pct: null, home_office_business_use_pct: 0 }))
      .toEqual({ gstHstRegistered: false, vehicleBusinessUsePct: 0.8, homeOfficeBusinessUsePct: 0 });
  });

  it("keeps an explicit 0% vehicle use (it is not 'missing') and clamps to 0–1", () => {
    expect(expenseTaxContext({ gst_hst_registered: true, vehicle_business_use_pct: 0, home_office_business_use_pct: 0 }).vehicleBusinessUsePct).toBe(0);
    expect(expenseTaxContext({ gst_hst_registered: true, vehicle_business_use_pct: "0.9000", home_office_business_use_pct: 0 }).vehicleBusinessUsePct).toBe(0.9);
    expect(expenseTaxContext({ gst_hst_registered: true, vehicle_business_use_pct: 1.4, home_office_business_use_pct: 0 }).vehicleBusinessUsePct).toBe(1);
  });
});

describe("expenseNetOfItc — one expense", () => {
  it("non-registrant: the full amount paid is the expense, no ITC", () => {
    expect(expenseNetOfItc(115, 15, "office_supplies", NOT_REGISTERED)).toEqual({ paid: 115, itc: 0, net: 115 });
    expect(expenseNetOfItc(115, 15, "meals_client", NOT_REGISTERED).net).toBe(115);
    expect(expenseNetOfItc(115, 15, "vehicle_fuel", NOT_REGISTERED).net).toBe(115);
  });

  it("registrant: an ordinary expense is net of all its GST/HST", () => {
    expect(expenseNetOfItc(115, 15, "office_supplies", REGISTRANT)).toEqual({ paid: 115, itc: 15, net: 100 });
  });

  it("registrant, meals: only half the GST/HST is an ITC, so the other half stays in the expense", () => {
    const meal = expenseNetOfItc(115, 15, "meals_client", REGISTRANT);
    expect(meal.itc).toBe(7.5);
    expect(meal.net).toBe(107.5);
  });

  it("registrant, vehicle between 10% and 90% business use: ITC is the business share; the personal share is not an expense either", () => {
    const fuel = expenseNetOfItc(115, 15, "vehicle_fuel", REGISTRANT);
    expect(fuel.itc).toBeCloseTo(12, 10);
    // $3 of the HST is personal use: not claimed, and not a business cost.
    expect(fuel.net).toBeCloseTo(100, 10);
    expect(fuel.paid - fuel.itc - fuel.net).toBeCloseTo(3, 10);
  });

  it("registrant, vehicle at 90% or more: all the GST/HST is an ITC", () => {
    const fuel = expenseNetOfItc(115, 15, "vehicle_fuel", { ...REGISTRANT, vehicleBusinessUsePct: 0.95 });
    expect(fuel).toEqual({ paid: 115, itc: 15, net: 100 });
  });

  it("registrant, vehicle at 10% or less: no ITC, so the GST/HST stays in the expense", () => {
    const fuel = expenseNetOfItc(115, 15, "vehicle_fuel", { ...REGISTRANT, vehicleBusinessUsePct: 0.1 });
    expect(fuel).toEqual({ paid: 115, itc: 0, net: 115 });
  });

  it("a recurring expense flagged vehicle-use follows the vehicle rule whatever its category key", () => {
    const flagged = expenseNetOfItc(115, 15, "other_misc", REGISTRANT, true);
    expect(flagged.itc).toBeCloseTo(12, 10);
    expect(flagged.net).toBeCloseTo(100, 10);
  });

  it("no GST/HST recorded (null, 0, blank): nothing is claimed, so nothing comes off", () => {
    for (const tax of [null, undefined, 0, "0", ""]) {
      expect(expenseNetOfItc(115, tax, "office_supplies", REGISTRANT)).toEqual({ paid: 115, itc: 0, net: 115 });
    }
  });

  it("accepts the numeric strings PostgREST returns", () => {
    expect(expenseNetOfItc("115.00", "15.00", "office_supplies", REGISTRANT)).toEqual({ paid: 115, itc: 15, net: 100 });
  });

  it("bad data can't push an expense below zero: GST/HST is capped at the amount paid", () => {
    expect(expenseNetOfItc(115, 500, "office_supplies", REGISTRANT)).toEqual({ paid: 115, itc: 115, net: 0 });
  });

  it("a negative tax or a non-numeric amount never produces NaN or a negative ITC", () => {
    expect(expenseNetOfItc(115, -15, "office_supplies", REGISTRANT)).toEqual({ paid: 115, itc: 0, net: 115 });
    expect(expenseNetOfItc("abc", 15, "office_supplies", REGISTRANT)).toEqual({ paid: 0, itc: 0, net: 0 });
    expect(expenseNetOfItc(null, 15, "office_supplies", REGISTRANT)).toEqual({ paid: 0, itc: 0, net: 0 });
    // A credit note: passes through as entered, with no ITC attached.
    expect(expenseNetOfItc(-50, -6.52, "office_supplies", REGISTRANT)).toEqual({ paid: -50, itc: 0, net: -50 });
  });

  it("a meal that is also flagged vehicle-use never goes below a zero ITC", () => {
    const odd = expenseNetOfItc(115, 15, "meals_client", { ...REGISTRANT, vehicleBusinessUsePct: 0.3 }, true);
    expect(odd.itc).toBe(0);
    expect(odd.net).toBe(115);
  });
});

describe("aggregateReceiptTotals", () => {
  const rows = [
    { category_key: "office_supplies", total_amount: 115, tax_amount: 15 },
    { category_key: "office_supplies", total_amount: 57.5, tax_amount: 7.5 },
    { category_key: "meals_client", total_amount: 115, tax_amount: 15 },
    { category_key: "vehicle_fuel", total_amount: 115, tax_amount: 15 },
    { category_key: "prof_eo", total_amount: 400, tax_amount: 0 },        // exempt: no GST/HST
    { category_key: null, total_amount: 23, tax_amount: 3 },              // uncategorized
    { category_key: "marketing_ads", total_amount: 80, tax_amount: null }, // tax never entered
  ];

  it("registrant: per-key, uncategorized and total are all net of ITCs", () => {
    const t = aggregateReceiptTotals(rows, REGISTRANT);
    expect(t.byKey).toEqual({
      office_supplies: 150,
      meals_client: 107.5,
      vehicle_fuel: 100,
      prof_eo: 400,
      marketing_ads: 80,
    });
    expect(t.uncategorized).toBe(20);
    expect(t.total).toBe(857.5);
    expect(t.paid).toBe(905.5);
    // 15 + 7.5 + 7.5 (meal half) + 12 (vehicle 80%) + 3
    expect(t.itc).toBe(45);
  });

  it("non-registrant: every figure is the amount paid and no ITC", () => {
    const t = aggregateReceiptTotals(rows, NOT_REGISTERED);
    expect(t.total).toBe(905.5);
    expect(t.paid).toBe(905.5);
    expect(t.itc).toBe(0);
    expect(t.byKey.office_supplies).toBe(172.5);
    expect(t.uncategorized).toBe(23);
  });

  it("what comes off the expenses is exactly what the GST34 pre-fill claims, plus the personal share of vehicle GST/HST", () => {
    const [, , Q3] = getFilingPeriods("quarterly", 2026);
    const gst34 = computeGST34({
      province: "newBrunswick",
      period: Q3,
      frequency: "quarterly",
      periodTransactions: [],
      periodReceipts: rows.map((r) => ({ total_amount: r.total_amount, tax_amount: r.tax_amount, category_key: r.category_key })),
      instalmentsPaid: 0,
      vehicleBusinessUsePct: REGISTRANT.vehicleBusinessUsePct,
    });
    const t = aggregateReceiptTotals(rows, REGISTRANT);
    expect(t.itc).toBeCloseTo(gst34.line108, 2);
    expect(t.paid - t.total).toBeCloseTo(gst34.line108 + gst34.vehicleItcReduction, 2);
  });

  it("total always equals byKey + uncategorized", () => {
    const t = aggregateReceiptTotals(rows, REGISTRANT);
    const fromParts = Object.values(t.byKey).reduce((s, v) => s + v, 0) + t.uncategorized;
    expect(t.total).toBeCloseTo(fromParts, 2);
  });

  it("treats an empty-string category_key as uncategorized, not as a key", () => {
    const { byKey, uncategorized } = aggregateReceiptTotals([{ category_key: "", total_amount: 40 }], NOT_REGISTERED);
    expect(byKey).toEqual({});
    expect(uncategorized).toBe(40);
  });

  it("skips null and non-numeric amounts instead of producing NaN", () => {
    const { byKey, uncategorized, total } = aggregateReceiptTotals([
      { category_key: "office_supplies", total_amount: null },
      { category_key: null, total_amount: undefined },
      { category_key: "office_supplies", total_amount: "not a number" },
      { category_key: "office_supplies", total_amount: 30 },
    ], REGISTRANT);
    expect(byKey).toEqual({ office_supplies: 30 });
    expect(uncategorized).toBe(0);
    expect(total).toBe(30);
  });

  it("returns zeroed totals for null, undefined and empty input", () => {
    for (const input of [null, undefined, []]) {
      expect(aggregateReceiptTotals(input, REGISTRANT)).toEqual({ byKey: {}, uncategorized: 0, total: 0, paid: 0, itc: 0, homeOfficeCosts: {} });
    }
  });

  it("does not accumulate floating-point drift across many rows", () => {
    const many = Array.from({ length: 300 }, () => ({ category_key: "office_supplies", total_amount: 0.1 }));
    expect(aggregateReceiptTotals(many, NOT_REGISTERED).total).toBe(30);
  });
});

describe("recurring expenses", () => {
  it("one occurrence: amount is what is charged, hst_amount the GST/HST inside it", () => {
    expect(recurringNetOfItc(recurring({}), REGISTRANT)).toEqual({ paid: 115, itc: 15, net: 100 });
    expect(recurringNetOfItc(recurring({}), NOT_REGISTERED)).toEqual({ paid: 115, itc: 0, net: 115 });
  });

  it("no GST/HST on it (hst_included off): nothing comes off", () => {
    const insurance = recurring({ hst_included: false, hst_amount: 0, amount: 210, category_key: "vehicle_insurance" });
    expect(recurringNetOfItc(insurance, REGISTRANT)).toEqual({ paid: 210, itc: 0, net: 210 });
  });

  it("a lease flagged vehicle-use: ITC is the business share, the expense is the lease before GST/HST", () => {
    const lease = recurring({ amount: 680.57, hst_amount: 88.77, category_key: "vehicle_payment", vehicle_pct_applicable: true });
    const out = recurringNetOfItc(lease, REGISTRANT);
    expect(out.itc).toBeCloseTo(71.016, 3);
    expect(out.net).toBeCloseTo(591.8, 2);
  });

  it("the ITC per occurrence matches what the GST34 pre-fill claims for the same expense", () => {
    const lease = recurring({ amount: 680.57, hst_amount: 88.77, category_key: "vehicle_payment", vehicle_pct_applicable: true });
    const [entry] = recurringHSTEntriesForPeriod([lease], "2026-07-01", "2026-07-31");
    const [, , Q3] = getFilingPeriods("quarterly", 2026);
    const gst34 = computeGST34({
      province: "newBrunswick",
      period: Q3,
      frequency: "quarterly",
      periodTransactions: [],
      periodReceipts: [{ total_amount: null, ...entry }],
      instalmentsPaid: 0,
      vehicleBusinessUsePct: 0.8,
    });
    expect(recurringNetOfItc(lease, REGISTRANT).itc).toBeCloseTo(gst34.line108, 6);
  });

  it("net copies feed the existing monthly and YTD totals, and leave the originals alone", () => {
    const dues = recurring({});
    const quarterly = recurring({ id: "re-2", frequency: "quarterly", month_of_year: 1, amount: 345, hst_amount: 45 });
    const inactive = recurring({ id: "re-3", is_active: false });
    const original = [dues, quarterly, inactive];
    const net = recurringExpensesNetOfItc(original, REGISTRANT);

    expect(net.map((r) => r.amount)).toEqual([100, 300, 100]);
    expect(original.map((r) => r.amount)).toEqual([115, 345, 115]);
    expect(net[0]).not.toBe(dues);
    // Everything but the amount is untouched (ids, dates, frequency).
    expect({ ...net[1], amount: 345 }).toEqual(quarterly);

    expect(totalRecurringMonthly(net)).toBe(200);          // 100 + 300/3
    expect(totalRecurringMonthly(original)).toBe(230);     // 115 + 345/3
    const jun15 = new Date(2026, 5, 15);
    expect(totalRecurringYTD(net, jun15)).toBe(6 * 100 + 2 * 300);
  });

  it("non-registrant: the copies carry the amounts as entered", () => {
    const original = [recurring({}), recurring({ id: "re-2", amount: 345, hst_amount: 45 })];
    expect(recurringExpensesNetOfItc(original, NOT_REGISTERED).map((r) => r.amount)).toEqual([115, 345]);
  });

  it("handles null and undefined lists", () => {
    expect(recurringExpensesNetOfItc(null, REGISTRANT)).toEqual([]);
    expect(recurringExpensesNetOfItc(undefined, REGISTRANT)).toEqual([]);
  });
});

describe("T2125 lines from net amounts", () => {
  const rows = [
    { category_key: "office_supplies", total_amount: 115, tax_amount: 15 },
    { category_key: "meals_client", total_amount: 115, tax_amount: 15 },
    { category_key: "vehicle_fuel", total_amount: 115, tax_amount: 15 },
  ];

  it("registrant: lines are net of ITCs before the 50% and business-use limits", () => {
    const settings = createTestSettings({ gst_hst_registered: true, vehicle_business_use_pct: 0.8, province: "newBrunswick" });
    const { byKey } = aggregateReceiptTotals(rows, expenseTaxContext(settings));
    const t = computeT2125({ settings, transactions: [], expenses: t2125EntriesFromAmounts(byKey), ccaAssets: [], taxYear: 2026 });

    expect(t.line8811_officeSupplies).toBe(100);
    // 50% of ($115 − the $7.50 ITC)
    expect(t.line8523_mealsEntertainment50pct).toBe(53.75);
    // 80% of the $100 before HST: the business share, with its HST claimed as an ITC
    expect(t.line9281_motorVehicle).toBeCloseTo(80, 10);
    expect(t.line9369_totalExpenses).toBeCloseTo(233.75, 10);
  });

  it("non-registrant: lines carry the GST/HST, as before", () => {
    const settings = createTestSettings({ gst_hst_registered: false, vehicle_business_use_pct: 0.8, province: "newBrunswick" });
    const { byKey } = aggregateReceiptTotals(rows, expenseTaxContext(settings));
    const t = computeT2125({ settings, transactions: [], expenses: t2125EntriesFromAmounts(byKey), ccaAssets: [], taxYear: 2026 });

    expect(t.line8811_officeSupplies).toBe(115);
    expect(t.line8523_mealsEntertainment50pct).toBe(57.5);
    expect(t.line9281_motorVehicle).toBeCloseTo(92, 10);
    expect(t.line9369_totalExpenses).toBeCloseTo(264.5, 10);
  });

  it("the old HST-inclusive input overstated a registrant's T2125 expenses", () => {
    const settings = createTestSettings({ gst_hst_registered: true, vehicle_business_use_pct: 0.8, province: "newBrunswick" });
    const net = aggregateReceiptTotals(rows, expenseTaxContext(settings));
    const before = computeT2125({ settings, transactions: [], expenses: t2125EntriesFromAmounts({ office_supplies: 115, meals_client: 115, vehicle_fuel: 115 }), ccaAssets: [], taxYear: 2026 });
    const after = computeT2125({ settings, transactions: [], expenses: t2125EntriesFromAmounts(net.byKey), ccaAssets: [], taxYear: 2026 });
    expect(before.line9369_totalExpenses - after.line9369_totalExpenses).toBeCloseTo(30.75, 10);
  });
});

// The year-to-date total across receipts, the per-item monthly figure and the
// Recurring Expenses list is `ytdExpenseTotals` in t2125-expenses-engine,
// tested in t2125-expenses-engine.test.ts.

// The year's expenses are what has been counted to date plus what is still to
// come. Recurring expenses count by charge date (2026-10-13), so "still to
// come" has to be the charges after today, not a monthly figure × whole
// months left: on the 13th that drops a charge due on the 20th from the year.
describe("ytdExpenseTotals — what is still to come this year", () => {
  const at = (month: number, day: number) => new Date(2026, month - 1, day, 12);
  // $575 a month on the 20th, net 500 for a registrant.
  const lease = recurring({
    id: "lease", name: "Lease", amount: 575, hst_amount: 75, day_of_month: 20,
    category_key: "vehicle_payment", vehicle_pct_applicable: true, start_date: "2026-01-01",
  });
  const expenseItems = [{ key: "office_phone", monthly_recurring: 20 }];
  const totals = (now: Date, rows = [lease]) =>
    ytdExpenseTotals({ receipts: [], recurring: rows, expenseItems, ctx: REGISTRANT, now });

  it("before this month's charge day: nine charges to date, three still to come", () => {
    const t = totals(at(10, 13));
    expect(t.recurringYTD).toBe(4500);
    expect(t.recurringRemaining).toBe(1500);
    // Legacy monthly figure: the two whole months after this one.
    expect(t.expensesRemaining).toBe(1500 + 20 * 2);
  });

  it("on the charge day it moves to year to date, and the year's total does not change", () => {
    const before = totals(at(10, 13));
    const after = totals(at(10, 20));
    expect(after.recurringYTD).toBe(5000);
    expect(after.recurringRemaining).toBe(1000);
    expect(after.expensesYTD + after.expensesRemaining).toBe(before.expensesYTD + before.expensesRemaining);
  });

  it("year to date plus still to come is twelve charges on any day of the year", () => {
    for (const day of [at(1, 1), at(1, 20), at(6, 30), at(10, 13), at(10, 20), at(12, 31)]) {
      const t = totals(day);
      expect(t.recurringYTD + t.recurringRemaining, day.toDateString()).toBe(6000);
    }
  });

  it("an annual fee still ahead is all of it, not a twelfth per month left", () => {
    const annual = recurring({ id: "annual", frequency: "annual", month_of_year: 12, day_of_month: 15, amount: 1200, hst_amount: 0 });
    const t = totals(at(10, 13), [annual]);
    expect(t.recurringYTD).toBe(0);
    expect(t.recurringRemaining).toBe(1200);
  });

  it("an annual fee already charged adds nothing more", () => {
    const annual = recurring({ id: "annual", frequency: "annual", month_of_year: 3, day_of_month: 10, amount: 1200, hst_amount: 0 });
    const t = totals(at(10, 13), [annual]);
    expect(t.recurringYTD).toBe(1200);
    expect(t.recurringRemaining).toBe(0);
  });

  it("remainingYearExpenses: the legacy figure for the months after this one, plus the recurring charges left", () => {
    expect(remainingYearExpenses(100, 250, at(10, 13))).toBe(100 * 2 + 250);
    expect(remainingYearExpenses(100, 0, at(1, 31))).toBe(1100);
    expect(remainingYearExpenses(100, 250, at(12, 1))).toBe(250);
  });
});

describe("inputTaxCreditsForPeriod — the ITCs the GST34 pre-fill claims", () => {
  const receipts = [
    { category_key: "prof_board_mls", total_amount: 115, tax_amount: 15 }, // 15
    { category_key: "meals_client", total_amount: 57.5, tax_amount: 7.5 }, // 3.75
    { category_key: "vehicle_fuel", total_amount: 230, tax_amount: 30 }, // 24 at 80%
  ];
  const lease = recurring({
    id: "lease", name: "Lease", amount: 575, hst_amount: 75,
    category_key: "vehicle_payment", vehicle_pct_applicable: true, start_date: "2026-01-01",
  });

  it("registrant: receipts and recurring, with the meal and vehicle limits", () => {
    const itc = inputTaxCreditsForPeriod(receipts, [lease], REGISTRANT, "2026-01-01", "2026-10-13");
    expect(itc.receipts).toBe(42.75);
    // Ten payments (Jan 1 to Oct 1) × $75 × 80%.
    expect(itc.recurring).toBe(600);
    expect(itc.total).toBe(642.75);
  });

  it("equals GST34 line 108 for the same period and inputs", () => {
    const period = { label: "2026 to date", startDate: "2026-01-01", endDate: "2026-10-13", deadline: "2027-01-31" };
    const gst34 = computeGST34({
      province: "newBrunswick",
      period,
      frequency: "quarterly",
      periodTransactions: [],
      periodReceipts: [
        ...receipts,
        ...recurringHSTEntriesForPeriod([lease], period.startDate, period.endDate).map((e) => ({ total_amount: null, ...e })),
      ],
      instalmentsPaid: 0,
      vehicleBusinessUsePct: REGISTRANT.vehicleBusinessUsePct,
    });
    const itc = inputTaxCreditsForPeriod(receipts, [lease], REGISTRANT, period.startDate, period.endDate);
    expect(itc.total).toBeCloseTo(gst34.line108, 10);
  });

  it("a home bill's GST/HST is an ITC at the workspace share, as on GST34 line 108", () => {
    const power = { category_key: "home_utilities", total_amount: 230, tax_amount: 30 };
    const itc = inputTaxCreditsForPeriod([power], [], REGISTRANT, "2026-01-01", "2026-10-13");
    expect(itc.receipts).toBe(4.5); // 30 × 15%

    const period = { label: "2026 to date", startDate: "2026-01-01", endDate: "2026-10-13", deadline: "2027-01-31" };
    const gst34 = computeGST34({
      province: "newBrunswick", period, frequency: "quarterly", periodTransactions: [],
      periodReceipts: [power], instalmentsPaid: 0,
      vehicleBusinessUsePct: REGISTRANT.vehicleBusinessUsePct,
      homeOfficeBusinessUsePct: REGISTRANT.homeOfficeBusinessUsePct,
    });
    expect(itc.total).toBeCloseTo(gst34.line108, 10);
    // 10% of the home or less: no ITC on a home bill.
    expect(inputTaxCreditsForPeriod([power], [], { ...REGISTRANT, homeOfficeBusinessUsePct: 0.1 }, "2026-01-01", "2026-10-13").total).toBe(0);
  });

  it("someone who is not registered claims none", () => {
    expect(inputTaxCreditsForPeriod(receipts, [lease], NOT_REGISTERED, "2026-01-01", "2026-10-13"))
      .toEqual({ receipts: 0, recurring: 0, total: 0 });
  });

  it("handles null lists and receipts with no GST/HST recorded", () => {
    expect(inputTaxCreditsForPeriod(null, undefined, REGISTRANT, "2026-01-01", "2026-10-13").total).toBe(0);
    expect(inputTaxCreditsForPeriod(
      [{ category_key: "prof_board_mls", total_amount: 100, tax_amount: null }], [], REGISTRANT, "2026-01-01", "2026-10-13",
    ).total).toBe(0);
  });
});
