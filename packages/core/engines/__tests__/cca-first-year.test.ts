/**
 * First-year CCA (2026-10-21). The T2125 engine applied the half-year rule
 * to every addition: `ucc − 0.5 × net additions`. CRA's Guide T4002 ch.4:
 * "the half-year rule does not apply to AIIPs, ZEVs, Class 56 properties,
 * or, under proposed changes, RIIPs". A phone bought in February 2026
 * (Class 50, 55%) got $482 of first-year CCA; CRA's guide gives a Class 50
 * addition acquired after April 15, 2024 and available for use before 2027
 * 100% in the first year.
 *
 * Status (2026-10-21): the reaccelerated investment incentive is law (Bill
 * C-15, March 26, 2026, deemed in force January 1, 2025: CRA Income Tax Folio
 * S3-F4-C1 notice). The Class 50 100% first-year deduction is "under
 * proposed changes" in T4002 (2025 edition), so its note says so.
 */
import { describe, expect, it } from "vitest";
import { ccaForYear, firstYearTreatment } from "../cca-first-year";
import { computeT2125 } from "../t2125-engine";
import type { CcaAsset, UserSettings } from "../../types/database";

const treat = (acquisitionDate: string | null, classHalfYear = true, ccaClass = 8, classRate = 0.2) =>
  firstYearTreatment({ acquisitionDate, classHalfYear, ccaClass, classRate });

describe("firstYearTreatment", () => {
  it("before the accelerated incentive (acquired on or before 2018-11-20): the half-year rule", () => {
    expect(treat("2018-11-20")).toMatchObject({ rule: "half_year", factor: 0.5, proposed: false });
  });

  it("accelerated investment incentive property: 1.5× before 2024, the full rate 2024 to 2027", () => {
    expect(treat("2018-11-21")).toMatchObject({ rule: "aiip_enhanced", factor: 1.5 });
    expect(treat("2023-12-31")).toMatchObject({ rule: "aiip_enhanced", factor: 1.5 });
    expect(treat("2024-01-01")).toMatchObject({ rule: "aiip_full", factor: 1 });
    expect(treat("2024-12-31")).toMatchObject({ rule: "aiip_full", factor: 1, proposed: false });
  });

  it("acquired from 2025 (reaccelerated incentive, law since March 26, 2026): 1.5× before 2030, the full rate 2030 to 2033, then the half-year rule", () => {
    expect(treat("2025-01-01")).toMatchObject({ rule: "riip_enhanced", factor: 1.5, proposed: false });
    expect(treat("2026-02-10")).toMatchObject({ rule: "riip_enhanced", factor: 1.5, proposed: false });
    expect(treat("2029-12-31")).toMatchObject({ rule: "riip_enhanced", factor: 1.5 });
    expect(treat("2030-01-01")).toMatchObject({ rule: "riip_full", factor: 1, proposed: false });
    expect(treat("2034-01-01")).toMatchObject({ rule: "half_year", factor: 0.5 });
  });

  it("Class 50 acquired after April 15, 2024 and put to use before 2027: 100% in the first year (proposed, per T4002)", () => {
    const c50 = (date: string) => treat(date, true, 50, 0.55);
    expect(c50("2024-04-16")).toMatchObject({ rule: "class50_full", proposed: true });
    expect(c50("2026-02-10").factor).toBeCloseTo(1 / 0.55, 10);
    expect(c50("2024-04-15")).toMatchObject({ rule: "aiip_full", factor: 1 });
    expect(c50("2027-03-01")).toMatchObject({ rule: "riip_enhanced", factor: 1.5 });
  });

  it("a class the half-year rule doesn't apply to, and a date that can't be read", () => {
    expect(treat("2026-02-10", false)).toMatchObject({ rule: "not_subject", factor: 1 });
    expect(treat(null)).toMatchObject({ rule: "half_year", factor: 0.5 });
    expect(treat("February 2026")).toMatchObject({ rule: "half_year", factor: 0.5 });
  });
});

describe("ccaForYear", () => {
  it("the base counts the year's net additions at the factor; CCA is base × rate", () => {
    const r = ccaForYear({ ucc: 2_000, netAdditions: 2_000, factor: 1.5, rate: 0.55, businessUsePct: 1 });
    expect(r.base).toBe(3_000);
    expect(r.fullCca).toBeCloseTo(1_650, 6);
    expect(r.closingUcc).toBeCloseTo(350, 6);
  });

  it("never more than the UCC (a 100% class with the 1.5 factor)", () => {
    const r = ccaForYear({ ucc: 400, netAdditions: 400, factor: 1.5, rate: 1, businessUsePct: 1 });
    expect(r.fullCca).toBe(400);
    expect(r.closingUcc).toBe(0);
  });

  it("partly personal: the business part is claimed, the full CCA comes off the UCC", () => {
    const r = ccaForYear({ ucc: 10_000, netAdditions: 0, factor: 1, rate: 0.3, businessUsePct: 0.8 });
    expect(r.fullCca).toBeCloseTo(3_000, 6);
    expect(r.claimed).toBeCloseTo(2_400, 6);
    expect(r.closingUcc).toBeCloseTo(7_000, 6);
  });

  it("no UCC, no CCA", () => {
    expect(ccaForYear({ ucc: 0, netAdditions: 0, factor: 1, rate: 0.3, businessUsePct: 1 }).claimed).toBe(0);
    expect(ccaForYear({ ucc: -50, netAdditions: 0, factor: 1, rate: 0.3, businessUsePct: 1 }).closingUcc).toBe(0);
  });
});

describe("the T2125 engine's CCA (line 9936)", () => {
  const settings = { province: "newBrunswick", gst_hst_registered: true } as unknown as UserSettings;
  const asset = (over: Partial<CcaAsset>): CcaAsset => ({
    id: "a1", user_id: "u1", cca_class: 50, class_rate: 0.55, class_half_year: true,
    description: "Phone", acquisition_date: "2026-02-10", original_cost: 1_753.68,
    business_use_pct: 1, opening_ucc: 0, additions_this_year: 1_753.68, disposals_this_year: 0,
    cca_claimed_prior: 0, notes: null, created_at: "", updated_at: "", ...over,
  });
  const t2125 = (assets: CcaAsset[], taxYear = 2026) =>
    computeT2125({ settings, transactions: [], expenses: [], ccaAssets: assets, taxYear, vehicleBusinessUsePct: 0.8, paymentsYear: taxYear });

  it("a computer bought in February 2026 (Class 50): 100% in the first year, not half of 55%", () => {
    const r = t2125([asset({})]);
    expect(r.line9936_totalCca).toBeCloseTo(1_753.68, 2);
    expect(r.ccaLines[0].firstYear).toMatchObject({ rule: "class50_full", proposed: true });
    expect(r.ccaLines[0].closingUcc).toBeCloseTo(0, 6);
  });

  it("office equipment bought in February 2026 (Class 8, 20%): 1.5 × 20%", () => {
    const r = t2125([asset({ cca_class: 8, class_rate: 0.2, original_cost: 3_000, additions_this_year: 3_000 })]);
    expect(r.line9936_totalCca).toBeCloseTo(900, 6);
    expect(r.ccaLines[0].firstYear).toMatchObject({ rule: "riip_enhanced", proposed: false });
  });

  it("80% business use: the business part of the CCA, the full CCA off the UCC (CRA's administrative method)", () => {
    const r = t2125([asset({ cca_class: 8, class_rate: 0.2, original_cost: 3_000, additions_this_year: 3_000, business_use_pct: 0.8 })]);
    expect(r.line9936_totalCca).toBeCloseTo(720, 6);
    expect(r.ccaLines[0].closingUcc).toBeCloseTo(2_100, 6);
  });

  it("an asset bought in an earlier year gets no first-year treatment", () => {
    const r = t2125([asset({ cca_class: 50, acquisition_date: "2024-05-01", opening_ucc: 1_000, additions_this_year: 0 })]);
    expect(r.ccaLines[0].firstYear).toBeNull();
    expect(r.line9936_totalCca).toBeCloseTo(550, 6);
  });

  it("a class recorded without the half-year rule: the full rate", () => {
    const r = t2125([asset({ cca_class: 8, class_rate: 0.2, class_half_year: false, original_cost: 3_000, additions_this_year: 3_000 })]);
    expect(r.line9936_totalCca).toBeCloseTo(600, 6);
  });
});

describe("the wording", () => {
  it("every first-year note and the rule read as information, not advice", async () => {
    const { ccaFirstYearNote, CCA_FIRST_YEAR_RULE } = await import("../../tax-copy/cca-first-year");
    const { validateTaxCopy } = await import("../../tax-copy/validate");
    const dates: [string, number, number][] = [["2018-01-01", 8, 0.2], ["2020-01-01", 8, 0.2], ["2024-06-01", 8, 0.2], ["2026-02-10", 8, 0.2], ["2026-02-10", 50, 0.55], ["2031-01-01", 8, 0.2]];
    const notes = dates.map(([d, cls, rate]) => String(ccaFirstYearNote(firstYearTreatment({ acquisitionDate: d, classHalfYear: true, ccaClass: cls, classRate: rate }))));
    notes.push(String(ccaFirstYearNote(firstYearTreatment({ acquisitionDate: "2026-02-10", classHalfYear: false }))));
    expect(new Set(notes).size).toBe(7);
    for (const text of [...notes, String(CCA_FIRST_YEAR_RULE)]) {
      expect(validateTaxCopy(text).filter((d) => d.level === "error"), text).toEqual([]);
      expect(text).not.toMatch(/—/);
    }
  });
});
