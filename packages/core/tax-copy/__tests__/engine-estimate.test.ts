/**
 * What Agent Runway's tax engine estimates, as printed on public pages.
 *
 * Reference: memory/feedback_tax_information_not_advice.md
 *
 * Public pages used to answer "how much of a commission is tax" with a typed
 * percentage ("30–35% of every payment", "typically 25–35%", "25% to 40%").
 * The pages now print the engine's own estimate. What these tests prove:
 *   1. Every figure in the spread is `calculate`'s, for the province named.
 *   2. "Lowest" and "highest" are the lowest and highest of all 13 provinces
 *      and territories, checked against every one of them.
 *   3. The wording describes the engine (what it counts, what it moves with,
 *      how the per-deal figure is made) and passes the info-not-advice lint.
 *   4. The line-by-line breakdown a worked example prints (federal tax,
 *      provincial tax, CPP, the total, what is left) is `calculate`'s for
 *      that income and province. The articles used to type these ("runs
 *      approximately $28,000–$32,000", "CPP ... a further $6,000–$7,000").
 */

import { describe, it, expect } from "vitest";
import {
  TAX_ENGINE_ESTIMATE,
  TAX_ESTIMATE_EXAMPLE_INCOMES,
  fmtTaxEstimateRate,
  taxEstimateBreakdown,
  taxEstimateSpread,
  taxEstimateSpreadSentence,
} from "../engine-estimate";
import { calculate } from "../../engines/canadian-tax-engine";
import { PROVINCE_LABELS, type Province } from "../../types/database";
import { validateTaxCopy } from "../validate";

const errorsIn = (text: string) => validateTaxCopy(text).filter((d) => d.level === "error");

const PROVINCES = Object.keys(PROVINCE_LABELS).filter((key): key is Province => key in PROVINCE_LABELS);

describe.each(TAX_ESTIMATE_EXAMPLE_INCOMES)("the engine's estimate at $%i of net business income", (netIncome) => {
  const spread = taxEstimateSpread(netIncome);

  it("covers all 13 provinces and territories", () => {
    expect(PROVINCES).toHaveLength(13);
  });

  it.each([
    ["low", spread.low],
    ["high", spread.high],
  ])("%s: the amount and rate are the engine's for that province", (_end, at) => {
    const result = calculate(netIncome, at.province, 0);
    expect(at.amount).toBe(result.totalBurden);
    expect(at.rate).toBe(result.totalBurden / netIncome);
    expect(at.rate).toBeCloseTo(result.effectiveRate, 4);
    expect(at.label).toBe(PROVINCE_LABELS[at.province]);
    expect(spread.taxYear).toBe(result.taxYear);
  });

  it("no province is under the low or over the high", () => {
    for (const province of PROVINCES) {
      const { totalBurden } = calculate(netIncome, province, 0);
      expect(totalBurden).toBeGreaterThanOrEqual(spread.low.amount);
      expect(totalBurden).toBeLessThanOrEqual(spread.high.amount);
    }
  });

  it("the sentence prints the year, the income, both provinces and both rates", () => {
    const sentence = taxEstimateSpreadSentence(netIncome);
    expect(sentence).toContain(`For the ${spread.taxYear} tax year`);
    expect(sentence).toContain(`$${netIncome.toLocaleString("en-CA")} of net business income`);
    expect(sentence).toContain(`${fmtTaxEstimateRate(spread.low.rate)} of that income in ${spread.low.label}`);
    expect(sentence).toContain(`${fmtTaxEstimateRate(spread.high.rate)} in ${spread.high.label}`);
    expect(errorsIn(sentence)).toEqual([]);
    expect(sentence).not.toContain("—");
  });
});

describe("the wording", () => {
  it("says what the estimate covers: federal tax, provincial tax and CPP or QPP", () => {
    expect(TAX_ENGINE_ESTIMATE.what).toMatch(/federal income tax, provincial income tax and CPP contributions \(QPP in Quebec\)/);
    expect(TAX_ENGINE_ESTIMATE.what).toMatch(/on net business income for the year/);
  });

  it("says no single percentage of a commission fits every agent", () => {
    expect(TAX_ENGINE_ESTIMATE.varies).toMatch(/no single percentage of a commission fits every agent/);
  });

  it("the per-deal figure is the yearly estimate over projected deals, as the engine works it out", () => {
    expect(TAX_ENGINE_ESTIMATE.perDeal).toMatch(/yearly estimate divided by the number of deals projected for the year/);
    const result = calculate(120_000, "newBrunswick", 12);
    expect(result.perDealSetAside).toBeCloseTo(result.totalBurden / 12, 2);
  });

  it.each(Object.entries(TAX_ENGINE_ESTIMATE))("%s: no advice wording, no percentage, no em dash", (_key, text) => {
    expect(errorsIn(text)).toEqual([]);
    expect(text).not.toMatch(/\d\s*%/);
    expect(text).not.toContain("—");
    expect(text).not.toMatch(/\b(?:hold|save|put|keep|move|transfer)\b/i);
  });

  it("a rate prints to one decimal", () => {
    expect(fmtTaxEstimateRate(0.2612)).toBe("26.1%");
    expect(fmtTaxEstimateRate(0.3)).toBe("30.0%");
  });

  it("a rate is rounded once, from the dollar amount, not from the engine's rounded rate", () => {
    // Nova Scotia at $100,000: the amount over the income is under 33.55%.
    // The engine's four-decimal rate is 0.3355, which prints as 33.6%.
    const { high } = taxEstimateSpread(100_000);
    const result = calculate(100_000, high.province, 0);
    const exact = (result.totalBurden / 100_000) * 100;
    expect(fmtTaxEstimateRate(high.rate)).toBe(`${(Math.round(exact * 10) / 10).toFixed(1)}%`);
  });
});

describe.each([
  [110_000, "ontario"],
  [112_200, "ontario"],
  [130_200, "ontario"],
  [85_000, "newBrunswick"],
  [150_000, "quebec"],
] as const)("the engine's breakdown at $%i in %s", (netIncome, province) => {
  const breakdown = taxEstimateBreakdown(netIncome, province);
  const result = calculate(netIncome, province, 0);

  it("every line is the engine's, for the engine's tax year", () => {
    expect(breakdown.federalTax).toBe(result.federalTax);
    expect(breakdown.provincialTax).toBe(result.provincialTax);
    expect(breakdown.cpp).toBe(result.totalCPP);
    expect(breakdown.total).toBe(result.totalBurden);
    expect(breakdown.taxYear).toBe(result.taxYear);
    expect(breakdown.label).toBe(PROVINCE_LABELS[province]);
  });

  it("the total is the three lines, to the cent", () => {
    expect(breakdown.federalTax + breakdown.provincialTax + breakdown.cpp).toBeCloseTo(breakdown.total, 2);
  });

  it("what is left is the income less the total, and the rate is the total over the income", () => {
    expect(breakdown.afterTax).toBe(netIncome - result.totalBurden);
    expect(breakdown.rate).toBe(result.totalBurden / netIncome);
    expect(breakdown.rate).toBeCloseTo(result.effectiveRate, 4);
  });
});

describe("the engine's breakdown, edge cases", () => {
  it("CPP is both halves: the engine's first and second tier together", () => {
    const result = calculate(110_000, "ontario", 0);
    expect(taxEstimateBreakdown(110_000, "ontario").cpp).toBe(result.totalCPP);
    expect(result.totalCPP).toBeCloseTo(result.cpp1Contribution + result.cpp2Contribution, 2);
  });

  it("a rate is rounded once: Ontario at $110,000 prints 28.0%, where the engine's four-decimal rate would print 28.1%", () => {
    const breakdown = taxEstimateBreakdown(110_000, "ontario");
    const exact = (breakdown.total / 110_000) * 100;
    expect(fmtTaxEstimateRate(breakdown.rate)).toBe(`${(Math.round(exact * 10) / 10).toFixed(1)}%`);
  });

  it("no income gives zeros, not a divide by zero", () => {
    const breakdown = taxEstimateBreakdown(0, "ontario");
    expect(breakdown.total).toBe(0);
    expect(breakdown.rate).toBe(0);
    expect(breakdown.afterTax).toBe(0);
  });
});
