/**
 * T2125 Statement of Business Activities — Pre-Fill Engine
 * ==========================================================
 * Computes all T2125 line values from data already in Agent Runway.
 * Produces a structured T2125Result that can be:
 *   1. Displayed as an editable pre-fill form
 *   2. Exported as a PDF summary for your accountant
 *
 * CRA References:
 *   T2125 form: https://www.canada.ca/en/revenue-agency/services/forms-publications/forms/t2125.html
 *   Industry Code 531210: Real Estate Agents
 *   Home office: actual-cost method (business-use % of home costs)
 *   Meals & Entertainment: 50% deductible
 *   Half-year CCA rule applies to most asset classes
 *
 * IMPORTANT: All outputs are ESTIMATES for planning purposes only.
 * They do not constitute a filed T2125 or professional tax advice.
 */

import type { UserSettings, Transaction, CcaAsset } from "../types/database";
import { computeGCI } from "../types/database";
import { gstHstRate, gstHstLabel, calculate as calculateTax } from "./canadian-tax-engine";

// ── Expense key → T2125 line mapping ─────────────────────────────────────────
// Maps each expense_item key to the correct T2125 line number and whether
// the 50% meals rule applies.

export interface T2125LineMap {
  lineNumber: string;
  lineName: string;
  deductiblePct: number; // 1.0 = fully deductible, 0.5 = 50% meals rule
  applyVehicleUse: boolean; // multiply by vehicle_business_use_pct
  t2125Part: "expenses" | "vehicle" | "home_office" | "professional" | "other";
}

export const EXPENSE_KEY_TO_T2125: Record<string, T2125LineMap> = {
  // Vehicle expenses (CRA T2125 line 9281) — multiplied by vehicle_business_use_pct
  vehicle_payment:   { lineNumber: "9281", lineName: "Vehicle lease / rental",      deductiblePct: 1.0, applyVehicleUse: true,  t2125Part: "vehicle" },
  vehicle_insurance: { lineNumber: "9281", lineName: "Motor vehicle insurance",      deductiblePct: 1.0, applyVehicleUse: true,  t2125Part: "vehicle" },
  vehicle_fuel:      { lineNumber: "9281", lineName: "Motor vehicle fuel",           deductiblePct: 1.0, applyVehicleUse: true,  t2125Part: "vehicle" },
  vehicle_service:   { lineNumber: "9281", lineName: "Motor vehicle repairs/maint.", deductiblePct: 1.0, applyVehicleUse: true,  t2125Part: "vehicle" },

  // Marketing / advertising (CRA T2125 line 8521)
  marketing_ads:         { lineNumber: "8521", lineName: "Advertising",        deductiblePct: 1.0, applyVehicleUse: false, t2125Part: "expenses" },
  marketing_photography: { lineNumber: "8521", lineName: "Photography & video", deductiblePct: 1.0, applyVehicleUse: false, t2125Part: "expenses" },
  marketing_print:       { lineNumber: "8521", lineName: "Print / signage",     deductiblePct: 1.0, applyVehicleUse: false, t2125Part: "expenses" },
  marketing_gifts:       { lineNumber: "9270", lineName: "Business gifts",      deductiblePct: 1.0, applyVehicleUse: false, t2125Part: "expenses" },

  // Office & tech (CRA T2125 line 8811 office supplies, 9220 utilities/phone)
  office_supplies:  { lineNumber: "8811", lineName: "Office supplies",         deductiblePct: 1.0, applyVehicleUse: false, t2125Part: "expenses" },
  office_software:  { lineNumber: "8811", lineName: "Software subscriptions",  deductiblePct: 1.0, applyVehicleUse: false, t2125Part: "expenses" },
  office_phone:     { lineNumber: "9220", lineName: "Phone & internet",        deductiblePct: 1.0, applyVehicleUse: false, t2125Part: "expenses" },
  office_hardware:  { lineNumber: "8811", lineName: "Hardware & equipment",    deductiblePct: 1.0, applyVehicleUse: false, t2125Part: "expenses" },

  // Professional fees — CRA T2125 lines: 8760 licences/memberships, 8690 insurance, 8860 professional fees
  prof_board_mls:  { lineNumber: "8760", lineName: "Board / MLS dues",         deductiblePct: 1.0, applyVehicleUse: false, t2125Part: "professional" },
  prof_licensing:  { lineNumber: "8760", lineName: "Licensing & renewals",     deductiblePct: 1.0, applyVehicleUse: false, t2125Part: "professional" },
  prof_eo:         { lineNumber: "8690", lineName: "E&O insurance",            deductiblePct: 1.0, applyVehicleUse: false, t2125Part: "professional" },
  prof_accounting: { lineNumber: "8860", lineName: "Accounting & legal",       deductiblePct: 1.0, applyVehicleUse: false, t2125Part: "professional" },

  // Education (professional development) — CRA T2125 line 9270 (Other expenses)
  edu_courses:     { lineNumber: "9270", lineName: "Courses & coaching",       deductiblePct: 1.0, applyVehicleUse: false, t2125Part: "professional" },
  edu_conferences: { lineNumber: "9270", lineName: "Conferences",              deductiblePct: 1.0, applyVehicleUse: false, t2125Part: "professional" },
  edu_books:       { lineNumber: "9270", lineName: "Books & materials",        deductiblePct: 1.0, applyVehicleUse: false, t2125Part: "professional" },

  // Meals & entertainment — 50% deductible (CRA T2125 line 8523)
  meals_client: { lineNumber: "8523", lineName: "Client meals",            deductiblePct: 0.5, applyVehicleUse: false, t2125Part: "expenses" },
  meals_team:   { lineNumber: "8523", lineName: "Team / staff meals",      deductiblePct: 0.5, applyVehicleUse: false, t2125Part: "expenses" },
  ent_client:   { lineNumber: "8523", lineName: "Client entertainment",    deductiblePct: 0.5, applyVehicleUse: false, t2125Part: "expenses" },
  ent_events:   { lineNumber: "8523", lineName: "Events & tickets",        deductiblePct: 0.5, applyVehicleUse: false, t2125Part: "expenses" },

  // Other (CRA T2125 line 9270)
  other_misc: { lineNumber: "9270", lineName: "Other expenses",           deductiblePct: 1.0, applyVehicleUse: false, t2125Part: "other" },
};

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ExpenseLineItem {
  key: string;
  lineName: string;
  lineNumber: string;
  rawAmount: number;         // Total amount from receipts/items (before adjustments)
  deductiblePct: number;     // 1.0 or 0.5
  vehicleUsePct: number;     // 1.0 if not vehicle, vehicle_business_use_pct if vehicle
  deductibleAmount: number;  // rawAmount × deductiblePct × vehicleUsePct
  isVehicle: boolean;
  isMeals: boolean;
}

export interface CcaLineItem {
  asset: CcaAsset;
  adjustedCost: number;      // original_cost × business_use_pct
  ucc: number;               // opening_ucc + additions − disposals
  ccaRate: number;
  halfYearAdditions: number; // half-year rule on additions
  ccaClaimed: number;        // estimated CCA claim for this year
  closingUcc: number;        // ucc − ccaClaimed
}

export interface HomeOfficeResult {
  // CRA actual-cost method (only method available in Canada)
  annualRent: number;
  annualUtilities: number;
  annualPropertyTax: number;
  annualInsurance: number;
  annualMaintenance: number;
  annualCondoFees: number;
  totalAnnualHomeCosts: number;
  businessUsePct: number;
  deduction: number;             // totalAnnualHomeCosts × businessUsePct
}

export interface GstHstResult {
  label: string;              // "HST" | "GST + QST" | "GST"
  rate: number;               // e.g. 0.13 for Ontario
  collectedOnGCI: number;     // GCI × rate
  remittedTotal: number;      // q1+q2+q3+q4
  paidOnExpenses: number;     // ITCs (user-entered)
  netPayable: number;         // collected − paid (positive = owe CRA)
  remittedQ1: number;
  remittedQ2: number;
  remittedQ3: number;
  remittedQ4: number;
}

export interface InstalmentResult {
  recommendedQuarterly: number; // Tax engine total ÷ 4
  paidQ1: number;
  paidQ2: number;
  paidQ3: number;
  paidQ4: number;
  totalPaid: number;
  balance: number;               // recommended − paid (positive = still owe)
}

export interface T2125Result {
  taxYear: number;

  // ── Part 1: Identification
  agentName: string;
  businessName: string;
  businessNumber: string;
  province: string;
  fiscalYearEnd: string;
  industryCode: string;        // Always "531210" for RE agents

  // ── Part 2: Income (T2125 Part 3A)
  grossCommissionIncome: number;     // Sum of all closed transaction GCI
  otherIncome: number;               // Placeholder — user can add other sources
  totalGrossIncome: number;          // line 8200

  // ── Part 3: Detailed expense line items
  expenseLines: ExpenseLineItem[];

  // ── Part 4: Expense subtotals by T2125 line (CRA 2025 line numbers)
  line8521_advertising: number;
  line9281_motorVehicle: number;             // all vehicle expenses combined
  line8811_officeSupplies: number;
  line8523_mealsEntertainment50pct: number;
  line8523_mealsEntertainmentGross: number;  // before 50% reduction
  line9220_utilities: number;
  line9270_otherExpenses: number;
  line8760_licencesMemberships: number;
  line8690_insurance: number;
  line8860_professionalFees: number;
  line9369_totalExpenses: number;            // sum of all expense lines

  // ── Part 5: CCA (CRA T2125 line 9936)
  ccaLines: CcaLineItem[];
  line9936_totalCca: number;

  // ── Part 6: Home office (CRA T2125 line 9945)
  homeOffice: HomeOfficeResult;
  line9945_homeOfficeDeduction: number;

  // ── Net income
  line8270_netBusinessIncome: number;  // 8200 − 9369 − 9936 − 9945

  // ── CPP
  cppContribution: number;    // total self-employed CPP (cpp1 + cpp2)
  cppDeductible: number;      // deductible half of cpp1 + 100% cpp2

  // ── GST/HST
  gstHst: GstHstResult;

  // ── Instalments
  instalments: InstalmentResult;

  // ── Tax engine result (for reference)
  totalTaxBurden: number;
  effectiveRate: number;
}

// ── Input type ────────────────────────────────────────────────────────────────

export interface T2125Input {
  settings: UserSettings;
  transactions: Transaction[];         // closed deals, current year
  expenseAmounts: Record<string, number>; // key → YTD amount (receipts + recurring)
  ccaAssets: CcaAsset[];
  taxYear?: number;
  otherIncome?: number;                // user-entered other business income (referrals, etc.)
}

// ── Main compute function ─────────────────────────────────────────────────────

export function computeT2125(input: T2125Input): T2125Result {
  const { settings, transactions, expenseAmounts, ccaAssets } = input;
  const taxYear = input.taxYear ?? new Date().getFullYear();
  const otherIncome = input.otherIncome ?? 0;

  // ── 1. Gross commission income ─────────────────────────────────────────────
  const grossCommissionIncome = transactions
    .filter((tx) => tx.status === "closed")
    .reduce((sum, tx) => sum + computeGCI(tx), 0);

  const totalGrossIncome = grossCommissionIncome + otherIncome;

  // ── 2. Build expense lines ─────────────────────────────────────────────────
  const vehicleUsePct = Math.min(1, Math.max(0, settings.vehicle_business_use_pct ?? 0));

  const expenseLines: ExpenseLineItem[] = Object.entries(expenseAmounts)
    .filter(([key, amount]) => amount > 0 && EXPENSE_KEY_TO_T2125[key])
    .map(([key, rawAmount]) => {
      const mapping = EXPENSE_KEY_TO_T2125[key];
      const effectiveVehicleUse = mapping.applyVehicleUse ? vehicleUsePct : 1.0;
      const deductibleAmount = rawAmount * mapping.deductiblePct * effectiveVehicleUse;
      return {
        key,
        lineName: mapping.lineName,
        lineNumber: mapping.lineNumber,
        rawAmount,
        deductiblePct: mapping.deductiblePct,
        vehicleUsePct: effectiveVehicleUse,
        deductibleAmount,
        isVehicle: mapping.applyVehicleUse,
        isMeals: mapping.deductiblePct === 0.5,
      };
    });

  // Helper: sum deductible amount for items matching a line number or key prefix
  const lineSum = (lineNumbers: string[]) =>
    expenseLines
      .filter((l) => lineNumbers.includes(l.lineNumber))
      .reduce((s, l) => s + l.deductibleAmount, 0);

  // CRA T2125 line subtotals (2025 line numbers)
  const line8521_advertising = lineSum(["8521"]);
  const line9281_motorVehicle = lineSum(["9281"]); // all vehicle expenses combined
  const line8811_officeSupplies = lineSum(["8811"]);
  const mealsLines = expenseLines.filter((l) => l.isMeals);
  const line8523_mealsEntertainmentGross = mealsLines.reduce((s, l) => s + l.rawAmount, 0);
  const line8523_mealsEntertainment50pct = mealsLines.reduce((s, l) => s + l.deductibleAmount, 0);
  const line9220_utilities = lineSum(["9220"]);
  const line9270_otherExpenses = lineSum(["9270"]);
  const line8760_licencesMemberships = lineSum(["8760"]);
  const line8690_insurance = lineSum(["8690"]);
  const line8860_professionalFees = lineSum(["8860"]);

  const line9369_totalExpenses =
    line8521_advertising +
    line9281_motorVehicle +
    line8811_officeSupplies +
    line8523_mealsEntertainment50pct +
    line9220_utilities +
    line9270_otherExpenses +
    line8760_licencesMemberships +
    line8690_insurance +
    line8860_professionalFees;

  // ── 3. CCA (CRA T2125 line 9936) ───────────────────────────────────────────
  const ccaLines: CcaLineItem[] = ccaAssets.map((asset) => {
    const adjustedCost = asset.original_cost * asset.business_use_pct;
    // UCC after additions and disposals
    const ucc = asset.opening_ucc + asset.additions_this_year - asset.disposals_this_year;

    // If UCC <= 0, no CCA can be claimed (potential recapture situation)
    if (ucc <= 0) {
      return {
        asset,
        adjustedCost,
        ucc: Math.max(0, ucc),
        ccaRate: asset.class_rate,
        halfYearAdditions: 0,
        ccaClaimed: 0,
        closingUcc: Math.max(0, ucc),
      };
    }

    // CRA half-year rule: applies to NET additions (additions - disposals) when positive
    const netAdditions = Math.max(0, asset.additions_this_year - asset.disposals_this_year);
    const halfYearAdjustment = asset.class_half_year ? netAdditions * 0.5 : 0;

    // CCA base = UCC minus half-year adjustment on net additions
    const ccaBase = ucc - halfYearAdjustment;
    const ccaClaimed = Math.max(0, ccaBase * asset.class_rate * asset.business_use_pct);
    const closingUcc = Math.max(0, ucc - ccaClaimed);
    return {
      asset,
      adjustedCost,
      ucc,
      ccaRate: asset.class_rate,
      halfYearAdditions: netAdditions,
      ccaClaimed,
      closingUcc,
    };
  });
  const line9936_totalCca = ccaLines.reduce((s, l) => s + l.ccaClaimed, 0);

  // ── 4. Home office (CRA actual-cost method) ────────────────────────────────
  // Canada does NOT have an IRS-style simplified method. CRA T2125 uses
  // actual home costs × business-use percentage.
  const homeOfficePct = Math.min(1, Math.max(0, settings.home_office_business_use_pct ?? 0));

  const annualRent = (settings.home_office_rent_monthly ?? 0) * 12;
  const annualUtilities = (settings.home_office_utilities_monthly ?? 0) * 12;
  const annualPropertyTax = settings.home_office_property_tax_annual ?? 0;
  const annualInsurance = (settings.home_office_insurance_monthly ?? 0) * 12;
  const annualMaintenance = settings.home_office_maintenance_annual ?? 0;
  const annualCondoFees = (settings.home_office_condo_fees_monthly ?? 0) * 12;
  const totalAnnualHomeCosts =
    annualRent + annualUtilities + annualPropertyTax +
    annualInsurance + annualMaintenance + annualCondoFees;
  const homeOfficeDeduction = totalAnnualHomeCosts * homeOfficePct;

  const homeOffice: HomeOfficeResult = {
    annualRent,
    annualUtilities,
    annualPropertyTax,
    annualInsurance,
    annualMaintenance,
    annualCondoFees,
    totalAnnualHomeCosts,
    businessUsePct: homeOfficePct,
    deduction: homeOfficeDeduction,
  };

  // ── 5. Net business income ─────────────────────────────────────────────────
  const line8270_netBusinessIncome = Math.max(
    0,
    totalGrossIncome - line9369_totalExpenses - line9936_totalCca - homeOfficeDeduction,
  );

  // ── 6. Tax engine (on net income after T2125 deductions) ──────────────────
  const dealCount = transactions.filter((tx) => tx.status === "closed").length;
  const taxResult = calculateTax(line8270_netBusinessIncome, settings.province, Math.max(dealCount, 1));

  const cppContribution = taxResult.cpp1Contribution + taxResult.cpp2Contribution;
  const cppDeductible = taxResult.cpp1Contribution * 0.5 + taxResult.cpp2Contribution;

  // ── 7. GST/HST ────────────────────────────────────────────────────────────
  const gstRate = gstHstRate(settings.province);
  const gstLabel = gstHstLabel(settings.province);
  const collectedOnGCI = grossCommissionIncome * gstRate;
  const remittedTotal =
    (settings.gst_hst_remitted_q1 ?? 0) +
    (settings.gst_hst_remitted_q2 ?? 0) +
    (settings.gst_hst_remitted_q3 ?? 0) +
    (settings.gst_hst_remitted_q4 ?? 0);
  const paidOnExpenses = settings.gst_hst_paid_on_expenses ?? 0;
  const netPayable = collectedOnGCI - paidOnExpenses - remittedTotal;

  const gstHst: GstHstResult = {
    label: gstLabel,
    rate: gstRate,
    collectedOnGCI,
    remittedTotal,
    paidOnExpenses,
    netPayable,
    remittedQ1: settings.gst_hst_remitted_q1 ?? 0,
    remittedQ2: settings.gst_hst_remitted_q2 ?? 0,
    remittedQ3: settings.gst_hst_remitted_q3 ?? 0,
    remittedQ4: settings.gst_hst_remitted_q4 ?? 0,
  };

  // ── 8. Instalments ────────────────────────────────────────────────────────
  const recommendedQuarterly = taxResult.quarterlyEstimate;
  const totalPaid =
    (settings.tax_instalment_paid_q1 ?? 0) +
    (settings.tax_instalment_paid_q2 ?? 0) +
    (settings.tax_instalment_paid_q3 ?? 0) +
    (settings.tax_instalment_paid_q4 ?? 0);
  const instalments: InstalmentResult = {
    recommendedQuarterly,
    paidQ1: settings.tax_instalment_paid_q1 ?? 0,
    paidQ2: settings.tax_instalment_paid_q2 ?? 0,
    paidQ3: settings.tax_instalment_paid_q3 ?? 0,
    paidQ4: settings.tax_instalment_paid_q4 ?? 0,
    totalPaid,
    balance: Math.max(0, taxResult.totalBurden - totalPaid),
  };

  return {
    taxYear,
    agentName: settings.display_name || "",
    businessName: settings.business_name || "",
    businessNumber: settings.business_number || "",
    province: settings.province,
    fiscalYearEnd: `${taxYear}-12-31`,
    industryCode: "531210",

    grossCommissionIncome,
    otherIncome,
    totalGrossIncome,

    expenseLines,
    line8521_advertising,
    line9281_motorVehicle,
    line8811_officeSupplies,
    line8523_mealsEntertainment50pct,
    line8523_mealsEntertainmentGross,
    line9220_utilities,
    line9270_otherExpenses,
    line8760_licencesMemberships,
    line8690_insurance,
    line8860_professionalFees,
    line9369_totalExpenses,

    ccaLines,
    line9936_totalCca,

    homeOffice,
    line9945_homeOfficeDeduction: homeOfficeDeduction,

    line8270_netBusinessIncome,

    cppContribution,
    cppDeductible,

    gstHst,

    instalments,
    totalTaxBurden: taxResult.totalBurden,
    effectiveRate: taxResult.effectiveRate,
  };
}
