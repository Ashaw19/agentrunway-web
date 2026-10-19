/**
 * Mark a client's memory profile ("What Agent Runway remembers", Flight
 * Crew's per-client context) as outdated, so it is rebuilt on next read.
 *
 * Called after a CRM write that changes what the AI should know about the
 * client: a contact logged, a profile edited, a deal's status changed. Runs
 * with the signed-in user's own client (web server or browser, or the phone
 * app's); RLS on client_memory_profiles limits it to the user's own rows.
 *
 * Fire-and-forget: a failure never breaks the caller's write.
 */

import type { DbClient } from "./db-client";

export async function markMemoryStale(
  supabase: DbClient,
  userId: string,
  clientId: string,
): Promise<void> {
  try {
    await supabase
      .from("client_memory_profiles")
      .update({ stale: true })
      .eq("client_id", clientId)
      .eq("user_id", userId);
  } catch {
    // Fire-and-forget — never let stale marking break the caller
  }
}
