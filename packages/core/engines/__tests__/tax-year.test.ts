/**
 * The tax year of a deal (engines/tax-year.ts).
 *
 * CRA (Guide T4002, ch. 1, "Reporting methods"): self-employed commission
 * agents can report income on the cash method (in the fiscal period it is
 * received) or the accrual method (in the period it is earned). The app put
 * every deal in the year it closed, so a cash-method agent's December
 * closing paid in January sat in the wrong tax year.
 *
 * What these tests prove:
 *   1. A deal that closes December 17, 2025 and pays January 2026 is 2026
 *      income for a cash-method agent and 2025 income for an accrual agent.
 *   2. A cash-method agent's deal with no paid date stays in its closing year.
 *   3. The year's tax GCI, and its difference from the closing year's GCI,
 *      follow from (1) and (2); for an accrual agent the difference is 0, so
 *      nobody's figures move until they choose the cash method.
 *   4. A tax projection is the production projection moved by that
 *      difference; the production projection itself is left alone.
 */

import { describe, it, expect } from "vitest";
import {
  incomeReportingMethod,
  taxYearDate,
  taxYearOfDeal,
  isInTaxYear,
  dealsInTaxYear,
  taxYearGCI,
  closingYearGCI,
  taxYearGCIAdjustment,
  taxYearProjectedGCI,
  taxYearPlanGross,
  type TaxYearGCIDeal,
} from "../tax-year";
import { computePlanGross, computeRealCompensation, toPlanDeals } from "../real-compensation-engine";
import { computeGCI } from "../../types/database";
import { createTestSettings } from "./test-data";

const deal = (
  date: string,
  commission_paid_date: string | null,
  gci: number,
): TaxYearGCIDeal => ({
  date,
  commission_paid_date,
  sale_price: 0,
  commission_pct: 0,
  team_split_pct: null,
  gci_override: gci,
});

// The real case from the task: a December 17, 2025 listing paid in January 2026.
const DEC_LISTING = deal("2025-12-17", "2026-01-09", 15_000);
const MAY_2026 = deal("2026-05-04", "2026-05-11", 10_000);
const DEC_2026_PAID_2027 = deal("2026-12-20", "2027-01-08", 8_000);
const JULY_2026_NO_PAID_DATE = deal("2026-07-15", null, 12_000);

const ROWS = [DEC_LISTING, MAY_2026, DEC_2026_PAID_2027, JULY_2026_NO_PAID_DATE];

describe("incomeReportingMethod", () => {
  it("is cash only when the setting says cash", () => {
    expect(incomeReportingMethod({ income_reporting_method: "cash" })).toBe("cash");
    expect(incomeReportingMethod({ income_reporting_method: "accrual" })).toBe("accrual");
  });

  it("is accrual for a missing settings row, a missing column or an unknown value", () => {
    expect(incomeReportingMethod(null)).toBe("accrual");
    expect(incomeReportingMethod(undefined)).toBe("accrual");
    expect(incomeReportingMethod({})).toBe("accrual");
    expect(incomeReportingMethod({ income_reporting_method: null })).toBe("accrual");
    expect(incomeReportingMethod({ income_reporting_method: "CASH" })).toBe("accrual");
  });
});

describe("taxYearDate: the December-close, January-paid deal", () => {
  it("is the paid date, so year N+1, for a cash-method agent", () => {
    expect(taxYearDate(DEC_LISTING, "cash")).toBe("2026-01-09");
    expect(taxYearOfDeal(DEC_LISTING, "cash")).toBe(2026);
    expect(isInTaxYear(DEC_LISTING, "cash", 2026)).toBe(true);
    expect(isInTaxYear(DEC_LISTING, "cash", 2025)).toBe(false);
  });

  it("is the closing date, so year N, for an accrual agent", () => {
    expect(taxYearDate(DEC_LISTING, "accrual")).toBe("2025-12-17");
    expect(taxYearOfDeal(DEC_LISTING, "accrual")).toBe(2025);
    expect(isInTaxYear(DEC_LISTING, "accrual", 2025)).toBe(true);
    expect(isInTaxYear(DEC_LISTING, "accrual", 2026)).toBe(false);
  });

  it("falls back to the closing date when a cash-method agent left the paid date blank", () => {
    expect(taxYearDate(JULY_2026_NO_PAID_DATE, "cash")).toBe("2026-07-15");
    expect(taxYearDate(deal("2025-12-17", "", 15_000), "cash")).toBe("2025-12-17");
    expect(taxYearDate({ date: "2025-12-17" }, "cash")).toBe("2025-12-17");
  });
});

describe("dealsInTaxYear and taxYearGCI", () => {
  it("cash method: 2026 holds the January-paid 2025 listing and not the 2027-paid December closing", () => {
    expect(dealsInTaxYear(ROWS, "cash", 2026)).toEqual([DEC_LISTING, MAY_2026, JULY_2026_NO_PAID_DATE]);
    expect(taxYearGCI(ROWS, "cash", 2026)).toBe(15_000 + 10_000 + 12_000);
    expect(taxYearGCI(ROWS, "cash", 2025)).toBe(0);
    expect(taxYearGCI(ROWS, "cash", 2027)).toBe(8_000);
  });

  it("accrual: every deal in its closing year", () => {
    expect(dealsInTaxYear(ROWS, "accrual", 2026)).toEqual([MAY_2026, DEC_2026_PAID_2027, JULY_2026_NO_PAID_DATE]);
    expect(taxYearGCI(ROWS, "accrual", 2026)).toBe(10_000 + 8_000 + 12_000);
    expect(taxYearGCI(ROWS, "accrual", 2025)).toBe(15_000);
  });

  it("uses computeGCI, so a team split is the agent's share", () => {
    const split = { date: "2026-03-01", commission_paid_date: null, sale_price: 400_000, commission_pct: 0.025, team_split_pct: 0.6, gci_override: null };
    expect(taxYearGCI([split], "cash", 2026)).toBe(computeGCI(split));
    expect(taxYearGCI([split], "cash", 2026)).toBe(6_000);
  });
});

describe("closingYearGCI: the production view never moves", () => {
  it("is the same under both methods", () => {
    expect(closingYearGCI(ROWS, 2026)).toBe(10_000 + 8_000 + 12_000);
    expect(closingYearGCI(ROWS, 2025)).toBe(15_000);
  });
});

describe("taxYearGCIAdjustment", () => {
  it("is 0 for an accrual agent whatever the paid dates say", () => {
    expect(taxYearGCIAdjustment(ROWS, "accrual", 2025)).toBe(0);
    expect(taxYearGCIAdjustment(ROWS, "accrual", 2026)).toBe(0);
  });

  it("cash method: deals paid in from last year, less deals paid out to next year", () => {
    // 2026: + the 2025 listing paid in January, − the December closing paid in 2027.
    expect(taxYearGCIAdjustment(ROWS, "cash", 2026)).toBe(15_000 - 8_000);
    // 2025: the listing moved out of it.
    expect(taxYearGCIAdjustment(ROWS, "cash", 2025)).toBe(-15_000);
  });

  it("is 0 for a cash-method agent who entered no paid dates", () => {
    const noPaid = ROWS.map((r) => ({ ...r, commission_paid_date: null }));
    expect(taxYearGCIAdjustment(noPaid, "cash", 2026)).toBe(0);
  });
});

describe("taxYearProjectedGCI", () => {
  it("moves a projection by the adjustment", () => {
    expect(taxYearProjectedGCI(120_000, 7_000)).toBe(127_000);
    expect(taxYearProjectedGCI(120_000, 0)).toBe(120_000);
  });

  it("never goes below zero", () => {
    expect(taxYearProjectedGCI(5_000, -8_000)).toBe(0);
  });
});

describe("taxYearPlanGross: year-to-date agent net on tax-year income", () => {
  // computePlanGross / toPlanDeals are the dashboard's take-home chain.
  const SIMPLE = createTestSettings({ split_preset: "p80_20", tx_fee_rate_pct: 0, tx_fee_annual_cap: 0 });
  const REAL = createTestSettings({ comp_plan: "real", real_join_date: "2025-07-01" });
  const rows = [
    { id: "dec", ...DEC_LISTING },
    { id: "may", ...MAY_2026 },
    { id: "dec26", ...DEC_2026_PAID_2027 },
    { id: "jul", ...JULY_2026_NO_PAID_DATE },
  ];
  const window2026 = { windowStart: "2026-01-01", windowEnd: "2027-01-01", asOf: "2026-10-14" };

  it("simple split: the split of the tax year's GCI", () => {
    expect(taxYearPlanGross(SIMPLE, rows, "cash", 2026, "2026-10-14")).toEqual(
      computePlanGross(SIMPLE, 15_000 + 10_000 + 12_000),
    );
    expect(taxYearPlanGross(SIMPLE, rows, "accrual", 2026, "2026-10-14")).toEqual(
      computePlanGross(SIMPLE, 10_000 + 8_000 + 12_000),
    );
  });

  it("REAL, accrual: the dashboard's chain (carry-over moves the cap, the year's deals are summed)", () => {
    const carryOver = [rows[0]];
    const ytd = rows.slice(1);
    expect(taxYearPlanGross(REAL, [...carryOver, ...ytd], "accrual", 2026, "2026-10-14")).toEqual(
      computePlanGross(REAL, 30_000, { deals: toPlanDeals(carryOver, ytd), ...window2026 }),
    );
  });

  it("REAL, cash: the cap still runs on closing dates; the year sums the deals paid in it", () => {
    const cash = taxYearPlanGross(REAL, rows, "cash", 2026, "2026-10-14");
    const result = computeRealCompensation(REAL, toPlanDeals([], rows), "2026-10-14");
    const paid2026 = result.deals.filter((d) => d.id === "dec" || d.id === "may" || d.id === "jul");
    expect(cash.grossAfterPlan).toBeCloseTo(paid2026.reduce((s, d) => s + d.agentNet, 0), 6);
    expect(cash.planFees).toBeCloseTo(paid2026.reduce((s, d) => s + d.fees.total, 0), 6);
  });

  it("a row passed twice (the cap carry-over and the carry-in) counts once", () => {
    const twice = taxYearPlanGross(REAL, [...rows, rows[0]], "cash", 2026, "2026-10-14");
    expect(twice).toEqual(taxYearPlanGross(REAL, rows, "cash", 2026, "2026-10-14"));
  });
});
