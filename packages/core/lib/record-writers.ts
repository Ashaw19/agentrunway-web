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
 * A writer never throws: it returns `ok: false` with the reason, and
 * `offline: true` when the request never reached the database (no PostgREST
 * code), which the phone queues for later.
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
  /** The new row's id, when one was made. */
  id?: string;
  /** The request never reached the database: the phone queues it. */
  offline?: boolean;
  /** The PostgREST error code, when the database refused it. */
  code?: string;
  /** The saved row, for a caller that shows it (writeMileage: the web Mileage tab, the phone). */
  row?: Record<string, unknown>;
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
 * A new row id made on the device. Lets a capture that adds a client save
 * the client's activity and task in the same go, including when the phone
 * queues them offline. crypto.randomUUID where the runtime has it (web,
 * server, Deno); a v4 UUID from Math.random on the phone (Hermes has no
 * crypto), which is enough for a primary key nobody else writes.
 */
export function newRecordId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  const hex = (n: number) => Math.floor(Math.random() * 16 ** n).toString(16).padStart(n, "0");
  const variant = (8 + Math.floor(Math.random() * 4)).toString(16);
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${variant}${hex(3)}-${hex(12)}`;
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
): Promise<ActivityOutcome> {
  const description = (args.description ?? "").trim().slice(0, FIELD_LIMITS.description);
  if (!args.clientId) return fail("Pick the client first.");
  if (args.activityDate !== undefined && !isIsoDay(args.activityDate)) return fail("The activity date isn't a real date.");
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

    const { error } = await db.from("contact_activities").insert(activityRow({
      user_id: userId,
      client_id: args.clientId,
      type: args.type as ActivityType,
      description,
      activity_date: args.activityDate ? activityTimestampFor(args.activityDate) : new Date().toISOString(),
    }));
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
    return { ok: true, message: `${what} on ${args.clientName || "the client"} for ${day}.`, day, priorStatus, newStatus };
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
): Promise<WriteOutcome> {
  const title = (args.title ?? "").trim();
  if (!title) return fail("The Checklist item needs a title.");
  if (!isIsoDay(args.dueDate)) return fail("The due date isn't a real date.");
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
    const { data, error } = await db
      .from("contact_tasks")
      .insert(contactTaskRow({
        user_id: userId,
        client_id: args.clientId || null,
        title,
        due_date: args.dueDate,
        priority: (args.priority ?? "normal") as TaskPriority,
        notes: args.notes,
      }))
      .select("id")
      .single();
    if (error) return refused("add the Checklist item", error);
    return { ok: true, message: `Added to your Checklist: "${title.slice(0, 80)}", due ${args.dueDate}.`, id: data?.id };
  } catch (err) {
    return thrown("add the Checklist item", err);
  }
}

// ── Pipeline deal ────────────────────────────────────────────────────────────

/**
 * updatePipelineDealStage. Flight Crew may set `closed` (the Closing Day
 * prompt then records the sale); a capture never proposes it.
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

/** updatePipelineDealCloseDate: the expected close date. */
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
 * logMileage. The row is vehicle-logbook-writes' `mileageTripRow`: km from
 * the odometer when only the two readings are given (and refused when both
 * are given and disagree), CRA's allowance rate for the trip's year in
 * `cra_rate_per_km`, the vehicle and odometer columns only when set. A
 * vehicle id has to be the agent's own. With none given and the agent has a
 * vehicle, the trip is stamped with the default vehicle (`defaultVehicleId`,
 * the oldest active one), so a new trip never depends on which car is the
 * oldest later. Returns the saved row.
 */
export async function writeMileage(db: DbClient, userId: string, args: LogMileageArgs): Promise<WriteOutcome> {
  const description = (args.description ?? "").trim();
  if (!isIsoDay(args.tripDate)) return fail("The trip date isn't a real date.");
  const km = typeof args.km === "number" && args.km > 0 ? args.km : null;
  const odometers = typeof args.odometerStart === "number" && typeof args.odometerEnd === "number";
  if (km == null && !odometers) return fail("The trip needs the kilometres driven.");
  if (km != null && km > MAX_TRIP_KM) return fail(`${km} km is more than one trip line takes (${MAX_TRIP_KM} km).`);
  if (!description) return fail("The trip needs a purpose.");
  const row = mileageTripRow(userId, {
    tripDate: args.tripDate,
    description,
    km,
    odometerStart: args.odometerStart ?? null,
    odometerEnd: args.odometerEnd ?? null,
    vehicleId: args.vehicleId ?? null,
    fromLocation: args.fromLocation ?? null,
    toLocation: args.toLocation ?? null,
    purpose: args.purpose?.trim() || description,
    notes: args.notes ?? null,
  });
  if (!row.ok) return fail(row.error);
  try {
    if (args.vehicleId) {
      const owned = await ownsVehicle(db, userId, args.vehicleId);
      if (!owned.ok) return fail(owned.error);
    } else {
      const stamped = await defaultVehicleFor(db, userId);
      if (stamped) row.value.vehicle_id = stamped;
    }
    const { data, error } = await db
      .from("mileage_logs")
      .insert(mileageRow(row.value))
      .select("*")
      .single();
    if (error) return refused("log the trip", error);
    const savedKm = data?.km ?? row.value.km;
    return { ok: true, message: `Trip logged: ${savedKm} km on ${args.tripDate}.`, id: data?.id, row: data ?? undefined };
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
  return { ok: true, value: out.row as unknown as MileageLog };
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
    const row = mileageTripRow(userId, merged);
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
export async function writeExpense(db: DbClient, userId: string, args: LogExpenseArgs): Promise<WriteOutcome> {
  const vendor = (args.vendor ?? "").trim();
  if (!vendor) return fail("The expense needs a vendor.");
  if (!(typeof args.amount === "number" && args.amount > 0)) return fail("The expense needs an amount.");
  if (!args.categoryKey) return fail("Pick the expense category.");
  if (!isIsoDay(args.expenseDate)) return fail("The expense date isn't a real date.");
  if (args.taxAmount !== undefined && args.taxAmount > args.amount) {
    return fail(`GST/HST of $${args.taxAmount.toFixed(2)} is more than the $${args.amount.toFixed(2)} total, so nothing was logged.`);
  }
  try {
    const { error } = await db.from("receipt_expenses").insert(receiptExpenseRow({
      user_id: userId,
      vendor,
      expense_date: args.expenseDate,
      total_amount: args.amount,
      tax_amount: args.taxAmount,
      category_key: args.categoryKey,
      notes: args.notes,
    }));
    if (error) return refused("log the expense", error);
    return { ok: true, message: `Expense logged: $${args.amount.toFixed(2)} at ${vendor} on ${args.expenseDate}.` };
  } catch (err) {
    return thrown("log the expense", err);
  }
}

// ── Client ───────────────────────────────────────────────────────────────────

export interface ClientOutcome extends WriteOutcome {
  /** Set when a client with that name is already on file; nothing new was made. */
  duplicateOf?: { id: string; name: string };
}

/**
 * createClient. A client whose name matches an existing one (name_search) is
 * not made twice: the existing one is returned. `id` may be given so writes
 * that depend on the new client can name it before it is saved.
 */
export async function writeClient(
  db: DbClient,
  userId: string,
  args: CaptureToolArgs["createClient"],
  options: { id?: string } = {},
): Promise<ClientOutcome> {
  const name = (args.name ?? "").trim().replace(/\s+/g, " ").slice(0, FIELD_LIMITS.clientName);
  if (!name) return fail("The new client needs a name.");
  const row = clientRow({ name }) as { name: string; name_search: string };
  try {
    const { data: existing, error: readError } = await db
      .from("clients")
      .select("id, name")
      .eq("user_id", userId)
      .eq("name_search", row.name_search)
      .is("archived_at", null)
      .limit(1);
    if (readError) return refused("check for an existing client", readError);
    if (Array.isArray(existing) && existing.length > 0) {
      const dup = existing[0] as { id: string; name: string };
      return { ok: false, message: `A client named "${dup.name}" is already on file, so no new client was made.`, duplicateOf: dup };
    }

    const parts = name.split(" ");
    const record: Record<string, unknown> = {
      user_id: userId,
      name,
      first_name: parts[0] ?? "",
      last_name: parts.length > 1 ? parts.slice(1).join(" ") : "",
      status: args.status ?? "boarding",
    };
    if (options.id) record.id = options.id;
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

    const { data, error } = await db.from("clients").insert(clientRow(record)).select("id").single();
    if (error) return refused("add the client", error);
    return { ok: true, message: `New client added: ${name}.`, id: (data?.id as string | undefined) ?? options.id };
  } catch (err) {
    return thrown("add the client", err);
  }
}

// ── Closed transaction ───────────────────────────────────────────────────────

/** recordTransaction: a closed deal, by sale price and commission % or the exact GCI. */
export async function writeTransaction(db: DbClient, userId: string, args: RecordTransactionArgs): Promise<WriteOutcome> {
  if (!args.salePrice && !args.gciOverride) {
    return fail("Give either the sale price and commission rate, or the exact GCI.");
  }
  if (!isIsoDay(args.closeDate)) return fail("The close date isn't a real date.");
  const paidCheck = validateCommissionPaidDate(args.closeDate, args.commissionPaidDate);
  if (!paidCheck.valid) return fail(`Not recorded: ${paidCheck.errors.join("; ")}.`);
  try {
    const { error } = await db.from("transactions").insert(transactionRow({
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
    }, { insert: true }));
    if (error) return refused("record the transaction", error);
    return { ok: true, message: `Transaction recorded: ${args.address} (${args.clientName}) closed ${args.closeDate}.` };
  } catch (err) {
    return thrown("record the transaction", err);
  }
}

// ── Dispatch ─────────────────────────────────────────────────────────────────

export type CaptureWriteCall = { [T in CaptureTool]: { tool: T; args: CaptureToolArgs[T]; id?: string } }[CaptureTool];

/** One write by its Flight Crew tool name. `today` is the caller's calendar day. */
export function applyCaptureWrite(
  db: DbClient,
  userId: string,
  call: CaptureWriteCall,
  today: string,
): Promise<WriteOutcome> {
  switch (call.tool) {
    case "logContactActivity": return writeContactActivity(db, userId, call.args, today);
    case "createContactTask": return writeContactTask(db, userId, call.args);
    case "updatePipelineDealStage": return writeDealStage(db, userId, call.args);
    case "updatePipelineDealCloseDate": return writeDealCloseDate(db, userId, call.args);
    case "logMileage": return writeMileage(db, userId, call.args);
    case "logExpense": return writeExpense(db, userId, call.args);
    case "createClient": return writeClient(db, userId, call.args, { id: call.id });
    case "recordTransaction": return writeTransaction(db, userId, call.args);
  }
}
