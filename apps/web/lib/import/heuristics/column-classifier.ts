/**
 * lib/import/heuristics/column-classifier.ts
 *
 * Scans CSV/spreadsheet header rows and returns best-guess column indices
 * for all target fields, plus a `prompt_hint` string to inject into the LLM
 * prompt and a `buildProvenance()` helper for deterministic-parse tooltips.
 *
 * Design principles:
 *   • Pure function — no side effects, no I/O, deterministic given the same input.
 *   • Conservative matching — keyword lists err on the side of specificity to
 *     avoid false positives on unrelated columns.
 *   • Returns null (not throws) when the header row cannot be found so callers
 *     can safely fall through to unassisted LLM extraction.
 *   • Does NOT read or write the database.
 */

import type { ExtractionProvenance } from "../types";

// ─── Types ────────────────────────────────────────────────────────────────────

/** Column indices for target fields.  -1 = not found. */
export interface ColumnClassification {
  /** Index of the client name column. */
  name:               number;
  /** Index of the property address column. */
  address:            number;
  /** Index of the closing / payment date column. */
  date:               number;
  /** Index of the Buy | Sell / side column. */
  side:               number;
  /** Index of the lead source column. */
  source:             number;
  /** Index of the GCI (pre-split gross commission) column. */
  gci:                number;
  /** Index of the net income (post-split) column. */
  net_income:         number;
  /** Index of the sale price column. */
  sale_price:         number;
  /** Index of the commission percentage column. */
  commission_percent: number;

  /** Row index (0-based) within the input array where the header was found. */
  header_row_index: number;

  /**
   * Human-readable hint string ready to inject into the LLM prompt.
   * Example: "Column mapping: Name=0, Address=1, Date=2, GCI=6, Net Commission=7"
   */
  prompt_hint: string;

  /**
   * Detected document sub-type based on column pattern.
   *   "tracker"  — agent's own deal tracker (Name, GCI, Net Commission, Buy|Sell)
   *   "brokerage" — brokerage commission report (party_a / party_b names, Gross Commission)
   *   "generic"  — structured table not matching tracker or brokerage pattern
   */
  document_subtype: "tracker" | "brokerage" | "generic";
}

// ─── Keyword dictionaries ─────────────────────────────────────────────────────

/** Keywords that identify each target column.  Lower-case, trimmed. */
const KEYWORDS: Record<keyof Omit<ColumnClassification, "header_row_index" | "prompt_hint" | "document_subtype">, string[]> = {
  name: [
    "name", "client", "client name", "buyer", "buyer name", "seller", "seller name",
    "party", "contact", "customer", "buyer/seller", "buyer / seller",
    "commissions earned",
  ],
  address: [
    "address", "property", "property address", "street", "location", "civic",
    "unit", "suite", "civic address", "trade#",
  ],
  date: [
    "date", "close date", "closing date", "closed", "close", "payment date",
    "paid", "settled", "possession", "completion", "transaction date",
    "firm date", "settlement date", "entry date",
  ],
  side: [
    "buy", "sell", "buy | sell", "buy/sell", "side", "role", "type", "transaction type",
    "rep", "representation",
  ],
  source: [
    "source", "lead source", "referral", "origin", "lead",
  ],
  gci: [
    "gci", "gross commission income", "gross commission", "commission income",
    "co-op", "co-op commission", "coop", "coop commission", "gross", "commission",
    "agent commission", "your gross", "pre-split", "gross earnings", "agent base",
    "your commission", "your comm",
  ],
  net_income: [
    "net", "net commission", "net income", "net commission income",
    "net commission (taxable)", "taxable", "agent net", "your net",
    "net amount", "commission earned", "after split", "post-split",
    "net earnings", "net pay", "net commissions earned", "net to agent",
  ],
  sale_price: [
    "sale price", "price", "purchase price", "sold price", "list price",
    "transaction amount", "amount", "volume", "value", "consideration",
    "selling price",
  ],
  commission_percent: [
    "%", "rate", "commission %", "commission rate", "commission pct",
    "pct", "percent", "percentage",
  ],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalize(cell: string): string {
  return cell.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Score a header cell against a keyword list.
 * Returns 2 for an exact match, 1 for a forward substring match (header contains
 * keyword), 0 for no match.
 *
 * The reverse direction (keyword contains header) is intentionally excluded:
 * short header strings like "id", "age", or "or" would match unrelated keyword
 * lists as substrings (e.g. "age" ⊂ "percentage", "id" ⊂ "paid"). All
 * meaningful short headers ("net", "gci", "date", "%") are already present as
 * exact keywords in their respective lists.
 */
function scoreCell(cell: string, keywords: string[]): number {
  const n = normalize(cell);
  for (const kw of keywords) {
    if (n === kw) return 2;
  }
  for (const kw of keywords) {
    if (n.includes(kw)) return 1;
  }
  return 0;
}

/**
 * Find the best-scoring column index for a keyword group.
 * Returns -1 if no column scores > 0.
 * When two columns tie, the leftmost wins.
 */
function findBestColumn(
  headers: string[],
  keywords: string[],
  taken: Set<number>,
): number {
  let bestIdx   = -1;
  let bestScore = 0;

  for (let i = 0; i < headers.length; i++) {
    if (taken.has(i)) continue;
    const score = scoreCell(headers[i], keywords);
    if (score > bestScore) {
      bestScore = score;
      bestIdx   = i;
    }
  }
  return bestIdx;
}

/**
 * Detect the header row index within the first `maxHeaderRows` rows.
 * We look for the row with the most recognized column keywords.
 * Returns -1 if no candidate row found.
 */
function detectHeaderRow(rows: string[][], maxHeaderRows: number): number {
  let bestRow   = -1;
  let bestScore = 0;

  const allKeywords = Object.values(KEYWORDS).flat();

  for (let r = 0; r < Math.min(maxHeaderRows, rows.length); r++) {
    const row   = rows[r];
    let   score = 0;
    for (const cell of row) {
      const n = normalize(cell);
      if (allKeywords.some(kw => n === kw || n.includes(kw))) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestRow   = r;
    }
  }

  // Require at least 2 recognized columns to consider a row a valid header
  return bestScore >= 2 ? bestRow : -1;
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Scan the first `maxHeaderRows` rows to find a header row, then map each
 * target field to its best-matching column index.
 *
 * @param rows         2-D array of string cells (from SheetJS or CSV parse).
 * @param maxHeaderRows How many rows to consider as potential headers (default 5).
 * @returns `ColumnClassification` on success, `null` if no header row found.
 */
export function classifyColumns(
  rows: string[][],
  maxHeaderRows = 5,
): ColumnClassification | null {
  const headerRowIndex = detectHeaderRow(rows, maxHeaderRows);
  if (headerRowIndex === -1) return null;

  const headers = rows[headerRowIndex].map(h => h ?? "");

  // Assign columns greedily in priority order, tracking already-claimed indices.
  // Priority: gci > net_income > name > date > address > side > source > sale_price > commission_percent
  const taken = new Set<number>();

  function claim(field: keyof typeof KEYWORDS): number {
    const idx = findBestColumn(headers, KEYWORDS[field], taken);
    if (idx !== -1) taken.add(idx);
    return idx;
  }

  // GCI and net_income must be claimed before generic "commission" to avoid collisions
  let   gci                = claim("gci");
  let   net_income         = claim("net_income");
  const name               = claim("name");
  const date               = claim("date");
  const address            = claim("address");
  const side               = claim("side");
  const source             = claim("source");
  let   sale_price         = claim("sale_price");
  const commission_percent = claim("commission_percent");

  // Heuristic: if there's no GCI column and the only monetary column was
  // claimed on an ambiguous header like "Amount" / "Value", remap it to GCI.
  // A file with addresses + a single dollar column is far more likely to
  // contain commission amounts than sale prices or net income.
  if (gci === -1 && commission_percent === -1) {
    const ambiguous = ["amount", "value", "total", "volume"];
    // Check sale_price first
    if (sale_price !== -1 && ambiguous.includes(normalize(headers[sale_price]))) {
      taken.delete(sale_price);
      gci = sale_price;
      taken.add(gci);
      sale_price = -1;
    // Then check if net_income grabbed it via loose substring match
    } else if (net_income !== -1 && sale_price === -1 && ambiguous.includes(normalize(headers[net_income]))) {
      taken.delete(net_income);
      gci = net_income;
      taken.add(gci);
      net_income = -1;
    }
  }

  // ── Detect document subtype ───────────────────────────────────────────────
  const hasTrackerShape =
    gci !== -1 &&
    name !== -1 &&
    side !== -1;

  const hasBrokerageShape =
    gci !== -1 &&
    // Brokerage reports typically DON'T have a side/role column
    side === -1 &&
    // And they have net_income beside gci
    net_income !== -1;

  const document_subtype: ColumnClassification["document_subtype"] =
    hasTrackerShape ? "tracker" :
    hasBrokerageShape ? "brokerage" :
    "generic";

  // ── Build prompt hint ─────────────────────────────────────────────────────
  const found: string[] = [];
  if (name               !== -1) found.push(`Name=col${name}`);
  if (address            !== -1) found.push(`Address=col${address}`);
  if (date               !== -1) found.push(`Date=col${date}`);
  if (side               !== -1) found.push(`Side=col${side}`);
  if (source             !== -1) found.push(`Source=col${source}`);
  if (sale_price         !== -1) found.push(`SalePrice=col${sale_price} ("${headers[sale_price]}")`);
  if (gci                !== -1) found.push(`GCI=col${gci} ("${headers[gci]}")`);
  if (net_income         !== -1) found.push(`NetIncome=col${net_income} ("${headers[net_income]}")`);
  if (commission_percent !== -1) found.push(`CommissionPct=col${commission_percent} ("${headers[commission_percent]}")`);

  const prompt_hint = found.length > 0
    ? `[Column mapping detected — ${document_subtype} format] ${found.join(", ")}.`
    : "";

  return {
    name,
    address,
    date,
    side,
    source,
    gci,
    net_income,
    sale_price,
    commission_percent,
    header_row_index: headerRowIndex,
    prompt_hint,
    document_subtype,
  };
}

/**
 * Build an `ExtractionProvenance` map for a deal that was parsed from a row
 * using a `ColumnClassification`.
 *
 * Call once per deal after deterministic parsing.  Each provenance string
 * describes WHERE the value came from so the evidence tooltip shows
 * "Parsed from column: GCI (col 6)" instead of nothing.
 *
 * @param cols       Classification returned by `classifyColumns()`.
 * @param rawHeaders The actual header strings (rows[headerRowIndex]).
 * @param rowIndex   1-based data row index (for human-readable tooltip).
 */
export function buildProvenance(
  cols: ColumnClassification,
  rawHeaders: string[],
  rowIndex: number,
): ExtractionProvenance {
  function label(colIdx: number): string | null {
    if (colIdx === -1) return null;
    const header = rawHeaders[colIdx] ?? `col${colIdx}`;
    return `Parsed from row ${rowIndex}, column: ${header} (col ${colIdx})`;
  }

  return {
    gci:                label(cols.gci),
    sale_price:         label(cols.sale_price),
    net_income:         label(cols.net_income),
    commission_percent: label(cols.commission_percent),
    names:              label(cols.name),
    date:               label(cols.date),
    address:            label(cols.address),
  };
}
