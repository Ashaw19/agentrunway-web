/**
 * Checks on the amounts the OCR model read off a receipt, before anything is
 * saved or shown in the review form.
 *
 * The GST/HST on a receipt is the figure printed on it. When the model's
 * reading can't be right (a split HST whose two parts don't fit any rate, or
 * more tax than any Canadian rate allows), it is dropped for the agent to
 * type in, never replaced by a figure worked out from a rate.
 */
import { GST_RATE_GROUP, HST_RATE_GROUPS } from "@agent-runway/core/tax-copy/cra-rules";
import type { OcrExtraction, OcrTaxLine } from "@/lib/types/receipt";

/** The highest GST/HST rate in any province. */
export const MAX_SALES_TAX_RATE = Math.max(...HST_RATE_GROUPS.map((g) => g.rate));

/**
 * HST(P) ÷ HST(F) in each HST province: the provincial part of the rate over
 * the 5% federal part (2 at 15%, 1.8 at 14%, 1.6 at 13%).
 */
const PROVINCIAL_TO_FEDERAL = HST_RATE_GROUPS.map((g) => (g.rate - GST_RATE_GROUP.rate) / GST_RATE_GROUP.rate);

/** A GST/HST line's label: "HST", "HST(F)", "GST 5%", "H.S.T.", French "TPS"/"TVH". */
const GST_HST_LABEL = /H\.?S\.?T|G\.?S\.?T|\bTPS\b|\bTVH\b/i;

/** Rounding tax line by line on a long receipt can add a few cents. */
const ROUNDING_ALLOWANCE = 0.05;

/** HST(F) and HST(P) are each rounded to the cent. */
const SPLIT_ROUNDING = 0.02;

/** Confidence shown on a receipt whose tax has to be typed in. */
const TAX_DROPPED_CONFIDENCE = 0.6;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Atlantic gas receipts print the HST in two parts, "HST(F) $2.52" (federal)
 * and "HST(P) $5.04" (provincial). Two parts that fit no HST rate mean a digit
 * was misread. Null when the receipt doesn't print the split.
 */
function splitHstFits(lines: OcrTaxLine[]): boolean | null {
  const federal = lines.filter((l) => /\(F\)|\bFED/i.test(l.label));
  const provincial = lines.filter((l) => /\(P\)|\bPROV/i.test(l.label));
  if (federal.length !== 1 || provincial.length !== 1) return null;
  const f = federal[0].amount;
  const p = provincial[0].amount;
  return PROVINCIAL_TO_FEDERAL.some((k) => Math.abs(p - k * f) <= SPLIT_ROUNDING);
}

/**
 * The most sales tax a Canadian receipt with these amounts can carry: the
 * rate on the subtotal, or the tax-included share of the total, whichever is
 * more. (A total read as the subtotal still allows the tax on the subtotal,
 * and the total check below then adds it.)
 */
function maxSalesTax(total: number | null, subtotal: number | null): number | null {
  const fromTotal = total != null && total > 0 ? (total * MAX_SALES_TAX_RATE) / (1 + MAX_SALES_TAX_RATE) : null;
  const fromSubtotal = subtotal != null && subtotal > 0 ? subtotal * MAX_SALES_TAX_RATE : null;
  if (fromTotal == null) return fromSubtotal;
  if (fromSubtotal == null) return fromTotal;
  return Math.max(fromTotal, fromSubtotal);
}

function dropTax(x: OcrExtraction, why: string): OcrExtraction {
  console.warn(`[receipt/extract] Tax ${x.tax_amount} not saved: ${why}. Left blank for the agent to type in.`);
  // A subtotal equal to total minus that figure came from the same misread.
  const subtotalFromSameMisread =
    x.subtotal != null &&
    x.tax_amount != null &&
    x.total_amount != null &&
    Math.abs(x.subtotal + x.tax_amount - x.total_amount) < 0.05;
  return {
    ...x,
    tax_amount: null,
    subtotal: subtotalFromSameMisread ? null : x.subtotal,
    confidence: Math.min(x.confidence, TAX_DROPPED_CONFIDENCE),
  };
}

function checkTax(x: OcrExtraction): OcrExtraction {
  let out = x;
  // Only GST/HST lines count: never PST, QST or a fuel tax listed beside them.
  const lines = (x.tax_lines ?? []).filter((l) => GST_HST_LABEL.test(l.label));
  if (lines.length > 0) {
    if (splitHstFits(lines) === false) {
      return dropTax(x, `HST(F) and HST(P) don't fit any HST rate (${lines.map((l) => `${l.label} ${l.amount}`).join(", ")})`);
    }
    // The lines are what's printed; the model's own sum of them can slip.
    const sum = round2(lines.reduce((s, l) => s + l.amount, 0));
    if (sum !== x.tax_amount) {
      console.warn(`[receipt/extract] Tax ${x.tax_amount} replaced by the sum of the tax lines read, ${sum}`);
      out = { ...x, tax_amount: sum };
    }
  }

  if (out.tax_amount == null || out.tax_amount <= 0) return out;
  // Foreign VAT can be 20% or more, and is no input tax credit anyway.
  if (out.currency && out.currency.toUpperCase() !== "CAD") return out;
  const max = maxSalesTax(out.total_amount, out.subtotal);
  if (max != null && out.tax_amount > max + ROUNDING_ALLOWANCE) {
    return dropTax(out, `more than ${Math.round(MAX_SALES_TAX_RATE * 100)}% HST allows (max ${round2(max)})`);
  }
  return out;
}

export function checkReceiptAmounts(extraction: OcrExtraction): OcrExtraction {
  const result = { ...extraction };

  // If subtotal is greater than total, they're likely swapped
  if (result.subtotal != null && result.total_amount != null && result.subtotal > result.total_amount) {
    console.warn(`[receipt/extract] Swapped subtotal/total (subtotal ${result.subtotal} > total ${result.total_amount})`);
    const tmp = result.total_amount;
    result.total_amount = result.subtotal;
    result.subtotal = tmp;
  }

  // Before the total check below, so a wrong tax can't raise the total.
  const checked = checkTax(result);

  // If tax + subtotal exist and roughly equal total, trust them; if total is way off, recalculate
  if (checked.subtotal != null && checked.tax_amount != null && checked.total_amount != null) {
    const expectedTotal = round2(checked.subtotal + checked.tax_amount);
    const diff = Math.abs(expectedTotal - checked.total_amount);
    if (diff > 0.5 && diff > checked.total_amount * 0.1) {
      console.warn(`[receipt/extract] Total mismatch: subtotal(${checked.subtotal}) + tax(${checked.tax_amount}) = ${expectedTotal}, but total=${checked.total_amount}. Using higher value.`);
      // Use the higher of the two as total (line item vs real total)
      checked.total_amount = Math.max(checked.total_amount, expectedTotal);
    }
  }

  return checked;
}
