/**
 * Briefing dismissals (00192): the writers and the reader in record-writers.
 * A fake query builder stands in for Supabase; it records what was sent.
 */

import { describe, it, expect, vi } from "vitest";
import {
  loadBriefingDismissKeys,
  removeBriefingDismissal,
  removeBriefingDismissals,
  writeBriefingDismissal,
  writeBriefingDismissals,
} from "../record-writers";

type Result = { data?: unknown; error: { code?: string; message?: string } | null };

function fakeDb(results: Result[]) {
  const calls: { table: string; op: string; payload?: unknown; filters: [string, unknown][]; range?: [number, number] }[] = [];
  const queue = [...results];
  const db = {
    from(table: string) {
      const call = { table, op: "", payload: undefined as unknown, filters: [] as [string, unknown][], range: undefined as [number, number] | undefined };
      calls.push(call);
      const chain = {
        insert(payload: unknown) { call.op = "insert"; call.payload = payload; return Promise.resolve(queue.shift() ?? { error: null }); },
        upsert(payload: unknown, opts: unknown) { call.op = "upsert"; call.payload = payload; call.filters.push(["options", opts]); return Promise.resolve(queue.shift() ?? { error: null }); },
        in(col: string, v: unknown) { call.filters.push([col, v]); return Promise.resolve(queue.shift() ?? { error: null }); },
        delete() { call.op = "delete"; return chain; },
        select() { call.op = "select"; return chain; },
        eq(col: string, v: unknown) { call.filters.push([col, v]); return chain; },
        order() { return chain; },
        range(a: number, b: number) { call.range = [a, b]; return Promise.resolve(queue.shift() ?? { data: [], error: null }); },
        then(resolve: (r: Result) => void) { resolve(queue.shift() ?? { error: null }); },
      };
      return chain;
    },
  };
  return { db, calls };
}

describe("writeBriefingDismissal", () => {
  it("saves the key and the client", async () => {
    const { db, calls } = fakeDb([{ error: null }]);
    const out = await writeBriefingDismissal(db, "u1", { dismissKey: "checkin_c1@none", clientId: "c1" });
    expect(out.ok).toBe(true);
    expect(calls[0]).toMatchObject({ table: "briefing_dismissals", op: "insert", payload: { user_id: "u1", client_id: "c1", dismiss_key: "checkin_c1@none" } });
  });

  it("saves an item with no client with a null client", async () => {
    const { db, calls } = fakeDb([{ error: null }]);
    await writeBriefingDismissal(db, "u1", { dismissKey: "listing_stale_l1", clientId: "" });
    expect((calls[0].payload as { client_id: unknown }).client_id).toBeNull();
  });

  it("dismissing twice counts as saved", async () => {
    const { db } = fakeDb([{ error: { code: "23505", message: "duplicate" } }]);
    const out = await writeBriefingDismissal(db, "u1", { dismissKey: "k", clientId: "c1" });
    expect(out).toMatchObject({ ok: true, alreadySaved: true });
  });

  it("refuses an empty key without writing", async () => {
    const { db, calls } = fakeDb([]);
    const out = await writeBriefingDismissal(db, "u1", { dismissKey: "  ", clientId: "c1" });
    expect(out.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("reports a refusal in plain words", async () => {
    const { db } = fakeDb([{ error: { code: "42501", message: "rls" } }]);
    const out = await writeBriefingDismissal(db, "u1", { dismissKey: "k", clientId: "c1" });
    expect(out.ok).toBe(false);
    expect(out.message).toMatch(/permission was refused/);
  });
});

describe("removeBriefingDismissal", () => {
  it("deletes the user's row for that key", async () => {
    const { db, calls } = fakeDb([{ error: null }]);
    const out = await removeBriefingDismissal(db, "u1", "checkin_c1@none");
    expect(out.ok).toBe(true);
    expect(calls[0].op).toBe("delete");
    expect(calls[0].filters).toEqual([["user_id", "u1"], ["dismiss_key", "checkin_c1@none"]]);
  });
});

describe("loadBriefingDismissKeys", () => {
  it("reads every page", async () => {
    const page1 = Array.from({ length: 1000 }, (_, i) => ({ dismiss_key: `k${i}` }));
    const page2 = [{ dismiss_key: "last" }];
    const { db, calls } = fakeDb([{ data: page1, error: null }, { data: page2, error: null }]);
    const out = await loadBriefingDismissKeys(db, "u1");
    expect(out.ok).toBe(true);
    expect(out.keys.size).toBe(1001);
    expect(calls.map((c) => c.range)).toEqual([[0, 999], [1000, 1999]]);
  });

  it("a failed read returns ok false and no keys, so the briefing still shows", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { db } = fakeDb([{ data: null, error: { message: "boom" } }]);
    const out = await loadBriefingDismissKeys(db, "u1");
    expect(out).toMatchObject({ ok: false });
    expect(out.keys.size).toBe(0);
    spy.mockRestore();
  });
});

const targets = (n: number) => Array.from({ length: n }, (_, i) => ({ dismissKey: `checkin_c${i}@none`, clientId: `c${i}` }));

describe("writeBriefingDismissals", () => {
  it("saves in batches of 500, skipping ones already dismissed", async () => {
    const { db, calls } = fakeDb([{ error: null }, { error: null }]);
    const out = await writeBriefingDismissals(db, "u1", targets(600));
    expect(out.ok).toBe(true);
    expect(out.saved).toHaveLength(600);
    expect(calls.map((c) => (c.payload as unknown[]).length)).toEqual([500, 100]);
    expect(calls[0].filters).toContainEqual(["options", { onConflict: "user_id,dismiss_key", ignoreDuplicates: true }]);
  });

  it("drops repeats and empty keys", async () => {
    const { db, calls } = fakeDb([{ error: null }]);
    const out = await writeBriefingDismissals(db, "u1", [
      { dismissKey: "a", clientId: "c1" }, { dismissKey: "a", clientId: "c1" }, { dismissKey: " ", clientId: "c2" },
    ]);
    expect(out.saved).toEqual(["a"]);
    expect((calls[0].payload as unknown[]).length).toBe(1);
  });

  it("stops at a refused batch and reports what was saved", async () => {
    const { db } = fakeDb([{ error: null }, { error: { code: "42501", message: "rls" } }]);
    const out = await writeBriefingDismissals(db, "u1", targets(600));
    expect(out.ok).toBe(false);
    expect(out.saved).toHaveLength(500);
  });

  it("refuses an empty list without writing", async () => {
    const { db, calls } = fakeDb([]);
    const out = await writeBriefingDismissals(db, "u1", []);
    expect(out.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });
});

describe("removeBriefingDismissals", () => {
  it("deletes in batches of 100 keys", async () => {
    const { db, calls } = fakeDb([{ error: null }, { error: null }, { error: null }]);
    const out = await removeBriefingDismissals(db, "u1", targets(263).map((t) => t.dismissKey));
    expect(out.ok).toBe(true);
    expect(calls.map((c) => (c.filters.find((f) => f[0] === "dismiss_key")?.[1] as unknown[]).length)).toEqual([100, 100, 63]);
    expect(calls.every((c) => c.filters.some((f) => f[0] === "user_id" && f[1] === "u1"))).toBe(true);
  });
});

