/**
 * The tax year and the tables the tax engine is on, as printed in copy.
 *
 * Reference: memory/feedback_tax_information_not_advice.md
 *
 * The public tax estimator said 2025 in its title, description, hero and FAQ
 * while the engine behind it was on 2026 tables, and a guide quoted the 2025
 * CPP ceilings ($71,300 and $81,200) as current. What these tests prove:
 *   1. Every figure here is the engine's own constant or `calculate`'s own
 *      result. None is a second copy.
 *   2. The sentences print the engine's year and those figures.
 *   3. The figures are CRA's for the year the engine says it is on, as read
 *      on canada.ca on 2026-10-13. This is the one check with typed numbers:
 *      it is what fails when `TAX_YEAR` moves and a table is left behind.
 *   4. The wording passes the info-not-advice lint and has no em dash.
 */

import { describe, it, expect } from "vitest";
import {
  SELF_EMPLOYED_CPP,
  TAX_ENGINE_TABLES,
  TAX_ENGINE_TABLES_SUMMARY,
  fmtBracketRate,
  fmtContributionRate,
} from "../engine-tables";
import {
  calculate,
  CPP1_SELF_RATE,
  CPP2_SELF_RATE,
  CPP_BASIC_EXEMPTION,
  CPP_YAMPE,
  CPP_YMPE,
  FEDERAL_BPA,
  FEDERAL_BRACKETS,
  TAX_YEAR,
} from "../../engines/canadian-tax-engine";
import { validateTaxCopy } from "../validate";

const errorsIn = (text: string) => validateTaxCopy(text).filter((d) => d.level === "error");

const dollars = (n: number) => `$${n.toLocaleString("en-CA")}`;
const cents = (n: number) => `$${n.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

describe("the engine's tax year", () => {
  it("is the year `calculate` stamps on every result, with or without income", () => {
    expect(TAX_ENGINE_TABLES.taxYear).toBe(TAX_YEAR);
    expect(calculate(100_000, "ontario", 10).taxYear).toBe(TAX_YEAR);
    expect(calculate(0, "newBrunswick", 0).taxYear).toBe(TAX_YEAR);
  });
});

describe("rate formats", () => {
  it("a bracket rate drops trailing zeros; a contribution rate keeps two decimals", () => {
    expect(fmtBracketRate(0.14)).toBe("14%");
    expect(fmtBracketRate(0.205)).toBe("20.5%");
    expect(fmtBracketRate(0.1229)).toBe("12.29%");
    expect(fmtContributionRate(0.0595 * 2)).toBe("11.90%");
    expect(fmtContributionRate(0.04 * 2)).toBe("8.00%");
  });
});

describe("the federal figures are the engine's", () => {
  const { federal } = TAX_ENGINE_TABLES;

  it("every bracket rate, lowest first", () => {
    expect(federal.rates).toEqual(FEDERAL_BRACKETS.map(([, rate]) => fmtBracketRate(rate)));
    expect(federal.lowestRate).toBe(federal.rates[0]);
    expect(federal.highestRate).toBe(federal.rates[federal.rates.length - 1]);
  });

  it("the basic personal amount", () => {
    expect(federal.basicPersonalAmount).toBe(dollars(FEDERAL_BPA));
  });
});

describe("the CPP figures are the engine's", () => {
  const { cpp } = TAX_ENGINE_TABLES;

  it("the exemption, both ceilings and both rates", () => {
    expect(cpp.basicExemption).toBe(dollars(CPP_BASIC_EXEMPTION));
    expect(cpp.firstCeiling).toBe(dollars(CPP_YMPE));
    expect(cpp.secondCeiling).toBe(dollars(CPP_YAMPE));
    expect(cpp.rate).toBe(fmtContributionRate(CPP1_SELF_RATE));
    expect(cpp.cpp2Rate).toBe(fmtContributionRate(CPP2_SELF_RATE));
  });

  it("the maximums are what `calculate` returns at the second ceiling", () => {
    const at = calculate(CPP_YAMPE, "ontario", 0);
    expect(cpp.maximum).toBe(cents(at.cpp1Contribution));
    expect(cpp.cpp2Maximum).toBe(cents(at.cpp2Contribution));
    expect(cpp.totalMaximum).toBe(cents(at.totalCPP));
  });

  it("income above the second ceiling adds no CPP", () => {
    const at = calculate(CPP_YAMPE, "ontario", 0);
    expect(calculate(CPP_YAMPE + 50_000, "ontario", 0).totalCPP).toBe(at.totalCPP);
    expect(calculate(CPP_YAMPE - 1, "ontario", 0).totalCPP).toBeLessThan(at.totalCPP);
  });

  it("the maximums are the ceilings and rates multiplied out", () => {
    const at = calculate(CPP_YAMPE, "ontario", 0);
    expect(at.cpp1Contribution).toBeCloseTo((CPP_YMPE - CPP_BASIC_EXEMPTION) * CPP1_SELF_RATE, 2);
    expect(at.cpp2Contribution).toBeCloseTo((CPP_YAMPE - CPP_YMPE) * CPP2_SELF_RATE, 2);
  });
});

/**
 * CRA's published figures by tax year, read on canada.ca on 2026-10-13:
 *   federal  /services/tax/individuals/tax-rates-brackets/current-year.html (page dated 2026-06-25)
 *   CPP      /payroll-deductions-contributions/canada-pension-plan-cpp/cpp-contribution-rates-maximums-exemptions.html
 *   CPP2     /calculating-deductions/making-deductions/second-additional-cpp-contribution-rates-maximums.html
 *
 * When `TAX_YEAR` moves to a year with no row here, the test below fails
 * until that year's figures are read from CRA and added.
 */
const CRA_PUBLISHED: Record<number, {
  federalRates: string[];
  federalCeilings: number[];
  ympe: number;
  yampe: number;
  basicExemption: number;
  selfEmployedMaxCpp: string;
  selfEmployedMaxCpp2: string;
}> = {
  2026: {
    federalRates: ["14%", "20.5%", "26%", "29%", "33%"],
    federalCeilings: [58_523, 117_045, 181_440, 258_482],
    ympe: 74_600,
    yampe: 85_000,
    basicExemption: 3_500,
    selfEmployedMaxCpp: "$8,460.90",
    selfEmployedMaxCpp2: "$832.00",
  },
};

describe("the engine's federal and CPP tables are CRA's for the year it says it is on", () => {
  const published = CRA_PUBLISHED[TAX_YEAR];

  it(`CRA's ${TAX_YEAR} figures have been read and recorded here`, () => {
    expect(published, `no CRA figures recorded for ${TAX_YEAR}: read them on canada.ca and add a row`).toBeDefined();
  });

  it("federal bracket rates and ceilings", () => {
    expect(TAX_ENGINE_TABLES.federal.rates).toEqual(published.federalRates);
    expect(FEDERAL_BRACKETS.slice(0, -1).map(([ceiling]) => ceiling)).toEqual(published.federalCeilings);
  });

  it("CPP exemption, ceilings and self-employed maximums", () => {
    expect(CPP_BASIC_EXEMPTION).toBe(published.basicExemption);
    expect(CPP_YMPE).toBe(published.ympe);
    expect(CPP_YAMPE).toBe(published.yampe);
    expect(TAX_ENGINE_TABLES.cpp.maximum).toBe(published.selfEmployedMaxCpp);
    expect(TAX_ENGINE_TABLES.cpp.cpp2Maximum).toBe(published.selfEmployedMaxCpp2);
  });
});

describe("the sentences", () => {
  const { federal, cpp } = TAX_ENGINE_TABLES;

  it("the summary names the year for the federal and CPP tables, and none for the provincial ones", () => {
    expect(TAX_ENGINE_TABLES_SUMMARY).toContain(`for the ${TAX_YEAR} tax year`);
    expect(TAX_ENGINE_TABLES_SUMMARY).toContain(`(${federal.lowestRate} to ${federal.highestRate})`);
    expect(TAX_ENGINE_TABLES_SUMMARY).toContain(`(${federal.basicPersonalAmount})`);
    const provincial = TAX_ENGINE_TABLES_SUMMARY.slice(TAX_ENGINE_TABLES_SUMMARY.indexOf("It also holds"));
    expect(provincial).toContain("each province and territory");
    expect(provincial).not.toMatch(/\b20\d\d\b/);
  });

  it("the CPP rates sentence prints the year, both rates, the exemption and both ceilings", () => {
    expect(SELF_EMPLOYED_CPP.rates).toBe(
      `For the ${TAX_YEAR} tax year, a self-employed agent pays both the employee and employer portions of CPP: ${cpp.rate} of net self-employment income between ${cpp.basicExemption} and ${cpp.firstCeiling}, plus ${cpp.cpp2Rate} (CPP2) of income between ${cpp.firstCeiling} and ${cpp.secondCeiling}.`,
    );
  });

  it("the maximum sentence adds up", () => {
    expect(SELF_EMPLOYED_CPP.maximum).toContain(`stops at ${cpp.totalMaximum}: ${cpp.maximum} of CPP plus ${cpp.cpp2Maximum} of CPP2`);
    const at = calculate(CPP_YAMPE, "ontario", 0);
    expect(at.cpp1Contribution + at.cpp2Contribution).toBeCloseTo(at.totalCPP, 2);
  });

  it("the deduction sentence is what `calculate` does with CPP", () => {
    // Under the first federal bracket, so each dollar deducted is worth the lowest rate.
    const netIncome = 50_000;
    const at = calculate(netIncome, "ontario", 0);
    const lowestRate = FEDERAL_BRACKETS[0][1];
    const taxable = netIncome - at.cpp1Contribution / 2 - at.cpp2Contribution;
    const federal = taxable * lowestRate - FEDERAL_BPA * lowestRate - (at.cpp1Contribution / 2) * lowestRate;
    expect(at.federalTax).toBeCloseTo(federal, 2);
    expect(SELF_EMPLOYED_CPP.deduction).toContain("deducts half of the CPP contribution and all of the CPP2 contribution");
    expect(SELF_EMPLOYED_CPP.deduction).toContain("credit on the other half of CPP");
  });

  it("the Quebec sentence gives no rate", () => {
    expect(SELF_EMPLOYED_CPP.quebec).toContain("Quebec Pension Plan (QPP)");
    expect(SELF_EMPLOYED_CPP.quebec).not.toMatch(/\d/);
  });

  it.each([
    ["summary", TAX_ENGINE_TABLES_SUMMARY],
    ["CPP rates", SELF_EMPLOYED_CPP.rates],
    ["CPP maximum", SELF_EMPLOYED_CPP.maximum],
    ["CPP deduction", SELF_EMPLOYED_CPP.deduction],
    ["Quebec", SELF_EMPLOYED_CPP.quebec],
  ])("%s: no advice wording, no em dash", (_name, sentence) => {
    expect(errorsIn(sentence)).toEqual([]);
    expect(sentence).not.toContain("—");
  });
});
