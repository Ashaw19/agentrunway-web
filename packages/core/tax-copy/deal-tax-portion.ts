// The tax rows of the deal-close breakdown, worded once.
//
// Reference: memory/feedback_tax_information_not_advice.md
// Figure:    packages/core/engines/deal-tax-portion.ts
//
// The two deal-close screens used to head this breakdown "How to allocate your
// commission" and label the income tax row "Income tax reserve", with the
// notes "~43% marginal rate · portion owed to CRA" and "the tax portion before
// the rest is yours", and the GST/HST row "Remit to CRA on your next filing".
// Each reads as an instruction about the money. The rows now say what each
// figure is and how it was worked out, and give no percentage of a commission.

import { fmtCurrency } from "../formatters";
import { GST_HST_TRUST_RULE } from "./cra-rules";
import { asTaxCopy, type TaxCopy } from "./validate";

/** The fields of the engine's `DealTaxPortion` the wording prints. */
export interface DealTaxPortionCopyInput {
  taxPortion: number;
  annualTaxEstimate: number;
  projectedGCI: number;
  taxYear: number;
}

export const DEAL_CLOSE_BREAKDOWN_HEADING = "Commission breakdown";

/**
 * `taxPortionOfCommission` in words. Sits beside
 * `TAX_ENGINE_ESTIMATE.perDeal`: the per-deal tax portion is this figure for
 * a deal of the projected average size.
 */
export const DEAL_TAX_PORTION_DEFINITION: TaxCopy = asTaxCopy(
  "The tax portion of one commission is the yearly estimate multiplied by that commission and divided by projected GCI for the year.",
);

/** "Income tax and CPP (estimate)"; QPP in Quebec. */
export function dealTaxPortionLabel(province: string): TaxCopy {
  return asTaxCopy(`Income tax and ${province === "quebec" ? "QPP" : "CPP"} (estimate)`);
}

/**
 * The line under the income tax row: the engine's working, with the figures
 * it used. The year's estimate is the dashboard tax card's headline figure.
 */
export function dealTaxPortionNote(portion: DealTaxPortionCopyInput): TaxCopy {
  if (!(portion.annualTaxEstimate > 0) || !(portion.projectedGCI > 0)) {
    return asTaxCopy(
      `The ${portion.taxYear} tax estimate is ${fmtCurrency(0)} on the figures entered so far, so no tax portion is worked out for this commission.`,
    );
  }
  return asTaxCopy(
    `Tax portion of this commission: the ${portion.taxYear} estimate of ${fmtCurrency(portion.annualTaxEstimate)} × this commission ÷ projected GCI of ${fmtCurrency(portion.projectedGCI)}.`,
  );
}

export interface DealGstHstCopyInput {
  /** `gstHstLabel(province)`: "HST", "GST", "GST + QST". */
  label: string;
  /** `user_settings.gst_hst_registered`. */
  registered: boolean;
  /** `user_settings.brokerage_withholds_hst`. */
  brokerageWithholds: boolean;
}

/** "HST collected (estimate)" */
export function dealGstHstLabel(label: string): TaxCopy {
  return asTaxCopy(`${label} collected (estimate)`);
}

/**
 * The line under the GST/HST row. `computeHSTCollected` (hst-engine) is 0 for
 * a non-registrant and when the brokerage remits the tax, so each of those
 * readers is told why the row shows none.
 */
export function dealGstHstNote(input: DealGstHstCopyInput): TaxCopy {
  const { label, registered, brokerageWithholds } = input;
  if (!registered) {
    return asTaxCopy(`Your Settings show no ${label} registration, so none is counted on this commission.`);
  }
  if (brokerageWithholds) {
    return asTaxCopy(
      `Your Settings show your brokerage holds back ${label} and remits it to CRA, so none is counted in your hands.`,
    );
  }
  return asTaxCopy(`Charged on top of the commission, before input tax credits. ${GST_HST_TRUST_RULE}`);
}
