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
  recurringYTD,
  totalRecurringHSTYTD,
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
