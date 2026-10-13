/**
 * CRA rules printed in copy: stated as CRA states them, and never as advice.
 *
 * Reference: memory/feedback_tax_information_not_advice.md
 *
 * What these tests prove:
 *   1. The small supplier rule names what CRA measures (revenue from taxable
 *      supplies, before expenses) and both of CRA's periods (a single
 *      calendar quarter, four consecutive calendar quarters). The business
 *      report PDF used to print "if your annual income exceeds $30,000".
 *   2. The report's GST/HST note fits each of the three readers: not
 *      registered, registered, and registered with a brokerage that holds the
 *      tax back. The old note printed one sentence for all three, so a
 *      non-registrant read "$0 collected ... Keep a dedicated account for
 *      these funds".
 *   3. Every string passes the info-not-advice lint with no error.
 *   4. The income tax instalment dates are CRA's, not the GST/HST filing dates.
 *   5. The line under "Does your brokerage withhold HST?" says what the app
 *      does with the answer. It used to read "We won't include HST in your
 *      set-aside recommendations" and "We'll remind you to set it aside for
 *      CRA".
 *   6. The instalment rules carry both halves of CRA's test (this year, and
 *      either of the two before it), the Quebec limit, and interest on late or
 *      insufficient payments. Public pages used to say instalments apply to
 *      anyone who "expects to owe more than $3,000 in tax for a given year".
 */

import { describe, it, expect } from "vitest";
import {
  SMALL_SUPPLIER_LIMIT,
  SMALL_SUPPLIER_RULE,
  SMALL_SUPPLIER_RULE_SHORT,
  INCOME_TAX_INSTALMENT_DUE_DATES,
  INSTALMENT_DUE_DATES_RULE,
  INSTALMENT_NET_TAX_OWING_LIMIT,
  INSTALMENT_NET_TAX_OWING_LIMIT_QUEBEC,
  INSTALMENT_REQUIREMENT_RULE,
  INSTALMENT_WITHHOLDING_RULE,
  INSTALMENT_INTEREST_RULE,
  CRA_INSTALMENT_SOURCES,
  GST_HST_TRUST_RULE,
  BROKERAGE_HST_WITHHOLDING,
  brokerageHstWithholdingHint,
  gstHstReportNote,
} from "../cra-rules";
import { computeHSTCollected } from "../../engines/hst-engine";
import { validateTaxCopy } from "../validate";

const errorsIn = (text: string) => validateTaxCopy(text).filter((d) => d.level === "error");

const base = { label: "HST", ytdGCI: 120_000 };
const notRegistered = gstHstReportNote({ ...base, registered: false, brokerageWithholds: false, collectedYTD: 0 });
const registered = gstHstReportNote({ ...base, registered: true, brokerageWithholds: false, collectedYTD: 18_000 });
const withheld = gstHstReportNote({ ...base, registered: true, brokerageWithholds: true, collectedYTD: 0 });

describe("small supplier rule", () => {
  it("is $30,000", () => {
    expect(SMALL_SUPPLIER_LIMIT).toBe(30_000);
  });

  it.each([
    ["full", SMALL_SUPPLIER_RULE],
    ["short", SMALL_SUPPLIER_RULE_SHORT],
  ])("%s: names revenue from taxable supplies and both CRA periods", (_name, rule) => {
    expect(rule).toContain("$30,000");
    expect(rule).toMatch(/revenue from (worldwide )?taxable supplies/);
    expect(rule).toMatch(/calendar quarter\b/);
    expect(rule).toMatch(/four consecutive calendar quarters/);
    expect(rule).toMatch(/^Per CRA/);
  });

  it.each([
    ["full", SMALL_SUPPLIER_RULE],
    ["short", SMALL_SUPPLIER_RULE_SHORT],
  ])("%s: does not call it income, a year or 12 months", (_name, rule) => {
    expect(rule).not.toMatch(/income/i);
    expect(rule).not.toMatch(/annual|per year|a year|12[- ]month/i);
  });

  it("says before expenses, so it cannot be read as net income", () => {
    expect(SMALL_SUPPLIER_RULE).toContain("before expenses");
  });
});

describe("gstHstReportNote", () => {
  it("not registered: no amount, no GCI figure, and the CRA rule", () => {
    expect(notRegistered).toContain("no HST registration");
    expect(notRegistered).toContain(SMALL_SUPPLIER_RULE);
    expect(notRegistered).not.toMatch(/\$0\b/);
    expect(notRegistered).not.toContain("collected");
    expect(notRegistered).not.toContain("$120,000");
  });

  it("registered: the estimate and the GCI it is on, without the registration rule", () => {
    expect(registered).toContain("$18,000");
    expect(registered).toContain("$120,000");
    expect(registered).toContain("HST estimate");
    expect(registered).not.toContain("$30,000");
  });

  it("registered, brokerage holds the tax back: says so instead of printing $0 collected", () => {
    expect(withheld).toContain("brokerage");
    expect(withheld).toContain("$120,000");
    expect(withheld).not.toMatch(/\$0\b/);
    expect(withheld).not.toContain("$30,000");
  });

  it("registration decides the note, not the amount", () => {
    // A registrant with no closed deals yet is still a registrant.
    const noDealsYet = gstHstReportNote({ label: "HST", registered: true, brokerageWithholds: false, collectedYTD: 0, ytdGCI: 0 });
    expect(noDealsYet).toContain("HST estimate");
    expect(noDealsYet).not.toContain("no HST registration");
  });

  it("uses the province's label", () => {
    const gst = gstHstReportNote({ label: "GST", registered: true, brokerageWithholds: false, collectedYTD: 6_000, ytdGCI: 120_000 });
    expect(gst).toContain("GST estimate");
    expect(gst).not.toContain("HST estimate: ");
  });

  it.each([
    ["not registered", notRegistered],
    ["registered", registered],
    ["brokerage holds it back", withheld],
  ])("%s: no directive, no dedicated-account line, no em dash", (_name, note) => {
    expect(note).not.toMatch(/responsible for/i);
    expect(note).not.toMatch(/dedicated account/i);
    expect(note).not.toMatch(/annual income/i);
    expect(note).not.toContain("—");
  });
});

describe("brokerage HST withholding question", () => {
  const yes = brokerageHstWithholdingHint(true);
  const no = brokerageHstWithholdingHint(false);
  const everything = [...Object.values(BROKERAGE_HST_WITHHOLDING), yes, no];

  it("yes: the app counts none in the agent's hands, which is what the engine does", () => {
    expect(yes).toContain("counts no HST in your hands");
    expect(computeHSTCollected({ ytdGCI: 120_000, hstRate: 0.15, isRegistered: true, brokerageWithholdsHst: true })).toBe(0);
  });

  it("yes: says the return and T2125 views are not changed (neither reads the setting)", () => {
    expect(yes).toMatch(/HST return and T2125 views do not use this answer/);
  });

  it("no: an estimate, and only for a registrant, which is what the engine does", () => {
    expect(no).toContain("estimates");
    expect(no).toContain("GST/HST registered");
    expect(computeHSTCollected({ ytdGCI: 120_000, hstRate: 0.15, isRegistered: true, brokerageWithholdsHst: false })).toBe(18_000);
    expect(computeHSTCollected({ ytdGCI: 120_000, hstRate: 0.15, isRegistered: false, brokerageWithholdsHst: false })).toBe(0);
  });

  it("the two answers get different lines", () => {
    expect(yes).not.toBe(no);
  });

  it.each(everything)("%s: nothing about what the agent does with the money, and no em dash", (text) => {
    expect(text).not.toMatch(/set[- ](it )?aside/i);
    expect(text).not.toMatch(/recommend|remind/i);
    expect(text).not.toMatch(/take-home/i);
    expect(text).not.toMatch(/one less thing/i);
    expect(text).not.toContain("—");
  });
});

describe("info-not-advice lint", () => {
  it.each([
    ["SMALL_SUPPLIER_RULE", SMALL_SUPPLIER_RULE],
    ["SMALL_SUPPLIER_RULE_SHORT", SMALL_SUPPLIER_RULE_SHORT],
    ["note: not registered", notRegistered],
    ["note: registered", registered],
    ["note: brokerage holds it back", withheld],
    ["withholding: question", BROKERAGE_HST_WITHHOLDING.question],
    ["withholding: no", BROKERAGE_HST_WITHHOLDING.no],
    ["withholding: yes", BROKERAGE_HST_WITHHOLDING.yes],
    ["withholding hint: yes", brokerageHstWithholdingHint(true)],
    ["withholding hint: no", brokerageHstWithholdingHint(false)],
  ])("%s has no error-level diagnostic", (_name, text) => {
    expect(errorsIn(text)).toEqual([]);
  });

  // The lint is a floor, not the whole check. The sentence the PDF used to
  // print ("you are responsible for remitting ... Keep a dedicated account for
  // these funds") holds no listed verb and passes it, which is why the shape
  // assertions above exist.
});

describe("income tax instalment due dates", () => {
  it("are CRA's four dates for individuals, in order", () => {
    expect(INCOME_TAX_INSTALMENT_DUE_DATES.map((d) => d.long)).toEqual([
      "March 15",
      "June 15",
      "September 15",
      "December 15",
    ]);
    expect(INCOME_TAX_INSTALMENT_DUE_DATES.map((d) => d.short)).toEqual(["Mar 15", "Jun 15", "Sep 15", "Dec 15"]);
  });

  it("are not the GST/HST quarterly filing dates", () => {
    const all = INCOME_TAX_INSTALMENT_DUE_DATES.map((d) => `${d.long} ${d.short}`).join(" ");
    expect(all).not.toMatch(/April 30|July 31|October 31|January 31|Apr 30|Jul 31|Oct 31|Jan 31/);
  });
});

describe("income tax instalments: who pays, when, and interest", () => {
  it("the limits are CRA's: $3,000, and $1,800 for Quebec residents", () => {
    expect(INSTALMENT_NET_TAX_OWING_LIMIT).toBe(3_000);
    expect(INSTALMENT_NET_TAX_OWING_LIMIT_QUEBEC).toBe(1_800);
  });

  it("the requirement names both halves of CRA's test and both limits", () => {
    expect(INSTALMENT_REQUIREMENT_RULE).toContain("net tax owing is more than $3,000");
    expect(INSTALMENT_REQUIREMENT_RULE).toContain("$1,800 for Quebec residents");
    expect(INSTALMENT_REQUIREMENT_RULE).toMatch(/in that year and in either of the two years before it/);
  });

  it("the due dates sentence prints the four dates in the table, in order", () => {
    const at = INCOME_TAX_INSTALMENT_DUE_DATES.map((d) => INSTALMENT_DUE_DATES_RULE.indexOf(d.long));
    expect(at.every((i) => i > 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it("interest is on late or insufficient payments, at the prescribed rate", () => {
    expect(INSTALMENT_INTEREST_RULE).toMatch(/late or insufficient instalment payments/);
    expect(INSTALMENT_INTEREST_RULE).toMatch(/compounded daily at the prescribed interest rate/);
  });

  it("withholding: instalments may apply to self-employment income, with no claim that they do", () => {
    expect(INSTALMENT_WITHHOLDING_RULE).toMatch(/may apply/);
    expect(INSTALMENT_WITHHOLDING_RULE).toMatch(/self-employment income/);
  });

  it.each([
    ["requirement", INSTALMENT_REQUIREMENT_RULE],
    ["withholding", INSTALMENT_WITHHOLDING_RULE],
    ["due dates", INSTALMENT_DUE_DATES_RULE],
    ["interest", INSTALMENT_INTEREST_RULE],
  ])("%s: attributed to CRA, no advice wording, no em dash", (_name, rule) => {
    expect(rule).toMatch(/^Per CRA, /);
    expect(errorsIn(rule)).toEqual([]);
    expect(rule).not.toContain("—");
  });

  it("each rule has a canada.ca page to cite", () => {
    for (const source of Object.values(CRA_INSTALMENT_SOURCES)) {
      expect(source.url).toMatch(
        /^https:\/\/www\.canada\.ca\/en\/revenue-agency\/services\/payments\/payments-cra\/individual-payments\/income-tax-instalments\/[a-z-]+\.html$/,
      );
      expect(source.label).toMatch(/^CRA: /);
    }
  });
});

describe("GST/HST collected is held in trust", () => {
  it("cites the section of the Excise Tax Act and states the trust, with no instruction", () => {
    expect(GST_HST_TRUST_RULE).toMatch(/^Per the Excise Tax Act, s\. 222\(1\), /);
    expect(GST_HST_TRUST_RULE).toMatch(/deemed held in trust for the Crown until it is remitted/);
    expect(errorsIn(GST_HST_TRUST_RULE)).toEqual([]);
    expect(GST_HST_TRUST_RULE).not.toMatch(/\b(?:yours|aside)\b/i);
  });
});
