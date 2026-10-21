// How the T2125 CCA schedule names the first-year rule it used for an asset.
//
// Reference: memory/feedback_tax_information_not_advice.md
// Rule:      packages/core/engines/cca-first-year.ts (firstYearTreatment)
// Source:    CRA Guide T4002, Chapter 4 – Capital cost allowance; CRA, What's
//            new for small businesses and self-employed (AII and RII).

import type { FirstYearTreatment } from "../engines/cca-first-year";
import { asTaxCopy, type TaxCopy } from "./validate";

export const CRA_CCA_SOURCES = {
  guide: {
    label: "CRA: Guide T4002, Chapter 4 – Capital cost allowance",
    url: "https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/t4002/t4002-6.html",
  },
  incentives: {
    label: "CRA: What's new for small businesses and self-employed (accelerated and reaccelerated investment incentives)",
    url: "https://www.canada.ca/en/revenue-agency/services/tax/businesses/small-businesses-self-employed-income/whats-new-small-businesses-self-employed.html",
  },
  folio: {
    label: "CRA: Income Tax Folio S3-F4-C1, General Discussion of Capital Cost Allowance (notice on the reaccelerated investment incentive)",
    url: "https://www.canada.ca/en/revenue-agency/services/tax/technical-information/income-tax/income-tax-folios-index/series-3-property-investments-savings-plans/series-3-property-investments-savings-plans-folio-4-capital-cost-allowance/income-tax-folio-s3-f4-c1-general-discussion-capital-cost-allowance.html",
  },
} as const;

/** One line under an asset in its first year, naming the rule applied. */
export function ccaFirstYearNote(treatment: FirstYearTreatment): TaxCopy {
  switch (treatment.rule) {
    case "half_year":
      return asTaxCopy("First year: CCA on half of the year's net additions (CRA's half-year rule).");
    case "aiip_enhanced":
      return asTaxCopy("First year: one and a half times the usual CCA (accelerated investment incentive).");
    case "aiip_full":
      return asTaxCopy("First year: the full rate, no half-year rule (accelerated investment incentive).");
    case "riip_enhanced":
      return asTaxCopy("First year: one and a half times the usual CCA (reaccelerated investment incentive).");
    case "riip_full":
      return asTaxCopy("First year: the full rate, no half-year rule (reaccelerated investment incentive, phase-out years).");
    case "class50_full":
      return asTaxCopy(
        "First year: 100% of the cost (Class 50 acquired after April 15, 2024 and in use before 2027, a change CRA's guide describes as proposed).",
      );
    case "not_subject":
      return asTaxCopy("First year: the full rate (this class is recorded without the half-year rule).");
  }
}

/** The rule in one sentence, for help text and Flight Crew. */
export const CCA_FIRST_YEAR_RULE: TaxCopy = asTaxCopy(
  "Per CRA's guide, CCA in the year property is added is usually limited to half of the year's net additions (the half-year rule), but the rule does not apply to accelerated investment incentive property (acquired after November 20, 2018 and before 2025), zero-emission vehicles, Class 56 property or reaccelerated investment incentive property (acquired after 2024 and available for use before 2034, enacted March 26, 2026). Property of the reaccelerated incentive put to use before 2030 gets one and a half times the usual first-year CCA. Agent Runway works out the first year from the date an asset was acquired; an accountant can confirm how the rules apply to a particular asset.",
);
