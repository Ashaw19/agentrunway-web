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
  recurringHasEnded,
  recurringMonthlyForCategory,
  recurringMonthlyRunRate,
  recurringRemainingThisYear,
  recurringYTD,
  totalRecurringHSTYTD,
  totalRecurringMonthly,
  totalRecurringRemaining,
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
 * Charge dates (2026-10-13).
 *
 * recurringYTD counted a monthly expense from the 1st of the month (an entry
 * from an earlier year) or from the day of the month it started on (a
 * mid-year start), never from `day_of_month`, and did not read `end_date`.
 * The ITC count (occurrencesInRange) read both, so on 13 October a monthly
 * expense charged on the 20th was ten occurrences in the expense total and
 * the T2125 lines, and nine in the GST34 input tax credits.
 */
const at = (month: number, day: number, year = 2026) => new Date(year, month - 1, day, 12);
const OCT_13 = at(10, 13);

describe("recurringYTD counts charge dates", () => {
  const onThe20th = expense({ day_of_month: 20 });

  it("leaves out this month's charge until its day", () => {
    expect(recurringYTD(onThe20th, OCT_13)).toBe(900);
    expect(recurringYTD(onThe20th, at(10, 19))).toBe(900);
  });

  it("counts this month's charge on its day", () => {
    expect(recurringYTD(onThe20th, at(10, 20))).toBe(1000);
  });

  it("counts nothing in January before the first charge day", () => {
    expect(recurringYTD(onThe20th, at(1, 19))).toBe(0);
    expect(recurringYTD(onThe20th, at(1, 20))).toBe(100);
  });

  it("mid-year start, charge day later in the month: Jul 28, Aug 28, Sep 28", () => {
    const re = expense({ start_date: "2026-07-01", day_of_month: 28 });
    expect(recurringYTD(re, OCT_13)).toBe(300);
  });

  it("mid-year start after that month's charge day: the first charge is next month", () => {
    const re = expense({ start_date: "2026-07-15", day_of_month: 10 });
    expect(recurringYTD(re, at(7, 31))).toBe(0);
    expect(recurringYTD(re, at(10, 5))).toBe(200); // Aug 10, Sep 10
    expect(recurringYTD(re, OCT_13)).toBe(300);
  });

  it("an entry that starts today on a later charge day has not been charged yet", () => {
    // What Flight Crew's createRecurringExpense writes: start_date today, day 1.
    const re = expense({ start_date: "2026-10-13", day_of_month: 1 });
    expect(recurringYTD(re, OCT_13)).toBe(0);
    expect(recurringYTD(re, at(11, 1))).toBe(100);
  });

  it("a start date on the charge day counts that day", () => {
    const re = expense({ start_date: "2026-10-13", day_of_month: 13 });
    expect(recurringYTD(re, OCT_13)).toBe(100);
  });
});

describe("recurringYTD honours end_date", () => {
  it("an entry that ended in an earlier year counts nothing", () => {
    const re = expense({ end_date: "2025-12-31" });
    expect(recurringYTD(re, OCT_13)).toBe(0);
    expect(totalRecurringYTD([re], OCT_13)).toBe(0);
  });

  it("an entry that ended mid-year keeps the charges up to its end date", () => {
    const re = expense({ day_of_month: 15, end_date: "2026-06-30" });
    expect(recurringYTD(re, OCT_13)).toBe(600);
  });

  it("the end date itself is the last day a charge counts", () => {
    expect(recurringYTD(expense({ day_of_month: 15, end_date: "2026-06-15" }), OCT_13)).toBe(600);
    expect(recurringYTD(expense({ day_of_month: 15, end_date: "2026-06-14" }), OCT_13)).toBe(500);
  });

  it("an end date still ahead changes nothing to date", () => {
    const re = expense({ day_of_month: 5, end_date: "2026-11-30" });
    expect(recurringYTD(re, OCT_13)).toBe(1000);
  });

  it("an annual charge after the end date does not count", () => {
    const annual = expense({ frequency: "annual", month_of_year: 9, day_of_month: 1, amount: 600 });
    expect(recurringYTD(annual, OCT_13)).toBe(600);
    expect(recurringYTD({ ...annual, end_date: "2026-08-31" }, OCT_13)).toBe(0);
  });
});

describe("recurringYTD, quarterly cycle that wraps the year end", () => {
  // First charge of the cycle in November: Nov, Feb, May, Aug.
  const quarterly = expense({
    frequency: "quarterly", month_of_year: 11, day_of_month: 15, amount: 300, start_date: "2025-11-01",
  });

  it("counts the February, May and August charges by mid-October", () => {
    expect(recurringYTD(quarterly, OCT_13)).toBe(900);
  });

  it("counts none before the first charge of the calendar year", () => {
    expect(recurringYTD(quarterly, at(1, 10))).toBe(0);
    expect(recurringYTD(quarterly, at(2, 14))).toBe(0);
    expect(recurringYTD(quarterly, at(2, 15))).toBe(300);
  });

  it("counts all four once the November charge has happened", () => {
    expect(recurringYTD(quarterly, at(11, 14))).toBe(900);
    expect(recurringYTD(quarterly, at(11, 15))).toBe(1200);
  });

  it("in its first year, counts only the charges on or after the start date", () => {
    expect(recurringYTD(quarterly, at(12, 31, 2025))).toBe(300); // Nov 15, 2025
  });

  it("stops at the end date", () => {
    expect(recurringYTD({ ...quarterly, end_date: "2026-06-30" }, OCT_13)).toBe(600); // Feb, May
  });
});

// One of each shape. `full` is what the calendar year 2026 holds.
const SHAPES: { name: string; re: RecurringExpense; full: number }[] = [
  { name: "monthly on the 20th, from an earlier year", re: expense({ id: "a", day_of_month: 20 }), full: 12 },
  { name: "monthly on the 1st", re: expense({ id: "b" }), full: 12 },
  { name: "monthly on the 28th, started 1 July", re: expense({ id: "c", start_date: "2026-07-01", day_of_month: 28 }), full: 6 },
  { name: "monthly on the 15th, ended 30 June", re: expense({ id: "d", day_of_month: 15, end_date: "2026-06-30" }), full: 6 },
  { name: "monthly on the 5th, starting 1 November", re: expense({ id: "e", start_date: "2026-11-01", day_of_month: 5 }), full: 2 },
  { name: "quarterly from November", re: expense({ id: "f", frequency: "quarterly", month_of_year: 11, day_of_month: 15 }), full: 4 },
  { name: "annual in March", re: expense({ id: "g", frequency: "annual", month_of_year: 3, day_of_month: 10 }), full: 1 },
  { name: "annual in December", re: expense({ id: "h", frequency: "annual", month_of_year: 12, day_of_month: 15 }), full: 1 },
];
const DATES = [at(1, 1), at(1, 19), at(1, 20), at(3, 10), at(6, 30), at(7, 1), OCT_13, at(11, 15), at(12, 14), at(12, 31)];

describe("expense count and ITC count are the same occurrences", () => {
  // amount 100 and hst_amount 13 per occurrence, so both are a count.
  for (const { name, re } of SHAPES) {
    it(name, () => {
      for (let day = at(1, 1); day.getFullYear() === 2026; day = new Date(2026, day.getMonth(), day.getDate() + 1, 12)) {
        expect(recurringYTD(re, day) / 100, day.toDateString()).toBe(totalRecurringHSTYTD([re], day) / 13);
      }
    });
  }
});

describe("year to date plus what is still to come is the full year", () => {
  for (const { name, re, full } of SHAPES) {
    it(name, () => {
      for (const day of DATES) {
        const ytd = recurringYTD(re, day);
        const remaining = recurringRemainingThisYear(re, day);
        expect(ytd + remaining, day.toDateString()).toBe(full * 100);
      }
    });
  }

  it("holds for the totals, and projectedAnnualRecurring is that full year", () => {
    const all = SHAPES.map((s) => s.re);
    const fullYear = SHAPES.reduce((sum, s) => sum + s.full * 100, 0);
    for (const day of DATES) {
      expect(totalRecurringYTD(all, day) + totalRecurringRemaining(all, day), day.toDateString()).toBe(fullYear);
      expect(projectedAnnualRecurring(all, day), day.toDateString()).toBe(fullYear);
    }
  });

  it("this month's charge moves from still-to-come to year-to-date on its day", () => {
    const re = expense({ day_of_month: 20 });
    expect(recurringRemainingThisYear(re, OCT_13)).toBe(300); // Oct 20, Nov 20, Dec 20
    expect(recurringRemainingThisYear(re, at(10, 20))).toBe(200);
  });

  it("an entry that has not started yet is all still to come", () => {
    const re = expense({ start_date: "2026-11-01", day_of_month: 5 });
    expect(recurringYTD(re, OCT_13)).toBe(0);
    expect(recurringRemainingThisYear(re, OCT_13)).toBe(200);
  });

  it("nothing is still to come on Dec 31, or after the end date", () => {
    expect(recurringRemainingThisYear(expense({ day_of_month: 20 }), at(12, 31))).toBe(0);
    expect(recurringRemainingThisYear(expense({ day_of_month: 15, end_date: "2026-06-30" }), OCT_13)).toBe(0);
  });

  it("totalRecurringRemaining skips inactive expenses", () => {
    expect(totalRecurringRemaining([expense({ is_active: false })], OCT_13)).toBe(0);
  });
});

/**
 * Monthly run-rate and end dates (2026-10-13).
 *
 * The run-rate had no date: every active row counted. An expense that really
 * ended is kept active with an `end_date`, so its earlier charges stay in the
 * year to date. Without a date the run-rate would have kept counting it in
 * Monthly Recurring, survival burn and next year's plan for good.
 */
describe("recurringHasEnded", () => {
  it("is false with no end date", () => {
    expect(recurringHasEnded(expense({}), OCT_13)).toBe(false);
  });

  it("is true once the end date has passed", () => {
    expect(recurringHasEnded(expense({ end_date: "2026-06-30" }), OCT_13)).toBe(true);
    expect(recurringHasEnded(expense({ end_date: "2025-12-31" }), OCT_13)).toBe(true);
  });

  it("is false on the end date itself: it is the last day a charge counts", () => {
    expect(recurringHasEnded(expense({ end_date: "2026-10-13" }), OCT_13)).toBe(false);
    expect(recurringHasEnded(expense({ end_date: "2026-10-13" }), at(10, 14))).toBe(true);
  });

  it("is false while the end date is still ahead", () => {
    expect(recurringHasEnded(expense({ end_date: "2026-11-30" }), OCT_13)).toBe(false);
  });

  it("reads the anchor's calendar day, so Dec 31 evening Atlantic is not yet ended", () => {
    const re = expense({ end_date: "2026-12-31" });
    expect(recurringHasEnded(re, DEC31_10PM_AST)).toBe(false);
    expect(recurringHasEnded(re, JAN1_1AM_AST)).toBe(true);
  });
});

describe("monthly run-rate leaves out a row once its end date has passed", () => {
  it("counts a row with no end date", () => {
    expect(recurringMonthlyRunRate(expense({}), OCT_13)).toBe(100);
  });

  it("counts nothing for a row whose end date has passed", () => {
    expect(recurringMonthlyRunRate(expense({ end_date: "2026-06-30" }), OCT_13)).toBe(0);
  });

  it("counts a row through its end date and drops it the day after", () => {
    const re = expense({ end_date: "2026-10-13" });
    expect(recurringMonthlyRunRate(re, OCT_13)).toBe(100);
    expect(recurringMonthlyRunRate(re, at(10, 14))).toBe(0);
  });

  it("counts a row whose end date is still ahead", () => {
    expect(recurringMonthlyRunRate(expense({ end_date: "2026-12-31" }), OCT_13)).toBe(100);
  });

  it("counts a row whose start date is still ahead: a scheduled cost is part of what lies ahead", () => {
    expect(recurringMonthlyRunRate(expense({ start_date: "2026-11-01" }), OCT_13)).toBe(100);
  });

  it("counts nothing for an inactive row", () => {
    expect(recurringMonthlyRunRate(expense({ is_active: false }), OCT_13)).toBe(0);
  });

  it("spreads a quarterly or annual charge over its months", () => {
    expect(recurringMonthlyRunRate(expense({ frequency: "quarterly", amount: 300 }), OCT_13)).toBe(100);
    expect(recurringMonthlyRunRate(expense({ frequency: "annual", amount: 1200 }), OCT_13)).toBe(100);
    expect(recurringMonthlyRunRate(expense({ frequency: "annual", amount: 1200, end_date: "2026-06-30" }), OCT_13)).toBe(0);
  });

  it("an ended row keeps its year to date and has no run-rate", () => {
    const ended = expense({ day_of_month: 15, end_date: "2026-06-30" });
    expect(recurringYTD(ended, OCT_13)).toBe(600);
    expect(recurringMonthlyRunRate(ended, OCT_13)).toBe(0);
  });
});

describe("totalRecurringMonthly and recurringMonthlyForCategory read the end date", () => {
  const running = expense({ id: "run", amount: 100 });
  const ended = expense({ id: "ended", amount: 250, end_date: "2026-06-30" });
  const endsLater = expense({ id: "later", amount: 40, end_date: "2026-12-31" });
  const startsLater = expense({ id: "soon", amount: 60, start_date: "2026-11-01" });
  const paused = expense({ id: "paused", amount: 500, is_active: false });
  const otherCategory = expense({ id: "other", amount: 75, category_key: "marketing_digital" });
  const all = [running, ended, endsLater, startsLater, paused, otherCategory];

  it("totals the rows that have not ended", () => {
    expect(totalRecurringMonthly(all, OCT_13)).toBe(100 + 40 + 60 + 75);
  });

  it("counted the ended row while it was running", () => {
    expect(totalRecurringMonthly(all, at(6, 30))).toBe(100 + 250 + 40 + 60 + 75);
    expect(totalRecurringMonthly(all, at(7, 1))).toBe(100 + 40 + 60 + 75);
  });

  it("drops a row the day after its end date", () => {
    expect(totalRecurringMonthly(all, at(12, 31))).toBe(100 + 40 + 60 + 75);
    expect(totalRecurringMonthly(all, at(1, 1, 2027))).toBe(100 + 60 + 75);
  });

  it("per category, the same rows", () => {
    expect(recurringMonthlyForCategory(all, "professional_mls", OCT_13)).toBe(100 + 40 + 60);
    expect(recurringMonthlyForCategory(all, "professional_mls", at(6, 30))).toBe(100 + 250 + 40 + 60);
    expect(recurringMonthlyForCategory(all, "marketing_digital", OCT_13)).toBe(75);
  });
});
