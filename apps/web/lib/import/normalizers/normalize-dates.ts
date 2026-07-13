/**
 * lib/import/normalizers/normalize-dates.ts
 *
 * Pure date-normalization utilities shared between:
 *   1. app/api/import-history/route.ts  (production pipeline)
 *   2. scripts/import-tests/run-accuracy-tests.ts  (eval harness)
 *
 * Two passes run in sequence before any LLM call:
 *   Pass 1 — Excel serial numbers → ISO YYYY-MM-DD
 *   Pass 2 — Slash-date DD/MM/YYYY vs MM/DD/YYYY → ISO YYYY-MM-DD
 *
 * Design: pure functions, no I/O, no framework imports.
 */

import { splitCsvRow, joinCsvRow } from "./normalize-text";
import { classifyColumns } from "../heuristics/column-classifier";

// ── Pass 1: Excel serial → ISO ────────────────────────────────────────────────

/**
 * Convert an Excel serial number to YYYY-MM-DD.
 *
 * Anchor: 2023-01-01 = serial 44927 (verified against Excel's 1900 date system,
 * which incorrectly treats 1900 as a leap year — the offset corrects for this).
 *
 * Coverage: serials 42005–47848 map to 2015-01-01 through 2030-12-31.
 */
export function excelSerialToISO(serial: number): string {
  const ANCHOR_DATE   = new Date(Date.UTC(2023, 0, 1)); // 2023-01-01
  const ANCHOR_SERIAL = 44927;
  const ms  = ANCHOR_DATE.getTime() + (serial - ANCHOR_SERIAL) * 86_400_000;
  const d   = new Date(ms);
  const y   = d.getUTCFullYear();
  const m   = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ── Pass 2: Slash-date disambiguation ────────────────────────────────────────

/**
 * Normalize date formats in document content before sending to the LLM.
 *
 * Pass 1 — Excel serial numbers (5-digit integers in the ~42000–48000 range):
 *   Strategy: serial→date conversion is scoped to a date-CLASSIFIED column only.
 *   The date column is found via the explicit date-header regex, or failing
 *   that via the column classifier's richer date keyword list (paid, settled,
 *   possession, firm date, …). Tabular content with NO date-classified column
 *   gets no serial conversion at all — a bare 5-digit cell there is money
 *   (a $45,000 Budget/GCI), and rewriting it is silent data corruption
 *   (2026-07-02 Daily QA finding, CRM contact imports). The generic
 *   cell-boundary fallback regex applies only to non-tabular content
 *   (prose, PDF-extracted text, TSV).
 *
 * Pass 2 — Slash dates (DD/MM/YYYY vs MM/DD/YYYY):
 *   If any date has a day > 12 in the first position → unambiguously DD/MM.
 *   If no day > 12 in first position but month > 12 in second → MM/DD/YYYY.
 *   If all values ≤ 12 in both positions → ambiguous, left as-is for the LLM.
 *
 * Limitation: DD/MM dates where all day values happen to be ≤ 12 cannot be
 * auto-detected and will pass through unconverted. This is inherent ambiguity,
 * not a pipeline bug — document it as such if it appears in eval results.
 */
export function normalizeDateFormats(content: string): string {
  // ── Pass 1: Excel serials ────────────────────────────────────────────────
  const SERIAL_RE = /^(4[2-7]\d{3}|48[0-3]\d\d)$/;

  const lines = content.split("\n");
  const cellRows = lines.map(splitCsvRow);

  // Date-column detection, two detectors in order:
  //  (a) explicit date-header regex — unchanged legacy behavior;
  //  (b) the column classifier's date keyword list, which also recognizes
  //      headers like "Paid", "Settled", "Possession", "Firm Date".
  let dateColIdx = -1;
  for (let i = 0; i < Math.min(lines.length, 5); i++) {
    const cells = cellRows[i];
    if (cells.length >= 3) {
      const idx = cells.findIndex(c =>
        /\b(?:close[\s_]?)?date\b|\bclosing\b|\bsettlement[\s_]date\b/i.test(c.trim())
      );
      if (idx >= 0) { dateColIdx = idx; break; }
    }
  }
  const classification = classifyColumns(cellRows, 5);
  if (dateColIdx === -1 && classification && classification.date !== -1) {
    dateColIdx = classification.date;
  }

  // Tabular = the classifier found a header row, or at least two lines split
  // into 2+ comma cells. A tabular document without a date-classified column
  // must NOT get serial conversion: bare 5-digit cells there are money.
  const isTabular =
    classification !== null ||
    cellRows.filter(cells => cells.length >= 2).length >= 2;

  let result: string;
  if (dateColIdx >= 0) {
    result = lines.map((line, i) => {
      const cells = cellRows[i];
      if (cells.length > dateColIdx) {
        const cell = cells[dateColIdx].trim();
        if (SERIAL_RE.test(cell)) {
          cells[dateColIdx] = excelSerialToISO(parseInt(cell, 10));
          // Re-escape on re-join: splitCsvRow stripped quoting, so a bare
          // join(",") would turn a quoted "Buyer, Jane" into two columns and
          // silently shift every field after it. joinCsvRow re-quotes only the
          // cells that need it, so plain rows still round-trip byte-for-byte.
          return joinCsvRow(cells);
        }
      }
      return line;
    }).join("\n");
  } else if (isTabular) {
    result = content; // structured table, no date column — never rewrite cells
  } else {
    result = content.replace(
      /(?<=^|[\t,\n])(4[2-7]\d{3}|48[0-3]\d\d)(?=$|[\t,\n])/gm,
      (_, serial) => excelSerialToISO(parseInt(serial, 10)),
    );
  }

  // ── Pass 2: Slash dates ──────────────────────────────────────────────────
  const slashDate = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g;
  const matches = [...result.matchAll(slashDate)];
  if (matches.length === 0) return result;

  const isDDMM = matches.some(m => parseInt(m[1]) > 12);
  const isMDY  = !isDDMM && matches.some(m => parseInt(m[2]) > 12);

  if (isDDMM) {
    return result.replace(slashDate, (_, d, m, y) =>
      `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`);
  }
  if (isMDY) {
    return result.replace(slashDate, (_, m, d, y) =>
      `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`);
  }
  return result; // all ambiguous — leave for LLM
}
