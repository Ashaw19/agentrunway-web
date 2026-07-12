/**
 * lib/import/chunking/merge-extractions.ts
 *
 * Folds per-batch extraction results back into one { year, deals } after chunked
 * multi-call extraction. Deals are concatenated in batch order; the document
 * year is the most frequent usable year across batches (the year only matters as
 * a fallback for deals whose own date is unparseable — quarterly/annual
 * aggregates are computed later, once, from the merged deal list).
 *
 * Generic over the deal shape so it stays decoupled from the route's response
 * type. Pure function — unit-tested in __tests__/merge-extractions.test.ts.
 */

export interface Extraction<T> {
  year: number;
  deals: T[];
}

export function mergeExtractions<T>(batches: Array<Extraction<T>>): Extraction<T> {
  if (batches.length === 0) return { year: 0, deals: [] };

  const deals: T[] = [];
  for (const b of batches) deals.push(...b.deals);

  // Choose the most frequent USABLE year (>0). Ties break toward the year that
  // appears first, preserving the leading batch's document context.
  const counts = new Map<number, number>();
  const firstSeen = new Map<number, number>();
  batches.forEach((b, i) => {
    if (b.year > 0) {
      counts.set(b.year, (counts.get(b.year) ?? 0) + 1);
      if (!firstSeen.has(b.year)) firstSeen.set(b.year, i);
    }
  });

  let year = 0;
  let bestCount = 0;
  let bestFirst = Infinity;
  for (const [yr, count] of counts) {
    const first = firstSeen.get(yr) ?? Infinity;
    if (count > bestCount || (count === bestCount && first < bestFirst)) {
      year = yr;
      bestCount = count;
      bestFirst = first;
    }
  }

  return { year, deals };
}
