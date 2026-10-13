/**
 * Recurring expense YTD — calendar anchor (2026-10-09).
 *
 * The YTD helpers total "this year up to today". On the UTC server, 8 pm
 * Atlantic on Dec 31 is already Jan 1, so a monthly expense totalled one
 * month instead of twelve. Server callers pass atlanticNoon() as `now`.
 * Instants are pinned; expectations hold in any host zone.
 */
import { describe, expect, it } from "vitest";
import {
  projectedAnnualRecurring,
  recurringHSTEntriesForPeriod,
  recurringOccurrencesInRange,
  recurringRemainingThisYear,
  recurringYTD,
  totalRecurringHSTForPeriod,
  totalRecurringHSTYTD,
  totalRecurringRemainingThisYear,
  totalRecurringYTD,
} from "../recurring-expense-engine";
import { atlanticNoon } from "../../lib/local-date";
import type { RecurringExpense } from "../../types/database";

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
    hst_included: true,
    hst_amount: 13,
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

const DEC31_10PM_AST = atlanticNoon(new Date("2027-01-01T02:00:00Z"));
const JAN1_1AM_AST = atlanticNoon(new Date("2027-01-01T05:00:00Z"));

describe("recurring expense YTD on Dec 31 evening (Atlantic anchor)", () => {
  it("totals twelve months of a monthly expense", () => {
    expect(recurringYTD(expense({}), DEC31_10PM_AST)).toBe(1200);
    expect(totalRecurringYTD([expense({})], DEC31_10PM_AST)).toBe(1200);
  });

  it("restarts at one month once it is Jan 1 in Atlantic time", () => {
    expect(totalRecurringYTD([expense({})], JAN1_1AM_AST)).toBe(100);
  });

  it("counts an annual charge that fell earlier in the Atlantic year", () => {
    const annual = expense({ frequency: "annual", month_of_year: 12, day_of_month: 15, amount: 600 });
    expect(recurringYTD(annual, DEC31_10PM_AST)).toBe(600);
    expect(recurringYTD(annual, JAN1_1AM_AST)).toBe(0);
  });

  it("skips inactive expenses", () => {
    expect(totalRecurringYTD([expense({ is_active: false })], DEC31_10PM_AST)).toBe(0);
  });

  it("windows HST from Jan 1 of the anchor's year through the anchor's day", () => {
    expect(totalRecurringHSTYTD([expense({})], DEC31_10PM_AST)).toBe(12 * 13);
    expect(totalRecurringHSTYTD([expense({})], JAN1_1AM_AST)).toBe(13);
  });

  it("projects the annual total from the same anchor", () => {
    // Dec: 12 months to date, no months remaining.
    expect(projectedAnnualRecurring([expense({})], DEC31_10PM_AST)).toBe(1200);
  });
});

/**
 * One rule for "how many times has this been charged between A and B"
 * (2026-10-13).
 *
 * Until this date the expense totals and the GST/HST credits counted a
 * recurring expense two ways. `recurringYTD` counted a monthly expense by
 * calendar month, from the 1st, and never read `end_date`; the ITC helpers
 * counted each charge on its charge day and stopped at `end_date`. A $115
 * expense with $15 HST charged on the 20th read, on Oct 13, as ten charges of
 * expense with nine charges of ITC taken off them.
 *
 * The rule is `recurringOccurrencesInRange`: a charge counts on its charge
 * day, on or after `start_date`, on or before `end_date`.
 */
describe("one rule for how often a recurring expense has been charged", () => {
  /** Noon on that Atlantic day. */
  const on = (isoDay: string) => atlanticNoon(new Date(`${isoDay}T15:00:00Z`));
  const jan1 = (year: number) => new Date(year, 0, 1);

  // $115 a month with $15 HST, charged on the 20th, running since last year.
  const onThe20th = expense({ amount: 115, hst_amount: 15, day_of_month: 20 });

  it("a monthly charge on the 20th is not counted before the 20th", () => {
    expect(recurringOccurrencesInRange(onThe20th, jan1(2026), on("2026-10-13"))).toBe(9);
    expect(recurringYTD(onThe20th, on("2026-10-13"))).toBe(9 * 115);
    expect(recurringYTD(onThe20th, on("2026-10-19"))).toBe(9 * 115);
    expect(recurringYTD(onThe20th, on("2026-10-20"))).toBe(10 * 115);
  });

  it("expenses and ITCs count the same charges (the case that disagreed: 10 against 9)", () => {
    const now = on("2026-10-13");
    expect(recurringYTD(onThe20th, now) / 115).toBe(9);
    expect(totalRecurringHSTYTD([onThe20th], now) / 15).toBe(9);
    expect(totalRecurringHSTForPeriod([onThe20th], "2026-01-01", "2026-10-13")).toBe(135);
  });

  it("an expense that has ended keeps the charges before its end date and adds no more", () => {
    // Still is_active: nothing in the app switches an ended expense off.
    const ended = expense({ end_date: "2026-03-31" });
    const now = on("2026-10-13");
    expect(recurringYTD(ended, now)).toBe(3 * 100);
    expect(totalRecurringYTD([ended], now)).toBe(3 * 100);
    expect(totalRecurringHSTYTD([ended], now)).toBe(3 * 13);
    // The end date itself is a charge day that counts.
    expect(recurringYTD(expense({ day_of_month: 15, end_date: "2026-03-15" }), now)).toBe(3 * 100);
    expect(recurringYTD(expense({ day_of_month: 15, end_date: "2026-03-14" }), now)).toBe(2 * 100);
  });

  it("an expense that starts part-way through the year counts charge days on or after the start date", () => {
    // Starts Mar 5, charged on the 20th: Mar 20 to Sep 20 by Oct 13.
    expect(recurringYTD(expense({ start_date: "2026-03-05", day_of_month: 20 }), on("2026-10-13"))).toBe(7 * 100);
    // Starts Mar 20, charged on the 5th: the first charge is Apr 5.
    expect(recurringYTD(expense({ start_date: "2026-03-20", day_of_month: 5 }), on("2026-10-22"))).toBe(7 * 100);
    // The start date itself is a charge day that counts.
    expect(recurringYTD(expense({ start_date: "2026-03-20", day_of_month: 20 }), on("2026-03-20"))).toBe(100);
    // Not started yet.
    expect(recurringYTD(expense({ start_date: "2026-11-01" }), on("2026-10-13"))).toBe(0);
  });

  it("a quarterly expense whose quarters wrap past December is charged four times in each calendar year", () => {
    // From November: Feb, May, Aug and Nov 15 of every year.
    const quarterly = expense({ frequency: "quarterly", month_of_year: 11, day_of_month: 15, amount: 300 });
    expect(recurringYTD(quarterly, on("2026-02-14"))).toBe(0);
    expect(recurringYTD(quarterly, on("2026-02-15"))).toBe(300);
    expect(recurringYTD(quarterly, on("2026-10-13"))).toBe(3 * 300);
    expect(recurringYTD(quarterly, on("2026-12-31"))).toBe(4 * 300);
  });

  it("an annual charge counts once, on its day", () => {
    const annual = expense({ frequency: "annual", month_of_year: 11, day_of_month: 10, amount: 1200 });
    expect(recurringYTD(annual, on("2026-11-09"))).toBe(0);
    expect(recurringYTD(annual, on("2026-11-10"))).toBe(1200);
    expect(recurringOccurrencesInRange(annual, jan1(2025), on("2026-12-31"))).toBe(2);
  });

  // Every schedule the form can save, checked on every day of a year: the
  // expense count and the ITC count can never drift apart again.
  const SCHEDULES: RecurringExpense[] = [
    expense({ id: "m1", day_of_month: 1 }),
    expense({ id: "m15", day_of_month: 15 }),
    expense({ id: "m28", day_of_month: 28 }),
    expense({ id: "m-start", day_of_month: 20, start_date: "2026-03-05" }),
    expense({ id: "m-start-after", day_of_month: 5, start_date: "2026-03-20" }),
    expense({ id: "m-ended", day_of_month: 12, end_date: "2026-08-11" }),
    expense({ id: "m-window", day_of_month: 9, start_date: "2026-02-09", end_date: "2026-06-09" }),
    expense({ id: "q-jan", frequency: "quarterly", month_of_year: 1, day_of_month: 15 }),
    expense({ id: "q-nov", frequency: "quarterly", month_of_year: 11, day_of_month: 3 }),
    expense({ id: "q-ended", frequency: "quarterly", month_of_year: 2, day_of_month: 20, end_date: "2026-09-01" }),
    expense({ id: "a-jun", frequency: "annual", month_of_year: 6, day_of_month: 28 }),
    expense({ id: "a-null-month", frequency: "annual", month_of_year: null, day_of_month: 7 }),
    expense({ id: "a-not-yet", frequency: "annual", month_of_year: 4, day_of_month: 1, start_date: "2026-05-01" }),
  ];
  const everyDayOf2026 = Array.from({ length: 365 }, (_, i) => new Date(2026, 0, 1 + i, 12));

  it("on every day of the year, expenses to date and ITCs to date count the same charges", () => {
    for (const re of SCHEDULES) {
      for (const day of everyDayOf2026) {
        const charges = recurringOccurrencesInRange(re, jan1(2026), day);
        const label = `${re.id} on ${day.toDateString()}`;
        expect(recurringYTD(re, day), label).toBe(charges * 100);
        expect(totalRecurringHSTYTD([re], day), label).toBe(charges * 13);
        const [entry] = recurringHSTEntriesForPeriod([re], "2026-01-01", `2026-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`);
        expect(entry?.tax_amount ?? 0, label).toBe(charges * 13);
      }
    }
  });

  it("a year's charges never go down from one day to the next, and never by more than one charge", () => {
    for (const re of SCHEDULES) {
      let previous = 0;
      for (const day of everyDayOf2026) {
        const charges = recurringOccurrencesInRange(re, jan1(2026), day);
        expect(charges - previous, `${re.id} on ${day.toDateString()}`).toBeGreaterThanOrEqual(0);
        expect(charges - previous, `${re.id} on ${day.toDateString()}`).toBeLessThanOrEqual(1);
        previous = charges;
      }
    }
  });

  describe("the rest of the year", () => {
    it("is what is still scheduled after today", () => {
      // Oct 20, Nov 20 and Dec 20 are still to come on Oct 13; two after Oct 20.
      expect(recurringRemainingThisYear(onThe20th, on("2026-10-13"))).toBe(3 * 115);
      expect(recurringRemainingThisYear(onThe20th, on("2026-10-20"))).toBe(2 * 115);
      expect(recurringRemainingThisYear(onThe20th, on("2026-12-31"))).toBe(0);
      expect(totalRecurringRemainingThisYear([onThe20th, expense({ is_active: false })], on("2026-10-13"))).toBe(3 * 115);
    });

    it("to date plus still to come is the whole year's charges, on every day", () => {
      for (const re of SCHEDULES) {
        const wholeYear = recurringOccurrencesInRange(re, jan1(2026), new Date(2026, 11, 31, 23, 59, 59)) * 100;
        for (const day of everyDayOf2026) {
          expect(recurringYTD(re, day) + recurringRemainingThisYear(re, day), `${re.id} on ${day.toDateString()}`).toBe(wholeYear);
          expect(projectedAnnualRecurring([re], day), `${re.id} on ${day.toDateString()}`).toBe(wholeYear);
        }
      }
    });

    it("the projected year does not move as the month goes by", () => {
      // The old projection added whole months left to a year-to-date figure:
      // one charge short before the charge day, and on the 31st.
      for (const day of ["2026-10-01", "2026-10-13", "2026-10-20", "2026-10-31"]) {
        expect(projectedAnnualRecurring([onThe20th], on(day)), day).toBe(12 * 115);
      }
    });

    it("an annual fee due in November is projected in full, not as two twelfths", () => {
      const annual = expense({ frequency: "annual", month_of_year: 11, day_of_month: 10, amount: 1200 });
      expect(projectedAnnualRecurring([annual], on("2026-06-15"))).toBe(1200);
      expect(projectedAnnualRecurring([annual], on("2026-12-15"))).toBe(1200);
    });

    it("an ended expense projects only the charges it made; one that has not started projects only those ahead", () => {
      expect(projectedAnnualRecurring([expense({ end_date: "2026-03-31" })], on("2026-10-13"))).toBe(3 * 100);
      expect(projectedAnnualRecurring([expense({ start_date: "2026-11-01" })], on("2026-10-13"))).toBe(2 * 100);
    });
  });
});
