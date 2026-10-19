/**
 * The write half of Flight Crew's record tools, shared by every surface:
 *
 *   Flight Crew chat   apps/web/lib/ai/tools.ts (the tool formats its own reply)
 *   MCP                apps/web/supabase/functions/mcp-server/tools/capture.ts
 *   web voice button   apps/web/components/voice-capture-dialog.tsx
 *   iPhone             apps/mobile/lib/voice-capture.ts (and its offline replay)
 *
 * Each writer takes the tool's argument shape (lib/capture/types.ts), the
 * signed-in user's own client (RLS applies) and that user's id. A
 * token-scoped client has no session, so the id is passed in rather than read
 * with auth.getUser(). Rows go through write-rows.ts, so NOT NULL text columns
 * get '' and a client gets name_search.
 *
 * Every insert carries its row id, made by the caller (newRecordId) or here.
 * Saving the same write twice with the same id saves it once: the second
 * insert hits the primary key (23505), and when the row with that id is
 * already there it counts as saved. That is what keeps a write the phone
 * queued from landing twice when the database saved it but the reply was
 * lost (an expense, its ITC or a deal's GCI counted double).
 *
 * The writers accept what the Flight Crew tools accepted before they moved
 * here (a blank trip purpose, vendor or task title still saves, as it did).
 * The confirm card's own checks (capture/proposals.ts checkWrite) ask for
 * those before the agent can save from a voice note.
 *
 * A writer never throws: it returns `ok: false` with the reason, and
 * `offline: true` when the request never reached the database (no PostgREST
 * code), which the phone queues for later.
 *
 * The suggestion writers (skip, Later, Stop, the Hangar) are not Flight Crew
 * capture tools, so applyCaptureWrite doesn't dispatch them; the web Flight
 * Control cards, the phone's Next up and Flight Crew call them directly.
 *
 * Deno: imported by the MCP edge function through its copy of core. Relative
 * imports only.
 */

import type { DbClient } from "./db-client";
import { markMemoryStale } from "./client-memory-stale";
import { activityRow, clientRow, contactTaskRow, mileageRow, receiptExpenseRow, transactionRow } from "./write-rows";
import { FIELD_LIMITS, validateCommissionPaidDate } from "../validation/input-guards";
import type { ActivityType, PipelineStage, TaskPriority } from "../types/database";
import { isIsoDay } from "./capture/dates";
import { atlanticISODate } from "./local-date";
import { HOLD_OPPORTUNITY_TYPE, type OpportunityKeyParts } from "./suggestion-dismissals";
import {
  defaultVehicleFor,
  mileageTripRow,
  ownsVehicle,
  type TripInput,
  type WriteResult,
} from "./vehicle-logbook-writes";
import type { MileageLog } from "../types/database";
import type {
  CaptureTool,
  CaptureToolArgs,
  LogContactActivityArgs,
  LogExpenseArgs,
  LogMileageArgs,
  RecordTransactionArgs,
  UpdatePipelineDealCloseDateArgs,
} from "./capture/types";

export interface WriteOutcome {
  ok: boolean;
  /** Plain words: what was saved, or why not. */
  message: string;
  /** The row's id, when the write made one. */
  id?: string;
  /** The row with this id was already saved (a replay of a write that had landed). */
  alreadySaved?: boolean;
  /** The request never reached the database: the phone queues it. */
  offline?: boolean;
  /** The PostgREST error code, when the database refused it. */
  code?: string;
  /** The saved row, for a caller that shows it (writeMileage: the web Mileage tab, the phone). */
  row?: Record<string, unknown>;
}

/** Options every inserting writer takes. */
export interface InsertOptions {
  /** The row id. Pass the same id on a retry or replay so the row is saved once. */
  id?: string;
}

interface DbError {
  code?: string;
  message?: string;
}

const NETWORK_WORDS = /network|fetch|timed? ?out|offline|connection/i;

/** No PostgREST code and a network-sounding message: the request never got there. */
export function isOfflineError(error: DbError | null | undefined): boolean {
  if (!error) return false;
  if (error.code) return false;
  return NETWORK_WORDS.test(error.message ?? "");
}

function refused(what: string, error: DbError): WriteOutcome {
  const detail =
    error.code === "23514" ? "a value is out of the allowed range"
    : error.code === "23505" ? "it is already on file"
    : error.code === "23503" ? "the record it points to wasn't found"
    : error.code === "42501" ? "permission was refused"
    : error.message || "something went wrong";
  return {
    ok: false,
    message: `Couldn't ${what}: ${detail}.`,
    offline: isOfflineError(error),
    code: error.code,
  };
}

function thrown(what: string, err: unknown): WriteOutcome {
  const message = err instanceof Error ? err.message : String(err);
  return { ok: false, message: `Couldn't ${what}: ${message || "something went wrong"}.`, offline: NETWORK_WORDS.test(message) };
}

const fail = (message: string): WriteOutcome => ({ ok: false, message });

/** Noon UTC on a calendar day: the same day in every Canadian zone (how Flight Crew dates an activity). */
export function activityTimestampFor(day: string): string {
  return `${day}T12:00:00.000Z`;
}

/**
 * A new row id made on the device. Lets a write keep its id across a retry
 * or an offline replay, and lets a capture that adds a client save the
 * client's activity and task in the same go. crypto.randomUUID where the
 * runtime has it (web, server, Deno); a v4 UUID from Math.random on the
 * phone (Hermes has no crypto), which is enough for a primary key nobody
 * else writes.
 */
export function newRecordId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  const hex = (n: number) => Math.floor(Math.random() * 16 ** n).toString(16).padStart(n, "0");
  const variant = (8 + Math.floor(Math.random() * 4)).toString(16);
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${variant}${hex(3)}-${hex(12)}`;
}

/**
 * The fields that must agree before a row already saved under this id is
 * taken as this write (a replay), per table. A row that has the id but
 * different figures is a different record: refused, never reported saved.
 */
const SAME_WRITE_FIELDS: Record<string, readonly string[]> = {
  contact_activities: ["client_id", "type", "description"],
  contact_tasks: ["title", "due_date", "client_id"],
  mileage_logs: ["km", "trip_date"],
  receipt_expenses: ["total_amount", "expense_date", "category_key"],
  transactions: ["date", "address", "sale_price", "gci_override"],
  clients: ["name_search"],
};

/** Equal as the database returns them: numerics may come back as numbers or strings. */
function sameValue(saved: unknown, sent: unknown): boolean {
  if (saved === null || saved === undefined || sent === null || sent === undefined) {
    return (saved ?? null) === (sent ?? null);
  }
  if (typeof saved === "number" || typeof sent === "number") return Number(saved) === Number(sent);
  return String(saved) === String(sent);
}

/**
 * Insert a row that carries its id. A primary-key clash on a row of the
 * user's that is already there, with the same figures, means this write was
 * saved before: success. A row with that id and other figures, or any other
 * clash, is the database refusing it.
 */
async function insertOnce(
  db: DbClient,
  table: string,
  row: Record<string, unknown>,
  userId: string,
): Promise<{ error: DbError | null; alreadySaved?: boolean }> {
  const { error } = await db.from(table).insert(row);
  if (!error) return { error: null };
  if (error.code === "23505" && typeof row.id === "string") {
    const fields = SAME_WRITE_FIELDS[table] ?? [];
    const { data: existing } = await db
      .from(table)
      .select(["id", ...fields].join(", "))
      .eq("id", row.id)
      .eq("user_id", userId)
      .maybeSingle();
    if (existing) {
      const saved = existing as Record<string, unknown>;
      if (fields.every((f) => !(f in row) || sameValue(saved[f], row[f]))) return { error: null, alreadySaved: true };
      return { error: { code: "ID_IN_USE", message: "a different record already has this row id" } };
    }
  }
  return { error };
}

// ── Activity ─────────────────────────────────────────────────────────────────

export interface ActivityOutcome extends WriteOutcome {
  /** The calendar day it was logged on. */
  day?: string;
  priorStatus?: string | null;
  newStatus?: string | null;
}

/**
 * logContactActivity. Any type but `note` counts as contact: the
 * contact_activities trigger moves clients.last_contact_at and may move
 * Cruising or Scheduled to Boarding (00105). A note is a memo, not contact.
 * What Flight Crew remembers about the client is marked out of date.
 *
 * `today` is the caller's calendar day (atlanticISODate() on a server,
 * localISODate() on a device), used only for the reply.
 */
export async function writeContactActivity(
  db: DbClient,
  userId: string,
  args: LogContactActivityArgs,
  today: string,
  options: InsertOptions = {},
): Promise<ActivityOutcome> {
  const description = (typeof args.description === "string" ? args.description : "").trim().slice(0, FIELD_LIMITS.description);
  if (!args.clientId) return fail("Pick the client first.");
  if (args.activityDate !== undefined && !isIsoDay(args.activityDate)) return fail("The activity date isn't a real date.");
  const id = options.id ?? newRecordId();
  try {
    const { data: before, error: readError } = await db
      .from("clients")
      .select("status")
      .eq("id", args.clientId)
      .eq("user_id", userId)
      .maybeSingle();
    if (readError) return refused("find the client", readError);
    if (!before) return fail(`${args.clientName || "That client"} wasn't found in your clients.`);
    const priorStatus = (before.status as string | null) ?? null;

    const { error, alreadySaved } = await insertOnce(db, "contact_activities", activityRow({
      id,
      user_id: userId,
      client_id: args.clientId,
      type: args.type as ActivityType,
      description,
      activity_date: args.activityDate ? activityTimestampFor(args.activityDate) : new Date().toISOString(),
    }), userId);
    if (error) return refused("log the activity", error);

    void markMemoryStale(db, userId, args.clientId);

    let newStatus = priorStatus;
    if (priorStatus === "cruising" || priorStatus === "scheduled") {
      const { data: after } = await db
        .from("clients")
        .select("status")
        .eq("id", args.clientId)
        .eq("user_id", userId)
        .maybeSingle();
      newStatus = (after?.status as string | null) ?? priorStatus;
    }
    const day = args.activityDate ?? today;
    const what = args.type === "note" ? "Note saved" : `Logged ${args.type}`;
    return { ok: true, message: `${what} on ${args.clientName || "the client"} for ${day}.`, id, alreadySaved, day, priorStatus, newStatus };
  } catch (err) {
    return thrown("log the activity", err);
  }
}

// ── Checklist item ───────────────────────────────────────────────────────────

/** createContactTask: an item on the Checklist, with or without a client. */
export async function writeContactTask(
  db: DbClient,
  userId: string,
  args: CaptureToolArgs["createContactTask"],
  options: InsertOptions = {},
): Promise<WriteOutcome> {
  const title = (typeof args.title === "string" ? args.title : "").trim();
  if (!isIsoDay(args.dueDate)) return fail("The due date isn't a real date.");
  const id = options.id ?? newRecordId();
  try {
    if (args.clientId) {
      const { data: owner, error: readError } = await db
        .from("clients")
        .select("id")
        .eq("id", args.clientId)
        .eq("user_id", userId)
        .maybeSingle();
      if (readError) return refused("find the client", readError);
      if (!owner) return fail(`${args.clientName || "That client"} wasn't found in your clients.`);
    }
    const { error, alreadySaved } = await insertOnce(db, "contact_tasks", contactTaskRow({
      id,
      user_id: userId,
      client_id: args.clientId || null,
      title,
      due_date: args.dueDate,
      priority: (args.priority ?? "normal") as TaskPriority,
      notes: args.notes,
    }), userId);
    if (error) return refused("add the Checklist item", error);
    return { ok: true, message: `Added to your Checklist: "${title.slice(0, 80)}", due ${args.dueDate}.`, id, alreadySaved };
  } catch (err) {
    return thrown("add the Checklist item", err);
  }
}

// ── Pipeline deal ────────────────────────────────────────────────────────────

/**
 * updatePipelineDealStage. Flight Crew may set `closed` (the Closing Day
 * prompt then records the sale); a capture never proposes it. Setting the
 * same stage twice is harmless, so a replay needs no id.
 */
export async function writeDealStage(
  db: DbClient,
  userId: string,
  args: { dealId: string; dealDescription: string; stage: PipelineStage },
): Promise<WriteOutcome> {
  if (!args.dealId) return fail("Pick the deal first.");
  try {
    const { data, error } = await db
      .from("pipeline_deals")
      .update({ stage: args.stage, updated_at: new Date().toISOString() })
      .eq("id", args.dealId)
      .eq("user_id", userId)
      .select("id");
    if (error) return refused("update the deal stage", error);
    if (Array.isArray(data) && data.length === 0) return fail(`${args.dealDescription || "That deal"} wasn't found in your pipeline.`);
    return { ok: true, message: `${args.dealDescription || "Deal"} moved to ${args.stage}.` };
  } catch (err) {
    return thrown("update the deal stage", err);
  }
}

/** updatePipelineDealCloseDate: the expected close date (idempotent, like the stage). */
export async function writeDealCloseDate(
  db: DbClient,
  userId: string,
  args: UpdatePipelineDealCloseDateArgs,
): Promise<WriteOutcome> {
  if (!args.dealId) return fail("Pick the deal first.");
  if (!isIsoDay(args.closeDate)) return fail("The close date isn't a real date.");
  try {
    const { data, error } = await db
      .from("pipeline_deals")
      .update({ expected_close_date: args.closeDate, updated_at: new Date().toISOString() })
      .eq("id", args.dealId)
      .eq("user_id", userId)
      .select("id");
    if (error) return refused("update the close date", error);
    if (Array.isArray(data) && data.length === 0) return fail(`${args.dealDescription || "That deal"} wasn't found in your pipeline.`);
    return { ok: true, message: `${args.dealDescription || "Deal"} expected to close ${args.closeDate}.` };
  } catch (err) {
    return thrown("update the close date", err);
  }
}

// ── Mileage ──────────────────────────────────────────────────────────────────

/** Most km one trip line takes (mileage_logs.km is NUMERIC(8,1)); a typo past it is refused. */
export const MAX_TRIP_KM = 5000;

/**
 * logMileage. Any purpose (blank included), as the tool always took it.
 * The row is vehicle-logbook-writes' `mileageTripRow` (CRA's vehicle
 * logbook, migration 00184): km over 0 and at most 5,000, or worked out from
 * the odometer when only the two readings are given (refused when both are
 * given and disagree), CRA's allowance rate for the trip's year in
 * `cra_rate_per_km`, the vehicle and odometer columns only when set. A
 * vehicle id has to be the agent's own; with none given and the agent has a
 * vehicle, the default vehicle (`defaultVehicleId`, the oldest active one)
 * is stamped, so a new trip never depends on which car is the oldest later.
 * The insert keeps its id (insertOnce): a replay of a trip already saved
 * with the same km and date counts as saved. Returns the row as saved.
 */
export async function writeMileage(
  db: DbClient,
  userId: string,
  args: LogMileageArgs,
  options: InsertOptions = {},
): Promise<WriteOutcome> {
  const description = typeof args.description === "string" ? args.description.trim() : "";
  if (!isIsoDay(args.tripDate)) return fail("The trip date isn't a real date.");
  const km = typeof args.km === "number" && Number.isFinite(args.km) && args.km > 0 ? args.km : null;
  const odometers = typeof args.odometerStart === "number" && typeof args.odometerEnd === "number";
  if (km == null && !odometers) return fail("The trip needs the kilometres driven.");
  if (km != null && km > MAX_TRIP_KM) return fail(`${km} km is more than one trip line takes (${MAX_TRIP_KM} km).`);
  const row = mileageTripRow(userId, {
    tripDate: args.tripDate,
    description,
    km,
    odometerStart: args.odometerStart ?? null,
    odometerEnd: args.odometerEnd ?? null,
    vehicleId: args.vehicleId ?? null,
    fromLocation: args.fromLocation ?? null,
    toLocation: args.toLocation ?? null,
    purpose: (typeof args.purpose === "string" ? args.purpose.trim() : "") || description,
    notes: args.notes ?? null,
  }, { allowBlankDescription: true });
  if (!row.ok) return fail(row.error);
  const id = options.id ?? newRecordId();
  try {
    if (args.vehicleId) {
      const owned = await ownsVehicle(db, userId, args.vehicleId);
      if (!owned.ok) return fail(owned.error);
    } else {
      // The list has to be read: a trip saved with no vehicle when the agent
      // has one would count for the oldest vehicle, not the one driven.
      const stamped = await defaultVehicleFor(db, userId);
      if (stamped.error) return refused("read your vehicles", stamped.error);
      if (stamped.id) row.value.vehicle_id = stamped.id;
    }
    const payload = mileageRow<Record<string, unknown>>({ id, ...row.value });
    const { error, alreadySaved } = await insertOnce(db, "mileage_logs", payload, userId);
    if (error) return refused("log the trip", error);
    return { ok: true, message: `Trip logged: ${payload.km} km on ${args.tripDate}.`, id, alreadySaved, row: payload };
  } catch (err) {
    return thrown("log the trip", err);
  }
}

/**
 * writeMileage for callers that hold a TripInput and show the saved row: the
 * web Mileage tab, the phone's Mileage screen, MCP log_mileage. Same writer,
 * same rules.
 */
export async function logTrip(db: DbClient, userId: string, t: TripInput): Promise<WriteResult<MileageLog>> {
  // The forms and MCP log_mileage ask for where and why (CRA's logbook lists
  // destination and purpose); writeMileage itself accepts a blank one.
  if (!t.description?.trim()) return { ok: false, error: "A trip needs a description (where and why)." };
  const out = await writeMileage(db, userId, {
    tripDate: t.tripDate,
    km: t.km ?? 0,
    description: t.description,
    fromLocation: t.fromLocation ?? undefined,
    toLocation: t.toLocation ?? undefined,
    purpose: t.purpose ?? undefined,
    odometerStart: t.odometerStart ?? undefined,
    odometerEnd: t.odometerEnd ?? undefined,
    vehicleId: t.vehicleId ?? undefined,
    notes: t.notes ?? undefined,
  });
  if (!out.ok || !out.row) return { ok: false, error: out.message };
  // The row as sent; the database adds the timestamps (and the generated column).
  const now = new Date().toISOString();
  return { ok: true, value: { created_at: now, updated_at: now, ...out.row } as unknown as MileageLog };
}

/** updateMileage: what can change on a trip. Omitted = unchanged; null clears a text or odometer field. */
export interface UpdateMileageArgs {
  mileageId: string;
  tripDate?: string;
  km?: number;
  description?: string;
  fromLocation?: string | null;
  toLocation?: string | null;
  purpose?: string | null;
  odometerStart?: number | null;
  odometerEnd?: number | null;
  vehicleId?: string;
  notes?: string | null;
}

/**
 * updateMileage. The trip after the change is checked with the same rules
 * as a new one (mileageTripRow: a real date, km over 0 and at most 5,000,
 * km and odometer readings that agree), and `cra_rate_per_km` follows the
 * trip's year when the date moves. Km that no longer agree with the trip's
 * odometer readings are refused (change or clear the readings with them).
 */
export async function updateMileage(db: DbClient, userId: string, args: UpdateMileageArgs): Promise<WriteOutcome> {
  try {
    const { data: current, error: readErr } = await db
      .from("mileage_logs")
      .select("*")
      .eq("id", args.mileageId)
      .eq("user_id", userId)
      .maybeSingle();
    if (readErr) return refused("read the trip", readErr);
    if (!current) return fail("That trip wasn't found in your mileage log.");
    const cur = current as Record<string, unknown>;
    const numOrNull = (v: unknown) => (v == null || v === "" ? null : Number(v));
    const merged: TripInput = {
      tripDate: args.tripDate ?? String(cur.trip_date),
      description: args.description ?? String(cur.description ?? ""),
      km: args.km ?? numOrNull(cur.km),
      odometerStart: args.odometerStart !== undefined ? args.odometerStart : numOrNull(cur.odometer_start),
      odometerEnd: args.odometerEnd !== undefined ? args.odometerEnd : numOrNull(cur.odometer_end),
      vehicleId: args.vehicleId ?? (cur.vehicle_id as string | null) ?? null,
      fromLocation: args.fromLocation !== undefined ? args.fromLocation : (cur.from_location as string | null),
      toLocation: args.toLocation !== undefined ? args.toLocation : (cur.to_location as string | null),
      purpose: args.purpose !== undefined ? args.purpose : (cur.purpose as string | null),
      notes: args.notes !== undefined ? args.notes : (cur.notes as string | null),
    };
    if (args.km !== undefined && !(args.km > 0)) return fail("A trip needs its km, more than 0.");
    if (args.km !== undefined && args.km > MAX_TRIP_KM) return fail(`${args.km} km is more than one trip line takes (${MAX_TRIP_KM} km).`);
    const row = mileageTripRow(userId, merged, { allowBlankDescription: true });
    if (!row.ok) return fail(row.error);
    if (args.vehicleId) {
      const owned = await ownsVehicle(db, userId, args.vehicleId);
      if (!owned.ok) return fail(owned.error);
    }
    const next = mileageRow(row.value);
    const updates: Record<string, unknown> = {
      trip_date: next.trip_date,
      description: next.description,
      km: next.km,
      cra_rate_per_km: next.cra_rate_per_km,
      from_location: next.from_location ?? null,
      to_location: next.to_location ?? null,
      purpose: next.purpose ?? null,
      notes: next.notes ?? null,
      odometer_start: next.odometer_start ?? null,
      odometer_end: next.odometer_end ?? null,
    };
    if (next.vehicle_id) updates.vehicle_id = next.vehicle_id;
    const { error } = await db.from("mileage_logs").update(updates).eq("id", args.mileageId).eq("user_id", userId);
    if (error) return refused("update the trip", error);
    return { ok: true, message: `Trip updated: ${next.km} km on ${next.trip_date}.`, id: args.mileageId, row: { ...cur, ...updates } };
  } catch (err) {
    return thrown("update the trip", err);
  }
}

// ── Expense ──────────────────────────────────────────────────────────────────

/**
 * logExpense. GST/HST is recorded only as stated (taxAmount); with none
 * stated no input tax credit is counted on it. It is never worked out from a
 * rate (expense-totals-engine).
 */
export async function writeExpense(
  db: DbClient,
  userId: string,
  args: LogExpenseArgs,
  options: InsertOptions = {},
): Promise<WriteOutcome> {
  const vendor = typeof args.vendor === "string" ? args.vendor.trim() : "";
  if (!(typeof args.amount === "number" && Number.isFinite(args.amount) && args.amount > 0)) return fail("The expense needs an amount.");
  if (!args.categoryKey) return fail("Pick the expense category.");
  if (!isIsoDay(args.expenseDate)) return fail("The expense date isn't a real date.");
  if (args.taxAmount !== undefined && args.taxAmount > args.amount) {
    return fail(`GST/HST of $${args.taxAmount.toFixed(2)} is more than the $${args.amount.toFixed(2)} total, so nothing was logged.`);
  }
  const id = options.id ?? newRecordId();
  try {
    const { error, alreadySaved } = await insertOnce(db, "receipt_expenses", receiptExpenseRow({
      id,
      user_id: userId,
      vendor,
      expense_date: args.expenseDate,
      total_amount: args.amount,
      tax_amount: args.taxAmount,
      category_key: args.categoryKey,
      notes: args.notes,
    }), userId);
    if (error) return refused("log the expense", error);
    return { ok: true, message: `Expense logged: $${args.amount.toFixed(2)}${vendor ? ` at ${vendor}` : ""} on ${args.expenseDate}.`, id, alreadySaved };
  } catch (err) {
    return thrown("log the expense", err);
  }
}

// ── Client ───────────────────────────────────────────────────────────────────

export interface ClientOutcome extends WriteOutcome {
  /**
   * Set when a different client with that name is already on file, active
   * or archived (in the Hangar); nothing new was made.
   */
  duplicateOf?: { id: string; name: string; archived?: boolean };
}

/**
 * createClient. A client whose name matches an existing one (name_search) is
 * not made twice: the existing one is returned, an archived one included
 * (clients is unique on user_id + name_search, archived rows too, so the
 * insert would fail anyway; a queued one used to fail ten replays and take
 * the writes about it down with it). An active match is preferred. With
 * `id`, a replay that finds its own row already saved counts as saved. A
 * blank name is still refused, as a client with no name can't be matched.
 */
export async function writeClient(
  db: DbClient,
  userId: string,
  args: CaptureToolArgs["createClient"],
  options: InsertOptions = {},
): Promise<ClientOutcome> {
  const name = (typeof args.name === "string" ? args.name : "").trim().replace(/\s+/g, " ").slice(0, FIELD_LIMITS.clientName);
  if (!name) return fail("The new client needs a name.");
  const id = options.id ?? newRecordId();
  const row = clientRow({ name }) as { name: string; name_search: string };
  try {
    const { data: existing, error: readError } = await db
      .from("clients")
      .select("id, name, archived_at")
      .eq("user_id", userId)
      .eq("name_search", row.name_search)
      .limit(5);
    if (readError) return refused("check for an existing client", readError);
    if (Array.isArray(existing) && existing.length > 0) {
      const rows = existing as Array<{ id: string; name: string; archived_at: string | null }>;
      if (rows.some((r) => r.id === id)) return { ok: true, message: `New client added: ${name}.`, id, alreadySaved: true };
      const match = rows.find((r) => !r.archived_at) ?? rows[0];
      const archived = !!match.archived_at;
      return {
        ok: false,
        message: archived
          ? `A client named "${match.name}" is in the Hangar (archived), so no new client was made.`
          : `A client named "${match.name}" is already on file, so no new client was made.`,
        duplicateOf: { id: match.id, name: match.name, ...(archived ? { archived } : {}) },
      };
    }

    const parts = name.split(" ");
    const record: Record<string, unknown> = {
      id,
      user_id: userId,
      name,
      first_name: parts[0] ?? "",
      last_name: parts.length > 1 ? parts.slice(1).join(" ") : "",
      status: args.status ?? "boarding",
    };
    if (args.email) record.email = args.email.trim().slice(0, FIELD_LIMITS.email);
    if (args.phone) record.phone = args.phone.trim().slice(0, FIELD_LIMITS.phone);
    if (args.city) record.city = args.city.trim();
    if (args.buyerTargetArea) record.buyer_target_area = args.buyerTargetArea;
    if (args.propertyInterest !== undefined) record.property_interest = args.propertyInterest;
    if (args.propertyInterestType) record.property_interest_type = args.propertyInterestType;
    else if (args.side === "seller") record.property_interest_type = "listing";
    else if (args.side === "buyer") record.property_interest_type = "budget";
    if (args.timeframe) record.timeframe = args.timeframe;
    if (args.notes) record.notes = args.notes.trim().slice(0, FIELD_LIMITS.notes);
    if (args.leadSource) record.lead_source = args.leadSource;

    const { error, alreadySaved } = await insertOnce(db, "clients", clientRow(record), userId);
    if (error) return refused("add the client", error);
    return { ok: true, message: `New client added: ${name}.`, id, alreadySaved };
  } catch (err) {
    return thrown("add the client", err);
  }
}

// ── Closed transaction ───────────────────────────────────────────────────────

/** recordTransaction: a closed deal, by sale price and commission % or the exact GCI. */
export async function writeTransaction(
  db: DbClient,
  userId: string,
  args: RecordTransactionArgs,
  options: InsertOptions = {},
): Promise<WriteOutcome> {
  if (!args.salePrice && !args.gciOverride) {
    return fail("Give either the sale price and commission rate, or the exact GCI.");
  }
  if (!isIsoDay(args.closeDate)) return fail("The close date isn't a real date.");
  const paidCheck = validateCommissionPaidDate(args.closeDate, args.commissionPaidDate);
  if (!paidCheck.valid) return fail(`Not recorded: ${paidCheck.errors.join("; ")}.`);
  const id = options.id ?? newRecordId();
  try {
    const { error, alreadySaved } = await insertOnce(db, "transactions", transactionRow({
      id,
      user_id: userId,
      date: args.closeDate,
      commission_paid_date: args.commissionPaidDate || null,
      address: args.address,
      client_name: args.clientName,
      side: args.side,
      sale_price: args.salePrice ?? 0,
      commission_pct: args.commissionPct ? args.commissionPct / 100 : 0.025,
      gci_override: args.gciOverride ?? null,
      status: "closed",
      notes: args.notes ?? "",
    }, { insert: true }), userId);
    if (error) return refused("record the transaction", error);
    return { ok: true, message: `Transaction recorded: ${args.address} (${args.clientName}) closed ${args.closeDate}.`, id, alreadySaved };
  } catch (err) {
    return thrown("record the transaction", err);
  }
}

// ── Suggestions: skip, Later, Stop, and the Hangar ───────────────────────────
//
// flight_control_dismissals holds a skipped occurrence or a client's Later /
// Stop (00168, 00188; rules in suggestion-dismissals.ts). Row-level security
// refuses a client that isn't the user's (the INSERT and UPDATE policies check
// it), so these writers don't read the client first.

const DISMISSALS = "flight_control_dismissals";
/** The table's unique key: one row per client, reason and day. A hold uses it too. */
const OCCURRENCE_CONFLICT = "user_id,client_id,opportunity_type,trigger_date";

const MONTH_WORDS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** An instant's Atlantic day in words ("January 19, 2027"), or null when the runtime can't tell. */
function atlanticDayInWords(ms: number): string | null {
  try {
    const [y, m, d] = atlanticISODate(new Date(ms)).split("-").map(Number);
    return y && m && d ? `${MONTH_WORDS[m - 1]} ${d}, ${y}` : null;
  } catch {
    return null;
  }
}

/** The occurrence a skip is on, cut to its day, or why it can't be. */
function skipKey(o: OpportunityKeyParts): { key: OpportunityKeyParts } | { refusal: WriteOutcome } {
  if (!o?.client_id) return { refusal: fail("Pick the client first.") };
  if (!o.opportunity_type) return { refusal: fail("The suggestion needs its reason.") };
  // 'any' is a hold's reason: a skip under it would take the client's hold row's place.
  if (o.opportunity_type === HOLD_OPPORTUNITY_TYPE) return { refusal: fail("That is a hold, not a suggestion. Resume the client's suggestions instead.") };
  const day = typeof o.trigger_date === "string" ? o.trigger_date.slice(0, 10) : "";
  if (!isIsoDay(day)) return { refusal: fail("The suggestion's date isn't a real date.") };
  return { key: { client_id: o.client_id, opportunity_type: o.opportunity_type, trigger_date: day } };
}

/**
 * Skip one occurrence of a suggestion: (client, reason, trigger date). Next
 * month's idle check-in is a new occurrence and can come back. Skipping the
 * same occurrence twice is saved once: a clash on the occurrence key, under
 * this write's id or another device's, counts as saved (`alreadySaved`), and
 * the id returned is the row that is there, so an undo removes the right one.
 */
export async function writeSuggestionSkip(
  db: DbClient,
  userId: string,
  o: OpportunityKeyParts,
  options: InsertOptions = {},
): Promise<WriteOutcome> {
  const checked = skipKey(o);
  if ("refusal" in checked) return checked.refusal;
  const { key } = checked;
  const id = options.id ?? newRecordId();
  try {
    // A skip has no end: the table refuses a skip that carries `until`.
    const { error } = await db.from(DISMISSALS).insert({ id, user_id: userId, ...key, kind: "skip" });
    if (!error) return { ok: true, message: "Suggestion skipped.", id };
    if (error.code === "23505") {
      // insertOnce re-reads by id, which misses a clash on the occurrence key
      // under another id. Read by the key itself: a row there is saved.
      const { data: existing, error: readError } = await db
        .from(DISMISSALS)
        .select("id")
        .eq("user_id", userId)
        .eq("client_id", key.client_id)
        .eq("opportunity_type", key.opportunity_type)
        .eq("trigger_date", key.trigger_date)
        .maybeSingle();
      if (readError) return refused("skip the suggestion", readError);
      if (existing) return { ok: true, message: "Suggestion skipped.", id: String((existing as { id: unknown }).id), alreadySaved: true };
    }
    return refused("skip the suggestion", error);
  } catch (err) {
    return thrown("skip the suggestion", err);
  }
}

export interface SuggestionHoldArgs {
  clientId: string;
  clientName: string;
  kind: "later" | "stop";
  /** When the hold ends. Has to be after `now`. */
  until: Date;
}

/**
 * Put a client's suggestions on hold: Later (a few hours, tonight, tomorrow)
 * or Stop (3 or 6 months). One row per client per day: it is upserted on the
 * occurrence key with reason 'any' and `today` (the Atlantic day) as its
 * date, so a second hold the same day replaces the first. The upsert sends
 * no row id, since ON CONFLICT DO UPDATE would otherwise rewrite the first
 * row's id.
 *
 * A Stop replaces a Later. A Later never replaces a Stop that is still
 * running, on the same day or an earlier one: the Stop already hides the
 * client for longer, so Andrew's "stop" survives a stale Later on another
 * surface. That is reported as saved, with nothing changed.
 *
 * `until` has to be ahead of `now` (a sheet opened at 18:58 and tapped at
 * 19:01 must not write a hold that has already ended).
 */
export async function writeSuggestionHold(
  db: DbClient,
  userId: string,
  args: SuggestionHoldArgs,
  today: string,
  now: Date = new Date(),
): Promise<WriteOutcome> {
  if (!args.clientId) return fail("Pick the client first.");
  if (args.kind !== "later" && args.kind !== "stop") return fail("A hold is a Later or a Stop.");
  if (!isIsoDay(today)) return fail("The day isn't a real date.");
  const untilMs = args.until instanceof Date ? args.until.getTime() : NaN;
  if (!Number.isFinite(untilMs)) return fail("The time isn't a real time.");
  if (untilMs <= now.getTime()) return fail("That time has already passed.");
  const name = args.clientName || "That client";
  try {
    if (args.kind === "later") {
      // The kind is filtered here, so a row whose kind isn't ours is not a Stop.
      const { data: stops, error: readError } = await db
        .from(DISMISSALS)
        .select("until")
        .eq("user_id", userId)
        .eq("client_id", args.clientId)
        .eq("kind", "stop");
      if (readError) return refused("check the client's holds", readError);
      // The latest end among the Stops still running (an unreadable `until` is not running).
      let running = NaN;
      for (const r of Array.isArray(stops) ? (stops as Array<{ until?: unknown }>) : []) {
        const at = typeof r.until === "string" ? Date.parse(r.until) : NaN;
        if (at > now.getTime() && (Number.isNaN(running) || at > running)) running = at;
      }
      if (!Number.isNaN(running)) {
        const when = atlanticDayInWords(running);
        return { ok: true, message: `Suggestions for ${name} are already stopped${when ? ` until ${when}` : ""}.` };
      }
    }
    const { error } = await db.from(DISMISSALS).upsert(
      {
        user_id: userId,
        client_id: args.clientId,
        opportunity_type: HOLD_OPPORTUNITY_TYPE,
        trigger_date: today,
        kind: args.kind,
        until: args.until.toISOString(),
        dismissed_at: now.toISOString(),
      },
      { onConflict: OCCURRENCE_CONFLICT },
    );
    if (error) return refused(args.kind === "stop" ? "stop the suggestions" : "hold the suggestion", error);
    if (args.kind === "later") return { ok: true, message: `${name} will come back later.` };
    const when = atlanticDayInWords(untilMs);
    return { ok: true, message: `Suggestions for ${name} are stopped${when ? ` until ${when}` : ""}.` };
  } catch (err) {
    return thrown(args.kind === "stop" ? "stop the suggestions" : "hold the suggestion", err);
  }
}

/** Undo a skip, by the id writeSuggestionSkip returned. Already gone is fine. */
export async function removeSuggestionDismissal(db: DbClient, userId: string, id: string): Promise<WriteOutcome> {
  if (!id) return fail("Pick the skip to undo first.");
  try {
    const { error } = await db.from(DISMISSALS).delete().eq("id", id).eq("user_id", userId);
    if (error) return refused("undo the skip", error);
    return { ok: true, message: "Skip undone.", id };
  } catch (err) {
    return thrown("undo the skip", err);
  }
}

/** Undo a skip when only the occurrence is known (the web card). Never takes out a hold. */
export async function removeSuggestionSkipByKey(db: DbClient, userId: string, o: OpportunityKeyParts): Promise<WriteOutcome> {
  const checked = skipKey(o);
  if ("refusal" in checked) return checked.refusal;
  const { key } = checked;
  try {
    const { error } = await db
      .from(DISMISSALS)
      .delete()
      .eq("user_id", userId)
      .eq("client_id", key.client_id)
      .eq("opportunity_type", key.opportunity_type)
      .eq("trigger_date", key.trigger_date);
    if (error) return refused("undo the skip", error);
    return { ok: true, message: "Skip undone." };
  } catch (err) {
    return thrown("undo the skip", err);
  }
}

/** Undo a Later or Stop: the client's holds are removed and they can be suggested again. */
export async function resumeSuggestions(db: DbClient, userId: string, clientId: string): Promise<WriteOutcome> {
  if (!clientId) return fail("Pick the client first.");
  try {
    const { error } = await db
      .from(DISMISSALS)
      .delete()
      .eq("user_id", userId)
      .eq("client_id", clientId)
      .in("kind", ["later", "stop"]);
    if (error) return refused("resume the suggestions", error);
    return { ok: true, message: "Suggestions are back on for this client." };
  } catch (err) {
    return thrown("resume the suggestions", err);
  }
}

/**
 * "Move to the Hangar" from a suggestion: archives the client (archived_at,
 * with the reason 'other'). Refuses a client who is already there, so the
 * reason they were archived for isn't overwritten.
 */
export async function writeClientToHangar(
  db: DbClient,
  userId: string,
  args: { clientId: string; clientName: string },
): Promise<WriteOutcome> {
  if (!args.clientId) return fail("Pick the client first.");
  const name = args.clientName || "That client";
  try {
    const { data: found, error: readError } = await db
      .from("clients")
      .select("id, archived_at")
      .eq("id", args.clientId)
      .eq("user_id", userId)
      .maybeSingle();
    if (readError) return refused("find the client", readError);
    if (!found) return fail(`${name} wasn't found in your clients.`);
    if ((found as { archived_at?: unknown }).archived_at) return fail(`${name} is already in the Hangar.`);
    const { data, error } = await db
      .from("clients")
      .update({ archived_at: new Date().toISOString(), archive_reason: "other" })
      .eq("id", args.clientId)
      .eq("user_id", userId)
      .is("archived_at", null)
      .select("id");
    if (error) return refused("move the client to the Hangar", error);
    if (Array.isArray(data) && data.length === 0) return fail(`${name} changed just now. Try again.`);
    return { ok: true, message: `${name} moved to the Hangar.`, id: args.clientId };
  } catch (err) {
    return thrown("move the client to the Hangar", err);
  }
}

/** Undo for writeClientToHangar: clears archived_at and archive_reason. */
export async function restoreClientFromHangar(
  db: DbClient,
  userId: string,
  args: { clientId: string; clientName: string },
): Promise<WriteOutcome> {
  if (!args.clientId) return fail("Pick the client first.");
  const name = args.clientName || "That client";
  try {
    const { data, error } = await db
      .from("clients")
      .update({ archived_at: null, archive_reason: null })
      .eq("id", args.clientId)
      .eq("user_id", userId)
      .select("id");
    if (error) return refused("bring the client back from the Hangar", error);
    if (Array.isArray(data) && data.length === 0) return fail(`${name} wasn't found in your clients.`);
    return { ok: true, message: `${name} is back from the Hangar.`, id: args.clientId };
  } catch (err) {
    return thrown("bring the client back from the Hangar", err);
  }
}

// ── Dispatch ─────────────────────────────────────────────────────────────────

/** One write as the confirm card, MCP and the phone's queue pass it: the tool, its args, and the row id. */
export type CaptureWriteCall = { [T in CaptureTool]: { tool: T; args: CaptureToolArgs[T]; id?: string } }[CaptureTool];

/** One write by its Flight Crew tool name. `today` is the caller's calendar day. */
export function applyCaptureWrite(
  db: DbClient,
  userId: string,
  call: CaptureWriteCall,
  today: string,
): Promise<WriteOutcome> {
  const options = { id: call.id };
  switch (call.tool) {
    case "logContactActivity": return writeContactActivity(db, userId, call.args, today, options);
    case "createContactTask": return writeContactTask(db, userId, call.args, options);
    case "updatePipelineDealStage": return writeDealStage(db, userId, call.args);
    case "updatePipelineDealCloseDate": return writeDealCloseDate(db, userId, call.args);
    case "logMileage": return writeMileage(db, userId, call.args, options);
    case "logExpense": return writeExpense(db, userId, call.args, options);
    case "createClient": return writeClient(db, userId, call.args, options);
    case "recordTransaction": return writeTransaction(db, userId, call.args, options);
  }
}
