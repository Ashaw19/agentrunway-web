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
  // Home bills (migration 00174). Logged for the full amount; only the home
  // business-use share counts as an expense (expense-totals-engine).
  {
    group: "Home Office",
    items: [
      { key: "home_utilities",         label: "Electricity, Heat & Water" },
      { key: "home_internet",          label: "Home Internet" },
      { key: "home_insurance",         label: "Home Insurance" },
      { key: "home_maintenance",       label: "Repairs & Maintenance" },
      { key: "home_property_tax",      label: "Property Tax" },
      { key: "home_mortgage_interest", label: "Mortgage Interest" },
      { key: "home_rent",              label: "Rent" },
      { key: "home_condo_fees",        label: "Condo Fees" },
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

/** An expense item key above: what `category_key` holds on a receipt or a recurring expense. */
export type ReceiptCategoryKey =
  (typeof RECEIPT_CATEGORY_GROUPS)[number]["items"][number]["key"];

/**
 * Every item key. The one list for anything that has to offer or check a
 * key (the Flight Crew expense tools' enum, an AI-suggested category), so a
 * key that matches no expense item can't be written: such a row is in the
 * dashboard total but in no Expenses row and on no T2125 line.
 */
export const RECEIPT_CATEGORY_KEYS: ReceiptCategoryKey[] =
  RECEIPT_CATEGORY_GROUPS.flatMap((g) => g.items.map((i) => i.key));

const RECEIPT_CATEGORY_FULL_LABELS: Record<string, string> = Object.fromEntries(
  RECEIPT_CATEGORY_GROUPS.flatMap((g) =>
    g.items.map((i) => [i.key, `${g.group}: ${i.label}`]),
  ),
);

/** True for one of the item keys above. */
export function isReceiptCategoryKey(key: unknown): key is ReceiptCategoryKey {
  return typeof key === "string" && key in RECEIPT_CATEGORY_FULL_LABELS;
}

/**
 * "Vehicle: Fuel / Gas" for `vehicle_fuel`. Item labels alone repeat across
 * categories ("Insurance"), so the category is part of it. A key that isn't
 * one of the items above (a custom expense item) comes back as it is.
 */
export function receiptCategoryFullLabel(key: string | null | undefined): string {
  if (!key) return "Uncategorized";
  return RECEIPT_CATEGORY_FULL_LABELS[key] ?? key;
}

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
  /** Not loaded by the receipt list (RECEIPT_LIST_COLUMNS leaves it out). */
  ocr_raw?:       OcrExtraction | null;
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
