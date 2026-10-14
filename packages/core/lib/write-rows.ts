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
