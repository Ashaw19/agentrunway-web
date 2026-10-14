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
 *   7. The GST/HST rate sentence prints the engine's rate for every province.
 *      A blog post used to say "In most provinces, you charge 13% HST" (13% is
 *      Ontario only) and several pages put Nova Scotia at 15% (14% since
 *      April 1, 2025).
 *   8. CRA's three instalment options are each stated the same way, with what
 *      CRA says each is best for, and none is put above the others. A page
 *      used to call the current-year option "the most effective planning
 *      approach". CRA's condition on interest ("unless your estimated
 *      instalment amounts are too low") is carried, not dropped.
 *   9. The deduction rules (reasonable current expense, meals at 50% of the
 *      lesser amount, capital property through CCA) are CRA's sentences.
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
  HST_RATE_GROUPS,
  GST_RATE_GROUP,
  GST_HST_RATE_RULE,
  fmtGstHstRate,
  gstHstRatePercent,
  INPUT_TAX_CREDIT_RULE,
  INPUT_TAX_CREDIT_EVIDENCE_RULE,
  INPUT_TAX_CREDIT_NOTE,
  CRA_GST_HST_SOURCES,
  INSTALMENT_OPTIONS,
  INSTALMENT_OPTION_LIST,
  INSTALMENT_OPTIONS_RULE,
  INSTALMENT_OPTION_INTEREST_RULE,
  INSTALMENT_ENGINE_ESTIMATE,
  INSTALMENT_PENALTY_INTEREST_FLOOR,
  INSTALMENT_PENALTY_RULE,
  INSTALMENT_INTEREST_LEAST_RULE,
  INSTALMENT_REMINDERS_RULE,
  BUSINESS_EXPENSE_RULE,
  PERSONAL_EXPENSE_RULE,
  MEALS_ENTERTAINMENT_RULE,
  CAPITAL_COST_ALLOWANCE_RULE,
} from "../cra-rules";
import { computeHSTCollected } from "../../engines/hst-engine";
import { calculate, gstHstLabel, gstHstRate } from "../../engines/canadian-tax-engine";
import { PROVINCE_LABELS, type Province } from "../../types/database";
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

describe("GST/HST rate by province", () => {
  const provinces = Object.keys(PROVINCE_LABELS).filter((key): key is Province => key in PROVINCE_LABELS);
  const hstProvinces = provinces.filter((p) => gstHstLabel(p) === "HST");
  const gstProvinces = provinces.filter((p) => gstHstLabel(p) === "GST");

  it("the rates are CRA's table as read 2026-10-13, and they are the engine's", () => {
    // canada.ca, "GST/HST calculator (and rates)", date modified 2025-04-01.
    const cra: Partial<Record<Province, number>> = {
      ontario: 0.13,
      novaScotia: 0.14,
      newBrunswick: 0.15,
      newfoundland: 0.15,
      princeEdwardIsland: 0.15,
      alberta: 0.05,
      britishColumbia: 0.05,
      manitoba: 0.05,
      saskatchewan: 0.05,
      northwestTerritories: 0.05,
      nunavut: 0.05,
      yukon: 0.05,
    };
    for (const [province, rate] of Object.entries(cra)) expect(gstHstRate(province), province).toBe(rate);
    expect(Object.keys(cra).sort()).toEqual([...hstProvinces, ...gstProvinces].sort());
  });

  it("every HST province is in one group, at the engine's rate, lowest rate first", () => {
    expect(HST_RATE_GROUPS.flatMap((g) => g.provinces).sort()).toEqual([...hstProvinces].sort());
    for (const group of HST_RATE_GROUPS) {
      for (const province of group.provinces) expect(gstHstRate(province), province).toBe(group.rate);
      expect(group.percent).toBe(fmtGstHstRate(group.rate));
    }
    const rates = HST_RATE_GROUPS.map((g) => g.rate);
    expect([...rates].sort((a, b) => a - b)).toEqual(rates);
    expect(new Set(rates).size).toBe(rates.length);
  });

  it("the GST provinces and territories share one rate", () => {
    expect([...GST_RATE_GROUP.provinces].sort()).toEqual([...gstProvinces].sort());
    for (const province of gstProvinces) expect(gstHstRate(province), province).toBe(GST_RATE_GROUP.rate);
  });

  it("the sentence prints each HST province beside its own rate", () => {
    expect(GST_HST_RATE_RULE).toMatch(/^Per CRA, the GST\/HST rate to charge depends on the province or territory where the supply is made: /);
    for (const group of HST_RATE_GROUPS) {
      expect(GST_HST_RATE_RULE).toContain(`${group.percent} HST in ${group.names}`);
    }
    expect(GST_HST_RATE_RULE).toContain(`${GST_RATE_GROUP.percent} GST in the other provinces and territories`);
    expect(GST_HST_RATE_RULE).toContain("13% HST in Ontario");
    expect(GST_HST_RATE_RULE).toContain("14% HST in Nova Scotia");
    expect(GST_HST_RATE_RULE).toContain("15% HST in New Brunswick, Newfoundland and Labrador and Prince Edward Island");
  });

  it("13% is Ontario's alone, and Nova Scotia is not at 15%", () => {
    const thirteen = HST_RATE_GROUPS.find((g) => g.percent === "13%");
    expect(thirteen?.provinces).toEqual(["ontario"]);
    expect(gstHstRatePercent("novaScotia")).toBe("14%");
    expect(GST_HST_RATE_RULE).not.toMatch(/most provinces/i);
    expect(GST_HST_RATE_RULE).not.toMatch(/Maritimes/i);
  });

  it("prints a rate the way a reader writes it", () => {
    expect(fmtGstHstRate(0.05)).toBe("5%");
    expect(fmtGstHstRate(0.14)).toBe("14%");
    expect(fmtGstHstRate(0.14975)).toBe("14.975%");
  });

  it("no advice wording and no em dash", () => {
    expect(errorsIn(GST_HST_RATE_RULE)).toEqual([]);
    expect(GST_HST_RATE_RULE).not.toContain("—");
  });
});

describe("input tax credits", () => {
  it("states who recovers what, and how", () => {
    expect(INPUT_TAX_CREDIT_RULE).toMatch(/^Per CRA, a GST\/HST registrant recovers the GST\/HST paid or payable/);
    expect(INPUT_TAX_CREDIT_RULE).toMatch(/by claiming input tax credits \(ITCs\)/);
  });

  it("the records condition is CRA's: evidence before the claim", () => {
    expect(INPUT_TAX_CREDIT_EVIDENCE_RULE).toMatch(/^Per CRA, /);
    expect(INPUT_TAX_CREDIT_EVIDENCE_RULE).toMatch(/sufficient documentary evidence/);
    expect(INPUT_TAX_CREDIT_EVIDENCE_RULE).toMatch(/before the claim is made/);
  });

  it("the report note ends with the shared sentence", () => {
    expect(registered.endsWith(INPUT_TAX_CREDIT_NOTE)).toBe(true);
    expect(INPUT_TAX_CREDIT_NOTE).toMatch(/may reduce the amount remitted to CRA/);
  });

  it.each([
    ["rule", INPUT_TAX_CREDIT_RULE],
    ["evidence", INPUT_TAX_CREDIT_EVIDENCE_RULE],
    ["note", INPUT_TAX_CREDIT_NOTE],
  ])("%s: no directive about money left unclaimed, no advice wording, no em dash", (_name, text) => {
    expect(text).not.toMatch(/on the table|than you need|leaving/i);
    expect(errorsIn(text)).toEqual([]);
    expect(text).not.toContain("—");
  });

  it("each GST/HST rule has a canada.ca page to cite", () => {
    for (const source of Object.values(CRA_GST_HST_SOURCES)) {
      expect(source.url).toMatch(
        /^https:\/\/www\.canada\.ca\/en\/revenue-agency\/services\/tax\/businesses\/topics\/gst-hst-businesses\/[a-z/-]+\.html$/,
      );
      expect(source.label).toMatch(/^CRA: /);
    }
  });
});

describe("income tax instalments: the three options to calculate", () => {
  const everything = [
    INSTALMENT_OPTIONS_RULE,
    INSTALMENT_OPTION_INTEREST_RULE,
    ...INSTALMENT_OPTION_LIST.flatMap((o) => [o.how, o.bestIf]),
  ];

  it("there are three, in CRA's order", () => {
    expect(INSTALMENT_OPTION_LIST.map((o) => o.name)).toEqual([
      "No-calculation option",
      "Prior-year option",
      "Current-year option",
    ]);
    expect(INSTALMENT_OPTIONS_RULE).toContain("the no-calculation option, the prior-year option and the current-year option");
  });

  it("each is stated in the same two parts: how it is worked out, and what CRA says it is best for", () => {
    for (const option of INSTALMENT_OPTION_LIST) {
      expect(option.how).toMatch(/^Per CRA, under the [a-z-]+ option /);
      expect(option.bestIf).toMatch(/^Per CRA, this option is best if /);
    }
  });

  it("no-calculation: CRA works out the amounts and prints them on its reminders", () => {
    const { how, bestIf } = INSTALMENT_OPTIONS.noCalculation;
    expect(how).toMatch(/the CRA determines the instalment amounts from the latest assessed tax return/);
    expect(how).toMatch(/instalment reminders/);
    expect(bestIf).toMatch(/stay about the same from year to year/);
  });

  it("prior-year: from the return for the year before", () => {
    const { how, bestIf } = INSTALMENT_OPTIONS.priorYear;
    expect(how).toMatch(/the payer determines the instalment amounts from the tax return for the year before/);
    expect(bestIf).toMatch(/similar to those of the year before but significantly different from those of two years before/);
  });

  it("current-year: from an estimate of the three amounts CRA lists", () => {
    const { how, bestIf } = INSTALMENT_OPTIONS.currentYear;
    expect(how).toMatch(/an estimate of the current year's net tax owing, CPP contributions payable and voluntary EI premiums/);
    expect(bestIf).toMatch(/significantly different from those of the two years before/);
  });

  it("interest: CRA's condition is kept, and only the two options it is written under are named", () => {
    expect(INSTALMENT_OPTION_INTEREST_RULE).toMatch(/under the prior-year option and the current-year option/);
    expect(INSTALMENT_OPTION_INTEREST_RULE).toMatch(/payments made in full by the due dates/);
    expect(INSTALMENT_OPTION_INTEREST_RULE).toMatch(/unless the estimated instalment amounts are too low/);
    expect(INSTALMENT_OPTION_INTEREST_RULE).not.toMatch(/no-calculation/);
  });

  it.each(everything)("%s: none is ranked, promised or pushed", (text) => {
    expect(text).not.toMatch(/most effective|most agents|the best (?:approach|method|option|way)|eliminates|minimi[sz]es|safest|default/i);
    expect(text).not.toMatch(/\b20\d\d\b/);
    expect(errorsIn(text)).toEqual([]);
    expect(text).not.toContain("—");
  });

  it("penalty: may apply, and only above CRA's $1,000 of instalment interest", () => {
    expect(INSTALMENT_PENALTY_INTEREST_FLOOR).toBe(1_000);
    expect(INSTALMENT_PENALTY_RULE).toMatch(/^Per CRA, a penalty may also apply/);
    expect(INSTALMENT_PENALTY_RULE).toMatch(/late or less than the required amount/);
    expect(INSTALMENT_PENALTY_RULE).toMatch(/only if instalment interest charges for the year are more than \$1,000/);
    expect(errorsIn(INSTALMENT_PENALTY_RULE)).toEqual([]);
    expect(INSTALMENT_PENALTY_RULE).not.toContain("—");
  });

  it("interest is worked out on the option with the least interest, in CRA's words", () => {
    expect(INSTALMENT_INTEREST_LEAST_RULE).toMatch(/^Per CRA, /);
    expect(INSTALMENT_INTEREST_LEAST_RULE).toMatch(/from the day it was due to the balance due date/);
    expect(INSTALMENT_INTEREST_LEAST_RULE).toMatch(/the payment calculation option that results in the least amount of interest/);
    expect(INSTALMENT_INTEREST_LEAST_RULE).not.toMatch(/penalis|floor|eliminates/i);
    expect(errorsIn(INSTALMENT_INTEREST_LEAST_RULE)).toEqual([]);
  });

  it("reminders: which reminder covers which payments", () => {
    expect(INSTALMENT_REMINDERS_RULE).toMatch(/^Per CRA, /);
    expect(INSTALMENT_REMINDERS_RULE).toMatch(/February reminder is for the March and June payments/);
    expect(INSTALMENT_REMINDERS_RULE).toMatch(/August reminder is for the September and December payments/);
    expect(errorsIn(INSTALMENT_REMINDERS_RULE)).toEqual([]);
    expect(INSTALMENT_REMINDERS_RULE).not.toContain("—");
  });

  it("the options page is in the sources registry", () => {
    expect(CRA_INSTALMENT_SOURCES.options.url).toMatch(/income-tax-instalments\/options-calculate\.html$/);
  });

  it("Agent Runway's part: one quarter of the engine's estimate, which is what the engine does", () => {
    for (const province of ["newBrunswick", "ontario", "alberta"] as const) {
      const result = calculate(100_000, province, 10);
      // The engine rounds each figure to the cent.
      expect(Math.abs(result.quarterlyEstimate - result.totalBurden / 4)).toBeLessThan(0.01);
      expect(Math.abs(result.totalBurden - (result.federalTax + result.provincialTax + result.totalCPP))).toBeLessThan(0.02);
    }
    expect(INSTALMENT_ENGINE_ESTIMATE).toMatch(/one quarter of its tax engine's estimate for the current year/);
    expect(INSTALMENT_ENGINE_ESTIMATE).toMatch(/federal income tax, provincial income tax and CPP contributions \(QPP in Quebec\)/);
    expect(INSTALMENT_ENGINE_ESTIMATE).toMatch(/is not CRA's net tax owing/);
    expect(INSTALMENT_ENGINE_ESTIMATE).not.toMatch(/most effective|exactly what|automatically/i);
    expect(errorsIn(INSTALMENT_ENGINE_ESTIMATE)).toEqual([]);
  });
});

describe("business expenses: what is deductible, meals, capital property", () => {
  it("the general rule is a reasonable current expense incurred to earn business income, business part only", () => {
    expect(BUSINESS_EXPENSE_RULE).toMatch(/any reasonable current expense incurred to earn business income is generally deductible/);
    expect(PERSONAL_EXPENSE_RULE).toMatch(/personal expenses are not deductible/);
    expect(PERSONAL_EXPENSE_RULE).toMatch(/only the business part of an expense is entered on Form T2125/);
  });

  it("meals: 50% of the lesser of two amounts, with CRA's exceptions noted", () => {
    expect(MEALS_ENTERTAINMENT_RULE).toMatch(/50% of the lesser of the amount incurred and an amount that is reasonable in the circumstances/);
    expect(MEALS_ENTERTAINMENT_RULE).toMatch(/cases where that limit does not apply/);
  });

  it("capital property: not an expense for the year, deducted over several years as CCA", () => {
    expect(CAPITAL_COST_ALLOWANCE_RULE).toMatch(/is not deducted as an expense when net business income for the year is calculated/);
    expect(CAPITAL_COST_ALLOWANCE_RULE).toMatch(/over a period of several years as capital cost allowance \(CCA\)/);
  });

  it.each([
    ["general", BUSINESS_EXPENSE_RULE],
    ["personal", PERSONAL_EXPENSE_RULE],
    ["meals", MEALS_ENTERTAINMENT_RULE],
    ["capital property", CAPITAL_COST_ALLOWANCE_RULE],
  ])("%s: attributed to CRA, no advice wording, no em dash", (_name, rule) => {
    expect(rule).toMatch(/^Per CRA, /);
    expect(rule).not.toMatch(/strategy|well-managed|meaningfully/i);
    expect(errorsIn(rule)).toEqual([]);
    expect(rule).not.toContain("—");
  });
});
