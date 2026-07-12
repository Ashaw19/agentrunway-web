/**
 * Tests for planTextBatches — splits a normalized text document's rows into
 * batches for multi-call LLM extraction, so a report bigger than one model call
 * can hold is processed in pieces and merged.
 *
 * Invariants that MUST hold (a broken batcher silently loses or duplicates deals):
 *   • Every data row appears in exactly one batch, in order (completeness).
 *   • The header/context block is prepended to EVERY batch so column meaning
 *     survives past the first chunk.
 *   • No batch exceeds the row/char limits, except a single row larger than the
 *     char limit (which can't be split — it goes alone rather than being dropped).
 */
import { describe, expect, it } from "vitest";
import { planTextBatches } from "../chunking/plan-text-batches";

/** Reconstruct the data rows a batch contains, minus the prepended context block. */
function dataRowsOf(batch: string, contextBlock: string[]): string[] {
  const rows = batch.split("\n");
  return rows.slice(contextBlock.length);
}

describe("planTextBatches", () => {
  it("returns no batches for empty input", () => {
    expect(planTextBatches({ rows: [], headerRowIndex: null })).toEqual([]);
  });

  it("keeps a small document in a single batch with the header included", () => {
    const rows = ["Name,GCI", "Alice,100", "Bob,200"];
    const batches = planTextBatches({ rows, headerRowIndex: 0 });
    expect(batches).toHaveLength(1);
    expect(batches[0]).toBe("Name,GCI\nAlice,100\nBob,200");
  });

  it("splits data rows across batches and prepends the header to each", () => {
    const header = "Name,GCI";
    const data = Array.from({ length: 10 }, (_, i) => `Client${i},${i * 100}`);
    const rows = [header, ...data];
    const batches = planTextBatches({ rows, headerRowIndex: 0, maxRowsPerBatch: 4 });

    // 10 data rows / 4 per batch → 3 batches
    expect(batches).toHaveLength(3);
    // Header prepended to every batch
    for (const b of batches) expect(b.startsWith(header + "\n")).toBe(true);
    // Completeness: concatenating each batch's data rows == original data, in order
    const recombined = batches.flatMap((b) => dataRowsOf(b, [header]));
    expect(recombined).toEqual(data);
  });

  it("never exceeds maxRowsPerBatch data rows per batch", () => {
    const header = "Name,GCI";
    const data = Array.from({ length: 9 }, (_, i) => `C${i},${i}`);
    const batches = planTextBatches({ rows: [header, ...data], headerRowIndex: 0, maxRowsPerBatch: 4 });
    for (const b of batches) {
      expect(dataRowsOf(b, [header]).length).toBeLessThanOrEqual(4);
    }
  });

  it("splits on the char limit even when under the row limit", () => {
    const header = "H";
    // each data row is 100 chars → a 250-char limit fits ~2 rows/batch
    const data = Array.from({ length: 6 }, (_, i) => `${i}`.padEnd(100, "x"));
    const batches = planTextBatches({
      rows: [header, ...data],
      headerRowIndex: 0,
      maxRowsPerBatch: 1000,
      maxCharsPerBatch: 250,
    });
    expect(batches.length).toBeGreaterThan(1);
    const recombined = batches.flatMap((b) => dataRowsOf(b, [header]));
    expect(recombined).toEqual(data);
  });

  it("puts a single over-long row in its own batch rather than dropping it", () => {
    const header = "H";
    const huge = "z".repeat(500);
    const data = ["a,1", huge, "b,2"];
    const batches = planTextBatches({
      rows: [header, ...data],
      headerRowIndex: 0,
      maxRowsPerBatch: 1000,
      maxCharsPerBatch: 100,
    });
    const recombined = batches.flatMap((b) => dataRowsOf(b, [header]));
    expect(recombined).toEqual(data); // nothing lost
    // the huge row is isolated in a batch by itself
    expect(batches.some((b) => dataRowsOf(b, [header]).length === 1 && dataRowsOf(b, [header])[0] === huge)).toBe(true);
  });

  it("splits without a header when headerRowIndex is null (prose path)", () => {
    const rows = Array.from({ length: 5 }, (_, i) => `line ${i}`);
    const batches = planTextBatches({ rows, headerRowIndex: null, maxRowsPerBatch: 2 });
    expect(batches).toHaveLength(3);
    // No prepended header — every row is data
    const recombined = batches.flatMap((b) => b.split("\n"));
    expect(recombined).toEqual(rows);
  });

  it("prepends a multi-row context block (title rows before the header)", () => {
    const context = ["RE/MAX Production Report 2024", "Name,GCI"]; // headerRowIndex = 1
    const data = ["Alice,100", "Bob,200", "Cara,300"];
    const batches = planTextBatches({
      rows: [...context, ...data],
      headerRowIndex: 1,
      maxRowsPerBatch: 2,
    });
    expect(batches.length).toBe(2);
    for (const b of batches) {
      expect(b.startsWith("RE/MAX Production Report 2024\nName,GCI\n")).toBe(true);
    }
    const recombined = batches.flatMap((b) => dataRowsOf(b, context));
    expect(recombined).toEqual(data);
  });
});
