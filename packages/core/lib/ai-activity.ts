/**
 * AI activity: reading the AI run ledger (migration 00182).
 *
 * Pure helpers shared by every surface that shows what the AI did: the web
 * "AI activity" page, the phone's More → AI activity list, Flight Crew's
 * getAIActivity tool and the connector's get_ai_activity. They group the
 * ledger's rows into one "action" per tool call, describe it in plain words,
 * and decide whether Undo is available (the undo itself is ai-undo.ts).
 *
 * Also the rules the write recorder (apps/web/lib/ai/write-ledger.ts) and
 * the undo share: which column is a table's key, which columns Postgres
 * computes, and which AI-written text is never stored in the ledger.
 *
 * No imports outside packages/core: the connector (Deno) uses this file
 * through its generated copy.
 */

import type { AiRun, AiRunWrite } from "../types/database";

// ── Windows ─────────────────────────────────────────────────────────────────

/** Undo is offered on an AI change for this many days. */
export const AI_UNDO_WINDOW_DAYS = 30;

/**
 * The ledger keeps a change's before and after images this long, then clears
 * them (the daily db-health job), so a record the AI deleted doesn't live on
 * in the ledger. Equal to the undo window: past it there is nothing to undo.
 */
export const AI_WRITE_IMAGE_RETENTION_DAYS = AI_UNDO_WINDOW_DAYS;

/** ai_runs and ai_run_writes rows are deleted after this many months (db-health). */
export const AI_LEDGER_RETENTION_MONTHS = 13;

// ── Table rules ─────────────────────────────────────────────────────────────

/** The key column of a table whose key isn't `id`. */
const PRIMARY_KEYS: Readonly<Record<string, string>> = {
  user_settings: "user_id",
};

export function primaryKeyOf(table: string): string {
  return PRIMARY_KEYS[table] ?? "id";
}

/**
 * Columns Postgres computes (GENERATED ALWAYS ... STORED). Writing them fails,
 * so undo leaves them out. apps/web/lib/__tests__/ai-ledger-guards.test.ts
 * checks this against every migration.
 */
export const GENERATED_COLUMNS: Readonly<Record<string, readonly string[]>> = {
  mileage_logs: ["deduction"],
};

/** Columns a trigger sets on every write; undo leaves them to the trigger. */
const TRIGGER_COLUMNS: readonly string[] = ["updated_at"];

/**
 * AI-written message text in the draft tables. The ledger stores a length
 * and a hash in its place, never the text (no completion text in the
 * ledger). Undo can still delete a draft the AI made, but can't put back
 * earlier draft text.
 */
export const AI_TEXT_COLUMNS: Readonly<Record<string, readonly string[]>> = {
  outreach_queue: ["ai_subject", "ai_body", "final_subject", "final_body"],
  newsletter_queue: ["ai_subject", "ai_body", "final_subject", "final_body"],
  workflow_drafts: ["subject", "body"],
};

/** The ledger's own tables: never recorded as AI writes. */
export const LEDGER_TABLES: ReadonlySet<string> = new Set(["ai_runs", "ai_run_writes"]);

/**
 * Triggers that change ANOTHER table's row when a row is inserted here. The
 * write recorder reads that parent row before and after the insert and
 * records the change as an update in the same tool call, so undo puts both
 * back together (one transaction, fn_ai_undo_apply).
 *
 * contact_activities AFTER INSERT (00018/00105/00166, 00028/00171): sets
 * clients.last_contact_at and first_contacted_at and may move a Cruising or
 * Scheduled client to Boarding. No trigger fires on DELETE, so deleting the
 * activity alone would leave all three. Undo puts the client back only if no
 * other (non-note) activity for them was created after the AI's: the trigger
 * only moves last_contact_at forward, so a later call dated earlier leaves
 * the client row looking untouched (ai-undo.ts, fn_ai_undo_apply no_later). apps/web/lib/__tests__/ai-ledger-guards.test.ts
 * fails when a migration adds a trigger that writes another table and isn't
 * listed here or in TRIGGER_SIDE_EFFECTS_REVIEWED.
 */
export interface TriggerSideEffect {
  parentTable: string;
  foreignKey: string;
  /** Rows that don't fire the trigger (a note isn't contact, 00171). */
  ignore?: { column: string; value: string };
  /** Said when undo brings back a deleted row here: inserting it fires the trigger again. */
  reinsertNote?: string;
}

export const TRIGGER_SIDE_EFFECTS: Readonly<Record<string, readonly TriggerSideEffect[]>> = {
  contact_activities: [
    {
      parentTable: "clients",
      foreignKey: "client_id",
      ignore: { column: "type", value: "note" },
      reinsertNote:
        "bringing it back counts as logging it again: the client's last contact can move, and a Cruising or Scheduled client can move to Boarding",
    },
  ],
};

/**
 * Cross-table triggers reviewed and handled another way, by the table they
 * fire on (the guard test reads this).
 *   user_settings → income_goals (00169, UPDATE OF goal_gci): undo refuses a
 *     goal_gci change (UNDO_BLOCKED_COLUMNS).
 *   income_goals → user_settings (00169): income_goals is excluded from undo.
 *   receipt_expenses → statement_lines (00185): a receipt saved, or its date
 *     or amount edited, after its card charge was confirmed from a statement
 *     takes the line over (the statement copy is removed) or flags the line
 *     for the agent; deleting a receipt sends its line back to review. Undo
 *     refuses any change to a receipt that is, or was, the record of a
 *     statement line (UNDO_BLOCKED_COLUMNS, UNDO_BLOCKED_LINKS), and removing
 *     a created receipt a line now points at (fn_ai_row_references). Undoing
 *     any other receipt change fires the same triggers, which keep a charge
 *     counted once.
 *   recurring_expenses → statement_lines (00185): changing a recurring
 *     expense's amount or schedule, or deleting it, sends the lines counted
 *     as its charges back to review. Undoing the change leaves them in review
 *     (held, counted by neither until the agent decides); deleting one a line
 *     points at is marked irreversible (fn_ai_row_references).
 */
export const TRIGGER_SIDE_EFFECTS_REVIEWED: ReadonlySet<string> = new Set([
  "user_settings",
  "income_goals",
  "receipt_expenses",
  "recurring_expenses",
]);

/** Why undo leaves an expense that a statement line records alone. */
const STATEMENT_LINK_REASON =
  "it is the record of a charge on an imported statement. Send that line back to review, or match it again, on Expenses → Imports";

/** Columns undo won't put back, and why (a trigger writes another table from them). */
const OPT_OUT_REASON =
  "an unsubscribe is CASL evidence, and undo never clears or changes one. If it was recorded by mistake, record the client's consent again in their Consent section";

export const UNDO_BLOCKED_COLUMNS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  user_settings: {
    goal_gci: "the income goal is saved by year, so change it in Settings → Annual Goal instead",
  },
  // The statement link (00185): set by a confirm, a match or the receipt
  // trigger, together with the line's own status. Undo can't put the line back.
  receipt_expenses: { statement_line_id: STATEMENT_LINK_REASON, source: STATEMENT_LINK_REASON },
  // The per-channel opt-outs (00173, 00183). fn_ai_undo_apply refuses them too.
  clients: Object.fromEntries(
    ["email", "sms"].flatMap((ch) => ["at", "source", "method", "note"].map((f) => [`${ch}_opt_out_${f}`, OPT_OUT_REASON])),
  ),
};

/**
 * Columns that, when set on a record undo would remove (created) or bring
 * back (deleted), make undo refuse: removing or re-adding the row alone
 * would leave the record linked to it out of step.
 */
export const UNDO_BLOCKED_LINKS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  receipt_expenses: { statement_line_id: STATEMENT_LINK_REASON },
};

/**
 * Tables whose rows undo can put back. Each was reviewed: one row per record,
 * owned by the agent (RLS on user_id), and the only cross-table trigger
 * effects are the ones TRIGGER_SIDE_EFFECTS records with the row. Money rows
 * (transactions, receipt_expenses, recurring_expenses, mileage_logs,
 * t2125_cca_assets) restore the row itself; every total is recomputed from
 * rows by the engines, so nothing else changes. A row the AI DELETED comes
 * back only if nothing pointed at it when it was deleted (the recorder marks
 * it irreversible otherwise): ON DELETE SET NULL / CASCADE effects on other
 * rows are not recorded and can't be put back.
 */
export const UNDO_TABLES: ReadonlySet<string> = new Set([
  "clients",
  "client_notes",
  "client_relationships",
  "client_records",
  "contact_activities",
  "contact_tasks",
  // Skip, Later and Stop on a suggestion (00168, 00188): one row each, owned
  // by the agent (RLS on user_id), referenced by no other table, no trigger.
  "flight_control_dismissals",
  "flight_plans",
  "flight_plan_steps",
  "listing_appointments",
  "mileage_logs",
  "newsletter_queue",
  "outreach_queue",
  "pipeline_deals",
  "property_showings",
  "receipt_expenses",
  "recurring_expenses",
  "referrals",
  "t2125_cca_assets",
  "transactions",
  "user_settings",
  // CRA vehicle logbook (00184). Every vehicle reference is a composite FK
  // (user_id, vehicle_id) → vehicles (user_id, id), which fn_ai_row_references
  // counts, so a vehicle with periods, readings or trips logged since is
  // never removed; mileage_logs' NO ACTION reference would refuse it anyway,
  // and fn_ai_undo_apply rolls back on that.
  "vehicles",
  "vehicle_logbook_periods",
  "vehicle_odometer_readings",
  "mileage_places",
  "workflow_drafts",
]);

/**
 * Tables undo deliberately leaves alone, and why. Any other table not in
 * UNDO_TABLES is refused too ("not reviewed for undo").
 */
export const UNDO_EXCLUDED: Readonly<Record<string, string>> = {
  // CASL evidence (00183): append-only, a guard trigger refuses edits except
  // withdrawing, and there is no DELETE policy. Undoing a recordConsent as a
  // "withdrawal" would write a false record that the client withdrew, so
  // undo leaves consent alone entirely (fn_ai_undo_apply refuses it too).
  client_email_consents:
    "a consent record is CASL evidence and is never edited or deleted. If it was recorded by mistake, withdraw it in the client's Consent section with a note saying so",
  consent_records: "a consent record is CASL evidence and is never edited or deleted",
  income_goals:
    "a year's income goal is saved by year and the dashboard reads it straight away; change it in Settings instead",
  ai_runs: "the AI ledger itself",
  ai_run_writes: "the AI ledger itself",
  // The day's handful (00188) is written by the handful sync on both
  // surfaces, never by a Flight Crew tool.
  next_up_handful: "bookkeeping written by the handful sync, never by a tool",
  // Statement imports (00185): a line's status, links and counts move
  // together (fn_confirm_statement_lines, fn_reopen_statement_lines).
  statement_lines:
    "a statement line goes back with \"Back to review\" on Expenses → Imports, which also removes the expense it added",
  imported_statements: "an import is removed on Expenses → Imports",
};

/** Why a table can't be undone, or null when it can. */
export function undoTableBlocker(table: string): string | null {
  if (UNDO_TABLES.has(table)) return null;
  return UNDO_EXCLUDED[table] ?? "this kind of record isn't set up for undo";
}

// ── AI text redaction ───────────────────────────────────────────────────────

/** What the ledger stores in place of AI-written text. */
export interface RedactedText {
  $redacted: "ai_text";
  length: number;
  /** FNV-1a 32-bit of the text: enough to tell whether it changed since. */
  hash: string;
}

export function isRedactedText(value: unknown): value is RedactedText {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { $redacted?: unknown }).$redacted === "ai_text"
  );
}

function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** A row as the ledger stores it: AI-written text replaced by a marker. */
export function redactRow(
  table: string,
  row: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!row) return row;
  const columns = AI_TEXT_COLUMNS[table];
  if (!columns) return row;
  const out: Record<string, unknown> = { ...row };
  for (const col of columns) {
    const v = out[col];
    if (typeof v === "string" && v.length > 0) {
      out[col] = { $redacted: "ai_text", length: v.length, hash: fnv1a(v) } satisfies RedactedText;
    }
  }
  return out;
}

// ── Row comparison ──────────────────────────────────────────────────────────

/** Deep equality of two JSON values (rows as PostgREST returns them). */
export function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") {
    return false;
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => jsonEqual(v, b[i]));
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(ao), ...Object.keys(bo)]);
  for (const k of keys) {
    if (!jsonEqual(ao[k], bo[k])) return false;
  }
  return true;
}

/** Whether a fresh row is the same as a stored (possibly redacted) image. */
export function rowMatchesImage(
  table: string,
  current: Record<string, unknown> | null,
  image: Record<string, unknown> | null,
): boolean {
  if (!current || !image) return current === image;
  return jsonEqual(redactRow(table, current), image);
}

/**
 * Columns undo writes back to turn `after` into `before`: those that differ,
 * leaving out the columns Postgres computes and trigger-set timestamps.
 */
export function changedColumns(
  table: string,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): string[] {
  const skip = new Set([...(GENERATED_COLUMNS[table] ?? []), ...TRIGGER_COLUMNS, primaryKeyOf(table)]);
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys].filter((k) => !skip.has(k) && !jsonEqual(before[k], after[k])).sort();
}

/** A before-image ready to insert again: the columns Postgres computes left out. */
export function insertableImage(table: string, image: Record<string, unknown>): Record<string, unknown> {
  const generated = new Set(GENERATED_COLUMNS[table] ?? []);
  return Object.fromEntries(Object.entries(image).filter(([k]) => !generated.has(k)));
}

// ── Grouping ────────────────────────────────────────────────────────────────

/** The writes one tool call made, newest action first. */
export interface AIAction {
  toolCallId: string;
  toolName: string;
  source: AiRunWrite["source"];
  /** The first write's time. */
  createdAt: string;
  /** In the order they were made. */
  writes: AiRunWrite[];
  /** Every successful write has been undone. */
  undone: boolean;
  undoneAt: string | null;
  /** At least one write failed (Postgres refused it). */
  failed: boolean;
  /** Writes that failed, for the failure count. */
  failedWrites: number;
}

function byWriteOrder(a: AiRunWrite, b: AiRunWrite): number {
  if (a.seq !== b.seq) return a.seq - b.seq;
  return a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0;
}

export function groupWritesIntoActions(writes: readonly AiRunWrite[]): AIAction[] {
  const groups = new Map<string, AiRunWrite[]>();
  for (const w of writes) {
    const list = groups.get(w.tool_call_id);
    if (list) list.push(w);
    else groups.set(w.tool_call_id, [w]);
  }
  const actions: AIAction[] = [];
  for (const [toolCallId, list] of groups) {
    const ordered = [...list].sort(byWriteOrder);
    const ok = ordered.filter((w) => w.outcome === "ok");
    const undoneTimes = ok.map((w) => w.undone_at).filter((t): t is string => t !== null);
    const undone = ok.length > 0 && undoneTimes.length === ok.length;
    actions.push({
      toolCallId,
      toolName: ordered[0].tool_name,
      source: ordered[0].source,
      createdAt: ordered.reduce((min, w) => (w.created_at < min ? w.created_at : min), ordered[0].created_at),
      writes: ordered,
      undone,
      undoneAt: undone ? [...undoneTimes].sort()[undoneTimes.length - 1] ?? null : null,
      failed: ordered.some((w) => w.outcome === "error"),
      failedWrites: ordered.filter((w) => w.outcome === "error").length,
    });
  }
  return actions.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
}

/**
 * One record's net change within an action: its state before the first
 * write and after the last. A draft that was inserted and then filled in is
 * one "created" change.
 */
export interface RowChange {
  table: string;
  rowId: string;
  kind: "created" | "changed" | "deleted";
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  writeIds: string[];
}

/**
 * Net changes of an action's successful writes, in first-write order. Writes
 * already undone are left out unless `includeUndone` (to describe a change
 * after it was undone).
 */
export function netRowChanges(
  writes: readonly AiRunWrite[],
  opts: { includeUndone?: boolean } = {},
): RowChange[] {
  const changes = new Map<string, RowChange>();
  for (const w of [...writes].sort(byWriteOrder)) {
    if (w.outcome !== "ok" || w.row_id === null) continue;
    if (w.undone_at !== null && !opts.includeUndone) continue;
    const key = `${w.table_name}:${w.row_id}`;
    const existing = changes.get(key);
    if (!existing) {
      changes.set(key, {
        table: w.table_name,
        rowId: w.row_id,
        kind: "changed",
        before: w.action === "insert" ? null : w.before_image,
        after: w.action === "delete" ? null : w.after_image,
        writeIds: [w.id],
      });
    } else {
      existing.after = w.action === "delete" ? null : w.after_image;
      existing.writeIds.push(w.id);
    }
  }
  const out = [...changes.values()];
  for (const c of out) {
    c.kind = c.before === null ? "created" : c.after === null ? "deleted" : "changed";
  }
  // Created and then deleted in the same call: nothing left to undo.
  return out.filter((c) => !(c.before === null && c.after === null));
}

// ── Undo availability ───────────────────────────────────────────────────────

/** Why Undo isn't offered on an action, or null when it is. */
export function actionUndoBlocker(action: AIAction, now: Date = new Date()): string | null {
  if (action.undone) return "Already undone.";
  const ok = action.writes.filter((w) => w.outcome === "ok");
  if (ok.length === 0) return "Nothing to undo: this change didn't save.";
  const ageDays = (now.getTime() - new Date(action.createdAt).getTime()) / 86_400_000;
  if (ageDays > AI_UNDO_WINDOW_DAYS) return `Undo is available for ${AI_UNDO_WINDOW_DAYS} days.`;
  const pending = ok.filter((w) => w.undone_at === null);
  for (const w of pending) {
    if (w.irreversible_reason) return w.irreversible_reason;
    const blocker = undoTableBlocker(w.table_name);
    if (blocker) return `Undo isn't available for ${tableLabel(w.table_name, true)}: ${blocker}.`;
    const needsBefore = w.action !== "insert";
    const needsAfter = w.action !== "delete";
    if (w.row_id === null || (needsBefore && !w.before_image) || (needsAfter && !w.after_image)) {
      return "Agent Runway doesn't have the earlier version of this record.";
    }
  }
  // What the undo would write: refuse here, before anything is offered, if
  // any part of it can't be done.
  for (const c of netRowChanges(pending)) {
    if (c.kind === "created" || c.kind === "deleted") {
      const image = (c.kind === "created" ? c.after : c.before) ?? {};
      for (const [col, why] of Object.entries(UNDO_BLOCKED_LINKS[c.table] ?? {})) {
        if (image[col] !== null && image[col] !== undefined) {
          return `Undo can't ${c.kind === "created" ? "remove" : "bring back"} the ${tableLabel(c.table)}: ${why}.`;
        }
      }
    }
    if (c.kind === "deleted") {
      if (Object.values(insertableImage(c.table, c.before ?? {})).some(isRedactedText)) {
        return `Agent Runway doesn't keep AI-written text, so it can't bring back the ${tableLabel(c.table)}.`;
      }
      continue;
    }
    if (c.kind !== "changed" || !c.before || !c.after) continue;
    const blocked = UNDO_BLOCKED_COLUMNS[c.table] ?? {};
    for (const col of changedColumns(c.table, c.before, c.after)) {
      if (blocked[col]) return `Undo can't put back the ${col.replace(/_/g, " ")}: ${blocked[col]}.`;
      if (isRedactedText(c.before[col])) {
        return `Agent Runway doesn't keep AI-written text, so it can't put back the earlier wording of the ${tableLabel(c.table)}.`;
      }
    }
  }
  return null;
}

/**
 * Identifies exactly which writes an undo would act on. The approval card is
 * built from the action this names, and the undo refuses if the action's
 * pending writes no longer match it (changed, already undone, or a different
 * action).
 */
export function actionFingerprint(action: AIAction): string {
  const pending = action.writes
    .filter((w) => w.outcome === "ok" && w.undone_at === null)
    .map((w) => w.id)
    .sort();
  return `${fnv1a(`${action.toolCallId}|${pending.join(",")}`)}-${pending.length}`;
}

// ── Words ───────────────────────────────────────────────────────────────────

const TABLE_LABELS: Readonly<Record<string, [singular: string, plural: string]>> = {
  clients: ["client", "clients"],
  client_notes: ["client note", "client notes"],
  client_relationships: ["client relationship", "client relationships"],
  client_records: ["deal-client link", "deal-client links"],
  contact_activities: ["activity", "activities"],
  contact_tasks: ["checklist item", "checklist items"],
  flight_control_dismissals: ["dismissed suggestion", "dismissed suggestions"],
  flight_plans: ["Flight Plan", "Flight Plans"],
  flight_plan_steps: ["Flight Plan step", "Flight Plan steps"],
  listing_appointments: ["listing appointment", "listing appointments"],
  mileage_logs: ["mileage entry", "mileage entries"],
  newsletter_queue: ["newsletter draft", "newsletter drafts"],
  outreach_queue: ["outreach draft", "outreach drafts"],
  pipeline_deals: ["pipeline deal", "pipeline deals"],
  property_showings: ["showing", "showings"],
  receipt_expenses: ["expense", "expenses"],
  recurring_expenses: ["recurring expense", "recurring expenses"],
  referrals: ["referral", "referrals"],
  t2125_cca_assets: ["CCA asset", "CCA assets"],
  client_email_consents: ["consent record", "consent records"],
  vehicles: ["vehicle", "vehicles"],
  vehicle_logbook_periods: ["logbook period", "logbook periods"],
  vehicle_odometer_readings: ["odometer reading", "odometer readings"],
  mileage_places: ["saved place", "saved places"],
  transactions: ["deal", "deals"],
  user_settings: ["setting", "settings"],
  workflow_drafts: ["Flight Plan draft", "Flight Plan drafts"],
  income_goals: ["income goal", "income goals"],
  statement_lines: ["statement line", "statement lines"],
  imported_statements: ["imported statement", "imported statements"],
};

export function tableLabel(table: string, plural = false): string {
  const label = TABLE_LABELS[table];
  if (label) return plural ? label[1] : label[0];
  return table.replace(/_/g, " ");
}

/** "Created a client", for the tools Flight Crew writes with. */
const TOOL_LABELS: Readonly<Record<string, string>> = {
  createClient: "Created a client",
  updateClientDetails: "Updated a client's details",
  updateClientNotes: "Updated a client's notes",
  updateClientStatus: "Changed a client's status",
  updateClientTags: "Changed a client's tags",
  updateClientTone: "Changed a client's tone",
  linkClientReferral: "Linked a referral to a client",
  linkClientRelationship: "Linked two clients",
  archiveClient: "Moved a client to the Hangar",
  unarchiveClient: "Brought a client back from the Hangar",
  createPipelineDeal: "Added a pipeline deal",
  updatePipelineDealStage: "Moved a pipeline deal",
  updatePipelineDealValue: "Changed a pipeline deal's value",
  updatePipelineDealProbability: "Changed a pipeline deal's probability",
  updatePipelineDealCloseDate: "Changed a pipeline deal's close date",
  updatePipelineDealDetails: "Updated a pipeline deal",
  removePipelineDeal: "Removed a pipeline deal",
  logContactActivity: "Logged a contact",
  deleteContactActivity: "Deleted an activity",
  createContactTask: "Added a checklist item",
  completeContactTask: "Ticked off a checklist item",
  updateContactTask: "Changed a checklist item",
  deleteContactTask: "Deleted a checklist item",
  logExpense: "Logged an expense",
  updateExpense: "Changed an expense",
  deleteExpense: "Deleted an expense",
  createRecurringExpense: "Added a recurring expense",
  updateRecurringExpense: "Changed a recurring expense",
  deleteRecurringExpense: "Deleted a recurring expense",
  logMileage: "Logged mileage",
  updateMileage: "Changed a mileage entry",
  deleteMileage: "Deleted a mileage entry",
  recordTransaction: "Recorded a deal",
  updateTransaction: "Changed a deal",
  deleteTransaction: "Deleted a deal",
  updateIncomeReportingMethod: "Changed the income reporting method",
  updateGstHstCommissionTiming: "Changed which date places commissions on the GST/HST return",
  updateUserSettings: "Changed a setting",
  updateGCIGoal: "Changed the income goal",
  recordReferral: "Recorded a referral",
  updateReferral: "Changed a referral",
  deleteReferral: "Deleted a referral",
  addCCAAsset: "Added a CCA asset",
  updateCCAAsset: "Changed a CCA asset",
  deleteCCAAsset: "Deleted a CCA asset",
  addPropertyShowing: "Added a showing",
  updatePropertyShowing: "Changed a showing",
  deletePropertyShowing: "Deleted a showing",
  addListingAppointment: "Added a listing appointment",
  updateListingAppointment: "Changed a listing appointment",
  deleteListingAppointment: "Deleted a listing appointment",
  skipOutreachItem: "Skipped a Flight Control draft",
  createFlightPlan: "Started a Flight Plan",
  manageFlightPlan: "Changed a Flight Plan",
  draftOutreachForClient: "Drafted an email",
  draftClientTexts: "Drafted texts",
  draftListingDescription: "Drafted a listing description",
  draftNewsletter: "Drafted a newsletter",
  draftSocialPost: "Drafted a social post",
  undoAIChange: "Undid an AI change",
  recordConsent: "Recorded consent",
  withdrawConsent: "Recorded that a client asked to stop",
  captureNote: "Saved items from a note",
  startLogbookPeriod: "Started a logbook period",
  confirmImportLines: "Confirmed statement lines",
  matchReceiptToLine: "Matched a receipt to a statement line",
  recordOdometerReading: "Recorded an odometer reading",
  skipSuggestedClient: "Skipped a suggested client",
  snoozeSuggestedClient: "Put a suggested client on Later",
  stopSuggestingClient: "Stopped suggesting a client",
};

/** "Logged an expense": the tool's plain-words label. */
export function toolLabel(toolName: string): string {
  const known = TOOL_LABELS[toolName];
  if (known) return known;
  const words = toolName.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const NAME_FIELDS = ["name", "client_name", "address", "title", "vendor", "merchant", "description"];

/** A short name for a record from its image ("Pat Example", "12 Elm St"). */
export function recordName(image: Record<string, unknown> | null): string | null {
  if (!image) return null;
  for (const f of NAME_FIELDS) {
    const v = image[f];
    if (typeof v === "string" && v.trim()) {
      const s = v.trim();
      return s.length > 60 ? `${s.slice(0, 57)}...` : s;
    }
  }
  return null;
}

/** "Logged an expense: Staples", or the label alone when no name is on record. */
export function describeAction(action: AIAction): string {
  const label = toolLabel(action.toolName);
  const first = action.writes.find((w) => w.outcome === "ok") ?? action.writes[0];
  const name = first ? recordName(first.after_image ?? first.before_image) : null;
  return name ? `${label}: ${name}` : label;
}

/** "Changed client: status, notes" / "Created deal" / "Deleted expense". */
export function describeRowChange(change: RowChange): string {
  const label = tableLabel(change.table);
  if (change.kind === "created") return `Created ${label}`;
  if (change.kind === "deleted") return `Deleted ${label}`;
  const cols = change.before && change.after ? changedColumns(change.table, change.before, change.after) : [];
  return cols.length ? `Changed ${label}: ${cols.map((c) => c.replace(/_/g, " ")).join(", ")}` : `Changed ${label}`;
}

/**
 * What undoing an action will do, one line per record: shown on the approval
 * card and the confirm step before anything happens.
 */
export function undoConsequences(action: AIAction): string[] {
  const pending = action.writes.filter((w) => w.outcome === "ok" && w.undone_at === null);
  return netRowChanges(pending).map((c) => {
    const name = recordName(c.after ?? c.before);
    const what = `${tableLabel(c.table)}${name ? ` "${name}"` : ""}`;
    if (c.kind === "created") {
      return c.table === "clients" ? `Deletes the client${name ? ` "${name}"` : ""} for good` : `Removes the ${what}`;
    }
    if (c.kind === "deleted") {
      const effect = (TRIGGER_SIDE_EFFECTS[c.table] ?? []).find(
        (e) => e.reinsertNote && !(e.ignore && c.before?.[e.ignore.column] === e.ignore.value),
      );
      return effect ? `Brings back the ${what} (${effect.reinsertNote})` : `Brings back the ${what}`;
    }
    const cols = c.before && c.after ? changedColumns(c.table, c.before, c.after) : [];
    return cols.length
      ? `Puts back the ${what}: ${cols.map((col) => col.replace(/_/g, " ")).join(", ")}`
      : `Puts back the ${what}`;
  });
}

// ── Run summaries ───────────────────────────────────────────────────────────

export type AiRunSummaryRow = Pick<AiRun, "feature" | "outcome" | "estimated_cost_usd">;

export interface AiRunFeatureSummary {
  feature: string;
  calls: number;
  failed: number;
  aborted: number;
  costUsd: number;
}

export interface AiRunSummary {
  calls: number;
  failed: number;
  aborted: number;
  costUsd: number;
  /** Most calls first. */
  byFeature: AiRunFeatureSummary[];
}

export function summarizeRuns(runs: readonly AiRunSummaryRow[]): AiRunSummary {
  const by = new Map<string, AiRunFeatureSummary>();
  const total: AiRunSummary = { calls: 0, failed: 0, aborted: 0, costUsd: 0, byFeature: [] };
  for (const r of runs) {
    const f = by.get(r.feature) ?? { feature: r.feature, calls: 0, failed: 0, aborted: 0, costUsd: 0 };
    const cost = Number(r.estimated_cost_usd ?? 0) || 0;
    f.calls += 1;
    total.calls += 1;
    f.costUsd += cost;
    total.costUsd += cost;
    if (r.outcome === "error") {
      f.failed += 1;
      total.failed += 1;
    } else if (r.outcome === "aborted") {
      f.aborted += 1;
      total.aborted += 1;
    }
    by.set(r.feature, f);
  }
  total.byFeature = [...by.values()].sort((a, b) => b.calls - a.calls || a.feature.localeCompare(b.feature));
  return total;
}

/** One row of fn_ai_run_summary (migration 00182): a feature's totals, counted in Postgres. */
export interface AiRunFeatureTotalsRow {
  feature: string;
  calls: number | string;
  failed: number | string;
  aborted: number | string;
  cost_usd: number | string | null;
}

/** The same summary as summarizeRuns, from fn_ai_run_summary's per-feature totals. */
export function summaryFromTotals(rows: readonly AiRunFeatureTotalsRow[]): AiRunSummary {
  const byFeature = rows.map((r) => ({
    feature: r.feature,
    calls: Number(r.calls) || 0,
    failed: Number(r.failed) || 0,
    aborted: Number(r.aborted) || 0,
    costUsd: Number(r.cost_usd ?? 0) || 0,
  }));
  return {
    calls: byFeature.reduce((n, f) => n + f.calls, 0),
    failed: byFeature.reduce((n, f) => n + f.failed, 0),
    aborted: byFeature.reduce((n, f) => n + f.aborted, 0),
    costUsd: byFeature.reduce((n, f) => n + f.costUsd, 0),
    byFeature: byFeature.sort((a, b) => b.calls - a.calls || a.feature.localeCompare(b.feature)),
  };
}

/** "$0.0042" under a cent, "$1.27" above: an AI call costs fractions of a cent. */
export function formatAiCost(usd: number): string {
  if (!Number.isFinite(usd) || usd <= 0) return "$0.00";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

/** The feature tags call sites pass to aiCallHeaders, in plain words. */
const FEATURE_LABELS: Readonly<Record<string, string>> = {
  chat: "Flight Crew chat",
  "chat-fallback": "Flight Crew chat (backup model)",
  "captain-intake": "Website Captain chat",
  "receipt-ocr": "Receipt scan",
  "voice-extract": "Voice capture",
  "draft-outreach": "Email drafts",
  "draft-text": "Text drafts",
  "draft-newsletter": "Newsletter drafts",
  "draft-social-post": "Social post drafts",
  "draft-workflow-message": "Flight Plan drafts",
  "listing-description": "Listing descriptions",
  "client-memory": "Client memory",
  "detect-opportunities": "Flight Control scan",
  "import-history": "History import",
  "scan-import-notes": "Import notes scan",
  "extract-property": "Property details",
  "property-analysis": "Property analysis",
  "buyer-analysis": "Buyer analysis",
  "reward-suggestion": "Reward suggestions",
  "team-insights": "Team insights",
  "weekly-digest": "Weekly digest",
  morning_briefing: "Morning briefing",
  "cockpit-director-chat": "Director Cockpit",
  "statement-import-pdf": "Statement reading (PDF)",
  "statement-import-classify": "Statement line estimates",
  unknown: "Other AI",
};

/** Plain-words name of an AI feature tag ("draft-outreach" → "Email drafts"). */
export function featureLabel(feature: string): string {
  const known = FEATURE_LABELS[feature];
  if (known) return known;
  const words = feature.replace(/[-_]/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
