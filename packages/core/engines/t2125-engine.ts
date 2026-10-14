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
 *   Home office: actual-cost method (business-use % of home costs). Home
 *     bills logged under the Home Office expense category are those costs;
 *     a cost type with no logged bills falls back to the estimate in settings.
 *   Meals & Entertainment: 50% deductible
 *   Half-year CCA rule applies to most asset classes
 *
 * IMPORTANT: All outputs are ESTIMATES for planning purposes only.
 * They do not constitute a filed T2125 or professional tax advice.
 */

import type { UserSettings, Transaction, CcaAsset } from "../types/database";
import { computeGCI } from "../types/database";
import { gstHstRate, gstHstLabel, calculate as calculateTax } from "./canadian-tax-engine";
import { closingYearGCI, dealsInTaxYear, incomeReportingMethod, type IncomeReportingMethod } from "./tax-year";

// ── Expense key → T2125 line mapping ─────────────────────────────────────────
// Maps each expense_item key to the correct T2125 line number and whether
// the 50% meals rule applies.

export interface T2125LineMap {
  lineNumber: string;
  lineName: string;
  deductiblePct: number; // 1.0 = fully deductible, 0.5 = 50% meals rule
  applyVehicleUse: boolean; // multiply by vehicle_business_use_pct
  /**
   * A home bill (heat, insurance, mortgage interest...). Only the home
   * business-use share is a business cost, and it is claimed on line 9945
   * (business-use-of-home), never on an expense line or in line 9369.
   */
  applyHomeUse?: boolean;
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

  // Business-use-of-home (CRA T2125 line 9945) — actual home bills, multiplied
  // by home_office_business_use_pct. See HOME_OFFICE_KEY_TO_COST below.
  home_utilities:         { lineNumber: "9945", lineName: "Home electricity, heat & water", deductiblePct: 1.0, applyVehicleUse: false, applyHomeUse: true, t2125Part: "home_office" },
  home_internet:          { lineNumber: "9945", lineName: "Home internet",                  deductiblePct: 1.0, applyVehicleUse: false, applyHomeUse: true, t2125Part: "home_office" },
  home_insurance:         { lineNumber: "9945", lineName: "Home insurance",                 deductiblePct: 1.0, applyVehicleUse: false, applyHomeUse: true, t2125Part: "home_office" },
  home_maintenance:       { lineNumber: "9945", lineName: "Home repairs & maintenance",     deductiblePct: 1.0, applyVehicleUse: false, applyHomeUse: true, t2125Part: "home_office" },
  home_property_tax:      { lineNumber: "9945", lineName: "Property tax",                   deductiblePct: 1.0, applyVehicleUse: false, applyHomeUse: true, t2125Part: "home_office" },
  home_mortgage_interest: { lineNumber: "9945", lineName: "Mortgage interest",              deductiblePct: 1.0, applyVehicleUse: false, applyHomeUse: true, t2125Part: "home_office" },
  home_rent:              { lineNumber: "9945", lineName: "Rent",                           deductiblePct: 1.0, applyVehicleUse: false, applyHomeUse: true, t2125Part: "home_office" },
  home_condo_fees:        { lineNumber: "9945", lineName: "Condo fees",                     deductiblePct: 1.0, applyVehicleUse: false, applyHomeUse: true, t2125Part: "home_office" },
};

// ── Home bills → business-use-of-home cost types ─────────────────────────────
// The Home Office expense category (migration 00174) holds the real bills.
// Each key feeds one of the cost types the T2125 home office section already
// had as a settings estimate. Mortgage interest and rent share one (the
// settings field has always been "rent or mortgage interest"); home internet
// is counted with utilities.

export type HomeOfficeCostType =
  | "rent"
  | "utilities"
  | "propertyTax"
  | "insurance"
  | "maintenance"
  | "condoFees";

export const HOME_OFFICE_CATEGORY_KEY = "home_office";

export const HOME_OFFICE_KEY_TO_COST: Record<string, HomeOfficeCostType> = {
  home_utilities: "utilities",
  home_internet: "utilities",
  home_insurance: "insurance",
  home_maintenance: "maintenance",
  home_property_tax: "propertyTax",
  home_mortgage_interest: "rent",
  home_rent: "rent",
  home_condo_fees: "condoFees",
  // A recurring expense can carry the category key instead of an item key.
  [HOME_OFFICE_CATEGORY_KEY]: "maintenance",
};

const hasOwn = (map: object, key: string) => Object.prototype.hasOwnProperty.call(map, key);

/** A home bill: only the home business-use share of it is a business cost. */
export function isHomeOfficeKey(key: string | null | undefined): boolean {
  if (!key) return false;
  return hasOwn(HOME_OFFICE_KEY_TO_COST, key);
}

// ── Keys with no line of their own ───────────────────────────────────────────
// EXPENSE_KEY_TO_T2125 is keyed by expense ITEM, and every writer now files
// under an item. Three other kinds of key can still reach the T2125 inputs:
//   - a category-level key ("vehicle", "marketing"). Flight Crew's expense
//     tools wrote these until 2026-10-13; migration 00175 moved the existing
//     rows to each category's first-choice item;
//   - a custom expense item the agent added, or an item of a category the
//     T2125 has no line for (corporate admin, payroll);
//   - none at all (a receipt saved with no category).
// Until 2026-10-13 computeT2125 dropped all three without a word, while the
// expense totals, the income-tax estimate and the GST34 ITCs counted them.
// Now every key resolves to a line:
//   - a category-level key is treated as the item migration 00175 moved such
//     rows to, so a stray one counts exactly as a moved one does;
//   - the Home Office category key is a home bill (business-use-of-home);
//   - anything else goes on line 9270 "Other expenses" at 100%. Filing the
//     expense under an item moves it to that item's line.
// gst34-engine reads its meal and vehicle ITC limits from this resolver, so
// an expense can't be a meal for the T2125 and not for the ITC.

/** Category-level key → the item it stands for. Same list as migration 00175. */
const CATEGORY_KEY_TO_ITEM_KEY: Record<string, string> = {
  vehicle: "vehicle_fuel",
  marketing: "marketing_ads",
  office_tech: "office_supplies",
  professional: "prof_accounting",
  professional_fees: "prof_accounting",
  insurance_licenses: "prof_licensing",
  education: "edu_courses",
  education_dev: "edu_courses",
  meals: "meals_client",
  travel_meals: "meals_client",
  entertainment: "ent_client",
  other: "other_misc",
  // Never written by the app. The GST34 engine listed them as meal keys
  // before it read its limits from here; kept so that doesn't change.
  meals_entertainment: "meals_client",
  client_meals: "meals_client",
};

/**
 * The expense item a category-level key stands for (the table above), or
 * the key itself when it is not one.
 */
export function expenseItemKeyFor(key: string): string {
  return hasOwn(CATEGORY_KEY_TO_ITEM_KEY, key) ? CATEGORY_KEY_TO_ITEM_KEY[key] : key;
}

const HOME_OFFICE_CATEGORY_LINE: T2125LineMap = {
  lineNumber: "9945", lineName: "Home office costs", deductiblePct: 1.0, applyVehicleUse: false, applyHomeUse: true, t2125Part: "home_office",
};

/** Where a key with no line of its own goes: CRA T2125 line 9270, in full. */
export const T2125_OTHER_EXPENSES: T2125LineMap = {
  lineNumber: "9270", lineName: "Other expenses", deductiblePct: 1.0, applyVehicleUse: false, t2125Part: "other",
};

/**
 * The T2125 line and limits for any expense key. Never undefined: see the
 * note above for what a category-level, custom or missing key resolves to.
 */
export function t2125LineForExpenseKey(key: string | null | undefined): T2125LineMap {
  if (!key) return T2125_OTHER_EXPENSES;
  if (hasOwn(EXPENSE_KEY_TO_T2125, key)) return EXPENSE_KEY_TO_T2125[key];
  if (key === HOME_OFFICE_CATEGORY_KEY) return HOME_OFFICE_CATEGORY_LINE;
  if (hasOwn(CATEGORY_KEY_TO_ITEM_KEY, key)) return EXPENSE_KEY_TO_T2125[CATEGORY_KEY_TO_ITEM_KEY[key]];
  return T2125_OTHER_EXPENSES;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ExpenseLineItem {
  key: string | null;        // null = receipts saved with no category
  lineName: string;
  lineNumber: string;
  rawAmount: number;         // Total amount from receipts/items (before adjustments)
  deductiblePct: number;     // 1.0 or 0.5
  vehicleUsePct: number;     // 1.0 if not vehicle, vehicle_business_use_pct if vehicle
  deductibleAmount: number;  // rawAmount × deductiblePct × vehicleUsePct
  isVehicle: boolean;
  isMeals: boolean;
}

/**
 * One tracked expense amount handed to the T2125. Built by
 * `buildT2125Expenses` (t2125-expenses-engine) from receipts, the legacy
 * per-item monthly figure and the Recurring Expenses list: pages don't
 * assemble these themselves.
 */
export interface T2125ExpenseEntry {
  /** Expense key. Any key is accepted: see t2125LineForExpenseKey. */
  key: string | null;
  /** Year-to-date amount, net of ITCs for a GST/HST registrant (expense-totals-engine). */
  amount: number;
  /**
   * A recurring expense's `vehicle_pct_applicable` box. Ticked, the expense
   * takes the vehicle business-use share whatever its key. A vehicle key
   * takes it ticked or not. This is the same OR `itcForExpense` applies to
   * the GST/HST, so the T2125 and the GST34 make one call per expense.
   */
  vehicleUse?: boolean;
}

/** Entries for a plain key → amount map, each key under its own rules. */
export function t2125EntriesFromAmounts(amounts: Record<string, number>): T2125ExpenseEntry[] {
  return Object.entries(amounts).map(([key, amount]) => ({ key, amount }));
}

/**
 * What one tracked expense counts for: its T2125 line, the 50% meals limit
 * and the vehicle business-use share. The only place that arithmetic is
 * done, for the T2125 pre-fill and for the Expenses page alike.
 *
 * A home bill's amount is already the home office share (expense-totals-
 * engine), so it comes back at 100% of that. computeT2125 keeps home bills
 * out of the expense lines: they are costs behind line 9945.
 */
export function t2125ExpenseLine(entry: T2125ExpenseEntry, vehicleBusinessUsePct: number): ExpenseLineItem {
  const map = t2125LineForExpenseKey(entry.key);
  const rawAmount = entry.amount;
  if (map.applyHomeUse) {
    return {
      key: entry.key, lineName: map.lineName, lineNumber: map.lineNumber, rawAmount,
      deductiblePct: 1.0, vehicleUsePct: 1.0, deductibleAmount: rawAmount, isVehicle: false, isMeals: false,
    };
  }
  const isMeals = map.deductiblePct === 0.5;
  const isVehicle = map.applyVehicleUse || entry.vehicleUse === true;
  const vehicleUsePct = isVehicle ? Math.min(1, Math.max(0, vehicleBusinessUsePct || 0)) : 1.0;
  return {
    key: entry.key,
    lineName: map.lineName,
    // A cost that takes the vehicle share is a motor vehicle expense whatever
    // it was filed under. A meal stays on 8523, where its 50% limit is shown.
    lineNumber: isVehicle && !isMeals ? "9281" : map.lineNumber,
    rawAmount,
    deductiblePct: map.deductiblePct,
    vehicleUsePct,
    deductibleAmount: rawAmount * map.deductiblePct * vehicleUsePct,
    isVehicle,
    isMeals,
  };
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
  /**
   * Cost types whose amount above is the total of bills logged under the
   * Home Office expense category. The rest are the settings estimate.
   */
  loggedCostTypes: HomeOfficeCostType[];
}

export interface GstHstResult {
  label: string;              // "HST" | "GST + QST" | "GST"
  rate: number;               // e.g. 0.13 for Ontario
  collectedOnGCI: number;     // gciBase × rate
  /** The GCI the collected figure is on: the deals that closed in taxYear, under either income reporting method. */
  gciBase: number;
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
  grossCommissionIncome: number;     // GCI of the deals that are income of taxYear (tax-year.ts)
  /** Deals behind grossCommissionIncome. */
  incomeDealCount: number;
  /** `user_settings.income_reporting_method`, as read (tax-year.ts). */
  incomeReportingMethod: IncomeReportingMethod;
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
  /**
   * Closed deals. Only those that are income of `taxYear` count
   * (`dealsInTaxYear`, tax-year.ts): the year's closings, or for a
   * cash-method agent the deals paid in it, so pass the earlier closings
   * paid this year too. Rows of other years are left out here.
   */
  transactions: Transaction[];
  /**
   * Expenses incurred to date: `buildT2125Expenses(...).entries`
   * (t2125-expenses-engine), which covers receipts, the legacy per-item
   * monthly figure and the Recurring Expenses list. Until 2026-10-13 this was
   * a key → amount map each caller built, and the recurring list was never
   * in it.
   */
  expenses: readonly T2125ExpenseEntry[];
  /**
   * Home bills logged this year, by expense key: the WHOLE bill, before the
   * business-use share (`buildT2125Expenses(...).homeOfficeCosts`). A home
   * key in `expenses` is ignored: an entry carries it at the business share.
   */
  homeOfficeCosts?: Record<string, number>;
  ccaAssets: CcaAsset[];
  taxYear?: number;
  otherIncome?: number;                // user-entered other business income (referrals, etc.)
}

// ── Main compute function ─────────────────────────────────────────────────────

export function computeT2125(input: T2125Input): T2125Result {
  const { settings, transactions, expenses, ccaAssets } = input;
  const taxYear = input.taxYear ?? new Date().getFullYear();
  const otherIncome = input.otherIncome ?? 0;

  // ── 1. Gross commission income ─────────────────────────────────────────────
  // The commissions that are income of taxYear: by closing date (accrual), or
  // by commission paid date for a cash-method agent (T4002 ch. 1).
  const method = incomeReportingMethod(settings);
  const closed = transactions.filter((tx) => tx.status === "closed");
  const incomeDeals = dealsInTaxYear(closed, method, taxYear);
  const grossCommissionIncome = incomeDeals.reduce((sum, tx) => sum + computeGCI(tx), 0);

  const totalGrossIncome = grossCommissionIncome + otherIncome;

  // ── 2. Build expense lines ─────────────────────────────────────────────────
  const vehicleUsePct = Math.min(1, Math.max(0, settings.vehicle_business_use_pct ?? 0));

  const expenseLines: ExpenseLineItem[] = expenses
    // Home bills are not expense lines: they are the costs behind line 9945.
    .filter((e) => e.amount > 0 && !isHomeOfficeKey(e.key))
    .map((e) => t2125ExpenseLine(e, vehicleUsePct));

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

  // Bills logged under the Home Office expense category, by cost type. Where
  // a cost type has logged bills they ARE the cost; the settings figure is an
  // estimate for someone who hasn't logged any, and adding the two would
  // count the same heat or insurance twice.
  const logged: Record<HomeOfficeCostType, number> = {
    rent: 0, utilities: 0, propertyTax: 0, insurance: 0, maintenance: 0, condoFees: 0,
  };
  for (const [key, amount] of Object.entries(input.homeOfficeCosts ?? {})) {
    const type = HOME_OFFICE_KEY_TO_COST[key];
    if (type && Number.isFinite(amount) && amount > 0) logged[type] += amount;
  }
  const cost = (type: HomeOfficeCostType, estimate: number) =>
    logged[type] > 0 ? logged[type] : estimate;

  const annualRent = cost("rent", (settings.home_office_rent_monthly ?? 0) * 12);
  const annualUtilities = cost("utilities", (settings.home_office_utilities_monthly ?? 0) * 12);
  const annualPropertyTax = cost("propertyTax", settings.home_office_property_tax_annual ?? 0);
  const annualInsurance = cost("insurance", (settings.home_office_insurance_monthly ?? 0) * 12);
  const annualMaintenance = cost("maintenance", settings.home_office_maintenance_annual ?? 0);
  const annualCondoFees = cost("condoFees", (settings.home_office_condo_fees_monthly ?? 0) * 12);
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
    loggedCostTypes: (Object.keys(logged) as HomeOfficeCostType[]).filter((t) => logged[t] > 0),
  };

  // ── 5. Net business income ─────────────────────────────────────────────────
  const line8270_netBusinessIncome = Math.max(
    0,
    totalGrossIncome - line9369_totalExpenses - line9936_totalCca - homeOfficeDeduction,
  );

  // ── 6. Tax engine (on net income after T2125 deductions) ──────────────────
  const dealCount = incomeDeals.length;
  const taxResult = calculateTax(line8270_netBusinessIncome, settings.province, Math.max(dealCount, 1));

  const cppContribution = taxResult.cpp1Contribution + taxResult.cpp2Contribution;
  const cppDeductible = taxResult.cpp1Contribution * 0.5 + taxResult.cpp2Contribution;

  // ── 7. GST/HST ────────────────────────────────────────────────────────────
  const gstRate = gstHstRate(settings.province);
  const gstLabel = gstHstLabel(settings.province);
  // GST/HST follows the closing year under either method: the income
  // reporting method is an income tax rule (closingYearGCI, tax-year.ts).
  const gstGciBase = closingYearGCI(closed, taxYear);
  const collectedOnGCI = gstGciBase * gstRate;
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
    gciBase: gstGciBase,
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
    incomeDealCount: dealCount,
    incomeReportingMethod: method,
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
