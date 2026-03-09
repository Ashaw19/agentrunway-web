/**
 * Types for the receipt capture feature.
 */

/** Category keys that match expense_categories.key in the DB */
export const RECEIPT_CATEGORIES = [
  { key: "vehicle",       label: "Vehicle" },
  { key: "marketing",     label: "Marketing" },
  { key: "office_tech",   label: "Office & Tech" },
  { key: "professional",  label: "Professional Fees" },
  { key: "education",     label: "Education" },
  { key: "meals",         label: "Meals" },
  { key: "entertainment", label: "Entertainment" },
  { key: "other",         label: "Other" },
] as const;

export type CategoryKey = (typeof RECEIPT_CATEGORIES)[number]["key"];

/** Raw fields returned by the Groq OCR extraction */
export interface OcrExtraction {
  vendor:               string | null;
  expense_date:         string | null;   // YYYY-MM-DD or null
  total_amount:         number | null;
  tax_amount:           number | null;
  subtotal:             number | null;
  currency:             string;          // ISO-4217, default "CAD"
  suggested_category:   string | null;   // one of RECEIPT_CATEGORIES[].key or null
  confidence:           number;          // 0.0–1.0
}

/** Normalized draft ready for the review form */
export interface ReceiptDraft {
  vendor:             string;
  expense_date:       string;    // YYYY-MM-DD (defaults to today)
  total_amount:       string;    // string for controlled input
  tax_amount:         string;
  subtotal:           string;
  currency:           string;
  category_key:       string;
  notes:              string;
  // Metadata — not shown in form but carried through to save
  receipt_path:       string;
  ocr_confidence:     number;
  ocr_raw:            OcrExtraction;
}

/** Row shape of receipt_expenses as stored in Supabase */
export interface ReceiptExpense {
  id:             string;
  user_id:        string;
  vendor:         string | null;
  expense_date:   string | null;
  total_amount:   number | null;
  tax_amount:     number | null;
  subtotal:       number | null;
  currency:       string;
  category_key:   string | null;
  notes:          string | null;
  receipt_path:   string | null;
  ocr_confidence: number | null;
  ocr_raw:        OcrExtraction | null;
  created_at:     string;
  updated_at:     string;
}

/** Payload returned by POST /api/receipts/process */
export interface ProcessReceiptResponse {
  ok:          true;
  path:        string;           // Supabase Storage path
  extraction:  OcrExtraction;
}

export interface ProcessReceiptError {
  ok:      false;
  error:   string;
}
