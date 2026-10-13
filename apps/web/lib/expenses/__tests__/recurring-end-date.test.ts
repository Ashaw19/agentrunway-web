/**
 * The Recurring Expenses form's end date (2026-10-13).
 *
 * An expense that really ended keeps its row, active, with an `end_date`:
 * the charges up to that date stay in the year's totals. The form rejects an
 * end date before the start date (no charge date could fall between them, so
 * the whole entry would silently count nothing), and the list says which
 * rows have ended.
 */
import { describe, expect, it } from "vitest";
import { recurringEndDateError, recurringEndStatus } from "../recurring-end-date";

const at = (month: number, day: number, year = 2026) => new Date(year, month - 1, day, 12);
const OCT_13 = at(10, 13);

describe("recurringEndDateError", () => {
  it("accepts an empty end date: the expense has no end", () => {
    expect(recurringEndDateError("2026-01-01", "")).toBeNull();
  });

  it("accepts an end date after the start date", () => {
    expect(recurringEndDateError("2026-01-01", "2026-06-30")).toBeNull();
  });

  it("accepts an end date on the start date", () => {
    expect(recurringEndDateError("2026-03-01", "2026-03-01")).toBeNull();
  });

  it("rejects an end date before the start date", () => {
    expect(recurringEndDateError("2026-03-01", "2026-02-28")).toMatch(/before the start date/);
  });

  it("compares across years", () => {
    expect(recurringEndDateError("2025-11-15", "2026-01-31")).toBeNull();
    expect(recurringEndDateError("2026-01-15", "2025-12-31")).toMatch(/before the start date/);
  });
});

describe("recurringEndStatus", () => {
  it("is null with no end date", () => {
    expect(recurringEndStatus({ end_date: null }, OCT_13)).toBeNull();
  });

  it("says a row has ended once its end date has passed, with the date", () => {
    const status = recurringEndStatus({ end_date: "2026-06-30" }, OCT_13);
    expect(status?.ended).toBe(true);
    expect(status?.label).toMatch(/^Ended Jun\.? 30, 2026$/);
  });

  it("says when a running row ends", () => {
    const status = recurringEndStatus({ end_date: "2026-12-31" }, OCT_13);
    expect(status?.ended).toBe(false);
    expect(status?.label).toMatch(/^Ends Dec\.? 31, 2026$/);
  });

  it("a row is still running on its end date, and ended the day after", () => {
    expect(recurringEndStatus({ end_date: "2026-10-13" }, OCT_13)?.ended).toBe(false);
    expect(recurringEndStatus({ end_date: "2026-10-13" }, at(10, 14))?.ended).toBe(true);
  });

  it("prints the first of a month as that day, not the evening before", () => {
    expect(recurringEndStatus({ end_date: "2026-07-01" }, OCT_13)?.label).toMatch(/^Ended Jul\.? 1, 2026$/);
  });
});
