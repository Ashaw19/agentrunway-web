/**
 * lib/import/normalizers/normalize-text.ts
 *
 * Pre-processes text-based documents (CSV, plain-text, TXT) before they reach
 * the LLM:
 *
 *   1. Strip blank rows, pure-numeric section dividers, and duplicate header rows.
 *   2. Remove subtotal / summary rows (e.g. "Total", "Grand Total", "Subtotal").
 *   3. Trim the content to the first 20 000 characters by whole rows so the LLM
 *      never receives a mid-row truncation.
 *   4. Classify columns (if the content is tabular) and produce a `prompt_hint`
 *      string that the caller can prepend to the document section of the prompt.
 *   5. Return statistics so the caller can log / debug the cleaning step.
 *
 * Design principles:
 *   • Pure function — no I/O, no DB, no side effects.
 *   • Conservative cleaning — when in doubt, keep the row.  A false-positive
 *     skip is worse than passing a subtotal row to the LLM.
 *   • Works with raw CSV text OR pre-split row arrays (SheetJS output).
 */

import { classifyColumns } from "../heuristics/column-classifier";
import type { ColumnClassification } from "../heuristics/column-classifier";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface NormalizedTextResult {
  /** Cleaned document text, trimmed to ≤ MAX_CHARS by whole row. */
  cleaned_content: string;

  /**
   * Optional hint string to prepend to the LLM prompt column section.
   * Null when no structured column mapping was detected.
   * Example: "[Column mapping detected — tracker format] Name=col0, GCI=col6..."
   */
  column_hints: string | null;

  /** Full classification result, or null for plain-text documents. */
  column_classification: ColumnClassification | null;

  /**
   * The raw header row as parsed, or null when no header row was detected.
   * Used by buildProvenance() in the caller.
   */
  raw_header_row: string[] | null;

  stats: {
    input_rows:   number;
    output_rows:  number;
    rows_removed: number;
    truncated:    boolean;
    input_chars:  number;
    output_chars: number;
  };
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const MAX_CHARS = 20_000;

/**
 * Exact labels that identify a subtotal / summary label cell.
 *
 * Only the first non-empty cell of a row is tested.  The match is EXACT
 * (case-insensitive) — no prefix / substring matching — to avoid matching
 * real client names like "Total Property Group" or addresses like "Summit Ave".
 *
 * A row is only discarded when this label appears in a sparse row (≤ 3
 * non-empty cells).  A real deal row has 4+ populated fields, so it will
 * always survive even if a client happens to be named "Total".
 */
const SUBTOTAL_LABELS = new Set([
  "total", "totals", "grand total", "subtotal", "sub-total",
  "sum", "average", "avg", "count",
  "quarterly total", "q1 total", "q2 total", "q3 total", "q4 total",
  "annual total", "year total",
  "ytd", "year to date",
  "total gci", "total commission", "total net",
]);

/**
 * Maximum number of non-empty cells a row may contain while still being
 * considered a subtotal / heading row.  Deal rows in Canadian agent trackers
 * have at minimum: name, date, GCI — that's 3 fields minimum.
 *
 * Using 3 here means a row must have EXACTLY 1–3 filled cells to be eligible
 * for subtotal filtering.  Any row with 4+ filled cells is presumed to contain
 * deal data and is never filtered, regardless of the first cell's label.
 */
const SUBTOTAL_MAX_POPULATED_CELLS = 3;

/**
 * If a row's first cell matches one of these exactly, skip the row.
 * Used to drop pure section-heading rows that contain no deal data.
 */
const SECTION_HEADINGS = new Set([
  "name", "client", "address", "date", "source", "quarter",
  "q1", "q2", "q3", "q4",
]);

// ─── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Split raw text into rows (handles \r\n, \r, \n).
 *
 * For non-CSV prose this simple split is fine.  For CSV use splitCsvTextToRows
 * instead so that quoted fields containing embedded newlines are not broken.
 */
function splitRows(text: string): string[] {
  return text.split(/\r?\n|\r/);
}

/**
 * Split a raw CSV string into rows in an RFC 4180–aware way.
 *
 * Unlike a plain `text.split(/\n/)`, this respects quoted fields: a newline
 * character that appears inside a `"…"` field is treated as part of the field
 * value, not as a row boundary.  This is required for CSV exports from tools
 * like FUB, IXACT, and Excel that include multi-line address fields.
 *
 * Returns raw row strings (NOT cell-split) so the result can be passed to
 * splitCsvRow for further parsing, or joined back for display.
 */
function splitCsvTextToRows(text: string): string[] {
  const rows: string[] = [];
  let current = "";
  let inQuote = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (ch === '"') {
      // RFC 4180 doubled-quote escape inside a quoted field → literal "
      if (inQuote && text[i + 1] === '"') {
        current += '""';
        i++;
      } else {
        inQuote = !inQuote;
        current += ch;
      }
    } else if ((ch === "\r" || ch === "\n") && !inQuote) {
      // Row boundary — skip \n after \r (CRLF)
      if (ch === "\r" && text[i + 1] === "\n") i++;
      rows.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  // Last row (no trailing newline)
  if (current.length > 0) rows.push(current);
  return rows;
}

/** Split a CSV row respecting quoted fields.
 *
 * Handles two quoting styles found in the wild:
 *   RFC 4180 — doubled-quote escape:  "He said ""hello"""
 *   MySQL / backslash escape:         "He said \"hello\""
 *
 * Both styles are recognized so imports from Excel, MySQL Workbench, and
 * older real-estate software all parse correctly.
 */
export function splitCsvRow(row: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuote = false;
  // RFC 4180: whitespace inside quoted fields is significant. We track
  // whether the cell was quoted so we only trim un-quoted cells; cells
  // that were quoted preserve their internal whitespace verbatim.
  let cellWasQuoted = false;

  const finishCell = () => {
    result.push(cellWasQuoted ? current : current.trim());
    current = "";
    cellWasQuoted = false;
  };

  for (let i = 0; i < row.length; i++) {
    const ch = row[i];

    if (ch === "\\") {
      // Backslash escape (MySQL-style): \" inside a quoted field → literal "
      // Outside a quoted field, treat backslash as a literal character.
      if (inQuote && row[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      if (inQuote && row[i + 1] === '"') {
        // RFC 4180 doubled-quote escape → literal "
        current += '"';
        i++;
      } else {
        inQuote = !inQuote;
        cellWasQuoted = true;
      }
    } else if (ch === "," && !inQuote) {
      finishCell();
    } else {
      current += ch;
    }
  }
  finishCell();
  return result;
}

/** Returns true if EVERY cell in the row is empty or whitespace. */
function isBlankRow(cells: string[]): boolean {
  return cells.every(c => !c || c.trim() === "");
}

/**
 * Returns true for subtotal / summary rows that should be stripped.
 *
 * Two-part guard (BOTH conditions must hold):
 *   1. The first non-empty cell is an exact match to a known subtotal label.
 *   2. The row has ≤ SUBTOTAL_MAX_POPULATED_CELLS non-empty cells.
 *
 * The density check prevents false-positives on real deal rows where the
 * client name happens to match a label (e.g. "Total Property Group").
 * A genuine subtotal row is sparse — it has a label and maybe 1–2 totals.
 * A deal row is dense — it has name, date, address, GCI, etc.
 */
function isSubtotalRow(cells: string[]): boolean {
  const nonEmpty = cells.filter(c => c && c.trim() !== "");
  if (nonEmpty.length > SUBTOTAL_MAX_POPULATED_CELLS) return false; // dense row → keep
  const first = (nonEmpty[0] ?? "").trim().toLowerCase();
  return SUBTOTAL_LABELS.has(first);
}

/**
 * Returns true for pure section-heading rows with no deal data.
 * Only applies when the row is a SINGLE non-empty cell (e.g. "Q1", "Name").
 */
function isSectionHeadingRow(cells: string[]): boolean {
  const nonEmpty = cells.filter(c => c && c.trim() !== "");
  if (nonEmpty.length !== 1) return false;
  return SECTION_HEADINGS.has(nonEmpty[0].trim().toLowerCase());
}

// ─── Main export ────────────────────────────────────────────────────────────────

/**
 * Normalize text-based document content for LLM extraction.
 *
 * Accepts either:
 *   • A raw multi-line string (CSV text, .txt, paste)
 *   • A 2-D string array already parsed by SheetJS / CSV parser
 *
 * @param input       Raw text or pre-parsed row array.
 * @param isCsv       When true, splits text into CSV cells for column
 *                    classification. Set false for plain prose / narrative.
 */
export function normalizeTextDocument(
  input: string | string[][],
  isCsv = true,
): NormalizedTextResult {
  // ── 1. Convert to row array ─────────────────────────────────────────────
  let rawRows: string[];
  let cellRows: string[][] | null = null;

  if (Array.isArray(input)) {
    // Already split by SheetJS
    cellRows = input as string[][];
    rawRows  = cellRows.map(row => row.join(","));
  } else {
    // Use the quote-aware splitter for CSV so embedded newlines in quoted
    // fields are preserved within a single row rather than broken into two.
    rawRows = isCsv ? splitCsvTextToRows(input) : splitRows(input);
    if (isCsv) {
      cellRows = rawRows.map(splitCsvRow);
    }
  }

  const inputRowCount = rawRows.length;

  // ── 2. Clean rows ───────────────────────────────────────────────────────
  const keptRawRows:  string[]   = [];
  const keptCellRows: string[][] = [];

  // Track whether we've seen the header row so we can deduplicate it
  let headerRowIndex = -1;
  let headerSignature = "";

  if (cellRows) {
    for (let i = 0; i < cellRows.length; i++) {
      const cells  = cellRows[i];
      const raw    = rawRows[i] ?? cells.join(",");

      if (isBlankRow(cells))          continue;
      if (isSubtotalRow(cells))        continue;
      if (isSectionHeadingRow(cells))  continue;

      // Deduplicate header rows: if a row looks identical to the already-kept
      // header, skip it (some exports repeat headers at page breaks).
      // Trim trailing empty cells before comparing so Excel exports with
      // extra trailing commas still deduplicate correctly.
      const sig = cells.map(c => c.trim().toLowerCase()).filter((_, i, arr) => {
        // Keep all cells, but strip trailing empty cells for the signature
        const lastNonEmpty = arr.reduce((last, v, idx) => v !== "" ? idx : last, -1);
        return i <= lastNonEmpty;
      }).join("|");
      if (headerRowIndex !== -1 && sig === headerSignature) continue;

      keptRawRows.push(raw);
      keptCellRows.push(cells);

      // The first non-blank row is treated as the potential header — we record
      // its signature but let classifyColumns() decide whether it's a real header.
      if (keptRawRows.length === 1) {
        headerRowIndex  = i;
        headerSignature = sig;
      }
    }
  } else {
    // Prose / narrative — only strip blank lines
    for (const row of rawRows) {
      if (row.trim() !== "") keptRawRows.push(row);
    }
  }

  // ── 3. Classify columns (tabular only) ──────────────────────────────────
  let classification: ColumnClassification | null = null;
  let rawHeaderRow:   string[] | null             = null;
  let columnHints:    string | null               = null;

  if (cellRows && keptCellRows.length > 0) {
    classification = classifyColumns(keptCellRows, 5);
    if (classification) {
      rawHeaderRow = keptCellRows[classification.header_row_index];
      columnHints  = classification.prompt_hint || null;
    }
  }

  // ── 4. Trim to MAX_CHARS by whole rows ──────────────────────────────────
  let charCount = 0;
  let truncated = false;
  const outputRows: string[] = [];

  for (const row of keptRawRows) {
    if (charCount + row.length + 1 > MAX_CHARS) {
      truncated = true;
      break;
    }
    outputRows.push(row);
    charCount += row.length + 1; // +1 for newline
  }

  // ── 5. Normalize French/European number formats ─────────────────────────
  // French-Canadian formats: "9 750,00 $" or "325 000 $"
  // Convert to standard: "9750.00" or "325000"
  // Pattern: digits with spaces as thousands separators, comma as decimal, optional trailing $
  const normalizedRows = outputRows.map((row) =>
    row.replace(
      /(\d{1,3}(?:\s\d{3})+)(?:,(\d{2}))?\s*\$/g,
      (_match, intPart: string, decimals: string | undefined) => {
        const cleaned = intPart.replace(/\s/g, "");
        return decimals ? `$${cleaned}.${decimals}` : `$${cleaned}`;
      },
    ),
  );

  const cleaned_content = normalizedRows.join("\n");

  return {
    cleaned_content,
    column_hints:          columnHints,
    column_classification: classification,
    raw_header_row:        rawHeaderRow,
    stats: {
      input_rows:   inputRowCount,
      output_rows:  outputRows.length,
      rows_removed: inputRowCount - outputRows.length,
      truncated,
      input_chars:  rawRows.reduce((s, r) => s + r.length + 1, 0),
      output_chars: charCount,
    },
  };
}
