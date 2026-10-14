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
 *   - `fakeSupabase` implements the slice of the query builder the tools use
 *     (select, eq, gte, lte, in, not-in, is, order, limit, maybeSingle). It
 *     APPLIES each filter to the fixture rows and returns only the selected
 *     columns, so a missing filter or column changes the answer. It also
 *     records every query, so a test can assert which table, columns and
 *     filters a tool read.
 *
 * This is a unit harness for the handlers with stubbed inputs, not an
 * integration test: nothing here proves a column exists in Postgres (a
 * column the fixture lacks comes back null, where PostgREST would return a
 * 400). Column names are checked against the migrations when a query is
 * written. Server limits are not modelled either: PostgREST caps a response
 * at `max_rows` (1000) whatever `.limit()` asks for.
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
}

interface QueryResult {
  data: unknown;
  error: { message: string } | null;
}

export interface FakeSupabaseOptions {
  /** Tables whose reads come back as a PostgREST error (`data: null`). */
  failTables?: string[];
}

interface QueryBuilder extends PromiseLike<QueryResult> {
  select(columns: string): QueryBuilder;
  eq(column: string, value: unknown): QueryBuilder;
  gte(column: string, value: unknown): QueryBuilder;
  lt(column: string, value: unknown): QueryBuilder;
  lte(column: string, value: unknown): QueryBuilder;
  in(column: string, values: unknown[]): QueryBuilder;
  not(column: string, operator: string, value: string): QueryBuilder;
  is(column: string, value: unknown): QueryBuilder;
  order(column: string, options?: unknown): QueryBuilder;
  limit(count: number): QueryBuilder;
  maybeSingle(): Promise<QueryResult>;
}

export interface FakeSupabase {
  client: { from(table: string): QueryBuilder };
  queries: RecordedQuery[];
  /** Queries against one table, in call order. */
  queriesFor(table: string): RecordedQuery[];
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

export function fakeSupabase(
  tables: Record<string, Row[]>,
  { failTables = [] }: FakeSupabaseOptions = {},
): FakeSupabase {
  const queries: RecordedQuery[] = [];

  const from = (table: string): QueryBuilder => {
    let rows: Row[] = [...(tables[table] ?? [])];
    const query: RecordedQuery = { table, columns: "*", filters: [], limit: null };
    queries.push(query);

    const selected = (): Row[] => rows.map((r) => project(r, query.columns));
    const failure: QueryResult | null = failTables.includes(table)
      ? { data: null, error: { message: `simulated read failure on ${table}` } }
      : null;

    const builder: QueryBuilder = {
      select(columns) {
        query.columns = columns.replace(/\s+/g, " ").trim();
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
      order() {
        return builder;
      },
      limit(count) {
        query.limit = count;
        rows = rows.slice(0, count);
        return builder;
      },
      maybeSingle() {
        return Promise.resolve(failure ?? { data: selected()[0] ?? null, error: null });
      },
      then(onfulfilled, onrejected) {
        const result: QueryResult = failure ?? { data: selected(), error: null };
        return Promise.resolve(result).then(onfulfilled, onrejected);
      },
    };
    return builder;
  };

  return {
    client: { from },
    queries,
    queriesFor: (table) => queries.filter((q) => q.table === table),
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
