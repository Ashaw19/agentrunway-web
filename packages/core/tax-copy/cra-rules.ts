// CRA rules the app prints in copy. Each is stated once, as CRA states it,
// with its source, so a PDF, a screen and the AI layer cannot drift apart.
//
// Reference: memory/feedback_tax_information_not_advice.md ("Surface
// published CRA rules: cite the source. Don't paraphrase loosely.")
//
// Every string built here goes through asTaxCopy(), so a forbidden verb is a
// failing test (__tests__/cra-rules.test.ts), not a shipped sentence.
//
// Not mirrored into the MCP edge function: no MCP tool prints these rules.

import { gstHstLabel, gstHstRate } from "../engines/canadian-tax-engine";
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
  const { label, registered, brokerageWithholds, collectedYTD, ytdGCI } = input;

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

  return asTaxCopy(
    `${label} estimate: ${fmtCurrency(collectedYTD)} collected on YTD GCI of ${fmtCurrency(ytdGCI)}. ${INPUT_TAX_CREDIT_NOTE}`,
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
