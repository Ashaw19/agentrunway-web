/**
 * The MCP note-capture tools (supabase/functions/mcp-server/tools/capture.ts),
 * run for real: capture_note forwards the note to the web app's
 * /api/voice-extract with the caller's own token (fetch is stubbed), and
 * save_captured_note saves through core record-writers. Synthetic rows only.
 */
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MCP_TOOLS_DIR } from "./registry-source";
import { fakeDb } from "../../../../../packages/core/lib/__tests__/helpers/capture-fake-db";

interface Tool {
  name: string;
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean };
  handler: (args: unknown) => Promise<{ content: Array<{ text: string }>; isError?: boolean }>;
}
type Factory = (db: unknown, userId: string, token: string) => Tool[];

const USER = "00000000-0000-4000-8000-0000000000u1";
const SAM = "00000000-0000-4000-8000-000000000001";

async function load(db: unknown): Promise<Tool[]> {
  // A computed path, so tsc doesn't follow the Deno file (see tool-harness.ts).
  const mod = (await import(/* @vite-ignore */ path.join(MCP_TOOLS_DIR, "capture.ts"))) as { getCaptureTools: Factory };
  return mod.getCaptureTools(db, USER, "caller-token");
}

const run = async (tools: Tool[], name: string, args: unknown) => {
  const out = await tools.find((t) => t.name === name)!.handler(args);
  return { ...out, json: JSON.parse(out.content[0].text) as Record<string, unknown> };
};

const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubGlobal("Deno", { env: { get: () => undefined } });
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe("capture_note", () => {
  it("is read-only and asks the web app with the caller's own token", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      transcript: "x", transcriptCleaned: "Called Sam", today: "2026-10-18", notes: [],
      writes: [{
        id: "w1", tool: "logContactActivity", intent: "log_activity", include: true, warnings: [],
        client: { spoken: "Sam", candidates: [{ id: SAM, name: "Sam Lee", status: "boarding", lastContactAt: null, match: "word" }], selectedId: SAM, newClientWriteId: null, newClientOffer: null, noClient: false, optional: false },
        args: { clientId: SAM, clientName: "Sam Lee", type: "call", description: "Called Sam" },
      }],
    }), { status: 200 }));
    const { db, writes } = fakeDb();
    const tools = await load(db);
    expect(tools.find((t) => t.name === "capture_note")?.annotations?.readOnlyHint).toBe(true);

    const out = await run(tools, "capture_note", { transcript: "Called Sam about the offer" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://agentrunway.ca/api/voice-extract");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer caller-token");
    expect(JSON.parse(String(init.body))).toEqual({ transcript: "Called Sam about the offer" });
    expect(out.json).toMatchObject({ saved: false, today: "2026-10-18" });
    expect((out.json.items as unknown[])[0]).toMatchObject({ id: "w1", tool: "logContactActivity", crew: "dispatcher", still_needed: [], client: { selected_id: SAM } });
    expect(writes).toEqual([]);
  });

  it("passes on the web app's refusal", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: "Too many voice requests." }), { status: 429 }));
    const tools = await load(fakeDb().db);
    const out = await tools.find((t) => t.name === "capture_note")!.handler({ transcript: "x" });
    expect(out.isError).toBe(true);
    expect(out.content[0].text).toMatch(/Too many voice requests/);
  });
});

describe("save_captured_note", () => {
  const seed = () => fakeDb({ clients: [{ id: SAM, user_id: USER, name: "Sam Lee", name_search: "sam lee", status: "cruising", archived_at: null }] });

  it("is a write tool, not destructive", async () => {
    const tools = await load(fakeDb().db);
    expect(tools.find((t) => t.name === "save_captured_note")?.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false });
  });

  it("saves the approved items through the shared writers, new client first", async () => {
    const { db, writes, tables } = seed();
    const tools = await load(db);
    const out = await run(tools, "save_captured_note", {
      writes: [
        { id: "w2", tool: "createContactTask", args: { title: "Call Dana", dueDate: "2026-10-20", priority: "normal" }, new_client_ref: "w1" },
        { id: "w1", tool: "createClient", args: { name: "Dana Whitfield", phone: "506-555-0143" } },
        { id: "w3", tool: "logContactActivity", args: { clientId: SAM, clientName: "Sam Lee", type: "call", description: "Booked a showing" } },
        { id: "w4", tool: "logExpense", args: { vendor: "Java Moose", amount: 6.75, categoryKey: "meals_client", expenseDate: "2026-10-18" } },
      ],
    });
    expect(out.json.summary).toBe("4 saved");
    const dana = tables.clients.find((c) => c.name === "Dana Whitfield")!;
    expect(writes.find((w) => w.table === "contact_tasks")!.payload).toMatchObject({ client_id: dana.id, title: "Call Dana" });
    expect(writes.find((w) => w.table === "contact_activities")!.payload).toMatchObject({ client_id: SAM, type: "call" });
    expect(writes.find((w) => w.table === "receipt_expenses")!.payload).toMatchObject({ tax_amount: null, category_key: "meals_client" });
  });

  it("refuses a made-up id, an unknown tool and a category that isn't an expense item", async () => {
    const { db, writes } = seed();
    const tools = await load(db);
    const out = await run(tools, "save_captured_note", {
      writes: [
        { id: "w1", tool: "logContactActivity", args: { clientId: "sam", clientName: "Sam", type: "call", description: "x" } },
        { id: "w2", tool: "deleteClient", args: {} },
        { id: "w3", tool: "logExpense", args: { vendor: "X", amount: 5, categoryKey: "travel_meals", expenseDate: "2026-10-18" } },
      ],
    });
    expect(out.json.summary).toBe("Nothing to save, 3 refused");
    expect(writes).toEqual([]);
  });

  it("a malformed item is refused before anything is written, and never stops the batch", async () => {
    const { db, tables, writes } = seed();
    const tools = await load(db);
    const out = await run(tools, "save_captured_note", {
      writes: [
        { id: "w1", tool: "createClient", args: { name: "Dana Whitfield" } },
        { id: "w2", tool: "logMileage", args: { tripDate: "2026-10-18", km: "eighteen", description: "Showing" } },
        { id: "w3", tool: "createContactTask", args: { dueDate: "2026-10-20" }, new_client_ref: "w1" },
        { id: "w4", tool: "logContactActivity", args: { clientName: "Dana", type: "meeting", description: "Open house" }, new_client_ref: "w1" },
      ],
    });
    const results = out.json.results as Array<{ id: string; status: string; message: string }>;
    expect(results.find((r) => r.id === "w2")).toMatchObject({ status: "failed", message: "km must be a number." });
    expect(results.find((r) => r.id === "w3")).toMatchObject({ status: "failed", message: "title must be a string." });
    expect(results.find((r) => r.id === "w1")).toMatchObject({ status: "saved" });
    expect(results.find((r) => r.id === "w4")).toMatchObject({ status: "saved" });
    const dana = tables.clients.find((c) => c.name === "Dana Whitfield")!;
    expect(writes.find((w) => w.table === "contact_activities")!.payload).toMatchObject({ client_id: dana.id });
    expect(writes.some((w) => w.table === "mileage_logs" || w.table === "contact_tasks")).toBe(false);
  });

  it("saving the same items again with their row_id saves them once", async () => {
    const { db, tables } = seed();
    const tools = await load(db);
    const item = { id: "w1", row_id: "00000000-0000-4000-8000-0000000000e1", tool: "logExpense", args: { vendor: "Irving", amount: 64.4, taxAmount: 8.4, categoryKey: "vehicle_fuel", expenseDate: "2026-10-18" } };
    expect((await run(tools, "save_captured_note", { writes: [item] })).json.summary).toBe("1 saved");
    expect((await run(tools, "save_captured_note", { writes: [item] })).json.summary).toBe("1 saved");
    expect(tables.receipt_expenses).toHaveLength(1);
  });

  it("capture_note gives each new row a row_id", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      transcript: "x", transcriptCleaned: "x", today: "2026-10-18", notes: [],
      writes: [
        { id: "w1", tool: "logMileage", intent: "log_trip", include: true, warnings: [], args: { tripDate: "2026-10-18", km: 18, description: "Showing" } },
        { id: "w2", tool: "updatePipelineDealStage", intent: "update_deal", include: true, warnings: [], args: { dealId: SAM, dealDescription: "x", stage: "offer" } },
      ],
    }), { status: 200 }));
    const tools = await load(fakeDb().db);
    const items = (await run(tools, "capture_note", { transcript: "x" })).json.items as Array<Record<string, unknown>>;
    expect(items[0].row_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(items[1]).not.toHaveProperty("row_id");
  });

  it("an item missing something is not saved and the reply says why", async () => {
    const { db, writes } = seed();
    const tools = await load(db);
    const out = await run(tools, "save_captured_note", {
      writes: [{ id: "w1", tool: "logMileage", args: { tripDate: "2026-10-18", km: 0, description: "Showing" } }],
    });
    expect((out.json.results as Array<{ status: string; message: string }>)[0]).toMatchObject({ status: "failed", message: "Add the kilometres." });
    expect(writes).toEqual([]);
  });
});
