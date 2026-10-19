/**
 * Runs the MCP server's REAL tool handlers under vitest, against an in-memory
 * stand-in for the Supabase client.
 *
 * WHY: the tools in `supabase/functions/mcp-server/tools/*.ts` are Deno code
 * that neither tsc nor (until this harness) any test loaded, so a tool could
 * read a dead column for months with every check green. Parsing the source
 * (registry-source.ts) proves a tool exists; it can't prove what it returns.
 *
 * HOW:
 *   - The tool file is loaded with a dynamic import of a computed path, so
 *     tsc does not follow it (it can't resolve `npm:` specifiers or the
 *     generated `_shared/core`). Vite strips the type-only `npm:` imports,
 *     and the alias in vitest.config.ts points `_shared/core/*.ts` at
 *     packages/core.
 *   - `fakeSupabase` implements the slice of the query builder the tools and
 *     the core loaders and writers they call use: select, eq, gte, lt, lte,
 *     in, not-in, is, order, range, limit, single, maybeSingle, and the
 *     writes insert, update and upsert (onConflict). It APPLIES each filter
 *     to the fixture rows and returns only the selected columns, so a
 *     missing filter or column changes the answer. It records every query,
 *     so a test can assert which table, columns, filters and pages a tool
 *     read, and every write, so a test can assert what a tool saved. Writes
 *     change the fixture tables, so a later read in the same test sees them.
 *   - Like PostgREST, one response holds at most `max_rows` rows (1000,
 *     `maxRows` to change it) whatever `.limit()` asks for, so a tool that
 *     reads a long list in one request loses rows here as it does live.
 *
 * This is a unit harness for the handlers with stubbed inputs, not an
 * integration test: nothing here proves a column exists in Postgres (a
 * column the fixture lacks comes back null, where PostgREST would return a
 * 400), and no CHECK constraint, foreign key or RLS policy runs. Column
 * names are checked against the migrations when a query is written.
 *
 * A test helper, not a test (no `.test.ts` suffix).
 */

import path from "node:path";
import { MCP_TOOLS_DIR } from "./registry-source";

export type Row = Record<string, unknown>;

export interface RecordedQuery {
  table: string;
  /** The select list, whitespace collapsed. */
  columns: string;
  /** One entry per filter, in call order: `eq(user_id,u1)`, `gte(date,2026-01-01)`. */
  filters: string[];
  limit: number | null;
  /** Set only when `.order()` was called: `trip_date.desc`, `id.asc`. */
  orders?: string[];
  /** Set only when `.range(from, to)` was called. */
  range?: [number, number];
  /** Set only on a write. */
  op?: WriteOp;
}

export type WriteOp = "insert" | "update" | "upsert";

export interface RecordedWrite {
  table: string;
  op: WriteOp;
  /** The rows as written (an insert's defaults filled in), or an update's patch. */
  rows: Row[];
  /** An update's filters, as in RecordedQuery. */
  filters: string[];
  /** An upsert's onConflict columns. */
  onConflict?: string;
}

interface QueryResult {
  data: unknown;
  error: { message: string; code?: string } | null;
}

export interface FakeSupabaseOptions {
  /** Tables whose reads come back as a PostgREST error (`data: null`). */
  failTables?: string[];
  /** Tables whose writes come back as an error, changing nothing. */
  failWrites?: string[];
  /** Column defaults an insert gets, per table (`{ vehicles: { is_active: true } }`). */
  columnDefaults?: Record<string, Row>;
  /** PostgREST's `max_rows`: the most rows one response holds. Default 1000. */
  maxRows?: number;
}

interface QueryBuilder extends PromiseLike<QueryResult> {
  select(columns?: string): QueryBuilder;
  eq(column: string, value: unknown): QueryBuilder;
  gte(column: string, value: unknown): QueryBuilder;
  lt(column: string, value: unknown): QueryBuilder;
  lte(column: string, value: unknown): QueryBuilder;
  in(column: string, values: unknown[]): QueryBuilder;
  not(column: string, operator: string, value: string): QueryBuilder;
  is(column: string, value: unknown): QueryBuilder;
  order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean }): QueryBuilder;
  range(from: number, to: number): QueryBuilder;
  limit(count: number): QueryBuilder;
  insert(rows: Row | Row[]): QueryBuilder;
  update(patch: Row): QueryBuilder;
  upsert(rows: Row | Row[], options?: { onConflict?: string }): QueryBuilder;
  single(): Promise<QueryResult>;
  maybeSingle(): Promise<QueryResult>;
}

export interface FakeSupabase {
  client: { from(table: string): QueryBuilder };
  queries: RecordedQuery[];
  /** Queries against one table, in call order. */
  queriesFor(table: string): RecordedQuery[];
  /** Every write, in the order it ran. */
  writes: RecordedWrite[];
  /** Writes to one table, in the order they ran. */
  writesTo(table: string): RecordedWrite[];
  /** The fixture tables as they are now (writes applied). */
  tables: Record<string, Row[]>;
}

/** Split a select list on top-level commas: `a, b, rel(c, d)` → [a, b, rel(c, d)]. */
function splitSelect(columns: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of columns) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

/** Keep only the selected columns. An embedded relation (`rel(...)`) is passed through whole. */
function project(row: Row, columns: string): Row {
  const parts = splitSelect(columns);
  if (parts.includes("*")) return { ...row };
  const out: Row = {};
  for (const part of parts) {
    const name = part.includes("(") ? part.slice(0, part.indexOf("(")).trim() : part;
    out[name] = row[name] ?? null;
  }
  return out;
}

const compare = (a: unknown, b: unknown) => {
  const x = String(a);
  const y = String(b);
  return x < y ? -1 : x > y ? 1 : 0;
};

/** Postgres ordering of two non-null values: numbers as numbers, the rest as text. */
const compareValues = (a: unknown, b: unknown) =>
  typeof a === "number" && typeof b === "number" ? a - b : compare(a, b);

interface OrderKey {
  column: string;
  ascending: boolean;
  /** Postgres default: nulls last ascending, first descending. */
  nullsFirst: boolean;
}

function sortRows(rows: Row[], keys: OrderKey[]): Row[] {
  if (keys.length === 0) return rows;
  return [...rows].sort((a, b) => {
    for (const k of keys) {
      const x = a[k.column] ?? null;
      const y = b[k.column] ?? null;
      if (x === null && y === null) continue;
      if (x === null) return k.nullsFirst ? -1 : 1;
      if (y === null) return k.nullsFirst ? 1 : -1;
      const c = compareValues(x, y);
      if (c !== 0) return k.ascending ? c : -c;
    }
    return 0;
  });
}

export function fakeSupabase(
  tables: Record<string, Row[]>,
  { failTables = [], failWrites = [], columnDefaults = {}, maxRows = 1000 }: FakeSupabaseOptions = {},
): FakeSupabase {
  const queries: RecordedQuery[] = [];
  const writes: RecordedWrite[] = [];
  let nextId = 1;

  const from = (table: string): QueryBuilder => {
    let rows: Row[] = [...(tables[table] ?? [])];
    const query: RecordedQuery = { table, columns: "*", filters: [], limit: null };
    queries.push(query);
    const orderKeys: OrderKey[] = [];
    let range: [number, number] | null = null;
    let limit: number | null = null;

    // A write runs once, when the builder is awaited (or single/maybeSingle).
    let write: { op: WriteOp; rows: Row[]; onConflict?: string } | null = null;
    let selectedAfterWrite = false;
    let writeResult: Row[] | null = null;
    let writeError: QueryResult["error"] = null;

    /** The rows a read returns: filtered (as the calls ran), ordered, paged, capped. */
    const readRows = (): Row[] => {
      let out = sortRows(rows, orderKeys);
      if (range) out = out.slice(range[0], range[1] + 1);
      if (limit != null) out = out.slice(0, limit);
      return out.slice(0, maxRows).map((r) => project(r, query.columns));
    };
    const readFailure: QueryResult | null = failTables.includes(table)
      ? { data: null, error: { message: `simulated read failure on ${table}` } }
      : null;

    const runWrite = () => {
      if (!write || writeResult || writeError) return;
      if (failWrites.includes(table)) {
        writeError = { message: `simulated write failure on ${table}` };
        return;
      }
      const target = (tables[table] ??= []);
      const recorded: RecordedWrite = { table, op: write.op, rows: [], filters: [...query.filters] };
      if (write.onConflict) recorded.onConflict = write.onConflict;
      const withDefaults = (row: Row): Row => {
        const now = new Date().toISOString();
        return {
          id: `${table}-new-${nextId++}`,
          created_at: now,
          updated_at: now,
          ...(columnDefaults[table] ?? {}),
          ...row,
        };
      };
      if (write.op === "insert") {
        const inserted = write.rows.map(withDefaults);
        target.push(...inserted);
        recorded.rows = inserted.map((r) => ({ ...r }));
        writeResult = inserted;
      } else if (write.op === "update") {
        const patch = write.rows[0];
        for (const r of rows) Object.assign(r, patch);
        recorded.rows = [{ ...patch }];
        writeResult = rows;
      } else {
        const keys = (write.onConflict ?? "id").split(",").map((c) => c.trim());
        const out: Row[] = [];
        for (const row of write.rows) {
          const existing = target.find((r) => keys.every((k) => r[k] === row[k]));
          if (existing) {
            Object.assign(existing, row);
            out.push(existing);
          } else {
            const inserted = withDefaults(row);
            target.push(inserted);
            out.push(inserted);
          }
        }
        recorded.rows = out.map((r) => ({ ...r }));
        writeResult = out;
      }
      writes.push(recorded);
    };

    /** A write's result: the written rows when `.select()` followed it, else null. */
    const writeOutcome = (): QueryResult => {
      runWrite();
      if (writeError) return { data: null, error: writeError };
      return { data: selectedAfterWrite ? (writeResult ?? []).map((r) => project(r, query.columns)) : null, error: null };
    };

    const startWrite = (op: WriteOp, input: Row | Row[], onConflict?: string) => {
      write = { op, rows: Array.isArray(input) ? input : [input], ...(onConflict ? { onConflict } : {}) };
      query.op = op;
      return builder;
    };

    const builder: QueryBuilder = {
      select(columns = "*") {
        query.columns = columns.replace(/\s+/g, " ").trim();
        if (write) selectedAfterWrite = true;
        return builder;
      },
      eq(column, value) {
        query.filters.push(`eq(${column},${String(value)})`);
        rows = rows.filter((r) => r[column] === value);
        return builder;
      },
      gte(column, value) {
        query.filters.push(`gte(${column},${String(value)})`);
        rows = rows.filter((r) => r[column] != null && compare(r[column], value) >= 0);
        return builder;
      },
      lt(column, value) {
        query.filters.push(`lt(${column},${String(value)})`);
        rows = rows.filter((r) => r[column] != null && compare(r[column], value) < 0);
        return builder;
      },
      lte(column, value) {
        query.filters.push(`lte(${column},${String(value)})`);
        rows = rows.filter((r) => r[column] != null && compare(r[column], value) <= 0);
        return builder;
      },
      in(column, values) {
        query.filters.push(`in(${column},${values.map(String).join("|")})`);
        rows = rows.filter((r) => values.includes(r[column]));
        return builder;
      },
      not(column, operator, value) {
        if (operator !== "in") throw new Error(`fakeSupabase: not(${operator}) is not implemented`);
        const excluded = value.replace(/^\(|\)$/g, "").split(",").map((v) => v.trim());
        query.filters.push(`not.in(${column},${excluded.join("|")})`);
        rows = rows.filter((r) => !excluded.includes(String(r[column])));
        return builder;
      },
      is(column, value) {
        query.filters.push(`is(${column},${String(value)})`);
        rows = rows.filter((r) => (r[column] ?? null) === value);
        return builder;
      },
      order(column, options = {}) {
        const ascending = options.ascending ?? true;
        orderKeys.push({ column, ascending, nullsFirst: options.nullsFirst ?? !ascending });
        (query.orders ??= []).push(`${column}.${ascending ? "asc" : "desc"}`);
        return builder;
      },
      range(fromRow, toRow) {
        range = [fromRow, toRow];
        query.range = [fromRow, toRow];
        return builder;
      },
      limit(count) {
        query.limit = count;
        limit = count;
        return builder;
      },
      insert(input) {
        return startWrite("insert", input);
      },
      update(patch) {
        return startWrite("update", patch);
      },
      upsert(input, options = {}) {
        return startWrite("upsert", input, options.onConflict);
      },
      single() {
        if (write) {
          const res = writeOutcome();
          if (res.error) return Promise.resolve(res);
          const data = (res.data as Row[] | null) ?? [];
          return Promise.resolve(
            data.length === 1
              ? { data: data[0], error: null }
              : { data: null, error: { message: "JSON object requested, multiple (or no) rows returned", code: "PGRST116" } },
          );
        }
        if (readFailure) return Promise.resolve(readFailure);
        const data = readRows();
        return Promise.resolve(
          data.length === 1
            ? { data: data[0], error: null }
            : { data: null, error: { message: "JSON object requested, multiple (or no) rows returned", code: "PGRST116" } },
        );
      },
      maybeSingle() {
        if (write) {
          const res = writeOutcome();
          return Promise.resolve(res.error ? res : { data: ((res.data as Row[] | null) ?? [])[0] ?? null, error: null });
        }
        return Promise.resolve(readFailure ?? { data: readRows()[0] ?? null, error: null });
      },
      then(onfulfilled, onrejected) {
        const result: QueryResult = write ? writeOutcome() : (readFailure ?? { data: readRows(), error: null });
        return Promise.resolve(result).then(onfulfilled, onrejected);
      },
    };
    return builder;
  };

  return {
    client: { from },
    queries,
    queriesFor: (table) => queries.filter((q) => q.table === table),
    writes,
    writesTo: (table) => writes.filter((w) => w.table === table),
    tables,
  };
}

// ── Loading the real tools ─────────────────────────────────────────────────

interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

export interface LoadedTool {
  name: string;
  description: string;
  handler: (args: unknown) => Promise<ToolResult>;
}

type ToolFactory = (supabase: unknown, userId: string) => LoadedTool[];

/**
 * Import a tool file from the edge function and build its tools.
 * `factory` is the export name, e.g. "getAnalyticsTools".
 */
export async function loadTools(
  file: string,
  factory: string,
  supabase: FakeSupabase,
  userId: string,
): Promise<LoadedTool[]> {
  // A computed specifier: tsc must not follow this import (see the header).
  const modulePath = path.join(MCP_TOOLS_DIR, file);
  const mod: Record<string, ToolFactory | undefined> = await import(/* @vite-ignore */ modulePath);
  const build = mod[factory];
  if (typeof build !== "function") {
    throw new Error(`${file} does not export ${factory}`);
  }
  return build(supabase.client, userId);
}

/**
 * Call a tool and parse the JSON it returns as text. `T` names the fields a
 * test reads; the JSON itself is whatever the handler produced.
 */
export async function callTool<T = Record<string, unknown>>(
  tools: LoadedTool[],
  name: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`tool "${name}" is not registered`);
  const result = await tool.handler(args);
  return JSON.parse(result.content[0].text);
}
