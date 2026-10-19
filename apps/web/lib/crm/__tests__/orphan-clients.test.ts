import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { deleteOrphanedImportedClients } from "../orphan-clients";

/**
 * Deleting a year of history removes the clients that year's import created
 * and nothing else uses. It used to read every remaining deal record in one
 * request (cut off at 1,000 rows) and treat a failed read as "none left", so
 * clients who still had deals could be deleted. These pin the safe version.
 */

type Row = Record<string, unknown>;

function fake(tables: Record<string, Row[]>, failOn?: string) {
  const deletes: { table: string; ids: string[] }[] = [];
  const from = (table: string) => {
    let rows = [...(tables[table] ?? [])];
    let mode: "select" | "delete" = "select";
    let inIds: unknown[] | null = null;
    let inCol = "";
    const b = {
      select: () => b,
      delete: () => { mode = "delete"; return b; },
      eq: (k: string, v: unknown) => { rows = rows.filter((r) => r[k] === v); return b; },
      in: (k: string, vs: unknown[]) => { inCol = k; inIds = vs; rows = rows.filter((r) => vs.includes(r[k])); return b; },
      not: (k: string, _op: string, v: unknown) => { rows = rows.filter((r) => (r[k] ?? null) !== v); return b; },
      is: (k: string, v: unknown) => { rows = rows.filter((r) => (r[k] ?? null) === v); return b; },
      order: () => b,
      range: (f: number, t: number) =>
        Promise.resolve(failOn === table ? { data: null, error: { message: `${table} failed` } } : { data: rows.slice(f, t + 1), error: null }),
      then: (res: (v: unknown) => unknown) => {
        if (mode === "delete") deletes.push({ table, ids: (inIds as string[]) ?? [] });
        void inCol;
        return Promise.resolve({ error: null }).then(res);
      },
    };
    return b;
  };
  return { client: { from } as unknown as SupabaseClient, deletes };
}

const U = "u1";
const client = (id: string, extra: Row = {}) => ({ id, user_id: U, imported_at: "2026-01-01", email_opt_out_at: null, sms_opt_out_at: null, ...extra });

describe("deleteOrphanedImportedClients", () => {
  it("deletes an imported client with nothing left, and only that one", async () => {
    const { client: sb, deletes } = fake({
      client_records: [{ id: "r9", user_id: U, client_id: "keeps-a-deal" }],
      clients: [
        client("orphan"), client("keeps-a-deal"), client("typed-in", { imported_at: null }),
        client("unsubscribed", { email_opt_out_at: "2026-05-01" }), client("no-texts", { sms_opt_out_at: "2026-05-01" }),
        client("in-pipeline"), client("co-buyer"), client("gave-consent"),
      ],
      pipeline_deals: [{ id: "p1", user_id: U, client_id: "in-pipeline" }],
      client_record_co_parties: [{ id: "cp1", user_id: U, co_client_id: "co-buyer" }],
      client_email_consents: [{ id: "ce1", user_id: U, client_id: "gave-consent" }],
    });
    const r = await deleteOrphanedImportedClients(sb, U, ["orphan", "keeps-a-deal", "typed-in", "unsubscribed", "no-texts", "in-pipeline", "co-buyer", "gave-consent", "orphan"]);
    expect(r).toEqual({ deleted: ["orphan"], error: null });
    expect(deletes).toEqual([{ table: "clients", ids: ["orphan"] }]);
  });

  it("deletes nothing when a check fails", async () => {
    for (const table of ["client_records", "clients", "pipeline_deals", "client_record_co_parties", "client_email_consents"]) {
      const { client: sb, deletes } = fake({ clients: [client("orphan")] }, table);
      const r = await deleteOrphanedImportedClients(sb, U, ["orphan"]);
      expect(r.deleted).toEqual([]);
      expect(r.error).toBe(`${table} failed`);
      expect(deletes).toEqual([]);
    }
  });

  it("keeps a client whose other-year record sits past the first 1,000 rows", async () => {
    // 1,500 remaining records for other clients; the candidate's own record is
    // the last one. The old single read would have stopped at 1,000.
    const records = Array.from({ length: 1500 }, (_, i) => ({ id: `r${i}`, user_id: U, client_id: i === 1499 ? "still-has-deal" : `other${i}` }));
    const { client: sb, deletes } = fake({ client_records: records, clients: [client("still-has-deal")] });
    const r = await deleteOrphanedImportedClients(sb, U, ["still-has-deal"]);
    expect(r.deleted).toEqual([]);
    expect(deletes).toEqual([]);
  });
});
