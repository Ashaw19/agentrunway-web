import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DELETE_CHUNK, deleteClients, fetchAllClients } from "../delete-clients";
import { PAGE_SIZE as CLIENT_PAGE } from "@/lib/supabase/fetch-all";

/**
 * Bulk delete in the web CRM (Andrew, 2026-10-14) goes through
 * fn_delete_clients, which deletes clients and archives instead any with a
 * deal, an unsubscribe or consent records. These pin the client side: ids are
 * de-duplicated and sent in chunks under the function's 5,000 cap, results
 * merge, a dry run is passed through, and the CRM's client list is read in
 * pages because one request returns at most 1,000 rows.
 */

function rpcFake(handler: (args: { p_client_ids: string[]; p_dry_run: boolean }) => { data?: unknown; error?: { message: string } | null }) {
  const rpc = vi.fn(async (_name: string, args: { p_client_ids: string[]; p_dry_run: boolean }) => {
    const r = handler(args);
    return { data: r.data ?? null, error: r.error ?? null };
  });
  return { client: { rpc } as unknown as SupabaseClient, rpc };
}

describe("deleteClients", () => {
  it("de-duplicates ids, passes the dry run, and returns the split", async () => {
    const { client, rpc } = rpcFake(({ p_client_ids }) => ({
      data: { deleted: p_client_ids.filter((id) => id !== "kept"), archived: p_client_ids.filter((id) => id === "kept") },
    }));
    const r = await deleteClients(client, ["a", "kept", "a"], { dryRun: true });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("fn_delete_clients", { p_client_ids: ["a", "kept"], p_dry_run: true });
    expect(r).toEqual({ data: { deleted: ["a"], archived: ["kept"] }, error: null });
  });

  it("sends large selections in chunks and merges the results", async () => {
    const ids = Array.from({ length: DELETE_CHUNK + 5 }, (_, i) => `c${i}`);
    const { client, rpc } = rpcFake(({ p_client_ids }) => ({ data: { deleted: p_client_ids, archived: [] } }));
    const r = await deleteClients(client, ids);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[0][1].p_client_ids).toHaveLength(DELETE_CHUNK);
    expect(rpc.mock.calls[1][1].p_client_ids).toHaveLength(5);
    expect(r.data?.deleted).toHaveLength(DELETE_CHUNK + 5);
  });

  it("reports an error, with what earlier chunks already did", async () => {
    const ids = Array.from({ length: DELETE_CHUNK + 1 }, (_, i) => `c${i}`);
    let call = 0;
    const { client } = rpcFake(({ p_client_ids }) =>
      ++call === 1 ? { data: { deleted: p_client_ids, archived: [] } } : { error: { message: "boom" } });
    const r = await deleteClients(client, ids);
    expect(r.error).toBe("boom");
    expect(r.data?.deleted).toHaveLength(DELETE_CHUNK);
  });

  it("fails cleanly on the first chunk", async () => {
    const { client } = rpcFake(() => ({ error: { message: "not authenticated" } }));
    expect(await deleteClients(client, ["a"])).toEqual({ data: null, error: "not authenticated" });
  });
});

describe("fetchAllClients", () => {
  function pagedFake(total: number) {
    const ranges: [number, number][] = [];
    const builder = {
      select: () => builder, eq: () => builder, order: () => builder,
      range: async (from: number, to: number) => {
        ranges.push([from, to]);
        const n = Math.max(0, Math.min(to, total - 1) - from + 1);
        return { data: Array.from({ length: n }, (_, i) => ({ id: `c${from + i}` })), error: null };
      },
    };
    return { client: { from: () => builder } as unknown as SupabaseClient, ranges };
  }

  it("reads past the 1,000-row cap in pages", async () => {
    const { client, ranges } = pagedFake(2 * CLIENT_PAGE + 10);
    const r = await fetchAllClients(client, "u1");
    expect(r.data).toHaveLength(2 * CLIENT_PAGE + 10);
    expect(ranges).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it("stops after one short page", async () => {
    const { client, ranges } = pagedFake(187);
    expect((await fetchAllClients(client, "u1")).data).toHaveLength(187);
    expect(ranges).toHaveLength(1);
  });

  it("asks once more after an exactly full page", async () => {
    const { client, ranges } = pagedFake(CLIENT_PAGE);
    expect((await fetchAllClients(client, "u1")).data).toHaveLength(CLIENT_PAGE);
    expect(ranges).toHaveLength(2);
  });
});
