/**
 * Tests for planVisionBatches — groups multi-page image/PDF-page inputs into
 * batches so a long scanned report is OCR-extracted in pieces.
 *
 * (Only applies when the client sends discrete page images. A single native-PDF
 * blob is one indivisible source — the route handles that as a single call.)
 */
import { describe, expect, it } from "vitest";
import { planVisionBatches } from "../chunking/plan-vision-batches";

describe("planVisionBatches", () => {
  it("returns no groups for zero pages", () => {
    expect(planVisionBatches(0, 4)).toEqual([]);
  });

  it("groups pages into fixed-size batches with a partial final batch", () => {
    expect(planVisionBatches(9, 4)).toEqual([[0, 1, 2, 3], [4, 5, 6, 7], [8]]);
  });

  it("returns a single group when all pages fit", () => {
    expect(planVisionBatches(4, 4)).toEqual([[0, 1, 2, 3]]);
  });

  it("handles a single page", () => {
    expect(planVisionBatches(1, 4)).toEqual([[0]]);
  });

  it("covers every page index exactly once, in order", () => {
    const groups = planVisionBatches(23, 5);
    const flat = groups.flat();
    expect(flat).toEqual(Array.from({ length: 23 }, (_, i) => i));
  });

  it("defensively treats a non-positive batch size as 1", () => {
    expect(planVisionBatches(3, 0)).toEqual([[0], [1], [2]]);
  });
});
