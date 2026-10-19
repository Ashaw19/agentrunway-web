/**
 * Rows shaped so the database accepts them. The phone app writes through
 * these (apps/mobile stores); they live in core so the rules are tested here
 * (lib/__tests__/write-rows.test.ts) and any client can use them.
 *
 * `transactions.address / client_name / notes`, `pipeline_deals.address /
 * client_name / notes` and `contact_activities.description` are NOT NULL
 * with a default of ''. A default applies only when the column is left out:
 * an explicit null fails the write. `clients.name_search` is NOT NULL with no
 * default and no trigger. Until 2026-10-14 the phone sent nulls (Add Deal,
 * a blank pipeline field, quick-log Call/Text) and no name_search (Add
 * Client), so those writes failed every time and sat in the offline queue
 * as "will sync when online". Shared by the data store and the offline
 * queue's replay, so a queued write lands the same way.
 */

import { toNameSearch } from "./client-identity";

/** NOT NULL text columns with a '' default: send '' for a blank value. */
function blankToEmpty<T extends Record<string, unknown>>(row: T, keys: readonly string[]): T {
  const out: Record<string, unknown> = { ...row };
  for (const k of keys) {
    if (k in out && (out[k] === null || out[k] === undefined)) out[k] = "";
  }
  return out as T;
}

const TRANSACTION_TEXT = ["address", "client_name", "notes"] as const;
const PIPELINE_TEXT = ["address", "client_name", "notes"] as const;
const ACTIVITY_TEXT = ["description"] as const;

/** A transactions insert or update. Inserts always carry the three text columns. */
export function transactionRow<T extends Record<string, unknown>>(tx: T, { insert = false } = {}): T {
  const base = insert ? { address: "", client_name: "", notes: "", ...tx } : tx;
  return blankToEmpty(base, TRANSACTION_TEXT);
}

/** A pipeline_deals update (the deal editor). */
export function pipelineDealRow<T extends Record<string, unknown>>(updates: T): T {
  return blankToEmpty(updates, PIPELINE_TEXT);
}

/** A contact_activities insert. */
export function activityRow<T extends Record<string, unknown>>(activity: T): T {
  return blankToEmpty({ description: "", ...activity }, ACTIVITY_TEXT);
}

/**
 * A clients insert or update: name_search follows name (web's add and
 * rename do the same), so duplicate detection and imports find the client.
 */
export function clientRow<T extends Record<string, unknown>>(client: T): T {
  const name = client.name;
  return typeof name === "string" ? { ...client, name_search: toNameSearch(name) } : client;
}

/**
 * A contact_tasks insert (a Checklist item). A blank note goes as null, and
 * the title is trimmed, as the web Checklist writes it (checklist-actions).
 */
export function contactTaskRow<T extends Record<string, unknown>>(task: T): T {
  const out: Record<string, unknown> = { ...task };
  if (typeof out.title === "string") out.title = out.title.trim();
  const notes = typeof out.notes === "string" ? out.notes.trim() : out.notes;
  out.notes = notes ? notes : null;
  return out as T;
}

/**
 * A mileage_logs insert. `description` is NOT NULL with a '' default; a blank
 * from / to goes as null.
 */
export function mileageRow<T extends Record<string, unknown>>(trip: T): T {
  const out = blankToEmpty({ description: "", ...trip }, ["description"]) as Record<string, unknown>;
  for (const k of ["from_location", "to_location", "purpose", "notes"]) {
    if (k in out) {
      const v = typeof out[k] === "string" ? (out[k] as string).trim() : out[k];
      out[k] = v ? v : null;
    }
  }
  return out as T;
}

/**
 * A receipt_expenses insert for an expense typed or spoken (no receipt image).
 * GST/HST only as given: with none, tax_amount and subtotal are null and no
 * input tax credit is counted on it. Never worked out from a rate.
 */
export function receiptExpenseRow(expense: {
  id?: string;
  user_id: string;
  vendor: string;
  expense_date: string;
  total_amount: number;
  tax_amount?: number | null;
  category_key: string;
  notes?: string | null;
}): Record<string, unknown> {
  const tax = typeof expense.tax_amount === "number" ? expense.tax_amount : null;
  return {
    ...(expense.id ? { id: expense.id } : {}),
    user_id: expense.user_id,
    vendor: expense.vendor,
    expense_date: expense.expense_date,
    total_amount: expense.total_amount,
    tax_amount: tax,
    subtotal: tax !== null ? Math.round((expense.total_amount - tax) * 100) / 100 : null,
    category_key: expense.category_key,
    notes: expense.notes ?? null,
    currency: "CAD",
  };
}
