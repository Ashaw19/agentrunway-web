// CanadianTaxEngine — local copy for mcp-server Edge Function
// Keep in sync with _shared/core/engines/canadian-tax-engine.ts
// ESTIMATE ONLY — Not legal or tax advice.

export type Province =
  | "alberta" | "britishColumbia" | "manitoba" | "newBrunswick"
  | "newfoundland" | "northwestTerritories" | "novaScotia" | "nunavut"
  | "ontario" | "princeEdwardIsland" | "quebec" | "saskatchewan" | "yukon";

const cents = (n: number) => Math.round(n * 100) / 100;

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

const TAX_YEAR = 2025;
const FEDERAL_BPA = 16_129;
const FEDERAL_BPA_RATE = 0.145;
const FEDERAL_BRACKETS: [number, number][] = [
  [57_375, 0.145], [114_750, 0.205], [177_882, 0.260],
  [253_414, 0.290], [Infinity, 0.330],
];
const CPP_BASIC_EXEMPTION = 3_500;
const CPP_YMPE = 71_300;
const CPP_YAMPE = 81_200;
const CPP1_SELF_RATE = 0.0595 * 2;
const CPP2_SELF_RATE = 0.04 * 2;
const QPP1_SELF_RATE = 0.064 * 2;
const QPP2_SELF_RATE = 0.04 * 2;

export function calculate(netIncome: number, province: Province, dealCount: number): CanadianTaxResult {
  if (netIncome <= 0) return zeroResult(province, dealCount);
  const { cpp1, cpp2 } = cppContributions(netIncome, province);
  const totalCPP = cpp1 + cpp2;
  const cppDeduction = cpp1 * 0.5 + cpp2;
  const fedTaxable = Math.max(0, netIncome - cppDeduction);
  let fedTax = bracketTax(fedTaxable, FEDERAL_BRACKETS);
  fedTax = Math.max(0, fedTax - FEDERAL_BPA * FEDERAL_BPA_RATE);
  const cppEmployeeHalf = cpp1 * 0.5;
  fedTax = Math.max(0, fedTax - cppEmployeeHalf * FEDERAL_BPA_RATE);
  if (province === "quebec") fedTax *= 1.0 - 0.165;
  const provTax = calcProvincialTax(fedTaxable, province, cppEmployeeHalf);
  const totalTax = fedTax + provTax;
  const totalBurden = totalTax + totalCPP;
  return {
    grossIncome: cents(netIncome),
    cpp1Contribution: cents(cpp1), cpp2Contribution: cents(cpp2), totalCPP: cents(totalCPP),
    federalTax: cents(fedTax), provincialTax: cents(provTax),
    totalTax: cents(totalTax), totalBurden: cents(totalBurden),
    effectiveRate: Math.round((totalBurden / netIncome) * 10000) / 10000,
    quarterlyEstimate: cents(totalBurden / 4),
    perDealSetAside: cents(dealCount > 0 ? totalBurden / dealCount : 0),
    projectedDealCount: dealCount, provinceName: province, taxYear: TAX_YEAR,
  };
}

function cppContributions(netIncome: number, province: Province): { cpp1: number; cpp2: number } {
  const isQuebec = province === "quebec";
  const rate1 = isQuebec ? QPP1_SELF_RATE : CPP1_SELF_RATE;
  const rate2 = isQuebec ? QPP2_SELF_RATE : CPP2_SELF_RATE;
  const cpp1Earnings = Math.max(0, Math.min(netIncome, CPP_YMPE) - CPP_BASIC_EXEMPTION);
  const cpp2Earnings = Math.max(0, Math.min(netIncome, CPP_YAMPE) - CPP_YMPE);
  return { cpp1: cpp1Earnings * rate1, cpp2: cpp2Earnings * rate2 };
}

interface ProvincialInfo { basicPersonalAmount: number; lowestRate: number; brackets: [number, number][]; }

function calcProvincialTax(income: number, province: Province, cppEmployeeHalf: number): number {
  const info = provincialInfo(province);
  let tax = bracketTax(income, info.brackets);
  tax = Math.max(0, tax - info.basicPersonalAmount * info.lowestRate);
  if (cppEmployeeHalf > 0) tax = Math.max(0, tax - cppEmployeeHalf * info.lowestRate);
  if (province === "ontario") tax = Math.max(0, tax + ontarioSurtax(tax));
  return Math.max(0, tax);
}

function ontarioSurtax(provTax: number): number {
  let s = 0;
  if (provTax > 5_710) s += (provTax - 5_710) * 0.20;
  if (provTax > 7_307) s += (provTax - 7_307) * 0.36;
  return s;
}

export function bracketTax(income: number, brackets: [number, number][]): number {
  let tax = 0, prev = 0;
  for (const [limit, rate] of brackets) {
    if (income <= prev) break;
    tax += (Math.min(income, limit) - prev) * rate;
    prev = limit;
  }
  return tax;
}

function provincialInfo(province: Province): ProvincialInfo {
  switch (province) {
    case "alberta": return { basicPersonalAmount: 22_323, lowestRate: 0.08, brackets: [[60_000, 0.08], [151_234, 0.10], [181_481, 0.12], [241_974, 0.13], [362_961, 0.14], [Infinity, 0.15]] };
    case "britishColumbia": return { basicPersonalAmount: 12_932, lowestRate: 0.0506, brackets: [[49_279, 0.0506], [98_560, 0.077], [113_158, 0.105], [137_407, 0.1229], [186_306, 0.147], [259_829, 0.168], [Infinity, 0.205]] };
    case "manitoba": return { basicPersonalAmount: 15_780, lowestRate: 0.108, brackets: [[47_000, 0.108], [100_000, 0.1275], [Infinity, 0.174]] };
    case "newBrunswick": return { basicPersonalAmount: 13_396, lowestRate: 0.094, brackets: [[51_306, 0.094], [102_614, 0.14], [190_060, 0.16], [Infinity, 0.195]] };
    case "newfoundland": return { basicPersonalAmount: 11_067, lowestRate: 0.087, brackets: [[44_192, 0.087], [88_382, 0.145], [157_792, 0.158], [220_910, 0.178], [282_214, 0.198], [564_429, 0.208], [1_128_858, 0.213], [Infinity, 0.218]] };
    case "northwestTerritories": return { basicPersonalAmount: 17_842, lowestRate: 0.059, brackets: [[51_964, 0.059], [103_930, 0.086], [168_967, 0.122], [Infinity, 0.1405]] };
    case "novaScotia": return { basicPersonalAmount: 11_744, lowestRate: 0.0879, brackets: [[30_507, 0.0879], [61_015, 0.1495], [95_883, 0.1667], [154_650, 0.175], [Infinity, 0.21]] };
    case "nunavut": return { basicPersonalAmount: 19_274, lowestRate: 0.04, brackets: [[54_707, 0.04], [109_413, 0.07], [177_881, 0.09], [Infinity, 0.115]] };
    case "ontario": return { basicPersonalAmount: 12_747, lowestRate: 0.0505, brackets: [[52_886, 0.0505], [105_775, 0.0915], [150_000, 0.1116], [220_000, 0.1216], [Infinity, 0.1316]] };
    case "princeEdwardIsland": return { basicPersonalAmount: 14_650, lowestRate: 0.095, brackets: [[33_328, 0.095], [64_656, 0.1347], [105_000, 0.166], [140_000, 0.1762], [Infinity, 0.19]] };
    case "quebec": return { basicPersonalAmount: 18_571, lowestRate: 0.14, brackets: [[53_255, 0.14], [106_495, 0.19], [129_590, 0.24], [Infinity, 0.2575]] };
    case "saskatchewan": return { basicPersonalAmount: 19_491, lowestRate: 0.105, brackets: [[53_463, 0.105], [152_750, 0.125], [Infinity, 0.145]] };
    case "yukon": return { basicPersonalAmount: 16_129, lowestRate: 0.064, brackets: [[57_375, 0.064], [114_750, 0.09], [177_882, 0.109], [500_000, 0.128], [Infinity, 0.15]] };
  }
}

function zeroResult(province: Province, dealCount: number): CanadianTaxResult {
  return { grossIncome: 0, cpp1Contribution: 0, cpp2Contribution: 0, totalCPP: 0, federalTax: 0, provincialTax: 0, totalTax: 0, totalBurden: 0, effectiveRate: 0, quarterlyEstimate: 0, perDealSetAside: 0, projectedDealCount: dealCount, provinceName: province, taxYear: TAX_YEAR };
}
