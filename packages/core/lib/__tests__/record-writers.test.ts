/**
 * The shared writers (record-writers.ts) and the confirm-card save
 * (applyCaptureWrites). Each writer takes a Flight Crew tool's argument
 * shape and writes the row that tool writes. Synthetic rows only.
 */
import { describe, expect, it } from "vitest";
import {
  activityTimestampFor,
  applyCaptureWrite,
  isOfflineError,
  newRecordId,
  writeClient,
  writeContactActivity,
  writeContactTask,
  writeDealCloseDate,
  writeDealStage,
  writeExpense,
  writeMileage,
  writeTransaction,
} from "../record-writers";
import { applyCaptureWrites, summarizeSave } from "../capture/proposals";
import type { ProposedWrite } from "../capture/types";
import { fakeDb, type Row } from "./helpers/capture-fake-db";

const USER = "user-1";
const TODAY = "2026-10-18";
const CLIENT = { id: "c-1", user_id: USER, name: "Sam Lee", name_search: "sam lee", status: "cruising", archived_at: null };
const DEAL = { id: "d-1", user_id: USER, address: "12 Elm St", client_name: "Sam Lee", stage: "showing", expected_close_date: null };

const seed = (extra: Record<string, Row[]> = {}) => ({ clients: [CLIENT], pipeline_deals: [DEAL], client_memory_profiles: [{ client_id: "c-1", user_id: USER, stale: false }], ...extra });

describe("writeContactActivity (logContactActivity)", () => {
  it("logs on the user's own client, today stamped now", async () => {
    const { db, writes, tables } = fakeDb(seed());
    const out = await writeContactActivity(db, USER, { clientId: "c-1", clientName: "Sam Lee", type: "showing", description: "  Walked 12 Elm  " }, TODAY);
    expect(out).toMatchObject({ ok: true, day: TODAY, priorStatus: "cruising" });
    const insert = writes.find((w) => w.table === "contact_activities")!;
    expect(insert.payload).toMatchObject({ user_id: USER, client_id: "c-1", type: "showing", description: "Walked 12 Elm" });
    expect(Date.now() - Date.parse(String(insert.payload.activity_date))).toBeLessThan(60_000);
    // What Flight Crew remembers about the client is marked out of date.
    await new Promise((r) => setTimeout(r, 0));
    expect(tables.client_memory_profiles[0].stale).toBe(true);
  });

  it("a past day is stamped at noon UTC, the same day in every Canadian zone", async () => {
    const { db, writes } = fakeDb(seed());
    await writeContactActivity(db, USER, { clientId: "c-1", clientName: "Sam Lee", type: "call", description: "x", activityDate: "2026-10-15" }, TODAY);
    expect(writes[0].payload.activity_date).toBe("2026-10-15T12:00:00.000Z");
    expect(activityTimestampFor("2026-10-15")).toBe("2026-10-15T12:00:00.000Z");
  });

  it("refuses a client that isn't the user's, and an unpicked one", async () => {
    const { db, writes } = fakeDb(seed({ clients: [{ ...CLIENT, user_id: "other" }] }));
    expect((await writeContactActivity(db, USER, { clientId: "c-1", clientName: "Sam Lee", type: "call", description: "x" }, TODAY)).ok).toBe(false);
    expect((await writeContactActivity(db, USER, { clientId: "", clientName: "Sam", type: "call", description: "x" }, TODAY)).message).toBe("Pick the client first.");
    expect(writes).toEqual([]);
  });

  it("a blank description goes as '' (NOT NULL column)", async () => {
    const { db, writes } = fakeDb(seed());
    await writeContactActivity(db, USER, { clientId: "c-1", clientName: "Sam Lee", type: "note", description: "" }, TODAY);
    expect(writes[0].payload.description).toBe("");
  });
});

describe("writeContactTask (createContactTask)", () => {
  it("adds a Checklist item with a client, or a general to-do", async () => {
    const { db, writes } = fakeDb(seed());
    expect((await writeContactTask(db, USER, { clientId: "c-1", clientName: "Sam Lee", title: " Send comps ", dueDate: "2026-10-22", priority: "high", notes: " " })).ok).toBe(true);
    expect((await writeContactTask(db, USER, { title: "Order sign riders", dueDate: "2026-10-23", priority: "normal" })).ok).toBe(true);
    expect(writes.map((w) => w.payload)).toEqual([
      { user_id: USER, client_id: "c-1", title: "Send comps", due_date: "2026-10-22", priority: "high", notes: null },
      { user_id: USER, client_id: null, title: "Order sign riders", due_date: "2026-10-23", priority: "normal", notes: null },
    ]);
  });

  it("refuses a bad due date and a client that isn't the user's", async () => {
    const { db, writes } = fakeDb(seed());
    expect((await writeContactTask(db, USER, { title: "x", dueDate: "2026-02-30", priority: "normal" })).ok).toBe(false);
    expect((await writeContactTask(db, USER, { clientId: "nope", title: "x", dueDate: TODAY, priority: "normal" })).ok).toBe(false);
    expect(writes).toEqual([]);
  });
});

describe("deal writers (updatePipelineDealStage / updatePipelineDealCloseDate)", () => {
  it("moves the stage and the expected close date of the user's deal", async () => {
    const { db, tables } = fakeDb(seed());
    expect((await writeDealStage(db, USER, { dealId: "d-1", dealDescription: "12 Elm St — Sam Lee", stage: "offer" })).ok).toBe(true);
    expect((await writeDealCloseDate(db, USER, { dealId: "d-1", dealDescription: "12 Elm St", closeDate: "2026-11-30" })).ok).toBe(true);
    expect(tables.pipeline_deals[0]).toMatchObject({ stage: "offer", expected_close_date: "2026-11-30" });
  });

  it("says so when no deal of the user's matched", async () => {
    const { db } = fakeDb(seed({ pipeline_deals: [{ ...DEAL, user_id: "other" }] }));
    const out = await writeDealStage(db, USER, { dealId: "d-1", dealDescription: "12 Elm St", stage: "offer" });
    expect(out).toMatchObject({ ok: false, message: "12 Elm St wasn't found in your pipeline." });
  });
});

describe("writeMileage (logMileage)", () => {
  it("writes the trip with its purpose", async () => {
    const { db, writes } = fakeDb();
    const out = await writeMileage(db, USER, { tripDate: "2026-10-17", km: 18, description: "Showing at 12 Elm St", toLocation: "12 Elm St", fromLocation: " " });
    expect(out.ok).toBe(true);
    expect(writes[0].payload).toEqual({
      user_id: USER, trip_date: "2026-10-17", km: 18, description: "Showing at 12 Elm St",
      from_location: null, to_location: "12 Elm St", purpose: "Showing at 12 Elm St",
    });
  });

  it("refuses no distance and an impossible one", async () => {
    const { db, writes } = fakeDb();
    expect((await writeMileage(db, USER, { tripDate: TODAY, km: 0, description: "x" })).ok).toBe(false);
    expect((await writeMileage(db, USER, { tripDate: TODAY, km: 18000, description: "x" })).ok).toBe(false);
    expect(writes).toEqual([]);
  });
});

describe("writeExpense (logExpense)", () => {
  it("records GST/HST only as stated", async () => {
    const { db, writes } = fakeDb();
    await writeExpense(db, USER, { vendor: "Shell", amount: 115, categoryKey: "vehicle_fuel", expenseDate: TODAY });
    await writeExpense(db, USER, { vendor: "Shell", amount: 115, taxAmount: 15, categoryKey: "vehicle_fuel", expenseDate: TODAY, notes: "Fill-up" });
    expect(writes[0].payload).toEqual({
      user_id: USER, vendor: "Shell", expense_date: TODAY, total_amount: 115,
      tax_amount: null, subtotal: null, category_key: "vehicle_fuel", notes: null, currency: "CAD",
    });
    expect(writes[1].payload).toMatchObject({ tax_amount: 15, subtotal: 100, notes: "Fill-up" });
  });

  it("refuses GST/HST above the total, a missing category, and no amount", async () => {
    const { db, writes } = fakeDb();
    expect((await writeExpense(db, USER, { vendor: "Shell", amount: 20, taxAmount: 25, categoryKey: "vehicle_fuel", expenseDate: TODAY })).message).toMatch(/more than the \$20\.00 total/);
    expect((await writeExpense(db, USER, { vendor: "Shell", amount: 20, categoryKey: "", expenseDate: TODAY })).ok).toBe(false);
    expect((await writeExpense(db, USER, { vendor: "Shell", amount: 0, categoryKey: "vehicle_fuel", expenseDate: TODAY })).ok).toBe(false);
    expect(writes).toEqual([]);
  });
});

describe("writeClient (createClient)", () => {
  it("writes name_search the way the CRM does (toNameSearch)", async () => {
    const { db, writes } = fakeDb();
    const out = await writeClient(db, USER, { name: "  René   Côté ", phone: "506-555-0101", side: "seller", leadSource: "open_house" }, { id: "fixed-id" });
    expect(out).toMatchObject({ ok: true, id: "fixed-id" });
    expect(writes[0].payload).toEqual({
      id: "fixed-id", user_id: USER, name: "René Côté", name_search: "rene cote", first_name: "René", last_name: "Côté",
      status: "boarding", phone: "506-555-0101", property_interest_type: "listing", lead_source: "open_house",
    });
  });

  it("never makes a client twice", async () => {
    const { db, writes } = fakeDb(seed());
    const out = await writeClient(db, USER, { name: "sam  LEE" });
    expect(out).toMatchObject({ ok: false, duplicateOf: { id: "c-1", name: "Sam Lee" } });
    expect(writes).toEqual([]);
  });
});

describe("writeTransaction (recordTransaction)", () => {
  it("stores the commission as a fraction and the NOT NULL text columns", async () => {
    const { db, writes } = fakeDb();
    const out = await writeTransaction(db, USER, { address: "40 Pine Ave", clientName: "Pat Roy", side: "buyer", closeDate: "2026-10-16", salePrice: 450000, commissionPct: 2.5 });
    expect(out.ok).toBe(true);
    expect(writes[0].payload).toMatchObject({ date: "2026-10-16", sale_price: 450000, commission_pct: 0.025, gci_override: null, status: "closed", notes: "", commission_paid_date: null });
  });

  it("needs a price or the GCI, and a paid date on or after closing", async () => {
    const { db, writes } = fakeDb();
    expect((await writeTransaction(db, USER, { address: "x", clientName: "y", side: "buyer", closeDate: TODAY })).ok).toBe(false);
    expect((await writeTransaction(db, USER, { address: "x", clientName: "y", side: "buyer", closeDate: TODAY, gciOverride: 9000, commissionPaidDate: "2026-10-01" })).ok).toBe(false);
    expect(writes).toEqual([]);
  });
});

describe("errors", () => {
  it("tells a dropped connection from a refusal", async () => {
    expect(isOfflineError({ message: "TypeError: Network request failed" })).toBe(true);
    expect(isOfflineError({ code: "23514", message: "violates check" })).toBe(false);
    const offline = fakeDb({}, { offline: ["mileage_logs"] });
    expect(await writeMileage(offline.db, USER, { tripDate: TODAY, km: 5, description: "x" })).toMatchObject({ ok: false, offline: true });
    const refused = fakeDb({}, { fail: { mileage_logs: { code: "23514", message: "check" } } });
    expect(await writeMileage(refused.db, USER, { tripDate: TODAY, km: 5, description: "x" })).toMatchObject({ ok: false, offline: false, code: "23514" });
  });

  it("makes ids shaped like UUIDs", () => {
    expect(newRecordId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("dispatches by tool name", async () => {
    const { db, writes } = fakeDb(seed());
    await applyCaptureWrite(db, USER, { tool: "updatePipelineDealStage", args: { dealId: "d-1", dealDescription: "x", stage: "firm" } }, TODAY);
    expect(writes[0]).toMatchObject({ table: "pipeline_deals", op: "update" });
  });
});

// ── The confirm-card save ────────────────────────────────────────────────────

const clientChoice = (extra: Partial<NonNullable<ProposedWrite["client"]>> = {}) => ({
  spoken: "Dana", candidates: [], selectedId: null, newClientWriteId: null, newClientOffer: null, noClient: false, optional: false, ...extra,
});

function noteWithNewClient(): ProposedWrite[] {
  return [
    { id: "w1", tool: "createClient", intent: "new_client", include: true, warnings: [], args: { name: "Dana Whitfield", phone: "506-555-0143" } },
    {
      id: "w2", tool: "createContactTask", intent: "create_task", include: true, warnings: [],
      client: clientChoice({ optional: true, newClientWriteId: "w1", newClientOffer: "w1" }),
      args: { title: "Send Dana the listings", dueDate: "2026-10-20", priority: "normal", clientName: "Dana Whitfield" },
    },
    {
      id: "w3", tool: "logContactActivity", intent: "log_activity", include: true, warnings: [],
      client: clientChoice({ newClientWriteId: "w1" }),
      args: { clientId: "", clientName: "Dana Whitfield", type: "meeting", description: "Met at the open house" },
    },
    { id: "w4", tool: "logMileage", intent: "log_trip", include: false, warnings: [], args: { tripDate: TODAY, km: 12, description: "Open house" } },
  ];
}

describe("applyCaptureWrites", () => {
  it("adds the new client first and points the rest of the note at them", async () => {
    const { db, writes, tables } = fakeDb(seed());
    const results = await applyCaptureWrites(db, USER, noteWithNewClient(), { today: TODAY });
    expect(results.map((r) => [r.writeId, r.status])).toEqual([["w1", "saved"], ["w2", "saved"], ["w3", "saved"], ["w4", "skipped"]]);
    const newId = tables.clients.find((c) => c.name === "Dana Whitfield")!.id;
    expect(writes.find((w) => w.table === "contact_tasks")!.payload).toMatchObject({ client_id: newId });
    expect(writes.find((w) => w.table === "contact_activities")!.payload).toMatchObject({ client_id: newId, type: "meeting" });
    expect(writes.some((w) => w.table === "mileage_logs")).toBe(false);
    expect(summarizeSave(results).text).toBe("3 saved");
  });

  it("offline: queues the client and the writes that name it, with the same id", async () => {
    const { db } = fakeDb(seed(), { offline: ["clients", "contact_tasks", "contact_activities"] });
    const queued: Array<{ tool: string; id?: string; args: Record<string, unknown> }> = [];
    const results = await applyCaptureWrites(db, USER, noteWithNewClient(), {
      today: TODAY,
      queue: (call) => { queued.push(call as never); return true; },
    });
    expect(results.filter((r) => r.status === "queued").map((r) => r.writeId)).toEqual(["w1", "w2", "w3"]);
    const id = queued[0].id;
    expect(id).toBeTruthy();
    expect(queued.map((q) => q.tool)).toEqual(["createClient", "createContactTask", "logContactActivity"]);
    expect(queued[1].args.clientId).toBe(id);
    expect(queued[2].args.clientId).toBe(id);
  });

  it("a new client already on file: the note goes on the existing client", async () => {
    const { db, writes } = fakeDb(seed());
    const ws = noteWithNewClient();
    ws[0] = { ...ws[0], args: { name: "Sam Lee" } } as ProposedWrite;
    const results = await applyCaptureWrites(db, USER, ws, { today: TODAY });
    expect(results[0]).toMatchObject({ status: "skipped" });
    expect(writes.find((w) => w.table === "contact_tasks")!.payload).toMatchObject({ client_id: "c-1" });
  });

  it("if the new client is refused, the writes about them are not saved on someone else", async () => {
    const { db, writes } = fakeDb(seed(), { fail: { clients: { code: "23514", message: "check" } } });
    const results = await applyCaptureWrites(db, USER, noteWithNewClient(), { today: TODAY });
    expect(results.map((r) => r.status)).toEqual(["failed", "failed", "failed", "skipped"]);
    expect(writes.filter((w) => w.table !== "clients")).toEqual([]);
    expect(summarizeSave(results).text).toBe("3 not saved");
  });

  it("a write that still needs a pick is not saved", async () => {
    const { db, writes } = fakeDb(seed());
    const ws: ProposedWrite[] = [{
      id: "w1", tool: "logContactActivity", intent: "log_activity", include: true, warnings: [],
      client: clientChoice({ spoken: "Sarah", candidates: [{ id: "a", name: "Sarah A", status: null, lastContactAt: null, match: "word" }] }),
      args: { clientId: "", clientName: "Sarah", type: "call", description: "x" },
    }];
    const results = await applyCaptureWrites(db, USER, ws, { today: TODAY });
    expect(results[0]).toMatchObject({ status: "failed", message: "Pick which client." });
    expect(writes).toEqual([]);
  });
});
