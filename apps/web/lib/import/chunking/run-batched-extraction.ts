/**
 * lib/import/chunking/run-batched-extraction.ts
 *
 * Orchestrates chunked extraction: run each batch through an injected model
 * call, parse it, and merge the results. The extractor and parser are injected
 * so this stays free of the AI SDK, auth, and the database — the risky part
 * (looping, truncation handling, merge) is therefore unit-testable, since a bug
 * here would silently drop deals.
 *
 * Generic over both the batch input type (a prompt string for text, a page-index
 * group for vision) and the deal type.
 */
import { mergeExtractions, type Extraction } from "./merge-extractions";

export interface BatchExtractResult {
  /** Raw model text for this batch. */
  raw: string;
  /** True when the model stopped at the output-token ceiling (finishReason "length"). */
  truncated: boolean;
}

/**
 * @param batches  Prebuilt batch inputs (planTextBatches / planVisionBatches output).
 * @param extract  Runs one batch through the model; receives the batch and its index.
 * @param parse    Turns a batch's raw text into an { year, deals } extraction.
 * @throws Error("REPORT_TOO_LARGE") if any batch truncated (so a JSON object cut
 *         off mid-deal is never parsed/merged). Propagates parse errors verbatim.
 */
export async function runBatchedExtraction<TBatch, TDeal>(
  batches: TBatch[],
  extract: (batch: TBatch, index: number) => Promise<BatchExtractResult>,
  parse: (raw: string) => Extraction<TDeal>,
): Promise<Extraction<TDeal>> {
  const results: Array<Extraction<TDeal>> = [];
  for (let i = 0; i < batches.length; i++) {
    const { raw, truncated } = await extract(batches[i], i);
    if (truncated) throw new Error("REPORT_TOO_LARGE");
    results.push(parse(raw));
  }
  return mergeExtractions(results);
}
