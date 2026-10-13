/**
 * Home Office expense category (2026-10-13).
 *
 * An agent's home costs change from month to month, and the only place for
 * them was a fixed monthly estimate on the T2125 tab. The Home Office
 * category (migration 00174) lets each real bill be logged like any receipt.
 *
 * A home bill is a household bill first. Three engines have to agree on what
 * the workspace share (user_settings.home_office_business_use_pct) does:
 *
 *   expense-totals-engine  the bill counts at the share in every total
 *   gst34-engine           the ITC is the share of its GST/HST (CRA's ITC
 *                          eligibility table for operating expenses: 10% or
 *                          less none, 90% or more all)
 *   t2125-engine           the whole bills are the costs behind line 9945,
 *                          and are never an expense line or part of 9369
 *
 * Fixtures are $115 paid with $15 HST at a 15% share unless a test says
 * otherwise.
 */
import { describe, expect, it } from "vitest";
import {
  aggregateReceiptTotals,
  expenseNetOfItc,
  expenseTaxContext,
  recurringExpensesNetOfItc,
  recurringNetOfItc,
} from "../expense-totals-engine";
import { computeGST34, homeOfficeItcShare, isMealOrEntertainmentKey, isVehicleKey, itcForExpense } from "../gst34-engine";
import { getFilingPeriods } from "../filing-period-engine";
import { totalRecurringMonthly } from "../recurring-expense-engine";
import {
  EXPENSE_KEY_TO_T2125,
  HOME_OFFICE_CATEGORY_KEY,
  HOME_OFFICE_KEY_TO_COST,
  computeT2125,
  isHomeOfficeKey,
  t2125EntriesFromAmounts,
} from "../t2125-engine";
import { createTestSettings } from "./test-data";
import type { RecurringExpense } from "../../types/database";

const HOME_KEYS = [
  "home_utilities", "home_internet", "home_insurance", "home_maintenance",
  "home_property_tax", "home_mortgage_interest", "home_rent", "home_condo_fees",
];

const REGISTRANT = { gstHstRegistered: true, vehicleBusinessUsePct: 0.8, homeOfficeBusinessUsePct: 0.15 };
const NOT_REGISTERED = { ...REGISTRANT, gstHstRegistered: false };
const [, , Q3] = getFilingPeriods("quarterly", 2026);

describe("which keys are home bills", () => {
  it("the eight Home Office items, and the category key a recurring expense can carry", () => {
    for (const k of HOME_KEYS) expect(isHomeOfficeKey(k), k).toBe(true);
    expect(isHomeOfficeKey(HOME_OFFICE_CATEGORY_KEY)).toBe(true);
    for (const k of ["office_phone", "office_supplies", "vehicle_fuel", "meals_client", "other_misc", "", null, undefined]) {
      expect(isHomeOfficeKey(k), String(k)).toBe(false);
    }
  });

  it("every home key in the T2125 map is flagged home-use, on line 9945, and has a cost type", () => {
    const flagged = Object.entries(EXPENSE_KEY_TO_T2125).filter(([, v]) => v.applyHomeUse).map(([k]) => k);
    expect(flagged.sort()).toEqual([...HOME_KEYS].sort());
    for (const k of HOME_KEYS) {
      expect(EXPENSE_KEY_TO_T2125[k]).toMatchObject({ lineNumber: "9945", t2125Part: "home_office", deductiblePct: 1, applyVehicleUse: false });
      expect(HOME_OFFICE_KEY_TO_COST[k], k).toBeTruthy();
    }
  });

  it("a home bill is never also a meal or a vehicle cost", () => {
    for (const k of [...HOME_KEYS, HOME_OFFICE_CATEGORY_KEY]) {
      expect(isMealOrEntertainmentKey(k)).toBe(false);
      expect(isVehicleKey(k)).toBe(false);
    }
  });
});

describe("ITC on a home bill", () => {
  it("is the workspace share of its GST/HST", () => {
    const itc = itcForExpense(15, "home_utilities", 0.8, false, 0.15);
    expect(itc.gross).toBe(15);
    expect(itc.claimable).toBeCloseTo(2.25, 10);
    expect(itc.homeReduction).toBeCloseTo(12.75, 10);
    expect(itc.mealReduction).toBe(0);
    expect(itc.vehicleReduction).toBe(0);
  });

  it("follows CRA's bands: 10% or less none, 90% or more all", () => {
    expect(homeOfficeItcShare(0.1)).toBe(0);
    expect(homeOfficeItcShare(0.11)).toBe(0.11);
    expect(homeOfficeItcShare(0.9)).toBe(1);
    expect(itcForExpense(15, "home_utilities", 0.8, false, 0.1).claimable).toBe(0);
    expect(itcForExpense(15, "home_utilities", 0.8, false, 0.95).claimable).toBe(15);
  });

  it("with no share given, nothing is claimed (a caller that doesn't know the share can't over-claim)", () => {
    expect(itcForExpense(15, "home_utilities").claimable).toBe(0);
    expect(itcForExpense(15, "home_utilities", 0.8).claimable).toBe(0);
  });

  it("the vehicle share and the vehicle flag don't touch a home bill", () => {
    expect(itcForExpense(15, "home_utilities", 0.5, true, 0.15).claimable).toBeCloseTo(2.25, 10);
  });

  it("other expenses are unchanged by the home share", () => {
    expect(itcForExpense(15, "office_supplies", 0.8, false, 0.15).claimable).toBe(15);
    expect(itcForExpense(15, "meals_client", 0.8, false, 0.15).claimable).toBe(7.5);
    expect(itcForExpense(15, "vehicle_fuel", 0.8, false, 0.15).claimable).toBeCloseTo(12, 10);
  });
});

describe("GST34 summary with home bills", () => {
  const base = {
    province: "newBrunswick", period: Q3, frequency: "quarterly" as const, periodTransactions: [], instalmentsPaid: 0,
    periodReceipts: [
      { total_amount: 115, tax_amount: 15, category_key: "home_utilities" },
      { total_amount: 115, tax_amount: 15, category_key: "office_supplies" },
    ],
  };

  it("line 106 carries all the GST/HST and line 107 takes the household share back off", () => {
    const r = computeGST34({ ...base, vehicleBusinessUsePct: 0.8, homeOfficeBusinessUsePct: 0.15 });
    expect(r.line106).toBe(30);
    expect(r.homeItcReduction).toBeCloseTo(12.75, 10);
    expect(r.line107).toBeCloseTo(-12.75, 10);
    expect(r.line108).toBeCloseTo(17.25, 10);
    const l107 = r.lines.find((l) => l.line === "107")!;
    expect(l107.note).toContain("personal-use share of home bill ITCs (business use of home 15%)");
  });

  it("an older caller that passes no home share claims nothing on the home bill", () => {
    const r = computeGST34(base);
    expect(r.line108).toBe(15);
    expect(r.homeItcReduction).toBe(15);
  });
});

describe("what a home bill counts for", () => {
  it("registrant: the share of the bill before GST/HST; the ITC is the share of the GST/HST", () => {
    const bill = expenseNetOfItc(115, 15, "home_utilities", REGISTRANT);
    expect(bill.paid).toBe(115);
    expect(bill.itc).toBeCloseTo(2.25, 10);
    expect(bill.homeCost).toBe(100);
    expect(bill.net).toBeCloseTo(15, 10);
    // The share paid ($17.25) less the ITC on it.
    expect(bill.net).toBeCloseTo(115 * 0.15 - bill.itc, 10);
  });

  it("not registered: the share of the full amount paid", () => {
    const bill = expenseNetOfItc(115, 15, "home_utilities", NOT_REGISTERED);
    expect(bill.itc).toBe(0);
    expect(bill.homeCost).toBe(115);
    expect(bill.net).toBeCloseTo(17.25, 10);
  });

  it("registrant at 10% or less: no ITC, so the GST/HST stays in the cost", () => {
    const bill = expenseNetOfItc(115, 15, "home_utilities", { ...REGISTRANT, homeOfficeBusinessUsePct: 0.1 });
    expect(bill.itc).toBe(0);
    expect(bill.homeCost).toBe(115);
    expect(bill.net).toBeCloseTo(11.5, 10);
  });

  it("registrant at 90% or more: all the GST/HST is an ITC", () => {
    const bill = expenseNetOfItc(115, 15, "home_utilities", { ...REGISTRANT, homeOfficeBusinessUsePct: 0.95 });
    expect(bill.itc).toBe(15);
    expect(bill.homeCost).toBe(100);
    expect(bill.net).toBeCloseTo(95, 10);
  });

  it("no home office % set: the bill counts for nothing, and no ITC", () => {
    const bill = expenseNetOfItc(115, 15, "home_utilities", { ...REGISTRANT, homeOfficeBusinessUsePct: 0 });
    expect(bill).toEqual({ paid: 115, itc: 0, net: 0, homeCost: 115 });
  });

  it("a bill with no GST/HST on it (mortgage interest, rent, property tax): the share of what was paid", () => {
    for (const key of ["home_mortgage_interest", "home_rent", "home_property_tax", "home_insurance", "home_condo_fees"]) {
      const bill = expenseNetOfItc(1000, null, key, REGISTRANT);
      expect(bill.itc, key).toBe(0);
      expect(bill.homeCost, key).toBe(1000);
      expect(bill.net, key).toBeCloseTo(150, 10);
    }
  });

  it("other expenses have no homeCost and count as before", () => {
    expect(expenseNetOfItc(115, 15, "office_supplies", REGISTRANT)).toEqual({ paid: 115, itc: 15, net: 100 });
    expect(expenseNetOfItc(115, 15, "office_phone", NOT_REGISTERED)).toEqual({ paid: 115, itc: 0, net: 115 });
  });

  it("the context reads the home office % from user_settings, defaulting to the column's 0", () => {
    expect(expenseTaxContext({ gst_hst_registered: true, home_office_business_use_pct: "0.1500" }).homeOfficeBusinessUsePct).toBe(0.15);
    expect(expenseTaxContext({ gst_hst_registered: true, home_office_business_use_pct: null }).homeOfficeBusinessUsePct).toBe(0);
    expect(expenseTaxContext({ home_office_business_use_pct: 1.7 }).homeOfficeBusinessUsePct).toBe(1);
    expect(expenseTaxContext(null).homeOfficeBusinessUsePct).toBe(0);
  });
});

describe("totals with home bills", () => {
  const rows = [
    { category_key: "home_utilities", total_amount: 115, tax_amount: 15 },
    { category_key: "home_utilities", total_amount: 230, tax_amount: 30 },
    { category_key: "home_mortgage_interest", total_amount: 1000, tax_amount: null },
    { category_key: "office_supplies", total_amount: 115, tax_amount: 15 },
  ];

  it("a $300 heating bill at 15% is $45 of expenses, not $300", () => {
    const t = aggregateReceiptTotals([{ category_key: "home_utilities", total_amount: 300, tax_amount: null }], NOT_REGISTERED);
    expect(t.total).toBe(45);
    expect(t.paid).toBe(300);
    expect(t.homeOfficeCosts).toEqual({ home_utilities: 300 });
  });

  it("the per-key map and the total carry the share; homeOfficeCosts carries the whole bills", () => {
    const t = aggregateReceiptTotals(rows, REGISTRANT);
    expect(t.byKey.home_utilities).toBe(45);            // 15% of $300 before HST
    expect(t.byKey.home_mortgage_interest).toBe(150);
    expect(t.byKey.office_supplies).toBe(100);
    expect(t.total).toBe(295);
    expect(t.homeOfficeCosts).toEqual({ home_utilities: 300, home_mortgage_interest: 1000 });
    expect(t.paid).toBe(1460);
    expect(t.itc).toBeCloseTo(15 + 45 * 0.15, 2);
  });

  it("the ITCs in the totals are what the GST34 summary claims", () => {
    const t = aggregateReceiptTotals(rows, REGISTRANT);
    const gst34 = computeGST34({
      province: "newBrunswick", period: Q3, frequency: "quarterly", periodTransactions: [], instalmentsPaid: 0,
      periodReceipts: rows.map((r) => ({ ...r })),
      vehicleBusinessUsePct: REGISTRANT.vehicleBusinessUsePct,
      homeOfficeBusinessUsePct: REGISTRANT.homeOfficeBusinessUsePct,
    });
    expect(t.itc).toBeCloseTo(gst34.line108, 2);
  });

  it("with no home bills the totals are exactly what they were", () => {
    const plain = rows.filter((r) => !r.category_key.startsWith("home_"));
    const t = aggregateReceiptTotals(plain, REGISTRANT);
    expect(t).toMatchObject({ byKey: { office_supplies: 100 }, total: 100, paid: 115, itc: 15, homeOfficeCosts: {} });
  });
});

describe("T2125 line 9945 from logged bills", () => {
  const settings = (o = {}) => createTestSettings({
    gst_hst_registered: true, vehicle_business_use_pct: 0.8, province: "newBrunswick",
    home_office_business_use_pct: 0.15, ...o,
  });
  const run = (s: ReturnType<typeof createTestSettings>, rows: { category_key: string; total_amount: number; tax_amount: number | null }[]) => {
    const totals = aggregateReceiptTotals(rows, expenseTaxContext(s));
    return {
      totals,
      t: computeT2125({ settings: s, transactions: [], expenses: t2125EntriesFromAmounts(totals.byKey), homeOfficeCosts: totals.homeOfficeCosts, ccaAssets: [], taxYear: 2026 }),
    };
  };

  it("the bills are the costs, the share is the deduction, and it equals what the totals count", () => {
    const { t, totals } = run(settings(), [
      { category_key: "home_utilities", total_amount: 345, tax_amount: 45 },
      { category_key: "home_internet", total_amount: 115, tax_amount: 15 },
      { category_key: "home_mortgage_interest", total_amount: 1000, tax_amount: null },
      { category_key: "home_rent", total_amount: 200, tax_amount: null },
      { category_key: "home_property_tax", total_amount: 600, tax_amount: null },
    ]);
    expect(t.homeOffice.annualUtilities).toBe(400);   // power + internet, before HST
    expect(t.homeOffice.annualRent).toBe(1200);       // mortgage interest + rent
    expect(t.homeOffice.annualPropertyTax).toBe(600);
    expect(t.homeOffice.totalAnnualHomeCosts).toBe(2200);
    expect(t.line9945_homeOfficeDeduction).toBeCloseTo(330, 10);
    expect(t.homeOffice.loggedCostTypes.sort()).toEqual(["propertyTax", "rent", "utilities"]);
    // One figure, two surfaces: the Expenses total and the T2125 line.
    expect(totals.total).toBeCloseTo(t.line9945_homeOfficeDeduction, 2);
  });

  it("home bills are not expense lines and are not in line 9369", () => {
    const { t } = run(settings(), [
      { category_key: "home_utilities", total_amount: 115, tax_amount: 15 },
      { category_key: "office_supplies", total_amount: 115, tax_amount: 15 },
    ]);
    expect(t.expenseLines.map((l) => l.key)).toEqual(["office_supplies"]);
    expect(t.line9369_totalExpenses).toBe(100);
    expect(t.line9220_utilities).toBe(0);
    expect(t.line9945_homeOfficeDeduction).toBeCloseTo(15, 10);
  });

  it("logged bills replace the estimate for that cost only; they are never added to it", () => {
    const s = settings({ home_office_utilities_monthly: 200, home_office_insurance_monthly: 100 });
    const { t } = run(s, [{ category_key: "home_utilities", total_amount: 345, tax_amount: 45 }]);
    expect(t.homeOffice.annualUtilities).toBe(300);    // the bills, not $2,400 and not $2,700
    expect(t.homeOffice.annualInsurance).toBe(1200);   // still the estimate
    expect(t.homeOffice.loggedCostTypes).toEqual(["utilities"]);
    expect(t.line9945_homeOfficeDeduction).toBeCloseTo((300 + 1200) * 0.15, 10);
  });

  it("with no logged bills the estimate works exactly as before", () => {
    const s = settings({ home_office_utilities_monthly: 200, home_office_rent_monthly: 1000, home_office_property_tax_annual: 3000 });
    const t = computeT2125({ settings: s, transactions: [], expenses: t2125EntriesFromAmounts({}), ccaAssets: [], taxYear: 2026 });
    expect(t.homeOffice.totalAnnualHomeCosts).toBe(2400 + 12000 + 3000);
    expect(t.line9945_homeOfficeDeduction).toBeCloseTo(17400 * 0.15, 10);
    expect(t.homeOffice.loggedCostTypes).toEqual([]);
  });

  it("home keys left in the expense entries (the share) are ignored: only homeOfficeCosts feeds 9945", () => {
    const t = computeT2125({
      settings: settings(), transactions: [], ccaAssets: [], taxYear: 2026,
      expenses: t2125EntriesFromAmounts({ home_utilities: 45 }),
    });
    expect(t.expenseLines).toEqual([]);
    expect(t.line9369_totalExpenses).toBe(0);
    expect(t.line9945_homeOfficeDeduction).toBe(0);
  });
});

describe("a recurring home bill", () => {
  const re = (o: Partial<RecurringExpense>): RecurringExpense => ({
    id: "r", user_id: "u", name: "Home internet", amount: 115, category_key: "home_internet", frequency: "monthly",
    day_of_month: 5, month_of_year: null, hst_included: true, hst_amount: 15, vehicle_pct_applicable: false,
    notes: "", start_date: "2025-01-01", end_date: null, is_active: true,
    created_at: "2025-01-01T12:00:00Z", updated_at: "2025-01-01T12:00:00Z", ...o,
  });

  it("counts at the share in the recurring totals too", () => {
    expect(recurringNetOfItc(re({}), REGISTRANT)).toMatchObject({ paid: 115, homeCost: 100 });
    expect(recurringNetOfItc(re({}), REGISTRANT).net).toBeCloseTo(15, 10);
    expect(totalRecurringMonthly(recurringExpensesNetOfItc([re({})], REGISTRANT))).toBeCloseTo(15, 10);
    expect(totalRecurringMonthly(recurringExpensesNetOfItc([re({})], NOT_REGISTERED))).toBeCloseTo(17.25, 10);
  });

  it("filed under the Home Office category key rather than an item, it is still a home bill", () => {
    expect(recurringNetOfItc(re({ category_key: HOME_OFFICE_CATEGORY_KEY }), NOT_REGISTERED).net).toBeCloseTo(17.25, 10);
  });
});
