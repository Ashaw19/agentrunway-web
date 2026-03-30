/**
 * CorporateTaxEngine — Canadian CCPC income tax estimator (2025)
 *
 * Models the two-entity tax situation for incorporated real estate agents:
 *   Layer 1 — Corporate (T2): active business income taxed at SBD or general rate
 *   Layer 2 — Personal (T1): owner taxed on salary and/or non-eligible dividends
 *
 * Compares the incorporated route vs. operating as a sole proprietor on the same
 * gross income, and identifies the optimal compensation method (salary vs dividends)
 * for the agent's income level and province.
 *
 * Tax year: 2025 (CRA-confirmed corporate rates)
 * ESTIMATE ONLY — Not legal or tax advice.
 */

import type { Province } from "../types/database";
import {
  calculate as calcPersonalTax,
  bracketTax,
  provincialInfo,
} from "./canadian-tax-engine";

// ⚠️  TAX_YEAR = 2025 — Update all three engine files together:
// - canadian-tax-engine.ts
// - corporate-tax-engine.ts
// - tax-optimization-engine.ts

// Ontario surtax (mirrors canadian-tax-engine.ts — applied to ALL provincial tax including dividends)
function ontarioSurtax(provTax: number): number {
  let surtax = 0;
  if (provTax > 5_710) surtax += (provTax - 5_710) * 0.20;
  if (provTax > 7_307) surtax += (provTax - 7_307) * 0.36;
  return surtax;
}

// ── Result type ──────────────────────────────────────────────────────────────

export interface CorporateTaxResult {
  // Corporate layer (T2)
  corporateIncome: number;          // Net income in corp before salary payment
  sbdLimit: number;                 // Effective SBD limit (after passive income grind-out)
  fedCorpRate: number;              // 9% SBD or 15% general (blended if split)
  provCorpRate: number;             // Provincial rate (blended)
  totalCorpRate: number;            // Combined corporate rate
  corporateTax: number;             // Total corporate income tax
  afterTaxCorporateIncome: number;  // Available for distribution as dividends

  // Personal layer (T1)
  salaryTaken: number;              // Owner salary drawn from corp
  dividendTaken: number;            // Non-eligible dividends distributed
  personalTaxOnSalary: number;      // Includes CPP (both halves via corp payroll)
  personalTaxOnDividend: number;    // After gross-up and dividend tax credits
  totalPersonalTax: number;

  // Combined burden
  totalCombinedTax: number;         // Corporate tax + personal tax
  netPersonalIncome: number;        // What the owner actually takes home
  combinedEffectiveRate: number;    // totalCombinedTax / corporateIncome

  // Sole-proprietor comparison
  soleProprietorTax: number;        // Personal tax on same income as sole prop
  taxSavingVsSoleProp: number;      // Positive = corp saves money; negative = costs more

  // Optimizer: 100% salary vs 100% dividends
  allSalaryTotalTax: number;
  allDividendsTotalTax: number;
  optimalMethod: "salary" | "dividends";
  optimalSaving: number;            // Savings from choosing optimal over the other

  // SBD passive income warning
  passiveIncomeWarning: boolean;    // true when passive investment income > $50K
  sbdReductionAmount: number;       // How much the SBD limit was reduced

  taxYear: number;
}

// ── Input type ───────────────────────────────────────────────────────────────

export interface CorporateTaxInput {
  /** Net income in the corporation BEFORE any salary payment to the owner */
  corporateIncome: number;
  province: Province;
  /** How the owner compensates themselves */
  compensationMethod: "salary" | "dividends" | "mixed";
  /**
   * For "mixed": the annual salary component. Corp pays salary first, then
   * distributes after-tax remaining income as dividends.
   * If omitted for "mixed", defaults to 50/50 split of corporateIncome.
   */
  salaryAmount?: number;
  /**
   * Adjusted Aggregate Investment Income (AAII) — passive income that triggers
   * the SBD phase-out above $50K. Usually 0 for a pure real estate agent.
   */
  passiveIncome?: number;
  /** Deal count for per-deal set-aside calculation */
  dealCount?: number;
}

// ── Constants ────────────────────────────────────────────────────────────────

const TAX_YEAR = 2025;

// Federal corporate rates
const FED_SBD_RATE     = 0.09;    // After Small Business Deduction
const FED_GENERAL_RATE = 0.15;    // General rate (above SBD limit)
const SBD_LIMIT        = 500_000; // Active business income cap for SBD

// Passive income (AAII) phase-out of SBD limit
const SBD_PASSIVE_THRESHOLD = 50_000;   // Phase-out starts at $50K AAII
const SBD_REDUCTION_FACTOR  = 5;        // $5 reduction in SBD limit per $1 over threshold

// Non-eligible dividend gross-up (15%) and federal DTC
const NEL_GROSS_UP  = 0.15;
const FED_NEL_DTC   = 0.090301;   // 9.0301% of grossed-up amount

// Federal BPA + blended 2025 rate (mirrors canadian-tax-engine.ts)
const FED_BPA      = 16_129;
const FED_BPA_RATE = 0.145;

// 2025 Federal brackets (mirrors canadian-tax-engine.ts)
const FED_BRACKETS: [number, number][] = [
  [57_375,   0.145],
  [114_750,  0.205],
  [177_882,  0.260],
  [253_414,  0.290],
  [Infinity, 0.330],
];

// ── Provincial corporate rate table (2025) ───────────────────────────────────

interface ProvCorpInfo {
  /** Provincial rate on SBD income (first $sbdLimit of active income) */
  sbdRate: number;
  /** Provincial rate on income above SBD limit */
  generalRate: number;
  /**
   * Provincial non-eligible dividend tax credit as a percentage of the
   * grossed-up (taxable) dividend amount. Applied after provincial income tax.
   * Sources: provincial finance ministries + TaxTips.ca 2025 tables.
   */
  nelDTCRate: number;
  /**
   * Provincial SBD business limit — most provinces use the federal $500K, but
   * NS ($700K since Apr 2025), PEI ($600K since Jul 2025), and SK ($600K since 2018)
   * have higher provincial limits. The federal SBD applies only to the first $500K
   * of active business income regardless; the provincial SBD may apply to a higher amount.
   * CRA: canada.ca/en/revenue-agency/services/tax/businesses/topics/corporations/provincial-territorial-corporation-tax/
   */
  provSbdLimit: number;
}

function provCorpInfo(province: Province): ProvCorpInfo {
  switch (province) {
    case "alberta":
      // AB: SBD 2%, General 8%; non-eligible DTC 2% of grossed-up
      return { sbdRate: 0.020, generalRate: 0.080, nelDTCRate: 0.0200, provSbdLimit: SBD_LIMIT };
    case "britishColumbia":
      // BC: SBD 2%, General 12%; non-eligible DTC eliminated in 2020
      return { sbdRate: 0.020, generalRate: 0.120, nelDTCRate: 0.0000, provSbdLimit: SBD_LIMIT };
    case "manitoba":
      // MB: SBD 0%, General 12%; non-eligible DTC 1% of grossed-up
      return { sbdRate: 0.000, generalRate: 0.120, nelDTCRate: 0.0100, provSbdLimit: SBD_LIMIT };
    case "newBrunswick":
      // NB: SBD 2.5%, General 14%; non-eligible DTC 4% of grossed-up
      return { sbdRate: 0.025, generalRate: 0.140, nelDTCRate: 0.0400, provSbdLimit: SBD_LIMIT };
    case "newfoundland":
      // NL: SBD 2.5% (reduced from 3% Jan 1, 2024), General 15%; non-eligible DTC 3%
      // CRA: canada.ca/en/revenue-agency/services/tax/businesses/topics/corporations/provincial-territorial-corporation-tax/newfoundland-labrador.html
      return { sbdRate: 0.025, generalRate: 0.150, nelDTCRate: 0.0300, provSbdLimit: SBD_LIMIT };
    case "northwestTerritories":
      // NT: SBD 2%, General 11.5%; non-eligible DTC ~3% of grossed-up
      return { sbdRate: 0.020, generalRate: 0.115, nelDTCRate: 0.0301, provSbdLimit: SBD_LIMIT };
    case "novaScotia":
      // NS: SBD 1.5% (reduced from 2.5% Apr 1, 2025), General 14%; non-eligible DTC ~2.41%
      // Provincial SBD limit: $700K (raised from $500K Apr 1, 2025)
      // CRA: canada.ca/en/revenue-agency/services/tax/businesses/topics/corporations/provincial-territorial-corporation-tax/nova-scotia.html
      return { sbdRate: 0.015, generalRate: 0.140, nelDTCRate: 0.0241, provSbdLimit: 700_000 };
    case "nunavut":
      // NU: SBD 3%, General 12%; non-eligible DTC ~3% of grossed-up
      return { sbdRate: 0.030, generalRate: 0.120, nelDTCRate: 0.0301, provSbdLimit: SBD_LIMIT };
    case "ontario":
      // ON: SBD 3.2%, General 11.5%; non-eligible DTC 3.3161% of grossed-up
      return { sbdRate: 0.032, generalRate: 0.115, nelDTCRate: 0.0332, provSbdLimit: SBD_LIMIT };
    case "princeEdwardIsland":
      // PE: SBD 1%, General 15% (reduced from 16% Jul 1, 2025); non-eligible DTC 3.5%
      // Provincial SBD limit: $600K (raised from $500K Jul 1, 2025)
      // CRA: canada.ca/en/revenue-agency/services/tax/businesses/topics/corporations/provincial-territorial-corporation-tax/prince-edward-island.html
      return { sbdRate: 0.010, generalRate: 0.150, nelDTCRate: 0.0350, provSbdLimit: 600_000 };
    case "quebec":
      // QC: SBD 3.2%, General 11.5%; non-eligible DTC 4.01% of grossed-up (2025)
      return { sbdRate: 0.032, generalRate: 0.115, nelDTCRate: 0.0401, provSbdLimit: SBD_LIMIT };
    case "saskatchewan":
      // SK: SBD 1% (reduced from 2% Jul 1, 2023), General 12%; non-eligible DTC 3.362%
      // Provincial SBD limit: $600K (since 2018)
      // CRA: canada.ca/en/revenue-agency/services/tax/businesses/topics/corporations/provincial-territorial-corporation-tax/saskatchewan.html
      return { sbdRate: 0.010, generalRate: 0.120, nelDTCRate: 0.0336, provSbdLimit: 600_000 };
    case "yukon":
      // YT: SBD 0% (reduced from 2% Jan 1, 2021), General 12%; non-eligible DTC 2%
      // CRA: canada.ca/en/revenue-agency/services/tax/businesses/topics/corporations/provincial-territorial-corporation-tax/yukon.html
      return { sbdRate: 0.000, generalRate: 0.120, nelDTCRate: 0.0200, provSbdLimit: SBD_LIMIT };
  }
}

// ── Main calculation ──────────────────────────────────────────────────────────

export function calculateCorporateTax(input: CorporateTaxInput): CorporateTaxResult {
  const {
    corporateIncome,
    province,
    compensationMethod,
    salaryAmount,
    passiveIncome = 0,
    dealCount = 1,
  } = input;

  if (corporateIncome <= 0) return zeroResult(province);

  const provInfo = provCorpInfo(province);

  // ── Step 1: SBD limit (passive income grind-out) ─────────────────────────
  // Federal SBD limit: $500K, reduced by $5 per $1 of AAII over $50K
  const passiveOver = Math.max(0, passiveIncome - SBD_PASSIVE_THRESHOLD);
  const sbdReductionAmount = Math.min(SBD_LIMIT, passiveOver * SBD_REDUCTION_FACTOR);
  const sbdLimit = SBD_LIMIT - sbdReductionAmount;
  // Provincial SBD limit: NS=$700K, PEI=$600K, SK=$600K (others = federal $500K)
  // Provincial AAII phase-out uses the provincial limit's own ratio
  const provSbdReduction = Math.min(
    provInfo.provSbdLimit,
    passiveOver * (provInfo.provSbdLimit / SBD_LIMIT) * SBD_REDUCTION_FACTOR,
  );
  const provSbdLimit = provInfo.provSbdLimit - provSbdReduction;
  const passiveIncomeWarning = passiveIncome > SBD_PASSIVE_THRESHOLD;

  // ── Step 2: Salary / dividend split ──────────────────────────────────────
  let salaryTaken: number;
  if (compensationMethod === "salary") {
    salaryTaken = corporateIncome;
  } else if (compensationMethod === "dividends") {
    salaryTaken = 0;
  } else {
    // Mixed: user-specified salary, or default to 50% of corp income
    salaryTaken = Math.min(salaryAmount ?? corporateIncome * 0.5, corporateIncome);
  }

  // ── Step 3: Corporate taxable income (after salary deduction) ────────────
  const corpTaxableIncome = Math.max(0, corporateIncome - salaryTaken);

  // ── Step 4: Corporate tax ─────────────────────────────────────────────────
  // Federal SBD applies on first $sbdLimit (usually $500K) of active business income
  const fedSbdIncome     = Math.min(corpTaxableIncome, sbdLimit);
  const fedGeneralIncome = Math.max(0, corpTaxableIncome - sbdLimit);
  // Provincial SBD limit may differ (NS=$700K, PEI=$600K, SK=$600K)
  const provSbdIncome     = Math.min(corpTaxableIncome, provSbdLimit);
  const provGeneralIncome = Math.max(0, corpTaxableIncome - provSbdLimit);

  const fedCorpTax  = fedSbdIncome * FED_SBD_RATE      + fedGeneralIncome * FED_GENERAL_RATE;
  const provCorpTax = provSbdIncome * provInfo.sbdRate  + provGeneralIncome * provInfo.generalRate;
  const corporateTax = fedCorpTax + provCorpTax;
  const afterTaxCorporateIncome = corpTaxableIncome - corporateTax;

  // Blended effective corporate rates (for display)
  const fedCorpRate  = corpTaxableIncome > 0 ? fedCorpTax  / corpTaxableIncome : FED_SBD_RATE;
  const provCorpRate = corpTaxableIncome > 0 ? provCorpTax / corpTaxableIncome : provInfo.sbdRate;
  const totalCorpRate = fedCorpRate + provCorpRate;

  // ── Step 5: Personal tax on salary ───────────────────────────────────────
  // calcPersonalTax includes CPP (both employer + employee halves for self-employed)
  let personalTaxOnSalary = 0;
  if (salaryTaken > 0) {
    const salaryTaxResult = calcPersonalTax(salaryTaken, province, dealCount);
    personalTaxOnSalary = salaryTaxResult.totalBurden;
  }

  // ── Step 6: Personal tax on dividend ─────────────────────────────────────
  // Dividends = all after-tax corporate income when compensating with dividends
  const dividendTaken = afterTaxCorporateIncome;
  let personalTaxOnDividend = 0;
  if (dividendTaken > 0 && compensationMethod !== "salary") {
    personalTaxOnDividend = calcPersonalTaxOnDividend(dividendTaken, province, provInfo);
  }

  const totalPersonalTax = personalTaxOnSalary + personalTaxOnDividend;

  // ── Step 7: Combined summary ──────────────────────────────────────────────
  const totalCombinedTax = corporateTax + totalPersonalTax;
  const netPersonalIncome = corporateIncome - totalCombinedTax;
  const combinedEffectiveRate = corporateIncome > 0 ? totalCombinedTax / corporateIncome : 0;

  // ── Step 8: Sole-proprietor comparison ───────────────────────────────────
  const soleProprietorTax = calcPersonalTax(corporateIncome, province, dealCount).totalBurden;
  const taxSavingVsSoleProp = soleProprietorTax - totalCombinedTax;

  // ── Step 9: Optimizer — 100% salary vs 100% dividends ────────────────────
  // All-salary scenario: no corp tax on salary; personal tax on full income
  const allSalaryTotalTax = calcPersonalTax(corporateIncome, province, dealCount).totalBurden;

  // All-dividends scenario: corp pays tax on full corporateIncome; remainder distributed
  // IMPORTANT: Recompute SBD splits on full corporateIncome (not salary-adjusted corpTaxableIncome)
  const allDivFedSbdIncome     = Math.min(corporateIncome, sbdLimit);
  const allDivFedGeneralIncome = Math.max(0, corporateIncome - sbdLimit);
  const allDivProvSbdIncome    = Math.min(corporateIncome, provSbdLimit);
  const allDivProvGenIncome    = Math.max(0, corporateIncome - provSbdLimit);
  const allDivFedCorpTax  = allDivFedSbdIncome * FED_SBD_RATE      + allDivFedGeneralIncome * FED_GENERAL_RATE;
  const allDivProvCorpTax = allDivProvSbdIncome * provInfo.sbdRate  + allDivProvGenIncome * provInfo.generalRate;
  const allDivCorpTax     = allDivFedCorpTax + allDivProvCorpTax;
  const allDivAfterCorpTax = Math.max(0, corporateIncome - allDivCorpTax);
  const allDivPersonalTax  = calcPersonalTaxOnDividend(allDivAfterCorpTax, province, provInfo);
  const allDividendsTotalTax = allDivCorpTax + allDivPersonalTax;

  const optimalMethod: "salary" | "dividends" =
    allSalaryTotalTax <= allDividendsTotalTax ? "salary" : "dividends";
  const optimalSaving = Math.abs(allSalaryTotalTax - allDividendsTotalTax);

  return {
    corporateIncome,
    sbdLimit,
    fedCorpRate,
    provCorpRate,
    totalCorpRate,
    corporateTax,
    afterTaxCorporateIncome,
    salaryTaken,
    dividendTaken: compensationMethod === "salary" ? 0 : dividendTaken,
    personalTaxOnSalary,
    personalTaxOnDividend,
    totalPersonalTax,
    totalCombinedTax,
    netPersonalIncome,
    combinedEffectiveRate,
    soleProprietorTax,
    taxSavingVsSoleProp,
    allSalaryTotalTax,
    allDividendsTotalTax,
    optimalMethod,
    optimalSaving,
    passiveIncomeWarning,
    sbdReductionAmount,
    taxYear: TAX_YEAR,
  };
}

// ── Personal tax on non-eligible dividend ────────────────────────────────────

/**
 * Calculates personal income tax on a non-eligible (CCPC SBD-sourced) dividend.
 *
 * Mechanism:
 *   1. Gross up the dividend by 15% → taxable dividend
 *   2. Apply federal income tax brackets to taxable dividend
 *   3. Deduct federal BPA credit
 *   4. Deduct federal non-eligible DTC (9.0301% of taxable dividend)
 *   5. Apply Quebec abatement if province is Quebec
 *   6. Apply provincial income tax brackets to taxable dividend
 *   7. Deduct provincial BPA credit
 *   8. Deduct provincial non-eligible DTC
 *
 * CPP does NOT apply to dividends — they are not employment income.
 */
function calcPersonalTaxOnDividend(
  dividend: number,
  province: Province,
  pCorpInfo: ProvCorpInfo,
): number {
  if (dividend <= 0) return 0;

  const grossedUp = dividend * (1 + NEL_GROSS_UP); // D × 1.15

  // Federal tax on grossed-up amount
  let fedTax = bracketTax(grossedUp, FED_BRACKETS);
  fedTax = Math.max(0, fedTax - FED_BPA * FED_BPA_RATE);     // BPA credit
  fedTax = Math.max(0, fedTax - grossedUp * FED_NEL_DTC);     // Federal DTC
  if (province === "quebec") fedTax *= (1 - 0.165);           // Quebec abatement

  // Provincial tax on grossed-up amount
  const pInfo = provincialInfo(province);
  let provTax = bracketTax(grossedUp, pInfo.brackets);
  provTax = Math.max(0, provTax - pInfo.basicPersonalAmount * pInfo.lowestRate); // BPA
  provTax = Math.max(0, provTax - grossedUp * pCorpInfo.nelDTCRate);              // Prov DTC

  // Ontario surtax applies to ALL provincial tax, including on dividends
  if (province === "ontario") {
    provTax = Math.max(0, provTax + ontarioSurtax(provTax));
  }

  return Math.max(0, fedTax + provTax);
}

// ── Provincial SBD combined rate helper ──────────────────────────────────────

/** Returns the combined federal + provincial SBD rate for a given province. */
export function combinedSBDRate(province: Province): number {
  return FED_SBD_RATE + provCorpInfo(province).sbdRate;
}

// ── Zero result ───────────────────────────────────────────────────────────────

function zeroResult(province: Province): CorporateTaxResult {
  const provInfo = provCorpInfo(province);
  return {
    corporateIncome: 0,
    sbdLimit: SBD_LIMIT,
    fedCorpRate: FED_SBD_RATE,
    provCorpRate: provInfo.sbdRate,
    totalCorpRate: FED_SBD_RATE + provInfo.sbdRate,
    corporateTax: 0,
    afterTaxCorporateIncome: 0,
    salaryTaken: 0,
    dividendTaken: 0,
    personalTaxOnSalary: 0,
    personalTaxOnDividend: 0,
    totalPersonalTax: 0,
    totalCombinedTax: 0,
    netPersonalIncome: 0,
    combinedEffectiveRate: 0,
    soleProprietorTax: 0,
    taxSavingVsSoleProp: 0,
    allSalaryTotalTax: 0,
    allDividendsTotalTax: 0,
    optimalMethod: "salary",
    optimalSaving: 0,
    passiveIncomeWarning: false,
    sbdReductionAmount: 0,
    taxYear: TAX_YEAR,
  };
}
