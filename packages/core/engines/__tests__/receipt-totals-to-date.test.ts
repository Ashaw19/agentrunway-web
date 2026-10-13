/**
 * Receipt totals to date: the phone's Expenses cards (2026-10-13).
 *
 * Left out of #312 on purpose: the mobile Expenses screen showed a "YTD
 * Total" that was this year's receipts alone. The web's "YTD Expenses" on
 * every surface is `ytdExpenseTotals(...).expensesYTD`: receipts, the
 * per-item monthly figure and the Recurring Expenses list. The phone's store
 * loads receipts only, so on an account with recurring expenses or monthly
 * figures the phone read lower under a label that said it was the same
 * figure.
 *
 * The card is now "Receipts YTD", and its figure is `receiptTotalsToDate`:
 * the receipts part of the web's total, from the same rows the web reads.
 *
 * Fixtures are $115 paid with $15 HST unless a test says otherwise, and
 * "now" is 15 June 2026.
 */
import { describe, expect, it } from "vitest";
import { aggregateReceiptTotals, receiptTotalsToDate } from "../expense-totals-engine";
import { ytdExpenseTotals } from "../t2125-expenses-engine";
import type { RecurringExpense } from "../../types/database";

const REGISTRANT = { gstHstRegistered: true, vehicleBusinessUsePct: 0.8, homeOfficeBusinessUsePct: 0.15 };
const NOT_REGISTERED = { ...REGISTRANT, gstHstRegistered: false };
const JUN_15 = new Date(2026, 5, 15, 12);

/** What the phone's store holds: this year, last year and undated, newest capture first. */
const STORE_ROWS = [
  { expense_date: "2026-06-14", category_key: "office_supplies", total_amount: 115, tax_amount: 15 },
  { expense_date: "2026-06-01", category_key: "meals_client", total_amount: 115, tax_amount: 15 },
  { expense_date: "2026-03-20", category_key: "vehicle_fuel", total_amount: 115, tax_amount: 15 },
  { expense_date: "2026-01-01", category_key: null, total_amount: 23, tax_amount: 3 },
  { expense_date: "2025-12-31", category_key: "office_supplies", total_amount: 230, tax_amount: 30 },
  { expense_date: "2025-06-10", category_key: "marketing_ads", total_amount: 500, tax_amount: null },
  { expense_date: null, category_key: "office_supplies", total_amount: 46, tax_amount: 6 },
];

/** The rows the web's year-to-date query returns: `.gte("expense_date", "2026-01-01")`. */
const WEB_YTD_ROWS = STORE_ROWS.filter((r) => r.expense_date != null && r.expense_date >= "2026-01-01");

const BOARD_DUES: RecurringExpense = {
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
};

describe("receiptTotalsToDate — the phone's Receipts YTD, This Month and count", () => {
  it("registrant: this year's receipts net of ITCs, and this month's of those", () => {
    const t = receiptTotalsToDate(STORE_ROWS, REGISTRANT, JUN_15);
    // 100 (office) + 107.5 (meal: half the HST stays) + 100 (fuel at 80%) + 20 (no category)
    expect(t.year.total).toBe(327.5);
    expect(t.yearCount).toBe(4);
    // 14 June and 1 June
    expect(t.month.total).toBe(207.5);
  });

  it("non-registrant: the amounts paid", () => {
    const t = receiptTotalsToDate(STORE_ROWS, NOT_REGISTERED, JUN_15);
    expect(t.year.total).toBe(368);
    expect(t.month.total).toBe(230);
    expect(t.yearCount).toBe(4);
  });

  it("is the receipts part of the web's year-to-date figure, from the same rows", () => {
    const web = ytdExpenseTotals({ receipts: WEB_YTD_ROWS, recurring: [], expenseItems: [], ctx: REGISTRANT, now: JUN_15 });
    const phone = receiptTotalsToDate(STORE_ROWS, REGISTRANT, JUN_15);
    expect(phone.year.total).toBe(web.receiptYTD);
    expect(phone.year).toEqual(aggregateReceiptTotals(WEB_YTD_ROWS, REGISTRANT));
    // With receipts as the only source, it is also the whole of YTD Expenses.
    expect(phone.year.total).toBe(web.expensesYTD);
  });

  it("is NOT year-to-date expenses once the account has a recurring expense or a monthly figure", () => {
    const web = ytdExpenseTotals({
      receipts: WEB_YTD_ROWS,
      recurring: [BOARD_DUES],
      expenseItems: [{ key: "office_software", monthly_recurring: 50 }],
      ctx: REGISTRANT,
      now: JUN_15,
    });
    const phone = receiptTotalsToDate(STORE_ROWS, REGISTRANT, JUN_15);
    // Six charges of $100 net, and six months of a $50 figure with no receipts under it.
    expect(web.recurringYTD).toBe(600);
    expect(web.estimatesAboveReceipts).toBe(300);
    expect(web.expensesYTD).toBe(1227.5);
    // The phone's card is the receipts alone: the same on both, and $900 short of the total.
    expect(phone.year.total).toBe(web.receiptYTD);
    expect(web.expensesYTD - phone.year.total).toBe(web.recurringYTD + web.estimatesAboveReceipts);
  });

  it("last year's receipts are in neither total", () => {
    const lastYearOnly = STORE_ROWS.filter((r) => r.expense_date?.startsWith("2025-"));
    expect(lastYearOnly).toHaveLength(2);
    const t = receiptTotalsToDate(lastYearOnly, REGISTRANT, JUN_15);
    expect(t.year.total).toBe(0);
    expect(t.month.total).toBe(0);
    expect(t.yearCount).toBe(0);
  });

  it("a receipt with no date is in no year: not in a total, not in the count", () => {
    const undated = [{ expense_date: null, category_key: "office_supplies", total_amount: 46, tax_amount: 6 }];
    expect(receiptTotalsToDate(undated, REGISTRANT, JUN_15)).toEqual(receiptTotalsToDate([], REGISTRANT, JUN_15));
    expect(receiptTotalsToDate([{ category_key: null, total_amount: 46 }], REGISTRANT, JUN_15).yearCount).toBe(0);
    expect(receiptTotalsToDate([{ expense_date: "", total_amount: 46 }], REGISTRANT, JUN_15).yearCount).toBe(0);
  });

  it("the month is the calendar month of now, in the same year only", () => {
    const rows = [
      { expense_date: "2026-06-30", category_key: "office_supplies", total_amount: 10, tax_amount: 0 },
      { expense_date: "2026-05-31", category_key: "office_supplies", total_amount: 20, tax_amount: 0 },
      { expense_date: "2026-07-01", category_key: "office_supplies", total_amount: 40, tax_amount: 0 },
      { expense_date: "2025-06-15", category_key: "office_supplies", total_amount: 80, tax_amount: 0 },
    ];
    const t = receiptTotalsToDate(rows, NOT_REGISTERED, JUN_15);
    expect(t.month.total).toBe(10);
    // A receipt dated later this year is in the year, as it is in the web's query.
    expect(t.year.total).toBe(70);
    expect(t.yearCount).toBe(3);
  });

  it("on 1 January the year starts again", () => {
    const jan1 = new Date(2027, 0, 1, 9);
    const rows = [
      { expense_date: "2027-01-01", category_key: "office_supplies", total_amount: 10, tax_amount: 0 },
      { expense_date: "2026-12-31", category_key: "office_supplies", total_amount: 20, tax_amount: 0 },
    ];
    const t = receiptTotalsToDate(rows, NOT_REGISTERED, jan1);
    expect(t.year.total).toBe(10);
    expect(t.month.total).toBe(10);
    expect(t.yearCount).toBe(1);
  });

  it("a home bill counts at the home office share, as in every other total", () => {
    const rows = [{ expense_date: "2026-06-02", category_key: "home_utilities", total_amount: 300, tax_amount: 0 }];
    const t = receiptTotalsToDate(rows, NOT_REGISTERED, JUN_15);
    expect(t.year.total).toBe(45);
    expect(t.month.total).toBe(45);
    expect(t.year.homeOfficeCosts).toEqual({ home_utilities: 300 });
  });

  it("a receipt with no amount yet is counted as a receipt and adds nothing", () => {
    const rows = [
      { expense_date: "2026-06-02", category_key: null, total_amount: null, tax_amount: null },
      { expense_date: "2026-06-03", category_key: null, total_amount: 23, tax_amount: 3 },
    ];
    const t = receiptTotalsToDate(rows, REGISTRANT, JUN_15);
    expect(t.yearCount).toBe(2);
    expect(t.year.total).toBe(20);
  });

  it("returns zeroed totals for null, undefined and empty input", () => {
    for (const rows of [null, undefined, []]) {
      const t = receiptTotalsToDate(rows, REGISTRANT, JUN_15);
      expect(t.year.total).toBe(0);
      expect(t.month.total).toBe(0);
      expect(t.yearCount).toBe(0);
    }
  });

  it("accepts the numeric strings PostgREST returns", () => {
    const rows = [{ expense_date: "2026-06-02", category_key: "office_supplies", total_amount: "115.00", tax_amount: "15.00" }];
    expect(receiptTotalsToDate(rows, REGISTRANT, JUN_15).year.total).toBe(100);
  });
});
