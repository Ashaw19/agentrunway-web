/**
 * AI write ledger: one `ai_run_writes` row per row a Flight Crew tool wrote
 * (migration 00182), with the row before and after, so the agent can see
 * what changed and undo it (packages/core/lib/ai-undo.ts).
 *
 * How it captures without touching each tool:
 *   - `withWriteLedger(tools, ...)` runs every tool's `execute` inside an
 *     AsyncLocalStorage context naming the tool call.
 *   - `ledgerFetch` is the Supabase client's fetch (lib/supabase/server.ts,
 *     request-user.ts take it as an option). Outside a tool context it is a
 *     plain pass-through. Inside one, for each PostgREST write it reads the
 *     affected rows first (same filters, same signed-in user, so same RLS),
 *     sends the write unchanged, then reads them again by key.
 *   - A plain insert is the one write it alters: it asks PostgREST for the
 *     new rows' keys under a private alias, strips that alias, and hands the
 *     caller exactly the response it asked for. If the altered request is
 *     refused (PostgREST rolled it back), the original is sent unchanged.
 *   - An insert whose trigger changes another row (TRIGGER_SIDE_EFFECTS: a
 *     logged call moves its client's last contact and status) records that
 *     parent row's change too, in the same tool call, so undo puts both back.
 *   - Before a delete it asks fn_ai_row_references what points at each row.
 *     If anything does, the delete will null or cascade those links, which
 *     undo can't put back, so the write is marked irreversible.
 *   - A write PostgREST refuses is recorded too (outcome "error", the
 *     Postgres code), so a broken write path shows within a day
 *     (db-health, chat diagnostics) instead of months later.
 *   - The ledger's own reads carry the request's abort signal.
 *
 * Not captured: RPC calls (fn_delete_clients and friends), Storage, and
 * writes made through the service-role client. A tool whose write is an RPC
 * can read the rows it touches before and after and hand them to
 * recordToolRpcWrites (statement imports' confirm and match do). AI-written message text in
 * draft tables is stored as a length and hash (redactRow).
 *
 * Capture never changes what the caller sees or blocks the reply: every
 * capture step is guarded, and the ledger insert runs in the background.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import type { ToolSet } from "ai";
import {
  LEDGER_TABLES,
  TRIGGER_SIDE_EFFECTS,
  jsonEqual,
  primaryKeyOf,
  redactRow,
  tableLabel,
} from "@agent-runway/core/lib/ai-activity";
import type { AiRunWrite, AiWriteAction, AiWriteSource } from "@agent-runway/core/types/database";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorClass, latestRunIdForRequest, runInBackground } from "./run-ledger";

/** More rows than this in one write: recorded without images (not undoable). */
export const MAX_CAPTURED_ROWS = 100;

/** Deleted rows checked for links one by one; more than this and the delete is marked irreversible. */
export const MAX_REFERENCE_CHECKS = 20;

/** The alias the insert capture reads new keys under, stripped before the caller sees the rows. */
export const LEDGER_KEY_ALIAS = "__ar_ledger_key";

type Row = Record<string, unknown>;

export interface ToolWriteContext {
  userId: string;
  toolName: string;
  toolCallId: string;
  requestId: string | null;
  source: AiWriteSource;
  /** Next write's order within the tool call. */
  seq: number;
}

const toolContext = new AsyncLocalStorage<ToolWriteContext>();

/** The tool call running now, if any (for tests and diagnostics). */
export function currentToolWriteContext(): ToolWriteContext | undefined {
  return toolContext.getStore();
}

export type AiRunWriteInsert = Omit<AiRunWrite, "id" | "created_at" | "undone_at">;

// ── Recording ───────────────────────────────────────────────────────────────

async function insertWrites(rows: AiRunWriteInsert[]): Promise<void> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("ai_run_writes").insert(rows);
    if (error) console.warn("[ai-ledger] ai_run_writes insert failed:", error.code ?? "", error.message);
  } catch (err) {
    if (process.env.NODE_ENV === "production") console.warn("[ai-ledger] ai_run_writes insert threw:", errorClass(err));
  }
}

let recordWrites: (rows: AiRunWriteInsert[]) => void = (rows) => runInBackground(() => insertWrites(rows));

/** Swapped in tests to capture rows instead of writing them. */
export function setAIWriteRecorderForTests(fn: ((rows: AiRunWriteInsert[]) => void) | null): void {
  recordWrites = fn ?? ((rows) => runInBackground(() => insertWrites(rows)));
}

function record(rows: AiRunWriteInsert[]): void {
  if (rows.length === 0) return;
  try {
    recordWrites(rows);
  } catch {
    // never reaches the tool
  }
}

// ── Writes made through an RPC ──────────────────────────────────────────────

/** One row an RPC changed, as the tool read it before and after. */
export interface RpcWriteEntry {
  table: string;
  action: AiWriteAction;
  rowId: string;
  before: Row | null;
  after: Row | null;
}

/**
 * Rows a tool changed through an RPC function, which the ledger fetch can't
 * see inside: the tool reads them before and after the call and hands them
 * here. They are recorded under the running tool call as one step, each
 * marked irreversible with `irreversible`: undo replays row images, not an
 * RPC's own logic, so it isn't offered. Outside a tool call this does
 * nothing. More than MAX_CAPTURED_ROWS rows are recorded without images.
 */
export function recordToolRpcWrites(entries: readonly RpcWriteEntry[], irreversible: string): void {
  const ctx = toolContext.getStore();
  if (!ctx || entries.length === 0) return;
  try {
    const seq = ctx.seq;
    ctx.seq += 1;
    const aiRunId = latestRunIdForRequest(ctx.requestId);
    const images = entries.length <= MAX_CAPTURED_ROWS;
    record(
      entries.map((e) => ({
        user_id: ctx.userId,
        ai_run_id: aiRunId,
        request_id: ctx.requestId,
        tool_call_id: ctx.toolCallId,
        tool_name: ctx.toolName,
        source: ctx.source,
        seq,
        table_name: e.table,
        row_id: String(e.rowId).slice(0, 100),
        action: e.action,
        before_image: images ? redactRow(e.table, e.before) : null,
        after_image: images ? redactRow(e.table, e.after) : null,
        outcome: "ok" as const,
        error_class: null,
        irreversible_reason: irreversible.slice(0, 300),
      })),
    );
  } catch {
    // capture only
  }
}

// ── Tool wrapping ───────────────────────────────────────────────────────────

/**
 * The same tools, each run inside a ledger context so the writes it makes
 * through a `ledgerFetch` client are recorded under its tool call.
 */
export function withWriteLedger(
  tools: ToolSet,
  opts: { userId: string; requestId?: string | null; source: AiWriteSource },
): ToolSet {
  const out: ToolSet = {};
  for (const [name, t] of Object.entries(tools)) {
    const execute = (t as { execute?: unknown }).execute;
    if (typeof execute !== "function") {
      out[name] = t;
      continue;
    }
    const run = execute as (input: unknown, options: unknown) => unknown;
    out[name] = {
      ...t,
      execute: (input: unknown, options: unknown) => {
        const toolCallId =
          (options as { toolCallId?: unknown } | undefined)?.toolCallId;
        const ctx: ToolWriteContext = {
          userId: opts.userId,
          toolName: name,
          toolCallId: typeof toolCallId === "string" && toolCallId ? toolCallId.slice(0, 120) : crypto.randomUUID(),
          requestId: opts.requestId ?? null,
          source: opts.source,
          seq: 0,
        };
        return toolContext.run(ctx, () => run(input, options));
      },
    } as ToolSet[string];
  }
  return out;
}

// ── PostgREST write capture ─────────────────────────────────────────────────

type WriteKind = "insert" | "upsert" | "update" | "delete";

interface WritePlan {
  kind: WriteKind;
  table: string;
  pk: string;
  url: URL;
  headers: Headers;
  body: string | null;
  /** The request's abort signal: the ledger's own reads stop with it. */
  signal: AbortSignal | null;
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

/** What a request writes, or null when it isn't a table write. */
export function planWrite(input: RequestInfo | URL, init?: RequestInit): WritePlan | null {
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  if (method !== "POST" && method !== "PATCH" && method !== "DELETE") return null;
  const url = new URL(requestUrl(input));
  const m = url.pathname.match(/\/rest\/v1\/([^/]+)$/);
  if (!m) return null; // rpc/<fn>, storage, auth
  const table = decodeURIComponent(m[1]);
  if (table === "rpc" || LEDGER_TABLES.has(table)) return null;
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
  const prefer = headers.get("prefer") ?? "";
  const kind: WriteKind =
    method === "PATCH" ? "update"
    : method === "DELETE" ? "delete"
    : /resolution=(merge|ignore)-duplicates/.test(prefer) ? "upsert"
    : "insert";
  const body = typeof init?.body === "string" ? init.body : null;
  const signal = init?.signal ?? (input instanceof Request ? input.signal : null);
  return { kind, table, pk: primaryKeyOf(table), url, headers, body, signal };
}

/** Headers for the ledger's own reads: the same user, plain JSON. */
function readHeaders(plan: WritePlan): Headers {
  const h = new Headers();
  for (const name of ["authorization", "apikey", "x-client-info"]) {
    const v = plan.headers.get(name);
    if (v) h.set(name, v);
  }
  const profile = plan.headers.get("content-profile") ?? plan.headers.get("accept-profile");
  if (profile) h.set("accept-profile", profile);
  h.set("accept", "application/json");
  return h;
}

/** The write's row filters, without its select/paging. */
function filterParams(url: URL): URLSearchParams {
  const params = new URLSearchParams(url.search);
  for (const k of ["select", "columns", "on_conflict", "limit", "offset", "order"]) params.delete(k);
  return params;
}

function quoteValue(v: unknown): string {
  return `"${String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

async function selectRowsOf(
  base: typeof fetch,
  plan: WritePlan,
  table: string,
  filters: URLSearchParams,
): Promise<Row[] | null> {
  try {
    const u = new URL(`${plan.url.origin}/rest/v1/${encodeURIComponent(table)}`);
    u.searchParams.set("select", "*");
    for (const [k, v] of filters) u.searchParams.append(k, v);
    u.searchParams.set("limit", String(MAX_CAPTURED_ROWS + 1));
    const res = await base(u.toString(), { method: "GET", headers: readHeaders(plan), signal: plan.signal ?? undefined });
    if (!res.ok) return null;
    const data = (await res.json()) as unknown;
    return Array.isArray(data) ? (data as Row[]) : null;
  } catch {
    return null;
  }
}

const selectRows = (base: typeof fetch, plan: WritePlan, filters: URLSearchParams) =>
  selectRowsOf(base, plan, plan.table, filters);

async function selectByKeys(base: typeof fetch, plan: WritePlan, keys: unknown[]): Promise<Row[] | null> {
  if (keys.length === 0) return [];
  const filters = new URLSearchParams();
  filters.set(plan.pk, `in.(${keys.map(quoteValue).join(",")})`);
  return selectRows(base, plan, filters);
}

/**
 * What points at a row (fn_ai_row_references, the caller's own RLS). Null
 * when it couldn't be checked; "-1" counts mean a table the caller can't
 * read, which counts as linked.
 */
async function referencesTo(
  base: typeof fetch,
  plan: WritePlan,
  rowId: string,
): Promise<Array<{ child_table: string; refs: number }> | null> {
  try {
    const headers = readHeaders(plan);
    headers.set("content-type", "application/json");
    const res = await base(`${plan.url.origin}/rest/v1/rpc/fn_ai_row_references`, {
      method: "POST",
      headers,
      body: JSON.stringify({ p_table: plan.table, p_row_id: rowId }),
      signal: plan.signal ?? undefined,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{ child_table: string; refs: number | string }>;
    return (Array.isArray(data) ? data : []).map((r) => ({ child_table: r.child_table, refs: Number(r.refs) }));
  } catch {
    return null;
  }
}

async function errorCode(res: Response): Promise<string> {
  try {
    const text = await res.clone().text();
    const code = (JSON.parse(text) as { code?: unknown }).code;
    if (typeof code === "string" && code) return code.slice(0, 120);
  } catch {
    // not JSON
  }
  return `http ${res.status}`;
}

function rowsOf(body: string | null): Row[] | null {
  if (!body) return null;
  try {
    const v = JSON.parse(body) as unknown;
    if (Array.isArray(v)) return v.filter((x): x is Row => typeof x === "object" && x !== null);
    return typeof v === "object" && v !== null ? [v as Row] : null;
  } catch {
    return null;
  }
}

interface Captured {
  table?: string;
  action: AiWriteAction;
  rowId: string | null;
  before: Row | null;
  after: Row | null;
  irreversible?: string | null;
}

function toInserts(ctx: ToolWriteContext, plan: WritePlan, seq: number, captured: Captured[]): AiRunWriteInsert[] {
  const aiRunId = latestRunIdForRequest(ctx.requestId);
  return captured.map((c) => {
    const table = c.table ?? plan.table;
    return {
      user_id: ctx.userId,
      ai_run_id: aiRunId,
      request_id: ctx.requestId,
      tool_call_id: ctx.toolCallId,
      tool_name: ctx.toolName,
      source: ctx.source,
      seq,
      table_name: table,
      row_id: c.rowId === null ? null : String(c.rowId).slice(0, 100),
      action: c.action,
      before_image: redactRow(table, c.before),
      after_image: redactRow(table, c.after),
      outcome: "ok" as const,
      error_class: null,
      irreversible_reason: c.irreversible ? c.irreversible.slice(0, 300) : null,
    };
  });
}

function failedWrite(ctx: ToolWriteContext, plan: WritePlan, seq: number, code: string): AiRunWriteInsert {
  return {
    user_id: ctx.userId,
    ai_run_id: latestRunIdForRequest(ctx.requestId),
    request_id: ctx.requestId,
    tool_call_id: ctx.toolCallId,
    tool_name: ctx.toolName,
    source: ctx.source,
    seq,
    table_name: plan.table,
    row_id: null,
    action: plan.kind === "upsert" ? "insert" : plan.kind,
    before_image: null,
    after_image: null,
    outcome: "error",
    error_class: code,
    irreversible_reason: null,
  };
}

/** A write whose rows couldn't be read: on the record, but not undoable. */
function uncapturedWrite(ctx: ToolWriteContext, plan: WritePlan, seq: number): AiRunWriteInsert {
  return { ...failedWrite(ctx, plan, seq, ""), outcome: "ok", error_class: null };
}

const keyOf = (pk: string, row: Row | null | undefined): string | null => {
  const v = row?.[pk];
  return v === undefined || v === null ? null : String(v);
};

/** Why deleting these rows can't be undone, per row key (null: it can). */
async function deleteIrreversibility(base: typeof fetch, plan: WritePlan, rows: Row[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  const keys = rows.map((r) => keyOf(plan.pk, r)).filter((k): k is string => k !== null);
  if (plan.pk !== "id") {
    for (const k of keys) out.set(k, null);
    return out;
  }
  if (keys.length > MAX_REFERENCE_CHECKS) {
    for (const k of keys) out.set(k, `Too many records were deleted at once (${keys.length}) to check what was linked to them, so undo isn't offered.`);
    return out;
  }
  const checks = await Promise.all(keys.map((k) => referencesTo(base, plan, k)));
  keys.forEach((k, i) => {
    const refs = checks[i];
    if (refs === null) {
      out.set(k, "Agent Runway couldn't check what was linked to it when it was deleted, so undo isn't offered.");
      return;
    }
    const linked = refs.filter((r) => r.refs !== 0);
    out.set(
      k,
      linked.length
        ? `Other records were linked to it when it was deleted (${linked
            .map((r) => (r.refs < 0 ? tableLabel(r.child_table, true) : `${r.refs} ${tableLabel(r.child_table, r.refs !== 1)}`))
            .join(", ")}), and undo can't put those links back.`
        : null,
    );
  });
  return out;
}

async function captureUpdateOrDelete(
  base: typeof fetch,
  plan: WritePlan,
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  ctx: ToolWriteContext,
  seq: number,
): Promise<Response> {
  const before = await selectRows(base, plan, filterParams(plan.url));
  const deleteLinks =
    plan.kind === "delete" && before && before.length <= MAX_CAPTURED_ROWS
      ? await deleteIrreversibility(base, plan, before)
      : null;
  const res = await base(input, init);
  if (!res.ok) {
    record([failedWrite(ctx, plan, seq, await errorCode(res))]);
    return res;
  }
  try {
    if (!before || before.length > MAX_CAPTURED_ROWS) {
      record([uncapturedWrite(ctx, plan, seq)]);
      return res;
    }
    const captured: Captured[] = [];
    if (plan.kind === "delete") {
      // With no limit, a DELETE removes every row its filters match, which is
      // what `before` read: no second read. With a limit, read back to see
      // which ones went.
      const limited = plan.url.searchParams.has("limit");
      const still = limited
        ? new Set(((await selectByKeys(base, plan, before.map((r) => r[plan.pk]))) ?? before).map((r) => keyOf(plan.pk, r)))
        : new Set<string | null>();
      for (const b of before) {
        const key = keyOf(plan.pk, b);
        if (key === null || still.has(key)) continue;
        captured.push({ action: "delete", rowId: key, before: b, after: null, irreversible: deleteLinks?.get(key) ?? null });
      }
    } else {
      const keys = before.map((r) => r[plan.pk]).filter((k) => k !== undefined && k !== null);
      const after = await selectByKeys(base, plan, keys);
      if (!after) {
        record([uncapturedWrite(ctx, plan, seq)]);
        return res;
      }
      const afterByKey = new Map(after.map((r) => [keyOf(plan.pk, r), r]));
      for (const b of before) {
        const key = keyOf(plan.pk, b);
        if (key === null) continue;
        const a = afterByKey.get(key) ?? null;
        if (!a || !jsonEqual(a, b)) captured.push({ action: "update", rowId: key, before: b, after: a });
      }
    }
    record(toInserts(ctx, plan, seq, captured));
  } catch {
    // capture only
  }
  return res;
}

/** Whether a select list already returns the key under its own name. */
function selectReturnsKey(select: string | null, pk: string): boolean {
  if (select === null) return false;
  return select.split(",").map((s) => s.trim()).some((s) => s === "*" || s === pk);
}

/** The new rows as the caller asked for them: the ledger's key alias taken out. */
function withoutLedgerKey(text: string): string {
  try {
    const v = JSON.parse(text) as unknown;
    const strip = (r: unknown) => {
      if (r && typeof r === "object") delete (r as Row)[LEDGER_KEY_ALIAS];
      return r;
    };
    return JSON.stringify(Array.isArray(v) ? v.map(strip) : strip(v));
  } catch {
    return text;
  }
}

/**
 * Parent rows a trigger on this table will change, per TRIGGER_SIDE_EFFECTS.
 * `unreadable` says why they can't be captured (then the insert is marked
 * irreversible: undoing it would leave what the trigger did).
 */
function sideEffectTargets(plan: WritePlan): {
  applies: boolean;
  targets: Array<{ table: string; ids: string[] }>;
  unreadable: string | null;
} {
  const effects = TRIGGER_SIDE_EFFECTS[plan.table];
  if (!effects?.length) return { applies: false, targets: [], unreadable: null };
  const parents = effects.map((e) => tableLabel(e.parentTable)).join(" and ");
  const body = rowsOf(plan.body);
  if (!body) return { applies: true, targets: [], unreadable: `Agent Runway couldn't record what this did to the ${parents}, so undo isn't offered.` };
  if (body.length > MAX_REFERENCE_CHECKS) {
    return { applies: true, targets: [], unreadable: `Too many were logged at once (${body.length}) to record what they did to the ${parents}, so undo isn't offered.` };
  }
  const targets = effects
    .map((e) => ({
      table: e.parentTable,
      ids: [...new Set(body.map((r) => r[e.foreignKey]).filter((v): v is string => typeof v === "string" && v.length > 0))],
    }))
    .filter((t) => t.ids.length > 0);
  return { applies: true, targets, unreadable: null };
}

async function readParents(base: typeof fetch, plan: WritePlan, targets: Array<{ table: string; ids: string[] }>) {
  return Promise.all(
    targets.map(async (t) => {
      const filters = new URLSearchParams();
      filters.set(primaryKeyOf(t.table), `in.(${t.ids.map(quoteValue).join(",")})`);
      return { table: t.table, rows: await selectRowsOf(base, plan, t.table, filters) };
    }),
  );
}

async function captureInsert(
  base: typeof fetch,
  plan: WritePlan,
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  ctx: ToolWriteContext,
  seq: number,
): Promise<Response> {
  const prefer = plan.headers.get("prefer") ?? "";
  const wantsRows = /return=representation/.test(prefer);
  const select = plan.url.searchParams.get("select");
  // The new rows' keys, under an alias the caller never sees: no extra `id`
  // in their rows, no clash with an `id:` alias of their own.
  const keyColumn = wantsRows && selectReturnsKey(select, plan.pk) ? plan.pk : LEDGER_KEY_ALIAS;
  const url = new URL(plan.url.href);
  const headers = new Headers(plan.headers);
  if (!wantsRows) {
    const rest = prefer.split(",").map((s) => s.trim()).filter((s) => s && !s.startsWith("return="));
    headers.set("prefer", [...rest, "return=representation"].join(","));
    url.searchParams.set("select", `${LEDGER_KEY_ALIAS}:${plan.pk}`);
  } else if (keyColumn === LEDGER_KEY_ALIAS) {
    url.searchParams.set("select", `${select ?? "*"},${LEDGER_KEY_ALIAS}:${plan.pk}`);
  }

  const sideEffects = sideEffectTargets(plan);
  const targets = sideEffects.targets;
  const parentsBefore = targets.length ? await readParents(base, plan, targets) : [];

  const res = await base(url.toString(), { ...init, headers });
  if (!res.ok) {
    // A 5xx (a gateway timeout, a 502) can arrive after the insert committed:
    // resending would write it twice. Hand that one back as it is.
    if (res.status < 400 || res.status >= 500) {
      record([failedWrite(ctx, plan, seq, await errorCode(res))]);
      return res;
    }
    // A 4xx: PostgREST refused, so nothing was written. Send the caller's own
    // request unchanged, so they see exactly what it does without us.
    const original = await base(input, init);
    if (!original.ok) {
      record([failedWrite(ctx, plan, seq, await errorCode(original))]);
    } else {
      record([uncapturedWrite(ctx, plan, seq)]);
    }
    return original;
  }
  const text = await res.text();
  const passHeaders = new Headers(res.headers);
  passHeaders.delete("content-length");
  // What the caller asked for: no body unless it asked for rows, and never
  // the ledger's key alias.
  const reply = wantsRows
    ? new Response(keyColumn === LEDGER_KEY_ALIAS ? withoutLedgerKey(text) : text, { status: res.status, statusText: res.statusText, headers: passHeaders })
    : new Response(null, { status: res.status, statusText: res.statusText, headers: passHeaders });

  try {
    const inserted = rowsOf(text);
    const keys = (inserted ?? []).map((r) => r[keyColumn]).filter((k) => k !== undefined && k !== null);
    if (!inserted || keys.length === 0 || keys.length > MAX_CAPTURED_ROWS) {
      record([uncapturedWrite(ctx, plan, seq)]);
      return reply;
    }
    const after = await selectByKeys(base, plan, keys);
    const afterByKey = new Map((after ?? []).map((r) => [keyOf(plan.pk, r), r]));
    const captured: Captured[] = keys.map((k) => ({
      action: "insert" as const,
      rowId: String(k),
      before: null,
      after: afterByKey.get(String(k)) ?? null,
    }));
    // The parent rows the insert's trigger changed (a logged call moves its
    // client's last contact, first contact and status). If they can't be
    // read before AND after, the insert is on the record but not undoable:
    // undoing it alone would leave what the trigger did.
    let unreadable = sideEffects.unreadable;
    if (sideEffects.applies && !unreadable && parentsBefore.length) {
      const parentsAfter = await readParents(base, plan, targets);
      if (parentsBefore.some((p) => p.rows === null) || parentsAfter.some((p) => p.rows === null)) {
        unreadable = `Agent Runway couldn't record what this did to the ${targets.map((t) => tableLabel(t.table)).join(" and ")}, so undo isn't offered.`;
      } else {
        parentsBefore.forEach((p, i) => {
          const pk = primaryKeyOf(p.table);
          const afterRows = new Map((parentsAfter[i]?.rows ?? []).map((r) => [keyOf(pk, r), r]));
          for (const b of p.rows ?? []) {
            const key = keyOf(pk, b);
            const a = key === null ? null : afterRows.get(key) ?? null;
            if (key !== null && a && !jsonEqual(a, b)) {
              captured.push({ table: p.table, action: "update", rowId: key, before: b, after: a });
            }
          }
        });
      }
    }
    if (unreadable) for (const c of captured) c.irreversible = unreadable;
    record(toInserts(ctx, plan, seq, captured));
  } catch {
    // capture only
  }
  return reply;
}

/** Filters that find the row an upsert body row lands on (its conflict columns). */
function conflictFilters(plan: WritePlan, row: Row): URLSearchParams | null {
  const columns = (plan.url.searchParams.get("on_conflict") ?? plan.pk).split(",").map((c) => c.trim()).filter(Boolean);
  const params = new URLSearchParams();
  for (const c of columns) {
    const v = row[c];
    if (v === undefined || v === null || typeof v === "object") return null;
    params.append(c, `eq.${String(v)}`);
  }
  return params;
}

async function captureUpsert(
  base: typeof fetch,
  plan: WritePlan,
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  ctx: ToolWriteContext,
  seq: number,
): Promise<Response> {
  const bodyRows = rowsOf(plan.body);
  const filters = bodyRows && bodyRows.length <= 20 ? bodyRows.map((r) => conflictFilters(plan, r)) : null;
  const before = filters && !filters.includes(null)
    ? await Promise.all(filters.map((f) => selectRows(base, plan, f as URLSearchParams)))
    : null;

  const res = await base(input, init);
  if (!res.ok) {
    record([failedWrite(ctx, plan, seq, await errorCode(res))]);
    return res;
  }
  try {
    if (!filters || !before || before.some((b) => b === null)) {
      record([uncapturedWrite(ctx, plan, seq)]);
      return res;
    }
    const after = await Promise.all(filters.map((f) => selectRows(base, plan, f as URLSearchParams)));
    const captured: Captured[] = [];
    filters.forEach((_, i) => {
      const b = before[i]?.[0] ?? null;
      const a = after[i]?.[0] ?? null;
      if (!a) return;
      if (!b) captured.push({ action: "insert", rowId: keyOf(plan.pk, a), before: null, after: a });
      else if (!jsonEqual(a, b)) captured.push({ action: "update", rowId: keyOf(plan.pk, a), before: b, after: a });
    });
    record(toInserts(ctx, plan, seq, captured));
  } catch {
    // capture only
  }
  return res;
}

/**
 * A fetch for the Supabase client that records the writes a Flight Crew
 * tool makes (see the file comment). `base` defaults to the global fetch,
 * looked up at call time.
 */
export function createLedgerFetch(base?: typeof fetch): typeof fetch {
  const send: typeof fetch = base ?? ((input, init) => fetch(input, init));
  return async (input, init) => {
    const ctx = toolContext.getStore();
    if (!ctx) return send(input, init);
    let plan: WritePlan | null = null;
    try {
      plan = planWrite(input, init);
    } catch {
      plan = null;
    }
    if (!plan) return send(input, init);

    const seq = ctx.seq;
    ctx.seq += 1;
    try {
      if (plan.kind === "insert") return await captureInsert(send, plan, input, init, ctx, seq);
      if (plan.kind === "upsert") return await captureUpsert(send, plan, input, init, ctx, seq);
      return await captureUpdateOrDelete(send, plan, input, init, ctx, seq);
    } catch (err) {
      // The write itself threw (network, or the request was aborted). Record
      // it and let the caller see it.
      const cls = errorClass(err);
      record([failedWrite(ctx, plan, seq, cls === "TypeError" ? "network" : cls === "AbortError" ? "aborted" : cls)]);
      throw err;
    }
  };
}

/** The ledger fetch over the global fetch. */
export const ledgerFetch: typeof fetch = createLedgerFetch();
