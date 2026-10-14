/**
 * Quick method remittance rates: CRA's rate for the province, never one
 * province's rate for all of them (2026-10-13).
 *
 * Reference: memory/feedback_tax_information_not_advice.md
 *
 * Until this date the Tax IQ tip said the rate "for service providers in
 * most provinces" is "often 8.8% of HST-included revenue", and Flight Crew's
 * knowledge said "typically 8.8%". CRA guide RC4058 gives 8.8% for Ontario
 * alone: New Brunswick, Newfoundland and Labrador and Prince Edward Island
 * are on 10%, Nova Scotia on 9.4% since April 1, 2025, and the provinces and
 * territories charging 5% GST on 3.6%.
 *
 * What these tests prove:
 *   1. The table is RC4058's, for services with the permanent establishment
 *      and the supplies in the same province.
 *   2. Every province the app supports has a rate, Quebec has none, and each
 *      row's GST/HST matches the rate the tax engine charges there.
 *   3. The sentences name the rate by province and pass the info-not-advice
 *      lint with no error.
 *   4. The Tax IQ tip prints those rates and no longer says "most provinces".
 */
import { describe, expect, it } from "vitest";
import {
  QUICK_METHOD_REVENUE_LIMIT,
  QUICK_METHOD_SERVICE_RATES,
  QUICK_METHOD_SERVICE_RATES_RULE,
  QUICK_METHOD_SOURCE,
  fmtQuickMethodRate,
  quickMethodServiceRate,
  quickMethodServiceRateSentence,
} from "../quick-method";
import { validateTaxCopy } from "../validate";
import { gstHstRate } from "../../engines/canadian-tax-engine";
import { selectTaxTips } from "../../engines/tax-iq-engine";
import { PROVINCE_LABELS } from "../../types/database";

const errorsIn = (text: string) => validateTaxCopy(text).filter((d) => d.level === "error");

describe("RC4058 service rates, same-province supplies", () => {
  it("cites the guide", () => {
    expect(QUICK_METHOD_SOURCE.guide).toBe("RC4058");
    expect(QUICK_METHOD_SOURCE.url).toContain("canada.ca/en/revenue-agency/services/forms-publications/publications/rc4058/");
    expect(QUICK_METHOD_REVENUE_LIMIT).toBe(400_000);
  });

  it("gives each province CRA's rate", () => {
    expect(quickMethodServiceRate("ontario")?.rate).toBe(0.088);
    expect(quickMethodServiceRate("newBrunswick")?.rate).toBe(0.1);
    expect(quickMethodServiceRate("newfoundland")?.rate).toBe(0.1);
    expect(quickMethodServiceRate("princeEdwardIsland")?.rate).toBe(0.1);
    expect(quickMethodServiceRate("novaScotia")?.rate).toBe(0.094);
    expect(quickMethodServiceRate("novaScotia")?.since).toBe("April 1, 2025");
    for (const gstOnly of ["alberta", "britishColumbia", "manitoba", "saskatchewan", "yukon", "northwestTerritories", "nunavut"]) {
      expect(quickMethodServiceRate(gstOnly)?.rate, gstOnly).toBe(0.036);
    }
  });

  it("covers every province the app has except Quebec, once", () => {
    const listed = QUICK_METHOD_SERVICE_RATES.flatMap((row) => row.provinces);
    expect([...listed].sort()).toEqual(Object.keys(PROVINCE_LABELS).filter((p) => p !== "quebec").sort());
    expect(quickMethodServiceRate("quebec")).toBeNull();
    expect(quickMethodServiceRate(null)).toBeNull();
  });

  it("each row's GST/HST is the rate the tax engine charges in that province", () => {
    for (const row of QUICK_METHOD_SERVICE_RATES) {
      for (const province of row.provinces) {
        expect(row.taxCharged, province).toContain(`${Number((gstHstRate(province) * 100).toFixed(3))}%`);
      }
    }
  });

  it("formats a rate without a trailing zero", () => {
    expect(fmtQuickMethodRate(0.088)).toBe("8.8%");
    expect(fmtQuickMethodRate(0.1)).toBe("10%");
    expect(fmtQuickMethodRate(0.036)).toBe("3.6%");
  });
});

describe("the sentences", () => {
  it("the rule names every rate by where it applies", () => {
    expect(QUICK_METHOD_SERVICE_RATES_RULE).toContain("Per CRA guide RC4058");
    expect(QUICK_METHOD_SERVICE_RATES_RULE).toContain("3.6% where 5% GST is charged");
    expect(QUICK_METHOD_SERVICE_RATES_RULE).toContain("8.8% in Ontario");
    expect(QUICK_METHOD_SERVICE_RATES_RULE).toContain("9.4% in Nova Scotia");
    expect(QUICK_METHOD_SERVICE_RATES_RULE).toContain("10% in New Brunswick, Newfoundland and Labrador, Prince Edward Island");
    expect(QUICK_METHOD_SERVICE_RATES_RULE).toContain("revenue including the GST/HST");
  });

  it("one province gets its own rate, and not Ontario's", () => {
    const nb = quickMethodServiceRateSentence("newBrunswick");
    expect(nb).toContain("15% HST");
    expect(nb).toContain("is 10% of revenue including the GST/HST");
    expect(nb).not.toContain("8.8%");
    expect(quickMethodServiceRateSentence("ontario")).toContain("is 8.8% of revenue");
  });

  it("Quebec and an unknown province get the whole table, not a guess", () => {
    expect(quickMethodServiceRateSentence("quebec")).toBe(QUICK_METHOD_SERVICE_RATES_RULE);
    expect(quickMethodServiceRateSentence(undefined)).toBe(QUICK_METHOD_SERVICE_RATES_RULE);
  });

  it("pass the info-not-advice lint and state no rate as typical", () => {
    const sentences = [QUICK_METHOD_SERVICE_RATES_RULE, ...Object.keys(PROVINCE_LABELS).map(quickMethodServiceRateSentence)];
    for (const sentence of sentences) {
      expect(errorsIn(sentence)).toEqual([]);
      expect(sentence).not.toMatch(/typical|often|most provinces|usually/i);
    }
  });
});

describe("the Tax IQ tip", () => {
  const tip = selectTaxTips(
    {
      province: "newBrunswick",
      filingFrequency: "quarterly",
      currentQuarter: 4,
      activeExpenseCategories: [],
      transactionCount: 0,
      dismissedTipIds: [],
    },
    100,
  ).find((t) => t.id === "quick-method-consideration");

  it("prints CRA's rates by province", () => {
    expect(tip).toBeDefined();
    expect(tip?.body).toContain(QUICK_METHOD_SERVICE_RATES_RULE);
    expect(tip?.body).toContain("$400,000");
    expect(tip?.url).toBe(QUICK_METHOD_SOURCE.url);
  });

  it("no longer gives one rate for most provinces or says which method pays less", () => {
    expect(tip?.body).not.toMatch(/most provinces|often 8\.8%|paying less/i);
    expect(tip?.title).not.toMatch(/^Consider/);
    expect(errorsIn(`${tip?.title}. ${tip?.body}`)).toEqual([]);
  });
});
