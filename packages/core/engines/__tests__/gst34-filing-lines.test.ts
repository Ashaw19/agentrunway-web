/**
 * The GST/HST return, line by line, the way CRA defines the lines (2026-10-13).
 *
 * Andrew asked for a return he could copy into CRA's form. Checking the
 * helper against CRA's "Instructions for preparing a GST/HST return" showed
 * its lines 106 and 107 were not CRA's:
 *
 *   helper   106 = GST/HST PAID            ($466)
 *            107 = what can't be claimed   (−$90, shown as "ITC adjustments")
 *            108 = 106 + 107               ($376)   ← correct
 *
 *   CRA      106 = ELIGIBLE ITCs           ($376)
 *            107 = adjustments DEDUCTED from net tax (bad debts...), which
 *                  the return ADDS to line 106
 *            108 = 106 + 107
 *
 * The total was right. But typed into CRA's form as shown, "106: 466" and
 * "107: 90" give line 108 = $556: an over-claim of twice the amount that
 * can't be claimed.
 *
 * Fixtures are the shape of that Q2: no sales, fuel and a lease at 80%
 * business use, meals, and ordinary expenses.
 */
import { describe, expect, it } from "vitest";
import { computeGST34, type GST34Result } from "../gst34-engine";
import { getFilingPeriods } from "../filing-period-engine";
import { buildGST34Worksheet } from "../gst34-worksheet";
import { recurringHSTDetailForPeriod, recurringHSTEntriesForPeriod } from "../recurring-expense-engine";
import type { RecurringExpense } from "../../types/database";

const [Q1, Q2] = getFilingPeriods("quarterly", 2026);

const receipts = [
  { vendor: "Fuel stop", expense_date: "2026-04-17", total_amount: 94.38, tax_amount: 12.31, category_key: "vehicle_fuel", receipt_path: "u/a.jpg" },
  { vendor: "Diner", expense_date: "2026-05-10", total_amount: 94.99, tax_amount: 12.39, category_key: "meals_client", receipt_path: null },
  { vendor: "Office store", expense_date: "2026-06-02", total_amount: 115, tax_amount: 15, category_key: "office_supplies", receipt_path: "u/b.jpg" },
  { vendor: "Power co", expense_date: "2026-06-12", total_amount: 230, tax_amount: 30, category_key: "home_utilities", receipt_path: "u/c.jpg" },
  { vendor: "Software", expense_date: "2026-06-20", total_amount: 140, tax_amount: 0, category_key: "office_software", receipt_path: null },
  { vendor: "Gift card", expense_date: "2026-04-02", total_amount: 220, tax_amount: null, category_key: "marketing_gifts", receipt_path: null },
];

const re = (o: Partial<RecurringExpense>): RecurringExpense => ({
  id: "lease", user_id: "u", name: "Vehicle lease", amount: 680.57, category_key: "vehicle_payment", frequency: "monthly",
  day_of_month: 24, month_of_year: null, hst_included: true, hst_amount: 88.77, vehicle_pct_applicable: true,
  notes: "", start_date: "2024-06-24", end_date: null, is_active: true,
  created_at: "2024-06-24T12:00:00Z", updated_at: "2024-06-24T12:00:00Z", ...o,
});
const recurring = [re({}), re({ id: "dues", name: "Board dues", amount: 123.74, hst_amount: 16.14, category_key: "prof_board_mls", vehicle_pct_applicable: false })];

const q2Return = (): GST34Result =>
  computeGST34({
    province: "newBrunswick", period: Q2, frequency: "quarterly", periodTransactions: [], instalmentsPaid: 0,
    periodReceipts: [
      ...receipts.map((r) => ({ total_amount: r.total_amount, tax_amount: r.tax_amount, category_key: r.category_key })),
      ...recurringHSTEntriesForPeriod(recurring, Q2.startDate, Q2.endDate).map((e) => ({ total_amount: null, ...e })),
    ],
    vehicleBusinessUsePct: 0.8, homeOfficeBusinessUsePct: 0.15,
  });

const line = (r: GST34Result, n: string) => r.filingLines.find((l) => l.line === n)!;

describe("lines 106 and 107 are CRA's, not the helper's old ones", () => {
  const r = q2Return();
  // paid: fuel 12.31 + meal 12.39 + office 15 + power 30 + lease 266.31 + dues 48.42
  const paid = 12.31 + 12.39 + 15 + 30 + 3 * 88.77 + 3 * 16.14;
  // not claimable: 20% of vehicle (12.31 + 266.31), half the meal, 85% of the power bill
  const notClaimable = 0.2 * (12.31 + 266.31) + 12.39 / 2 + 0.85 * 30;

  it("line 106 is the eligible amount; what was paid is reported beside it, not as a line", () => {
    expect(r.hstPaidOnExpenses).toBeCloseTo(paid, 6);
    expect(r.itcNotClaimable).toBeCloseTo(notClaimable, 6);
    expect(r.line106).toBeCloseTo(paid - notClaimable, 6);
    expect(line(r, "106").amount).toBe(Math.round((paid - notClaimable) * 100) / 100);
  });

  it("line 107 is 0 and never carries the ITC limits", () => {
    expect(r.line107).toBe(0);
    expect(line(r, "107")).toMatchObject({ amount: 0, how: "enter", tracked: false });
    expect(line(r, "107").label).toBe("Adjustments to be deducted when determining the net tax");
  });

  it("copied into CRA's form, 106 + 107 gives the right line 108", () => {
    // CRA's electronic return adds whatever is typed on 106 and 107.
    expect(line(r, "106").amount + line(r, "107").amount).toBe(line(r, "108").amount);
    expect(line(r, "108").amount).toBeCloseTo(paid - notClaimable, 2);
  });

  it("the old presentation, copied the same way, over-claimed by twice the limited amount", () => {
    const old106 = r.hstPaidOnExpenses;       // what the helper showed on line 106
    const old107 = r.itcNotClaimable;         // what it showed (as a minus) on line 107
    expect(old106 + old107 - r.line108).toBeCloseTo(2 * notClaimable, 6);
  });

  it("the note on line 106 says what came off and why", () => {
    const note = line(r, "106").note;
    expect(note).toContain("HST paid on 4 receipts and your recurring expenses");
    expect(note).toContain("half of the HST on meals and entertainment");
    expect(note).toContain("the personal share of vehicle HST (business use 80%)");
    expect(note).toContain("the personal share of home bill HST (home office 15%)");
  });
});

describe("the whole return in CRA's order", () => {
  const r = q2Return();

  it("lists every line once, in the order of the form", () => {
    expect(r.filingLines.map((l) => l.line)).toEqual([
      "101", "103", "104", "105", "106", "107", "108", "109", "110", "111", "112", "113A", "205", "405", "113B", "113C", "114",
    ]);
  });

  it("marks what is typed in, what CRA calculates, and what is paper-only", () => {
    const how = Object.fromEntries(r.filingLines.map((l) => [l.line, l.how]));
    for (const n of ["101", "103", "104", "106", "107", "110", "111", "205", "405"]) expect(how[n], n).toBe("enter");
    for (const n of ["105", "108", "109", "114"]) expect(how[n], n).toBe("calculated");
    for (const n of ["112", "113A", "113B", "113C"]) expect(how[n], n).toBe("paper");
  });

  it("flags the lines Agent Runway has no data for, at 0", () => {
    const untracked = r.filingLines.filter((l) => !l.tracked);
    expect(untracked.map((l) => l.line)).toEqual(["104", "107", "111", "205", "405"]);
    for (const l of untracked) expect(l.amount).toBe(0);
    expect(line(r, "405").note).toContain("services bought from outside Canada");
  });

  it("every total is built from the rounded entries, so the worksheet adds up to the cent", () => {
    const a = (n: string) => line(r, n).amount;
    const c = (n: number) => Math.round(n * 100) / 100;
    expect(a("105")).toBe(c(a("103") + a("104")));
    expect(a("108")).toBe(c(a("106") + a("107")));
    expect(a("109")).toBe(c(a("105") - a("108")));
    expect(a("112")).toBe(c(a("110") + a("111")));
    expect(a("113A")).toBe(c(a("109") - a("112")));
    expect(a("113B")).toBe(c(a("205") + a("405")));
    expect(a("113C")).toBe(c(a("113A") + a("113B")));
    expect(a("114")).toBe(c(-a("113C")));
    for (const l of r.filingLines) expect(Number.isInteger(Math.round(l.amount * 100)), l.line).toBe(true);
  });

  it("no sales and only credits: a refund on line 114, nothing on 115", () => {
    expect(line(r, "101").amount).toBe(0);
    expect(line(r, "109").amount).toBeLessThan(0);
    expect(r.line114).toBeCloseTo(r.line108, 6);
    expect(r.line115).toBe(0);
    expect(r.line113).toBe(r.line113C);
    expect(r.filingLines.some((l) => l.line === "115")).toBe(false);
  });

  it("a quarter with sales owes: line 115, and line 103 is the rate times line 101", () => {
    const owing = computeGST34({
      province: "newBrunswick", period: Q1, frequency: "quarterly", instalmentsPaid: 0,
      periodTransactions: [{ gci: 7000 }, { gci: 3333.33 }],
      periodReceipts: [{ total_amount: 115, tax_amount: 15, category_key: "office_supplies" }],
      vehicleBusinessUsePct: 0.8, homeOfficeBusinessUsePct: 0.15,
    });
    expect(line(owing, "101").amount).toBe(10333.33);
    expect(line(owing, "103").amount).toBe(1550);
    expect(line(owing, "106").amount).toBe(15);
    expect(owing.filingLines[owing.filingLines.length - 1]).toMatchObject({ line: "115", label: "Amount owing", amount: 1535 });
    expect(owing.line114).toBe(0);
  });

  it("nothing at all: a nil return, every line 0", () => {
    const nil = computeGST34({ province: "newBrunswick", period: Q2, frequency: "quarterly", periodTransactions: [], periodReceipts: [], instalmentsPaid: 0 });
    for (const l of nil.filingLines) expect(l.amount, l.line).toBe(0);
    expect(nil.filingLines[nil.filingLines.length - 1]).toMatchObject({ line: "115", amount: 0 });
  });

  it("instalments are an annual filer's line", () => {
    expect(line(r, "110").note).toContain("$0 for a monthly or quarterly filer");
    const [year] = getFilingPeriods("annual", 2026);
    const annual = computeGST34({ province: "newBrunswick", period: year, frequency: "annual", periodTransactions: [{ gci: 10000 }], periodReceipts: [], instalmentsPaid: 400 });
    expect(line(annual, "110").amount).toBe(400);
    expect(line(annual, "115").amount).toBe(1100);
  });
});

describe("the worksheet behind line 106", () => {
  const r = q2Return();
  const detail = recurringHSTDetailForPeriod(recurring, Q2.startDate, Q2.endDate);
  const ws = buildGST34Worksheet({ receipts, recurring: detail, vehicleBusinessUsePct: 0.8, homeOfficeBusinessUsePct: 0.15, line106: r.line106 });

  it("lists each expense with GST/HST: receipts by date, then recurring expenses by name", () => {
    expect(ws.rows.map((x) => x.description)).toEqual(["Fuel stop", "Diner", "Office store", "Power co", "Board dues", "Vehicle lease"]);
    expect(ws.rows.map((x) => x.rule)).toEqual(["vehicle", "meals", "full", "home", "full", "vehicle"]);
  });

  it("shows what was paid and what is claimable on each", () => {
    const by = Object.fromEntries(ws.rows.map((x) => [x.description, x]));
    expect(by["Fuel stop"].claimable).toBeCloseTo(12.31 * 0.8, 6);
    expect(by["Diner"].claimable).toBeCloseTo(12.39 / 2, 6);
    expect(by["Office store"].claimable).toBe(15);
    expect(by["Power co"].claimable).toBeCloseTo(4.5, 6);
    expect(by["Vehicle lease"]).toMatchObject({ source: "recurring", occurrences: 3, date: null, hasReceiptImage: null });
    expect(by["Vehicle lease"].paid).toBeCloseTo(3 * 680.57, 6);
    expect(by["Vehicle lease"].hst).toBeCloseTo(266.31, 6);
    expect(by["Vehicle lease"].claimable).toBeCloseTo(266.31 * 0.8, 6);
  });

  it("adds up to the return's line 106", () => {
    expect(ws.totals.claimable).toBe(line(r, "106").amount);
    expect(ws.totals.hst).toBeCloseTo(r.hstPaidOnExpenses, 2);
    expect(ws.differenceFromLine106).toBe(0);
  });

  it("counts the receipts with no GST/HST recorded, which are not in line 106", () => {
    expect(ws.noTaxRecorded).toEqual({ count: 2, paid: 360 });
  });

  it("counts claimed receipts that have no receipt image stored", () => {
    expect(ws.withoutReceiptImage).toBe(1); // the diner
  });

  it("reports a difference when it is given different receipts from the return", () => {
    const short = buildGST34Worksheet({ receipts: receipts.slice(0, 2), recurring: detail, vehicleBusinessUsePct: 0.8, homeOfficeBusinessUsePct: 0.15, line106: r.line106 });
    expect(short.differenceFromLine106).toBeCloseTo(-(15 + 4.5), 2);
  });

  it("the recurring detail is the same data the return is fed", () => {
    const entries = recurringHSTEntriesForPeriod(recurring, Q2.startDate, Q2.endDate);
    expect(detail.map((d) => d.tax_amount)).toEqual(entries.map((e) => e.tax_amount));
    expect(detail.map((d) => d.name)).toEqual(["Vehicle lease", "Board dues"]);
    expect(recurringHSTDetailForPeriod([re({ is_active: false }), re({ hst_amount: 0 })], Q2.startDate, Q2.endDate)).toEqual([]);
  });
});
