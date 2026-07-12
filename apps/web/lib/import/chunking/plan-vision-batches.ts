/**
 * lib/import/chunking/plan-vision-batches.ts
 *
 * Groups discrete page-image inputs into batches for multi-call vision
 * extraction, mirroring planTextBatches for the OCR path. Returns arrays of
 * page indices into the caller's imageSources list.
 *
 * Only meaningful when the client sent multiple discrete page images (e.g. a
 * scanned PDF rasterized to one JPEG per page). A single native-PDF blob is one
 * indivisible source and is not chunked here.
 *
 * Pure function — no I/O. Unit-tested in __tests__/plan-vision-batches.test.ts.
 */

// 4 pages/batch: a brokerage page rarely holds >20 deals, so ≤4 pages stays well
// under the ~100-deal (32K-token) per-call ceiling.
const DEFAULT_PAGES_PER_BATCH = 4;

export function planVisionBatches(
  pageCount: number,
  pagesPerBatch: number = DEFAULT_PAGES_PER_BATCH,
): number[][] {
  if (pageCount <= 0) return [];
  const size = Math.max(1, Math.floor(pagesPerBatch));

  const groups: number[][] = [];
  for (let start = 0; start < pageCount; start += size) {
    const group: number[] = [];
    for (let i = start; i < Math.min(start + size, pageCount); i++) group.push(i);
    groups.push(group);
  }
  return groups;
}
