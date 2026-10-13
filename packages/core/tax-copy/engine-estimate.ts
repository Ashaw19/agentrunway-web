// What Agent Runway's tax engine estimates, worded once.
//
// Reference: memory/feedback_tax_information_not_advice.md ("Compute
// estimates via the canonical engine. Never inline math.")
//
// Public pages and blog posts used to answer "how much of a commission is
// tax" with a percentage and an instruction: "Setting aside 30–35% of every
// payment into a dedicated tax account", "typically 25–35% ... belongs to
// the CRA". CRA publishes no such percentage. Income tax is worked out on
// taxable income for the year, so the copy now says what the engine
// estimates and what that estimate moves with.
//
// Every figure built here is the engine's (`calculate`, canadian-tax-engine).
// None is typed in, so a new tax year in the engine is a new figure on the
// page with no copy to update.

import { calculate } from "../engines/canadian-tax-engine";
import { fmtCurrency } from "../formatters";
import { PROVINCE_LABELS, type Province } from "../types/database";
import { asTaxCopy, type TaxCopy } from "./validate";

export const TAX_ENGINE_ESTIMATE = {
  /** `totalBurden`: federal tax + provincial tax + CPP/QPP. */
  what: asTaxCopy(
    "Agent Runway's tax engine estimates federal income tax, provincial income tax and CPP contributions (QPP in Quebec) on net business income for the year.",
  ),
  /** The engine's two inputs: `netIncome` and `province`. */
  varies: asTaxCopy(
    "The estimate moves with province and with net business income for the year, so no single percentage of a commission fits every agent.",
  ),
  /** `perDealSetAside`: `totalBurden` / deal count. */
  perDeal: asTaxCopy(
    "The per-deal tax portion is that yearly estimate divided by the number of deals projected for the year.",
  ),
  /** What `calculate` counts and leaves out. */
  assumptions: asTaxCopy(
    "The engine counts self-employment income only, with the basic personal amounts and the CPP deduction and credit, and no other deductions or credits.",
  ),
  /** What the engine is given as `netIncome`. */
  netIncome: asTaxCopy(
    "Net business income is commission after the brokerage split and fees, less business expenses.",
  ),
} as const;

/** Net business incomes the public pages show the engine's estimate at. */
export const TAX_ESTIMATE_EXAMPLE_INCOMES = [50_000, 100_000, 150_000, 200_000] as const;

export interface TaxEstimateAt {
  province: Province;
  /** `PROVINCE_LABELS[province]` */
  label: string;
  /** `totalBurden`: federal tax + provincial tax + CPP/QPP. */
  amount: number;
  /**
   * `totalBurden` / net income. This is the engine's `effectiveRate` before
   * the engine rounds it to four decimals: printing that one to one decimal
   * place would round twice (33.549% to 33.55% to 33.6%).
   */
  rate: number;
}

export interface TaxEstimateSpread {
  netIncome: number;
  /** The engine's `taxYear`. */
  taxYear: number;
  /** The province or territory where the engine's estimate is lowest. */
  low: TaxEstimateAt;
  /** The province or territory where it is highest. */
  high: TaxEstimateAt;
}

const PROVINCES = Object.keys(PROVINCE_LABELS).filter(
  (key): key is Province => key in PROVINCE_LABELS,
);

/**
 * The engine's estimate at one net business income in every province and
 * territory, reduced to the lowest and the highest. Ordered by dollar amount,
 * because `effectiveRate` is rounded and two provinces can tie on it.
 */
export function taxEstimateSpread(netIncome: number): TaxEstimateSpread {
  const estimates = PROVINCES.map((province) => {
    const result = calculate(netIncome, province, 0);
    return {
      taxYear: result.taxYear,
      at: {
        province,
        label: PROVINCE_LABELS[province],
        amount: result.totalBurden,
        rate: result.totalBurden / netIncome,
      },
    };
  }).sort((a, b) => a.at.amount - b.at.amount);

  return {
    netIncome,
    taxYear: estimates[0].taxYear,
    low: estimates[0].at,
    high: estimates[estimates.length - 1].at,
  };
}

/** "26.1%" */
export function fmtTaxEstimateRate(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

/** The spread at one income as a sentence, for an FAQ answer or a paragraph. */
export function taxEstimateSpreadSentence(netIncome: number): TaxCopy {
  const { taxYear, low, high } = taxEstimateSpread(netIncome);
  return asTaxCopy(
    `For the ${taxYear} tax year, on ${fmtCurrency(netIncome)} of net business income, the engine's estimate runs from ${fmtTaxEstimateRate(low.rate)} of that income in ${low.label} to ${fmtTaxEstimateRate(high.rate)} in ${high.label}.`,
  );
}
