// CanadianTaxEngine — ported from Swift
// Comprehensive Canadian self-employed income tax estimator.
// Federal + all 13 provinces/territories, CPP/QPP, Ontario surtax, Quebec abatement.
// Tax year: 2025 (estimated from confirmed 2024 CRA figures).
//
// ESTIMATE ONLY — Not legal or tax advice.

import type { Province } from "@/lib/types/database";

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

// Federal (2025 estimated)
const FEDERAL_BPA = 16_129;
const FEDERAL_BPA_RATE = 0.15;

const FEDERAL_BRACKETS: [number, number][] = [
  [57_375, 0.150],
  [114_750, 0.205],
  [159_154, 0.260],
  [220_000, 0.290],
  [Infinity, 0.330],
];

// CPP/QPP (2025)
const CPP_BASIC_EXEMPTION = 3_500;
const CPP_YMPE = 71_300;
const CPP_YAMPE = 81_900;

// Self-employed rates (employee + employer combined)
const CPP1_SELF_RATE = 0.0595 * 2; // 11.90%
const CPP2_SELF_RATE = 0.04 * 2; // 8.00%
const QPP1_SELF_RATE = 0.064 * 2; // 12.80%
const QPP2_SELF_RATE = 0.04 * 2; // 8.00%

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

  // Self-employed deduct 50% of total CPP
  const cppDeduction = totalCPP * 0.5;

  // Step 2: Federal income tax
  const fedTaxable = Math.max(0, netIncome - cppDeduction);
  let fedTax = bracketTax(fedTaxable, FEDERAL_BRACKETS);

  // Federal BPA non-refundable credit
  fedTax = Math.max(0, fedTax - FEDERAL_BPA * FEDERAL_BPA_RATE);

  // CPP employee-portion credit (15% of employee-half CPP1)
  const cppEmployeeHalf = cpp1 * 0.5;
  const cppFedCredit = cppEmployeeHalf * FEDERAL_BPA_RATE;
  fedTax = Math.max(0, fedTax - cppFedCredit);

  // Quebec Abatement: 16.5% off federal tax
  if (province === "quebec") fedTax *= 1.0 - 0.165;

  // Step 3: Provincial income tax
  const provTaxable = fedTaxable;
  const provTax = provincialTax(provTaxable, province);

  const totalTax = fedTax + provTax;
  const totalBurden = totalTax + totalCPP;
  const effRate = totalBurden / netIncome;

  return {
    grossIncome: netIncome,
    cpp1Contribution: cpp1,
    cpp2Contribution: cpp2,
    totalCPP,
    federalTax: fedTax,
    provincialTax: provTax,
    totalTax,
    totalBurden,
    effectiveRate: effRate,
    quarterlyEstimate: totalBurden / 4,
    perDealSetAside: dealCount > 0 ? totalBurden / dealCount : 0,
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

function provincialTax(income: number, province: Province): number {
  const info = provincialInfo(province);
  let tax = bracketTax(income, info.brackets);

  // Provincial BPA credit
  const bpaCredit = info.basicPersonalAmount * info.lowestRate;
  tax = Math.max(0, tax - bpaCredit);

  // Ontario surtax
  if (province === "ontario") {
    tax = Math.max(0, tax + ontarioSurtax(tax));
  }

  return Math.max(0, tax);
}

// ── Ontario Surtax ──────────────────────────────────────────────────────────

function ontarioSurtax(provTax: number): number {
  let surtax = 0;
  if (provTax > 5_387) surtax += (provTax - 5_387) * 0.2;
  if (provTax > 6_902) surtax += (provTax - 6_902) * 0.36;
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

// ── Provincial Info Table (2025 brackets) ───────────────────────────────────

interface ProvincialInfo {
  basicPersonalAmount: number;
  lowestRate: number;
  brackets: [number, number][];
}

export function provincialInfo(province: Province): ProvincialInfo {
  switch (province) {
    case "alberta":
      return {
        basicPersonalAmount: 21_003, lowestRate: 0.1,
        brackets: [[148_269, 0.1], [177_922, 0.12], [237_230, 0.13], [355_845, 0.14], [Infinity, 0.15]],
      };
    case "britishColumbia":
      return {
        basicPersonalAmount: 12_215, lowestRate: 0.0506,
        brackets: [[45_654, 0.0506], [91_310, 0.077], [104_835, 0.105], [127_299, 0.1229], [172_602, 0.147], [240_716, 0.168], [Infinity, 0.205]],
      };
    case "manitoba":
      return {
        basicPersonalAmount: 15_780, lowestRate: 0.108,
        brackets: [[47_000, 0.108], [100_000, 0.1275], [Infinity, 0.174]],
      };
    case "newBrunswick":
      return {
        basicPersonalAmount: 12_707, lowestRate: 0.094,
        brackets: [[49_958, 0.094], [99_916, 0.14], [185_064, 0.16], [Infinity, 0.195]],
      };
    case "newfoundland":
      return {
        basicPersonalAmount: 10_818, lowestRate: 0.087,
        brackets: [[43_198, 0.087], [86_395, 0.145], [154_244, 0.158], [215_943, 0.178], [275_870, 0.198], [551_739, 0.208], [Infinity, 0.213]],
      };
    case "northwestTerritories":
      return {
        basicPersonalAmount: 16_593, lowestRate: 0.059,
        brackets: [[50_597, 0.059], [101_198, 0.086], [164_525, 0.122], [Infinity, 0.1405]],
      };
    case "novaScotia":
      return {
        basicPersonalAmount: 8_481, lowestRate: 0.0879,
        brackets: [[29_590, 0.0879], [59_180, 0.1495], [93_000, 0.1667], [150_000, 0.175], [Infinity, 0.21]],
      };
    case "nunavut":
      return {
        basicPersonalAmount: 17_925, lowestRate: 0.04,
        brackets: [[53_268, 0.04], [106_537, 0.07], [173_205, 0.09], [Infinity, 0.115]],
      };
    case "ontario":
      return {
        basicPersonalAmount: 12_026, lowestRate: 0.0505,
        brackets: [[51_446, 0.0505], [102_894, 0.0915], [150_000, 0.1116], [220_000, 0.1216], [Infinity, 0.1316]],
      };
    case "princeEdwardIsland":
      return {
        basicPersonalAmount: 12_000, lowestRate: 0.0965,
        brackets: [[32_656, 0.0965], [64_313, 0.1363], [105_000, 0.1665], [140_000, 0.18], [Infinity, 0.1875]],
      };
    case "quebec":
      return {
        basicPersonalAmount: 17_183, lowestRate: 0.14,
        brackets: [[53_255, 0.14], [106_495, 0.19], [129_590, 0.24], [Infinity, 0.2575]],
      };
    case "saskatchewan":
      return {
        basicPersonalAmount: 17_661, lowestRate: 0.105,
        brackets: [[49_720, 0.105], [142_058, 0.125], [Infinity, 0.145]],
      };
    case "yukon":
      return {
        basicPersonalAmount: 15_705, lowestRate: 0.064,
        brackets: [[57_375, 0.064], [114_750, 0.09], [158_519, 0.109], [500_000, 0.128], [Infinity, 0.15]],
      };
  }
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
