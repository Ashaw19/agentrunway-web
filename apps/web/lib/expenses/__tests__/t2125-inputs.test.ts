/**
 * What the Reports page hands the T2125 pre-fill (2026-10-13).
 *
 * Two things this pins:
 *
 *   1. The Recurring Expenses list reaches the T2125 lines. It counted in YTD
 *      Expenses everywhere, but `expenseAmounts` was built from receipts and
 *      the legacy per-item monthly figure only, so a vehicle lease or board
 *      dues kept in that list never appeared on the T2125 estimate.
 *   2. Home Office bills arrive twice on purpose: at the home office share in
 *      `expenseAmounts` (which the engine ignores for home keys) and whole in
 *      `homeOfficeCosts`, the costs behind line 9945.
 */
import { describe, expect, it } from "vitest";
import { buildT2125ExpenseInputs } from "../t2125-inputs";
import { computeT2125 } from "@/lib/engines/t2125-engine";
import { createTestSettings } from "@agent-runway/core/engines/__tests__/test-data";
import type { RecurringExpense } from "@/lib/types/database";

const REGISTRANT = { gstHstRegistered: true, vehicleBusinessUsePct: 0.8, homeOfficeBusinessUsePct: 0.15 };
const NOT_REGISTERED = { ...REGISTRANT, gstHstRegistered: false };
// Mid-October: 9 completed months; a monthly charge on the 1st has happened 10 times.
const TODAY = new Date(2026, 9, 13, 12);

const re = (o: Partial<RecurringExpense>): RecurringExpense => ({
  id: "r", user_id: "u", name: "Lease", amount: 115, category_key: "vehicle_payment", frequency: "monthly",
  day_of_month: 1, month_of_year: null, hst_included: true, hst_amount: 15, vehicle_pct_applicable: true,
  notes: "", start_date: "2025-01-01", end_date: null, is_active: true,
  created_at: "2025-01-01T12:00:00Z", updated_at: "2025-01-01T12:00:00Z", ...o,
});

describe("buildT2125ExpenseInputs", () => {
  it("receipts by key, net of ITCs for a registrant", () => {
    const out = buildT2125ExpenseInputs({
      receiptRows: [
        { category_key: "office_supplies", total_amount: 115, tax_amount: 15 },
        { category_key: null, total_amount: 50, tax_amount: null },
      ],
      expenseItems: [], recurringExpenses: [], ctx: REGISTRANT, today: TODAY,
    });
    expect(out.expenseAmounts).toEqual({ office_supplies: 100 });
    expect(out.receiptTotals.uncategorized).toBe(50);
    expect(out.homeOfficeCosts).toEqual({});
  });

  it("the legacy per-item monthly figure counts for completed months only", () => {
    const out = buildT2125ExpenseInputs({
      receiptRows: [], recurringExpenses: [], ctx: NOT_REGISTERED, today: TODAY,
      expenseItems: [{ key: "office_software", monthly_recurring: 20 }, { key: "office_phone", monthly_recurring: 0 }],
    });
    expect(out.expenseAmounts).toEqual({ office_software: 180 });
  });

  it("the Recurring Expenses list reaches the T2125 lines, occurrences to date, net of ITC", () => {
    const out = buildT2125ExpenseInputs({
      receiptRows: [{ category_key: "vehicle_payment", total_amount: 115, tax_amount: 15 }],
      expenseItems: [], ctx: REGISTRANT, today: TODAY,
      recurringExpenses: [
        re({}),
        re({ id: "dues", category_key: "prof_board_mls", vehicle_pct_applicable: false, amount: 230, hst_amount: 30 }),
        re({ id: "paused", is_active: false }),
      ],
    });
    // 10 lease payments at $100 before HST, plus the one receipt.
    expect(out.expenseAmounts.vehicle_payment).toBe(1100);
    expect(out.expenseAmounts.prof_board_mls).toBe(2000);

    const t = computeT2125({
      settings: createTestSettings({ gst_hst_registered: true, vehicle_business_use_pct: 0.8 }),
      transactions: [], expenseAmounts: out.expenseAmounts, homeOfficeCosts: out.homeOfficeCosts, ccaAssets: [], taxYear: 2026,
    });
    expect(t.line9281_motorVehicle).toBeCloseTo(880, 6);
    expect(t.line8760_licencesMemberships).toBe(2000);
  });

  it("a recurring expense that hasn't started, or an annual one not yet charged, adds nothing", () => {
    const out = buildT2125ExpenseInputs({
      receiptRows: [], expenseItems: [], ctx: NOT_REGISTERED, today: TODAY,
      recurringExpenses: [
        re({ start_date: "2026-11-01" }),
        re({ id: "annual", frequency: "annual", month_of_year: 12, day_of_month: 1, category_key: "prof_eo" }),
      ],
    });
    expect(out.expenseAmounts).toEqual({});
  });

  it("Home Office bills: the share in expenseAmounts, the whole bills in homeOfficeCosts", () => {
    const out = buildT2125ExpenseInputs({
      receiptRows: [
        { category_key: "home_utilities", total_amount: 345, tax_amount: 45 },
        { category_key: "home_mortgage_interest", total_amount: 1000, tax_amount: null },
      ],
      expenseItems: [], ctx: REGISTRANT, today: TODAY,
      recurringExpenses: [re({ id: "net", category_key: "home_internet", vehicle_pct_applicable: false })],
    });
    expect(out.expenseAmounts.home_utilities).toBe(45);
    expect(out.expenseAmounts.home_internet).toBe(150);          // 10 × $100 × 15%
    expect(out.homeOfficeCosts).toEqual({ home_utilities: 300, home_mortgage_interest: 1000, home_internet: 1000 });

    const settings = createTestSettings({ gst_hst_registered: true, home_office_business_use_pct: 0.15 });
    const t = computeT2125({ settings, transactions: [], expenseAmounts: out.expenseAmounts, homeOfficeCosts: out.homeOfficeCosts, ccaAssets: [], taxYear: 2026 });
    expect(t.line9945_homeOfficeDeduction).toBeCloseTo(2300 * 0.15, 6);
    expect(t.line9369_totalExpenses).toBe(0);
    // The same dollars the expense totals count for those bills.
    const counted = out.expenseAmounts.home_utilities + out.expenseAmounts.home_internet + out.expenseAmounts.home_mortgage_interest;
    expect(counted).toBeCloseTo(t.line9945_homeOfficeDeduction, 2);
  });
});
