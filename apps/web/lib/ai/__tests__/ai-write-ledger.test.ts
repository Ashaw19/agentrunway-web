/**
 * The AI write ledger (lib/ai/write-ledger.ts): the writes a Flight Crew
 * tool makes are recorded with the row before and after, and the tool sees
 * exactly the response it would have without the ledger.
 *
 * Runs a REAL supabase-js client (so postgrest-js builds the real requests:
 * Prefer headers, select, on_conflict, columns) against an in-memory
 * PostgREST stand-in that applies eq/in filters, projects `select`, and
 * returns a single object for `.single()`. This is a unit test of the HTTP
 * capture layer; nothing here proves a column exists in Postgres.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { createLedgerFetch, setAIWriteRecorderForTests, withWriteLedger, type AiRunWriteInsert } from "../write-ledger";
import { createAgentTools } from "../tools";
import { actionUndoBlocker, groupWritesIntoActions } from "@agent-runway/core/lib/ai-activity";
import type { AiRunWrite } from "@agent-runway/core/types/database";

type Row = Record<string, unknown>;

interface FakeOptions {
  failInserts?: Record<string, string>;
  /** Refuse a select that uses the ledger's key alias (to prove the original is resent). */
  rejectAliasedSelect?: boolean;
  /** fn_ai_row_references answers, by row id. */
  references?: Record<string, Array<{ child_table: string; refs: number }>>;
  /** AFTER INSERT triggers: run on each inserted row. */
  afterInsert?: Record<string, (row: Row, tables: Record<string, Row[]>) => void>;
  /** A gateway error for inserts into these tables, AFTER the rows are written (a 502 that arrives late). */
  gatewayErrorAfterInsert?: Record<string, number>;
  /** Reads of these tables fail (a blip). */
  failReads?: string[];
}

function fakePostgrest(seed: Record<string, Row[]>, opts: FakeOptions = {}) {
  const tables: Record<string, Row[]> = Object.fromEntries(Object.entries(seed).map(([k, v]) => [k, v.map((r) => ({ ...r }))]));
  const requests: Array<{ method: string; path: string; search: string; prefer: string | null; signal: boolean }> = [];
  let nextId = 1;

  const parseFilters = (params: URLSearchParams) => {
    const out: Array<(r: Row) => boolean> = [];
    for (const [k, v] of params) {
      if (["select", "columns", "on_conflict", "limit", "order", "offset"].includes(k)) continue;
      if (v.startsWith("eq.")) out.push((r) => String(r[k]) === v.slice(3));
      else if (v === "is.null") out.push((r) => r[k] === null || r[k] === undefined);
      else if (v === "not.is.null") out.push((r) => r[k] !== null && r[k] !== undefined);
      else if (v.startsWith("in.(")) {
        const list = v.slice(4, -1).split(",").map((s) => s.replace(/^"|"$/g, ""));
        out.push((r) => list.includes(String(r[k])));
      } else throw new Error(`fake PostgREST: unsupported filter ${k}=${v}`);
    }
    return (r: Row) => out.every((f) => f(r));
  };
  const project = (rows: Row[], select: string | null) => {
    if (!select) return rows.map((r) => ({ ...r }));
    const cols = select.split(",").map((c) => c.trim());
    return rows.map((r) =>
      Object.fromEntries(
        cols.flatMap((c) => {
          if (c === "*") return Object.entries(r);
          const [alias, col] = c.includes(":") ? c.split(":") : [c, c];
          return [[alias, r[col] ?? null]];
        }),
      ),
    );
  };
  const reply = (status: number, rows: Row[] | null, headers: Headers) => {
    if (rows === null) return new Response(null, { status });
    const single = (headers.get("accept") ?? "").includes("vnd.pgrst.object");
    return new Response(JSON.stringify(single ? rows[0] ?? null : rows), { status, headers: { "content-type": "application/json" } });
  };

  const fetchFn: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const method = (init?.method ?? "GET").toUpperCase();
    const headers = new Headers(init?.headers);
    const prefer = headers.get("prefer");
    requests.push({ method, path: url.pathname, search: url.search, prefer, signal: Boolean(init?.signal) });
    const name = url.pathname.split("/").pop()!;
    if (url.pathname.endsWith("/rpc/fn_ai_row_references")) {
      const args = JSON.parse(String(init?.body)) as { p_row_id: string };
      return new Response(JSON.stringify(opts.references?.[args.p_row_id] ?? []), { status: 200 });
    }
    if (url.pathname.includes("/rpc/")) return new Response("null", { status: 200 });
    const rows = (tables[name] ??= []);
    const match = parseFilters(url.searchParams);
    const select = url.searchParams.get("select");
    const wantsRows = (prefer ?? "").includes("return=representation");

    if (method === "GET") {
      if (opts.failReads?.includes(name)) return new Response("upstream error", { status: 503 });
      const limit = Number(url.searchParams.get("limit") ?? Infinity);
      return reply(200, project(rows.filter(match).slice(0, limit), select), headers);
    }
    if (method === "POST") {
      if (opts.rejectAliasedSelect && (select ?? "").includes("__ar_ledger_key")) {
        return new Response(JSON.stringify({ code: "PGRST100", message: "bad select" }), { status: 400 });
      }
      if (opts.failInserts?.[name]) {
        return new Response(JSON.stringify({ code: opts.failInserts[name], message: "column does not exist" }), { status: 400 });
      }
      const body = JSON.parse(String(init?.body)) as Row | Row[];
      const list = Array.isArray(body) ? body : [body];
      const out: Row[] = [];
      const conflict = url.searchParams.get("on_conflict")?.split(",");
      for (const r of list) {
        const existing = conflict ? rows.find((x) => conflict.every((c) => x[c] === r[c])) : undefined;
        if (existing && (prefer ?? "").includes("merge-duplicates")) {
          Object.assign(existing, r, { updated_at: `t${nextId++}` });
          out.push(existing);
        } else {
          const row = { id: `row-${nextId++}`, updated_at: "t0", ...r };
          rows.push(row);
          opts.afterInsert?.[name]?.(row, tables);
          out.push(row);
        }
      }
      if (opts.gatewayErrorAfterInsert?.[name]) return new Response("bad gateway", { status: opts.gatewayErrorAfterInsert[name] });
      return reply(201, wantsRows ? project(out, select) : null, headers);
    }
    const hit = rows.filter(match);
    if (method === "PATCH") {
      for (const r of hit) Object.assign(r, JSON.parse(String(init?.body)), { updated_at: `t${nextId++}` });
      return reply(wantsRows ? 200 : 204, wantsRows ? project(hit, select) : null, headers);
    }
    if (method === "DELETE") {
      tables[name] = rows.filter((r) => !hit.includes(r));
      return reply(wantsRows ? 200 : 204, wantsRows ? project(hit, select) : null, headers);
    }
    throw new Error(`fake PostgREST: ${method}`);
  };
  return { tables, requests, fetch: fetchFn };
}

const USER = "u1";
let recorded: AiRunWriteInsert[];
beforeEach(() => {
  recorded = [];
  setAIWriteRecorderForTests((rows) => recorded.push(...rows));
});
afterEach(() => setAIWriteRecorderForTests(null));

function setup(seed: Record<string, Row[]>, opts?: FakeOptions) {
  const pg = fakePostgrest(seed, opts);
  const supabase = createClient("https://fake.supabase.co", "anon-key", {
    global: { fetch: createLedgerFetch(pg.fetch) },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return { pg, supabase };
}

async function run(tools: ToolSet, name: string, input: unknown, toolCallId = "toolu_1") {
  const wrapped = withWriteLedger(tools, { userId: USER, requestId: "req-1", source: "approval" });
  const execute = wrapped[name].execute as (i: unknown, o: unknown) => Promise<unknown>;
  return execute(input, { toolCallId, messages: [] });
}

describe("write ledger", () => {
  it("records nothing outside a tool call", async () => {
    const { pg, supabase } = setup({});
    const { error } = await supabase.from("receipt_expenses").insert({ user_id: USER, vendor: "Staples" });
    expect(error).toBeNull();
    expect(recorded).toEqual([]);
    expect(pg.requests).toHaveLength(1);
  });

  it("an insert with no select: the tool still gets no rows back, and the ledger gets the new row", async () => {
    const { supabase } = setup({});
    const tools = {
      logExpense: tool({
        inputSchema: z.object({ vendor: z.string() }),
        execute: async ({ vendor }) => {
          const res = await supabase.from("receipt_expenses").insert({ user_id: USER, vendor, total_amount: 45 });
          return { data: res.data, error: res.error, status: res.status };
        },
      }),
    };
    expect(await run(tools, "logExpense", { vendor: "Staples" })).toEqual({ data: null, error: null, status: 201 });
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      user_id: USER,
      tool_call_id: "toolu_1",
      tool_name: "logExpense",
      source: "approval",
      request_id: "req-1",
      table_name: "receipt_expenses",
      action: "insert",
      outcome: "ok",
      before_image: null,
      after_image: { vendor: "Staples", total_amount: 45, user_id: USER },
    });
    expect(recorded[0].row_id).toBe((recorded[0].after_image as Row).id);
  });

  it("insert ... select('id').single(): the tool gets exactly { id }", async () => {
    const { supabase } = setup({});
    const tools = {
      createClient: tool({
        inputSchema: z.object({}),
        execute: async () => (await supabase.from("clients").insert({ user_id: USER, name: "Pat Example" }).select("id").single()).data,
      }),
    };
    const out = (await run(tools, "createClient", {})) as Row;
    expect(Object.keys(out)).toEqual(["id"]);
    expect(recorded[0]).toMatchObject({ action: "insert", row_id: out.id, after_image: { name: "Pat Example" } });
  });

  it("an update records the row before and after; a delete records the row before", async () => {
    const { supabase } = setup({
      receipt_expenses: [
        { id: "e1", user_id: USER, vendor: "Staples", total_amount: 45, updated_at: "t0" },
        { id: "e2", user_id: USER, vendor: "Esso", total_amount: 60, updated_at: "t0" },
      ],
    });
    const tools = {
      updateExpense: tool({
        inputSchema: z.object({}),
        execute: async () => {
          const res = await supabase.from("receipt_expenses").update({ total_amount: 54 }).eq("id", "e1").eq("user_id", USER);
          return res.data;
        },
      }),
      deleteExpense: tool({
        inputSchema: z.object({}),
        execute: async () => (await supabase.from("receipt_expenses").delete().eq("id", "e2")).error,
      }),
    };
    expect(await run(tools, "updateExpense", {}, "toolu_u")).toBeNull();
    expect(await run(tools, "deleteExpense", {}, "toolu_d")).toBeNull();
    expect(recorded).toHaveLength(2);
    expect(recorded[0]).toMatchObject({
      tool_call_id: "toolu_u",
      action: "update",
      row_id: "e1",
      before_image: { total_amount: 45, updated_at: "t0" },
      after_image: { total_amount: 54 },
    });
    expect(recorded[1]).toMatchObject({ tool_call_id: "toolu_d", action: "delete", row_id: "e2", before_image: { vendor: "Esso" }, after_image: null });
  });

  it("a write Postgres refuses is recorded as an error with its code, and the tool sees the same error", async () => {
    const { supabase } = setup({}, { failInserts: { contact_activities: "42703" } });
    const tools = {
      logContactActivity: tool({
        inputSchema: z.object({}),
        execute: async () => (await supabase.from("contact_activities").insert({ user_id: USER, type: "call" })).error?.code,
      }),
    };
    expect(await run(tools, "logContactActivity", {})).toBe("42703");
    expect(recorded).toEqual([expect.objectContaining({ outcome: "error", error_class: "42703", table_name: "contact_activities", row_id: null })]);
  });

  it("an upsert records an insert the first time and an update the next", async () => {
    const { supabase } = setup({});
    const tools = {
      draftClientTexts: tool({
        inputSchema: z.object({ body: z.string() }),
        execute: async ({ body }) =>
          (await supabase
            .from("outreach_queue")
            .upsert({ user_id: USER, client_id: "c1", opportunity_type: "text_message", trigger_date: "2026-10-18", ai_body: body }, { onConflict: "user_id,client_id,opportunity_type,trigger_date" }))
            .error,
      }),
    };
    await run(tools, "draftClientTexts", { body: "Hi Pat, checking in" }, "toolu_1");
    await run(tools, "draftClientTexts", { body: "Hi Pat, how is the house?" }, "toolu_2");
    expect(recorded.map((r) => [r.tool_call_id, r.action])).toEqual([["toolu_1", "insert"], ["toolu_2", "update"]]);
    // AI-written text is never stored, only its length and hash.
    expect(JSON.stringify(recorded)).not.toContain("Pat");
    expect(recorded[1].before_image?.ai_body).toMatchObject({ $redacted: "ai_text", length: "Hi Pat, checking in".length });
  });

  it("orders a tool call's writes and skips RPCs and the ledger's own tables", async () => {
    const { supabase } = setup({});
    const tools = {
      createClient: tool({
        inputSchema: z.object({}),
        execute: async () => {
          await supabase.from("clients").insert({ user_id: USER, name: "Pat Example" });
          await supabase.from("client_notes").insert({ user_id: USER, body: "met at the open house" });
          await supabase.rpc("fn_delete_clients", { p_client_ids: [] });
          await supabase.from("ai_run_writes").insert({ user_id: USER });
          return "ok";
        },
      }),
    };
    await run(tools, "createClient", {});
    expect(recorded.map((r) => [r.table_name, r.seq])).toEqual([["clients", 0], ["client_notes", 1]]);
  });

  it("insert ... select('name'): the tool gets only name, never an extra id or the ledger's alias", async () => {
    const { supabase } = setup({});
    const tools = {
      createClient: tool({
        inputSchema: z.object({}),
        execute: async () => (await supabase.from("clients").insert({ user_id: USER, name: "Pat Example" }).select("name").single()).data,
      }),
      aliased: tool({
        inputSchema: z.object({}),
        execute: async () => (await supabase.from("clients").insert({ user_id: USER, name: "Sam Example" }).select("id:name").single()).data,
      }),
    };
    expect(await run(tools, "createClient", {}, "toolu_a")).toEqual({ name: "Pat Example" });
    // An `id:` alias of the caller's own is left alone.
    expect(await run(tools, "aliased", {}, "toolu_b")).toEqual({ id: "Sam Example" });
    expect(recorded.map((r) => [r.tool_call_id, r.action, typeof r.row_id])).toEqual([["toolu_a", "insert", "string"], ["toolu_b", "insert", "string"]]);
    expect(recorded[1].after_image).toMatchObject({ name: "Sam Example" });
  });

  it("if the altered insert is refused, the caller's own request is sent unchanged", async () => {
    const { pg, supabase } = setup({}, { rejectAliasedSelect: true });
    const tools = {
      logExpense: tool({
        inputSchema: z.object({}),
        execute: async () => {
          const res = await supabase.from("receipt_expenses").insert({ user_id: USER, vendor: "Staples" });
          return { error: res.error, status: res.status };
        },
      }),
    };
    expect(await run(tools, "logExpense", {})).toEqual({ error: null, status: 201 });
    expect(pg.requests.filter((r) => r.method === "POST")).toHaveLength(2);
    expect(pg.tables.receipt_expenses).toHaveLength(1); // written once
    expect(recorded).toEqual([expect.objectContaining({ outcome: "ok", row_id: null })]); // on the record, not undoable
  });

  it("a delete of a row others point at is recorded as irreversible", async () => {
    const { supabase } = setup(
      { pipeline_deals: [{ id: "p1", user_id: USER, address: "12 Example St" }, { id: "p2", user_id: USER, address: "9 Demo Rd" }] },
      { references: { p1: [{ child_table: "transactions", refs: 1 }] } },
    );
    const tools = {
      removePipelineDeal: tool({
        inputSchema: z.object({ id: z.string() }),
        execute: async ({ id }) => (await supabase.from("pipeline_deals").delete().eq("id", id)).error,
      }),
    };
    await run(tools, "removePipelineDeal", { id: "p1" }, "toolu_1");
    await run(tools, "removePipelineDeal", { id: "p2" }, "toolu_2");
    expect(recorded[0]).toMatchObject({ action: "delete", row_id: "p1" });
    expect(recorded[0].irreversible_reason).toMatch(/1 deal\), and undo can't put those links back/);
    expect(recorded[1]).toMatchObject({ action: "delete", row_id: "p2", irreversible_reason: null });
  });

  it("a logged call also records what its trigger did to the client", async () => {
    const { supabase } = setup(
      { clients: [{ id: "c1", user_id: USER, name: "Sam Example", status: "cruising", last_contact_at: null, updated_at: "t0" }] },
      {
        afterInsert: {
          contact_activities: (row, tables) => {
            const c = tables.clients.find((x) => x.id === row.client_id)!;
            Object.assign(c, { status: "boarding", last_contact_at: row.activity_date, updated_at: "t9" });
          },
        },
      },
    );
    const tools = {
      logContactActivity: tool({
        inputSchema: z.object({}),
        execute: async () =>
          (await supabase.from("contact_activities").insert({ user_id: USER, client_id: "c1", type: "call", activity_date: "2026-10-18T15:00:00Z" })).error,
      }),
    };
    expect(await run(tools, "logContactActivity", {})).toBeNull();
    expect(recorded.map((r) => [r.table_name, r.action])).toEqual([["contact_activities", "insert"], ["clients", "update"]]);
    expect(recorded[1]).toMatchObject({
      row_id: "c1",
      before_image: { status: "cruising", last_contact_at: null },
      after_image: { status: "boarding", last_contact_at: "2026-10-18T15:00:00Z" },
    });
  });

  it("the ledger's own reads carry the request's abort signal", async () => {
    const { pg, supabase } = setup({ receipt_expenses: [{ id: "e1", user_id: USER, total_amount: 45 }] });
    const controller = new AbortController();
    const tools = {
      updateExpense: tool({
        inputSchema: z.object({}),
        execute: async () => (await supabase.from("receipt_expenses").update({ total_amount: 54 }).eq("id", "e1").abortSignal(controller.signal)).error,
      }),
    };
    await run(tools, "updateExpense", {});
    const reads = pg.requests.filter((r) => r.method === "GET");
    expect(reads.length).toBeGreaterThan(0);
    expect(reads.every((r) => r.signal)).toBe(true);
  });

  it("a gateway error after the insert committed is never resent (no duplicate deal)", async () => {
    const { pg, supabase } = setup({}, { gatewayErrorAfterInsert: { transactions: 502 } });
    const tools = {
      recordTransaction: tool({
        inputSchema: z.object({}),
        execute: async () => (await supabase.from("transactions").insert({ user_id: USER, address: "12 Example St" })).status,
      }),
    };
    expect(await run(tools, "recordTransaction", {})).toBe(502);
    expect(pg.requests.filter((r) => r.method === "POST")).toHaveLength(1);
    expect(pg.tables.transactions).toHaveLength(1);
    expect(recorded).toEqual([expect.objectContaining({ outcome: "error", error_class: "http 502" })]);
  });

  it("a logged call whose client couldn't be read is on the record but not undoable", async () => {
    const { supabase } = setup({ clients: [{ id: "c1", user_id: USER, name: "Sam Example" }] }, { failReads: ["clients"] });
    const tools = {
      logContactActivity: tool({
        inputSchema: z.object({}),
        execute: async () => (await supabase.from("contact_activities").insert({ user_id: USER, client_id: "c1", type: "call" })).error,
      }),
    };
    expect(await run(tools, "logContactActivity", {})).toBeNull();
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({ table_name: "contact_activities", action: "insert" });
    expect(recorded[0].irreversible_reason).toMatch(/couldn't record what this did to the client/);
  });

  it("more than 20 calls logged at once are on the record but not undoable", async () => {
    const { supabase } = setup({ clients: [{ id: "c1", user_id: USER, name: "Sam Example" }] });
    const tools = {
      bulk: tool({
        inputSchema: z.object({}),
        execute: async () =>
          (await supabase.from("contact_activities").insert(Array.from({ length: 21 }, () => ({ user_id: USER, client_id: "c1", type: "call" })))).error,
      }),
    };
    expect(await run(tools, "bulk", {})).toBeNull();
    expect(recorded).toHaveLength(21);
    expect(recorded.every((r) => /Too many were logged at once \(21\)/.test(r.irreversible_reason ?? ""))).toBe(true);
  });

  describe("the CASL consent tools (00183)", () => {
    const CLIENT = "00000000-0000-4000-8000-0000000000c1";
    const seed = () => ({
      clients: [{ id: CLIENT, user_id: USER, name: "Sam Example", email_opt_out_at: null, sms_opt_out_at: null, email_opt_out_source: null, email_opt_out_method: null, sms_opt_out_source: null, sms_opt_out_method: null }],
      client_records: [],
      client_record_co_parties: [],
      client_email_consents: [],
      outreach_queue: [{ id: "q1", user_id: USER, client_id: CLIENT, channel: "email", status: "ready" }],
    });
    const asLedger = (rows: AiRunWriteInsert[]): AiRunWrite[] =>
      rows.map((r, i) => ({ ...r, id: `w${i}`, undone_at: null, created_at: new Date().toISOString() }));

    async function runTool(name: "recordConsent" | "withdrawConsent", args: Record<string, unknown>) {
      const { pg, supabase } = setup(seed());
      const tools = withWriteLedger(createAgentTools(supabase, USER), { userId: USER, source: "approval" });
      const execute = tools[name].execute as (i: unknown, o: unknown) => Promise<string>;
      const reply = await execute(args, { toolCallId: `toolu_${name}`, messages: [] });
      return { pg, reply };
    }

    it("recordConsent's new consent record is captured, and undo is never offered for it", async () => {
      const { reply } = await runTool("recordConsent", {
        clientId: CLIENT, clientName: "Sam Example", channels: ["email"], basis: "express", method: "verbal", date: "2026-10-14", wording: "Yes, keep me posted",
      });
      expect(reply).toMatch(/^✓/);
      expect(recorded.map((r) => [r.table_name, r.action])).toEqual([["client_email_consents", "insert"]]);
      expect(recorded[0].after_image).toMatchObject({ client_id: CLIENT, channel: "email", basis: "express", method: "verbal" });
      const [action] = groupWritesIntoActions(asLedger(recorded));
      expect(actionUndoBlocker(action)).toMatch(/consent record is CASL evidence and is never edited or deleted/);
    });

    it("withdrawConsent's writes (the opt-out, the withdrawal, the skipped drafts) are captured, and undo is never offered", async () => {
      // A consent on file to withdraw.
      recorded = [];
      const { pg, supabase } = setup({
        ...seed(),
        client_email_consents: [{ id: "k1", user_id: USER, client_id: CLIENT, kind: "other", source: "agent", channel: "email", basis: "express", method: "verbal", consent_text: "", evidence_note: null, consented_at: "2026-09-01T12:00:00Z", recorded_via: "web", withdrawn_at: null, withdrawn_method: null, withdrawn_note: null, created_at: "2026-09-01T12:00:00Z" }],
      });
      const tools = withWriteLedger(createAgentTools(supabase, USER), { userId: USER, source: "approval" });
      const execute = tools.withdrawConsent.execute as (i: unknown, o: unknown) => Promise<string>;
      const reply = await execute(
        { clientId: CLIENT, clientName: "Sam Example", channels: ["email"], method: "email_reply", date: "2026-10-14" },
        { toolCallId: "toolu_withdraw", messages: [] },
      );
      expect(reply).toMatch(/^✓/);
      const tables = recorded.map((r) => `${r.table_name}:${r.action}`);
      expect(tables).toEqual(expect.arrayContaining(["clients:update", "client_email_consents:update", "outreach_queue:update"]));
      expect(recorded.find((r) => r.table_name === "clients")?.after_image).toMatchObject({ email_opt_out_at: expect.any(String) });
      const [action] = groupWritesIntoActions(asLedger(recorded));
      expect(actionUndoBlocker(action)).toMatch(/CASL evidence/);
      expect(pg.tables.client_email_consents[0].withdrawn_at).not.toBeNull();
    });
  });

  describe("the vehicle logbook tools (00184)", () => {
    const asLedger = (rows: AiRunWriteInsert[]): AiRunWrite[] =>
      rows.map((r, i) => ({ ...r, id: `w${i}`, undone_at: null, created_at: new Date().toISOString() }));

    it("startLogbookPeriod and recordOdometerReading are captured, and their changes can be undone", async () => {
      const { pg, supabase } = setup({ vehicles: [], vehicle_logbook_periods: [], vehicle_odometer_readings: [], mileage_logs: [] });
      const tools = withWriteLedger(createAgentTools(supabase, USER), { userId: USER, source: "approval" });
      const start = tools.startLogbookPeriod.execute as (i: unknown, o: unknown) => Promise<string>;
      const startReply = await start({ kind: "base", startDate: "2026-11-01" }, { toolCallId: "toolu_start", messages: [] });
      expect(startReply).toMatch(/^✓/);
      // No vehicle yet: the writer adds the default one, then the period.
      const started = recorded.filter((r) => r.tool_call_id === "toolu_start");
      expect(started.map((r) => `${r.table_name}:${r.action}`)).toEqual(["vehicles:insert", "vehicle_logbook_periods:insert"]);
      expect(started[1].after_image).toMatchObject({ kind: "base", start_date: "2026-11-01", end_date: "2027-10-31" });
      const [startAction] = groupWritesIntoActions(asLedger(started));
      expect(actionUndoBlocker(startAction)).toBeNull();

      const periodId = String(pg.tables.vehicle_logbook_periods[0].id);
      const reading = tools.recordOdometerReading.execute as (i: unknown, o: unknown) => Promise<string>;
      const readingReply = await reading({ kind: "period_start", km: 41250, periodId }, { toolCallId: "toolu_reading", messages: [] });
      expect(readingReply).toMatch(/^✓/);
      const read = recorded.filter((r) => r.tool_call_id === "toolu_reading");
      expect(read.map((r) => `${r.table_name}:${r.action}`)).toEqual(["vehicle_logbook_periods:update"]);
      expect(read[0]).toMatchObject({ before_image: { odometer_start: null }, after_image: { odometer_start: 41250 } });
      const [readAction] = groupWritesIntoActions(asLedger(read));
      expect(actionUndoBlocker(readAction)).toBeNull();

      // A month-end reading is an upsert on (vehicle_id, reading_date): an
      // insert the first time, an update when the agent corrects it.
      await reading({ kind: "month_end", km: 42010, date: "2026-11-30" }, { toolCallId: "toolu_m1", messages: [] });
      await reading({ kind: "month_end", km: 42100, date: "2026-11-30" }, { toolCallId: "toolu_m2", messages: [] });
      const months = recorded.filter((r) => r.tool_call_id.startsWith("toolu_m"));
      expect(months.map((r) => `${r.tool_call_id}:${r.table_name}:${r.action}`)).toEqual([
        "toolu_m1:vehicle_odometer_readings:insert",
        "toolu_m2:vehicle_odometer_readings:update",
      ]);
      expect(months[1]).toMatchObject({ before_image: { odometer_km: 42010 }, after_image: { odometer_km: 42100 } });
    });

    it("deleting a vehicle that trips or periods point at (composite keys) is marked irreversible", async () => {
      const { supabase } = setup(
        { vehicles: [{ id: "v1", user_id: USER, name: "Car" }] },
        { references: { v1: [{ child_table: "mileage_logs", refs: 3 }] } },
      );
      const tools = {
        removeVehicle: tool({
          inputSchema: z.object({}),
          execute: async () => (await supabase.from("vehicles").delete().eq("id", "v1")).error,
        }),
      };
      await run(tools, "removeVehicle", {});
      expect(recorded[0].irreversible_reason).toMatch(/3 mileage entries/);
    });
  });
});
