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
 *
 * `unique` names a table's other unique keys (its columns); an insert that
 * repeats one fails with 23505 too. `upsert(row, { onConflict })` updates the
 * row that shares the conflict columns (or leaves it with ignoreDuplicates),
 * else inserts; each call is one `upsert` write with its `onConflict`.
 * `delete()` removes the rows the filters match and records one `delete` write.
 */

import type { DbClient } from "../../db-client";

export type Row = Record<string, unknown>;

export interface Write {
  table: string;
  op: "insert" | "update" | "upsert" | "delete";
  /** A delete has no payload: it is {}. */
  payload: Row;
  /** An upsert's conflict columns, as passed ("a,b,c"). */
  onConflict?: string;
}

export interface FakeDbOptions {
  fail?: Record<string, { code: string; message: string }>;
  offline?: string[];
  /** Tables whose inserts are saved but whose reply is lost (the phone sees a dropped connection). */
  lostReplies?: string[];
  /** Per table, the columns of a unique key besides the id (a repeat is a 23505). */
  unique?: Record<string, string[]>;
}

export function fakeDb(seed: Record<string, Row[]> = {}, options: FakeDbOptions = {}) {
  const tables: Record<string, Row[]> = Object.fromEntries(Object.entries(seed).map(([k, v]) => [k, v.map((r) => ({ ...r }))]));
  const writes: Write[] = [];
  const reads: Array<{ table: string; returned: number }> = [];
  let seq = 0;

  const db: DbClient = {
    from(table: string) {
      let rows: Row[] = [...(tables[table] ?? [])];
      let op: "select" | "insert" | "update" | "upsert" | "delete" = "select";
      let payload: Row | null = null;
      let upsertOptions: { onConflict?: string; ignoreDuplicates?: boolean } = {};
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
        const clash = (row: Row): { code: string; message: string } | null => {
          if ((tables[table] ?? []).some((r) => r.id === row.id)) {
            return { code: "23505", message: `duplicate key value violates unique constraint "${table}_pkey"` };
          }
          const key = options.unique?.[table];
          if (key && (tables[table] ?? []).some((r) => key.every((c) => r[c] === row[c]))) {
            return { code: "23505", message: `duplicate key value violates unique constraint "${table}_${key.join("_")}_key"` };
          }
          return null;
        };
        if (op === "insert") {
          const row = { id: payload!.id ?? `${table}-${++seq}`, ...payload! };
          const dup = clash(row);
          if (dup) return { data: null, error: dup };
          (tables[table] ??= []).push(row);
          writes.push({ table, op: "insert", payload: payload! });
          if (options.lostReplies?.includes(table)) return { data: null, error: { message: "TypeError: Network request failed" } };
          return { data: [row], error: null };
        }
        if (op === "upsert") {
          const columns = (upsertOptions.onConflict ?? "id").split(",").map((c) => c.trim());
          const existing = (tables[table] ?? []).find((r) => columns.every((c) => r[c] === payload![c]));
          writes.push({ table, op: "upsert", payload: payload!, onConflict: upsertOptions.onConflict });
          if (existing) {
            // ON CONFLICT DO UPDATE sets every column sent; DO NOTHING leaves the row.
            if (!upsertOptions.ignoreDuplicates) Object.assign(existing, payload);
            return { data: [existing], error: null };
          }
          const row = { id: payload!.id ?? `${table}-${++seq}`, ...payload! };
          (tables[table] ??= []).push(row);
          return { data: [row], error: null };
        }
        if (op === "delete") {
          const removed = (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
          tables[table] = (tables[table] ?? []).filter((r) => !removed.includes(r));
          writes.push({ table, op: "delete", payload: {} });
          return { data: removed, error: null };
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
        upsert(p: Row, o: { onConflict?: string; ignoreDuplicates?: boolean } = {}) { op = "upsert"; payload = p; upsertOptions = o; return builder; },
        delete() { op = "delete"; return builder; },
        eq(k: string, v: unknown) { filters.push((r) => r[k] === v); return builder; },
        is(k: string, v: unknown) { filters.push((r) => (r[k] ?? null) === v); return builder; },
        // Only `not(col, "is", value)`, as PostgREST's `col=not.is.value`.
        not(k: string, operator: string, v: unknown) {
          if (operator !== "is") throw new Error(`fake db: not operator ${operator} not supported`);
          filters.push((r) => (r[k] ?? null) !== v);
          return builder;
        },
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
        // The logbook readers order and page (vehicle-logbook-rows.ts).
        order() { return builder; },
        range(from: number, to: number) { limit = Math.min(limit, to + 1); filters.push(((i) => () => i++ >= from)(0)); return builder; },
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
