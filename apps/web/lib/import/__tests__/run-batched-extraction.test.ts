/**
 * Tests for runBatchedExtraction — the orchestration that runs each batch
 * through an injected model-call, parses it, and merges. This is where a bug
 * would SILENTLY DROP deals (the worst import failure), so it's tested with a
 * fake extractor rather than the live model / DB.
 */
import { describe, expect, it, vi } from "vitest";
import { runBatchedExtraction } from "../chunking/run-batched-extraction";

type Deal = { id: string };

/** A fake extractor: returns the batch string as "raw" and never truncates. */
const echoExtract = (batch: string) => Promise.resolve({ raw: batch, truncated: false });

/** A fake parser: interprets "raw" as `year|id1,id2,...`. */
const fakeParse = (raw: string): { year: number; deals: Deal[] } => {
  const [yr, ids] = raw.split("|");
  return {
    year: Number(yr),
    deals: (ids ? ids.split(",").filter(Boolean) : []).map((id) => ({ id })),
  };
};

describe("runBatchedExtraction", () => {
  it("passes a single batch straight through", async () => {
    const out = await runBatchedExtraction(["2024|a,b"], echoExtract, fakeParse);
    expect(out).toEqual({ year: 2024, deals: [{ id: "a" }, { id: "b" }] });
  });

  it("merges deals across batches in order", async () => {
    const out = await runBatchedExtraction(["2024|a,b", "2024|c", "2024|d,e"], echoExtract, fakeParse);
    expect(out.deals.map((d) => d.id)).toEqual(["a", "b", "c", "d", "e"]);
    expect(out.year).toBe(2024);
  });

  it("returns an empty result for zero batches", async () => {
    const out = await runBatchedExtraction<string, Deal>([], echoExtract, fakeParse);
    expect(out).toEqual({ year: 0, deals: [] });
  });

  it("throws REPORT_TOO_LARGE when a batch truncates (never merges a cut-off object)", async () => {
    const extract = (batch: string, i: number) =>
      Promise.resolve({ raw: batch, truncated: i === 1 }); // 2nd batch truncates
    await expect(
      runBatchedExtraction(["2024|a", "2024|b", "2024|c"], extract, fakeParse),
    ).rejects.toThrow("REPORT_TOO_LARGE");
  });

  it("calls the extractor once per batch with the batch and its index", async () => {
    const extract = vi.fn((batch: string) => Promise.resolve({ raw: batch, truncated: false }));
    await runBatchedExtraction(["2024|a", "2024|b"], extract, fakeParse);
    expect(extract).toHaveBeenCalledTimes(2);
    expect(extract).toHaveBeenNthCalledWith(1, "2024|a", 0);
    expect(extract).toHaveBeenNthCalledWith(2, "2024|b", 1);
  });

  it("propagates a parse error from a batch", async () => {
    const throwingParse = () => {
      throw new Error("JSON parse failed");
    };
    await expect(
      runBatchedExtraction(["x"], echoExtract, throwingParse),
    ).rejects.toThrow("JSON parse failed");
  });

  it("works with non-string batch inputs (e.g. vision page groups)", async () => {
    const groups: number[][] = [[0, 1], [2]];
    const extract = (group: number[]) => Promise.resolve({ raw: `2023|${group.join("-")}`, truncated: false });
    const parseGroup = (raw: string) => {
      const [yr, ids] = raw.split("|");
      return { year: Number(yr), deals: ids.split("-").map((id) => ({ id })) };
    };
    const out = await runBatchedExtraction(groups, extract, parseGroup);
    expect(out.deals.map((d) => d.id)).toEqual(["0", "1", "2"]);
  });
});
