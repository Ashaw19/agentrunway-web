/**
 * Layer 2: Canadian Tax Engine
 * ==============================
 * Tests for the 2026 CRA-verified tax calculation engine (verified 2026-06-26).
 *
 * All expected values are hand-calculated by tracing through bracketTax(),
 * cppContributions(), provincialTax(), and ontarioSurtax() step-by-step.
 *
 * Constants used (from source, 2026):
 *   FEDERAL_BPA = $16,452, FEDERAL_BPA_RATE = 14% (flat first-bracket rate)
 *   CPP_BASIC_EXEMPTION = $3,500
 *   CPP_YMPE = $74,600, CPP_YAMPE = $85,000
 *   CPP1_SELF_RATE = 11.90%, CPP2_SELF_RATE = 8.00%
 *   QPP1_SELF_RATE = 12.80%, QPP2_SELF_RATE = 8.00%
 *   Ontario BPA = $12,747, lowestRate = 5.05% (2025-indexed; unchanged this roll)
 *   Ontario surtax: 20% over $5,710 + 36% over $7,307
 */

import { describe, it, expect } from "vitest";
import {
  calculate,
  bracketTax,
  provincialInfo,
  marginalRate,
  gstHstRate,
  gstHstLabel,
} from "../canadian-tax-engine";

// ── Zero Income ──────────────────────────────────────────────────────────────

describe("Tax Engine — Zero Income", () => {
  it("returns all zeros for zero income", () => {
    const result = calculate(0, "ontario", 10);
    expect(result.grossIncome).toBe(0);
    expect(result.totalCPP).toBe(0);
    expect(result.federalTax).toBe(0);
    expect(result.provincialTax).toBe(0);
    expect(result.totalBurden).toBe(0);
    expect(result.effectiveRate).toBe(0);
    expect(result.quarterlyEstimate).toBe(0);
  });

  it("returns all zeros for negative income", () => {
    const result = calculate(-10_000, "ontario", 5);
    expect(result.totalBurden).toBe(0);
  });
});

// ── bracketTax Pure Function ─────────────────────────────────────────────────

describe("bracketTax", () => {
  it("calculates federal tax on $50,000 (single bracket)", () => {
    // $50,000 all in first bracket at 14% (2026)
    // tax = 50000 × 0.14 = $7,000
    const brackets: [number, number][] = [
      [58_523, 0.14], [117_045, 0.205], [181_440, 0.260],
      [258_482, 0.290], [Infinity, 0.330],
    ];
    expect(bracketTax(50_000, brackets)).toBeCloseTo(7_000, 2);
  });

  it("calculates federal tax on $80,000 (two brackets)", () => {
    // First $58,523 × 14% = $8,193.22
    // Next $21,477 × 20.5% = $4,402.785
    // Total = $12,596.005
    const brackets: [number, number][] = [
      [58_523, 0.14], [117_045, 0.205], [181_440, 0.260],
      [258_482, 0.290], [Infinity, 0.330],
    ];
    expect(bracketTax(80_000, brackets)).toBeCloseTo(12_596.005, 2);
  });

  it("returns 0 for zero income", () => {
    const brackets: [number, number][] = [[50_000, 0.1], [Infinity, 0.2]];
    expect(bracketTax(0, brackets)).toBe(0);
  });
});

// ── Ontario $66,375 (test agent exact income) ────────────────────────────────
//
// Hand calculation (2026):
//   CPP1: earnings = min(66375, 74600) - 3500 = 62875
//         cpp1 = 62875 × 0.1190 = 7482.125
//   CPP2: earnings = max(0, min(66375, 85000) - 74600) = 0 → cpp2 = 0
//   totalCPP = 7482.125
//
//   cppDeduction = 7482.125 × 0.5 + 0 = 3741.0625
//   fedTaxable = 66375 - 3741.0625 = 62633.9375
//
//   Federal bracket tax (2026):
//     58523 × 0.14 = 8193.22
//     (62633.9375 - 58523) × 0.205 = 4110.9375 × 0.205 = 842.742...
//     raw = 9035.962...
//   BPA credit = 16452 × 0.14 = 2303.28
//   fedTax = 9035.962... - 2303.28 = 6732.682...
//   CPP employee credit = (7482.125 × 0.5) × 0.14 = 3741.0625 × 0.14 = 523.749...
//   fedTax = 6732.682... - 523.749... ≈ 6208.93
//
//   Provincial (Ontario): income = 62633.9375
//     52886 × 0.0505 = 2670.743
//     (62633.9375 - 52886) × 0.0915 = 9747.9375 × 0.0915 = 891.936...
//     raw = 3562.679...
//     BPA credit = 12747 × 0.0505 = 643.7235
//     CPP prov credit = 3741.0625 × 0.0505 = 188.92
//     provTax = 3562.679... - 643.7235 - 188.92 = 2730.03
//     Surtax: 2730.03 < 5710 → no surtax
//     Final provTax ≈ 2730.03
//
//   totalTax = 6208.93 + 2730.03 = 8938.96
//   totalBurden = 8938.96 + 7482.125 = 16421.09
//   effectiveRate = 16421.09 / 66375 ≈ 0.2474

describe("Tax Engine — Ontario $66,375", () => {
  const result = calculate(66_375, "ontario", 6);

  it("computes CPP1 correctly", () => {
    // (min(66375, 74600) - 3500) × 0.119 = 62875 × 0.119 = 7482.125
    expect(result.cpp1Contribution).toBeCloseTo(7_482.125, 1);
  });

  it("computes CPP2 as zero (below YMPE)", () => {
    expect(result.cpp2Contribution).toBe(0);
  });

  it("computes federal tax ≈ $6,209", () => {
    expect(result.federalTax).toBeCloseTo(6_208.93, 0);
  });

  it("computes Ontario provincial tax ≈ $2,730 (no surtax)", () => {
    expect(result.provincialTax).toBeCloseTo(2_730, 0);
  });

  it("computes total burden ≈ $16,421", () => {
    expect(result.totalBurden).toBeCloseTo(16_421, 0);
  });

  it("computes effective rate ≈ 24.7%", () => {
    expect(result.effectiveRate).toBeCloseTo(0.247, 2);
  });

  it("computes quarterly estimate = burden / 4", () => {
    expect(result.quarterlyEstimate).toBeCloseTo(result.totalBurden / 4, 1);
  });

  it("computes per-deal set-aside = burden / 6 deals", () => {
    expect(result.perDealSetAside).toBeCloseTo(result.totalBurden / 6, 2);
  });
});

// ── Ontario $100,000 (crosses into CPP2 + Ontario surtax territory) ─────────
//
// Hand calculation (2026):
//   CPP1: earnings = min(100000, 74600) - 3500 = 71100
//         cpp1 = 71100 × 0.119 = 8460.90
//   CPP2: earnings = min(100000, 85000) - 74600 = 10400
//         cpp2 = 10400 × 0.08 = 832.00
//   totalCPP = 9292.90
//
//   cppDeduction = 8460.9 × 0.5 + 832 = 5062.45
//   fedTaxable = 100000 - 5062.45 = 94937.55
//
//   Federal bracket tax (2026):
//     58523 × 0.14 = 8193.22
//     (94937.55 - 58523) × 0.205 = 36414.55 × 0.205 = 7464.98...
//     raw = 15658.20...
//   BPA credit = 16452 × 0.14 = 2303.28
//   CPP credit = (8460.9 × 0.5) × 0.14 = 592.263
//   fedTax = 15658.20 - 2303.28 - 592.263 ≈ 12762.66
//
//   Provincial (Ontario): income = 94937.55
//     52886 × 0.0505 = 2670.743
//     (94937.55 - 52886) × 0.0915 = 42051.55 × 0.0915 = 3847.717...
//     raw = 6518.46...
//     BPA credit = 643.7235
//     CPP prov credit = 4230.45 × 0.0505 = 213.64
//     provTax = 6518.46 - 643.724 - 213.64 = 5661.10
//     Surtax: 5661.10 < 5710 → no surtax
//
//   totalBurden = 12762.66 + 5661.10 + 9292.90 = 27716.66
//   effectiveRate ≈ 0.2772

describe("Tax Engine — Ontario $100,000", () => {
  const result = calculate(100_000, "ontario", 10);

  it("computes CPP1 correctly (at YMPE)", () => {
    // (74600 - 3500) × 0.119 = 71100 × 0.119 = 8460.90
    expect(result.cpp1Contribution).toBeCloseTo(8_460.90, 1);
  });

  it("computes CPP2 correctly (YMPE to YAMPE)", () => {
    // (min(100000, 85000) - 74600) × 0.08 = 10400 × 0.08 = 832
    expect(result.cpp2Contribution).toBeCloseTo(832, 1);
  });

  it("computes federal tax ≈ $12,763", () => {
    expect(result.federalTax).toBeCloseTo(12_762.66, 0);
  });

  it("computes Ontario provincial tax ≈ $5,661 (no surtax after CPP prov credit)", () => {
    expect(result.provincialTax).toBeCloseTo(5_661, 0);
  });

  it("computes total burden ≈ $27,717", () => {
    expect(result.totalBurden).toBeCloseTo(27_717, 0);
  });

  it("computes effective rate ≈ 27.7%", () => {
    expect(result.effectiveRate).toBeCloseTo(0.277, 2);
  });
});

// ── Ontario $200,000 (deep into surtax territory) ───────────────────────────
//
// 2026 figures:
// CPP1: (74600 - 3500) × 0.119 = 8460.90
// CPP2: (85000 - 74600) × 0.08 = 832.00
// totalCPP = 9292.90
// cppDeduction = 8460.9 × 0.5 + 832 = 5062.45
// fedTaxable = 200000 - 5062.45 = 194937.55
//
// Federal bracket tax (2026):
//   58523 × 0.14 = 8193.22
//   (117045 - 58523) × 0.205 = 58522 × 0.205 = 11997.01
//   (181440 - 117045) × 0.260 = 64395 × 0.260 = 16742.70
//   (194937.55 - 181440) × 0.290 = 13497.55 × 0.290 = 3914.29...
//   raw = 40847.22...
// BPA credit = 2303.28
// CPP credit = (8460.9 × 0.5) × 0.14 = 592.263
// fedTax = 40847.22 - 2303.28 - 592.263 ≈ 37951.68
//
// Provincial (Ontario): income = 194937.55
//   52886 × 0.0505 = 2670.743
//   (105775 - 52886) × 0.0915 = 52889 × 0.0915 = 4839.3435
//   (150000 - 105775) × 0.1116 = 44225 × 0.1116 = 4935.51
//   (194937.55 - 150000) × 0.1216 = 44937.55 × 0.1216 = 5464.41...
//   raw = 17910.01...
// BPA credit = 643.7235
// CPP prov credit = 4230.45 × 0.0505 = 213.64
// provTax (pre-surtax) = 17910.01 - 643.724 - 213.64 = 17052.65
// Surtax:
//   17052.65 > 5710 → (17052.65 - 5710) × 0.20 = 2268.53
//   17052.65 > 7307 → (17052.65 - 7307) × 0.36 = 3508.43
//   total surtax = 5776.96
// Final provTax = 17052.65 + 5776.96 ≈ 22829.60
//
// totalBurden = 37951.68 + 22829.60 + 9292.90 = 70074.18 → eff ≈ 0.3504

describe("Tax Engine — Ontario $200,000 (surtax both tiers)", () => {
  const result = calculate(200_000, "ontario", 12);

  it("computes total CPP at max (YMPE + YAMPE)", () => {
    expect(result.totalCPP).toBeCloseTo(9_292.9, 1);
  });

  it("computes federal tax ≈ $37,952", () => {
    expect(result.federalTax).toBeCloseTo(37_952, 0);
  });

  it("computes Ontario tax with both surtax tiers ≈ $22,830", () => {
    expect(result.provincialTax).toBeCloseTo(22_830, 0);
  });

  it("computes effective rate ≈ 35.0%", () => {
    // (37952 + 22830 + 9293) / 200000 ≈ 0.350
    expect(result.effectiveRate).toBeCloseTo(0.350, 2);
  });
});

// ── Quebec $100,000 (QPP rates + Quebec abatement) ──────────────────────────
//
// 2026 ceilings ($74,600 / $85,000). QPP/Quebec provincial figures are
// 2025-indexed (unchanged this roll); only the federal layer + CPP ceilings rolled.
//
// QPP1: (74600 - 3500) × 0.128 = 71100 × 0.128 = 9100.80
// QPP2: (85000 - 74600) × 0.08 = 10400 × 0.08 = 832.00
// totalCPP = 9932.80
//
// cppDeduction = 9100.8 × 0.5 + 832 = 5382.40
// fedTaxable = 100000 - 5382.4 = 94617.60
//
// Federal tax on 94617.60 (2026 brackets):
//   58523 × 0.14 = 8193.22
//   (94617.6 - 58523) × 0.205 = 36094.6 × 0.205 = 7399.39...
//   raw = 15592.61...
// BPA credit = 16452 × 0.14 = 2303.28
// CPP employee credit = (9100.8 × 0.5) × 0.14 = 4550.4 × 0.14 = 637.056
// fedTax = 15592.61 - 2303.28 - 637.056 = 12652.27...
// Quebec abatement: × (1 - 0.165) = 12652.27 × 0.835 ≈ 10564.65
//
// Provincial (Quebec, 2025-indexed): income = 94617.60
//   raw - BPA credit - CPP prov credit ≈ 12077.60

describe("Tax Engine — Quebec $100,000", () => {
  const result = calculate(100_000, "quebec", 8);

  it("uses QPP rates (higher than CPP)", () => {
    // QPP1 = 71100 × 0.128 = 9100.8 (vs CPP1 = 71100 × 0.119 = 8460.9)
    expect(result.cpp1Contribution).toBeCloseTo(9_100.8, 1);
  });

  it("applies Quebec abatement to federal tax", () => {
    // Federal tax after abatement should be ~16.5% less than non-Quebec
    expect(result.federalTax).toBeCloseTo(10_565, 0);
  });

  it("computes Quebec provincial tax ≈ $12,078", () => {
    expect(result.provincialTax).toBeCloseTo(12_078, 0);
  });
});

// ── Alberta $80,000 (simple province, 8% first bracket) ─────────────────────

describe("Tax Engine — Alberta $80,000", () => {
  const result = calculate(80_000, "alberta", 7);

  it("returns correct province name", () => {
    expect(result.provinceName).toBe("alberta");
  });

  it("uses CPP (not QPP)", () => {
    // 2026: income = 80000 > YMPE 74600, so:
    // cpp1Earnings = min(80000, 74600) - 3500 = 71100
    // cpp1 = 71100 × 0.119 = 8460.90
    expect(result.cpp1Contribution).toBeCloseTo(8_460.9, 1);
    // CPP2: min(80000, 85000) - 74600 = 5400 × 0.08 = 432
    expect(result.cpp2Contribution).toBeCloseTo(432, 1);
  });

  it("computes Alberta provincial tax at 8% first bracket", () => {
    // Alberta BPA = $22,323 at 8% (2025-indexed; unchanged this roll)
    // cppDeduction = 8460.9 × 0.5 + 432 = 4662.45
    // fedTaxable = 80000 - 4662.45 = 75337.55
    // First $60,000 × 8% = $4,800
    // ($75,337.55 - $60,000) × 10% ≈ $1,533.76
    // raw ≈ $6,333.76
    // BPA credit = 22323 × 0.08 = $1,785.84
    // CPP prov credit = 4230.45 × 0.08 = 338.44
    // provTax ≈ $4,209.48
    expect(result.provincialTax).toBeCloseTo(4_209, 0);
  });
});

// ── Income below BPA ─────────────────────────────────────────────────────────

describe("Tax Engine — Below BPA", () => {
  it("produces zero federal and provincial tax for $10,000 income", () => {
    const result = calculate(10_000, "ontario", 1);
    // BPA = $16,452 federal (2026), $12,747 Ontario — both exceed taxable income
    // Federal: fedTaxable ≈ 10000 - small cppDeduction
    // CPP1: (10000 - 3500) × 0.119 = 6500 × 0.119 = 773.50
    // cppDeduction = 773.5 × 0.5 = 386.75
    // fedTaxable = 10000 - 386.75 = 9613.25
    // bracket: 9613.25 × 0.14 = 1345.86
    // BPA credit = 16452 × 0.14 = 2303.28 → exceeds bracket tax
    expect(result.federalTax).toBe(0);
    expect(result.provincialTax).toBe(0);
    // But CPP still applies
    expect(result.totalCPP).toBeGreaterThan(0);
  });
});

// ── GST/HST Rates ────────────────────────────────────────────────────────────

describe("GST/HST Rates", () => {
  it("returns 13% for Ontario (HST)", () => {
    expect(gstHstRate("ontario")).toBe(0.13);
  });

  it("returns correct HST for Atlantic provinces", () => {
    expect(gstHstRate("novaScotia")).toBe(0.14); // reduced Apr 1, 2025
    expect(gstHstRate("newBrunswick")).toBe(0.15);
    expect(gstHstRate("newfoundland")).toBe(0.15);
    expect(gstHstRate("princeEdwardIsland")).toBe(0.15);
  });

  it("returns 14.975% for Quebec (GST + QST)", () => {
    expect(gstHstRate("quebec")).toBe(0.14975);
  });

  it("returns 5% for Saskatchewan (GST only, PST N/A on RE commissions)", () => {
    expect(gstHstRate("saskatchewan")).toBe(0.05);
  });

  it("returns 5% GST for Alberta, BC, Manitoba, territories", () => {
    expect(gstHstRate("alberta")).toBe(0.05);
    expect(gstHstRate("britishColumbia")).toBe(0.05);
    expect(gstHstRate("manitoba")).toBe(0.05);
    expect(gstHstRate("yukon")).toBe(0.05);
    expect(gstHstRate("northwestTerritories")).toBe(0.05);
    expect(gstHstRate("nunavut")).toBe(0.05);
  });

  it("returns correct labels", () => {
    expect(gstHstLabel("ontario")).toBe("HST");
    expect(gstHstLabel("quebec")).toBe("GST + QST");
    expect(gstHstLabel("saskatchewan")).toBe("GST");
    expect(gstHstLabel("alberta")).toBe("GST");
  });
});

// ── Provincial Info Completeness ─────────────────────────────────────────────

describe("Provincial Info — All 13 Provinces", () => {
  const provinces = [
    "alberta", "britishColumbia", "manitoba", "newBrunswick",
    "newfoundland", "northwestTerritories", "novaScotia", "nunavut",
    "ontario", "princeEdwardIsland", "quebec", "saskatchewan", "yukon",
  ] as const;

  for (const prov of provinces) {
    it(`returns valid info for ${prov}`, () => {
      const info = provincialInfo(prov);
      expect(info.basicPersonalAmount).toBeGreaterThan(0);
      expect(info.lowestRate).toBeGreaterThan(0);
      expect(info.brackets.length).toBeGreaterThanOrEqual(2);
      // Last bracket should have Infinity ceiling
      expect(info.brackets[info.brackets.length - 1][0]).toBe(Infinity);
    });

    it(`produces non-negative tax for ${prov} at $100k`, () => {
      const result = calculate(100_000, prov, 5);
      expect(result.totalBurden).toBeGreaterThan(0);
      expect(result.effectiveRate).toBeGreaterThan(0);
      expect(result.effectiveRate).toBeLessThan(1);
    });
  }
});

// ── Marginal Rate ────────────────────────────────────────────────────────────

describe("Marginal Rate", () => {
  it("returns combined federal + provincial marginal rate", () => {
    // At $80,000 Ontario (2026):
    // Federal bracket: $58,523–$117,045 → 20.5%
    // Ontario bracket: $52,886–$105,775 → 9.15%
    // Combined = 29.65%
    expect(marginalRate(80_000, "ontario")).toBeCloseTo(0.2965, 3);
  });

  it("applies Quebec abatement to marginal federal rate", () => {
    // At $80,000 Quebec (2026):
    // Federal: 20.5% × (1 - 0.165) = 20.5% × 0.835 = 17.1175%
    // Quebec bracket: $53,255–$106,495 → 19%
    // Combined = 36.1175%
    expect(marginalRate(80_000, "quebec")).toBeCloseTo(0.3612, 3);
  });
});
