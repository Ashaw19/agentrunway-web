/**
 * statement-import-engine: which statement lines are charges already on
 * file, what confirming a line does, the expense row it becomes, and the
 * two reconciliation lists. Synthetic fixtures only.
 */
import { describe, expect, it } from "vitest";
import {
  bulkConfirmExclusion,
  bulkConfirmRefusal,
  confirmationOutcome,
  duplicateColumns,
  duplicateFlagUpdates,
  duplicateSearchWindow,
  expenseRowForStatementLine,
  findStatementDuplicates,
  reconciliationLists,
  type ReceiptForMatch,
  type StatementLineForMatch,
} from "../statement-import-engine";
import { recurringChargeDatesBetween } from "../recurring-expense-engine";
import type { RecurringExpense } from "../../types/database";

function line(overrides: Partial<StatementLineForMatch> & { id: string }): StatementLineForMatch {
  return {
    line_date: "2026-09-10",
    amount: 54.2,
    direction: "out",
    status: "pending",
    description: "SHELL C12345 SAINT JOHN NB",
    merchant: "Shell",
    duplicate_dismissed: false,
    recurring_expense_id: null,
    recurring_charge_date: null,
    ...overrides,
  };
}

function receipt(overrides: Partial<ReceiptForMatch> & { id: string }): ReceiptForMatch {
  return { expense_date: "2026-09-10", total_amount: 54.2, vendor: "Shell", statement_line_id: null, ...overrides };
}

function recurring(overrides: Partial<RecurringExpense>): RecurringExpense {
  return {
    id: "lease",
    user_id: "u1",
    name: "Car lease",
    amount: 575,
    category_key: "vehicle_payment",
    frequency: "monthly",
    day_of_month: 15,
    month_of_year: null,
    hst_included: true,
    hst_amount: 75,
    vehicle_pct_applicable: true,
    notes: "",
    start_date: "2026-01-01",
    end_date: null,
    is_active: true,
    created_at: "2026-01-01T12:00:00Z",
    updated_at: "2026-01-01T12:00:00Z",
    ...overrides,
  };
}

describe("recurringChargeDatesBetween (recurring-expense-engine)", () => {
  it("lists a monthly expense's charge days in range, from its start date to its end date", () => {
    const re = recurring({ start_date: "2026-08-01", end_date: "2026-10-20" });
    expect(recurringChargeDatesBetween(re, "2026-07-01", "2026-12-31")).toEqual(["2026-08-15", "2026-09-15", "2026-10-15"]);
  });

  it("lists quarterly and annual charges on their months", () => {
    const q = recurring({ id: "q", frequency: "quarterly", month_of_year: 2, day_of_month: 3 });
    expect(recurringChargeDatesBetween(q, "2026-01-01", "2026-12-31")).toEqual(["2026-02-03", "2026-05-03", "2026-08-03", "2026-11-03"]);
    const a = recurring({ id: "a", frequency: "annual", month_of_year: 9, day_of_month: 30 });
    expect(recurringChargeDatesBetween(a, "2026-01-01", "2026-12-31")).toEqual(["2026-09-30"]);
  });

  it("an inactive expense has no charge days", () => {
    expect(recurringChargeDatesBetween(recurring({ is_active: false }), "2026-01-01", "2026-12-31")).toEqual([]);
  });
});

describe("findStatementDuplicates", () => {
  it("pass 1: a receipt on the same day for the same amount (within $0.02) is the same charge", () => {
    const found = findStatementDuplicates(
      [line({ id: "l1", amount: 54.21 })],
      [receipt({ id: "r1", total_amount: 54.2 })],
      [],
    );
    expect(found.get("l1")).toEqual({ kind: "receipt", receiptId: "r1", method: "exact", confidence: 1 });
  });

  it("3 cents apart is never linked: from the same merchant it is held, from another it is a new charge", () => {
    const same = findStatementDuplicates([line({ id: "l1", amount: 54.23 })], [receipt({ id: "r1" })], []);
    expect(same.get("l1")).toMatchObject({ kind: "ambiguous", reason: "near_match", receiptIds: ["r1"] });
    const other = findStatementDuplicates([line({ id: "l1", amount: 54.23 })], [receipt({ id: "r1", vendor: "Staples" })], []);
    expect(other.get("l1")).toEqual({ kind: "none" });
  });

  it("pass 2: two days either side matches, at 0.8; three days is only held, never linked", () => {
    const found = findStatementDuplicates(
      [line({ id: "l1", line_date: "2026-09-12" }), line({ id: "l2", line_date: "2026-09-20", amount: 12, description: "PARKING", merchant: null })],
      [receipt({ id: "r1", expense_date: "2026-09-10" }), receipt({ id: "r2", expense_date: "2026-09-17", total_amount: 12, vendor: "Impark" })],
      [],
    );
    expect(found.get("l1")).toEqual({ kind: "receipt", receiptId: "r1", method: "window", confidence: 0.8 });
    expect(found.get("l2")).toEqual({ kind: "ambiguous", candidates: 1, reason: "near_match", receiptIds: ["r2"], recurringIds: [], lineIds: [] });
  });

  it("a recurring expense's charge on that day is the same charge (it already counts on its date)", () => {
    const found = findStatementDuplicates(
      [line({ id: "l1", line_date: "2026-09-15", amount: 575, description: "TOYOTA FINANCIAL PAD" })],
      [],
      [recurring({})],
    );
    expect(found.get("l1")).toEqual({ kind: "recurring", recurringId: "lease", chargeDate: "2026-09-15", method: "exact", confidence: 1 });
    expect(duplicateColumns(found.get("l1"))).toEqual({
      match_receipt_id: null,
      match_method: "exact",
      match_confidence: 1,
      recurring_expense_id: "lease",
      recurring_charge_date: "2026-09-15",
      duplicate_candidate_count: 1,
      hold_reason: null,
      related_line_id: null,
      related_receipt_id: null,
    });
  });

  it("a recurring charge posted a day late matches in pass 2", () => {
    const found = findStatementDuplicates([line({ id: "l1", line_date: "2026-09-16", amount: 575 })], [], [recurring({})]);
    expect(found.get("l1")).toMatchObject({ kind: "recurring", method: "window", chargeDate: "2026-09-15" });
  });

  it("the same amount from a recurring expense charged a week away is held as a possible duplicate, never linked", () => {
    const found = findStatementDuplicates([line({ id: "l1", line_date: "2026-09-22", amount: 575 })], [], [recurring({})]);
    expect(found.get("l1")).toEqual({
      kind: "ambiguous", candidates: 1, reason: "recurring_off_date", receiptIds: [], recurringIds: ["lease"], lineIds: [],
    });
    expect(duplicateColumns(found.get("l1"))).toMatchObject({ hold_reason: "recurring_off_date", duplicate_candidate_count: 1, recurring_expense_id: null });
  });

  it("a small amount is not held for an off-date recurring look-alike", () => {
    const found = findStatementDuplicates(
      [line({ id: "l1", line_date: "2026-09-22", amount: 4.99 })],
      [],
      [recurring({ amount: 4.99, hst_amount: 0 })],
    );
    expect(found.get("l1")).toEqual({ kind: "none" });
  });

  it("two identical charges and one receipt: one links, the other is a new charge", () => {
    const found = findStatementDuplicates(
      [line({ id: "l1", amount: 2.15 }), line({ id: "l2", amount: 2.15 })],
      [receipt({ id: "r1", total_amount: 2.15 })],
      [],
    );
    expect(found.get("l1")).toMatchObject({ kind: "receipt", receiptId: "r1" });
    expect(found.get("l2")).toEqual({ kind: "none" });
  });

  it("two same-day receipts of the same amount: the vendor that shares a word wins", () => {
    const found = findStatementDuplicates(
      [line({ id: "l1", amount: 30, description: "STAPLES #123 SAINT JOHN", merchant: "Staples" })],
      [receipt({ id: "r1", total_amount: 30, vendor: "Tim Hortons" }), receipt({ id: "r2", total_amount: 30, vendor: "Staples Canada" })],
      [],
    );
    expect(found.get("l1")).toMatchObject({ kind: "receipt", receiptId: "r2", method: "exact" });
  });

  it("two same-day receipts and no way to tell them apart: held, both named", () => {
    const found = findStatementDuplicates(
      [line({ id: "l1", amount: 30, description: "SQ *MARKET", merchant: null })],
      [receipt({ id: "r1", total_amount: 30, vendor: "Tim Hortons" }), receipt({ id: "r2", total_amount: 30, vendor: "Staples" })],
      [],
    );
    expect(found.get("l1")).toEqual({ kind: "ambiguous", candidates: 2, reason: "several", receiptIds: ["r1", "r2"], recurringIds: [], lineIds: [] });
  });

  it("a receipt and a recurring charge both fit: held", () => {
    const found = findStatementDuplicates(
      [line({ id: "l1", line_date: "2026-09-15", amount: 575 })],
      [receipt({ id: "r1", expense_date: "2026-09-15", total_amount: 575, vendor: "Lease" })],
      [recurring({})],
    );
    expect(found.get("l1")).toMatchObject({ kind: "ambiguous", candidates: 2, receiptIds: ["r1"], recurringIds: ["lease"] });
  });

  it("a receipt already reconciled with a line on another statement is held, not linked or ignored", () => {
    const found = findStatementDuplicates(
      [line({ id: "new" })],
      [receipt({ id: "r1", statement_line_id: "line-on-an-older-import" })],
      [],
    );
    expect(found.get("new")).toMatchObject({ kind: "ambiguous", reason: "several", receiptIds: ["r1"] });
  });

  it("a receipt held by a line in the batch is that line's, and no one else's", () => {
    const found = findStatementDuplicates(
      [line({ id: "l1", status: "confirmed" }), line({ id: "l2" })],
      [receipt({ id: "r1", statement_line_id: "l1" })],
      [],
    );
    expect(found.has("l1")).toBe(false);
    expect(found.get("l2")).toEqual({ kind: "none" });
  });

  it("a pending line that already owns a receipt (a confirm that stopped half way) is recorded by it", () => {
    const found = findStatementDuplicates([line({ id: "l1" })], [receipt({ id: "r1", statement_line_id: "l1" })], []);
    expect(found.get("l1")).toEqual({ kind: "receipt", receiptId: "r1", method: "exact", confidence: 1 });
  });

  it("a confirmed recurring line holds its charge date: an identical second line is not matched to it", () => {
    const found = findStatementDuplicates(
      [
        line({ id: "l1", status: "confirmed", line_date: "2026-09-15", amount: 575, recurring_expense_id: "lease", recurring_charge_date: "2026-09-15" }),
        line({ id: "l2", line_date: "2026-09-15", amount: 575 }),
      ],
      [],
      [recurring({})],
    );
    // October's charge is 30 days away: outside every window.
    expect(found.get("l2")).toEqual({ kind: "none" });
  });

  it("money in, skipped lines and lines marked not-the-same-charge get no finding", () => {
    const found = findStatementDuplicates(
      [
        line({ id: "refund", direction: "in", description: "PAYROLL DEPOSIT", merchant: null }),
        line({ id: "skipped", status: "skipped" }),
        line({ id: "dismissed", duplicate_dismissed: true }),
      ],
      [receipt({ id: "r1" })],
      [],
    );
    expect([...found.keys()]).toEqual([]);
  });

  it("an empty batch finds nothing", () => {
    expect(findStatementDuplicates([], [receipt({ id: "r1" })], [recurring({})]).size).toBe(0);
  });
});

describe("holds the agent decides (never linked, never added on their own)", () => {
  const sep = (o: Partial<StatementLineForMatch> & { id: string }) => line({ statement_id: "csv", ...o });

  it("the same charge in another import of the same month is held on both sides", () => {
    const found = findStatementDuplicates(
      [sep({ id: "csv-1" }), sep({ id: "pdf-1", statement_id: "pdf", description: "SHELL SAINT JOHN", line_date: "2026-09-11" })],
      [],
      [],
    );
    expect(found.get("csv-1")).toMatchObject({ kind: "ambiguous", reason: "other_import", lineIds: ["pdf-1"] });
    expect(found.get("pdf-1")).toMatchObject({ kind: "ambiguous", reason: "other_import", lineIds: ["csv-1"] });
    expect(duplicateColumns(found.get("pdf-1"))).toMatchObject({ hold_reason: "other_import", related_line_id: "csv-1" });
  });

  it("another import's confirmed line holds a new one; a skipped one doesn't; two coffees in one import aren't held", () => {
    const found = findStatementDuplicates(
      [
        sep({ id: "old", statement_id: "july-csv", status: "confirmed" }),
        sep({ id: "new" }),
        sep({ id: "gone", statement_id: "july-csv", status: "skipped", line_date: "2026-09-20", amount: 9 }),
        sep({ id: "coffee-1", line_date: "2026-09-20", amount: 9 }),
        sep({ id: "coffee-2", line_date: "2026-09-20", amount: 9 }),
      ],
      [],
      [],
    );
    expect(found.get("new")).toMatchObject({ reason: "other_import", lineIds: ["old"] });
    expect(found.get("coffee-1")).toEqual({ kind: "none" });
    expect(found.get("coffee-2")).toEqual({ kind: "none" });
  });

  it("a pre-tip receipt from the same restaurant is held, not counted beside the card charge", () => {
    const found = findStatementDuplicates(
      [line({ id: "l1", amount: 54, description: "THE KEG STEAKHOUSE #12", merchant: "The Keg Steakhouse" })],
      [receipt({ id: "r1", total_amount: 45, vendor: "The Keg" })],
      [],
    );
    expect(found.get("l1")).toMatchObject({ kind: "ambiguous", reason: "near_match", receiptIds: ["r1"] });
  });

  it("a subscription charged in US dollars (a few cents off the recurring amount) is held", () => {
    const canva = recurring({ id: "canva", name: "Canva Pro", amount: 16.99, hst_amount: 0, day_of_month: 12, category_key: "office_software", vehicle_pct_applicable: false });
    const found = findStatementDuplicates([line({ id: "l1", line_date: "2026-09-12", amount: 17.38, description: "CANVA* PRO", merchant: "Canva Pro" })], [], [canva]);
    expect(found.get("l1")).toMatchObject({ kind: "ambiguous", reason: "near_match", recurringIds: ["canva"] });
  });

  it("a debit that posts three to five days late is held", () => {
    const found = findStatementDuplicates(
      [line({ id: "l1", line_date: "2026-09-14", amount: 120, description: "PRE-AUTHORIZED DEBIT", merchant: null })],
      [receipt({ id: "r1", expense_date: "2026-09-10", total_amount: 120, vendor: "Insurer" })],
      [],
    );
    expect(found.get("l1")).toMatchObject({ kind: "ambiguous", reason: "near_match", receiptIds: ["r1"] });
  });

  it("a refund and the purchase it returns are held together", () => {
    const found = findStatementDuplicates(
      [
        line({ id: "buy", line_date: "2026-09-02", amount: 89.99, description: "BEST BUY #12", merchant: "Best Buy" }),
        line({ id: "back", line_date: "2026-09-09", amount: 89.99, direction: "in", description: "BEST BUY #12 REFUND", merchant: "Best Buy" }),
        line({ id: "late", line_date: "2026-03-01", amount: 89.99, direction: "in", description: "BEST BUY REFUND", merchant: "Best Buy" }),
      ],
      [],
      [],
    );
    expect(found.get("buy")).toMatchObject({ kind: "ambiguous", reason: "refund", lineIds: ["back"] });
    expect(found.get("back")).toMatchObject({ kind: "ambiguous", reason: "refund", lineIds: ["buy"] });
    // A credit before the purchase is no refund of it.
    expect(found.has("late")).toBe(false);
  });

  it("a held line is refused on confirm, unless marked not the same charge", () => {
    const base = { status: "pending" as const, direction: "out" as const, suggested_category_key: "vehicle_fuel" };
    expect(confirmationOutcome({ ...base, hold_reason: "other_import", duplicate_candidate_count: 1 })).toEqual({ action: "refuse", reason: "needs_decision" });
    expect(confirmationOutcome({ ...base, hold_reason: "near_match", duplicate_dismissed: true })).toEqual({ action: "create", categoryKey: "vehicle_fuel" });
  });
});

describe("bulkConfirmExclusion", () => {
  const base = { status: "pending" as const, direction: "out" as const, suggested_category_key: "office_software", business_likelihood: 0.75, category_source: "hint" };
  it("leaves out a deleted expense, a line under 50% unless the agent chose it, and an unverified PDF's lines", () => {
    expect(bulkConfirmExclusion(base, "not_applicable")).toBeNull();
    expect(bulkConfirmExclusion({ ...base, expense_deleted_at: "2026-10-01T12:00:00Z" }, "not_applicable")).toBe("expense_deleted");
    expect(bulkConfirmExclusion({ ...base, business_likelihood: 0.4 }, "reconciled")).toBe("low_likelihood");
    expect(bulkConfirmExclusion({ ...base, business_likelihood: 0.4, category_source: "agent" }, "reconciled")).toBeNull();
    expect(bulkConfirmExclusion({ ...base, business_likelihood: null }, "reconciled")).toBe("low_likelihood");
    expect(bulkConfirmExclusion(base, "unverified")).toBe("unverified_statement");
    expect(bulkConfirmExclusion(base, "mismatch")).toBe("unverified_statement");
    // Linking adds nothing, so it is never left out.
    expect(bulkConfirmExclusion({ ...base, match_receipt_id: "r1", business_likelihood: 0.1 }, "unverified")).toBeNull();
    expect(bulkConfirmExclusion({ ...base, hold_reason: "refund" }, "reconciled")).toBe("not_confirmable");
  });

  it("judges a line with the category passed for it, which never lifts the 50% rule", () => {
    // The model call failed: no estimate, no likelihood.
    const bare = { status: "pending" as const, direction: "out" as const, suggested_category_key: null, business_likelihood: null, category_source: null };
    expect(bulkConfirmExclusion(bare, "unverified")).toBe("not_confirmable");
    // Flight Crew's drafted category makes it addable, so the bulk rules apply.
    expect(bulkConfirmExclusion(bare, "unverified", "office_supplies")).toBe("unverified_statement");
    expect(bulkConfirmExclusion(bare, "reconciled", "office_supplies")).toBe("low_likelihood");
    expect(bulkConfirmExclusion({ ...bare, business_likelihood: 0.9 }, "reconciled", "office_supplies")).toBeNull();
  });
});

describe("bulkConfirmRefusal (one line of a confirm of several)", () => {
  const bare = { status: "pending" as const, direction: "out" as const, suggested_category_key: null, business_likelihood: null, category_source: null };

  it("an unverified PDF whose model call failed, with Flight Crew's categories, sends nothing", () => {
    const lines = [bare, { ...bare, business_likelihood: 0.9 }, { ...bare, suggested_category_key: "vehicle_fuel", business_likelihood: 0.8 }];
    const sent = lines.filter((l) => bulkConfirmRefusal(l, "unverified", "office_supplies") === null);
    expect(sent).toHaveLength(0);
    expect(lines.map((l) => bulkConfirmRefusal(l, "unverified", "office_supplies"))).toEqual([
      "bulk_unverified_statement",
      "bulk_unverified_statement",
      "bulk_unverified_statement",
    ]);
  });

  it("never leaves a line for the database to decide: confirming's own refusal comes back", () => {
    expect(bulkConfirmRefusal(bare, "reconciled")).toBe("needs_category");
    expect(bulkConfirmRefusal({ ...bare, suggested_category_key: "x", hold_reason: "near_match" }, "reconciled", "office_supplies")).toBe("needs_decision");
    expect(bulkConfirmRefusal({ ...bare, status: "confirmed" }, "reconciled", "office_supplies")).toBe("not_pending");
    expect(bulkConfirmRefusal({ ...bare, direction: "in" }, "reconciled", "office_supplies")).toBe("not_a_charge");
    expect(bulkConfirmRefusal(undefined, "reconciled", "office_supplies")).toBe("not_found");
  });

  it("lets through what links, and what adds within the rules", () => {
    expect(bulkConfirmRefusal({ ...bare, match_receipt_id: "r1" }, "unverified", "office_supplies")).toBeNull();
    expect(bulkConfirmRefusal({ ...bare, recurring_expense_id: "re1" }, "mismatch")).toBeNull();
    expect(bulkConfirmRefusal({ ...bare, business_likelihood: 0.6 }, "reconciled", "office_supplies")).toBeNull();
    expect(bulkConfirmRefusal({ ...bare, business_likelihood: 0.2, category_source: "agent", category_key: "office_supplies" }, "not_applicable")).toBeNull();
    expect(bulkConfirmRefusal({ ...bare, business_likelihood: 0.2 }, "not_applicable", "office_supplies")).toBe("bulk_low_likelihood");
  });
});

describe("duplicateFlagUpdates (run before every confirm)", () => {
  it("writes only the pending lines whose duplicate columns change", () => {
    const lines = [
      // A receipt scanned after the upload: now a duplicate.
      line({ id: "now-dup" }),
      // Already flagged the same way: nothing to write.
      { ...line({ id: "same", line_date: "2026-09-20", amount: 9 }), ...duplicateColumns({ kind: "none" }) },
      // Flagged before, the receipt has since been deleted: cleared.
      { ...line({ id: "stale", line_date: "2026-09-25", amount: 7 }), match_receipt_id: "gone", match_method: "exact" as const, duplicate_candidate_count: 1 },
      // Matched by hand: left as the agent made it.
      { ...line({ id: "manual", line_date: "2026-09-26", amount: 3 }), match_receipt_id: "r9", match_method: "manual" as const, duplicate_candidate_count: 1 },
    ];
    const updates = duplicateFlagUpdates(lines, [receipt({ id: "r1" })], []);
    expect(updates).toEqual([
      { id: "now-dup", columns: { match_receipt_id: "r1", match_method: "exact", match_confidence: 1, recurring_expense_id: null, recurring_charge_date: null, duplicate_candidate_count: 1, hold_reason: null, related_line_id: null, related_receipt_id: null } },
      { id: "stale", columns: duplicateColumns({ kind: "none" }) },
    ]);
  });

  it("a line held because its recurring expense changed stays held unless it links again", () => {
    const held = { ...line({ id: "lease-line", line_date: "2026-09-15", amount: 575 }), hold_reason: "recurring_changed" as const };
    // The lease now says 580: nothing links, so the hold stays.
    expect(duplicateFlagUpdates([held], [], [recurring({ amount: 580 })])).toEqual([]);
    // Still 575 on the 15th: it links again, and the hold goes.
    expect(duplicateFlagUpdates([held], [], [recurring({})])).toMatchObject([{ id: "lease-line", columns: { recurring_expense_id: "lease", hold_reason: null } }]);
  });

  it("the search window runs 10 days either side of the lines", () => {
    expect(duplicateSearchWindow([{ line_date: "2026-09-03" }, { line_date: "2026-09-28" }])).toEqual({ from: "2026-08-24", to: "2026-10-08" });
    expect(duplicateSearchWindow([])).toBeNull();
  });
});

describe("confirmationOutcome (mirrors fn_confirm_statement_lines)", () => {
  const pending = { status: "pending" as const, direction: "out" as const };

  it("a line already recorded by a receipt is linked, never added", () => {
    expect(confirmationOutcome({ ...pending, match_receipt_id: "r1", category_key: "vehicle_fuel" })).toEqual({ action: "link_receipt", receiptId: "r1" });
  });

  it("a recurring charge is counted by the list, never added", () => {
    expect(confirmationOutcome({ ...pending, recurring_expense_id: "lease" })).toEqual({ action: "recurring", recurringId: "lease" });
  });

  it("an ambiguous line is held until the agent decides", () => {
    expect(confirmationOutcome({ ...pending, duplicate_candidate_count: 2, suggested_category_key: "meals_client" })).toEqual({ action: "refuse", reason: "needs_decision" });
  });

  it("marked not the same charge: added with its category", () => {
    expect(confirmationOutcome({ ...pending, duplicate_dismissed: true, match_receipt_id: null, duplicate_candidate_count: 2, suggested_category_key: "meals_client" }))
      .toEqual({ action: "create", categoryKey: "meals_client" });
  });

  it("category: the override, then the agent's choice, then the estimate", () => {
    const l = { ...pending, category_key: "office_supplies", suggested_category_key: "office_hardware" };
    expect(confirmationOutcome(l, "office_software")).toEqual({ action: "create", categoryKey: "office_software" });
    expect(confirmationOutcome(l)).toEqual({ action: "create", categoryKey: "office_supplies" });
    expect(confirmationOutcome({ ...pending, suggested_category_key: "office_hardware" })).toEqual({ action: "create", categoryKey: "office_hardware" });
    expect(confirmationOutcome(pending)).toEqual({ action: "refuse", reason: "needs_category" });
  });

  it("money in and lines already decided are refused", () => {
    expect(confirmationOutcome({ status: "pending", direction: "in", suggested_category_key: "other_misc" })).toEqual({ action: "refuse", reason: "not_a_charge" });
    expect(confirmationOutcome({ status: "confirmed", direction: "out" })).toEqual({ action: "refuse", reason: "not_pending" });
    expect(confirmationOutcome({ status: "skipped", direction: "out" })).toEqual({ action: "refuse", reason: "not_pending" });
  });
});

describe("expenseRowForStatementLine", () => {
  it("is the charge as paid, with GST/HST left empty (never derived from a rate)", () => {
    const row = expenseRowForStatementLine(
      { id: "l1", line_date: "2026-09-10", amount: "54.2", description: "SHELL C12345 SAINT JOHN NB", merchant: "Shell" },
      "vehicle_fuel",
      "RBC Visa",
    );
    expect(row).toEqual({
      vendor: "Shell",
      expense_date: "2026-09-10",
      total_amount: 54.2,
      tax_amount: null,
      subtotal: null,
      currency: "CAD",
      category_key: "vehicle_fuel",
      notes: "From statement import, RBC Visa",
      source: "statement_import",
      statement_line_id: "l1",
    });
  });

  it("falls back to the description when there is no merchant, cut to the vendor field's length", () => {
    const row = expenseRowForStatementLine({ id: "l1", line_date: "2026-09-10", amount: 1, description: `  ${"X".repeat(200)} ` }, "other_misc", null);
    expect(row.vendor).toHaveLength(120);
    expect(row.notes).toBe("From statement import");
  });
});

describe("reconciliationLists", () => {
  const statements = [{ id: "s1", period_start: "2026-09-01", period_end: "2026-09-30", account_label: "RBC Visa" }];
  const base = { statement_id: "s1", amount: 10, direction: "out" as const };

  it("lists confirmed charges whose expense has no receipt image, and receipts in the period with no line", () => {
    const lines = [
      { ...base, id: "copy", line_date: "2026-09-03", status: "confirmed" as const },
      { ...base, id: "typed", line_date: "2026-09-04", status: "confirmed" as const },
      { ...base, id: "scanned", line_date: "2026-09-05", status: "confirmed" as const },
      { ...base, id: "lease", line_date: "2026-09-15", status: "confirmed" as const, recurring_expense_id: "lease" },
      { ...base, id: "waiting", line_date: "2026-09-06", status: "pending" as const },
      { ...base, id: "refund", line_date: "2026-09-07", status: "confirmed" as const, direction: "in" as const },
    ];
    const receipts = [
      { id: "r-copy", expense_date: "2026-09-03", total_amount: 10, source: "statement_import", statement_line_id: "copy", receipt_path: null },
      { id: "r-typed", expense_date: "2026-09-04", total_amount: 10, source: null, statement_line_id: "typed", receipt_path: null },
      { id: "r-scanned", expense_date: "2026-09-05", total_amount: 10, source: null, statement_line_id: "scanned", receipt_path: "u1/a.jpg" },
      { id: "cash", expense_date: "2026-09-20", total_amount: 8, source: null, statement_line_id: null, receipt_path: "u1/b.jpg" },
      { id: "august", expense_date: "2026-08-20", total_amount: 8, source: null, statement_line_id: null, receipt_path: null },
      { id: "zero", expense_date: "2026-09-21", total_amount: 0, source: null, statement_line_id: null, receipt_path: null },
    ];
    const lists = reconciliationLists(statements, lines, receipts);
    expect(lists.chargesWithoutReceipt.map((c) => [c.line.id, c.receiptId, c.reason])).toEqual([
      ["copy", "r-copy", "statement_copy"],
      ["typed", "r-typed", "no_document"],
    ]);
    expect(lists.receiptsWithoutLine.map((r) => r.id)).toEqual(["cash"]);
    expect(lists.recurringCharges).toBe(1);
  });

  it("with no statement imported, no receipt is listed", () => {
    expect(reconciliationLists([], [], [{ id: "r", expense_date: "2026-09-20", total_amount: 8 }]).receiptsWithoutLine).toEqual([]);
  });
});
