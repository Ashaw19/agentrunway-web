// CRA rules the app prints in copy. Each is stated once, as CRA states it,
// with its source, so a PDF, a screen and the AI layer cannot drift apart.
//
// Reference: memory/feedback_tax_information_not_advice.md ("Surface
// published CRA rules: cite the source. Don't paraphrase loosely.")
//
// Every string built here goes through asTaxCopy(), so a forbidden verb is a
// failing test (__tests__/cra-rules.test.ts), not a shipped sentence.
//
// MCP tools that need one import it from the `_shared/core` copy of this
// file (scripts/build-mcp-shared.js), never a retyped sentence.

import { gstHstLabel, gstHstRate } from "../engines/canadian-tax-engine";
import type { IncomeReportingMethod } from "../engines/tax-year";
import type { GstHstCommissionTiming } from "../engines/commission-hst-engine";
import { fmtCurrency } from "../formatters";
import { PROVINCE_ISO_CODES, PROVINCE_LABELS, type Province } from "../types/database";
import { asTaxCopy, type TaxCopy } from "./validate";

// ─────────────────────────────────────────────────────────────────────────
// GST/HST small supplier limit
// ─────────────────────────────────────────────────────────────────────────

/**
 * CRA's small supplier limit.
 *
 * Source: canada.ca, "When to register for and start charging the GST/HST"
 *   canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/when-register-charge.html
 *   (page dated 2026-06-16, read 2026-10-13)
 *
 * What CRA measures: "the total amount of all revenues (before expenses) from
 * your worldwide taxable supplies". For an agent that is commission revenue.
 * It is not net income.
 *
 * The periods: a single calendar quarter, and the last four consecutive
 * calendar quarters. Not a calendar year and not a rolling 12 months. Over
 * the limit in one quarter, a person stops being a small supplier that day;
 * over it across four quarters, at the end of the month after that quarter.
 */
export const SMALL_SUPPLIER_LIMIT = 30_000;

/** The rule in full. For notes with room for two sentences. */
export const SMALL_SUPPLIER_RULE: TaxCopy = asTaxCopy(
  `Per CRA, GST/HST registration is required once revenue from worldwide taxable supplies, before expenses, is over ${fmtCurrency(SMALL_SUPPLIER_LIMIT)} in a single calendar quarter or over the last four consecutive calendar quarters. At or under that limit a person is a small supplier and registration is optional.`,
);

/** One line, for a hint under a "registered?" control. */
export const SMALL_SUPPLIER_RULE_SHORT: TaxCopy = asTaxCopy(
  `Per CRA, required once revenue from taxable supplies is over ${fmtCurrency(SMALL_SUPPLIER_LIMIT)} in one calendar quarter or over four consecutive calendar quarters.`,
);

// ─────────────────────────────────────────────────────────────────────────
// GST/HST note on the business report (Reports page and its PDF)
// ─────────────────────────────────────────────────────────────────────────

export interface GstHstReportNoteInput {
  /** `gstHstLabel(province)`: "HST", "GST", "GST + QST". */
  label: string;
  /** `user_settings.gst_hst_registered`. Never inferred from `business_number`. */
  registered: boolean;
  /** `user_settings.brokerage_withholds_hst`. */
  brokerageWithholds: boolean;
  /** `computeHSTCollected(...)` (hst-engine): 0 unless registered and not held back. */
  collectedYTD: number;
  ytdGCI: number;
  /**
   * How many of the year's deals carry the HST their commission statement
   * shows (transactions.commission_hst). Omitted or 0: all estimated.
   */
  statementDeals?: number;
}

/**
 * The GST/HST note under the report's tax figures. Three readers, three notes:
 *
 *   not registered            → no amount; the CRA rule on when registration is required
 *   registered                → the estimate and the GCI it is on
 *   registered, tax held back → why the report counts none (the brokerage remits it)
 *
 * `collectedYTD` is 0 for the first and third reader, so one sentence built
 * around that amount misleads both of them.
 */
export function gstHstReportNote(input: GstHstReportNoteInput): TaxCopy {
  const { label, registered, brokerageWithholds, collectedYTD, ytdGCI, statementDeals = 0 } = input;

  if (!registered) {
    return asTaxCopy(
      `${label}: your Settings show no ${label} registration, so this report counts no ${label} on your commissions. ${SMALL_SUPPLIER_RULE}`,
    );
  }

  if (brokerageWithholds) {
    return asTaxCopy(
      `${label}: your Settings show your brokerage holds back ${label} from your commission cheques and remits it to CRA, so this report counts none in your hands on YTD GCI of ${fmtCurrency(ytdGCI)}.`,
    );
  }

  const fromStatements = statementDeals > 0
    ? ` For ${statementDeals} deal${statementDeals === 1 ? "" : "s"}, it is the ${label} your commission statement shows; the rest are at the rate on the full commission.`
    : "";
  return asTaxCopy(
    `${label} estimate: ${fmtCurrency(collectedYTD)} collected on YTD GCI of ${fmtCurrency(ytdGCI)}.${fromStatements} ${INPUT_TAX_CREDIT_NOTE}`,
  );
}

// ─────────────────────────────────────────────────────────────────────────
// GST/HST rate by province
// ─────────────────────────────────────────────────────────────────────────

/**
 * Which GST/HST rate applies where.
 *
 * Sources:
 *   canada.ca, "Charge and collect the GST/HST", "Which rate to charge"
 *     canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/charge-collect-which-rate.html
 *     (page dated 2026-04-08, read 2026-10-13)
 *     "The rate of tax to charge depends on the place of supply." "The rate
 *     for other taxable supplies depends on the province or territory."
 *   canada.ca, "GST/HST calculator (and rates)", table "GST/HST and PST rates"
 *     canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/charge-collect-which-rate/calculator.html
 *     (date modified 2025-04-01, read 2026-10-13)
 *     Ontario 13%. Nova Scotia 14% (15% before April 1, 2025). New Brunswick,
 *     Newfoundland and Labrador and Prince Edward Island 15%. 5% everywhere
 *     else.
 *
 * No rate is typed here. Each one is the engine's (`gstHstRate`), so the
 * copy and the figures the app works out cannot disagree. Public pages used
 * to type them and got them wrong: "In most provinces, you charge 13% HST"
 * (13% is Ontario only), "in the Maritimes, 15%" and a rate table with Nova
 * Scotia at 15%.
 *
 * GST/HST only. Quebec's QST and the PST in other provinces are provincial
 * taxes. The engine's Quebec rate is GST plus QST, so Quebec sits in neither
 * group below and the rule sentence gives it the GST rate, as CRA's table does.
 */
export interface GstHstRateGroup {
  tax: "HST" | "GST";
  /** `gstHstRate(province)`, the same for every province in the group. */
  rate: number;
  /** "14%" */
  percent: string;
  provinces: readonly Province[];
  /** "New Brunswick, Newfoundland and Labrador and Prince Edward Island" */
  names: string;
  /** "NB, NL, PE" */
  codes: string;
}

const PROVINCES = Object.keys(PROVINCE_LABELS).filter(
  (key): key is Province => key in PROVINCE_LABELS,
);

/** "A", "A and B", "A, B and C" */
function proseList(items: readonly string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** A province's name inside a sentence: "Newfoundland and Labrador". */
function provinceName(province: Province): string {
  return PROVINCE_LABELS[province].replace(" & ", " and ");
}

/** "14%", "14.975%" */
export function fmtGstHstRate(rate: number): string {
  return `${Number((rate * 100).toFixed(3))}%`;
}

/** The engine's rate on a commission in one province, as it prints: "14%". */
export function gstHstRatePercent(province: Province): string {
  return fmtGstHstRate(gstHstRate(province));
}

function rateGroups(tax: "HST" | "GST"): GstHstRateGroup[] {
  const byRate = new Map<number, Province[]>();
  for (const province of PROVINCES) {
    if (gstHstLabel(province) !== tax) continue;
    const rate = gstHstRate(province);
    byRate.set(rate, [...(byRate.get(rate) ?? []), province]);
  }
  return [...byRate.entries()]
    .sort(([a], [b]) => a - b)
    .map(([rate, provinces]) => ({
      tax,
      rate,
      percent: fmtGstHstRate(rate),
      provinces,
      names: proseList(provinces.map(provinceName)),
      codes: provinces.map((p) => PROVINCE_ISO_CODES[p]).join(", "),
    }));
}

/** The HST provinces, grouped by rate, lowest rate first. */
export const HST_RATE_GROUPS: readonly GstHstRateGroup[] = rateGroups("HST");

/** The provinces and territories with GST and no HST or QST. One group. */
export const GST_RATE_GROUP: GstHstRateGroup = rateGroups("GST")[0];

/** The rule and every rate, in one sentence. */
export const GST_HST_RATE_RULE: TaxCopy = asTaxCopy(
  `Per CRA, the GST/HST rate to charge depends on the province or territory where the supply is made: ${HST_RATE_GROUPS.map((g) => `${g.percent} HST in ${g.names}`).join(", ")}, and ${GST_RATE_GROUP.percent} GST in the other provinces and territories.`,
);

// ─────────────────────────────────────────────────────────────────────────
// Input tax credits
// ─────────────────────────────────────────────────────────────────────────

/**
 * Source: canada.ca, "Input tax credits"
 *   canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/complete-file-input-tax-credit.html
 *   (page dated 2024-11-19, read 2026-10-13)
 *
 * CRA: "As a GST/HST registrant, you recover the GST/HST paid or payable on
 * your purchases and expenses related to your commercial activities by
 * claiming input tax credits (ITCs) on line 106." One of CRA's conditions:
 * "You obtain sufficient documentary evidence to substantiate the ITC prior
 * to making the claim in a GST/HST return."
 *
 * A blog post used to put this as "you're leaving ITCs on the table and
 * paying more HST than you need to".
 */
export const INPUT_TAX_CREDIT_RULE: TaxCopy = asTaxCopy(
  "Per CRA, a GST/HST registrant recovers the GST/HST paid or payable on purchases and expenses related to commercial activities by claiming input tax credits (ITCs) on the GST/HST return.",
);

/** CRA's records condition for an ITC. */
export const INPUT_TAX_CREDIT_EVIDENCE_RULE: TaxCopy = asTaxCopy(
  "Per CRA, one condition for claiming an ITC is having sufficient documentary evidence to substantiate it before the claim is made on a return.",
);

/** What ITCs do to the amount remitted. Also the last sentence of the report's GST/HST note. */
export const INPUT_TAX_CREDIT_NOTE: TaxCopy = asTaxCopy(
  "Input tax credits on eligible business expenses may reduce the amount remitted to CRA.",
);

/** The CRA pages the GST/HST rules above come from, for a citation or a link. */
export const CRA_GST_HST_SOURCES = {
  whenToRegister: {
    label: "CRA: When to register for and start charging the GST/HST",
    url: "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/when-register-charge.html",
  },
  whichRate: {
    label: "CRA: Charge and collect the GST/HST, which rate to charge",
    url: "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/charge-collect-which-rate.html",
  },
  rates: {
    label: "CRA: GST/HST calculator (and rates)",
    url: "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/charge-collect-which-rate/calculator.html",
  },
  inputTaxCredits: {
    label: "CRA: Input tax credits",
    url: "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/complete-file-input-tax-credit.html",
  },
} as const;

// ─────────────────────────────────────────────────────────────────────────
// GST/HST collected is held in trust
// ─────────────────────────────────────────────────────────────────────────

/**
 * Source: Excise Tax Act, s. 222(1), "Trust for amounts collected"
 *   laws-lois.justice.gc.ca/eng/acts/E-15/section-222.html
 *   (Act current to 2026-09-21, read 2026-10-13)
 *
 * A person who collects an amount as or on account of GST/HST "is deemed" to
 * hold it in trust for the Crown until it is remitted, or withdrawn under
 * s. 222(2). The Forecast page used to put this as an instruction: "it's the
 * government's, not yours".
 */
export const GST_HST_TRUST_RULE: TaxCopy = asTaxCopy(
  "Per the Excise Tax Act, s. 222(1), GST/HST collected is deemed held in trust for the Crown until it is remitted.",
);

// ─────────────────────────────────────────────────────────────────────────
// "Does your brokerage withhold HST?" (Settings and onboarding)
// ─────────────────────────────────────────────────────────────────────────

/**
 * The question and its two answers, worded once for every screen that asks.
 * The answer is saved as `user_settings.brokerage_withholds_hst`.
 */
export const BROKERAGE_HST_WITHHOLDING = {
  question: asTaxCopy("Does your brokerage withhold HST from your commission cheques?"),
  no: asTaxCopy("No, I receive the full amount"),
  yes: asTaxCopy("Yes, they hold and remit it"),
} as const;

/**
 * The line under the answers. It says what the app does with the answer and
 * nothing about what the agent does with the money.
 *
 *   yes → `computeHSTCollected` (hst-engine) returns 0, so the dashboard,
 *         forecast, reports, deal-close screen, Flight Crew and MCP count no
 *         HST collected by the agent, and the cash position
 *         (cash-position-engine) takes none off.
 *   no  → HST rate × GCI, and only for a registrant (`gst_hst_registered`).
 *         A non-registrant gets 0 either way.
 *
 * The HST return (gst34-engine) and the T2125's GST/HST section
 * (t2125-engine) do not read the setting: both show the tax on commissions
 * whatever the answer. The "yes" line says so, because a reader who has just
 * been told the app counts none will see an amount there.
 */
export function brokerageHstWithholdingHint(withholds: boolean): TaxCopy {
  return asTaxCopy(
    withholds
      ? "The app counts no HST in your hands, because your brokerage remits it to CRA. The HST return and T2125 views do not use this answer."
      : "If your account is marked GST/HST registered, the app estimates the HST on your commissions as collected by you.",
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Income tax instalment due dates
// ─────────────────────────────────────────────────────────────────────────

/**
 * CRA's instalment payment due dates for individuals, by quarter.
 *
 * Source: canada.ca, "Payment due dates - Required tax instalments for individuals"
 *   canada.ca/en/revenue-agency/services/payments/payments-cra/individual-payments/income-tax-instalments/due-dates.html
 *   (page dated 2026-01-20, read 2026-10-13)
 *
 * These are NOT the GST/HST quarterly filing dates (April 30, July 31,
 * October 31, January 31: filing-period-engine.ts). A date that falls on a
 * weekend or public holiday moves to the next business day. Farmers and
 * fishers have a single date, December 31, which the app does not model.
 */
export const INCOME_TAX_INSTALMENT_DUE_DATES = [
  { quarter: 1, long: "March 15", short: "Mar 15" },
  { quarter: 2, long: "June 15", short: "Jun 15" },
  { quarter: 3, long: "September 15", short: "Sep 15" },
  { quarter: 4, long: "December 15", short: "Dec 15" },
] as const;

const [Q1_DUE, Q2_DUE, Q3_DUE, Q4_DUE] = INCOME_TAX_INSTALMENT_DUE_DATES;

/** One sentence carrying the four dates above. */
export const INSTALMENT_DUE_DATES_RULE: TaxCopy = asTaxCopy(
  `Per CRA, instalment payments for individuals are due ${Q1_DUE.long}, ${Q2_DUE.long}, ${Q3_DUE.long} and ${Q4_DUE.long}.`,
);

// ─────────────────────────────────────────────────────────────────────────
// Income tax instalments: who pays, and interest
// ─────────────────────────────────────────────────────────────────────────

/**
 * CRA's net tax owing limits for instalments.
 *
 * Source: canada.ca, "Who has to pay tax instalments"
 *   canada.ca/en/revenue-agency/services/payments/payments-cra/individual-payments/income-tax-instalments/who-pays-instalments.html
 *   (page dated 2026-01-20, read 2026-10-13)
 *
 * CRA's test has two parts and both have to hold: "You have to pay your
 * income tax by instalments for 2026 if both apply", net tax owing over the
 * limit in 2026, and over it in either 2025 or 2024. Over the limit in one
 * year alone does not meet it. The province is the one lived in on
 * December 31.
 */
export const INSTALMENT_NET_TAX_OWING_LIMIT = 3_000;
export const INSTALMENT_NET_TAX_OWING_LIMIT_QUEBEC = 1_800;

/** Who pays by instalments. */
export const INSTALMENT_REQUIREMENT_RULE: TaxCopy = asTaxCopy(
  `Per CRA, income tax is paid by instalments for a year when net tax owing is more than ${fmtCurrency(INSTALMENT_NET_TAX_OWING_LIMIT)} (${fmtCurrency(INSTALMENT_NET_TAX_OWING_LIMIT_QUEBEC)} for Quebec residents) in that year and in either of the two years before it.`,
);

/**
 * Why instalments reach a self-employed agent. Same CRA page: "You may have
 * to pay tax by instalments if your income does not have enough tax
 * withheld", with self-employment first on its list.
 */
export const INSTALMENT_WITHHOLDING_RULE: TaxCopy = asTaxCopy(
  "Per CRA, tax instalments may apply when income does not have enough tax withheld, as with self-employment income.",
);

/**
 * Source: canada.ca, "Interest and penalty charges" (tax instalments)
 *   canada.ca/en/revenue-agency/services/payments/payments-cra/individual-payments/income-tax-instalments/interest-penalty-charges.html
 *   (page dated 2026-01-20, read 2026-10-13)
 *
 * CRA: "The CRA charges instalment interest on all late or insufficient
 * instalment payments." "Instalment interest is compounded daily at the
 * prescribed interest rate". A penalty is separate and applies only when the
 * instalment interest for the year is more than $1,000.
 */
export const INSTALMENT_INTEREST_RULE: TaxCopy = asTaxCopy(
  "Per CRA, instalment interest is charged on all late or insufficient instalment payments, compounded daily at the prescribed interest rate.",
);

/**
 * Same CRA page, "How your interest rate is calculated": "Interest is
 * calculated from the day it was due to your balance due date, based on the
 * payment calculation option that results in the least amount of interest."
 */
export const INSTALMENT_INTEREST_LEAST_RULE: TaxCopy = asTaxCopy(
  "Per CRA, interest on each instalment payment that was due is calculated from the day it was due to the balance due date, based on the payment calculation option that results in the least amount of interest.",
);

/**
 * Same CRA page, "Instalment penalty": "You may have to pay a penalty if your
 * instalment payments are late or less than the required amount. The CRA
 * applies this penalty only if your instalment interest charges for 2026 are
 * more than $1,000."
 */
export const INSTALMENT_PENALTY_INTEREST_FLOOR = 1_000;

export const INSTALMENT_PENALTY_RULE: TaxCopy = asTaxCopy(
  `Per CRA, a penalty may also apply when instalment payments are late or less than the required amount, and only if instalment interest charges for the year are more than ${fmtCurrency(INSTALMENT_PENALTY_INTEREST_FLOOR)}.`,
);

// ─────────────────────────────────────────────────────────────────────────
// Income tax instalments: the three options to calculate
// ─────────────────────────────────────────────────────────────────────────

/**
 * CRA's three options to calculate instalment payments.
 *
 * Source: canada.ca, "Options to calculate - Required tax instalments for individuals"
 *   canada.ca/en/revenue-agency/services/payments/payments-cra/individual-payments/income-tax-instalments/options-calculate.html
 *   (page dated 2026-01-20, read 2026-10-13)
 *
 * CRA says how each option is worked out and which situation each "is best"
 * for, in the same form for all three. It does not put one above the others,
 * and neither does this. Public pages used to: "The most effective planning
 * approach for agents with variable income is the current-year method", "Most
 * agents use the no-calculation option", "whichever minimizes your amount".
 *
 * CRA's page names the years (2026, 2025, 2024). The wording here goes by
 * position, so it does not go stale each January.
 */
export const INSTALMENT_OPTIONS = {
  noCalculation: {
    name: "No-calculation option",
    how: asTaxCopy(
      "Per CRA, under the no-calculation option the CRA determines the instalment amounts from the latest assessed tax return and shows them on the instalment reminders it sends.",
    ),
    bestIf: asTaxCopy(
      "Per CRA, this option is best if income, deductions and credits stay about the same from year to year.",
    ),
  },
  priorYear: {
    name: "Prior-year option",
    how: asTaxCopy(
      "Per CRA, under the prior-year option the payer determines the instalment amounts from the tax return for the year before.",
    ),
    bestIf: asTaxCopy(
      "Per CRA, this option is best if the year's income, deductions and credits will be similar to those of the year before but significantly different from those of two years before.",
    ),
  },
  currentYear: {
    name: "Current-year option",
    how: asTaxCopy(
      "Per CRA, under the current-year option the payer determines the instalment amounts from an estimate of the current year's net tax owing, CPP contributions payable and voluntary EI premiums.",
    ),
    bestIf: asTaxCopy(
      "Per CRA, this option is best if the year's income, deductions and credits will be significantly different from those of the two years before.",
    ),
  },
} as const;

/**
 * Source: canada.ca, "Who has to pay tax instalments", "Receiving an instalment reminder"
 *   canada.ca/en/revenue-agency/services/payments/payments-cra/individual-payments/income-tax-instalments/who-pays-instalments.html
 *   (page dated 2026-01-20, read 2026-10-13)
 *
 * CRA: "The reminders suggest the amount to pay and lists the calculation
 * options." "February reminder is for the March and June payments", "August
 * reminder is for the September and December payments".
 */
export const INSTALMENT_REMINDERS_RULE: TaxCopy = asTaxCopy(
  "Per CRA, the instalment reminders give the amount to pay and list the calculation options: the February reminder is for the March and June payments, and the August reminder is for the September and December payments.",
);

/** The three options, in CRA's order, for a list. */
export const INSTALMENT_OPTION_LIST = [
  INSTALMENT_OPTIONS.noCalculation,
  INSTALMENT_OPTIONS.priorYear,
  INSTALMENT_OPTIONS.currentYear,
] as const;

/** One sentence naming the three. */
export const INSTALMENT_OPTIONS_RULE: TaxCopy = asTaxCopy(
  "Per CRA, there are three options to calculate instalment payments: the no-calculation option, the prior-year option and the current-year option.",
);

/**
 * Same CRA page. Under the prior-year option and again under the current-year
 * option: "If you make your payments in full by the 2026 due dates, the CRA
 * will not charge instalment interest or a penalty, unless your estimated
 * instalment amounts are too low." The page has no such sentence under the
 * no-calculation option, so this names the two it is written under. Public
 * pages used to drop the condition: "Following this option exactly eliminates
 * instalment-interest risk even if income grows".
 */
export const INSTALMENT_OPTION_INTEREST_RULE: TaxCopy = asTaxCopy(
  "Per CRA, under the prior-year option and the current-year option, payments made in full by the due dates are not charged instalment interest or a penalty unless the estimated instalment amounts are too low.",
);

/**
 * Agent Runway's part, as fact. `quarterlyEstimate` (canadian-tax-engine) is
 * `totalBurden` / 4, and `totalBurden` is federal tax + provincial tax +
 * CPP/QPP on the net business income the engine is given. It is an estimate
 * of the current year's tax, the kind of figure CRA's current-year option is
 * calculated from. It is not CRA's net tax owing: the engine counts no other
 * income, no tax withheld and no credits beyond the basic personal amounts
 * and CPP.
 */
export const INSTALMENT_ENGINE_ESTIMATE: TaxCopy = asTaxCopy(
  "Agent Runway's quarterly figure is one quarter of its tax engine's estimate for the current year: federal income tax, provincial income tax and CPP contributions (QPP in Quebec) on projected net business income. An estimate of the current year's tax is what CRA's current-year option is calculated from. The engine counts self-employment income only, so its figure is not CRA's net tax owing for a person with other income, tax withheld at source or other credits.",
);

// ─────────────────────────────────────────────────────────────────────────
// Business expenses: what is deductible, meals, capital property
// ─────────────────────────────────────────────────────────────────────────

/**
 * Source: canada.ca, "Expenses section of Form T2125"
 *   canada.ca/en/revenue-agency/services/tax/businesses/topics/sole-proprietorships-partnerships/report-business-income-expenses/completing-form-t2125/expenses-section-form-t2125.html
 *   (page dated 2026-08-31, read 2026-10-13)
 *
 * CRA: "Generally, you can deduct any reasonable current expense you incur to
 * earn business income." "However, since you cannot deduct personal expenses,
 * enter only the business part of expenses on the Form T2125".
 */
export const BUSINESS_EXPENSE_RULE: TaxCopy = asTaxCopy(
  "Per CRA, any reasonable current expense incurred to earn business income is generally deductible.",
);

/** Same CRA page, the sentence after it. */
export const PERSONAL_EXPENSE_RULE: TaxCopy = asTaxCopy(
  "Per CRA, personal expenses are not deductible, so only the business part of an expense is entered on Form T2125.",
);

/**
 * Source: canada.ca, Guide T4002, Chapter 3, "Line 8523 - Meals and entertainment"
 *   canada.ca/en/revenue-agency/services/forms-publications/publications/t4002/t4002-5.html
 *   (page dated 2026-04-16, read 2026-10-13)
 *
 * CRA: "The maximum amount you can claim for food, beverages, and
 * entertainment expenses is 50% of the lesser of the following amounts: the
 * amount incurred for these expenses; an amount that is reasonable in the
 * circumstances". CRA lists cases where the limit does not apply, such as a
 * meal billed to a client and shown on the bill.
 */
export const MEALS_ENTERTAINMENT_RULE: TaxCopy = asTaxCopy(
  "Per CRA, the maximum claim for food, beverages and entertainment expenses is 50% of the lesser of the amount incurred and an amount that is reasonable in the circumstances. CRA lists cases where that limit does not apply.",
);

/**
 * Source: canada.ca, "Line 9936 - Capital cost allowance (CCA)"
 *   canada.ca/en/revenue-agency/services/tax/businesses/topics/sole-proprietorships-partnerships/report-business-income-expenses/completing-form-t2125/line-9936-capital-cost-allowance.html
 *   (page dated 2026-08-31, read 2026-10-13)
 *
 * CRA: "You cannot deduct the cost of the property when you calculate your
 * net business or professional income for the year. However, since these
 * properties wear out or become obsolete over time, you can deduct their cost
 * over a period of several years. This deduction is called capital cost
 * allowance (CCA)."
 */
export const CAPITAL_COST_ALLOWANCE_RULE: TaxCopy = asTaxCopy(
  "Per CRA, the cost of depreciable property, such as a building, furniture, a motor vehicle or equipment, is not deducted as an expense when net business income for the year is calculated. The cost is deducted over a period of several years as capital cost allowance (CCA).",
);

// ─────────────────────────────────────────────────────────────────────────
// Motor vehicles: the logbook, CRA's simplified logbook, the business part
// ─────────────────────────────────────────────────────────────────────────

/**
 * Source: canada.ca, "Motor vehicle records" (sole proprietorships and
 * partnerships, business expenses, motor vehicle expenses)
 *   canada.ca/en/revenue-agency/services/tax/businesses/topics/sole-proprietorships-partnerships/business-expenses/motor-vehicle-expenses/motor-vehicle-records.html
 *   (page dated 2026-08-31, read 2026-10-18)
 *
 * Full logbook. CRA: "The best evidence to support the use of a vehicle is an
 * accurate logbook of business travel maintained for the entire year". "For
 * each business trip, keep a log listing the following: date, destination,
 * purpose, number of kilometres you drive". "Record the odometer reading of
 * each vehicle at the start and end of the fiscal period." "If you change
 * motor vehicles during the fiscal period, record the dates of the changes
 * and the odometer reading when you buy, sell, or trade the vehicle."
 *
 * Simplified logbook. CRA: "You can choose to maintain a full logbook for one
 * complete year to establish a base year's business use of a vehicle."
 * "After one complete year of keeping a logbook to establish the base year,
 * you can use a three-month sample logbook to foresee business use for the
 * entire year, as long as the usage is within the same range (within 10%) of
 * the results of the base year." The formula, verbatim:
 * "(Sample year period % ÷ Base year period %) × Base year annual % =
 * Calculated annual business use". Outside the range: "the base year is not
 * an appropriate indicator of annual usage in that later year. In this case,
 * the sample period logbook would only be reliable for the three-month
 * period it had been maintained. For the remainder of the year, the business
 * use of the vehicle would need to be determined based on an actual record of
 * travel or alternative records".
 *
 * The example: quarters of 52/46/39/67 and 49% for the base year; an April to
 * June sample of 51% against 46% for those months in the base year;
 * "(51% ÷ 46%) × 49% = 54%", accepted "in the absence of contradictory
 * evidence" because "the calculated annual business use is within 10% of the
 * annual business use in the base year – it is not lower than 39% or higher
 * than 59%". So "within 10%" is 10 percentage points either side of the base
 * year's annual figure, both ends included (`SIMPLIFIED_LOGBOOK_RANGE` in
 * engines/vehicle-logbook-engine.ts).
 *
 * Keeping it: records "for a period of six years from the end of the tax year
 * to which they relate"; the 12-month logbook "for a period of six years from
 * the end of the tax year for which it is last used to establish business
 * use". Several vehicles: "keep a separate record for each vehicle that shows
 * the total and business kilometres you drive, and the cost to run and
 * maintain each vehicle. Calculate each vehicle's expenses separately."
 *
 * CRA's sentences say "keep", "record" and "should consider"; the copy below
 * states the same rules without them (the info-not-advice lint).
 */
export const CRA_MOTOR_VEHICLE_SOURCES = {
  records: {
    label: "CRA: Motor vehicle records",
    url: "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/sole-proprietorships-partnerships/business-expenses/motor-vehicle-expenses/motor-vehicle-records.html",
  },
  businessPart: {
    label: "CRA: Motor vehicle expenses (not including CCA)",
    url: "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/sole-proprietorships-partnerships/report-business-income-expenses/completing-form-t2125/motor-vehicle-expenses-including.html",
  },
  allowanceRates: {
    label: "CRA: Automobile and motor vehicle allowances, reasonable per-kilometre rates",
    url: "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/payroll/benefits-allowances/automobile/automobile-motor-vehicle-allowances.html",
  },
} as const;

/** What a full logbook holds, per CRA. */
export const VEHICLE_LOGBOOK_RULE: TaxCopy = asTaxCopy(
  "Per CRA, the best evidence of a vehicle's business use is a logbook of business travel kept for the entire year. For each business trip it lists the date, destination, purpose and kilometres driven, and it has each vehicle's odometer reading at the start and end of the fiscal period. When a vehicle is bought, sold or traded during the period, the logbook has the date and the odometer reading of the change.",
);

/** CRA's simplified logbook, in one paragraph. */
export const SIMPLIFIED_LOGBOOK_RULE: TaxCopy = asTaxCopy(
  "Per CRA, a full logbook kept for one complete year establishes a base year. After it, a three-month sample logbook can be used for a later year's business use, as long as the usage is within the same range (within 10%) of the base year's results and the base year remains representative of the vehicle's normal use.",
);

/** CRA's formula, as CRA prints it. */
export const SIMPLIFIED_LOGBOOK_FORMULA =
  "(Sample year period % ÷ Base year period %) × Base year annual % = Calculated annual business use";

/** What "within 10%" means, from CRA's own example. */
export const SIMPLIFIED_LOGBOOK_RANGE_RULE: TaxCopy = asTaxCopy(
  "In CRA's example, within 10% means the calculated annual business use is no more than 10 percentage points above or below the base year's annual business use: for a 49% base year, not lower than 39% or higher than 59%.",
);

/** When the calculated figure is outside the range. */
export const SIMPLIFIED_LOGBOOK_OUTSIDE_RANGE_RULE: TaxCopy = asTaxCopy(
  "Per CRA, when the calculated annual business use goes up or down by more than 10%, the base year is not an appropriate indicator for that later year. The sample logbook is then reliable only for its own three months, and business use for the rest of the year comes from an actual record of travel or other records. CRA notes that a new base year can be established with a logbook for a new 12-month period.",
);

/** CRA's worked example. */
export const SIMPLIFIED_LOGBOOK_EXAMPLE: TaxCopy = asTaxCopy(
  "CRA's example: a base-year logbook showed 49% business use for the year and 46% for April to June. A later year's April to June sample showed 51%. (51% ÷ 46%) × 49% = 54%, which CRA would accept in the absence of contradictory evidence because it is within 10% of the base year's 49%.",
);

/** How long the logbook is kept. */
export const VEHICLE_LOGBOOK_RETENTION_RULE: TaxCopy = asTaxCopy(
  "Per CRA, records are generally kept for six years from the end of the tax year they relate to. The full 12-month base-year logbook is kept for six years from the end of the last tax year it is used to establish business use for.",
);

/** Several vehicles. */
export const MULTIPLE_VEHICLES_RULE: TaxCopy = asTaxCopy(
  "Per CRA, a business that uses more than one vehicle has a separate record for each, showing the total and business kilometres driven and the cost to run and maintain it, and each vehicle's expenses are calculated separately.",
);

/**
 * Source: canada.ca, "Motor vehicle expenses (not including CCA)" (completing
 * Form T2125), page dated 2026-08-31, read 2026-10-18. CRA: "If you use a
 * motor vehicle or passenger vehicle for business and personal use, you can
 * deduct only the part of the expenses that you paid to earn income." "To
 * support the amount you can deduct, keep a record of the total kilometres
 * you drive and the kilometres you drive to earn income." The same page lets
 * business parking fees and supplementary business insurance be deducted in
 * full: VEHICLE_FULL_DEDUCTION_RULE below, printed with this one.
 */
export const VEHICLE_BUSINESS_PART_RULE: TaxCopy = asTaxCopy(
  "Per CRA, when a vehicle is used for business and personal driving, only the part of its expenses paid to earn income is deductible, supported by a record of the total kilometres driven and the kilometres driven to earn income.",
);

/**
 * Source: the same canada.ca page as VEHICLE_BUSINESS_PART_RULE ("Motor
 * vehicle expenses (not including CCA)", page dated 2026-08-31, read
 * 2026-10-19): "However, you can deduct the full amount of parking fees
 * related to your business activities and supplementary business insurance
 * for your motor vehicle or passenger vehicle." Agent Runway follows it since
 * 2026-10-19: the Vehicle items Business Parking and Supplementary Business
 * Insurance go on line 9281 in full (VEHICLE_FULL_DEDUCTION_KEYS in
 * engines/t2125-engine.ts). Until then parking was filed under Service &
 * Repairs and took the business-use share.
 */
export const VEHICLE_FULL_DEDUCTION_RULE: TaxCopy = asTaxCopy(
  "Per CRA, parking fees related to business activities and supplementary business insurance for the vehicle are deductible in full, not by the business-use share.",
);

/**
 * CRA's reasonable per-kilometre allowance rates, by year.
 *
 * Source: canada.ca, "Automobile or motor vehicle benefits – Allowances or
 * reimbursements provided to an employee for the use of their own vehicle",
 * table "What are the reasonable prescribed allowance per-kilometre rates"
 * (read 2026-10-18). The 2026 row matches the Department of Finance news
 * release of 2026-01-14 ("73 cents per kilometre for the first 5,000
 * kilometres driven, and to 67 cents for each additional kilometre"; 77 and
 * 71 cents in the territories).
 *
 * These are what an EMPLOYER can pay an EMPLOYEE as a reasonable allowance.
 * They are not how a self-employed agent's motor vehicle expenses are
 * deducted on Form T2125 (actual costs, business part: VEHICLE_BUSINESS_PART_RULE).
 * Until 2026-10-18 the app labelled km × these rates as a deduction and
 * held 2025's rates in `CRA_MILEAGE_RATES` while labelling them with the
 * current year.
 */
export interface AllowanceRates {
  /** The year CRA published these rates for. */
  readonly year: number;
  /** $ per km for the first 5,000 km, provinces. */
  readonly first5000: number;
  /** $ per km after 5,000 km, provinces. */
  readonly beyond5000: number;
  /** $ per km for the first 5,000 km, territories. */
  readonly first5000Territories: number;
  /** $ per km after 5,000 km, territories. */
  readonly beyond5000Territories: number;
  /** The km where the lower rate starts. */
  readonly threshold: number;
}

const rates = (year: number, p1: number, p2: number, t1: number, t2: number): AllowanceRates =>
  ({ year, first5000: p1, beyond5000: p2, first5000Territories: t1, beyond5000Territories: t2, threshold: 5_000 });

/** CRA's table, newest first. Add a row when CRA publishes the next year's rates. */
export const CRA_ALLOWANCE_RATES: readonly AllowanceRates[] = [
  rates(2026, 0.73, 0.67, 0.77, 0.71),
  rates(2025, 0.72, 0.66, 0.76, 0.70),
  rates(2024, 0.70, 0.64, 0.74, 0.68),
  rates(2023, 0.68, 0.62, 0.72, 0.66),
  rates(2022, 0.61, 0.55, 0.65, 0.59),
];

/**
 * The rates CRA published for `year`; for a year it has not published yet,
 * the latest year's (exactYear false), and for a year before the table, the
 * oldest row's. A label citing a year prints `rates.year`, never `year`.
 */
export function craAllowanceRates(year: number): { rates: AllowanceRates; exactYear: boolean } {
  const exact = CRA_ALLOWANCE_RATES.find((r) => r.year === year);
  if (exact) return { rates: exact, exactYear: true };
  const latest = CRA_ALLOWANCE_RATES[0];
  if (year > latest.year) return { rates: latest, exactYear: false };
  return { rates: CRA_ALLOWANCE_RATES[CRA_ALLOWANCE_RATES.length - 1], exactYear: false };
}

/** "$0.73/km for the first 5,000 km and $0.67/km after (CRA's 2026 rates)". */
export function allowanceRatesSentence(year: number): string {
  const { rates: r } = craAllowanceRates(year);
  return `$${r.first5000.toFixed(2)}/km for the first ${r.threshold.toLocaleString("en-CA")} km and $${r.beyond5000.toFixed(2)}/km after (CRA's ${r.year} rates for the provinces)`;
}

/** What a km × rate figure is, and what it is not. */
export const ALLOWANCE_RATE_NOTE: TaxCopy = asTaxCopy(
  "CRA's per-kilometre rates are the reasonable allowance an employer can pay an employee for driving the employee's own vehicle. A km × rate figure is that benchmark. It is not the T2125 motor vehicle deduction, which is the business part of the vehicle's actual expenses (fuel, insurance, maintenance, lease or capital cost allowance).",
);

/** The CRA pages the instalment rules above come from, for a citation or a link. */
export const CRA_INSTALMENT_SOURCES = {
  whoPays: {
    label: "CRA: Required tax instalments for individuals, who has to pay",
    url: "https://www.canada.ca/en/revenue-agency/services/payments/payments-cra/individual-payments/income-tax-instalments/who-pays-instalments.html",
  },
  dueDates: {
    label: "CRA: Required tax instalments for individuals, payment due dates",
    url: "https://www.canada.ca/en/revenue-agency/services/payments/payments-cra/individual-payments/income-tax-instalments/due-dates.html",
  },
  options: {
    label: "CRA: Required tax instalments for individuals, options to calculate",
    url: "https://www.canada.ca/en/revenue-agency/services/payments/payments-cra/individual-payments/income-tax-instalments/options-calculate.html",
  },
  interest: {
    label: "CRA: Required tax instalments for individuals, interest and penalty charges",
    url: "https://www.canada.ca/en/revenue-agency/services/payments/payments-cra/individual-payments/income-tax-instalments/interest-penalty-charges.html",
  },
} as const;

// ─────────────────────────────────────────────────────────────────────────
// Reporting commission income: the cash method or the accrual method
// ─────────────────────────────────────────────────────────────────────────

/**
 * Who can use which method, what each means, and how to change.
 *
 * Sources:
 *   Guide T4002, "Self-employed Business, Professional, Commission, Farming,
 *   and Fishing Income", T4002(E) Rev. 25, Chapter 1, "Reporting methods"
 *   and "Changing your method of reporting income"
 *     canada.ca/en/revenue-agency/services/forms-publications/publications/t4002/t4002-3.html
 *     (page dated 2026-04-16, read 2026-10-14)
 *   canada.ca, "Accounting methods" (sole proprietorships and partnerships)
 *     canada.ca/en/revenue-agency/services/tax/businesses/topics/sole-proprietorships-partnerships/accounting-methods.html
 *     (page dated 2026-08-31, read 2026-10-14). The same rules.
 *
 * CRA: "Farmers, fishers, and self-employed commission agents can use the
 * cash method or the accrual method to report income. All other
 * self-employment income must be reported using the accrual method."
 * Cash method: "report income in the fiscal period you receive it" and
 * "deduct expenses in the fiscal period you pay them". Accrual method:
 * "report income in the fiscal period you earn it, no matter when you
 * receive it" and "deduct expenses in the fiscal period you incur them,
 * whether or not you pay them in that period".
 *
 * Changing: from accrual to cash, "use the cash method when you file your
 * next income tax return. Make sure you include a statement that shows each
 * adjustment made to your income and expenses because of the difference in
 * methods." From cash to accrual: "get permission from your tax services
 * office", "ask for this change in writing before the date you have to file
 * your income tax return", "explain why you want to change methods in your
 * letter", and the first return on the accrual method includes a statement
 * showing each adjustment.
 *
 * CRA's sentences say "must" and "make sure"; the copy states the same rules
 * without them (the info-not-advice lint). It names no method as better.
 */
export const INCOME_REPORTING_METHOD_RULES = {
  whoCanUse: asTaxCopy(
    "Per CRA, self-employed commission agents can use the cash method or the accrual method to report income. Other self-employment income, apart from farming and fishing, is reported using the accrual method.",
  ),
  cash: asTaxCopy(
    "Per CRA, under the cash method income is reported in the fiscal period it is received and expenses are deducted in the fiscal period they are paid.",
  ),
  accrual: asTaxCopy(
    "Per CRA, under the accrual method income is reported in the fiscal period it is earned, no matter when it is received, and expenses are deducted in the fiscal period they are incurred, whether or not they are paid in that period.",
  ),
  accrualToCash: asTaxCopy(
    "Per CRA, a change from the accrual method to the cash method starts with the next income tax return filed, which includes a statement showing each adjustment made to income and expenses because of the difference in methods.",
  ),
  cashToAccrual: asTaxCopy(
    "Per CRA, a change from the cash method to the accrual method takes permission from the tax services office, asked for in writing, with the reason for the change, before the date the income tax return is due. The first return filed on the accrual method includes a statement showing each adjustment made to income and expenses.",
  ),
} as const;

/** The rules above, in the order a reader meets them. */
export const INCOME_REPORTING_METHOD_RULE_LIST = [
  INCOME_REPORTING_METHOD_RULES.whoCanUse,
  INCOME_REPORTING_METHOD_RULES.cash,
  INCOME_REPORTING_METHOD_RULES.accrual,
  INCOME_REPORTING_METHOD_RULES.accrualToCash,
  INCOME_REPORTING_METHOD_RULES.cashToAccrual,
] as const;

/** The CRA pages the rules above come from, for a citation or a link. */
export const CRA_REPORTING_METHOD_SOURCES = {
  guide: {
    label: "CRA Guide T4002, Chapter 1: Reporting methods",
    url: "https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/t4002/t4002-3.html",
  },
  accountingMethods: {
    label: "CRA: Accounting methods",
    url: "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/sole-proprietorships-partnerships/accounting-methods.html",
  },
} as const;

/**
 * The Settings control and what the app does with each answer. The labels
 * are CRA's names for the methods; the hints describe Agent Runway, not CRA,
 * and are the only place that says which figures move.
 *
 * What moves: the year a deal's commission counts in for income tax (the tax
 * estimate, take-home, the per-deal tax portion, instalments, the T2125 view,
 * Flight Crew and the Claude connector's tax figures), read through
 * engines/tax-year.ts. What does not: deal counts, GCI by closing year, the
 * History tab, the Runway Score, pace and goals, GST/HST, and expenses
 * (already counted by the date on the receipt or the charge).
 */
export const INCOME_REPORTING_METHOD_SETTING = {
  label: "Income reporting method",
  options: {
    accrual: "Accrual method (the year the deal closes)",
    cash: "Cash method (the year the commission is paid)",
  } satisfies Record<IncomeReportingMethod, string>,
} as const;

/** The line under the Settings control, for the method chosen. */
export function incomeReportingMethodHint(method: IncomeReportingMethod): TaxCopy {
  if (method === "cash") {
    return asTaxCopy(
      "Agent Runway counts each deal's commission in the tax year of its Commission paid date, or of its closing date when that date is blank, for the income tax estimates, instalments and the T2125 view. Deal counts, GCI by year, History and the Runway Score stay on the closing date, and the GST/HST return follows its own setting below.",
    );
  }
  return asTaxCopy(
    "Agent Runway counts each deal's commission in the tax year it closes. Deal counts, GCI by year, History and the Runway Score use the closing date under either method, and the GST/HST return follows its own setting below.",
  );
}

/** The line under the transaction form's "Commission paid" date. */
export function commissionPaidDateHint(method: IncomeReportingMethod): TaxCopy {
  if (method === "cash") {
    return asTaxCopy(
      "Optional. Your Settings show the cash method, so the income tax estimates count this commission in the year it was paid. Left blank, it counts in the year the deal closed.",
    );
  }
  return asTaxCopy(
    "Optional. Your Settings show the accrual method, so the income tax estimates count this commission in the year the deal closed. The paid date is used only under the cash method (Settings, Tax Filing).",
  );
}

// ── GST/HST on commissions (2026-10-19) ──────────────────────────────────────

/**
 * When GST/HST on a commission is collectible. Source: CRA GST/HST
 * Memorandum 300-6, "Time of Liability" (ETA s.168(1), s.152(1)), read
 * 2026-10-19: tax is payable "on the earlier of the day that consideration
 * for a taxable supply is paid or the day that consideration becomes due";
 * consideration is deemed to become due on the earliest of the day the
 * first invoice is issued, the invoice date, the day an invoice would have
 * been issued but for undue delay, and the day payment is required under a
 * written agreement. Which of those applies to a commission depends on the
 * agent's agreement with the brokerage, so Agent Runway lets the agent pick
 * the date (engines/commission-hst-engine.ts) and never picks it.
 */
export const GST_HST_COMMISSION_TIMING_RULE: TaxCopy = asTaxCopy(
  "Per CRA, GST/HST on a supply is payable on the earlier of the day it is paid and the day it becomes due. Payment becomes due on the earliest of the invoice date, the day an invoice would have been issued without undue delay, and the day payment is required under a written agreement.",
);

/** The CRA page the rule above comes from. */
export const CRA_GST_HST_TIMING_SOURCE = {
  label: "CRA GST/HST Memorandum 300-6: Time of Liability",
  url: "https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/g300-6/time-liability-gst-300-6.html",
} as const;

/** The Settings control (Tax Filing): which date places a commission on a GST/HST return. */
export const GST_HST_COMMISSION_TIMING_SETTING = {
  label: "GST/HST return: place each commission by",
  options: {
    closing: "Its closing date",
    paid: "The date it was paid (the closing date when no paid date is entered)",
  } satisfies Record<GstHstCommissionTiming, string>,
} as const;

/** The line under that control, for the choice made. */
export function gstHstCommissionTimingHint(timing: GstHstCommissionTiming): TaxCopy {
  if (timing === "paid") {
    return asTaxCopy(
      "The GST/HST return card on Expenses places each commission in the period of its Commission paid date, or of its closing date when that date is blank. Which date matches your agreement with your brokerage is a question for your accountant.",
    );
  }
  return asTaxCopy(
    "The GST/HST return card on Expenses places each commission in the period of its closing date. Which date matches your agreement with your brokerage is a question for your accountant.",
  );
}

/** The line under the transaction form's "GST/HST paid to you" field. */
export const COMMISSION_HST_HINT: TaxCopy = asTaxCopy(
  "Optional. The GST/HST your brokerage's commission statement shows it paid you on this commission. Entered, it is this deal's GST/HST collected on the GST/HST return card and in the GST/HST figures. Blank, Agent Runway estimates it at your province's rate on the full commission; brokerages differ, and some charge it on your share after the split and fees.",
);
