/**
 * lib/import/chunking/plan-text-batches.ts
 *
 * Splits a normalized text document's rows into batches for multi-call LLM
 * extraction. A single model call caps at ~100 deals (32K output tokens); a
 * large multi-year brokerage report can exceed that. Batching lets us extract
 * the whole report in pieces and merge the deals in code.
 *
 * Design:
 *   • The header / context block (title rows up to and including the detected
 *     header row) is prepended to EVERY batch, so a chunk of data rows in the
 *     middle of the document still carries its column meaning to the model.
 *   • Data rows are partitioned in order, each into exactly one batch — no row
 *     is dropped or duplicated.
 *   • Batches are bounded by row count AND character count. A single row longer
 *     than the char limit cannot be split, so it goes in a batch by itself
 *     rather than being lost.
 *
 * Pure function — no I/O. Unit-tested in __tests__/plan-text-batches.test.ts.
 */

export interface PlanTextBatchesInput {
  /** All normalized rows of the document, in order (including any header). */
  rows: string[];
  /**
   * Index into `rows` of the detected header row. Rows 0..headerRowIndex form
   * the context block prepended to every batch. Null when no header was
   * identified (prose / narrative documents) — then all rows are data and no
   * context block is prepended.
   */
  headerRowIndex: number | null;
  /** Max DATA rows per batch (excludes the prepended context block). */
  maxRowsPerBatch?: number;
  /** Max characters per batch (including the context block). */
  maxCharsPerBatch?: number;
}

// Defaults: 40 data rows ≈ ≤40 deals ≈ ~14K output tokens — comfortably under
// the 32K per-call ceiling (≈2× headroom), so a batch practically never
// truncates. 12K input chars keeps each call's prompt modest.
const DEFAULT_MAX_ROWS = 40;
const DEFAULT_MAX_CHARS = 12_000;

export function planTextBatches({
  rows,
  headerRowIndex,
  maxRowsPerBatch = DEFAULT_MAX_ROWS,
  maxCharsPerBatch = DEFAULT_MAX_CHARS,
}: PlanTextBatchesInput): string[] {
  if (rows.length === 0) return [];

  const maxRows = Math.max(1, maxRowsPerBatch);
  const maxChars = Math.max(1, maxCharsPerBatch);

  // Split into the context block (title rows + header) and the data rows.
  const hasHeader =
    headerRowIndex != null && headerRowIndex >= 0 && headerRowIndex < rows.length;
  const contextBlock = hasHeader ? rows.slice(0, headerRowIndex + 1) : [];
  const dataRows = hasHeader ? rows.slice(headerRowIndex + 1) : rows;

  // Degenerate: a header with no data rows — return the whole thing as one batch
  // rather than nothing, so the caller still gets a well-formed (if empty) call.
  if (dataRows.length === 0) return [rows.join("\n")];

  const contextText = contextBlock.join("\n");
  const contextLen = contextBlock.length > 0 ? contextText.length + 1 : 0; // +1 for the join newline before data

  const batches: string[] = [];
  let current: string[] = [];
  let currentChars = 0;

  const flush = () => {
    if (current.length === 0) return;
    const body = current.join("\n");
    batches.push(contextBlock.length > 0 ? `${contextText}\n${body}` : body);
    current = [];
    currentChars = 0;
  };

  for (const row of dataRows) {
    const rowCost = row.length + 1; // +1 for newline
    const wouldExceedRows = current.length >= maxRows;
    const wouldExceedChars =
      current.length > 0 && contextLen + currentChars + rowCost > maxChars;

    if (wouldExceedRows || wouldExceedChars) flush();

    current.push(row);
    currentChars += rowCost;
  }
  flush();

  return batches;
}
