/**
 * Tests for mergeExtractions — folds the per-batch extraction results back into
 * one { year, deals } after multi-call chunked extraction.
 *
 * Aggregates (annual/quarterly totals) are computed later, once, over the merged
 * deal list — so this merge only has to concatenate deals in order and pick a
 * representative document year.
 */
import { describe, expect, it } from "vitest";
import { mergeExtractions } from "../chunking/merge-extractions";

type Deal = { id: string };

describe("mergeExtractions", () => {
  it("returns an empty result with year 0 for no batches", () => {
    expect(mergeExtractions<Deal>([])).toEqual({ year: 0, deals: [] });
  });

  it("passes a single batch through unchanged", () => {
    const batch = { year: 2024, deals: [{ id: "a" }, { id: "b" }] };
    expect(mergeExtractions([batch])).toEqual({ year: 2024, deals: [{ id: "a" }, { id: "b" }] });
  });

  it("concatenates deals across batches in order", () => {
    const merged = mergeExtractions<Deal>([
      { year: 2024, deals: [{ id: "a" }, { id: "b" }] },
      { year: 2024, deals: [{ id: "c" }] },
      { year: 2024, deals: [{ id: "d" }, { id: "e" }] },
    ]);
    expect(merged.deals.map((d) => d.id)).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("picks the most frequent year across batches", () => {
    const merged = mergeExtractions<Deal>([
      { year: 2024, deals: [{ id: "a" }] },
      { year: 2024, deals: [{ id: "b" }] },
      { year: 2023, deals: [{ id: "c" }] },
    ]);
    expect(merged.year).toBe(2024);
  });

  it("breaks a year tie by first appearance", () => {
    const merged = mergeExtractions<Deal>([
      { year: 2024, deals: [{ id: "a" }] },
      { year: 2023, deals: [{ id: "b" }] },
    ]);
    expect(merged.year).toBe(2024);
  });

  it("ignores unparseable (0) years when choosing the mode", () => {
    const merged = mergeExtractions<Deal>([
      { year: 0, deals: [{ id: "a" }] },
      { year: 2024, deals: [{ id: "b" }] },
      { year: 2024, deals: [{ id: "c" }] },
    ]);
    expect(merged.year).toBe(2024);
  });

  it("returns 0 when no batch has a usable year", () => {
    const merged = mergeExtractions<Deal>([
      { year: 0, deals: [{ id: "a" }] },
      { year: 0, deals: [{ id: "b" }] },
    ]);
    expect(merged.year).toBe(0);
  });
});
