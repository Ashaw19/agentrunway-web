// TaxOptimizationEngine — Canadian tax estimation tools for self-employed RE agents.
//
// Surfaces educational insights about common tax strategies. Each rule is based on
// CRA-published, objectively verifiable thresholds and rates.
//
// ⚠️  ESTIMATE ONLY — For educational purposes only. Not personalized tax advice.
//     All calculations are approximate. Users must consult a qualified Canadian
//     accountant or tax professional before making tax decisions.
//     Agent Runway does not provide tax advice and accepts no liability for tax outcomes.

import type { Province } from "../types/database";
import { fmtCurrency, fmtPct } from "../formatters";
import {
  calculate as calculatePersonalTax,
  marginalRate,
  gstHstRate,
  gstHstLabel,
} from "./canadian-tax-engine";
import { calculateCorporateTax } from "./corporate-tax-engine";

// ⚠️  TAX_YEAR = 2025 — Update all three engine files together:
// - canadian-tax-engine.ts
// - corporate-tax-engine.ts
// - tax-optimization-engine.ts

// ── CRA-sourced constants (2025 tax year) ────────────────────────────────────

/** CRA: canada.ca/en/revenue-agency/services/tax/individuals/topics/rrsp-mp/rrsp-limit.html */
const RRSP_LIMIT_2025 = 32_490;
const RRSP_CONTRIBUTION_RATE = 0.18;

/**
 * CRA per-km rates for reasonable automobile allowances (employer → employee).
 * These are NOT the T2125 deduction method — T2125 uses actual cost or CCA.
 * Used here as a planning estimate to help agents understand the scale of
 * vehicle deductions they might claim via the actual-expense method.
 * CRA: canada.ca/en/revenue-agency/services/tax/businesses/topics/automobile-motor-vehicle-benefits/automobile-allowance-rates.html
 */
const CRA_MILEAGE_RATE_FIRST_5K = 0.72; // $/km for first 5,000 km (employer allowance benchmark)
const CRA_MILEAGE_RATE_AFTER = 0.66;    // $/km beyond 5,000 km (employer allowance benchmark)
const CRA_MILEAGE_THRESHOLD = 5_000;

/** Estimated annual accounting cost for incorporated agents */
const ESTIMATED_ACCOUNTING_COST = 4_000;

/** CRA: GST/HST small supplier threshold */
const GST_REGISTRATION_THRESHOLD = 30_000;

/** CRA prescribed interest rate on instalment shortfalls (approximate as of 2025 — CRA adjusts quarterly) */
const CRA_INSTALMENT_INTEREST_RATE = 0.06;

/** Minimum estimated savings to display a card */
const MIN_SAVINGS_THRESHOLD = 100;

/** Typical annual mileage estimate for agents without logged trips */
const TYPICAL_AGENT_ANNUAL_KM = 20_000;

// ── Types ────────────────────────────────────────────────────────────────────

export type TaxOptCategory =
  | "rrspOptimization"
  | "incorporationTiming"
  | "homeOfficeOptimizer"
  | "vehicleExpenseOptimizer"
  | "gstHstItcRecovery"
  | "compensationMethod"
  | "cppConsiderations"
  | "instalmentOptimization"
  | "yearEndPlanning"
  | "missedDeductions";

export const TAX_OPT_CATEGORY_LABELS: Record<TaxOptCategory, string> = {
  rrspOptimization: "RRSP",
  incorporationTiming: "Incorporation",
  homeOfficeOptimizer: "Home Office",
  vehicleExpenseOptimizer: "Vehicle",
  gstHstItcRecovery: "GST/HST",
  compensationMethod: "Compensation",
  cppConsiderations: "CPP",
  instalmentOptimization: "Instalments",
  yearEndPlanning: "Year-End",
  missedDeductions: "Deductions",
};

export interface TaxOptimizationInput {
  // Income
  netIncome: number;
  projectedGCI: number;
  annualExpenses: number;
  dealCount: number;
  // Agent profile
  province: Province;
  experienceYears: number | null;
  // Business structure
  isIncorporated: boolean;
  corpType: "prec" | "general" | null;
  compensationMethod: "salary" | "dividends" | "mixed";
  // Home office (CRA actual-cost method only — no simplified method in Canada)
  homeOfficeSqFootage: number | null;
  homeOfficeBusinessUsePct: number;
  homeOfficeRentMonthly: number;
  homeOfficeUtilitiesMonthly: number;
  homeOfficePropertyTaxAnnual: number;
  homeOfficeInsuranceMonthly: number;
  homeOfficeMaintenanceAnnual: number;
  homeOfficeCondoFeesMonthly: number;
  // Vehicle
  vehicleType: "own" | "lease" | "none";
  vehicleBusinessUsePct: number;
  hasTrackedMileage: boolean;
  annualMileageKm: number;
  // GST/HST
  gstHstRegistered: boolean;
  gstHstPaidOnExpenses: number;
  gstHstRemitted: number;
  // Instalments
  taxInstalmentsPaid: number;
  cppInstalmentPaidYTD: number;
  // Deduction tracking
  hasProfDevExpenses: boolean;
  hasMarketingExpenses: boolean;
  hasClientGiftExpenses: boolean;
  hasMealExpenses: boolean;
  hasLicensingExpenses: boolean;
  ccaAssetCount: number;
  // Dismissed cards
  dismissed: string[];
}

export interface TaxOptimizationCard {
  id: string;
  category: TaxOptCategory;
  icon: string;
  title: string;
  evidence: string[];
  action: string;
  disclaimer: string;
  estimatedSavings: number;
  estimatedSavingsLabel: string;
  priority: number;
  complexity: "easy" | "moderate" | "complex";
}

export interface TaxOptimizationResult {
  cards: TaxOptimizationCard[];
  totalEstimatedSavings: number;
  topOpportunity: TaxOptimizationCard | null;
  cardCount: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function savingsLabel(amount: number): string {
  if (amount >= 1_000) {
    return `~${fmtCurrency(Math.round(amount / 100) * 100)}/yr`;
  }
  return `~${fmtCurrency(Math.round(amount))}/yr`;
}

function currentQuarter(): number {
  return Math.floor(new Date().getMonth() / 3) + 1;
}

function currentMonth(): number {
  return new Date().getMonth() + 1; // 1–12
}

// ── Main engine ──────────────────────────────────────────────────────────────

export function generateTaxOptimizations(
  input: TaxOptimizationInput,
  limit: number = 10,
): TaxOptimizationResult {
  if (input.netIncome <= 0 && input.projectedGCI <= 0) {
    return { cards: [], totalEstimatedSavings: 0, topOpportunity: null, cardCount: 0 };
  }

  const cards: TaxOptimizationCard[] = [];
  const mRate = input.netIncome > 0 ? marginalRate(input.netIncome, input.province) : 0;

  // ── Rule 1: RRSP Optimization ────────────────────────────────────────────
  if (
    input.netIncome > 0 &&
    (!input.isIncorporated || input.compensationMethod !== "dividends")
  ) {
    const rrspRoom = Math.min(input.netIncome * RRSP_CONTRIBUTION_RATE, RRSP_LIMIT_2025);
    const savings = rrspRoom * mRate;

    if (savings >= MIN_SAVINGS_THRESHOLD) {
      const priority = mRate > 0.40 ? 85 : mRate > 0.30 ? 70 : 55;
      cards.push({
        id: "rrspOptimization",
        category: "rrspOptimization",
        icon: "receipt-text",
        title: "RRSP Contribution Opportunity",
        evidence: [
          `Your combined marginal rate is ${fmtPct(mRate)} — each $1 contributed could reduce tax by ${Math.round(mRate * 100)}\u00A2`,
          `Estimated contribution room based on income: ${fmtCurrency(rrspRoom)} (18% of net income, max $${RRSP_LIMIT_2025.toLocaleString()})`,
        ],
        action: `Ask your accountant about maximizing your RRSP contribution. At your marginal rate, a full contribution of ${fmtCurrency(rrspRoom)} could reduce your tax by ${savingsLabel(savings).replace("/yr", "")}.`,
        disclaimer:
          "RRSP contribution room depends on prior-year earned income, pension adjustments, and unused room carried forward. Verify your actual room on your CRA Notice of Assessment before contributing. See Terms of Service.",
        estimatedSavings: savings,
        estimatedSavingsLabel: savingsLabel(savings),
        priority,
        complexity: "easy",
      });
    }
  }

  // ── Rule 2: Incorporation Timing ─────────────────────────────────────────
  if (!input.isIncorporated && input.netIncome > 80_000) {
    const soleResult = calculatePersonalTax(
      input.netIncome,
      input.province,
      Math.max(input.dealCount, 1),
    );
    // Test all three compensation methods and pick the best
    const corpSalary = calculateCorporateTax({
      corporateIncome: input.netIncome,
      province: input.province,
      compensationMethod: "salary",
      dealCount: Math.max(input.dealCount, 1),
    });
    const corpDividends = calculateCorporateTax({
      corporateIncome: input.netIncome,
      province: input.province,
      compensationMethod: "dividends",
      dealCount: Math.max(input.dealCount, 1),
    });
    const corpMixed = calculateCorporateTax({
      corporateIncome: input.netIncome,
      province: input.province,
      compensationMethod: "mixed",
      dealCount: Math.max(input.dealCount, 1),
    });
    // Find the lowest combined tax across all three methods
    const bestCorp = [corpSalary, corpDividends, corpMixed].reduce((best, r) =>
      r.totalCombinedTax < best.totalCombinedTax ? r : best,
    );

    const grossSaving = soleResult.totalBurden - bestCorp.totalCombinedTax;
    const netSaving = grossSaving - ESTIMATED_ACCOUNTING_COST;

    if (netSaving > 2_000) {
      const priority = netSaving > 10_000 ? 90 : netSaving > 5_000 ? 75 : 60;
      cards.push({
        id: "incorporationTiming",
        category: "incorporationTiming",
        icon: "building-2",
        title: "Incorporation May Reduce Your Tax",
        evidence: [
          `As a sole proprietor at ${fmtCurrency(input.netIncome)} net income, estimated tax burden is ${fmtCurrency(soleResult.totalBurden)}`,
          `Incorporated (optimal method), estimated combined tax is ${fmtCurrency(bestCorp.totalCombinedTax)}`,
          `After ~${fmtCurrency(ESTIMATED_ACCOUNTING_COST)}/yr accounting costs, potential net savings: ${savingsLabel(netSaving).replace("/yr", "")}`,
        ],
        action:
          "Discuss with a tax professional and lawyer whether incorporating as a PREC could benefit you. At your income level, the small business rate creates potential deferral opportunities.",
        disclaimer:
          "Incorporation involves legal fees ($1,500\u2013$3,000), ongoing annual accounting ($3,000\u2013$5,000+), provincial regulatory requirements, and may affect insurance, real estate board standing, and liability. This estimate does not account for all costs. Professional legal and tax advice is required. See Terms of Service.",
        estimatedSavings: netSaving,
        estimatedSavingsLabel: savingsLabel(netSaving),
        priority,
        complexity: "complex",
      });
    }
  }

  // ── Rule 3: Home Office Deduction (CRA actual-cost method) ──────────────
  // Canada does NOT have an IRS-style simplified method ($5/sq ft).
  // CRA T2125 home office deduction = actual home costs × business-use %.
  {
    const annualHomeCosts =
      input.homeOfficeRentMonthly * 12 +
      input.homeOfficeUtilitiesMonthly * 12 +
      input.homeOfficePropertyTaxAnnual +
      input.homeOfficeInsuranceMonthly * 12 +
      input.homeOfficeMaintenanceAnnual +
      input.homeOfficeCondoFeesMonthly * 12;
    const deduction = annualHomeCosts * input.homeOfficeBusinessUsePct;

    if (annualHomeCosts === 0 && input.netIncome > 0) {
      // Nudge: no home office data entered
      const estimatedDeduction = 1_000; // conservative average
      const savings = estimatedDeduction * mRate;
      if (savings >= MIN_SAVINGS_THRESHOLD) {
        cards.push({
          id: "homeOfficeOptimizer",
          category: "homeOfficeOptimizer",
          icon: "home",
          title: "Home Office Deduction Available",
          evidence: [
            "No home office details entered yet",
            "Most self-employed agents qualify for $800\u2013$1,500 in deductions",
            `At your ${fmtPct(mRate)} marginal rate, this could reduce tax by ${savingsLabel(savings).replace("/yr", "")}`,
          ],
          action:
            "Enter your actual home costs (rent/mortgage interest, utilities, property tax, insurance, maintenance) and business-use percentage in Settings. CRA allows deducting the business-use portion of actual home costs on T2125 Line 9945.",
          disclaimer:
            "Home office eligibility requires the space to be your principal place of business or used exclusively and regularly for meeting clients. CRA Form T2125 requires supporting documentation. Deduction is based on actual costs multiplied by business-use percentage. See Terms of Service.",
          estimatedSavings: savings,
          estimatedSavingsLabel: savingsLabel(savings),
          priority: 65,
          complexity: "easy",
        });
      }
    } else if (annualHomeCosts > 0 && input.homeOfficeBusinessUsePct > 0 && input.netIncome > 0) {
      // Show current deduction summary and nudge if business-use % seems low
      const savings = deduction * mRate;
      if (savings >= MIN_SAVINGS_THRESHOLD && input.homeOfficeBusinessUsePct < 0.15) {
        cards.push({
          id: "homeOfficeOptimizer",
          category: "homeOfficeOptimizer",
          icon: "home",
          title: "Home Office Deduction — Review Business-Use %",
          evidence: [
            `Annual home costs: ${fmtCurrency(annualHomeCosts)}`,
            `Current business-use: ${fmtPct(input.homeOfficeBusinessUsePct)} → deduction of ${fmtCurrency(Math.round(deduction))}`,
            `Ensure your business-use % reflects the actual area used exclusively for business (office area ÷ total home area)`,
          ],
          action: `Verify your business-use percentage is accurate. CRA calculates this as the area of your home office divided by the total area of your home. A larger dedicated workspace could increase your deduction.`,
          disclaimer:
            "Home office eligibility requires the space to be your principal place of business or used exclusively and regularly for meeting clients. Business-use percentage must be reasonable and supportable. See Terms of Service.",
          estimatedSavings: savings,
          estimatedSavingsLabel: savingsLabel(savings),
          priority: 50,
          complexity: "easy",
        });
      }
    }
  }


  // ── Rule 4: Vehicle Expense Optimization ─────────────────────────────────
  if (input.vehicleType !== "none" && input.netIncome > 0) {
    const km = input.hasTrackedMileage && input.annualMileageKm > 0
      ? input.annualMileageKm
      : TYPICAL_AGENT_ANNUAL_KM;
    const businessKm = km * input.vehicleBusinessUsePct;
    const craDeduction =
      Math.min(businessKm, CRA_MILEAGE_THRESHOLD) * CRA_MILEAGE_RATE_FIRST_5K +
      Math.max(0, businessKm - CRA_MILEAGE_THRESHOLD) * CRA_MILEAGE_RATE_AFTER;
    const savings = craDeduction * mRate;

    if (savings >= MIN_SAVINGS_THRESHOLD) {
      const isEstimate = !input.hasTrackedMileage || input.annualMileageKm === 0;
      const priority = isEstimate ? 70 : 40;

      cards.push({
        id: "vehicleExpenseOptimizer",
        category: "vehicleExpenseOptimizer",
        icon: "car",
        title: isEstimate
          ? "Vehicle Deduction \u2014 Start Logging Trips"
          : "Vehicle Deduction Summary",
        evidence: [
          `CRA 2025 reasonable allowance rates (planning benchmark): $${CRA_MILEAGE_RATE_FIRST_5K}/km (first ${CRA_MILEAGE_THRESHOLD.toLocaleString()} km) + $${CRA_MILEAGE_RATE_AFTER}/km after`,
          isEstimate
            ? `Estimated ${businessKm.toLocaleString()} business km (typical agent average at ${fmtPct(input.vehicleBusinessUsePct)} business use)`
            : `${businessKm.toLocaleString()} logged business km at ${fmtPct(input.vehicleBusinessUsePct)} business use`,
          `Potential deduction: ${fmtCurrency(Math.round(craDeduction))} \u2192 tax reduction of ${savingsLabel(savings).replace("/yr", "")}`,
        ],
        action: isEstimate
          ? "Start logging your business trips to substantiate vehicle deductions. CRA requires a contemporaneous log \u2014 the estimate shown is based on typical agent mileage, not your actual driving."
          : `Discuss with your accountant whether the CRA per-km method or actual expense method yields a larger deduction for your ${fmtCurrency(Math.round(craDeduction))} in business driving.`,
        disclaimer:
          "CRA requires a detailed, contemporaneous vehicle log recording date, destination, purpose, and kilometres for each business trip. Estimates based on averages are not valid for filing. The CRA per-km rates shown are employer allowance benchmarks used for planning only \u2014 T2125 vehicle deductions use the actual-expense or CCA method. See Terms of Service.",
        estimatedSavings: savings,
        estimatedSavingsLabel: savingsLabel(savings),
        priority,
        complexity: "easy",
      });
    }
  }

  // ── Rule 5: GST/HST Registration & ITC Recovery ─────────────────────────
  {
    const taxLbl = gstHstLabel(input.province);
    const rate = gstHstRate(input.province);

    if (!input.gstHstRegistered && input.projectedGCI > GST_REGISTRATION_THRESHOLD) {
      // Mandatory registration warning
      const potentialITCs = input.annualExpenses * rate;
      const savings = potentialITCs > 0 ? potentialITCs : 0;

      cards.push({
        id: "gstHstItcRecovery",
        category: "gstHstItcRecovery",
        icon: "receipt",
        title: `${taxLbl} Registration May Be Required`,
        evidence: [
          `Projected GCI of ${fmtCurrency(input.projectedGCI)} exceeds the $${GST_REGISTRATION_THRESHOLD.toLocaleString()} small supplier threshold`,
          `CRA generally requires ${taxLbl} registration above this threshold`,
          savings > 0
            ? `Registering also allows you to claim Input Tax Credits on business expenses (estimated ${fmtCurrency(Math.round(potentialITCs))} in ${taxLbl} paid)`
            : `Registration allows recovery of ${taxLbl} paid on business expenses`,
        ],
        action: `Consult a tax professional about ${taxLbl} registration. CRA generally requires registration when taxable supplies exceed $${GST_REGISTRATION_THRESHOLD.toLocaleString()} in four consecutive quarters.`,
        disclaimer: `The $${GST_REGISTRATION_THRESHOLD.toLocaleString()} small supplier threshold applies to taxable supplies over four consecutive calendar quarters. Voluntary registration may be beneficial below this threshold. ITC eligibility depends on the nature of each expense. Consult CRA GST/HST Info Sheet GI-065 or a tax professional. See Terms of Service.`,
        estimatedSavings: savings,
        estimatedSavingsLabel: savings > 0 ? savingsLabel(savings) : "Compliance",
        priority: 95,
        complexity: "moderate",
      });
    } else if (input.gstHstRegistered && input.gstHstPaidOnExpenses > 0) {
      const potentialITCs = input.gstHstPaidOnExpenses;
      if (potentialITCs >= MIN_SAVINGS_THRESHOLD) {
        cards.push({
          id: "gstHstItcRecovery",
          category: "gstHstItcRecovery",
          icon: "receipt",
          title: `${taxLbl} Input Tax Credits`,
          evidence: [
            `You\u2019ve paid approximately ${fmtCurrency(Math.round(potentialITCs))} in ${taxLbl} on business expenses`,
            `These may be recoverable as Input Tax Credits on your ${taxLbl} return`,
          ],
          action: `Discuss with your accountant whether you\u2019re claiming all eligible Input Tax Credits on your business expenses.`,
          disclaimer: `ITC eligibility depends on the nature of each expense and whether it was incurred in the course of your commercial activity. Some expenses (personal use, exempt supplies) are not eligible. Consult a tax professional. See Terms of Service.`,
          estimatedSavings: potentialITCs,
          estimatedSavingsLabel: savingsLabel(potentialITCs),
          priority: 45,
          complexity: "easy",
        });
      }
    }
  }

  // ── Rule 6: Compensation Method Comparison (Incorporated Only) ───────────
  if (input.isIncorporated && input.netIncome > 0) {
    const corpResult = calculateCorporateTax({
      corporateIncome: input.netIncome,
      province: input.province,
      compensationMethod: input.compensationMethod,
      dealCount: Math.max(input.dealCount, 1),
    });

    const currentTax =
      input.compensationMethod === "salary"
        ? corpResult.allSalaryTotalTax
        : input.compensationMethod === "dividends"
          ? corpResult.allDividendsTotalTax
          : corpResult.totalCombinedTax;

    const savings = corpResult.optimalSaving;
    const optimalMethod = corpResult.optimalMethod;

    if (savings > MIN_SAVINGS_THRESHOLD && optimalMethod !== input.compensationMethod) {
      const priority = savings > 2_000 ? 80 : 50;
      cards.push({
        id: "compensationMethod",
        category: "compensationMethod",
        icon: "split",
        title: "Compensation Method Comparison",
        evidence: [
          `Current method (${input.compensationMethod}): estimated combined tax of ${fmtCurrency(Math.round(currentTax))}`,
          `All-salary: ${fmtCurrency(Math.round(corpResult.allSalaryTotalTax))} \u00b7 All-dividends: ${fmtCurrency(Math.round(corpResult.allDividendsTotalTax))}`,
          `Switching to ${optimalMethod} could reduce combined tax by ${savingsLabel(savings).replace("/yr", "")}`,
        ],
        action: `Discuss with your accountant whether adjusting your salary/dividend mix could reduce your overall tax burden. The comparison above shows estimates for different compensation methods.`,
        disclaimer:
          "Salary vs. dividend optimization depends on factors not modeled here: RRSP room generation, CPP retirement benefit value, payroll compliance costs, provincial health taxes, and personal tax credits. This is a simplified comparison. Professional advice is essential. See Terms of Service.",
        estimatedSavings: savings,
        estimatedSavingsLabel: savingsLabel(savings),
        priority,
        complexity: "complex",
      });
    }
  }

  // ── Rule 7: CPP Considerations ───────────────────────────────────────────
  if (input.netIncome > 0) {
    const taxResult = calculatePersonalTax(
      input.netIncome,
      input.province,
      Math.max(input.dealCount, 1),
    );
    const totalCPP = taxResult.totalCPP;
    const cpp2Savings = taxResult.cpp2Contribution * mRate;

    const isDividendsOnly =
      input.isIncorporated && input.compensationMethod === "dividends";
    const priority = isDividendsOnly ? 60 : 35;

    // Only show if CPP is meaningful
    if (totalCPP > 500) {
      cards.push({
        id: "cppConsiderations",
        category: "cppConsiderations",
        icon: "shield-check",
        title: isDividendsOnly
          ? "CPP \u2014 No Contributions on Dividends"
          : "CPP Contribution Awareness",
        evidence: isDividendsOnly
          ? [
              "Dividends do not generate CPP contributions or retirement benefit",
              "This means $0 toward CPP pension from your corporate income",
              "Consider whether private retirement savings offset this trade-off",
            ]
          : [
              `Your CPP contributions: ${fmtCurrency(Math.round(taxResult.cpp1Contribution))} (CPP1) + ${fmtCurrency(Math.round(taxResult.cpp2Contribution))} (CPP2)`,
              `CPP2 is 100% tax-deductible, reducing your tax by ~${fmtCurrency(Math.round(cpp2Savings))}`,
              "Self-employed individuals pay both the employee and employer portions",
            ],
        action: isDividendsOnly
          ? "Research the trade-offs of receiving no CPP contributions. Consider discussing with a financial planner whether RRSP, TFSA, or other retirement vehicles compensate."
          : "Research the trade-offs of CPP contributions at your income level. CPP builds retirement benefits but increases current-year costs for self-employed individuals who pay both halves.",
        disclaimer:
          "CPP/QPP retirement benefit value depends on your full contribution history and the age you begin receiving benefits. The deductibility rules (50% for CPP1 employee half as a credit, 50% employer half as a deduction, 100% for CPP2) are based on current CRA rules and may change. See Terms of Service.",
        estimatedSavings: isDividendsOnly ? 0 : cpp2Savings,
        estimatedSavingsLabel: isDividendsOnly
          ? "Awareness"
          : savingsLabel(cpp2Savings),
        priority,
        complexity: "moderate",
      });
    }
  }

  // ── Rule 8: Quarterly Instalment Check ───────────────────────────────────
  if (input.netIncome > 3_000) {
    const taxResult = calculatePersonalTax(
      input.netIncome,
      input.province,
      Math.max(input.dealCount, 1),
    );
    const annualTax = taxResult.totalBurden;
    const quarterlyTarget = annualTax / 4;
    const q = currentQuarter();
    const expectedByNow = quarterlyTarget * q;
    const gap = expectedByNow - input.taxInstalmentsPaid;

    if (gap > 1_000) {
      // Underpaying
      const interestRisk = gap * CRA_INSTALMENT_INTEREST_RATE;
      cards.push({
        id: "instalmentOptimization",
        category: "instalmentOptimization",
        icon: "calendar-check",
        title: "Instalment Shortfall Detected",
        evidence: [
          `Projected annual tax: ${fmtCurrency(Math.round(annualTax))} \u2192 quarterly target: ${fmtCurrency(Math.round(quarterlyTarget))}`,
          `Through Q${q}, expected paid: ${fmtCurrency(Math.round(expectedByNow))} \u00b7 Actual paid: ${fmtCurrency(Math.round(input.taxInstalmentsPaid))}`,
          `Shortfall of ~${fmtCurrency(Math.round(gap))} could incur ~${fmtCurrency(Math.round(interestRisk))} in CRA interest at ~${fmtPct(CRA_INSTALMENT_INTEREST_RATE)} (rate changes quarterly)`,
        ],
        action:
          "Review your instalment payments with your accountant. CRA charges interest on instalment shortfalls at the prescribed rate. Catching up before the next deadline may reduce interest.",
        disclaimer:
          "CRA instalment requirements depend on your net tax owing in the current and two prior years. The prescribed interest rate changes quarterly. Instalment calculations can use the current-year, prior-year, or second-prior-year method. Consult CRA Form T1-P4 or a tax professional. See Terms of Service.",
        estimatedSavings: interestRisk,
        estimatedSavingsLabel: savingsLabel(interestRisk),
        priority: 85,
        complexity: "easy",
      });
    } else if (gap < -2_000) {
      // Overpaying
      const overpayment = Math.abs(gap);
      const opportunityCost = overpayment * 0.05; // approximate opportunity cost
      cards.push({
        id: "instalmentOptimization",
        category: "instalmentOptimization",
        icon: "calendar-check",
        title: "Instalment Overpayment",
        evidence: [
          `Through Q${q}, expected: ${fmtCurrency(Math.round(expectedByNow))} \u00b7 Actual paid: ${fmtCurrency(Math.round(input.taxInstalmentsPaid))}`,
          `You may be overpaying by ~${fmtCurrency(Math.round(overpayment))}`,
        ],
        action:
          "Discuss with your accountant whether reducing your next instalment payment and redirecting funds to RRSP or investments could be beneficial.",
        disclaimer:
          "CRA instalment requirements depend on your net tax owing in the current and two prior years. The prescribed interest rate changes quarterly. Consult a tax professional before modifying instalment payments. See Terms of Service.",
        estimatedSavings: opportunityCost,
        estimatedSavingsLabel: savingsLabel(opportunityCost),
        priority: 30,
        complexity: "easy",
      });
    }
  }

  // ── Rule 9: Year-End Tax Planning ────────────────────────────────────────
  {
    const month = currentMonth();
    if (month >= 10 && input.netIncome > 0) {
      const year = new Date().getFullYear();
      const daysLeft = Math.ceil(
        (new Date(year, 11, 31).getTime() - Date.now()) / 86_400_000,
      );
      // Conservative estimate: $2,000–$3,000 in pre-payable expenses
      const estimatedPrepayable = 2_500;
      const savings = estimatedPrepayable * mRate;
      const priority = month >= 11 ? 80 : 55;

      if (savings >= MIN_SAVINGS_THRESHOLD) {
        cards.push({
          id: "yearEndPlanning",
          category: "yearEndPlanning",
          icon: "clock",
          title: "Year-End Tax Planning Window",
          evidence: [
            `${daysLeft} days remaining in the ${year} tax year`,
            `Your marginal rate: ${fmtPct(mRate)} \u2014 each dollar of deductions in ${year} reduces tax by that amount`,
            "Common pre-payable items: board/MLS dues, professional development, software, equipment under $500",
          ],
          action: `Ask your accountant about accelerating deductible expenses before December 31 \u2014 board dues, professional development, software renewals, and equipment under $500 (potentially eligible for immediate write-off under Class 12).`,
          disclaimer:
            "Expense timing strategies depend on your cash flow and individual tax situation. Pre-payment rules vary by expense type \u2014 not all pre-paid expenses are deductible in the year of payment. CRA may disallow deductions for prepaid amounts extending beyond 12 months. See Terms of Service.",
          estimatedSavings: savings,
          estimatedSavingsLabel: savingsLabel(savings),
          priority,
          complexity: "easy",
        });
      }
    }
  }

  // ── Rule 10: Commonly Missed Deductions ──────────────────────────────────
  if (input.netIncome > 0) {
    const missing: { label: string; estimate: number }[] = [];

    if (!input.hasProfDevExpenses)
      missing.push({ label: "Professional development / courses", estimate: 1_500 });
    if (!input.hasLicensingExpenses)
      missing.push({ label: "Licensing, MLS, and board fees", estimate: 3_000 });
    if (!input.hasMarketingExpenses)
      missing.push({ label: "Marketing and advertising", estimate: 2_000 });
    if (!input.hasClientGiftExpenses)
      missing.push({ label: "Client appreciation gifts (must be reasonable)", estimate: 500 });
    if (!input.hasMealExpenses)
      missing.push({ label: "Meals with clients (50% deductible)", estimate: 800 });
    if (input.ccaAssetCount === 0 && (input.experienceYears ?? 0) > 1)
      missing.push({ label: "Capital Cost Allowance (laptop, phone, furniture)", estimate: 1_200 });

    if (missing.length > 0) {
      const totalMissedEstimate = missing.reduce((s, m) => s + m.estimate, 0);
      const savings = totalMissedEstimate * mRate;
      const priority = missing.length >= 3 ? 60 : 40;

      if (savings >= MIN_SAVINGS_THRESHOLD) {
        cards.push({
          id: "missedDeductions",
          category: "missedDeductions",
          icon: "clipboard-check",
          title: "Commonly Missed Deductions",
          evidence: [
            `${missing.length} common expense categories not tracked:`,
            ...missing.map(
              (m) => `${m.label} (typical: ${fmtCurrency(m.estimate)}/yr)`,
            ),
          ],
          action:
            "Review whether you\u2019re tracking all eligible business expenses. Common deductions for real estate agents include: professional development, licensing/board fees, marketing, client appreciation gifts (must be reasonable per CRA), and meals with clients (50% deductible).",
          disclaimer:
            "All business expenses must be reasonable, incurred to earn income, and supported by receipts or documentation. Client gift deductions are limited. Meal deductions are generally limited to 50% of the amount paid. CRA may request supporting documentation during a review or audit. See Terms of Service.",
          estimatedSavings: savings,
          estimatedSavingsLabel: savingsLabel(savings),
          priority,
          complexity: "easy",
        });
      }
    }
  }

  // ── Filter dismissed & sort ──────────────────────────────────────────────
  const dismissedSet = new Set(input.dismissed);
  const activeCards = cards.filter((c) => !dismissedSet.has(c.id));
  activeCards.sort((a, b) => b.estimatedSavings - a.estimatedSavings);
  const limited = activeCards.slice(0, limit);
  const totalEstimatedSavings = limited.reduce(
    (sum, c) => sum + c.estimatedSavings,
    0,
  );

  return {
    cards: limited,
    totalEstimatedSavings,
    topOpportunity: limited[0] ?? null,
    cardCount: limited.length,
  };
}
