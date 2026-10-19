/**
 * Undo an AI change: put back what one Flight Crew tool call wrote.
 *
 * Runs with the signed-in agent's own client, so every read and write goes
 * through the target table's RLS, exactly as if the agent made the change by
 * hand. Shared by the web route (/api/ai-activity/undo, which the web page
 * and the phone call) and Flight Crew's undoAIChange tool.
 *
 * Two phases:
 *   1. Plan (here, reads only). Every check runs before anything is written:
 *      the action can be undone at all (actionUndoBlocker: window, reviewed
 *      tables, rows marked irreversible, AI-written text, blocked columns);
 *      if the caller names the action it showed the agent (`expected`
 *      fingerprint) it is still exactly that action; every record still
 *      looks the way the AI left it; and nothing new points at a record the
 *      AI created (fn_ai_row_references), so undoing "created a client"
 *      never takes calls or notes logged since with it.
 *   2. Apply, in ONE transaction: fn_ai_undo_apply re-checks each record
 *      under a row lock, then deletes what the AI created (a client through
 *      fn_delete_clients), puts back the columns it changed, re-inserts what
 *      it deleted, and marks the ledger rows undone. Anything off and the
 *      whole undo rolls back: there is no partial undo.
 *
 * Money rows restore the row. Every total (YTD GCI, YTD Expenses, tax) is
 * computed from rows by the engines, so nothing else needs undoing. A logged
 * call's trigger effects on its client (last contact, first contact,
 * Cruising → Boarding) were recorded with it and come back with it, unless
 * another call has been logged for that client since (then nothing is
 * undone).
 *
 * No imports outside packages/core (the connector's copy has no package
 * imports).
 */

import type { AiRunWrite } from "../types/database";
import {
  actionFingerprint,
  actionUndoBlocker,
  changedColumns,
  describeAction,
  groupWritesIntoActions,
  insertableImage,
  isRedactedText,
  netRowChanges,
  primaryKeyOf,
  rowMatchesImage,
  tableLabel,
  TRIGGER_SIDE_EFFECTS,
  type AIAction,
  type RowChange,
} from "./ai-activity";

/**
 * The slice of a supabase-js client undo uses. Typed loosely on purpose:
 * this file can't import @supabase/supabase-js (the connector copy has no
 * package imports), and the query builder's types don't survive a
 * structural copy.
 */
export interface UndoClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from(table: string): any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpc(fn: string, args?: Record<string, unknown>): any;
}

export type UndoStatus = "undone" | "already" | "refused" | "not_found" | "failed";

export interface UndoResult {
  ok: boolean;
  status: UndoStatus;
  /** Plain words for the agent. */
  message: string;
  /** Records put back. */
  restored: number;
}

interface PgError {
  message?: string;
  code?: string;
}

type RowState = "restorable" | "already" | "changed";

interface PlannedChange {
  change: RowChange;
  state: RowState;
}

/** One step for fn_ai_undo_apply (see migration 00182). */
export interface UndoStep {
  op: "delete" | "update" | "insert";
  table: string;
  pk?: string;
  row_id?: string;
  /** The row as the AI left it, AI-written text left out: must still match. */
  expect?: Record<string, unknown>;
  /** update: the columns to put back. */
  set?: Record<string, unknown>;
  /** insert: the row to bring back. */
  row?: Record<string, unknown>;
  /** update: refuse if a row of `table` pointing here was created after `after` (see fn_ai_undo_apply). */
  no_later?: LaterGuard;
}

/**
 * For a parent row whose change came from a trigger (a client after a logged
 * call): no other row that fires the trigger may have been created since.
 */
export interface LaterGuard {
  table: string;
  column: string;
  value: string;
  after: string;
  exclude_ids: string[];
  skip_column?: string;
  skip_value?: string;
}

/**
 * The guards for the parent rows this action's created child rows changed
 * through their trigger, keyed `table:rowId`. "after" is the earliest
 * AI-created child's own created_at (the action's time if the image lacks
 * one).
 */
export function laterGuards(action: AIAction, changes: readonly RowChange[]): Map<string, LaterGuard> {
  const guards = new Map<string, LaterGuard>();
  const changedParents = new Set(changes.filter((c) => c.kind === "changed").map((c) => `${c.table}:${c.rowId}`));
  for (const child of changes) {
    if (child.kind !== "created") continue;
    for (const effect of TRIGGER_SIDE_EFFECTS[child.table] ?? []) {
      const parentId = child.after?.[effect.foreignKey];
      if (typeof parentId !== "string" || !changedParents.has(`${effect.parentTable}:${parentId}`)) continue;
      const created = typeof child.after?.created_at === "string" ? (child.after.created_at as string) : action.createdAt;
      const key = `${effect.parentTable}:${parentId}`;
      const g = guards.get(key);
      if (g) {
        if (Date.parse(created) < Date.parse(g.after)) g.after = created;
        g.exclude_ids.push(child.rowId);
      } else {
        guards.set(key, {
          table: child.table,
          column: effect.foreignKey,
          value: parentId,
          after: created,
          exclude_ids: [child.rowId],
          ...(effect.ignore ? { skip_column: effect.ignore.column, skip_value: effect.ignore.value } : {}),
        });
      }
    }
  }
  return guards;
}

/** Rows the guard would find: created since, other than the AI's own and the ignored kind. */
async function laterRows(client: UndoClient, g: LaterGuard): Promise<number | null> {
  let q = client.from(g.table).select("id").eq(g.column, g.value).gt("created_at", g.after);
  if (g.skip_column && g.skip_value !== undefined) q = q.neq(g.skip_column, g.skip_value);
  const { data, error } = await q.limit(50);
  if (error) return null;
  const exclude = new Set(g.exclude_ids);
  return ((data ?? []) as Array<{ id: unknown }>).filter((r) => !exclude.has(String(r.id))).length;
}

function refusal(message: string): UndoResult {
  return { ok: false, status: "refused", message, restored: 0 };
}

async function currentRow(
  client: UndoClient,
  table: string,
  rowId: string,
): Promise<{ row: Record<string, unknown> | null; error: PgError | null }> {
  const { data, error } = await client.from(table).select("*").eq(primaryKeyOf(table), rowId).maybeSingle();
  return { row: (data as Record<string, unknown> | null) ?? null, error: (error as PgError | null) ?? null };
}

function stateOf(change: RowChange, current: Record<string, unknown> | null): RowState {
  if (change.kind === "created") {
    if (!current) return "already";
    return rowMatchesImage(change.table, current, change.after) ? "restorable" : "changed";
  }
  if (change.kind === "deleted") {
    if (!current) return "restorable";
    return rowMatchesImage(change.table, current, change.before) ? "already" : "changed";
  }
  if (!current) return "changed"; // deleted since
  if (rowMatchesImage(change.table, current, change.after)) return "restorable";
  if (rowMatchesImage(change.table, current, change.before)) return "already";
  return "changed";
}

/** A short reference to the record for messages: `client "Pat Example"`. */
function recordRef(change: RowChange): string {
  const image = change.after ?? change.before ?? {};
  for (const f of ["name", "client_name", "address", "title", "vendor", "description"]) {
    const v = image[f];
    if (typeof v === "string" && v.trim()) return `${tableLabel(change.table)} "${v.trim().slice(0, 60)}"`;
  }
  return `the ${tableLabel(change.table)}`;
}

/** Child rows that would go (or lose their link) if this created record were deleted. */
async function referenceBlocker(
  client: UndoClient,
  change: RowChange,
  excludeIds: string[],
): Promise<string | null> {
  if (primaryKeyOf(change.table) !== "id") return null;
  const { data, error } = await client.rpc("fn_ai_row_references", {
    p_table: change.table,
    p_row_id: change.rowId,
    p_exclude_ids: excludeIds,
  });
  if (error) return `Agent Runway couldn't check what else uses ${recordRef(change)}, so nothing was undone.`;
  const refs = ((data ?? []) as Array<{ child_table: string; refs: number | string }>).filter(
    (r) => Number(r.refs) !== 0,
  );
  if (refs.length === 0) return null;
  const what = refs
    .map((r) => (Number(r.refs) < 0 ? tableLabel(r.child_table, true) : `${Number(r.refs)} ${tableLabel(r.child_table, Number(r.refs) !== 1)}`))
    .join(", ");
  return `Nothing was undone: ${recordRef(change)} now has ${what} linked to it, added after Flight Crew created it. Delete or move those first, or leave it.`;
}

/** The image without AI-written text: what fn_ai_undo_apply compares. */
function comparable(image: Record<string, unknown> | null): Record<string, unknown> {
  return Object.fromEntries(Object.entries(image ?? {}).filter(([, v]) => !isRedactedText(v)));
}

/** The step that turns this record back. Null when there's nothing to write. */
export function undoStep(change: RowChange): UndoStep | null {
  const pk = primaryKeyOf(change.table);
  if (change.kind === "created") {
    return { op: "delete", table: change.table, pk, row_id: change.rowId, expect: comparable(change.after) };
  }
  if (change.kind === "deleted") {
    return { op: "insert", table: change.table, row: insertableImage(change.table, change.before ?? {}) };
  }
  const before = change.before ?? {};
  const cols = changedColumns(change.table, before, change.after ?? {});
  if (cols.length === 0) return null;
  return {
    op: "update",
    table: change.table,
    pk,
    row_id: change.rowId,
    expect: comparable(change.after),
    set: Object.fromEntries(cols.map((c) => [c, before[c] ?? null])),
  };
}

/** fn_ai_undo_apply's error, in plain words. */
function applyFailure(error: PgError): UndoResult {
  const msg = error.message ?? "";
  const table = /ai_undo_\w+: (\w+)/.exec(msg)?.[1];
  const what = table ? `the ${tableLabel(table)}` : "a record";
  if (msg.startsWith("ai_undo_changed") || msg.startsWith("ai_undo_gone") || msg.startsWith("ai_undo_count")) {
    return refusal(`Nothing was undone: ${what} changed while undoing, so it was left as is.`);
  }
  if (msg.startsWith("ai_undo_later")) {
    return refusal(`Nothing was undone: something new was logged for ${what} after Flight Crew's change, so putting it back would undo that too.`);
  }
  if (msg.startsWith("ai_undo_archived")) {
    return refusal("Nothing was undone: the client has a deal or consent on record now, so Agent Runway won't delete it.");
  }
  return { ok: false, status: "failed", message: "Couldn't undo that change, and nothing was changed. Try again.", restored: 0 };
}

/** Load one tool call's ledger rows (RLS: the caller's own). */
export async function loadAIAction(
  client: UndoClient,
  userId: string,
  toolCallId: string,
): Promise<{ action: AIAction | null; error: PgError | null }> {
  const { data, error } = await client
    .from("ai_run_writes")
    .select("*")
    .eq("user_id", userId)
    .eq("tool_call_id", toolCallId)
    .order("seq", { ascending: true });
  if (error) return { action: null, error: error as PgError };
  const actions = groupWritesIntoActions((data ?? []) as AiRunWrite[]);
  return { action: actions[0] ?? null, error: null };
}

export interface UndoOptions {
  now?: Date;
  /**
   * The fingerprint (actionFingerprint) of the action the agent was shown.
   * When set, the undo refuses unless the action is still exactly that one.
   */
  expected?: string;
}

export async function undoAIAction(
  client: UndoClient,
  userId: string,
  toolCallId: string,
  opts: UndoOptions = {},
): Promise<UndoResult> {
  const now = opts.now ?? new Date();
  const { action, error } = await loadAIAction(client, userId, toolCallId);
  if (error) return { ok: false, status: "failed", message: "Couldn't load that AI change. Try again.", restored: 0 };
  if (!action) return { ok: false, status: "not_found", message: "That AI change wasn't found.", restored: 0 };

  if (opts.expected !== undefined && actionFingerprint(action) !== opts.expected) {
    return refusal("Nothing was undone: that change isn't the one that was shown for approval any more. Look at AI activity and try again.");
  }

  const blocker = actionUndoBlocker(action, now);
  if (blocker) {
    return action.undone
      ? { ok: true, status: "already", message: blocker, restored: 0 }
      : refusal(blocker);
  }

  const changes = netRowChanges(action.writes);
  const planned: PlannedChange[] = [];
  for (const change of changes) {
    const { row, error: readError } = await currentRow(client, change.table, change.rowId);
    if (readError) return { ok: false, status: "failed", message: `Couldn't read ${recordRef(change)}. Try again.`, restored: 0 };
    const state = stateOf(change, row);
    if (state === "changed") {
      return refusal(
        `Nothing was undone: ${recordRef(change)} was changed after Flight Crew's change, so putting it back would lose that edit.`,
      );
    }
    planned.push({ change, state });
  }

  // A parent row put back after a trigger (a client after a logged call)
  // needs nothing newer that fired the same trigger: a later call dated
  // earlier leaves the client row looking untouched, so the image check
  // alone can't see it. fn_ai_undo_apply checks it again under the lock.
  const guards = laterGuards(action, changes);
  for (const [key, g] of guards) {
    const parent = planned.find((p) => `${p.change.table}:${p.change.rowId}` === key);
    if (!parent || parent.state !== "restorable") continue;
    const later = await laterRows(client, g);
    if (later === null) {
      return { ok: false, status: "failed", message: `Couldn't check what was logged for ${recordRef(parent.change)} since. Try again.`, restored: 0 };
    }
    if (later > 0) {
      return refusal(
        `Nothing was undone: ${later === 1 ? "another" : later} ${tableLabel(g.table, later !== 1)} ${later === 1 ? "was" : "were"} logged for ${recordRef(parent.change)} after Flight Crew's change, so putting back their last contact and status would be wrong. Delete that one first, or leave this.`,
      );
    }
  }

  // A created record must have nothing new pointing at it. Records the same
  // call created are removed in the same transaction, so they don't count.
  const createdIds = planned.filter((p) => p.change.kind === "created").map((p) => p.change.rowId);
  for (const p of planned) {
    if (p.change.kind !== "created" || p.state !== "restorable") continue;
    const blocked = await referenceBlocker(client, p.change, createdIds.filter((id) => id !== p.change.rowId));
    if (blocked) return refusal(blocked);
  }

  // Newest write first, so a child the call created goes before its parent.
  const steps = planned
    .filter((p) => p.state === "restorable")
    .reverse()
    .map((p) => {
      const step = undoStep(p.change);
      const guard = guards.get(`${p.change.table}:${p.change.rowId}`);
      return step && guard && step.op === "update" ? { ...step, no_later: guard } : step;
    })
    .filter((s): s is UndoStep => s !== null);
  const writeIds = planned.flatMap((p) => p.change.writeIds);
  const label = describeAction(action);

  const { data, error: applyError } = await client.rpc("fn_ai_undo_apply", { p_steps: steps, p_write_ids: writeIds });
  if (applyError) return applyFailure(applyError as PgError);

  const restored = typeof data === "number" ? data : steps.length;
  if (steps.length === 0) {
    return { ok: true, status: "already", message: `Already back the way it was: ${label}.`, restored: 0 };
  }
  return { ok: true, status: "undone", message: `Undone: ${label}.`, restored };
}
