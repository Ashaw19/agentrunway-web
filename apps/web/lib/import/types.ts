/**
 * lib/import/types.ts
 *
 * Enriched type contract for the import/extraction pipeline.
 * These types are ADDITIVE — existing ExtractedDeal in route.ts is extended
 * with optional fields so no existing code breaks.
 *
 * ─── FIELD SEMANTICS (keep consistent across prompts, validators, UI) ─────────
 *
 *   gci               = Gross Commission Income — PRE-SPLIT amount the agent's side
 *                       earned BEFORE the brokerage takes their cut.
 *                       • Format A tracker:    "GCI" column
 *                       • Format B brokerage:  "Gross Commission" or "Commission" column
 *                       • Format C narrative:  labeled "GCI" or "Commission"
 *
 *   net_income        = POST-split amount the agent actually receives after the
 *                       brokerage deduction.
 *                       • Format A tracker:    "Net Commission" column
 *                       • Format B brokerage:  "Net Commission (Taxable)" / "Agent Net"
 *                       • Format C narrative:  labeled "Net" or "after split"
 *
 *   sale_price        = Property transaction price.
 *                       NEVER use 0 as a placeholder — use null.
 *
 *   commission_percent = Commission rate as a decimal (0.03 = 3%, not 3).
 *                        null if not determinable from the document.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Four-level confidence for a single extracted field. */
export type ConfidenceLevel = "high" | "medium" | "low" | "missing";

/**
 * Evidence quotes for each extracted field.
 *
 * Required for any non-null value that came from the LLM.
 * Contains the verbatim text fragment from the source document that produced
 * the value — so the user (and developer) can verify it.
 * null = the value came from deterministic parsing (no evidence needed).
 */
export interface ExtractionEvidence {
  gci:                string | null;
  sale_price:         string | null;
  net_income:         string | null;
  commission_percent: string | null;
  address:            string | null;
  date:               string | null;
  names:              string | null;
}

/**
 * Per-field confidence covering the new enriched field set.
 * Extends the existing confidence shape in ExtractedDeal.
 */
export interface EnrichedConfidence {
  gci:                ConfidenceLevel;
  sale_price:         ConfidenceLevel;
  names:              ConfidenceLevel;
  date:               ConfidenceLevel;
  address:            ConfidenceLevel;
  commission_percent: ConfidenceLevel;
  net_income:         ConfidenceLevel;
}

/**
 * One page of text extracted from a PDF.
 * Preserves page boundaries so multi-page documents aren't collapsed
 * into an undifferentiated blob.
 */
export interface NormalizedPage {
  page_number: number;
  /** Raw text from the text layer, or empty string if page was scanned. */
  text:        string;
  /** True when the text layer had <200 non-whitespace characters — signals
   *  that this page needs image OCR, not text extraction. */
  is_empty:    boolean;
}

/**
 * Intermediate structure produced by type-specific normalizers.
 * Created BEFORE the LLM sees the document, so the LLM receives
 * structured input rather than raw bytes.
 */
export interface NormalizedDocument {
  /** How the content was obtained */
  source_type: "text_layer" | "ocr_image" | "spreadsheet" | "plain_text";
  pages:       NormalizedPage[];
  /** All page texts joined with page-break markers. Truncated at 20 000 chars. */
  full_text:   string;
  /** Base64-encoded images for pages that had no usable text layer.
   *  Only present when source_type is "ocr_image". */
  images?: Array<{ base64: string; mimeType: string; page: number }>;
  metadata: {
    year_hint?:   number;
    page_count?:  number;
    sheet_name?:  string;
    file_name?:   string;
  };
}

/**
 * Parser provenance for each extracted field.
 *
 * Used when a value was produced by deterministic parsing (not LLM/OCR).
 * Distinguishes from ExtractionEvidence, which holds verbatim LLM source text.
 *
 * Examples:
 *   "Parsed from column: GCI (col 6)"
 *   "Parsed from row 14, column Net Commission"
 *   "Inferred from column header: Buy | Sell"
 */
export interface ExtractionProvenance {
  gci?:                string | null;
  sale_price?:         string | null;
  net_income?:         string | null;
  commission_percent?: string | null;
  names?:              string | null;
  date?:               string | null;
  address?:            string | null;
}

/**
 * Overall quality signal for one import run.
 *   "good"         — high confidence, no structural issues
 *   "partial"      — some fields missing, truncated, or >25% deals flagged
 *   "needs_review" — zero deals, or >50% of GCI values low/missing confidence
 */
export type ExtractionQuality = "good" | "partial" | "needs_review";

/**
 * Diagnostic snapshot produced server-side for each import run.
 * Only populated in non-production environments.
 */
export interface ImportDebug {
  /** Which execution path handled this document. */
  import_path: "text-llm" | "vision-single" | "vision-multi";
  /** True when normalizeTextDocument() ran before LLM extraction. */
  normalization_ran: boolean;
  /** Document subtype detected by column classifier, or null. */
  column_subtype: "tracker" | "brokerage" | "generic" | null;
  /** True when column hints were injected into the LLM prompt. */
  column_hints_injected: boolean;
  /** True when the document was trimmed to the 20k char limit. */
  truncated: boolean;
  rows_input: number;
  rows_kept: number;
  deals_extracted: number;
  deals_with_issues: number;
  /** Count of deals where each field is non-null. */
  field_presence: {
    gci:                number;
    net_income:         number;
    sale_price:         number;
    commission_percent: number;
    address:            number;
    date:               number;
    names:              number;
  };
  /** Most-frequent validation issue messages and their counts. */
  top_issues: Array<{ message: string; count: number }>;
}

/**
 * Structured debug entry for one extracted field.
 * Returned alongside the import result so developers (and future UIs) can
 * understand why a field was extracted, scored, or flagged the way it was.
 */
export interface ExtractionLogEntry {
  deal_index:  number;
  field:       keyof ExtractionEvidence;
  /** Where the value came from */
  source:      "heuristic" | "llm" | "user_default" | "computed";
  raw_value:   string | null;
  final_value: string | number | null;
  confidence:  ConfidenceLevel;
  evidence:    string | null;
  issues:      string[];
}
