/**
 * T2125 line 8200 follows the income reporting method (2026-10-14).
 *
 * The T2125 tab summed the closed deals its caller handed it, and Reports
 * handed it the deals that closed in the tax year. For a cash-method agent
 * (CRA T4002 ch. 1: income in the fiscal period it is received) a December
 * closing paid in January is next year's income.
 *
 * What these tests prove:
 *   1. The December 17, 2025 listing paid January 9, 2026 is on the 2026
 *      T2125 for a cash-method agent, and on the 2025 one for an accrual
 *      agent. computeT2125 takes every closed row and keeps the tax year's.
 *   2. GST/HST collected stays on the closing year under either method.
 *   3. An accrual agent's T2125 is what it was: every deal that closed in the
 *      year, whatever its paid date.
 */
import { describe, it, expect } from "vitest";
import { computeT2125, t2125EntriesFromAmounts } from "../t2125-engine";
import { gstHstRate } from "../canadian-tax-engine";
import type { Transaction } from "../../types/database";
import { createTestSettings } from "./test-data";

const tx = (id: string, date: string, paid: string | null, gci: number, status = "closed"): Transaction => ({
  id,
  user_id: "u1",
  date,
  commission_paid_date: paid,
  address: id,
  sale_price: 0,
  commission_pct: 0,
  gci_override: gci,
  side: "seller",
  status: status as Transaction["status"],
  client_name: "",
  notes: "",
  team_split_pct: null,
  pipeline_deal_id: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
});

const ROWS: Transaction[] = [
  tx("dec-listing", "2025-12-17", "2026-01-09", 15_000),
  tx("march", "2026-03-02", "2026-03-09", 10_000),
  tx("december-2026", "2026-12-18", "2027-01-08", 8_000),
  tx("july-no-paid-date", "2026-07-15", null, 12_000),
  tx("fallen", "2026-05-01", null, 50_000, "fallen"),
];

const t2125 = (method: "accrual" | "cash", taxYear: number) =>
  computeT2125({
    settings: createTestSettings({ province: "newBrunswick", gst_hst_registered: true, income_reporting_method: method }),
    transactions: ROWS,
    expenses: t2125EntriesFromAmounts({}),
    ccaAssets: [],
    taxYear,
  });

describe("computeT2125: gross commission income is the tax year's", () => {
  it("cash method: the January-paid 2025 listing is 2026 income; the 2027-paid closing is not", () => {
    const r = t2125("cash", 2026);
    expect(r.incomeReportingMethod).toBe("cash");
    expect(r.grossCommissionIncome).toBe(15_000 + 10_000 + 12_000);
    expect(r.incomeDealCount).toBe(3);
    expect(t2125("cash", 2025).grossCommissionIncome).toBe(0);
    expect(t2125("cash", 2027).grossCommissionIncome).toBe(8_000);
  });

  it("accrual: the deals that closed in the year, paid dates ignored", () => {
    const r = t2125("accrual", 2026);
    expect(r.incomeReportingMethod).toBe("accrual");
    expect(r.grossCommissionIncome).toBe(10_000 + 8_000 + 12_000);
    expect(r.incomeDealCount).toBe(3);
    expect(t2125("accrual", 2025).grossCommissionIncome).toBe(15_000);
  });

  it("a fallen deal is never income", () => {
    expect(t2125("cash", 2026).grossCommissionIncome).toBe(37_000);
    expect(t2125("accrual", 2026).grossCommissionIncome).toBe(30_000);
  });

  it("GST/HST collected is on the year's closings under either method", () => {
    const rate = gstHstRate("newBrunswick");
    for (const method of ["cash", "accrual"] as const) {
      const r = t2125(method, 2026);
      expect(r.gstHst.gciBase).toBe(30_000);
      expect(r.gstHst.collectedOnGCI).toBeCloseTo(30_000 * rate, 6);
    }
  });

  it("the tax on the T2125 follows its income", () => {
    expect(t2125("cash", 2026).totalTaxBurden).toBeGreaterThan(t2125("accrual", 2026).totalTaxBurden);
  });
});
