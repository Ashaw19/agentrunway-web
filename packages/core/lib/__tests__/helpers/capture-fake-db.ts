/**
 * A small in-memory stand-in for the Supabase query builder, for the capture
 * writer and name-search tests. It keeps rows per table, applies the filters
 * the capture code uses (eq, is, in, ilike, limit) and records every write.
 * Synthetic data only.
 *
 * `fail` makes a table's writes return a PostgREST-style error; `offline`
 * makes its reads and writes fail the way a dropped connection does (no
 * code). Both can be changed mid-test (`options.offline = [...]`). An insert
 * whose id is already in the table fails as Postgres does (23505), and
 * `filter(col, "imatch", re)` applies a Postgres regex, case-insensitive.
 * Each table's reads are counted in `reads`, with the rows they returned.
 */

import type { DbClient } from "../../db-client";

export type Row = Record<string, unknown>;

export interface Write {
  table: string;
  op: "insert" | "update";
  payload: Row;
}

export interface FakeDbOptions {
  fail?: Record<string, { code: string; message: string }>;
  offline?: string[];
  /** Tables whose inserts are saved but whose reply is lost (the phone sees a dropped connection). */
  lostReplies?: string[];
}

export function fakeDb(seed: Record<string, Row[]> = {}, options: FakeDbOptions = {}) {
  const tables: Record<string, Row[]> = Object.fromEntries(Object.entries(seed).map(([k, v]) => [k, v.map((r) => ({ ...r }))]));
  const writes: Write[] = [];
  const reads: Array<{ table: string; returned: number }> = [];
  let seq = 0;

  const db: DbClient = {
    from(table: string) {
      let rows: Row[] = [...(tables[table] ?? [])];
      let op: "select" | "insert" | "update" = "select";
      let payload: Row | null = null;
      let limit = Infinity;
      const filters: Array<(r: Row) => boolean> = [];

      const error = () => {
        // A dropped connection fails reads and writes alike; a refusal is a write's.
        if (options.offline?.includes(table)) return { message: "TypeError: Network request failed" };
        if (op === "select") return null;
        return options.fail?.[table] ?? null;
      };

      const resolveRows = (): { data: Row[] | null; error: unknown } => {
        const err = error();
        if (err) return { data: null, error: err };
        if (op === "insert") {
          const row = { id: payload!.id ?? `${table}-${++seq}`, ...payload! };
          if ((tables[table] ?? []).some((r) => r.id === row.id)) {
            return { data: null, error: { code: "23505", message: `duplicate key value violates unique constraint "${table}_pkey"` } };
          }
          (tables[table] ??= []).push(row);
          writes.push({ table, op: "insert", payload: payload! });
          if (options.lostReplies?.includes(table)) return { data: null, error: { message: "TypeError: Network request failed" } };
          return { data: [row], error: null };
        }
        if (op === "update") {
          const matched = (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
          for (const r of matched) Object.assign(r, payload);
          writes.push({ table, op: "update", payload: payload! });
          return { data: matched, error: null };
        }
        const found = rows.filter((r) => filters.every((f) => f(r))).slice(0, limit);
        reads.push({ table, returned: found.length });
        return { data: found, error: null };
      };

      const builder = {
        select() { return builder; },
        insert(p: Row) { op = "insert"; payload = p; return builder; },
        update(p: Row) { op = "update"; payload = p; return builder; },
        eq(k: string, v: unknown) { filters.push((r) => r[k] === v); return builder; },
        is(k: string, v: unknown) { filters.push((r) => (r[k] ?? null) === v); return builder; },
        in(k: string, vs: unknown[]) { filters.push((r) => vs.includes(r[k])); return builder; },
        ilike(k: string, pattern: string) {
          const needle = pattern.replace(/%/g, "").toLowerCase();
          filters.push((r) => String(r[k] ?? "").toLowerCase().includes(needle));
          return builder;
        },
        filter(k: string, operator: string, pattern: string) {
          if (operator !== "imatch") throw new Error(`fake db: filter operator ${operator} not supported`);
          const re = new RegExp(pattern, "i");
          filters.push((r) => re.test(String(r[k] ?? "")));
          return builder;
        },
        limit(n: number) { limit = n; return builder; },
        async single() {
          const { data, error: e } = resolveRows();
          return e ? { data: null, error: e } : data && data[0] ? { data: data[0], error: null } : { data: null, error: { code: "PGRST116", message: "no rows" } };
        },
        async maybeSingle() {
          const { data, error: e } = resolveRows();
          return e ? { data: null, error: e } : { data: data?.[0] ?? null, error: null };
        },
        then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
          return Promise.resolve(resolveRows()).then(resolve, reject);
        },
      };
      rows = rows.slice();
      return builder;
    },
  };

  return { db, tables, writes, reads, options };
}
