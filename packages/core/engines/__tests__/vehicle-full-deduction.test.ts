/**
 * Business parking and supplementary business insurance (2026-10-19).
 *
 * CRA, "Motor vehicle expenses (not including CCA)" (completing Form T2125,
 * page dated 2026-08-31): "you can deduct the full amount of parking fees
 * related to your business activities and supplementary business insurance
 * for your motor vehicle or passenger vehicle." Until 2026-10-19 Agent Runway
 * filed parking under Service & Repairs and multiplied every vehicle item by
 * the vehicle business-use share, so both were under-counted on line 9281,
 * in Est. Tax Deductible and in the GST/HST return's ITCs.
 *
 * They are now expense items of their own, on line 9281 at 100%, whatever
 * the business-use share and whatever a recurring expense's vehicle box says.
 */
import { describe, expect, it } from "vitest";
import { RECEIPT_CATEGORY_GROUPS, RECEIPT_CATEGORY_KEYS, receiptCategoryFullLabel } from "../../lib/expense-items";
import {
  EXPENSE_KEY_TO_T2125,
  VEHICLE_FULL_DEDUCTION_KEYS,
  computeT2125,
  isFullVehicleDeductionKey,
  t2125ExpenseLine,
  t2125LineForExpenseKey,
} from "../t2125-engine";
import { isVehicleKey, itcForExpense } from "../gst34-engine";
import { buildGST34Worksheet } from "../gst34-worksheet";
import { buildT2125Expenses } from "../t2125-expenses-engine";
import { createTestSettings, withDeclaredShare } from "./test-data";
import type { RecurringExpense } from "../../types/database";

const SHARE = 0.6;
const FULL = ["vehicle_parking", "vehicle_business_insurance"] as const;

describe("the two items", () => {
  it("are Vehicle items, after the four the share applies to", () => {
    const vehicle = RECEIPT_CATEGORY_GROUPS.find((g) => g.group === "Vehicle");
    expect(vehicle?.items.map((i) => i.key)).toEqual([
      "vehicle_fuel", "vehicle_service", "vehicle_insurance", "vehicle_payment",
      "vehicle_parking", "vehicle_business_insurance",
    ]);
    for (const k of FULL) expect(RECEIPT_CATEGORY_KEYS).toContain(k);
    expect(receiptCategoryFullLabel("vehicle_parking")).toBe("Vehicle: Business Parking");
    expect(receiptCategoryFullLabel("vehicle_business_insurance")).toBe("Vehicle: Supplementary Business Insurance");
  });

  it("are the only vehicle items deducted in full", () => {
    expect([...VEHICLE_FULL_DEDUCTION_KEYS].sort()).toEqual([...FULL].sort());
    const vehicleItems = RECEIPT_CATEGORY_GROUPS.find((g) => g.group === "Vehicle")!.items.map((i) => i.key);
    for (const k of vehicleItems) {
      expect(isFullVehicleDeductionKey(k), k).toBe((FULL as readonly string[]).includes(k));
    }
    expect(isFullVehicleDeductionKey("vehicle")).toBe(false); // the old category-level key stands for fuel
    expect(isFullVehicleDeductionKey(null)).toBe(false);
  });

  it("go on line 9281 at 100%", () => {
    for (const k of FULL) {
      expect(t2125LineForExpenseKey(k)).toMatchObject({
        lineNumber: "9281", deductiblePct: 1, applyVehicleUse: false, t2125Part: "vehicle",
      });
      expect(EXPENSE_KEY_TO_T2125[k].fullVehicleDeduction).toBe(true);
    }
  });
});

describe("T2125", () => {
  it("parking and supplementary insurance count in full; fuel and regular insurance take the share", () => {
    expect(t2125ExpenseLine({ key: "vehicle_parking", amount: 50 }, SHARE)).toMatchObject({
      lineNumber: "9281", deductibleAmount: 50, vehicleUsePct: 1, isVehicle: false,
    });
    expect(t2125ExpenseLine({ key: "vehicle_business_insurance", amount: 300 }, SHARE).deductibleAmount).toBe(300);
    expect(t2125ExpenseLine({ key: "vehicle_fuel", amount: 50 }, SHARE).deductibleAmount).toBeCloseTo(30, 10);
    expect(t2125ExpenseLine({ key: "vehicle_insurance", amount: 300 }, SHARE).deductibleAmount).toBeCloseTo(180, 10);
  });

  it("a recurring parking pass with the vehicle box ticked is still counted in full", () => {
    const line = t2125ExpenseLine({ key: "vehicle_parking", amount: 120, vehicleUse: true }, SHARE);
    expect(line).toMatchObject({ lineNumber: "9281", deductibleAmount: 120, isVehicle: false });
  });

  it("line 9281 adds parking in full to the business share of the rest", () => {
    const settings = createTestSettings({ gst_hst_registered: false, vehicle_business_use_pct: SHARE, province: "newBrunswick" });
    const t = computeT2125(withDeclaredShare({
      settings,
      transactions: [],
      expenses: [
        { key: "vehicle_fuel", amount: 1000 },
        { key: "vehicle_parking", amount: 200 },
        { key: "vehicle_business_insurance", amount: 150 },
      ],
      ccaAssets: [],
      taxYear: 2026,
    }));
    expect(t.line9281_motorVehicle).toBeCloseTo(1000 * SHARE + 200 + 150, 10);
  });
});

describe("GST/HST input tax credits", () => {
  it("parking's GST/HST is claimed in full; fuel's follows the share", () => {
    expect(isVehicleKey("vehicle_parking")).toBe(false);
    expect(itcForExpense(13, "vehicle_parking", SHARE)).toEqual({
      gross: 13, mealReduction: 0, vehicleReduction: 0, homeReduction: 0, claimable: 13,
    });
    // The recurring box doesn't put the share back on.
    expect(itcForExpense(13, "vehicle_parking", SHARE, true).claimable).toBe(13);
    expect(itcForExpense(13, "vehicle_fuel", SHARE).claimable).toBeCloseTo(7.8, 10);
  });

  it("the GST34 worksheet lists parking under the full rule", () => {
    const sheet = buildGST34Worksheet({
      receipts: [
        { expense_date: "2026-09-02", vendor: "Impark", total_amount: 11.5, tax_amount: 1.5, category_key: "vehicle_parking", receipt_path: "r/1.jpg" },
        { expense_date: "2026-09-03", vendor: "Irving", total_amount: 115, tax_amount: 15, category_key: "vehicle_fuel", receipt_path: "r/2.jpg" },
      ],
      recurring: [],
      vehicleBusinessUsePct: SHARE,
      homeOfficeBusinessUsePct: 0,
      line106: 1.5 + 15 * SHARE,
    });
    expect(sheet.rows.map((r) => [r.categoryKey, r.rule, r.claimable])).toEqual([
      ["vehicle_parking", "full", 1.5],
      ["vehicle_fuel", "vehicle", 15 * SHARE],
    ]);
    expect(sheet.differenceFromLine106).toBe(0);
  });
});

describe("expense totals (Est. Tax Deductible, YTD Expenses)", () => {
  const pass: RecurringExpense = {
    id: "re-park", user_id: "u1", name: "Uptown parking pass", amount: 115, category_key: "vehicle_parking",
    frequency: "monthly", day_of_month: 1, month_of_year: null, hst_included: true, hst_amount: 15,
    vehicle_pct_applicable: true, notes: "", start_date: "2026-01-01", end_date: null, is_active: true,
    created_at: "2026-01-01T12:00:00Z", updated_at: "2026-01-01T12:00:00Z",
  };

  it("a registrant's parking pass counts net of its full ITC and is deductible in full", () => {
    const built = buildT2125Expenses({
      receiptTotals: { byKey: {}, uncategorized: 0, homeOfficeCosts: {} },
      expenseItems: [],
      recurringExpenses: [pass],
      ctx: { gstHstRegistered: true, vehicleBusinessUsePct: SHARE, homeOfficeBusinessUsePct: 0 },
      now: new Date(2026, 5, 15, 12),
    });
    // Six charges (Jan to Jun 1), each $115 with $15 HST claimed back.
    expect(built.ytdTotal).toBeCloseTo(600, 10);
    expect(built.deductibleTotal).toBeCloseTo(600, 10);
    expect(built.byRule.vehicle).toBe(0);
  });
});
