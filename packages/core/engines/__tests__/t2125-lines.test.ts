/**
 * T2125 line numbers come from CRA's form (2026-10-13).
 *
 * Until this date every surface typed its own line numbers and several did
 * not match the form. The public T2125 guide had 11 of its 14 expense lines
 * wrong: phone on "8940" (no such line), travel on 8910 (Rent), home office
 * on 8810 (Office expenses), motor vehicle on 9180 (Property taxes), CCA on
 * 9270 (Other expenses). The Reports T2125 tab and its PDF printed "Line
 * 8200" for gross income and "Line 8270" for net income, neither of which is
 * on the form, called the expense subtotal "Line 9369" (net income before
 * adjustments) and sent the result to "T1 General Line 10400" (other
 * employment income).
 *
 * What these tests prove:
 *   1. T2125_LINES holds the form's lines under the form's labels, read from
 *      form T2125 E (25), and none of the numbers that were typed in error.
 *   2. Every expense item the engine maps lands on a line of the form.
 *   3. The engine's totals are the form's: line 9368 is the expense lines
 *      plus CCA, and line 9946 is 8299 less 9368 less 9945.
 *   4. The form's own instruction for where 8299 and 9946 go on the return.
 */
import { describe, expect, it } from "vitest";
import {
  computeT2125,
  EXPENSE_KEY_TO_T2125,
  T2125_OTHER_EXPENSES,
  t2125FormLineForExpenseItem,
  t2125LineForExpenseKey,
} from "../t2125-engine";
import {
  T2125_FORM,
  T2125_LINES,
  T2125_RETURN_LINES,
  isT2125LineNumber,
  t2125Line,
  t2125ReturnLinesPhrase,
} from "../t2125-lines";
import { createTestSettings, TEST_TRANSACTIONS } from "./test-data";
import type { CcaAsset, Transaction } from "../../types/database";

describe("T2125_LINES: the form's lines, under the form's labels", () => {
  it("is form T2125 E (25)", () => {
    expect(T2125_FORM.edition).toBe("T2125 E (25)");
    expect(T2125_FORM.url).toContain("canada.ca/en/revenue-agency/services/forms-publications/forms/t2125.html");
  });

  it("the lines the guides got wrong carry the form's labels", () => {
    expect(T2125_LINES["8590"]).toBe("Bad debts");
    expect(T2125_LINES["8690"]).toBe("Insurance");
    expect(T2125_LINES["8710"]).toBe("Interest and bank charges");
    expect(T2125_LINES["8760"]).toBe("Business taxes, licences, and memberships");
    expect(T2125_LINES["8810"]).toBe("Office expenses");
    expect(T2125_LINES["8811"]).toBe("Office stationery and supplies");
    expect(T2125_LINES["8910"]).toBe("Rent");
    expect(T2125_LINES["9180"]).toBe("Property taxes");
    expect(T2125_LINES["9200"]).toBe("Travel expenses");
    expect(T2125_LINES["9220"]).toBe("Utilities");
    expect(T2125_LINES["9270"]).toBe("Other expenses");
    expect(T2125_LINES["9281"]).toBe("Motor vehicle expenses (not including CCA)");
    expect(T2125_LINES["9936"]).toBe("Capital cost allowance (CCA)");
  });

  it("the totals are where the form has them", () => {
    expect(T2125_LINES["8299"]).toBe("Gross business or professional income");
    expect(T2125_LINES["9368"]).toBe("Total expenses");
    expect(T2125_LINES["9369"]).toBe("Net income (loss) before adjustments");
    expect(T2125_LINES["9945"]).toBe("Business-use-of-home expenses");
    expect(T2125_LINES["9946"]).toBe("Your net income (loss)");
  });

  it("numbers that were typed in error are not lines of the form", () => {
    for (const typed of ["8200", "8270", "8620", "8640", "8940", "10400"]) {
      expect(isT2125LineNumber(typed), typed).toBe(false);
    }
    expect(isT2125LineNumber("9220")).toBe(true);
  });

  it("t2125Line gives the number, the form's label and a reference", () => {
    expect(t2125Line("9220")).toEqual({ number: "9220", label: "Utilities", ref: "Line 9220" });
  });
});

describe("the engine's expense map lands on lines of the form", () => {
  it("every expense item is on an expense line of Part 4 or on 9945", () => {
    const part4 = ["8521", "8523", "8590", "8690", "8710", "8760", "8810", "8811", "8860", "8871", "8910", "8960", "9060", "9180", "9200", "9220", "9224", "9275", "9281", "9270"];
    for (const [key, map] of Object.entries(EXPENSE_KEY_TO_T2125)) {
      expect(isT2125LineNumber(map.lineNumber), key).toBe(true);
      expect([...part4, "9945"], key).toContain(map.lineNumber);
      expect(map.applyHomeUse === true, key).toBe(map.lineNumber === "9945");
    }
    expect(T2125_OTHER_EXPENSES.lineNumber).toBe("9270");
  });

  it("phone, travel-adjacent and home items are on the lines the guides now print", () => {
    expect(t2125LineForExpenseKey("office_phone").lineNumber).toBe("9220");
    expect(t2125LineForExpenseKey("meals_client").lineNumber).toBe("8523");
    expect(t2125LineForExpenseKey("prof_board_mls").lineNumber).toBe("8760");
    expect(t2125LineForExpenseKey("prof_eo").lineNumber).toBe("8690");
    expect(t2125LineForExpenseKey("edu_courses").lineNumber).toBe("9270");
    expect(t2125LineForExpenseKey("vehicle_fuel").lineNumber).toBe("9281");
    expect(t2125LineForExpenseKey("home_utilities").lineNumber).toBe("9945");
  });

  it("a guide gets the form's line for an item, and an error for a key that is not one", () => {
    expect(t2125FormLineForExpenseItem("office_phone")).toEqual({ number: "9220", label: "Utilities", ref: "Line 9220" });
    expect(t2125FormLineForExpenseItem("home_utilities").label).toBe("Business-use-of-home expenses");
    // t2125LineForExpenseKey would file these under 9270 without a word.
    expect(() => t2125FormLineForExpenseItem("office_phones")).toThrow(/No T2125 line/);
    expect(() => t2125FormLineForExpenseItem("vehicle")).toThrow(/No T2125 line/);
  });
});

describe("the engine's totals are the form's", () => {
  const settings = createTestSettings({ home_office_business_use_pct: 0.1, home_office_rent_monthly: 1_000 });
  const deal: Transaction = {
    ...TEST_TRANSACTIONS[0],
    status: "closed",
    sale_price: 500_000,
    commission_pct: 0.02,
    gci_override: null,
    team_split_pct: null,
  };
  const asset: CcaAsset = {
    id: "asset", user_id: "user", cca_class: 8, class_rate: 0.2, class_half_year: true,
    description: "Office equipment", acquisition_date: "2026-03-01", original_cost: 2_000,
    business_use_pct: 1, opening_ucc: 0, additions_this_year: 2_000, disposals_this_year: 0,
    cca_claimed_prior: 0, notes: null, created_at: "2026-03-01T12:00:00Z", updated_at: "2026-03-01T12:00:00Z",
  };
  const t = computeT2125({
    settings,
    transactions: [deal],
    expenses: [{ key: "marketing_ads", amount: 1_500 }, { key: "office_phone", amount: 600 }],
    ccaAssets: [asset],
    otherIncome: 250,
    taxYear: 2026,
  });

  it("line 8299 is commission plus other income", () => {
    expect(t.grossCommissionIncome).toBe(10_000);
    expect(t.totalGrossIncome).toBe(10_250);
  });

  it("line 9368 is the expense lines plus CCA", () => {
    expect(t.expenseLinesTotal).toBe(2_100);
    expect(t.line9936_totalCca).toBe(200); // 2,000 × half-year × 20%
    expect(t.line9368_totalExpenses).toBe(2_300);
  });

  it("line 9946 is 8299 less 9368 less 9945", () => {
    expect(t.line9945_homeOfficeDeduction).toBe(1_200);
    expect(t.line9946_netIncome).toBe(10_250 - 2_300 - 1_200);
  });

  it("the result no longer carries the mislabelled fields", () => {
    expect(t).not.toHaveProperty("line9369_totalExpenses");
    expect(t).not.toHaveProperty("line8270_netBusinessIncome");
  });
});

describe("where the form sends its two results on the return", () => {
  it("gross income from line 8299", () => {
    expect(T2125_RETURN_LINES.gross).toEqual({ business: "13499", professional: "13699", commission: "13899" });
  });

  it("net income from line 9946, as a phrase for copy", () => {
    expect(T2125_RETURN_LINES.net).toEqual({ business: "13500", professional: "13700", commission: "13900" });
    expect(t2125ReturnLinesPhrase("net")).toBe(
      "business income on line 13500, professional income on line 13700 or commission income on line 13900",
    );
  });
});
