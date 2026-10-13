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

import { fmtCurrency } from "../formatters";
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
    `${label} estimate: ${fmtCurrency(collectedYTD)} collected on YTD GCI of ${fmtCurrency(ytdGCI)}. Input tax credits on eligible business expenses may reduce the amount remitted to CRA.`,
  );
}

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
  interest: {
    label: "CRA: Required tax instalments for individuals, interest and penalty charges",
    url: "https://www.canada.ca/en/revenue-agency/services/payments/payments-cra/individual-payments/income-tax-instalments/interest-penalty-charges.html",
  },
} as const;
