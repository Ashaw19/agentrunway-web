/**
 * Layer 2: Canadian Tax Engine
 * ==============================
 * Tests for the 2025 CRA-verified tax calculation engine.
 *
 * All expected values are hand-calculated by tracing through bracketTax(),
 * cppContributions(), provincialTax(), and ontarioSurtax() step-by-step.
 *
 * Constants used (from source):
 *   FEDERAL_BPA = $16,129, FEDERAL_BPA_RATE = 14.5%
 *   CPP_BASIC_EXEMPTION = $3,500
 *   CPP_YMPE = $71,300, CPP_YAMPE = $81,200
 *   CPP1_SELF_RATE = 11.90%, CPP2_SELF_RATE = 8.00%
 *   QPP1_SELF_RATE = 12.80%, QPP2_SELF_RATE = 8.00%
 *   Ontario BPA = $12,747, lowestRate = 5.05%
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
    // $50,000 all in first bracket at 14.5%
    // tax = 50000 × 0.145 = $7,250
    const brackets: [number, number][] = [
      [57_375, 0.145], [114_750, 0.205], [177_882, 0.260],
      [253_414, 0.290], [Infinity, 0.330],
    ];
    expect(bracketTax(50_000, brackets)).toBeCloseTo(7_250, 2);
  });

  it("calculates federal tax on $80,000 (two brackets)", () => {
    // First $57,375 × 14.5% = $8,319.375
    // Next $22,625 × 20.5% = $4,638.125
    // Total = $12,957.50
    const brackets: [number, number][] = [
      [57_375, 0.145], [114_750, 0.205], [177_882, 0.260],
      [253_414, 0.290], [Infinity, 0.330],
    ];
    expect(bracketTax(80_000, brackets)).toBeCloseTo(12_957.5, 2);
  });

  it("returns 0 for zero income", () => {
    const brackets: [number, number][] = [[50_000, 0.1], [Infinity, 0.2]];
    expect(bracketTax(0, brackets)).toBe(0);
  });
});

// ── Ontario $66,375 (test agent exact income) ────────────────────────────────
//
// Hand calculation:
//   CPP1: earnings = min(66375, 71300) - 3500 = 62875
//         cpp1 = 62875 × 0.1190 = 7482.125
//   CPP2: earnings = max(0, min(66375, 81200) - 71300) = 0 → cpp2 = 0
//   totalCPP = 7482.125
//
//   cppDeduction = 7482.125 × 0.5 + 0 = 3741.0625
//   fedTaxable = 66375 - 3741.0625 = 62633.9375
//
//   Federal bracket tax:
//     57375 × 0.145 = 8319.375
//     (62633.9375 - 57375) × 0.205 = 5258.9375 × 0.205 = 1078.082...
//     raw = 9397.457...
//   BPA credit = 16129 × 0.145 = 2338.705
//   fedTax = 9397.457... - 2338.705 = 7058.752...
//   CPP employee credit = (7482.125 × 0.5) × 0.145 = 3741.0625 × 0.145 = 542.454...
//   fedTax = 7058.752... - 542.454... ≈ 6516.30
//
//   Provincial (Ontario): income = 62633.9375
//     52886 × 0.0505 = 2670.743
//     (62633.9375 - 52886) × 0.0915 = 9747.9375 × 0.0915 = 891.936...
//     raw = 3562.679...
//     BPA credit = 12747 × 0.0505 = 643.7235
//     provTax = 3562.679... - 643.7235 = 2918.956...
//     Surtax: 2918.96 < 5710 → no surtax
//     Final provTax ≈ 2918.96
//
//   totalTax = 6516.30 + 2918.96 = 9435.26
//   totalBurden = 9435.26 + 7482.125 = 16917.38
//   effectiveRate = 16917.38 / 66375 ≈ 0.2549

describe("Tax Engine — Ontario $66,375", () => {
  const result = calculate(66_375, "ontario", 6);

  it("computes CPP1 correctly", () => {
    // (min(66375, 71300) - 3500) × 0.119 = 62875 × 0.119 = 7482.125
    expect(result.cpp1Contribution).toBeCloseTo(7_482.125, 1);
  });

  it("computes CPP2 as zero (below YMPE)", () => {
    expect(result.cpp2Contribution).toBe(0);
  });

  it("computes federal tax ≈ $6,516", () => {
    expect(result.federalTax).toBeCloseTo(6_516.30, 0);
  });

  it("computes Ontario provincial tax ≈ $2,919 (no surtax)", () => {
    expect(result.provincialTax).toBeCloseTo(2_919, 0);
  });

  it("computes total burden ≈ $16,917", () => {
    expect(result.totalBurden).toBeCloseTo(16_917, 0);
  });

  it("computes effective rate ≈ 25.5%", () => {
    expect(result.effectiveRate).toBeCloseTo(0.255, 2);
  });

  it("computes quarterly estimate = burden / 4", () => {
    expect(result.quarterlyEstimate).toBeCloseTo(result.totalBurden / 4, 2);
  });

  it("computes per-deal set-aside = burden / 6 deals", () => {
    expect(result.perDealSetAside).toBeCloseTo(result.totalBurden / 6, 2);
  });
});

// ── Ontario $100,000 (crosses into CPP2 + Ontario surtax territory) ─────────
//
// Hand calculation:
//   CPP1: earnings = min(100000, 71300) - 3500 = 67800
//         cpp1 = 67800 × 0.119 = 8068.20
//   CPP2: earnings = min(100000, 81200) - 71300 = 9900
//         cpp2 = 9900 × 0.08 = 792.00
//   totalCPP = 8860.20
//
//   cppDeduction = 8068.2 × 0.5 + 792 = 4826.10
//   fedTaxable = 100000 - 4826.10 = 95173.90
//
//   Federal bracket tax:
//     57375 × 0.145 = 8319.375
//     (95173.9 - 57375) × 0.205 = 37798.9 × 0.205 = 7748.7745
//     raw = 16068.1495
//   BPA credit = 2338.705
//   fedTax = 16068.1495 - 2338.705 = 13729.4445
//   CPP credit = (8068.2 × 0.5) × 0.145 = 584.9445
//   fedTax = 13729.4445 - 584.9445 = 13144.50
//
//   Provincial (Ontario): income = 95173.9
//     52886 × 0.0505 = 2670.743
//     (95173.9 - 52886) × 0.0915 = 42287.9 × 0.0915 = 3869.343
//     raw = 6540.086
//     BPA credit = 643.7235
//     provTax = 6540.086 - 643.724 = 5896.362
//     Surtax: 5896.36 > 5710 → (5896.36 - 5710) × 0.20 = 37.27
//             5896.36 < 7307 → no second tier
//     Final provTax = 5896.36 + 37.27 = 5933.63
//
//   totalTax = 13144.50 + 5933.63 = 19078.13
//   totalBurden = 19078.13 + 8860.20 = 27938.33
//   effectiveRate = 27938.33 / 100000 ≈ 0.2794

describe("Tax Engine — Ontario $100,000", () => {
  const result = calculate(100_000, "ontario", 10);

  it("computes CPP1 correctly (at YMPE)", () => {
    // (71300 - 3500) × 0.119 = 67800 × 0.119 = 8068.20
    expect(result.cpp1Contribution).toBeCloseTo(8_068.20, 1);
  });

  it("computes CPP2 correctly (YMPE to YAMPE)", () => {
    // (min(100000, 81200) - 71300) × 0.08 = 9900 × 0.08 = 792
    expect(result.cpp2Contribution).toBeCloseTo(792, 1);
  });

  it("computes federal tax ≈ $13,144.50", () => {
    // Exact: 13144.5 (hand-calculated from bracket math)
    expect(result.federalTax).toBeCloseTo(13_144.5, 0);
  });

  it("computes Ontario provincial tax with surtax ≈ $5,934", () => {
    expect(result.provincialTax).toBeCloseTo(5_934, 0);
  });

  it("computes total burden ≈ $27,938", () => {
    expect(result.totalBurden).toBeCloseTo(27_938, 0);
  });

  it("computes effective rate ≈ 27.9%", () => {
    expect(result.effectiveRate).toBeCloseTo(0.279, 2);
  });
});

// ── Ontario $200,000 (deep into surtax territory) ───────────────────────────
//
// CPP1: (71300 - 3500) × 0.119 = 8068.20
// CPP2: (81200 - 71300) × 0.08 = 792.00
// totalCPP = 8860.20
// cppDeduction = 8068.2 × 0.5 + 792 = 4826.10
// fedTaxable = 200000 - 4826.10 = 195173.90
//
// Federal bracket tax:
//   57375 × 0.145 = 8319.375
//   (114750 - 57375) × 0.205 = 57375 × 0.205 = 11761.875
//   (177882 - 114750) × 0.260 = 63132 × 0.260 = 16414.32
//   (195173.9 - 177882) × 0.290 = 17291.9 × 0.290 = 5014.651
//   raw = 41510.221
// BPA credit = 2338.705
// fedTax = 41510.221 - 2338.705 = 39171.516
// CPP credit = 584.9445
// fedTax = 39171.516 - 584.9445 = 38586.572
//
// Provincial (Ontario): income = 195173.9
//   52886 × 0.0505 = 2670.743
//   (105775 - 52886) × 0.0915 = 52889 × 0.0915 = 4839.3435
//   (150000 - 105775) × 0.1116 = 44225 × 0.1116 = 4935.51
//   (195173.9 - 150000) × 0.1216 = 45173.9 × 0.1216 = 5493.154
//   raw = 17938.751
// BPA credit = 643.7235
// provTax = 17938.751 - 643.724 = 17295.027
// Surtax:
//   17295.027 > 5710 → (17295.027 - 5710) × 0.20 = 2317.005
//   17295.027 > 7307 → (17295.027 - 7307) × 0.36 = 3595.690
//   total surtax = 5912.695
// Final provTax = 17295.027 + 5912.695 = 23207.723

describe("Tax Engine — Ontario $200,000 (surtax both tiers)", () => {
  const result = calculate(200_000, "ontario", 12);

  it("computes total CPP at max (YMPE + YAMPE)", () => {
    expect(result.totalCPP).toBeCloseTo(8_860.2, 1);
  });

  it("computes federal tax ≈ $38,587", () => {
    expect(result.federalTax).toBeCloseTo(38_587, 0);
  });

  it("computes Ontario tax with both surtax tiers ≈ $23,208", () => {
    expect(result.provincialTax).toBeCloseTo(23_208, 0);
  });

  it("computes effective rate ≈ 35.3%", () => {
    // (38587 + 23208 + 8860) / 200000 ≈ 0.353
    expect(result.effectiveRate).toBeCloseTo(0.353, 2);
  });
});

// ── Quebec $100,000 (QPP rates + Quebec abatement) ──────────────────────────
//
// QPP1: (71300 - 3500) × 0.128 = 67800 × 0.128 = 8678.40
// QPP2: (81200 - 71300) × 0.08 = 9900 × 0.08 = 792.00
// totalCPP = 9470.40
//
// cppDeduction = 8678.4 × 0.5 + 792 = 5131.20
// fedTaxable = 100000 - 5131.2 = 94868.80
//
// Federal tax on 94868.80:
//   57375 × 0.145 = 8319.375
//   (94868.8 - 57375) × 0.205 = 37493.8 × 0.205 = 7686.229
//   raw = 16005.604
// BPA credit = 2338.705
// fedTax = 16005.604 - 2338.705 = 13666.899
// CPP employee credit = (8678.4 × 0.5) × 0.145 = 4339.2 × 0.145 = 629.184
// fedTax = 13666.899 - 629.184 = 13037.715
// Quebec abatement: fedTax × (1 - 0.165) = 13037.715 × 0.835 = 10886.492
//
// Provincial (Quebec): income = 94868.8
//   BPA = 18571, lowestRate = 0.14
//   53255 × 0.14 = 7455.70
//   (94868.8 - 53255) × 0.19 = 41613.8 × 0.19 = 7906.622
//   raw = 15362.322
// BPA credit = 18571 × 0.14 = 2599.94
// provTax = 15362.322 - 2599.94 = 12762.382

describe("Tax Engine — Quebec $100,000", () => {
  const result = calculate(100_000, "quebec", 8);

  it("uses QPP rates (higher than CPP)", () => {
    // QPP1 = 67800 × 0.128 = 8678.4 (vs CPP1 = 67800 × 0.119 = 8068.2)
    expect(result.cpp1Contribution).toBeCloseTo(8_678.4, 1);
  });

  it("applies Quebec abatement to federal tax", () => {
    // Federal tax after abatement should be ~16.5% less than non-Quebec
    expect(result.federalTax).toBeCloseTo(10_886, 0);
  });

  it("computes Quebec provincial tax ≈ $12,762", () => {
    expect(result.provincialTax).toBeCloseTo(12_762, 0);
  });
});

// ── Alberta $80,000 (simple province, 8% first bracket) ─────────────────────

describe("Tax Engine — Alberta $80,000", () => {
  const result = calculate(80_000, "alberta", 7);

  it("returns correct province name", () => {
    expect(result.provinceName).toBe("alberta");
  });

  it("uses CPP (not QPP)", () => {
    // CPP1: (71300 - 3500) × 0.119 = 8068.20 (income > YMPE)
    // Actually income = 80000 > 71300, so:
    // cpp1Earnings = min(80000, 71300) - 3500 = 67800
    // cpp1 = 67800 × 0.119 = 8068.20
    expect(result.cpp1Contribution).toBeCloseTo(8_068.2, 1);
    // CPP2: min(80000, 81200) - 71300 = 8700 × 0.08 = 696
    expect(result.cpp2Contribution).toBeCloseTo(696, 1);
  });

  it("computes Alberta provincial tax at 8% first bracket", () => {
    // Alberta BPA = $22,323 at 8%
    // Income (fed taxable) ≈ 80000 - cppDeduction ≈ 75,265.9
    // First $60,000 × 8% = $4,800
    // ($75,265.9 - $60,000) × 10% ≈ $1,526.59
    // raw ≈ $6,326.59
    // BPA credit = 22323 × 0.08 = $1,785.84
    // provTax ≈ $4,540.75
    expect(result.provincialTax).toBeCloseTo(4_541, 0);
  });
});

// ── Income below BPA ─────────────────────────────────────────────────────────

describe("Tax Engine — Below BPA", () => {
  it("produces zero federal and provincial tax for $10,000 income", () => {
    const result = calculate(10_000, "ontario", 1);
    // BPA = $16,129 federal, $12,747 Ontario — both exceed taxable income
    // Federal: fedTaxable ≈ 10000 - small cppDeduction
    // CPP1: (10000 - 3500) × 0.119 = 6500 × 0.119 = 773.50
    // cppDeduction = 773.5 × 0.5 = 386.75
    // fedTaxable = 10000 - 386.75 = 9613.25
    // bracket: 9613.25 × 0.145 = 1393.92
    // BPA credit = 16129 × 0.145 = 2338.71 → exceeds bracket tax
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

  it("returns 15% for Atlantic provinces (HST)", () => {
    expect(gstHstRate("novaScotia")).toBe(0.15);
    expect(gstHstRate("newBrunswick")).toBe(0.15);
    expect(gstHstRate("newfoundland")).toBe(0.15);
    expect(gstHstRate("princeEdwardIsland")).toBe(0.15);
  });

  it("returns 14.975% for Quebec (GST + QST)", () => {
    expect(gstHstRate("quebec")).toBe(0.14975);
  });

  it("returns 11% for Saskatchewan (GST + PST)", () => {
    expect(gstHstRate("saskatchewan")).toBe(0.11);
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
    expect(gstHstLabel("saskatchewan")).toBe("GST + PST");
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
    // At $80,000 Ontario:
    // Federal bracket: $57,375–$114,750 → 20.5%
    // Ontario bracket: $52,886–$105,775 → 9.15%
    // Combined = 29.65%
    expect(marginalRate(80_000, "ontario")).toBeCloseTo(0.2965, 3);
  });

  it("applies Quebec abatement to marginal federal rate", () => {
    // At $80,000 Quebec:
    // Federal: 20.5% × (1 - 0.165) = 20.5% × 0.835 = 17.1175%
    // Quebec bracket: $53,255–$106,495 → 19%
    // Combined = 36.1175%
    expect(marginalRate(80_000, "quebec")).toBeCloseTo(0.3612, 3);
  });
});
