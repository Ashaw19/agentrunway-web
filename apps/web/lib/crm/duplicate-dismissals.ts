/**
 * "Not the same person" in Possible Duplicates, remembered (migration 00190).
 *
 * Near-matches include family members (same last name, same first initial),
 * so an answer has to stick or the same pairs come back on every visit. One
 * row per pair, ids ordered (client_a < client_b), keyed the same way as
 * pairKey() in duplicate-detection.ts.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { pairKey } from "./duplicate-detection";

/** Every pair of ids in a group: dismissing a group of 3 stores 3 pairs. */
export function pairsOf(clientIds: string[]): Array<[string, string]> {
  const ids = [...new Set(clientIds)].sort();
  const out: Array<[string, string]> = [];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) out.push([ids[i], ids[j]]);
  return out;
}

/** True when every pair in the group was marked "Not the same person". */
export function groupDismissed(clientIds: string[], dismissed: ReadonlySet<string>): boolean {
  const pairs = pairsOf(clientIds);
  return pairs.length > 0 && pairs.every(([a, b]) => dismissed.has(pairKey(a, b)));
}

/** The agent's dismissed pairs, as pairKey values. Empty on a read error. */
export async function loadDismissedPairs(supabase: SupabaseClient, userId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("client_duplicate_dismissals")
    .select("client_a, client_b")
    .eq("user_id", userId);
  if (error) {
    console.error("[duplicates] dismissals read failed:", error.code ?? "", error.message);
    return new Set();
  }
  return new Set((data ?? []).map((r) => pairKey(r.client_a as string, r.client_b as string)));
}

/** Remember every pair in the group. Resolves false if it couldn't be saved. */
export async function dismissGroup(supabase: SupabaseClient, userId: string, clientIds: string[]): Promise<boolean> {
  const rows = pairsOf(clientIds).map(([client_a, client_b]) => ({ user_id: userId, client_a, client_b }));
  if (rows.length === 0) return true;
  const { error } = await supabase
    .from("client_duplicate_dismissals")
    .upsert(rows, { onConflict: "user_id,client_a,client_b", ignoreDuplicates: true });
  if (error) {
    console.error("[duplicates] dismissal save failed:", error.code ?? "", error.message);
    return false;
  }
  return true;
}
