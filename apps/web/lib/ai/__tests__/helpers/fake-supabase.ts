/**
 * A column-projecting fake Supabase client for draft-services tests.
 *
 * Each query returns only the columns it selects, so a drafter that forgets
 * to select a column it filters on (e.g. `condition_status`) cannot see it,
 * and the test that depends on it fails. Writes are recorded in `writes`.
 * Every write is also logged in `queries` with the filters chained after
 * it, so a test can check what an update or delete was narrowed to.
 * `writeError` makes a write return an error (for example 23505), in which
 * case it is logged in `queries` only. `readError` tables answer every read
 * with an error, as PostgREST does when a request fails.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type Row = Record<string, unknown>;

export interface Write {
  table: string;
  op: "insert" | "upsert" | "update" | "delete";
  payload: unknown;
}

/**
 * Order two column values the way Postgres does. Timestamps compare as
 * instants, and one written without an offset is read as UTC (the database
 * session zone), so a bare `2026-10-09T00:00:00` bound means 9 pm Atlantic
 * the evening before, as it does in production. Everything else compares as
 * text.
 */
function compare(a: unknown, b: unknown): number {
  const [x, y] = [String(a), String(b)];
  const instant = (v: string) => {
    if (!/^\d{4}-\d{2}-\d{2}/.test(v)) return NaN;
    if (v.length === 10) return Date.parse(`${v}T00:00:00Z`);
    return Date.parse(/(?:Z|[+-]\d{2}:?\d{2})$/.test(v) ? v : `${v}Z`);
  };
  if (x.length > 10 || y.length > 10) {
    const [tx, ty] = [instant(x), instant(y)];
    if (!Number.isNaN(tx) && !Number.isNaN(ty)) return tx - ty;
  }
  return x < y ? -1 : x > y ? 1 : 0;
}

/** One filter call on a write, as made: `eq("status", "ready")` is { op: "eq", column: "status", value: "ready" }. */
export interface Filter {
  op:     string;
  column: string;
  value:  unknown;
}

/** A write and the filters chained after it. */
export interface Query extends Write {
  filters: Filter[];
  error:   { code?: string; message: string } | null;
}

export interface FakeSupabaseOptions {
  /** Tables whose every query throws, as when the request never gets there. */
  unreachable?: readonly string[];
  /** A write that fails: return its error, or null to let it through. */
  writeError?: (w: Write) => { code?: string; message: string } | null;
  /** Tables whose reads return an error (writes are unaffected). */
  readError?: readonly string[];
}

export function fakeSupabase(tables: Record<string, Row[]>, options: FakeSupabaseOptions = {}) {
  const writes: Write[] = [];
  const queries: Query[] = [];

  function from(table: string) {
    if (options.unreachable?.includes(table)) throw new Error(`${table} is unreachable`);
    let rows: Row[] = [...(tables[table] ?? [])];
    let columns: string[] | null = null;
    let counting: { head: boolean } | null = null;
    // The write this builder makes, if any: later filter calls land on it.
    let query: Query | null = null;
    let failed: { code?: string; message: string } | null =
      options.readError?.includes(table) ? { message: `${table} read failed` } : null;
    const log = (op: string, column: string, value: unknown) => { query?.filters.push({ op, column, value }); };

    const project = (r: Row): Row => {
      if (!columns) return r;
      const out: Row = {};
      for (const c of columns) if (c in r) out[c] = r[c];
      return out;
    };
    const result = () => failed
      ? { data: null, error: failed }
      : counting
        ? { data: counting.head ? null : rows.map(project), count: rows.length, error: null }
        : { data: rows.map(project), error: null };
    const one = () =>
      rows[0]
        ? { data: project(rows[0]), error: null }
        : { data: null, error: { message: "no rows" } };

    const write = (op: Write["op"], payload: unknown) => {
      const w: Write = { table, op, payload };
      failed = options.writeError?.(w) ?? null;
      query = { ...w, filters: [], error: failed };
      queries.push(query);
      if (failed) return builder;
      writes.push(w);
      // A delete keeps the table's rows, so the filters after it pick what it removed.
      if (op !== "delete") rows = [{ id: `${table}-new`, ...(payload as Row) }];
      return builder;
    };
    // Postgres: a comparison with NULL is never true.
    const ordered = (k: string, v: unknown, test: (c: number) => boolean) => {
      rows = rows.filter((r) => r[k] != null && test(compare(r[k], v)));
    };

    const builder = {
      select(cols?: string, opts?: { count?: string; head?: boolean }) {
        // Top-level columns only: "*, clients(name, email)" keeps every
        // column (an embedded relation is whatever the row holds under that
        // key); "id, clients(name)" keeps id and clients.
        const parts: string[] = [];
        let depth = 0, cur = "";
        for (const ch of cols ?? "") {
          if (ch === "(") depth++;
          if (ch === ")") depth--;
          if (ch === "," && depth === 0) { parts.push(cur); cur = ""; } else cur += ch;
        }
        parts.push(cur);
        const names = parts.map((c) => c.trim().replace(/\([\s\S]*$/, "").replace(/^.*:/, "")).filter(Boolean);
        columns = cols && !names.includes("*") ? names : null;
        if (opts?.count) counting = { head: !!opts.head };
        return builder;
      },
      eq(k: string, v: unknown) { log("eq", k, v); rows = rows.filter((r) => r[k] === v); return builder; },
      neq(k: string, v: unknown) { log("neq", k, v); rows = rows.filter((r) => r[k] !== v); return builder; },
      in(k: string, vs: readonly unknown[]) { log("in", k, vs); rows = rows.filter((r) => vs.includes(r[k])); return builder; },
      gte(k: string, v: unknown) { log("gte", k, v); ordered(k, v, (c) => c >= 0); return builder; },
      lt(k: string, v: unknown) { log("lt", k, v); ordered(k, v, (c) => c < 0); return builder; },
      lte(k: string, v: unknown) { log("lte", k, v); ordered(k, v, (c) => c <= 0); return builder; },
      // "%sam%" style patterns only: a case-insensitive substring match.
      ilike(k: string, pattern: string) {
        const needle = pattern.replace(/%/g, "").toLowerCase();
        rows = rows.filter((r) => String(r[k] ?? "").toLowerCase().includes(needle));
        return builder;
      },
      contains(k: string, vs: readonly unknown[]) {
        rows = rows.filter((r) => Array.isArray(r[k]) && vs.every((v) => (r[k] as unknown[]).includes(v)));
        return builder;
      },
      // "a.eq.x,b.eq.y" only: rows where any column equals its value.
      or(filters: string) {
        const any = filters.split(",").map((f) => f.split(".eq."));
        rows = rows.filter((r) => any.some(([k, v]) => String(r[k]) === v));
        return builder;
      },
      // Postgres regex, case-insensitive ("imatch"): the capture name search's whole-word read.
      filter(k: string, op: string, pattern: string) {
        if (op !== "imatch") throw new Error(`fake supabase: filter ${op} not supported`);
        const re = new RegExp(pattern, "i");
        rows = rows.filter((r) => re.test(String(r[k] ?? "")));
        return builder;
      },
      limit(n: number) { rows = rows.slice(0, n); return builder; },
      // Paged reads (lib/supabase/fetch-all.ts): rows from..to inclusive.
      range(from: number, to: number) { rows = rows.slice(from, to + 1); return builder; },
      is(k: string, v: unknown) { log("is", k, v); rows = rows.filter((r) => (r[k] ?? null) === v); return builder; },
      not(k: string, op: string, v: unknown) { log(`not.${op}`, k, v); rows = rows.filter((r) => (r[k] ?? null) !== v); return builder; },
      order(k: string, opts?: { ascending?: boolean }) {
        const dir = opts?.ascending === false ? -1 : 1;
        rows.sort((a, b) => (String(a[k]) > String(b[k]) ? dir : -dir));
        return builder;
      },
      insert: (p: unknown) => write("insert", p),
      upsert: (p: unknown) => write("upsert", p),
      update: (p: unknown) => write("update", p),
      delete: () => write("delete", null),
      single: async () => (failed ? { data: null, error: failed } : one()),
      maybeSingle: async () => (failed ? { data: null, error: failed } : rows[0] ? one() : { data: null, error: null }),
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve(result()).then(resolve, reject),
    };
    return builder;
  }

  // A test double for the external client, not fixture data: the service only
  // touches from/select/eq/neq/in/gte/lt/lte/ilike/contains/or/is/not/order/limit/range/
  // insert/upsert/update/delete/single/maybeSingle.
  const client = { from } as unknown as SupabaseClient;
  return { client, writes, queries };
}
