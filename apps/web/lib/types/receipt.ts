/**
 * Types for the receipt capture feature.
 */

/**
 * Hierarchical category groups — each item key matches an expense_items.key
 * in the DB so that saving a receipt can directly increment ytd_amount.
 */
export const RECEIPT_CATEGORY_GROUPS = [
  {
    group: "Vehicle",
    items: [
      { key: "vehicle_fuel",      label: "Fuel / Gas" },
      { key: "vehicle_service",   label: "Service & Repairs" },
      { key: "vehicle_insurance", label: "Insurance" },
      { key: "vehicle_payment",   label: "Vehicle Payment" },
    ],
  },
  {
    group: "Marketing",
    items: [
      { key: "marketing_ads",         label: "Ads (Meta/Google)" },
      { key: "marketing_photography", label: "Photography & Video" },
      { key: "marketing_print",       label: "Print (Signs, Flyers)" },
      { key: "marketing_gifts",       label: "Client Gifts" },
    ],
  },
  {
    group: "Office & Tech",
    items: [
      { key: "office_supplies", label: "Office Supplies" },
      { key: "office_software", label: "Software Subscriptions" },
      { key: "office_phone",    label: "Phone & Internet" },
      { key: "office_hardware", label: "Hardware & Equipment" },
    ],
  },
  {
    group: "Professional Fees",
    items: [
      { key: "prof_board_mls",  label: "Board / MLS Dues" },
      { key: "prof_licensing",  label: "Licensing & Renewals" },
      { key: "prof_eo",         label: "E&O Insurance" },
      { key: "prof_accounting", label: "Accounting & Bookkeeping" },
    ],
  },
  {
    group: "Education",
    items: [
      { key: "edu_courses",     label: "Courses & Coaching" },
      { key: "edu_conferences", label: "Conferences" },
      { key: "edu_books",       label: "Books & Materials" },
    ],
  },
  {
    group: "Meals",
    items: [
      { key: "meals_client", label: "Client Meals" },
      { key: "meals_team",   label: "Team Meals" },
    ],
  },
  {
    group: "Entertainment",
    items: [
      { key: "ent_client", label: "Client Entertainment" },
      { key: "ent_events", label: "Events & Tickets" },
    ],
  },
  {
    group: "Other",
    items: [
      { key: "other_misc", label: "Miscellaneous" },
    ],
  },
] as const;

/** Flat list of all sub-categories (for selects, validation, etc.) */
export const RECEIPT_CATEGORIES: Array<{ key: string; label: string }> =
  RECEIPT_CATEGORY_GROUPS.flatMap((g) => [...g.items]);

export type CategoryKey = string;

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
  ocrError?:   string;           // Set when OCR failed — extraction is blank, user fills manually
}

export interface ProcessReceiptError {
  ok:      false;
  error:   string;
}
