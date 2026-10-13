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
