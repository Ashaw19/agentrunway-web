import { describe, it, expect } from "vitest";
import { aggregateReceiptTotals } from "../receipt-totals";

describe("aggregateReceiptTotals", () => {
  it("keeps uncategorized receipts out of the per-key map but inside the total", () => {
    const { byKey, uncategorized, total } = aggregateReceiptTotals([
      { category_key: "advertising", total_amount: 100 },
      { category_key: "advertising", total_amount: 50 },
      { category_key: null, total_amount: 25 },
    ]);

    expect(byKey).toEqual({ advertising: 150 });
    expect(uncategorized).toBe(25);
    expect(total).toBe(175);
  });

  it("total always equals the raw sum of every row — the dashboard's number", () => {
    // The dashboard computes receiptYTD as a flat sum over receipt_expenses with
    // no category filter. Any surface that keys by category must still land here.
    const rows = [
      { category_key: "vehicle", total_amount: 412.55 },
      { category_key: null, total_amount: 99.99 },
      { category_key: "", total_amount: 10 },
      { category_key: "meals", total_amount: "63.20" },
    ];
    const rawSum = rows.reduce((s, r) => s + Number(r.total_amount), 0);

    expect(aggregateReceiptTotals(rows).total).toBeCloseTo(rawSum, 2);
  });

  it("treats an empty-string category_key as uncategorized, not as a key", () => {
    const { byKey, uncategorized } = aggregateReceiptTotals([
      { category_key: "", total_amount: 40 },
    ]);

    expect(byKey).toEqual({});
    expect(uncategorized).toBe(40);
  });

  it("skips null and non-numeric amounts instead of producing NaN", () => {
    const { byKey, uncategorized, total } = aggregateReceiptTotals([
      { category_key: "office", total_amount: null },
      { category_key: null, total_amount: undefined },
      { category_key: "office", total_amount: "not a number" },
      { category_key: "office", total_amount: 30 },
    ]);

    expect(byKey).toEqual({ office: 30 });
    expect(uncategorized).toBe(0);
    expect(total).toBe(30);
    expect(Number.isNaN(total)).toBe(false);
  });

  it("returns zeroed totals for null, undefined and empty input", () => {
    for (const input of [null, undefined, []]) {
      const result = aggregateReceiptTotals(input);
      expect(result.byKey).toEqual({});
      expect(result.uncategorized).toBe(0);
      expect(result.total).toBe(0);
    }
  });

  it("does not accumulate floating-point drift across many rows", () => {
    const rows = Array.from({ length: 300 }, () => ({
      category_key: "supplies",
      total_amount: 0.1,
    }));

    expect(aggregateReceiptTotals(rows).total).toBe(30);
  });
});
