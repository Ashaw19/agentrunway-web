/**
 * The commission paid date on a transaction (migration 00178): optional, a
 * real date, and never before the closing date (under the cash method it
 * would move a commission into a year before the deal closed).
 */
import { describe, it, expect } from "vitest";
import { validateCommissionPaidDate, validateTransaction } from "@agent-runway/core/validation/input-guards";

describe("validateCommissionPaidDate", () => {
  it("blank is fine: the field is optional", () => {
    expect(validateCommissionPaidDate("2025-12-17", null).valid).toBe(true);
    expect(validateCommissionPaidDate("2025-12-17", undefined).valid).toBe(true);
    expect(validateCommissionPaidDate("2025-12-17", "").valid).toBe(true);
  });

  it("a paid date on or after the closing date is fine, across a year end too", () => {
    expect(validateCommissionPaidDate("2025-12-17", "2025-12-17").valid).toBe(true);
    expect(validateCommissionPaidDate("2025-12-17", "2026-01-09").valid).toBe(true);
  });

  it("refuses a paid date before the closing date", () => {
    const r = validateCommissionPaidDate("2025-12-17", "2025-12-01");
    expect(r.valid).toBe(false);
    expect(r.errors[0]).toMatch(/before the closing date/);
  });

  it("refuses something that isn't a calendar day", () => {
    expect(validateCommissionPaidDate("2025-12-17", "2026-02-30").valid).toBe(false);
    expect(validateCommissionPaidDate("2025-12-17", "Jan 9").valid).toBe(false);
  });
});

describe("validateTransaction carries the paid date", () => {
  const base = { sale_price: "600000", commission_pct: "2.5", date: "2025-12-17" };

  it("parses a blank paid date as null", () => {
    expect(validateTransaction({ ...base, commission_paid_date: "" }).parsed?.commission_paid_date).toBeNull();
    expect(validateTransaction(base).parsed?.commission_paid_date).toBeNull();
  });

  it("passes a valid paid date through", () => {
    expect(validateTransaction({ ...base, commission_paid_date: "2026-01-09" }).parsed?.commission_paid_date).toBe("2026-01-09");
  });

  it("fails the whole form on a paid date before closing", () => {
    const r = validateTransaction({ ...base, commission_paid_date: "2025-11-30" });
    expect(r.valid).toBe(false);
    expect(r.parsed).toBeUndefined();
  });
});
