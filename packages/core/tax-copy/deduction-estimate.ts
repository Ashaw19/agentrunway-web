// What the Overhead page's "Already Capturing" figure is, worded once.
//
// Reference: memory/feedback_tax_information_not_advice.md
// Figure:    packages/core/engines/tax-optimization-engine.ts (deductionTaxRate)
//
// The Savings Impact bar on the Overhead page puts the income tax the year's
// recorded expenses are estimated to reduce ("Already Capturing") beside the
// cards' estimates ("Untapped Potential"). Both are a deduction x
// `deductionTaxRate`: the marginal rate on net income for tax. The hover text
// says so, with the figures it used.

import { fmtCurrency, fmtPct } from "../formatters";
import { asTaxCopy, type TaxCopy } from "./validate";

/**
 * Hover text on the "Already Capturing" segment (drawn only when the figure
 * is above zero).
 *
 * @param captured       The year's expenses x `deductionRate`.
 * @param annualExpenses The year's expenses (`expensesYTD + expensesRemaining`).
 * @param deductionRate  `deductionTaxRate(netForTax, province)`.
 */
export function alreadyCapturingNote(
  captured: number,
  annualExpenses: number,
  deductionRate: number,
): TaxCopy {
  return asTaxCopy(
    `Already Capturing: ${fmtCurrency(Math.round(captured))}. ` +
      `The year's expenses (${fmtCurrency(Math.round(annualExpenses))}) × the ${fmtPct(deductionRate)} marginal rate on projected net income: ` +
      `an estimate of the income tax they reduce, worked out the way each card below is.`,
  );
}
