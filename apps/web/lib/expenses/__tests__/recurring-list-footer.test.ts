/**
 * The footer under the Recurring Expenses list (2026-10-13).
 *
 * It read "Monthly avg" and "Annual total", the second being the first × 12.
 * A recurring expense has dates, so that was not what any year costs: a row
 * marked "Ends Dec 31, 2026" was counted for twelve more months until the day
 * after its end date, a row that started in July read as a full year, and a
 * row that ended in June read as nothing.
 *
 * The second figure is now this calendar year's charges: each row by the
 * charge dates that fall in the year, between its start date and its end
 * date. The same charge dates as year to date and what is still to come, so
 * it is the two added together on any day. Both figures are the rows as
 * entered (GST/HST included), like the Amount column above them.
 */
import { describe, expect, it } from "vitest";
import {
  recurringRemainingThisYear,
  recurringYTD,
} from "@agent-runway/core/engines/recurring-expense-engine";
import type { RecurringExpense } from "@agent-runway/core/types/database";
import { recurringListFooter } from "../recurring-list-footer";

function expense(overrides: Partial<RecurringExpense>): RecurringExpense {
  return {
    id: "re-1",
    user_id: "u1",
    name: "MLS fee",
    amount: 100,
    category_key: "professional_mls",
    frequency: "monthly",
    day_of_month: 1,
    month_of_year: null,
    hst_included: false,
    hst_amount: 0,
    vehicle_pct_applicable: false,
    notes: "",
    start_date: "2025-06-01",
    end_date: null,
    is_active: true,
    created_at: "2025-06-01T12:00:00Z",
    updated_at: "2025-06-01T12:00:00Z",
    ...overrides,
  };
}

const at = (month: number, day: number, year = 2026) => new Date(year, month - 1, day, 12);
const OCT_13 = at(10, 13);

describe("recurringListFooter: the year's figure is that year's charge dates", () => {
  it("an open-ended monthly row is twelve charges, the monthly figure × 12", () => {
    expect(recurringListFooter([expense({})], 2026, OCT_13)).toEqual({ monthly: 100, yearTotal: 1200 });
  });

  it("a row that ends on Dec 31 counts this year's twelve charges and stays in the monthly figure", () => {
    const lease = expense({ amount: 500, end_date: "2026-12-31" });
    expect(recurringListFooter([lease], 2026, OCT_13)).toEqual({ monthly: 500, yearTotal: 6000 });
  });

  it("a row that ends next month stops there: not twelve more months", () => {
    // Charged on the 1st, ends Nov 15: Jan to Nov. Monthly figure × 12 said 1,200.
    const ending = expense({ end_date: "2026-11-15" });
    expect(recurringListFooter([ending], 2026, OCT_13)).toEqual({ monthly: 100, yearTotal: 1100 });
  });

  it("a row that ended in June keeps its six charges, and is out of the monthly figure", () => {
    const ended = expense({ end_date: "2026-06-30" });
    expect(recurringListFooter([ended], 2026, OCT_13)).toEqual({ monthly: 0, yearTotal: 600 });
  });

  it("a row that started in July counts from its start date, not for the whole year", () => {
    const started = expense({ start_date: "2026-07-01" });
    expect(recurringListFooter([started], 2026, OCT_13)).toEqual({ monthly: 100, yearTotal: 600 });
  });

  it("a row whose start date is next year is in the monthly figure and adds nothing to this year", () => {
    const ahead = expense({ start_date: "2027-01-01" });
    expect(recurringListFooter([ahead], 2026, OCT_13)).toEqual({ monthly: 100, yearTotal: 0 });
  });

  it("a row that ended before this year adds nothing to either", () => {
    const old = expense({ end_date: "2025-12-31" });
    expect(recurringListFooter([old], 2026, OCT_13)).toEqual({ monthly: 0, yearTotal: 0 });
  });

  it("an annual fee counts once, in full, and a twelfth a month", () => {
    const dues = expense({ amount: 1200, frequency: "annual", month_of_year: 11, day_of_month: 15 });
    expect(recurringListFooter([dues], 2026, OCT_13)).toEqual({ monthly: 100, yearTotal: 1200 });
  });

  it("an annual fee whose row ends before its charge date adds nothing to the year", () => {
    // Not renewing: the monthly figure still carries a twelfth until the end date.
    const dues = expense({ amount: 1200, frequency: "annual", month_of_year: 11, day_of_month: 15, end_date: "2026-10-31" });
    expect(recurringListFooter([dues], 2026, OCT_13)).toEqual({ monthly: 100, yearTotal: 0 });
  });

  it("a quarterly row counts its four charges, fewer once it ends", () => {
    const quarterly = expense({ amount: 300, frequency: "quarterly", month_of_year: 1 });
    expect(recurringListFooter([quarterly], 2026, OCT_13)).toEqual({ monthly: 100, yearTotal: 1200 });
    expect(recurringListFooter([{ ...quarterly, end_date: "2026-06-30" }], 2026, OCT_13)).toEqual({ monthly: 0, yearTotal: 600 });
  });
});

describe("recurringListFooter: the list as entered", () => {
  it("adds the rows up", () => {
    const list = [
      expense({ id: "a" }),
      expense({ id: "b", amount: 500, end_date: "2026-06-30" }),
      expense({ id: "c", amount: 60, start_date: "2026-07-01" }),
      expense({ id: "d", amount: 1200, frequency: "annual", month_of_year: 3 }),
    ];
    expect(recurringListFooter(list, 2026, OCT_13)).toEqual({
      monthly: 100 + 0 + 60 + 100,
      yearTotal: 1200 + 3000 + 360 + 1200,
    });
  });

  it("keeps the GST/HST in: the amount as charged, whatever hst_amount says", () => {
    const withHst = expense({ amount: 115, hst_included: true, hst_amount: 15 });
    expect(recurringListFooter([withHst], 2026, OCT_13)).toEqual({ monthly: 115, yearTotal: 1380 });
  });

  it("leaves out a paused row", () => {
    expect(recurringListFooter([expense({ is_active: false })], 2026, OCT_13)).toEqual({ monthly: 0, yearTotal: 0 });
  });

  it("is zero for an empty list", () => {
    expect(recurringListFooter([], 2026, OCT_13)).toEqual({ monthly: 0, yearTotal: 0 });
  });
});

describe("recurringListFooter: the year's figure is year to date plus what is still to come", () => {
  const list = [
    expense({ id: "a", day_of_month: 20 }),
    expense({ id: "b", amount: 500, end_date: "2026-11-15" }),
    expense({ id: "c", amount: 60, start_date: "2026-07-10", day_of_month: 5 }),
    expense({ id: "d", amount: 1200, frequency: "annual", month_of_year: 11, day_of_month: 15 }),
    expense({ id: "e", amount: 300, frequency: "quarterly", month_of_year: 2, day_of_month: 28 }),
  ];
  const toDatePlusToCome = (now: Date) =>
    list.reduce((sum, re) => sum + recurringYTD(re, now) + recurringRemainingThisYear(re, now), 0);

  for (const day of [at(1, 1), at(6, 30), OCT_13, at(11, 15), at(11, 16), at(12, 31)]) {
    it(`on ${day.toDateString()}`, () => {
      expect(recurringListFooter(list, 2026, day).yearTotal).toBe(toDatePlusToCome(day));
    });
  }

  it("does not move through the year, while the monthly figure does", () => {
    const june = recurringListFooter(list, 2026, at(6, 30));
    const december = recurringListFooter(list, 2026, at(12, 31));
    expect(december.yearTotal).toBe(june.yearTotal);
    // Row b's end date (Nov 15) has passed by December.
    expect(june.monthly - december.monthly).toBe(500);
  });
});
