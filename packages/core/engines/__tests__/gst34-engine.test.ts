/**
 * GST34 pre-fill — ITC limits (2026-10-13).
 *
 * Found while preparing Andrew's Q2/Q3 2026 returns: the helper showed a
 * $566 refund for Q2 and $434 for Q3, and both were too high.
 *
 *   - Meals: the engine kept its own list of meal keys ("meals_entertainment",
 *     "client_meals", "meals", "entertainment"). No expense has ever used
 *     them (the real keys are meals_client, meals_team, ent_client,
 *     ent_events), so CRA's 50% limit never applied.
 *   - Vehicle: fuel and lease HST were claimed in full, ignoring the
 *     business-use share the Expenses page already asks for.
 *
 * Both now come from EXPENSE_KEY_TO_T2125, the map the T2125 estimate uses.
 * The quarter fixtures below are the shape of that account's real data.
 */
import { describe, expect, it } from "vitest";
import {
  computeGST34,
  isMealOrEntertainmentKey,
  isVehicleKey,
  itcForExpense,
  vehicleItcShare,
} from "../gst34-engine";
import { getFilingPeriods } from "../filing-period-engine";
import { recurringHSTEntriesForPeriod } from "../recurring-expense-engine";
import { EXPENSE_KEY_TO_T2125 } from "../t2125-engine";
import type { RecurringExpense } from "../../types/database";

const [Q1, Q2, Q3, Q4] = getFilingPeriods("quarterly", 2026);
const receipt = (tax: number, key: string | null) => ({ total_amount: Math.round(tax * 115 / 15 * 100) / 100, tax_amount: tax, category_key: key });

describe("which expenses are limited", () => {
  it("every 50%-deductible key in the T2125 map is a meal/entertainment key here", () => {
    const half = Object.entries(EXPENSE_KEY_TO_T2125).filter(([, v]) => v.deductiblePct === 0.5).map(([k]) => k);
    expect(half.sort()).toEqual(["ent_client", "ent_events", "meals_client", "meals_team"]);
    for (const k of half) expect(isMealOrEntertainmentKey(k)).toBe(true);
  });

  it("every vehicle-use key in the T2125 map is a vehicle key here, plus the old category-level key", () => {
    for (const [k, v] of Object.entries(EXPENSE_KEY_TO_T2125)) expect(isVehicleKey(k)).toBe(v.applyVehicleUse);
    expect(isVehicleKey("vehicle")).toBe(true);
    expect(isVehicleKey("office_supplies")).toBe(false);
    expect(isMealOrEntertainmentKey(null)).toBe(false);
  });

  it("vehicle share follows CRA's bands: 10% or less none, 90% or more all, otherwise the share", () => {
    expect(vehicleItcShare(0.10)).toBe(0);
    expect(vehicleItcShare(0.11)).toBe(0.11);
    expect(vehicleItcShare(0.80)).toBe(0.80);
    expect(vehicleItcShare(0.90)).toBe(1);
    expect(vehicleItcShare(1.4)).toBe(1);
    expect(vehicleItcShare(Number.NaN)).toBe(0);
  });

  it("splits one expense's HST into what is and isn't claimable", () => {
    expect(itcForExpense(10, "meals_client", 0.8)).toEqual({ gross: 10, mealReduction: 5, vehicleReduction: 0, homeReduction: 0, claimable: 5 });
    const fuel = itcForExpense(10, "vehicle_fuel", 0.8);
    expect(fuel.vehicleReduction).toBeCloseTo(2, 10);
    expect(fuel.claimable).toBeCloseTo(8, 10);
    expect(itcForExpense(10, "office_supplies", 0.8).claimable).toBe(10);
    expect(itcForExpense(10, null, 0.8, true).claimable).toBeCloseTo(8, 10); // recurring row flagged vehicle
    expect(itcForExpense(0, "meals_client", 0.8).claimable).toBe(0);
  });
});

describe("computeGST34 — a quarter with no sales and only ITCs", () => {
  // Q2 2026: 12 fuel receipts, 5 meals, 1 legal, 1 other; lease + dues recurring.
  const q2Receipts = [
    receipt(95.65, "vehicle_fuel"),
    receipt(35.0, "meals_client"),
    receipt(71.74, "corp_legal"),
    receipt(28.7, "other_misc"),
  ];
  const recurring = [
    { total_amount: null, tax_amount: 266.31, category_key: "vehicle_payment", vehicle_use: true },
    { total_amount: null, tax_amount: 68.67, category_key: "prof_board_mls", vehicle_use: false },
  ];

  it("takes half the meal HST and the personal share of vehicle HST off line 106", () => {
    const r = computeGST34({
      province: "new_brunswick", period: Q2, frequency: "quarterly",
      periodTransactions: [], periodReceipts: [...q2Receipts, ...recurring],
      instalmentsPaid: 0, vehicleBusinessUsePct: 0.8,
    });
    expect(r.line101).toBe(0);
    expect(r.hstPaidOnExpenses).toBeCloseTo(566.07, 2);  // what the helper used to claim in full
    expect(r.mealItcReduction).toBeCloseTo(17.5, 2);     // half of 35.00
    expect(r.vehicleItcReduction).toBeCloseTo(72.39, 2); // 20% of (95.65 + 266.31)
    expect(r.itcNotClaimable).toBeCloseTo(89.89, 2);
    // CRA's line 106 is the ELIGIBLE amount; the limits are not line 107.
    expect(r.line106).toBeCloseTo(476.18, 2);
    expect(r.line107).toBe(0);
    expect(r.line108).toBeCloseTo(476.18, 2);
    expect(r.line109).toBeCloseTo(-476.18, 2);
    const l106 = r.filingLines.find((l) => l.line === "106")!;
    expect(l106.amount).toBe(476.18);
    expect(l106.note).toContain(`half of the ${r.taxLabel} on meals and entertainment`);
    expect(l106.note).toContain("business use 80%");
    expect(r.filingLines.find((l) => l.line === "114")!.label).toBe("Refund claimed");
  });

  it("claims vehicle HST in full at 90% business use and none at 10%", () => {
    const base = { province: "new_brunswick", period: Q3, frequency: "quarterly" as const, periodTransactions: [], periodReceipts: [receipt(100, "vehicle_fuel")], instalmentsPaid: 0 };
    expect(computeGST34({ ...base, vehicleBusinessUsePct: 0.9 }).line108).toBe(100);
    expect(computeGST34({ ...base, vehicleBusinessUsePct: 0.1 }).line108).toBe(0);
  });

  it("without a vehicle share (older callers) only the meal limit applies", () => {
    const r = computeGST34({ vehicleBusinessUsePct: 1,  province: "new_brunswick", period: Q2, frequency: "quarterly", periodTransactions: [], periodReceipts: q2Receipts, instalmentsPaid: 0 });
    expect(r.vehicleItcReduction).toBe(0);
    expect(r.mealItcReduction).toBeCloseTo(17.5, 2);
  });

  it("says nothing about limits on line 106 when nothing is limited", () => {
    const r = computeGST34({ province: "new_brunswick", period: Q3, frequency: "quarterly", periodTransactions: [], periodReceipts: [receipt(42, "office_supplies")], instalmentsPaid: 0, vehicleBusinessUsePct: 0.8 });
    expect(r.itcNotClaimable).toBe(0);
    expect(r.filingLines.find((l) => l.line === "106")!.note).toBe(`${r.taxLabel} paid on 1 receipt`);
    expect(r.line106).toBe(42);
    expect(r.line108).toBe(42);
  });
});

describe("recurring expenses keep their category for the ITC limits", () => {
  const re = (o: Partial<RecurringExpense>): RecurringExpense => ({
    id: "r", user_id: "u", name: "x", amount: 100, category_key: "prof_board_mls", frequency: "monthly",
    day_of_month: 24, month_of_year: null, hst_included: true, hst_amount: 10, vehicle_pct_applicable: false,
    notes: "", start_date: "2024-06-24", end_date: null, is_active: true,
    created_at: "2024-06-24T12:00:00Z", updated_at: "2024-06-24T12:00:00Z", ...o,
  });

  it("returns one entry per expense with its HST for the quarter", () => {
    const out = recurringHSTEntriesForPeriod(
      [re({ category_key: "vehicle_payment", hst_amount: 88.77, vehicle_pct_applicable: true }), re({ hst_amount: 16.14 }), re({ hst_amount: 0 }), re({ is_active: false })],
      Q2.startDate, Q2.endDate,
    );
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ category_key: "vehicle_payment", vehicle_use: true });
    expect(out[0].tax_amount).toBeCloseTo(266.31, 2);
    expect(out[1].tax_amount).toBeCloseTo(48.42, 2);
  });
});

describe("quarterly deadlines are one month after the quarter ends", () => {
  it("Q4 is due January 31, not March 31", () => {
    expect([Q1.deadline, Q2.deadline, Q3.deadline, Q4.deadline]).toEqual(["2026-04-30", "2026-07-31", "2026-10-31", "2027-01-31"]);
  });
});
