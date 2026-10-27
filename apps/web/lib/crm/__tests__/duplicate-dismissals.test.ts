import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { dismissGroup, groupDismissed, loadDismissedPairs, pairsOf } from "../duplicate-dismissals";
import { pairKey } from "../duplicate-detection";

/**
 * "Not the same person" is remembered (00190): near-matches include family
 * members, so the same pairs mustn't come back on every visit.
 */
describe("pairsOf / groupDismissed", () => {
  it("every pair in a group, ids ordered (the table's client_a < client_b)", () => {
    expect(pairsOf(["c", "a", "b"])).toEqual([["a", "b"], ["a", "c"], ["b", "c"]]);
    expect(pairsOf(["x"])).toEqual([]);
  });

  it("a group is dismissed only when all its pairs are", () => {
    const d = new Set([pairKey("a", "b"), pairKey("a", "c")]);
    expect(groupDismissed(["a", "b"], d)).toBe(true);
    expect(groupDismissed(["a", "b", "c"], d)).toBe(false);
    expect(groupDismissed(["a"], d)).toBe(false);
  });
});

function fakeSupabase(opts: { rows?: Array<{ client_a: string; client_b: string }>; error?: { message: string } }) {
  const upserts: Array<{ rows: unknown[]; options: unknown }> = [];
  const supabase = {
    from: (table: string) => {
      expect(table).toBe("client_duplicate_dismissals");
      return {
        select: () => ({ eq: async () => ({ data: opts.error ? null : opts.rows ?? [], error: opts.error ?? null }) }),
        upsert: async (rows: unknown[], options: unknown) => {
          upserts.push({ rows, options });
          return { error: opts.error ?? null };
        },
      };
    },
  } as unknown as SupabaseClient;
  return { supabase, upserts };
}

describe("loadDismissedPairs / dismissGroup", () => {
  it("reads pairs as pairKey values", async () => {
    const { supabase } = fakeSupabase({ rows: [{ client_a: "a", client_b: "b" }] });
    expect(await loadDismissedPairs(supabase, "u1")).toEqual(new Set([pairKey("b", "a")]));
  });

  it("a read error shows every suggestion rather than failing the page", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { supabase } = fakeSupabase({ error: { message: "boom" } });
    expect(await loadDismissedPairs(supabase, "u1")).toEqual(new Set());
    spy.mockRestore();
  });

  it("saves each pair once, ignoring pairs already saved (insert only, no update policy needed)", async () => {
    const { supabase, upserts } = fakeSupabase({});
    expect(await dismissGroup(supabase, "u1", ["b", "a"])).toBe(true);
    expect(upserts).toEqual([{
      rows: [{ user_id: "u1", client_a: "a", client_b: "b" }],
      options: { onConflict: "user_id,client_a,client_b", ignoreDuplicates: true },
    }]);
  });

  it("reports a failed save", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { supabase } = fakeSupabase({ error: { message: "denied" } });
    expect(await dismissGroup(supabase, "u1", ["a", "b"])).toBe(false);
    spy.mockRestore();
  });
});
