/**
 * EVAL (live model): receipt OCR reads what is printed.
 *
 * Synthetic receipts drawn with sharp (fixtures/receipt-images.ts) go
 * through the real extractor (lib/receipts/extract.ts: the pinned fast
 * model, then checkReceiptAmounts). Binary checks per receipt: vendor,
 * date, total, the GST/HST exactly as printed (PST, QST and US sales tax
 * excluded or kept per the rules), and currency.
 *
 * Skips without ANTHROPIC_API_KEY. This is the gate for trying a cheaper
 * fast-tier model on receipts.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { extractReceiptData } from "@/lib/receipts/extract";
import { setAIRunRecorderForTests } from "@/lib/ai/run-ledger";
import { LIVE, LIVE_SKIP_NOTE } from "../fixtures/live";
import { RECEIPTS, receiptPngBase64 } from "../fixtures/receipt-images";

describe.skipIf(!LIVE)(`EVAL live: receipt OCR on ${RECEIPTS.length} synthetic receipts${LIVE_SKIP_NOTE}`, () => {
  beforeAll(() => setAIRunRecorderForTests(() => {}));
  afterAll(() => setAIRunRecorderForTests(null));

  it.each(RECEIPTS)("$name", async (r) => {
    const out = await extractReceiptData(await receiptPngBase64(r), "image/png");
    expect({
      vendor: (out.vendor ?? "").toLowerCase().includes(r.expect.vendorIncludes),
      date: out.expense_date,
      total: out.total_amount,
      currency: (out.currency ?? "").toUpperCase(),
    }).toEqual({ vendor: true, date: r.expect.date, total: r.expect.total, currency: r.expect.currency });
    // CAD: the GST/HST as printed. USD: whatever tax line is printed (no ITC either way).
    expect(out.tax_amount).toBe(r.expect.tax);
  });
});
