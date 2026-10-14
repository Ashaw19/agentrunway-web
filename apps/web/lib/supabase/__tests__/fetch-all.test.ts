import { describe, it, expect } from "vitest";
import { IN_CHUNK, PAGE_SIZE, fetchAllIn, fetchAllRows } from "../fetch-all";

/** One request returns at most 1,000 rows (config.toml max_rows); these read in full. */

const rowsOf = (n: number, from = 0) => Array.from({ length: n }, (_, i) => ({ id: from + i }));

describe("fetchAllRows", () => {
  it("reads every page past the cap", async () => {
    const total = 2 * PAGE_SIZE + 37;
    const calls: [number, number][] = [];
    const r = await fetchAllRows((from, to) => {
      calls.push([from, to]);
      return Promise.resolve({ data: rowsOf(Math.max(0, Math.min(to, total - 1) - from + 1), from), error: null });
    });
    expect(r.data).toHaveLength(total);
    expect(r.error).toBeNull();
    expect(calls).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it("stops after a short page, and after an empty page following a full one", async () => {
    let n = 0;
    expect((await fetchAllRows(() => { n++; return Promise.resolve({ data: rowsOf(3), error: null }); })).data).toHaveLength(3);
    expect(n).toBe(1);
    const sizes = [PAGE_SIZE, 0];
    const r = await fetchAllRows(() => Promise.resolve({ data: rowsOf(sizes.shift() ?? 0), error: null }));
    expect(r.data).toHaveLength(PAGE_SIZE);
  });

  it("returns the error with what it read before it", async () => {
    const pages = [{ data: rowsOf(PAGE_SIZE), error: null }, { data: null, error: { message: "timeout" } }];
    const r = await fetchAllRows(() => Promise.resolve(pages.shift()!));
    expect(r).toEqual({ data: rowsOf(PAGE_SIZE), error: { message: "timeout", code: undefined } });
  });
});

describe("fetchAllIn", () => {
  it("splits a long id list into chunks, de-duplicated, and joins the results", async () => {
    const ids = [...Array.from({ length: IN_CHUNK + 5 }, (_, i) => `c${i}`), "c0", "c1"];
    const chunks: number[] = [];
    const r = await fetchAllIn(ids, (chunk) => {
      chunks.push(chunk.length);
      return Promise.resolve({ data: chunk.map((id) => ({ id })), error: null });
    });
    expect(chunks).toEqual([IN_CHUNK, 5]);
    expect(r.data).toHaveLength(IN_CHUNK + 5);
  });

  it("pages within a chunk that matches more than 1,000 rows", async () => {
    const r = await fetchAllIn(["a"], (_chunk, from, to) =>
      Promise.resolve({ data: rowsOf(Math.max(0, Math.min(to, 1499) - from + 1), from), error: null }));
    expect(r.data).toHaveLength(1500);
  });

  it("stops at the first failed chunk", async () => {
    let call = 0;
    const r = await fetchAllIn(Array.from({ length: IN_CHUNK * 3 }, (_, i) => i), () =>
      Promise.resolve(++call === 2 ? { data: null, error: { message: "boom" } } : { data: [{ id: call }], error: null }));
    expect(r.error?.message).toBe("boom");
    expect(call).toBe(2);
  });
});
