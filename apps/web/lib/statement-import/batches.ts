/**
 * The Imports tab sends a long list of lines in batches the server takes
 * (MAX_CONFIRM_LINES per request). Each batch of a confirm of several is
 * marked `bulk`, so a last batch of one line still goes through the bulk
 * rules (bulkConfirmRefusal) instead of being confirmed as a single line.
 */
export const LINE_BATCH = 2000;

export function batches<T>(items: readonly T[], size: number = LINE_BATCH): T[][] {
  if (size < 1) throw new Error("batch size must be at least 1");
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** The confirm requests for these lines: one per batch, each marked bulk unless it is the agent's single line. */
export function confirmRequests(lineIds: readonly string[], single: boolean, size: number = LINE_BATCH) {
  return batches(lineIds, size).map((chunk) => ({ action: "confirm" as const, bulk: !single, lines: chunk.map((id) => ({ id })) }));
}
