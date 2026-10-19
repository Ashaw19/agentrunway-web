/**
 * EVAL: receipt amount checks (lib/receipts/check-amounts.ts).
 *
 * What the OCR model read off a receipt is checked before anything is saved.
 * Binary checks on synthetic readings (made-up vendors and amounts):
 *   - the GST/HST is the figure printed on the receipt, never one worked out
 *     from a rate: a reading that can't be right is dropped (left blank for
 *     the agent), never replaced by a computed figure;
 *   - only GST/HST lines count (PST, QST and fuel taxes don't);
 *   - Atlantic split HST (HST(F) + HST(P)) must fit an HST rate;
 *   - a swapped subtotal/total is put back; a foreign receipt keeps its tax.
 */
import { describe, expect, it, vi } from "vitest";
import { checkReceiptAmounts, MAX_SALES_TAX_RATE } from "@/lib/receipts/check-amounts";
import { HST_RATE_GROUPS } from "@agent-runway/core/tax-copy/cra-rules";
import type { OcrExtraction } from "@/lib/types/receipt";

vi.spyOn(console, "warn").mockImplementation(() => {});

function reading(over: Partial<OcrExtraction>): OcrExtraction {
  return {
    vendor: "Example Gas",
    expense_date: "2026-10-14",
    total_amount: null,
    tax_amount: null,
    tax_lines: null,
    subtotal: null,
    currency: "CAD",
    suggested_category: "vehicle_fuel",
    confidence: 0.95,
    ...over,
  };
}

interface Case {
  name: string;
  in: Partial<OcrExtraction>;
  expect: Partial<OcrExtraction>;
}

const CASES: Case[] = [
  {
    name: "NB gas receipt, split HST at 15% (F 2.52, P 5.04): kept as printed",
    in: { subtotal: 50.43, total_amount: 57.99, tax_amount: 7.56, tax_lines: [{ label: "HST(F)", amount: 2.52 }, { label: "HST(P)", amount: 5.04 }] },
    expect: { tax_amount: 7.56, total_amount: 57.99, subtotal: 50.43 },
  },
  {
    name: "split HST with a misread digit (P 5.40): tax dropped for the agent to type, never recomputed",
    in: { subtotal: 50.07, total_amount: 57.99, tax_amount: 7.92, tax_lines: [{ label: "HST(F)", amount: 2.52 }, { label: "HST(P)", amount: 5.4 }] },
    expect: { tax_amount: null },
  },
  {
    name: "ON split HST at 13% (F 5.00, P 8.00): kept",
    in: { subtotal: 100, total_amount: 113, tax_amount: 13, tax_lines: [{ label: "HST FED", amount: 5 }, { label: "HST PROV", amount: 8 }] },
    expect: { tax_amount: 13 },
  },
  {
    name: "NS split HST at 14% (F 5.00, P 9.00): kept",
    in: { subtotal: 100, total_amount: 114, tax_amount: 14, tax_lines: [{ label: "HST(F)", amount: 5 }, { label: "HST(P)", amount: 9 }] },
    expect: { tax_amount: 14 },
  },
  {
    name: "tax over the highest Canadian rate: dropped",
    in: { subtotal: 40, total_amount: 50, tax_amount: 10 },
    expect: { tax_amount: null },
  },
  {
    name: "BC receipt: GST counts, PST doesn't",
    in: { subtotal: 40, total_amount: 44.8, tax_amount: 4.8, tax_lines: [{ label: "GST 5%", amount: 2 }, { label: "PST 7%", amount: 2.8 }] },
    expect: { tax_amount: 2 },
  },
  {
    name: "QC receipt: TPS counts, TVQ doesn't",
    in: { subtotal: 100, total_amount: 114.98, tax_amount: 14.98, tax_lines: [{ label: "TPS", amount: 5 }, { label: "TVQ", amount: 9.98 }] },
    expect: { tax_amount: 5 },
  },
  {
    name: "the model's own sum of the tax lines slipped: the printed lines win",
    in: { subtotal: 88.5, total_amount: 100.01, tax_amount: 11.15, tax_lines: [{ label: "HST", amount: 11.51 }] },
    expect: { tax_amount: 11.51 },
  },
  {
    name: "subtotal and total read the wrong way round: swapped back",
    in: { subtotal: 114.98, total_amount: 99.99, tax_amount: 14.99 },
    expect: { subtotal: 99.99, total_amount: 114.98 },
  },
  {
    name: "a US receipt keeps its tax, whatever the rate",
    in: { vendor: "Example Store Inc.", currency: "USD", subtotal: 40, total_amount: 50, tax_amount: 10 },
    expect: { tax_amount: 10 },
  },
  {
    name: "no tax printed: stays blank, never worked out from the province rate",
    in: { subtotal: null, total_amount: 57.99, tax_amount: null },
    expect: { tax_amount: null, total_amount: 57.99 },
  },
  {
    name: "a believable single HST line: kept",
    in: { subtotal: 12.39, total_amount: 14.25, tax_amount: 1.86, tax_lines: [{ label: "H.S.T.", amount: 1.86 }] },
    expect: { tax_amount: 1.86 },
  },
];

describe("EVAL receipts: amount checks", () => {
  it.each(CASES)("$name", (c) => {
    const out = checkReceiptAmounts(reading(c.in));
    expect(out).toMatchObject(c.expect);
    if (c.expect.tax_amount === null && c.in.tax_amount != null) {
      // A dropped tax lowers the confidence shown, so the review form flags it.
      expect(out.confidence).toBeLessThanOrEqual(0.6);
    }
  });

  it("the highest rate it allows is the highest HST rate in Canada (15%)", () => {
    expect(MAX_SALES_TAX_RATE).toBe(Math.max(...HST_RATE_GROUPS.map((g) => g.rate)));
    expect(MAX_SALES_TAX_RATE).toBe(0.15);
  });
});
