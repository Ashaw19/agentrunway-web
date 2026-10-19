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
  removeSuggestionDismissal,
  removeSuggestionSkipByKey,
  restoreClientFromHangar,
  resumeSuggestions,
  writeClient,
  writeContactActivity,
  writeContactTask,
  writeDealCloseDate,
  writeDealStage,
  writeClientToHangar,
  writeExpense,
  writeMileage,
  writeSuggestionHold,
  writeSuggestionSkip,
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

  it("when the vehicle list can't be read, the trip is not saved with no vehicle", async () => {
    const offline = fakeDb({ vehicles: [car, truck] }, { offline: ["vehicles"] });
    const out = await writeMileage(offline.db, USER, { tripDate: "2026-10-17", km: 18, description: "Showing" });
    expect(out).toMatchObject({ ok: false, offline: true });
    expect(out.message).toMatch(/read your vehicles/);
    expect(offline.writes).toEqual([]);
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

// ── Skip, Later, Stop and the Hangar (phone dashboard "Next up") ─────────────

const DISMISSALS = "flight_control_dismissals";
const OCCURRENCE_KEY = ["user_id", "client_id", "opportunity_type", "trigger_date"];
const OCCURRENCE_CONFLICT = "user_id,client_id,opportunity_type,trigger_date";
/** Monday 2026-10-19, 12:00 in Atlantic time (ADT, UTC-3). */
const NOW = new Date("2026-10-19T15:00:00.000Z");
const DAY = "2026-10-19";
const HOUR_LATER = new Date(NOW.getTime() + 3_600_000);
const idleOf = (client_id: string, trigger_date = "2026-10-01") => ({ client_id, opportunity_type: "idle_client", trigger_date });
const dismissals = (extra: Record<string, Row[]> = {}, options: Parameters<typeof fakeDb>[1] = {}) =>
  fakeDb({ ...seed(), ...extra }, { unique: { [DISMISSALS]: OCCURRENCE_KEY }, ...options });

describe("writeSuggestionSkip", () => {
  it("saves one skipped occurrence with a device-made id, cut to the day", async () => {
    const { db, writes } = dismissals();
    const out = await writeSuggestionSkip(db, USER, idleOf("c-1", "2026-10-01T00:00:00Z"));
    expect(out).toMatchObject({ ok: true, id: expect.any(String) });
    expect(out.alreadySaved).toBeUndefined();
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ table: DISMISSALS, op: "insert" });
    // A skip has no end: the table refuses a skip that carries `until`.
    expect(writes[0].payload).toEqual({
      id: out.id,
      user_id: USER,
      client_id: "c-1",
      opportunity_type: "idle_client",
      trigger_date: "2026-10-01",
      kind: "skip",
    });
  });

  it("uses the id it is given, and the same id again is saved once", async () => {
    const { db, tables } = dismissals();
    const id = newRecordId();
    expect(await writeSuggestionSkip(db, USER, idleOf("c-1"), { id })).toMatchObject({ ok: true, id });
    expect(await writeSuggestionSkip(db, USER, idleOf("c-1"), { id })).toMatchObject({ ok: true, alreadySaved: true, id });
    expect(tables[DISMISSALS]).toHaveLength(1);
  });

  it("the same occurrence skipped twice from two devices counts as saved, and names the row that is there", async () => {
    const { db, tables } = dismissals();
    const first = await writeSuggestionSkip(db, USER, idleOf("c-1"));
    const second = await writeSuggestionSkip(db, USER, idleOf("c-1", "2026-10-01T09:30:00Z"));
    expect(second).toMatchObject({ ok: true, alreadySaved: true, id: first.id });
    expect(tables[DISMISSALS]).toHaveLength(1);
  });

  it("a new occurrence of the same reason, or another reason, is its own row", async () => {
    const { db, tables } = dismissals();
    await writeSuggestionSkip(db, USER, idleOf("c-1", "2026-10-01"));
    await writeSuggestionSkip(db, USER, idleOf("c-1", "2026-11-01"));
    await writeSuggestionSkip(db, USER, { client_id: "c-1", opportunity_type: "birthday", trigger_date: "2026-10-01" });
    expect(tables[DISMISSALS]).toHaveLength(3);
  });

  it("only the user's own rows count as the earlier save", async () => {
    // Someone else's row holds this id (and the same client, reason and day): the
    // clash is not this write's earlier save.
    const taken = newRecordId();
    const { db, tables } = dismissals({ [DISMISSALS]: [{ id: taken, user_id: "someone-else", ...idleOf("c-1"), kind: "skip" }] });
    expect(await writeSuggestionSkip(db, USER, idleOf("c-1"), { id: taken })).toMatchObject({ ok: false, code: "23505" });
    expect(tables[DISMISSALS]).toHaveLength(1);
    // Another user skipping the same client and reason is a different key.
    const other = dismissals({ [DISMISSALS]: [{ id: "x-1", user_id: "someone-else", ...idleOf("c-1"), kind: "skip" }] });
    expect(await writeSuggestionSkip(other.db, USER, idleOf("c-1"))).toMatchObject({ ok: true });
    expect(other.tables[DISMISSALS]).toHaveLength(2);
  });

  it("refuses what the table would, in plain words, before any write", async () => {
    const { db, writes } = dismissals();
    expect((await writeSuggestionSkip(db, USER, idleOf(""))).message).toBe("Pick the client first.");
    expect((await writeSuggestionSkip(db, USER, { client_id: "c-1", opportunity_type: "", trigger_date: "2026-10-01" })).ok).toBe(false);
    expect((await writeSuggestionSkip(db, USER, idleOf("c-1", "2026-02-30"))).message).toBe("The suggestion's date isn't a real date.");
    // 'any' is a hold's reason: a skip under it would collide with the client's hold row.
    expect((await writeSuggestionSkip(db, USER, { client_id: "c-1", opportunity_type: "any", trigger_date: "2026-10-01" })).ok).toBe(false);
    expect(writes).toEqual([]);
  });

  it("a dropped connection is offline (the phone queues it), a refusal is not", async () => {
    const offline = dismissals({}, { offline: [DISMISSALS] });
    expect(await writeSuggestionSkip(offline.db, USER, idleOf("c-1"))).toMatchObject({ ok: false, offline: true });
    const refused = dismissals({}, { fail: { [DISMISSALS]: { code: "42501", message: "rls" } } });
    expect(await writeSuggestionSkip(refused.db, USER, idleOf("c-1"))).toMatchObject({ ok: false, offline: false, code: "42501" });
  });

  it("the reply was lost after the save: the replay finds the row and counts it saved", async () => {
    const { db, tables } = dismissals({}, { lostReplies: [DISMISSALS] });
    const id = newRecordId();
    const first = await writeSuggestionSkip(db, USER, idleOf("c-1"), { id });
    expect(first).toMatchObject({ ok: false, offline: true });
    expect(await writeSuggestionSkip(db, USER, idleOf("c-1"), { id })).toMatchObject({ ok: true, alreadySaved: true, id });
    expect(tables[DISMISSALS]).toHaveLength(1);
  });
});

describe("writeSuggestionHold", () => {
  const later = (until = HOUR_LATER) => ({ clientId: "c-1", clientName: "Sam Lee", kind: "later" as const, until });
  const stop = (until = new Date("2027-01-19T04:00:00.000Z")) => ({ clientId: "c-1", clientName: "Sam Lee", kind: "stop" as const, until });

  it("a Later is one row for the client: reason 'any', the Atlantic day, the end as an instant", async () => {
    const { db, writes } = dismissals();
    const out = await writeSuggestionHold(db, USER, later(), DAY, NOW);
    expect(out.ok).toBe(true);
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ table: DISMISSALS, op: "upsert", onConflict: OCCURRENCE_CONFLICT });
    expect(writes[0].payload).toEqual({
      user_id: USER,
      client_id: "c-1",
      opportunity_type: "any",
      trigger_date: DAY,
      kind: "later",
      until: HOUR_LATER.toISOString(),
      dismissed_at: NOW.toISOString(),
    });
  });

  it("sends no row id, so a second hold the same day can't change the first row's id", async () => {
    const { db, writes } = dismissals();
    await writeSuggestionHold(db, USER, later(), DAY, NOW);
    expect(writes[0].payload).not.toHaveProperty("id");
  });

  it("a second hold the same day updates the same row", async () => {
    const { db, writes, tables } = dismissals();
    const tonight = new Date("2026-10-19T22:00:00.000Z");
    await writeSuggestionHold(db, USER, later(), DAY, NOW);
    await writeSuggestionHold(db, USER, later(tonight), DAY, NOW);
    expect(writes.map((w) => [w.op, w.onConflict])).toEqual([["upsert", OCCURRENCE_CONFLICT], ["upsert", OCCURRENCE_CONFLICT]]);
    expect(tables[DISMISSALS]).toHaveLength(1);
    expect(tables[DISMISSALS][0]).toMatchObject({ kind: "later", until: tonight.toISOString() });
  });

  it("a Stop replaces a Later the same day", async () => {
    const { db, tables } = dismissals();
    await writeSuggestionHold(db, USER, later(), DAY, NOW);
    const out = await writeSuggestionHold(db, USER, stop(), DAY, NOW);
    expect(out.ok).toBe(true);
    expect(tables[DISMISSALS]).toHaveLength(1);
    expect(tables[DISMISSALS][0]).toMatchObject({ kind: "stop", until: "2027-01-19T04:00:00.000Z" });
  });

  it("a Later never replaces a Stop that is still running: saved, unchanged, and says so", async () => {
    const running = { id: "h-1", user_id: USER, client_id: "c-1", opportunity_type: "any", trigger_date: "2026-10-05", kind: "stop", until: "2027-01-05T04:00:00.000Z" };
    const { db, writes, tables } = dismissals({ [DISMISSALS]: [running] });
    const out = await writeSuggestionHold(db, USER, later(), DAY, NOW);
    expect(out).toMatchObject({ ok: true, message: "Suggestions for Sam Lee are already stopped until January 5, 2027." });
    expect(writes).toEqual([]);
    expect(tables[DISMISSALS]).toEqual([running]);
  });

  it("a Later on the day a Stop was made leaves that Stop in place", async () => {
    const { db, tables } = dismissals();
    await writeSuggestionHold(db, USER, stop(), DAY, NOW);
    const out = await writeSuggestionHold(db, USER, later(), DAY, NOW);
    expect(out.ok).toBe(true);
    expect(tables[DISMISSALS]).toHaveLength(1);
    expect(tables[DISMISSALS][0]).toMatchObject({ kind: "stop" });
  });

  it("a Stop that has ended, or is another user's, does not stand in the way of a Later", async () => {
    const ended = { id: "h-1", user_id: USER, client_id: "c-1", opportunity_type: "any", trigger_date: "2026-04-01", kind: "stop", until: "2026-07-01T03:00:00.000Z" };
    const theirs = { id: "h-2", user_id: "someone-else", client_id: "c-1", opportunity_type: "any", trigger_date: "2026-10-05", kind: "stop", until: "2027-01-05T04:00:00.000Z" };
    const { db, tables } = dismissals({ [DISMISSALS]: [ended, theirs] });
    const out = await writeSuggestionHold(db, USER, later(), DAY, NOW);
    expect(out).toMatchObject({ ok: true });
    expect(out.message).not.toMatch(/already stopped/);
    expect(tables[DISMISSALS].filter((r) => r.user_id === USER && r.kind === "later")).toHaveLength(1);
  });

  it("a Stop on another client does not hold this one's Later back", async () => {
    const running = { id: "h-1", user_id: USER, client_id: "c-2", opportunity_type: "any", trigger_date: "2026-10-05", kind: "stop", until: "2027-01-05T04:00:00.000Z" };
    const { db, writes } = dismissals({ [DISMISSALS]: [running] });
    await writeSuggestionHold(db, USER, later(), DAY, NOW);
    expect(writes).toHaveLength(1);
  });

  it("refuses a time that has already passed, the moment itself included", async () => {
    const { db, writes } = dismissals();
    for (const until of [NOW, new Date(NOW.getTime() - 1), new Date("2026-10-18T22:00:00.000Z")]) {
      expect(await writeSuggestionHold(db, USER, later(until), DAY, NOW)).toMatchObject({ ok: false, message: "That time has already passed." });
    }
    expect(await writeSuggestionHold(db, USER, later(new Date(NOW.getTime() + 1)), DAY, NOW)).toMatchObject({ ok: true });
    expect(writes).toHaveLength(1);
  });

  it("uses the real clock when no `now` is passed", async () => {
    const { db } = dismissals();
    expect(await writeSuggestionHold(db, USER, later(new Date(Date.now() - 60_000)), DAY)).toMatchObject({ ok: false, message: "That time has already passed." });
    expect(await writeSuggestionHold(db, USER, later(new Date(Date.now() + 3_600_000)), DAY)).toMatchObject({ ok: true });
  });

  it("refuses a hold with no client, no real time, a bad day or a kind that isn't a hold", async () => {
    const { db, writes } = dismissals();
    expect((await writeSuggestionHold(db, USER, { ...later(), clientId: "" }, DAY, NOW)).message).toBe("Pick the client first.");
    expect((await writeSuggestionHold(db, USER, later(new Date(NaN)), DAY, NOW)).ok).toBe(false);
    expect((await writeSuggestionHold(db, USER, later(), "2026-13-01", NOW)).ok).toBe(false);
    expect((await writeSuggestionHold(db, USER, { ...later(), kind: "skip" as unknown as "later" }, DAY, NOW)).ok).toBe(false);
    expect(writes).toEqual([]);
  });

  it("a row whose kind isn't one of ours is not a Stop", async () => {
    const odd = { id: "h-1", user_id: USER, client_id: "c-1", opportunity_type: "any", trigger_date: "2026-10-05", kind: "paused", until: "2027-01-05T04:00:00.000Z" };
    const { db, writes } = dismissals({ [DISMISSALS]: [odd] });
    expect(await writeSuggestionHold(db, USER, later(), DAY, NOW)).toMatchObject({ ok: true });
    expect(writes).toHaveLength(1);
  });

  it("a dropped connection is offline, a refusal is not", async () => {
    const offline = dismissals({}, { offline: [DISMISSALS] });
    expect(await writeSuggestionHold(offline.db, USER, later(), DAY, NOW)).toMatchObject({ ok: false, offline: true });
    const refused = dismissals({}, { fail: { [DISMISSALS]: { code: "42501", message: "rls" } } });
    expect(await writeSuggestionHold(refused.db, USER, later(), DAY, NOW)).toMatchObject({ ok: false, offline: false, code: "42501" });
  });
});

describe("undoing a skip or a hold", () => {
  const skip = (id: string, user = USER, client = "c-1", date = "2026-10-01") => ({ id, user_id: user, ...idleOf(client, date), kind: "skip" });
  const hold = (id: string, kind: string, user = USER, client = "c-1") => ({ id, user_id: user, client_id: client, opportunity_type: "any", trigger_date: DAY, kind, until: "2027-01-05T04:00:00.000Z" });

  it("removeSuggestionDismissal deletes the user's row by id and nobody else's", async () => {
    const { db, tables } = dismissals({ [DISMISSALS]: [skip("d-1"), skip("d-2", "someone-else", "c-1", "2026-10-02")] });
    expect(await removeSuggestionDismissal(db, USER, "d-2")).toMatchObject({ ok: true });
    expect(tables[DISMISSALS].map((r) => r.id)).toEqual(["d-1", "d-2"]);
    expect(await removeSuggestionDismissal(db, USER, "d-1")).toMatchObject({ ok: true });
    expect(tables[DISMISSALS].map((r) => r.id)).toEqual(["d-2"]);
  });

  it("undoing a skip that is already gone is fine, and a missing id is not", async () => {
    const { db } = dismissals();
    expect(await removeSuggestionDismissal(db, USER, "nope")).toMatchObject({ ok: true });
    expect((await removeSuggestionDismissal(db, USER, "")).ok).toBe(false);
  });

  it("removeSuggestionSkipByKey deletes exactly that occurrence", async () => {
    const { db, tables } = dismissals({
      [DISMISSALS]: [skip("d-1"), skip("d-2", USER, "c-1", "2026-11-01"), skip("d-3", USER, "c-2"), skip("d-4", "someone-else"), hold("h-1", "later")],
    });
    expect(await removeSuggestionSkipByKey(db, USER, idleOf("c-1", "2026-10-01T00:00:00Z"))).toMatchObject({ ok: true });
    expect(tables[DISMISSALS].map((r) => r.id)).toEqual(["d-2", "d-3", "d-4", "h-1"]);
  });

  it("removeSuggestionSkipByKey never takes out a hold", async () => {
    const { db, tables } = dismissals({ [DISMISSALS]: [hold("h-1", "later")] });
    expect((await removeSuggestionSkipByKey(db, USER, { client_id: "c-1", opportunity_type: "any", trigger_date: DAY })).ok).toBe(false);
    expect(tables[DISMISSALS]).toHaveLength(1);
  });

  it("resumeSuggestions deletes the client's Later and Stop rows, nothing else", async () => {
    const { db, tables } = dismissals({
      [DISMISSALS]: [
        hold("h-1", "later"), hold("h-2", "stop"),
        skip("d-1"),                       // a skip is one occurrence, not a hold
        hold("h-3", "later", USER, "c-2"), // another client
        hold("h-4", "stop", "someone-else"), // another user
      ],
    });
    const out = await resumeSuggestions(db, USER, "c-1");
    expect(out).toMatchObject({ ok: true });
    expect(tables[DISMISSALS].map((r) => r.id)).toEqual(["d-1", "h-3", "h-4"]);
  });

  it("resuming a client with no hold is fine, and a missing client is not", async () => {
    const { db } = dismissals();
    expect(await resumeSuggestions(db, USER, "c-1")).toMatchObject({ ok: true });
    expect((await resumeSuggestions(db, USER, "")).message).toBe("Pick the client first.");
  });

  it("a dropped connection is offline", async () => {
    const offline = dismissals({}, { offline: [DISMISSALS] });
    expect(await resumeSuggestions(offline.db, USER, "c-1")).toMatchObject({ ok: false, offline: true });
    expect(await removeSuggestionDismissal(offline.db, USER, "d-1")).toMatchObject({ ok: false, offline: true });
  });
});

describe("the Hangar writers", () => {
  const sam = { clientId: "c-1", clientName: "Sam Lee" };

  it("writeClientToHangar archives the client with the reason 'other'", async () => {
    const { db, writes, tables } = fakeDb(seed());
    const before = Date.now();
    const out = await writeClientToHangar(db, USER, sam);
    expect(out).toMatchObject({ ok: true, message: "Sam Lee moved to the Hangar." });
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ table: "clients", op: "update", payload: { archive_reason: "other" } });
    const at = Date.parse(String(tables.clients[0].archived_at));
    expect(at).toBeGreaterThanOrEqual(before);
    expect(at).toBeLessThanOrEqual(Date.now());
    expect(tables.clients[0].archive_reason).toBe("other");
  });

  it("refuses a client who is already in the Hangar, and writes nothing", async () => {
    const archived = { ...CLIENT, archived_at: "2026-09-01T12:00:00.000Z", archive_reason: "moved_away" };
    const { db, writes, tables } = fakeDb(seed({ clients: [archived] }));
    const out = await writeClientToHangar(db, USER, sam);
    expect(out).toEqual({ ok: false, message: "Sam Lee is already in the Hangar." });
    expect(writes).toEqual([]);
    expect(tables.clients[0]).toMatchObject({ archive_reason: "moved_away" }); // not overwritten
  });

  it("only moves the user's own client", async () => {
    const theirs = { ...CLIENT, user_id: "someone-else" };
    const { db, writes, tables } = fakeDb(seed({ clients: [theirs] }));
    expect(await writeClientToHangar(db, USER, sam)).toMatchObject({ ok: false, message: "Sam Lee wasn't found in your clients." });
    expect(writes).toEqual([]);
    expect(tables.clients[0].archived_at).toBeNull();
    expect((await writeClientToHangar(db, USER, { clientId: "", clientName: "" })).message).toBe("Pick the client first.");
  });

  it("restoreClientFromHangar clears both fields", async () => {
    const archived = { ...CLIENT, archived_at: "2026-10-19T15:00:00.000Z", archive_reason: "other" };
    const { db, writes, tables } = fakeDb(seed({ clients: [archived] }));
    const out = await restoreClientFromHangar(db, USER, sam);
    expect(out).toMatchObject({ ok: true, message: "Sam Lee is back from the Hangar." });
    expect(writes[0].payload).toEqual({ archived_at: null, archive_reason: null });
    expect(tables.clients[0]).toMatchObject({ archived_at: null, archive_reason: null });
  });

  it("restoreClientFromHangar only touches the user's own client", async () => {
    const theirs = { ...CLIENT, user_id: "someone-else", archived_at: "2026-10-19T15:00:00.000Z", archive_reason: "other" };
    const { db, tables } = fakeDb(seed({ clients: [theirs] }));
    expect(await restoreClientFromHangar(db, USER, sam)).toMatchObject({ ok: false, message: "Sam Lee wasn't found in your clients." });
    expect(tables.clients[0].archive_reason).toBe("other");
  });

  it("a dropped connection is offline, a refusal is not", async () => {
    const offline = fakeDb(seed(), { offline: ["clients"] });
    expect(await writeClientToHangar(offline.db, USER, sam)).toMatchObject({ ok: false, offline: true });
    expect(await restoreClientFromHangar(offline.db, USER, sam)).toMatchObject({ ok: false, offline: true });
    const refused = fakeDb(seed(), { fail: { clients: { code: "42501", message: "rls" } } });
    expect(await writeClientToHangar(refused.db, USER, sam)).toMatchObject({ ok: false, offline: false, code: "42501" });
  });
});
