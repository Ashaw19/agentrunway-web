/**
 * Normalizes raw OCR extraction into a ReceiptDraft ready for the review form.
 * Applies category suggestion, date defaulting, and safe number formatting.
 */
import { resolveCategory } from "./category-hints";
import type { OcrExtraction, ReceiptDraft } from "@/lib/types/receipt";

/** Format today as YYYY-MM-DD (local timezone) */
function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Safely format a nullable number as a string for controlled inputs */
function numStr(value: number | null | undefined): string {
  if (value == null || isNaN(value)) return "";
  return String(value);
}

/**
 * Validate that a string looks like YYYY-MM-DD and isn't a future date.
 * Returns the date string if valid, or null.
 */
function validateDate(raw: string | null): string | null {
  if (!raw) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const parsed = new Date(raw + "T12:00:00");
  if (isNaN(parsed.getTime())) return null;
  // Reject dates more than 2 days in the future (likely an OCR error)
  const limit = new Date();
  limit.setDate(limit.getDate() + 2);
  if (parsed > limit) return null;
  return raw;
}

/**
 * Turn raw OCR extraction + storage path into a form-ready ReceiptDraft.
 */
export function normalizeExtraction(
  extraction: OcrExtraction,
  receiptPath: string,
): ReceiptDraft {
  const { categoryKey } = resolveCategory(
    extraction.vendor,
    undefined,
    extraction.suggested_category,
    extraction.confidence,
  );

  return {
    vendor:         extraction.vendor?.trim()    ?? "",
    expense_date:   validateDate(extraction.expense_date) ?? todayISO(),
    total_amount:   numStr(extraction.total_amount),
    tax_amount:     numStr(extraction.tax_amount),
    subtotal:       numStr(extraction.subtotal),
    currency:       extraction.currency ?? "CAD",
    category_key:   categoryKey,
    notes:          "",
    receipt_path:   receiptPath,
    ocr_confidence: extraction.confidence,
    ocr_raw:        extraction,
  };
}
