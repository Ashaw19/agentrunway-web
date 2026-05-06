// CanadianTaxEngine — ported from Swift
// Comprehensive Canadian self-employed income tax estimator.
// Federal + all 13 provinces/territories, CPP/QPP, Ontario surtax, Quebec abatement.
// Tax year: 2025 (primary source: CRA; secondary reference: TaxTips.ca).
//
// ESTIMATE ONLY — Not legal or tax advice.

import type { Province } from "../types/database";

// ⚠️  TAX_YEAR = 2025 — Update all three engine files together:
// - canadian-tax-engine.ts
// - corporate-tax-engine.ts
// - tax-optimization-engine.ts

/** Round to the nearest cent (CRA rounds to the penny). */
const cents = (n: number) => Math.round(n * 100) / 100;

// ── Result ──────────────────────────────────────────────────────────────────

export interface CanadianTaxResult {
  grossIncome: number;
  cpp1Contribution: number;
  cpp2Contribution: number;
  totalCPP: number;
  federalTax: number;
  provincialTax: number;
  totalTax: number;
  totalBurden: number;
  effectiveRate: number;
  quarterlyEstimate: number;
  perDealSetAside: number;
  projectedDealCount: number;
  provinceName: string;
  taxYear: number;
}

// ── Constants ───────────────────────────────────────────────────────────────

const TAX_YEAR = 2025;

// Federal (2025 confirmed — rate cut from 15% to 14% effective Jul 1, blended 14.5%)
export const FEDERAL_BPA = 16_129;
export const FEDERAL_BPA_RATE = 0.145; // blended 2025 rate (15% Jan–Jun, 14% Jul–Dec)

export const FEDERAL_BRACKETS: [number, number][] = [
  [57_375,  0.145], // blended 14.5% for 2025
  [114_750, 0.205],
  [177_882, 0.260],
  [253_414, 0.290],
  [Infinity, 0.330],
];

// CPP/QPP (2025 confirmed by CRA)
const CPP_BASIC_EXEMPTION = 3_500;
const CPP_YMPE  = 71_300; // Year's Maximum Pensionable Earnings
const CPP_YAMPE = 81_200; // Year's Additional Maximum Pensionable Earnings

// Self-employed rates (employee + employer combined)
const CPP1_SELF_RATE = 0.0595 * 2; // 11.90%
const CPP2_SELF_RATE = 0.04   * 2; //  8.00%
const QPP1_SELF_RATE = 0.064  * 2; // 12.80%
const QPP2_SELF_RATE = 0.04   * 2; //  8.00%

// ── Main calculation ────────────────────────────────────────────────────────

export function calculate(
  netIncome: number,
  province: Province,
  dealCount: number,
): CanadianTaxResult {
  if (netIncome <= 0) return zeroResult(province, dealCount);

  // Step 1: CPP/QPP contributions
  const { cpp1, cpp2 } = cppContributions(netIncome, province);
  const totalCPP = cpp1 + cpp2;

  // Self-employed deduction:
  //   CPP1 — 50% deductible from income (employer half); employee half → credit below
  //   CPP2 — 100% deductible from income (CRA confirmed for 2024+)
  const cppDeduction = cpp1 * 0.5 + cpp2;

  // Step 2: Federal income tax
  const fedTaxable = Math.max(0, netIncome - cppDeduction);
  let fedTax = bracketTax(fedTaxable, FEDERAL_BRACKETS);

  // Federal BPA non-refundable credit
  fedTax = Math.max(0, fedTax - FEDERAL_BPA * FEDERAL_BPA_RATE);

  // CPP employee-portion credit (14.5% of employee-half CPP1 only; CPP2 is a deduction)
  const cppEmployeeHalf = cpp1 * 0.5;
  const cppFedCredit = cppEmployeeHalf * FEDERAL_BPA_RATE;
  fedTax = Math.max(0, fedTax - cppFedCredit);

  // Quebec Abatement: 16.5% off federal tax
  if (province === "quebec") fedTax *= 1.0 - 0.165;

  // Step 3: Provincial income tax (includes provincial CPP credit)
  const provTaxable = fedTaxable;
  const provTax = provincialTax(provTaxable, province, cppEmployeeHalf);

  const totalTax = fedTax + provTax;
  const totalBurden = totalTax + totalCPP;
  const effRate = totalBurden / netIncome;

  return {
    grossIncome: cents(netIncome),
    cpp1Contribution: cents(cpp1),
    cpp2Contribution: cents(cpp2),
    totalCPP: cents(totalCPP),
    federalTax: cents(fedTax),
    provincialTax: cents(provTax),
    totalTax: cents(totalTax),
    totalBurden: cents(totalBurden),
    effectiveRate: Math.round(effRate * 10000) / 10000, // 4 decimal places for rate
    quarterlyEstimate: cents(totalBurden / 4),
    perDealSetAside: cents(dealCount > 0 ? totalBurden / dealCount : 0),
    projectedDealCount: dealCount,
    provinceName: province,
    taxYear: TAX_YEAR,
  };
}

// ── CPP/QPP contributions ───────────────────────────────────────────────────

function cppContributions(
  netIncome: number,
  province: Province,
): { cpp1: number; cpp2: number } {
  const isQuebec = province === "quebec";
  const rate1 = isQuebec ? QPP1_SELF_RATE : CPP1_SELF_RATE;
  const rate2 = isQuebec ? QPP2_SELF_RATE : CPP2_SELF_RATE;

  // CPP1/QPP1: on earnings from $3,500 up to YMPE
  const cpp1Earnings = Math.max(
    0,
    Math.min(netIncome, CPP_YMPE) - CPP_BASIC_EXEMPTION,
  );
  const cpp1 = cpp1Earnings * rate1;

  // CPP2/QPP2: on earnings above YMPE up to YAMPE
  const cpp2Earnings = Math.max(0, Math.min(netIncome, CPP_YAMPE) - CPP_YMPE);
  const cpp2 = cpp2Earnings * rate2;

  return { cpp1, cpp2 };
}

// ── Provincial tax dispatcher ───────────────────────────────────────────────

function provincialTax(income: number, province: Province, cppEmployeeHalf: number = 0): number {
  const info = provincialInfo(province);
  let tax = bracketTax(income, info.brackets);

  // Provincial BPA credit
  const bpaCredit = info.basicPersonalAmount * info.lowestRate;
  tax = Math.max(0, tax - bpaCredit);

  // Provincial CPP/QPP employee-portion non-refundable credit
  // Each province gives a credit at its lowest marginal rate on the employee half of CPP1
  if (cppEmployeeHalf > 0) {
    const cppProvCredit = cppEmployeeHalf * info.lowestRate;
    tax = Math.max(0, tax - cppProvCredit);
  }

  // Ontario surtax (applied after all credits)
  if (province === "ontario") {
    tax = Math.max(0, tax + ontarioSurtax(tax));
  }

  return Math.max(0, tax);
}

// ── Ontario Surtax (2025 confirmed thresholds) ──────────────────────────────

function ontarioSurtax(provTax: number): number {
  let surtax = 0;
  if (provTax > 5_710) surtax += (provTax - 5_710) * 0.20;
  if (provTax > 7_307) surtax += (provTax - 7_307) * 0.36;
  return surtax;
}

// ── Generic bracket calculator ──────────────────────────────────────────────

export function bracketTax(
  income: number,
  brackets: [number, number][],
): number {
  let tax = 0;
  let prev = 0;
  for (const [limit, rate] of brackets) {
    if (income <= prev) break;
    tax += (Math.min(income, limit) - prev) * rate;
    prev = limit;
  }
  return tax;
}

// ── Provincial Info Table (2025 confirmed rates) ─────────────────────────────

interface ProvincialInfo {
  basicPersonalAmount: number;
  lowestRate: number;
  brackets: [number, number][];
}

export function provincialInfo(province: Province): ProvincialInfo {
  switch (province) {
    case "alberta":
      // 2025: New 8% first bracket introduced; BPA raised to $22,323
      return {
        basicPersonalAmount: 22_323, lowestRate: 0.08,
        brackets: [
          [60_000,  0.08],
          [151_234, 0.10],
          [181_481, 0.12],
          [241_974, 0.13],
          [362_961, 0.14],
          [Infinity, 0.15],
        ],
      };
    case "britishColumbia":
      return {
        basicPersonalAmount: 12_932, lowestRate: 0.0506,
        brackets: [
          [49_279,  0.0506],
          [98_560,  0.077],
          [113_158, 0.105],
          [137_407, 0.1229],
          [186_306, 0.147],
          [259_829, 0.168],
          [Infinity, 0.205],
        ],
      };
    case "manitoba":
      return {
        basicPersonalAmount: 15_780, lowestRate: 0.108,
        brackets: [[47_000, 0.108], [100_000, 0.1275], [Infinity, 0.174]],
      };
    case "newBrunswick":
      return {
        basicPersonalAmount: 13_396, lowestRate: 0.094,
        brackets: [
          [51_306,  0.094],
          [102_614, 0.14],
          [190_060, 0.16],
          [Infinity, 0.195],
        ],
      };
    case "newfoundland":
      return {
        basicPersonalAmount: 11_067, lowestRate: 0.087,
        brackets: [
          [44_192,    0.087],
          [88_382,    0.145],
          [157_792,   0.158],
          [220_910,   0.178],
          [282_214,   0.198],
          [564_429,   0.208],
          [1_128_858, 0.213],
          [Infinity,  0.218],
        ],
      };
    case "northwestTerritories":
      return {
        basicPersonalAmount: 17_842, lowestRate: 0.059,
        brackets: [
          [51_964,  0.059],
          [103_930, 0.086],
          [168_967, 0.122],
          [Infinity, 0.1405],
        ],
      };
    case "novaScotia":
      // 2025: NS budget raised BPA to $11,744 and indexed brackets
      return {
        basicPersonalAmount: 11_744, lowestRate: 0.0879,
        brackets: [
          [30_507,  0.0879],
          [61_015,  0.1495],
          [95_883,  0.1667],
          [154_650, 0.175],
          [Infinity, 0.21],
        ],
      };
    case "nunavut":
      return {
        basicPersonalAmount: 19_274, lowestRate: 0.04,
        brackets: [
          [54_707,  0.04],
          [109_413, 0.07],
          [177_881, 0.09],
          [Infinity, 0.115],
        ],
      };
    case "ontario":
      return {
        basicPersonalAmount: 12_747, lowestRate: 0.0505,
        brackets: [
          [52_886,  0.0505],
          [105_775, 0.0915],
          [150_000, 0.1116],
          [220_000, 0.1216],
          [Infinity, 0.1316],
        ],
      };
    case "princeEdwardIsland":
      // 2025: Rates reduced; BPA raised to $14,650
      return {
        basicPersonalAmount: 14_650, lowestRate: 0.095,
        brackets: [
          [33_328,  0.095],
          [64_656,  0.1347],
          [105_000, 0.166],
          [140_000, 0.1762],
          [Infinity, 0.19],
        ],
      };
    case "quebec":
      // BPA raised to $18,571; brackets confirmed correct for 2025
      return {
        basicPersonalAmount: 18_571, lowestRate: 0.14,
        brackets: [
          [53_255,  0.14],
          [106_495, 0.19],
          [129_590, 0.24],
          [Infinity, 0.2575],
        ],
      };
    case "saskatchewan":
      return {
        basicPersonalAmount: 19_491, lowestRate: 0.105,
        brackets: [
          [53_463,  0.105],
          [152_750, 0.125],
          [Infinity, 0.145],
        ],
      };
    case "yukon":
      // Third bracket ceiling aligns with federal third bracket ($177,882)
      return {
        basicPersonalAmount: 16_129, lowestRate: 0.064,
        brackets: [
          [57_375,  0.064],
          [114_750, 0.09],
          [177_882, 0.109],
          [500_000, 0.128],
          [Infinity, 0.15],
        ],
      };
  }
}

// ── Bracket Breakdown Helper (for transparency UI) ──────────────────────────

export interface BracketSlice {
  /** Lower bound of this bracket (inclusive). */
  from: number;
  /** Upper bound of this bracket (or Infinity). */
  to: number;
  /** Marginal rate for this bracket. */
  rate: number;
  /** Income that falls into this bracket. */
  incomeInBracket: number;
  /** Tax produced by income in this bracket. */
  taxInBracket: number;
}

/**
 * Decompose a `bracketTax` calculation into per-bracket slices for display.
 * The sum of `taxInBracket` equals `bracketTax(income, brackets)`.
 */
export function bracketBreakdown(
  income: number,
  brackets: [number, number][],
): BracketSlice[] {
  const slices: BracketSlice[] = [];
  let prev = 0;
  for (const [limit, rate] of brackets) {
    const inBracket = Math.max(0, Math.min(income, limit) - prev);
    slices.push({
      from: prev,
      to: limit,
      rate,
      incomeInBracket: cents(inBracket),
      taxInBracket: cents(inBracket * rate),
    });
    prev = limit;
    if (income <= limit) break;
  }
  return slices;
}

// ── Marginal Rate Helper ────────────────────────────────────────────────────

/** Combined marginal rate (federal + provincial) at a given income level. */
export function marginalRate(income: number, province: Province): number {
  const info = provincialInfo(province);
  const fedMarginal = marginalBracketRate(income, FEDERAL_BRACKETS);
  const provMarginal = marginalBracketRate(income, info.brackets);
  const adjFedMarginal =
    province === "quebec" ? fedMarginal * (1.0 - 0.165) : fedMarginal;
  return adjFedMarginal + provMarginal;
}

function marginalBracketRate(
  income: number,
  brackets: [number, number][],
): number {
  for (const [limit, rate] of brackets) {
    if (income <= limit) return rate;
  }
  return brackets[brackets.length - 1]?.[1] ?? 0;
}

// ── Zero result helper ──────────────────────────────────────────────────────

function zeroResult(province: Province, dealCount: number): CanadianTaxResult {
  return {
    grossIncome: 0, cpp1Contribution: 0, cpp2Contribution: 0, totalCPP: 0,
    federalTax: 0, provincialTax: 0, totalTax: 0, totalBurden: 0,
    effectiveRate: 0, quarterlyEstimate: 0, perDealSetAside: 0,
    projectedDealCount: dealCount, provinceName: province, taxYear: TAX_YEAR,
  };
}

// ── GST/HST utilities ───────────────────────────────────────────────────────

/** GST/HST/QST/PST rate agents charge on commissions, by province.
 *  HST provinces (harmonised): ON 13%, NB/NL/PE 15%, NS 14% (reduced Apr 1, 2025)
 *  QST province: QC GST 5% + QST 9.975% = 14.975%
 *  PST: SK PST does not apply to real estate commission services (not in SK PST
 *    enumerated taxable services list). BC/MB PST also does NOT apply to
 *    residential real estate commissions.
 *  All others: GST 5% only
 *
 *  CRA: canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/charge-collect-which-rate.html
 */
export function gstHstRate(province: string): number {
  switch (province) {
    case "ontario":                 return 0.13;
    case "novaScotia":              return 0.14;    // reduced from 15% to 14% Apr 1, 2025 (CRA Notice 342)
    case "newBrunswick":            return 0.15;
    case "newfoundland":            return 0.15;
    case "princeEdwardIsland":      return 0.15;
    case "quebec":                  return 0.14975; // GST + QST
    case "saskatchewan":            return 0.05;    // GST only — SK PST does not apply to real estate commission services
    default:                        return 0.05;    // GST only (AB, BC, MB, territories)
  }
}

/** Human-readable label for the tax type by province */
export function gstHstLabel(province: string): string {
  switch (province) {
    case "ontario":
    case "novaScotia":
    case "newBrunswick":
    case "newfoundland":
    case "princeEdwardIsland":
      return "HST";
    case "quebec":
      return "GST + QST";
    case "saskatchewan":
      return "GST";
    default:
      return "GST";
  }
}
