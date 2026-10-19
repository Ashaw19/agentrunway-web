/**
 * Types for the receipt capture feature.
 */

/**
 * The expense item keys live in packages/core/lib/expense-items.ts (the MCP
 * server and the statement import's database check use the same list).
 */
export {
  RECEIPT_CATEGORY_GROUPS,
  RECEIPT_CATEGORIES,
  RECEIPT_CATEGORY_KEYS,
  isReceiptCategoryKey,
  receiptCategoryFullLabel,
  type ReceiptCategoryKey,
} from "@agent-runway/core/lib/expense-items";

export type CategoryKey = string;

/** Raw fields returned by the Groq OCR extraction */
/** One GST/HST line as printed on a receipt, e.g. { label: "HST(F)", amount: 2.52 }. */
export interface OcrTaxLine {
  label:  string;
  amount: number;
}

export interface OcrExtraction {
  vendor:               string | null;
  expense_date:         string | null;   // YYYY-MM-DD or null
  total_amount:         number | null;
  tax_amount:           number | null;   // GST/HST only
  tax_lines?:           OcrTaxLine[] | null;
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
  /** Not loaded by the receipt list (RECEIPT_LIST_COLUMNS leaves it out). */
  ocr_raw?:       OcrExtraction | null;
  /** 'statement_import' when added from a statement line (migration 00185); null otherwise. */
  source?:        "statement_import" | null;
  /** The statement line this expense is reconciled with (added from it, or matched to it). */
  statement_line_id?: string | null;
  created_at:     string;
  updated_at:     string;
}

/** Payload returned by POST /api/receipts/process */
export interface ProcessReceiptResponse {
  ok:          true;
  path:        string;           // Supabase Storage path
  extraction:  OcrExtraction;
  ocrError?:   string;           // Set when OCR failed — extraction is blank, user fills manually
}

export interface ProcessReceiptError {
  ok:      false;
  error:   string;
}
