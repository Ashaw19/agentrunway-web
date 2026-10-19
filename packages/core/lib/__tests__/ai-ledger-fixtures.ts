/**
 * Synthetic AI ledger rows and an in-memory stand-in for the slice of the
 * supabase-js client that ai-undo.ts and ai-activity-load.ts use. A test
 * helper, not a test. Every name and amount is made up.
 *
 * FakeDb applies eq/gte filters, honours `.select()` after a write (returns
 * the affected rows), refuses a duplicate key on insert (23505) and serves
 * RPCs from handlers the test supplies, so a missing filter or a wrong
 * table changes the result.
 */
import type { AiRunWrite } from "../../types/database";

let n = 0;
export function write(over: Partial<AiRunWrite>): AiRunWrite {
  n += 1;
  return {
    id: `w${n}`,
    user_id: "u1",
    ai_run_id: null,
    request_id: null,
    tool_call_id: "call-1",
    tool_name: "logExpense",
    source: "approval",
    seq: 0,
    table_name: "receipt_expenses",
    row_id: "r1",
    action: "insert",
    before_image: null,
    after_image: { id: "r1", vendor: "Staples", total_amount: 45 },
    outcome: "ok",
    error_class: null,
    irreversible_reason: null,
    undone_at: null,
    created_at: "2026-10-18T14:00:00.000Z",
    ...over,
  };
}

type Row = Record<string, unknown>;
type Result = { data: unknown; error: { message: string; code?: string } | null; count?: number | null };
type RpcHandler = (args: Record<string, unknown>, db: FakeDb) => Result;

export class FakeDb {
  tables: Record<string, Row[]>;
  rpcs: Record<string, RpcHandler>;
  log: string[] = [];

  constructor(tables: Record<string, Row[]>, rpcs: Record<string, RpcHandler> = {}) {
    this.tables = Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, v.map((r) => ({ ...r }))]));
    this.rpcs = rpcs;
  }

  rows(table: string): Row[] {
    return (this.tables[table] ??= []);
  }

  rpc(fn: string, args: Record<string, unknown> = {}): Promise<Result> {
    this.log.push(`rpc ${fn}`);
    const h = this.rpcs[fn];
    return Promise.resolve(h ? h(args, this) : { data: null, error: { message: `no rpc ${fn}` } });
  }

  from(table: string) {
    return new FakeQuery(this, table);
  }
}

class FakeQuery implements PromiseLike<Result> {
  private op: "select" | "insert" | "update" | "delete" = "select";
  private filters: Array<[string, "eq" | "gte" | "gt" | "neq", unknown]> = [];
  private payload: unknown = null;
  private returning = false;
  private single: "maybe" | null = null;
  private head = false;
  private ascending: { col: string; asc: boolean } | null = null;
  private max: number | null = null;
  private skip = 0;

  constructor(private db: FakeDb, private table: string) {}

  select(_cols?: string, opts?: { head?: boolean; count?: string }) {
    if (this.op === "select") this.head = Boolean(opts?.head);
    else this.returning = true;
    return this;
  }
  insert(v: unknown) { this.op = "insert"; this.payload = v; return this; }
  update(v: unknown) { this.op = "update"; this.payload = v; return this; }
  delete() { this.op = "delete"; return this; }
  eq(col: string, v: unknown) { this.filters.push([col, "eq", v]); return this; }
  gte(col: string, v: unknown) { this.filters.push([col, "gte", v]); return this; }
  gt(col: string, v: unknown) { this.filters.push([col, "gt", v]); return this; }
  neq(col: string, v: unknown) { this.filters.push([col, "neq", v]); return this; }
  order(col: string, opts?: { ascending?: boolean }) { this.ascending = { col, asc: opts?.ascending !== false }; return this; }
  limit(k: number) { this.max = k; return this; }
  range(from: number, to: number) { this.skip = from; this.max = to - from + 1; return this; }
  maybeSingle() { this.single = "maybe"; return this; }

  private match(r: Row): boolean {
    return this.filters.every(([c, op, v]) =>
      op === "eq" ? r[c] === v
      : op === "neq" ? r[c] !== v
      : op === "gt" ? Date.parse(String(r[c])) > Date.parse(String(v))
      : String(r[c]) >= String(v),
    );
  }

  private run(): Result {
    const rows = this.db.rows(this.table);
    this.db.log.push(`${this.op} ${this.table} ${this.filters.map(([c, , v]) => `${c}=${v}`).join("&")}`);
    if (this.op === "insert") {
      const list = (Array.isArray(this.payload) ? this.payload : [this.payload]) as Row[];
      for (const r of list) {
        if (r.id !== undefined && rows.some((x) => x.id === r.id)) {
          return { data: null, error: { message: "duplicate key", code: "23505" } };
        }
      }
      rows.push(...list.map((r) => ({ ...r })));
      return { data: this.returning ? list : null, error: null };
    }
    const hit = rows.filter((r) => this.match(r));
    if (this.op === "update") {
      for (const r of hit) Object.assign(r, this.payload as Row);
      return { data: this.returning ? hit.map((r) => ({ ...r })) : null, error: null };
    }
    if (this.op === "delete") {
      this.db.tables[this.table] = rows.filter((r) => !hit.includes(r));
      return { data: this.returning ? hit : null, error: null };
    }
    let out = hit.map((r) => ({ ...r }));
    if (this.ascending) {
      const { col, asc } = this.ascending;
      out.sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : String(a[col]) > String(b[col]) ? 1 : 0) * (asc ? 1 : -1));
    }
    // The real API never returns more than 1,000 rows per request.
    out = out.slice(this.skip, this.skip + Math.min(this.max ?? 1000, 1000));
    if (this.head) return { data: null, error: null, count: out.length };
    if (this.single === "maybe") return { data: out[0] ?? null, error: null };
    return { data: out, error: null };
  }

  then<A = Result, B = never>(ok?: ((v: Result) => A | PromiseLike<A>) | null, bad?: ((e: unknown) => B | PromiseLike<B>) | null): PromiseLike<A | B> {
    return Promise.resolve().then(() => this.run()).then(ok, bad);
  }
}

/** fn_ai_row_references over the fake: rows in `children` whose column points at the id. */
export function referencesRpc(children: Array<{ table: string; column: string }>): RpcHandler {
  return (args, db) => {
    const exclude = new Set((args.p_exclude_ids as string[] | undefined) ?? []);
    const data = children
      .map(({ table, column }) => ({
        child_table: table,
        child_column: column,
        refs: db.rows(table).filter((r) => r[column] === args.p_row_id && !exclude.has(String(r.id))).length,
      }))
      .filter((r) => r.refs > 0);
    return { data, error: null };
  };
}

/** fn_mark_ai_writes_undone over the fake ledger. */
export const markUndoneRpc: RpcHandler = (args, db) => {
  const ids = new Set(args.p_write_ids as string[]);
  let marked = 0;
  for (const w of db.rows("ai_run_writes")) {
    if (ids.has(String(w.id)) && w.undone_at === null && w.outcome === "ok") {
      w.undone_at = "2026-10-18T16:00:00.000Z";
      marked += 1;
    }
  }
  return { data: marked, error: null };
};

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b) || (typeof a === "object" && a !== null && typeof b === "object" && b !== null && Object.keys({ ...a, ...b }).every((k) => same((a as Row)[k], (b as Row)[k])));
}

/**
 * fn_ai_undo_apply over the fake, with its rules: every step's `expect` must
 * still match, a client goes through fn_delete_clients, and any failure
 * leaves every table as it was (the steps run on a copy that is kept only
 * if all of them succeed). Then the ledger rows are marked undone.
 */
export const undoApplyRpc: RpcHandler = (args, db) => {
  const saved = JSON.parse(JSON.stringify(db.tables)) as Record<string, Row[]>;
  const fail = (message: string): Result => {
    db.tables = saved;
    return { data: null, error: { message, code: "P0001" } };
  };
  let done = 0;
  for (const step of (args.p_steps as Array<Row>) ?? []) {
    const table = String(step.table);
    const pk = String(step.pk ?? "id");
    const rows = db.rows(table);
    if (step.op === "insert") {
      const row = step.row as Row;
      if (rows.some((r) => r[pk] === row[pk])) return fail(`duplicate key value violates unique constraint on ${table}`);
      rows.push({ ...row });
    } else {
      const current = rows.find((r) => String(r[pk]) === String(step.row_id));
      if (!current) return fail(`ai_undo_gone: ${table} ${step.row_id}`);
      const expect = (step.expect ?? {}) as Row;
      if (Object.keys(expect).some((k) => !same(current[k] ?? null, expect[k] ?? null))) return fail(`ai_undo_changed: ${table} ${step.row_id}`);
      const g = step.no_later as Row | undefined;
      if (g) {
        const excluded = new Set((g.exclude_ids as string[]) ?? []);
        const later = db.rows(String(g.table)).some(
          (r) =>
            String(r[String(g.column)]) === String(g.value) &&
            Date.parse(String(r.created_at)) > Date.parse(String(g.after)) &&
            !excluded.has(String(r.id)) &&
            (g.skip_value === undefined || r[String(g.skip_column)] !== g.skip_value),
        );
        if (later) return fail(`ai_undo_later: ${table} ${step.row_id}`);
      }
      if (step.op === "delete") {
        if (table === "clients") {
          db.log.push("rpc fn_delete_clients");
          const res = db.rpcs.fn_delete_clients?.({ p_client_ids: [step.row_id] }, db);
          const deleted = ((res?.data as { deleted?: string[] } | null)?.deleted ?? []).includes(String(step.row_id));
          if (!deleted) return fail(`ai_undo_archived: ${table} ${step.row_id}`);
        } else {
          db.tables[table] = rows.filter((r) => r !== current);
        }
      } else {
        Object.assign(current, step.set as Row);
      }
    }
    done += 1;
    db.log.push(`apply ${step.op} ${table} ${step.row_id ?? (step.row as Row | undefined)?.[pk] ?? ""}`);
  }
  markUndoneRpc({ p_write_ids: args.p_write_ids }, db);
  return { data: done, error: null };
};
