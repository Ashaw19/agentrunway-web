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
  updateMileage,
  writeTransaction,
} from "../record-writers";
import { applyCaptureWrites, argTypeProblems, checkWrite, isSettled, settleSavedClients, summarizeSave } from "../capture/proposals";
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
      { id: expect.any(String), user_id: USER, client_id: "c-1", title: "Send comps", due_date: "2026-10-22", priority: "high", notes: null },
      { id: expect.any(String), user_id: USER, client_id: null, title: "Order sign riders", due_date: "2026-10-23", priority: "normal", notes: null },
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
    // cra_rate_per_km: CRA's 2026 allowance rate (the column's default was
    // 2025's $0.72). No vehicle or odometer columns when none are given.
    expect(writes[0].payload).toEqual({
      id: expect.any(String), user_id: USER, trip_date: "2026-10-17", km: 18, description: "Showing at 12 Elm St",
      from_location: null, to_location: "12 Elm St", purpose: "Showing at 12 Elm St",
      cra_rate_per_km: 0.73, notes: null,
    });
  });

  it("refuses no distance, and otherwise takes what the tool always took", async () => {
    const { db, writes } = fakeDb();
    expect((await writeMileage(db, USER, { tripDate: TODAY, km: 0, description: "x" })).ok).toBe(false);
    expect((await writeMileage(db, USER, { tripDate: TODAY, km: Number.NaN, description: "x" })).ok).toBe(false);
    expect(writes).toEqual([]);
    // A blank purpose still saves, as the tool always allowed. One trip line
    // is at most 5,000 km since the vehicle logbook (2026-10-19, review): a
    // longer figure is far more often a typo (or an odometer reading typed
    // as km) than one trip, and it would move the year's logbook share.
    const long = await writeMileage(db, USER, { tripDate: TODAY, km: 6200, description: "Drive to Toronto conference" });
    expect(long).toMatchObject({ ok: false, message: "6200 km is more than one trip line takes (5000 km)." });
    expect((await writeMileage(db, USER, { tripDate: TODAY, km: 12, description: "" })).ok).toBe(true);
    expect(writes[0].payload).toMatchObject({ description: "", purpose: null });
  });
});

describe("writeMileage and the vehicle logbook (2026-10-19)", () => {
  const car = { id: "car", user_id: USER, name: "Car", is_active: false, created_at: "2024-01-01T12:00:00Z" };
  const truck = { id: "truck", user_id: USER, name: "Truck", is_active: true, created_at: "2025-01-01T12:00:00Z" };

  it("stamps the default vehicle (the oldest active one) when none is given", async () => {
    const { db, writes } = fakeDb({ vehicles: [car, truck] });
    const out = await writeMileage(db, USER, { tripDate: "2026-10-17", km: 18, description: "Showing" });
    expect(out.ok).toBe(true);
    expect(writes[0].payload.vehicle_id).toBe("truck");
  });

  it("works the km out from the odometer, and refuses another agent's vehicle", async () => {
    const { db, writes } = fakeDb({ vehicles: [truck] });
    const out = await writeMileage(db, USER, { tripDate: "2026-10-17", km: 0, description: "Showing", odometerStart: 100, odometerEnd: 123.5, vehicleId: "truck" });
    expect(out.ok).toBe(true);
    expect(writes[0].payload).toMatchObject({ km: 23.5, odometer_start: 100, odometer_end: 123.5, vehicle_id: "truck" });
    const theirs = await writeMileage(db, USER, { tripDate: "2026-10-17", km: 5, description: "x", vehicleId: "someone-elses" });
    expect(theirs).toMatchObject({ ok: false, message: "That vehicle was not found." });
  });
});

describe("updateMileage", () => {
  const trip = { id: "t1", user_id: USER, trip_date: "2025-12-30", km: 20, description: "Showing", cra_rate_per_km: 0.72, odometer_start: 1_000, odometer_end: 1_020, vehicle_id: null };

  it("checks the trip as a new one would be: km over 0 and at most 5,000", async () => {
    const { db, writes } = fakeDb({ mileage_logs: [{ ...trip, odometer_start: null, odometer_end: null }] });
    expect((await updateMileage(db, USER, { mileageId: "t1", km: 0 })).ok).toBe(false);
    expect((await updateMileage(db, USER, { mileageId: "t1", km: 9_000 })).ok).toBe(false);
    expect(writes).toEqual([]);
  });

  it("refuses km that no longer agree with the trip's odometer readings", async () => {
    const { db, writes } = fakeDb({ mileage_logs: [trip] });
    const out = await updateMileage(db, USER, { mileageId: "t1", km: 35 });
    expect(out.ok).toBe(false);
    expect(out.message).toMatch(/do not agree/);
    expect(writes).toEqual([]);
  });

  it("moving a trip into another year takes that year's CRA rate", async () => {
    const { db, writes } = fakeDb({ mileage_logs: [trip] });
    const out = await updateMileage(db, USER, { mileageId: "t1", tripDate: "2026-01-02" });
    expect(out.ok).toBe(true);
    expect(writes[0].payload).toMatchObject({ trip_date: "2026-01-02", cra_rate_per_km: 0.73, km: 20 });
  });

  it("a trip that isn't the agent's is not found", async () => {
    const { db } = fakeDb({ mileage_logs: [{ ...trip, user_id: "someone-else" }] });
    expect(await updateMileage(db, USER, { mileageId: "t1", km: 5 })).toMatchObject({ ok: false });
  });
});

describe("writeExpense (logExpense)", () => {
  it("records GST/HST only as stated", async () => {
    const { db, writes } = fakeDb();
    await writeExpense(db, USER, { vendor: "Shell", amount: 115, categoryKey: "vehicle_fuel", expenseDate: TODAY });
    await writeExpense(db, USER, { vendor: "Shell", amount: 115, taxAmount: 15, categoryKey: "vehicle_fuel", expenseDate: TODAY, notes: "Fill-up" });
    expect(writes[0].payload).toEqual({
      id: expect.any(String), user_id: USER, vendor: "Shell", expense_date: TODAY, total_amount: 115,
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

// ── Saving twice saves once (the phone's offline replay) ─────────────────────

describe("a write saved again with its id lands once", () => {
  it.each([
    ["logExpense", "receipt_expenses", { vendor: "Shell", amount: 64.4, taxAmount: 8.4, categoryKey: "vehicle_fuel", expenseDate: TODAY }],
    ["recordTransaction", "transactions", { address: "40 Pine Ave", clientName: "Pat Roy", side: "buyer", closeDate: TODAY, salePrice: 450000, commissionPct: 2.5 }],
    ["logMileage", "mileage_logs", { tripDate: TODAY, km: 18, description: "Showing" }],
    ["createContactTask", "contact_tasks", { title: "Call Sam", dueDate: TODAY, priority: "normal", clientId: "c-1", clientName: "Sam Lee" }],
    ["logContactActivity", "contact_activities", { clientId: "c-1", clientName: "Sam Lee", type: "call", description: "x" }],
  ] as const)("%s: the database saved it, the reply was lost, the replay counts it as saved", async (tool, table, args) => {
    const { db, tables } = fakeDb(seed());
    const call = { tool, args, id: newRecordId() } as Parameters<typeof applyCaptureWrite>[2];
    expect((await applyCaptureWrite(db, USER, call, TODAY)).ok).toBe(true);
    const replay = await applyCaptureWrite(db, USER, call, TODAY);
    expect(replay).toMatchObject({ ok: true, alreadySaved: true });
    expect((tables[table] ?? []).length).toBe(1);
  });

  it("a primary-key clash on someone else's row is still refused", async () => {
    const id = newRecordId();
    const { db } = fakeDb({ receipt_expenses: [{ id, user_id: "someone-else" }] });
    const out = await writeExpense(db, USER, { vendor: "Shell", amount: 5, categoryKey: "vehicle_fuel", expenseDate: TODAY }, { id });
    expect(out).toMatchObject({ ok: false, code: "23505" });
  });

  it("a queued new client replayed after its reply was lost is the client, not a duplicate", async () => {
    const { db, tables } = fakeDb(seed());
    const id = newRecordId();
    expect((await writeClient(db, USER, { name: "Dana Whitfield" }, { id })).ok).toBe(true);
    const replay = await writeClient(db, USER, { name: "Dana Whitfield" }, { id });
    expect(replay).toMatchObject({ ok: true, alreadySaved: true, id });
    expect(tables.clients.filter((c) => c.name === "Dana Whitfield")).toHaveLength(1);
  });

  it("a retry through applyCaptureWrites reuses the row ids it was given", async () => {
    const { db, tables, options } = fakeDb(seed());
    const ws: ProposedWrite[] = [{ id: "w1", tool: "logExpense", intent: "new_expense", include: true, warnings: [], args: { vendor: "Java Moose", amount: 6.75, categoryKey: "meals_client", expenseDate: TODAY } }];
    // The web has no queue: the save reached the database but the reply was lost.
    options.offline = [];
    const first = await applyCaptureWrites(db, USER, ws, { today: TODAY });
    const retry = await applyCaptureWrites(db, USER, ws, { today: TODAY, rowIds: { w1: first[0].rowId! } });
    expect(retry[0]).toMatchObject({ status: "saved", rowId: first[0].rowId });
    expect(tables.receipt_expenses).toHaveLength(1);
  });
});

describe("queued writes", () => {
  it("a queued activity carries the capture's day, not the day it syncs", async () => {
    const { db } = fakeDb(seed(), { offline: ["clients", "contact_activities"] });
    const queued: Array<Record<string, unknown>> = [];
    const ws: ProposedWrite[] = [{
      id: "w1", tool: "logContactActivity", intent: "log_activity", include: true, warnings: [],
      client: clientChoice({ spoken: "Sam", selectedId: "c-1" }),
      args: { clientId: "c-1", clientName: "Sam Lee", type: "showing", description: "Walked 12 Elm" },
    }];
    const results = await applyCaptureWrites(db, USER, ws, { today: "2026-10-18", queue: (c) => { queued.push(c as never); return true; } });
    expect(results[0].status).toBe("queued");
    expect(queued[0]).toMatchObject({ tool: "logContactActivity", id: results[0].rowId, args: { activityDate: "2026-10-18" } });
  });
});

describe("Save the rest after a new client saved", () => {
  it("points the item that failed at the saved client, so the retry lands on them", async () => {
    const { db, tables } = fakeDb(seed());
    const ws = noteWithNewClient();
    // The task's date is bad: it fails while the client saves.
    ws[1] = { ...ws[1], args: { ...ws[1].args, dueDate: "2026-02-30" } } as ProposedWrite;
    const first = await applyCaptureWrites(db, USER, ws, { today: TODAY });
    expect(first.map((r) => r.status)).toEqual(["saved", "failed", "saved", "skipped"]);
    const dana = tables.clients.find((c) => c.name === "Dana Whitfield")!;

    // The card: point the rest at the saved client, the agent fixes the date, Save the rest.
    let next = settleSavedClients(ws, first);
    expect(next[1].client).toMatchObject({ selectedId: dana.id, newClientWriteId: null });
    next = next.map((w) => (w.id === "w2" ? ({ ...w, args: { ...w.args, dueDate: "2026-10-21" } } as ProposedWrite) : w));
    const pending = next.filter((w) => w.include && !isSettled(first.find((r) => r.writeId === w.id)));
    expect(pending.map((w) => w.id)).toEqual(["w2"]);
    const rowIds = Object.fromEntries(first.filter((r) => r.rowId).map((r) => [r.writeId, r.rowId!]));
    const retry = await applyCaptureWrites(db, USER, pending, { today: TODAY, rowIds });
    expect(retry[0]).toMatchObject({ writeId: "w2", status: "saved" });
    expect(tables.contact_tasks.find((t) => t.title === "Send Dana the listings")).toMatchObject({ client_id: dana.id });
    expect(tables.clients.filter((c) => c.name === "Dana Whitfield")).toHaveLength(1);
  });

  it("a new client skipped as already on file is settled (the card reaches Done)", async () => {
    const { db } = fakeDb(seed());
    const ws = noteWithNewClient();
    ws[0] = { ...ws[0], args: { name: "Sam Lee" } } as ProposedWrite;
    const results = await applyCaptureWrites(db, USER, ws, { today: TODAY });
    expect(results[0]).toMatchObject({ status: "skipped", client: { id: "c-1" } });
    expect(isSettled(results[0])).toBe(true);
    expect(isSettled(results.find((r) => r.status === "failed"))).toBe(false);
  });
});

describe("malformed writes never throw", () => {
  it("checkWrite reads missing or wrongly typed fields as blank", () => {
    const bad = { id: "w1", tool: "logMileage", intent: "log_trip", include: true, warnings: [], args: { km: "18" } } as unknown as ProposedWrite;
    expect(() => checkWrite(bad)).not.toThrow();
    expect(checkWrite(bad)).toEqual(["Add the kilometres.", "Fix the trip date.", "Add the trip purpose."]);
    const noArgs = { id: "w2", tool: "createClient", intent: "new_client", include: true, warnings: [] } as unknown as ProposedWrite;
    expect(checkWrite(noArgs)).toEqual(["Add the name."]);
  });

  it("argTypeProblems names each wrong field before anything is written", () => {
    expect(argTypeProblems("logExpense", { vendor: "X", amount: "5", categoryKey: "meals_client", expenseDate: TODAY })).toEqual(["amount must be a number."]);
    expect(argTypeProblems("createClient", { name: "Dana", sql: "drop" })).toEqual(["sql is not a field of createClient."]);
    expect(argTypeProblems("logContactActivity", null)).toEqual(["args must be an object."]);
    expect(argTypeProblems("logMileage", { tripDate: TODAY, km: 12, description: "x" })).toEqual([]);
  });

  it("a write that throws is reported and the rest of the batch still saves", async () => {
    const { db, tables } = fakeDb(seed());
    const exploding = { id: "w1", tool: "createClient", intent: "new_client", include: true, warnings: [], get args(): never { throw new Error("bad args"); } } as unknown as ProposedWrite;
    const ok: ProposedWrite = { id: "w2", tool: "logMileage", intent: "log_trip", include: true, warnings: [], args: { tripDate: TODAY, km: 9, description: "Showing" } };
    const results = await applyCaptureWrites(db, USER, [exploding, ok], { today: TODAY });
    expect(results.map((r) => r.status)).toEqual(["failed", "saved"]);
    expect(tables.mileage_logs).toHaveLength(1);
  });
});

describe("the writers keep what the Flight Crew tools accepted", () => {
  it("a blank vendor and a blank task title still save; the card asks for them", async () => {
    const { db } = fakeDb(seed());
    expect((await writeExpense(db, USER, { vendor: "", amount: 5, categoryKey: "other_misc", expenseDate: TODAY })).ok).toBe(true);
    expect((await writeContactTask(db, USER, { title: "", dueDate: TODAY, priority: "normal" })).ok).toBe(true);
  });
});

describe("a row id already used by a different record", () => {
  it("is refused, not reported saved: the second expense is never dropped silently", async () => {
    const { db, tables } = fakeDb(seed());
    const id = newRecordId();
    expect((await writeExpense(db, USER, { vendor: "Irving", amount: 64.4, categoryKey: "vehicle_fuel", expenseDate: TODAY }, { id })).ok).toBe(true);
    const other = await writeExpense(db, USER, { vendor: "Esso", amount: 51.2, categoryKey: "vehicle_fuel", expenseDate: "2026-10-17" }, { id });
    expect(other).toMatchObject({ ok: false, code: "ID_IN_USE" });
    expect(other.alreadySaved).toBeUndefined();
    expect(tables.receipt_expenses).toHaveLength(1);
  });

  it("the same write replayed (same figures, numbers back as strings) is still saved once", async () => {
    const id = newRecordId();
    // As PostgREST can return a numeric column: as text.
    const { db } = fakeDb({ ...seed(), mileage_logs: [{ id, user_id: USER, km: "18.0", trip_date: TODAY }] });
    expect(await writeMileage(db, USER, { tripDate: TODAY, km: 18, description: "Showing" }, { id })).toMatchObject({ ok: true, alreadySaved: true });
  });
});

describe("a new client whose name is in the Hangar", () => {
  const archived = { id: "c-arch", user_id: USER, name: "Dana Whitfield", name_search: "dana whitfield", status: "cruising", archived_at: "2026-01-02T00:00:00Z" };

  it("is not added (the unique key counts archived clients); the archived client is returned", async () => {
    const { db, writes } = fakeDb(seed({ clients: [CLIENT, archived] }));
    const out = await writeClient(db, USER, { name: "Dana Whitfield" });
    expect(out).toMatchObject({ ok: false, duplicateOf: { id: "c-arch", name: "Dana Whitfield", archived: true } });
    expect(out.message).toMatch(/in the Hangar/);
    expect(writes).toEqual([]);
  });

  it("an active client with that name wins over an archived one", async () => {
    const active = { ...archived, id: "c-act", archived_at: null };
    const { db } = fakeDb(seed({ clients: [archived, active] }));
    expect((await writeClient(db, USER, { name: "Dana Whitfield" })).duplicateOf).toEqual({ id: "c-act", name: "Dana Whitfield" });
  });

  it("the note's other items go on the archived client, and the card says so", async () => {
    const { db, writes } = fakeDb(seed({ clients: [CLIENT, archived] }));
    const results = await applyCaptureWrites(db, USER, noteWithNewClient(), { today: TODAY });
    expect(results[0]).toMatchObject({ status: "skipped", client: { id: "c-arch" } });
    expect(results[0].message).toMatch(/in the Hangar/);
    expect(writes.find((w) => w.table === "contact_tasks")!.payload).toMatchObject({ client_id: "c-arch" });
  });
});
