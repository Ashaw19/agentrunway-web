/**
 * A column-projecting fake Supabase client for draft-services tests.
 *
 * Each query returns only the columns it selects, so a drafter that forgets
 * to select a column it filters on (e.g. `condition_status`) cannot see it,
 * and the test that depends on it fails. Writes are recorded in `writes`.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type Row = Record<string, unknown>;

export interface Write {
  table: string;
  op: "insert" | "upsert" | "update";
  payload: unknown;
}

export function fakeSupabase(tables: Record<string, Row[]>) {
  const writes: Write[] = [];

  function from(table: string) {
    let rows: Row[] = [...(tables[table] ?? [])];
    let columns: string[] | null = null;

    const project = (r: Row): Row => {
      if (!columns) return r;
      const out: Row = {};
      for (const c of columns) if (c in r) out[c] = r[c];
      return out;
    };
    const result = () => ({ data: rows.map(project), error: null });
    const one = () =>
      rows[0]
        ? { data: project(rows[0]), error: null }
        : { data: null, error: { message: "no rows" } };

    const write = (op: Write["op"], payload: unknown) => {
      writes.push({ table, op, payload });
      rows = [{ id: `${table}-new`, ...(payload as Row) }];
      return builder;
    };

    const builder = {
      select(cols?: string) {
        columns = cols && cols !== "*" ? cols.split(",").map((c) => c.trim()) : null;
        return builder;
      },
      eq(k: string, v: unknown) { rows = rows.filter((r) => r[k] === v); return builder; },
      in(k: string, vs: readonly unknown[]) { rows = rows.filter((r) => vs.includes(r[k])); return builder; },
      is(k: string, v: unknown) { rows = rows.filter((r) => (r[k] ?? null) === v); return builder; },
      not(k: string, _op: string, v: unknown) { rows = rows.filter((r) => (r[k] ?? null) !== v); return builder; },
      order(k: string, opts?: { ascending?: boolean }) {
        const dir = opts?.ascending === false ? -1 : 1;
        rows.sort((a, b) => (String(a[k]) > String(b[k]) ? dir : -dir));
        return builder;
      },
      insert: (p: unknown) => write("insert", p),
      upsert: (p: unknown) => write("upsert", p),
      update: (p: unknown) => write("update", p),
      single: async () => one(),
      maybeSingle: async () => (rows[0] ? one() : { data: null, error: null }),
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve(result()).then(resolve, reject),
    };
    return builder;
  }

  // A test double for the external client, not fixture data: the service only
  // touches from/select/eq/in/is/not/order/insert/upsert/update/single/maybeSingle.
  const client = { from } as unknown as SupabaseClient;
  return { client, writes };
}
