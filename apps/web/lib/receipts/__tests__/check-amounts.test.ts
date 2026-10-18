/**
 * Receipt amounts after OCR (2026-10-18).
 *
 * An agent scanned a night's gas receipts from the phone and got HST of 19%
 * and 20% of the total on two of them (over $15 on an $82 fill-up), and 14.4%
 * and 13.9% on two more. HST included in a price is at most 15/115 = 13.04%.
 *
 * The receipts (Circle K / Irving, NB) print the HST in two parts under
 * "Taxes on fuel:", HST(F) $2.52 and HST(P) $5.04, in a font whose zero has a
 * slash through it. The model read $5.04 as $5.84 and $4.09 as $4.89. The
 * photos also reached the model sideways: the phone saves them as landscape
 * pixels with an EXIF "rotate" flag.
 *
 * The HST must be the figure printed on the receipt. A reading that can't be
 * right is dropped for the agent to type in, never replaced by a figure
 * worked out from a rate.
 */
import { describe, expect, it } from "vitest";
import { HST_RATE_GROUPS } from "@agent-runway/core/tax-copy/cra-rules";
import { checkReceiptAmounts, MAX_SALES_TAX_RATE } from "../check-amounts";
import type { OcrExtraction } from "@/lib/types/receipt";

function ocr(fields: Partial<OcrExtraction>): OcrExtraction {
  return {
    vendor: "Gas station",
    expense_date: "2026-08-30",
    total_amount: null,
    tax_amount: null,
    subtotal: null,
    currency: "CAD",
    suggested_category: "vehicle_fuel",
    confidence: 0.95,
    ...fields,
  };
}

const split = (f: number, p: number) => [
  { label: "HST(F)", amount: f },
  { label: "HST(P)", amount: p },
];

describe("checkReceiptAmounts: the HST(F) / HST(P) split", () => {
  it("drops the HST when a slashed zero was read as an 8 ($5.04 read as $5.84)", () => {
    const out = checkReceiptAmounts(
      ocr({ total_amount: 57.92, tax_amount: 8.36, subtotal: 49.56, tax_lines: split(2.52, 5.84) }),
    );
    expect(out.tax_amount).toBeNull();
    // The subtotal was total minus the same wrong figure.
    expect(out.subtotal).toBeNull();
    expect(out.total_amount).toBe(57.92);
    expect(out.confidence).toBeLessThanOrEqual(0.6);
  });

  it("drops the HST when the misread makes it smaller ($8.18 read as $0.18)", () => {
    // 4.27 is under the 15% ceiling; only the split shows it's wrong.
    const out = checkReceiptAmounts(ocr({ total_amount: 94.04, tax_amount: 4.27, tax_lines: split(4.09, 0.18) }));
    expect(out.tax_amount).toBeNull();
  });

  it("keeps the HST printed on the receipt: $2.52 + $5.04", () => {
    const out = checkReceiptAmounts(ocr({ total_amount: 57.92, tax_amount: 7.56, tax_lines: split(2.52, 5.04) }));
    expect(out.tax_amount).toBe(7.56);
    expect(out.confidence).toBe(0.95);
  });

  it("adds the printed lines when the model's own sum slipped", () => {
    const out = checkReceiptAmounts(ocr({ total_amount: 94.04, tax_amount: 12.72, tax_lines: split(4.09, 8.18) }));
    expect(out.tax_amount).toBe(12.27);
  });

  it("accepts the split at 13% (Ontario) and 14% (Nova Scotia)", () => {
    expect(checkReceiptAmounts(ocr({ total_amount: 113, tax_amount: 13, tax_lines: split(5, 8) })).tax_amount).toBe(13);
    expect(checkReceiptAmounts(ocr({ total_amount: 114, tax_amount: 14, tax_lines: split(5, 9) })).tax_amount).toBe(14);
  });

  it("never counts a PST or fuel tax line listed beside the HST", () => {
    const out = checkReceiptAmounts(
      ocr({
        total_amount: 82,
        tax_amount: 16.45,
        tax_lines: [
          { label: "HST", amount: 10.7 },
          { label: "Prov. fuel tax", amount: 5.75 },
        ],
      }),
    );
    expect(out.tax_amount).toBe(10.7);
  });
});

describe("checkReceiptAmounts: more tax than any Canadian rate allows", () => {
  it("drops a tax of 14.4% of the total (the $57.92 receipt, no lines read)", () => {
    const out = checkReceiptAmounts(ocr({ total_amount: 57.92, tax_amount: 8.36 }));
    expect(out.tax_amount).toBeNull();
  });

  it("drops over $15 of tax on an $82 receipt", () => {
    const out = checkReceiptAmounts(ocr({ total_amount: 82, tax_amount: 15.7, subtotal: 66.3 }));
    expect(out.tax_amount).toBeNull();
    expect(out.subtotal).toBeNull();
  });

  it("allows a few cents of rounding on a receipt with many lines", () => {
    const out = checkReceiptAmounts(ocr({ total_amount: 10, tax_amount: 1.33, subtotal: 8.67 }));
    expect(out.tax_amount).toBe(1.33);
  });

  it("keeps a printed subtotal that didn't come from the wrong tax", () => {
    const out = checkReceiptAmounts(ocr({ total_amount: 82, tax_amount: 15.7, subtotal: 71.3 }));
    expect(out.tax_amount).toBeNull();
    expect(out.subtotal).toBe(71.3);
  });

  it("checks against the subtotal when no total was read", () => {
    expect(checkReceiptAmounts(ocr({ subtotal: 50, tax_amount: 7.5 })).tax_amount).toBe(7.5);
    expect(checkReceiptAmounts(ocr({ subtotal: 50, tax_amount: 9 })).tax_amount).toBeNull();
  });

  it("leaves a foreign receipt alone (VAT can be 20% or more)", () => {
    const out = checkReceiptAmounts(ocr({ currency: "EUR", total_amount: 120, tax_amount: 20, subtotal: 100 }));
    expect(out.tax_amount).toBe(20);
  });

  it("takes the ceiling from the HST rate table, not a typed 15%", () => {
    expect(MAX_SALES_TAX_RATE).toBe(Math.max(...HST_RATE_GROUPS.map((g) => g.rate)));
  });
});

describe("checkReceiptAmounts: totals", () => {
  it("swaps a subtotal and total read the wrong way round", () => {
    const out = checkReceiptAmounts(ocr({ total_amount: 71.3, tax_amount: 10.7, subtotal: 82 }));
    expect(out.total_amount).toBe(82);
    expect(out.subtotal).toBe(71.3);
  });

  it("uses subtotal + tax when the total read was the subtotal", () => {
    const out = checkReceiptAmounts(ocr({ total_amount: 45, tax_amount: 6.75, subtotal: 45 }));
    expect(out.total_amount).toBe(51.75);
  });

  it("doesn't raise the total to cover a tax figure it dropped", () => {
    const out = checkReceiptAmounts(ocr({ total_amount: 82, tax_amount: 15.7, subtotal: 82 }));
    expect(out.total_amount).toBe(82);
    expect(out.tax_amount).toBeNull();
  });
});
