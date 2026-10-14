// The tax year and the tables Agent Runway's tax engine is on, worded once.
//
// Reference: memory/feedback_tax_information_not_advice.md ("every tax
// number surfaced to a user came from the engine, always")
//
// The public tax estimator ran the engine's 2026 tables while its title,
// description, hero and FAQ said 2025, and a guide quoted the 2025 CPP
// ceilings as CRA's current figures under a table of 2026 estimates. A year
// or a ceiling typed into copy stays behind when the engine moves on.
//
// Everything here is read from the engine (canadian-tax-engine). Nothing is
// typed in, so the next tax year is one edit, in the engine.
//
// A year label in copy is `TAX_YEAR` (or `calculate(...).taxYear`), imported
// from the engine. apps/web/lib/__tests__/tax-year-label-copy.test.ts fails
// on a typed one.

import {
  calculate,
  CPP1_SELF_RATE,
  CPP2_SELF_RATE,
  CPP_BASIC_EXEMPTION,
  CPP_YAMPE,
  CPP_YMPE,
  FEDERAL_BPA,
  FEDERAL_BRACKETS,
  QPP1_SELF_RATE,
  QPP2_SELF_RATE,
  TAX_YEAR,
} from "../engines/canadian-tax-engine";
import { fmtCurrency } from "../formatters";
import { asTaxCopy } from "./validate";

/** A bracket rate as CRA prints it: "14%", "20.5%". */
export function fmtBracketRate(rate: number): string {
  return `${Number((rate * 100).toFixed(2))}%`;
}

/** A contribution rate to two decimals, as CRA prints 5.95: "11.90%". */
export function fmtContributionRate(rate: number): string {
  return `${(rate * 100).toFixed(2)}%`;
}

const centsFormatter = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** The engine's CPP at the second ceiling, where contributions stop. */
const cppAtSecondCeiling = calculate(CPP_YAMPE, "ontario", 0);

/**
 * The engine's federal and CPP figures, formatted for copy.
 *
 * Checked against CRA on 2026-10-13 for the 2026 tax year:
 *   federal brackets  canada.ca/en/revenue-agency/services/tax/individuals/tax-rates-brackets/current-year.html (page dated 2026-06-25)
 *   CPP               canada.ca/.../canada-pension-plan-cpp/cpp-contribution-rates-maximums-exemptions.html (page dated 2025-10-31)
 *   CPP2              canada.ca/.../making-deductions/second-additional-cpp-contribution-rates-maximums.html (page dated 2025-10-31)
 *
 * The QPP rates are the engine's and were not re-read that day. Copy that
 * reaches a reader outside the calculator names QPP without a rate
 * (`SELF_EMPLOYED_CPP.quebec`).
 */
export const TAX_ENGINE_TABLES = {
  /** `TAX_YEAR` */
  taxYear: TAX_YEAR,
  federal: {
    /** Every bracket rate, lowest first: "14%", "20.5%", "26%", "29%", "33%". */
    rates: FEDERAL_BRACKETS.map(([, rate]) => fmtBracketRate(rate)),
    lowestRate: fmtBracketRate(FEDERAL_BRACKETS[0][1]),
    highestRate: fmtBracketRate(FEDERAL_BRACKETS[FEDERAL_BRACKETS.length - 1][1]),
    basicPersonalAmount: fmtCurrency(FEDERAL_BPA),
  },
  cpp: {
    basicExemption: fmtCurrency(CPP_BASIC_EXEMPTION),
    /** Year's maximum pensionable earnings (YMPE). */
    firstCeiling: fmtCurrency(CPP_YMPE),
    /** Year's additional maximum pensionable earnings (YAMPE). */
    secondCeiling: fmtCurrency(CPP_YAMPE),
    /** Self-employed: the employee and employer rates together. */
    rate: fmtContributionRate(CPP1_SELF_RATE),
    cpp2Rate: fmtContributionRate(CPP2_SELF_RATE),
    qppRate: fmtContributionRate(QPP1_SELF_RATE),
    qpp2Rate: fmtContributionRate(QPP2_SELF_RATE),
    /** `cpp1Contribution` at the second ceiling. */
    maximum: centsFormatter.format(cppAtSecondCeiling.cpp1Contribution),
    /** `cpp2Contribution` at the second ceiling. */
    cpp2Maximum: centsFormatter.format(cppAtSecondCeiling.cpp2Contribution),
    /** `totalCPP` at the second ceiling. */
    totalMaximum: centsFormatter.format(cppAtSecondCeiling.totalCPP),
  },
} as const;

const { federal, cpp } = TAX_ENGINE_TABLES;

/**
 * Which tables the engine holds. The year is given for the federal brackets
 * and CPP, the two that were checked against CRA for `TAX_YEAR`. The
 * provincial tables are named without a year.
 */
export const TAX_ENGINE_TABLES_SUMMARY = asTaxCopy(
  `The engine's federal brackets (${federal.lowestRate} to ${federal.highestRate}), federal basic personal amount (${federal.basicPersonalAmount}) and CPP figures are CRA's for the ${TAX_YEAR} tax year. It also holds a bracket table and a basic personal amount for each province and territory.`,
);

/** CPP on self-employment income, as the engine works it out. */
export const SELF_EMPLOYED_CPP = {
  /** `CPP1_SELF_RATE`, `CPP2_SELF_RATE` and the three CPP amounts. */
  rates: asTaxCopy(
    `For the ${TAX_YEAR} tax year, a self-employed agent pays both the employee and employer portions of CPP: ${cpp.rate} of net self-employment income between ${cpp.basicExemption} and ${cpp.firstCeiling}, plus ${cpp.cpp2Rate} (CPP2) of income between ${cpp.firstCeiling} and ${cpp.secondCeiling}.`,
  ),
  /** `calculate` at the second ceiling. */
  maximum: asTaxCopy(
    `No CPP is charged on income above ${cpp.secondCeiling}, so the ${TAX_YEAR} contribution stops at ${cpp.totalMaximum}: ${cpp.maximum} of CPP plus ${cpp.cpp2Maximum} of CPP2.`,
  ),
  /** `cppDeduction` and the employee-half credit in `calculate`. */
  deduction: asTaxCopy(
    "The engine deducts half of the CPP contribution and all of the CPP2 contribution from income, and applies a non-refundable credit on the other half of CPP.",
  ),
  /** The engine switches to its QPP rates for Quebec. */
  quebec: asTaxCopy(
    "A Quebec resident contributes to the Quebec Pension Plan (QPP) instead, at Quebec's own rates.",
  ),
} as const;
