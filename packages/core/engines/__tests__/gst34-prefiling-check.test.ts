/**
 * The GST/HST pre-filing check (2026-11-02): what looks wrong behind a
 * period's return, listed for the agent before filing.
 *
 * From Finn's field research: the practitioners saving time on tax prep run
 * a read-only review that lists what doesn't reconcile, then file by hand.
 * The failures every account reported were data hygiene, not the model: a
 * duplicate entry, a receipt that looked the same either way, a wrong date.
 */
import { describe, expect, it } from "vitest";
import {
  ITC_DOCUMENT_SUPPLIER_THRESHOLD,
  runGST34PrefilingCheck,
  TAX_SHARE_TOLERANCE,
  type PrefilingReceipt,
} from "../gst34-prefiling-check";
import { commissionsInGstHstPeriod } from "../commission-hst-engine";

const Q4 = { periodStart: "2026-10-01", periodEnd: "2026-12-31", taxRate: 0.15, today: "2026-11-02" } as const;
const receipt = (over: Partial<PrefilingReceipt>): PrefilingReceipt => ({
  vendor: "Irving", expense_date: "2026-10-05", total_amount: 69.0, tax_amount: 9.0, category_key: "vehicle_fuel", receipt_path: "r.jpg", ...over,
});
const run = (receipts: PrefilingReceipt[], extra: Partial<Parameters<typeof runGST34PrefilingCheck>[0]> = {}) =>
  runGST34PrefilingCheck({ receipts, commissionTiming: "paid", ...Q4, ...extra });

describe("a clean period", () => {
  it("lists nothing and says what it looked at", () => {
    const out = run([receipt({}), receipt({ vendor: "Staples", expense_date: "2026-10-12", total_amount: 45.99, tax_amount: 6.0, category_key: "office_supplies" })]);
    expect(out.items).toEqual([]);
    expect(out.reviewed).toEqual({ receipts: 2, commissions: 0 });
    expect(Object.values(out.counts).every((n) => n === 0)).toBe(true);
  });
});

describe("tax that doesn't fit the rate", () => {
  it("flags a typed HST figure that is off by more than the tolerance", () => {
    // $100 total at 15% carries $13.04 of HST; $15 recorded is a 15% share, off by 2 points: inside tolerance.
    expect(run([receipt({ total_amount: 100, tax_amount: 15 })]).items).toEqual([]);
    // $25 recorded on $100 is far off.
    const out = run([receipt({ total_amount: 100, tax_amount: 25 })]);
    expect(out.items).toHaveLength(1);
    expect(out.items[0]).toMatchObject({ kind: "tax_share_off", description: "Irving", amount: 100 });
    expect(out.items[0].note).toContain("$25.00 of GST/HST recorded on $100.00");
    expect(out.items[0].note).toContain("$13.04");
  });

  it("a bill with a tip or untaxed items passes: the tolerance is wide on purpose", () => {
    // $57.50 bill: $50 taxed meal + $7.50 tip, HST $7.50 (13.0% share vs 13.04%): fine.
    expect(run([receipt({ vendor: "Diner", total_amount: 57.5, tax_amount: 6.5, category_key: "meals_client" })]).items).toEqual([]);
    expect(TAX_SHARE_TOLERANCE).toBe(0.03);
  });

  it("no HST recorded is not a mismatch (the worksheet already lists those)", () => {
    expect(run([receipt({ tax_amount: 0 }), receipt({ vendor: "Shell", tax_amount: null })]).items).toEqual([]);
  });
});

describe("dates", () => {
  it("a receipt dated after today", () => {
    const out = run([receipt({ expense_date: "2026-12-18" })]);
    expect(out.items[0]).toMatchObject({ kind: "future_dated", date: "2026-12-18" });
    expect(out.counts.future_dated).toBe(1);
  });

  it("a receipt the period holds but dated outside it", () => {
    const out = run([receipt({ expense_date: "2026-09-30" })]);
    expect(out.items[0]).toMatchObject({ kind: "outside_period", date: "2026-09-30" });
  });

  it("future-dated wins over outside-period for one receipt", () => {
    const out = run([receipt({ expense_date: "2027-01-02" })]);
    expect(out.items.map((i) => i.kind)).toEqual(["future_dated"]);
  });
});

describe("duplicates", () => {
  it("same day, same vendor, same amount: one item naming the count", () => {
    const out = run([receipt({}), receipt({}), receipt({ vendor: "irving " })]);
    expect(out.items).toHaveLength(1);
    expect(out.items[0]).toMatchObject({ kind: "possible_duplicate", amount: 69 });
    expect(out.items[0].note).toMatch(/^3 receipts/);
  });

  it("same vendor and amount on different days is not a duplicate", () => {
    expect(run([receipt({}), receipt({ expense_date: "2026-10-06" })]).items).toEqual([]);
  });
});

describe("documentary evidence", () => {
  it("a purchase at or over the threshold with HST claimed and no vendor", () => {
    expect(ITC_DOCUMENT_SUPPLIER_THRESHOLD).toBe(30);
    const out = run([receipt({ vendor: "", total_amount: 30, tax_amount: 3.91 })]);
    expect(out.items.map((i) => i.kind)).toEqual(["no_vendor_over_threshold"]);
    expect(out.items[0].description).toBe("Unknown vendor");
  });

  it("under the threshold, or with no HST claimed, no vendor is fine", () => {
    expect(run([receipt({ vendor: null, total_amount: 29.99, tax_amount: 3.9 })]).items).toEqual([]);
    expect(run([receipt({ vendor: null, total_amount: 80, tax_amount: 0 })]).items).toEqual([]);
  });
});

describe("commissions", () => {
  const deals = [
    { id: "a", address: "12 Elm St", date: "2026-10-10", commission_paid_date: "2026-10-24", commission_hst: 1050 },
    { id: "b", address: "8 Oak Ave", date: "2026-11-03", commission_paid_date: "2026-11-20", commission_hst: null },
    { id: "c", address: "3 Pine Rd", date: "2026-12-01", commission_paid_date: null, commission_hst: 600 },
    { id: "d", address: "9 Birch Ln", date: "2026-09-15", commission_paid_date: "2026-10-02", commission_hst: 900 },
  ];
  const onReturn = commissionsInGstHstPeriod(deals, Q4.periodStart, Q4.periodEnd, "paid");

  it("the engine's own placement decides which deals are checked (a September closing paid in October is on Q4)", () => {
    expect(onReturn.map((d) => d.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("no statement HST: flagged as an estimate; no paid date under paid timing: flagged as placed by closing date", () => {
    const out = run([], { commissions: onReturn });
    expect(out.items.map((i) => [i.kind, i.description])).toEqual([
      ["commission_hst_estimated", "8 Oak Ave"],
      ["commission_no_paid_date", "3 Pine Rd"],
    ]);
    expect(out.items[1].date).toBe("2026-12-01");
    expect(out.reviewed.commissions).toBe(4);
  });

  it("under closing-date timing a missing paid date is not a question", () => {
    const out = run([], { commissions: onReturn, commissionTiming: "closing" });
    expect(out.items.map((i) => i.kind)).toEqual(["commission_hst_estimated"]);
  });
});

describe("the list", () => {
  it("is sorted by date, then description, with undated commissions first", () => {
    const out = run(
      [receipt({ vendor: "Zed", expense_date: "2026-10-20", total_amount: 100, tax_amount: 30 }), receipt({ vendor: "Abe", expense_date: "2026-10-20", total_amount: 100, tax_amount: 30 }), receipt({ expense_date: "2026-10-01", total_amount: 100, tax_amount: 30 })],
    );
    expect(out.items.map((i) => `${i.date} ${i.description}`)).toEqual(["2026-10-01 Irving", "2026-10-20 Abe", "2026-10-20 Zed"]);
  });

  it("every note reads as information, not advice, with no em dash", async () => {
    const { validateTaxCopy } = await import("../../tax-copy/validate");
    const out = run(
      [
        receipt({ expense_date: "2026-12-18" }), receipt({ expense_date: "2026-09-30" }), receipt({ total_amount: 100, tax_amount: 25 }),
        receipt({ vendor: "", total_amount: 40, tax_amount: 5 }), receipt({ vendor: "Dup" }), receipt({ vendor: "Dup" }),
      ],
      { commissions: [{ address: "1 A St", date: "2026-10-10", commission_paid_date: null, commission_hst: null }] },
    );
    expect(new Set(out.items.map((i) => i.kind)).size).toBe(7);
    for (const i of out.items) {
      expect(validateTaxCopy(i.note).filter((d) => d.level === "error"), i.note).toEqual([]);
      expect(i.note).not.toMatch(/—/);
    }
  });
});
