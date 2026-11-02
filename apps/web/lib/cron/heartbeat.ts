/**
 * A cron route's heartbeat: one row in routine_heartbeats (00191) when it
 * finishes, read by /api/cron/routine-check. Wrap the route's work in
 * `withHeartbeat` so a thrown error is recorded as an error beat rather than
 * silence.
 *
 * Writing the beat never fails the route: a heartbeat insert error is logged
 * and the route's own response stands.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

export async function writeHeartbeat(
  routineId: string,
  outcome: "ok" | "error",
  note?: string | null,
  db?: SupabaseClient,
): Promise<void> {
  try {
    const admin = db ?? createAdminClient();
    const { error } = await admin.from("routine_heartbeats").insert({
      routine_id: routineId,
      outcome,
      note: note ? String(note).slice(0, 500) : null,
    });
    if (error) console.error(`[heartbeat] ${routineId}: insert failed:`, error.code ?? "", error.message);
  } catch (err) {
    console.error(`[heartbeat] ${routineId}: insert threw:`, err);
  }
}

/**
 * Run a cron route's body and record how it ended. `summary` turns the
 * body's result into the note kept with the beat.
 */
export async function withHeartbeat<T>(
  routineId: string,
  body: () => Promise<T>,
  summary: (result: T) => string = () => "ok",
): Promise<T> {
  try {
    const result = await body();
    await writeHeartbeat(routineId, "ok", summary(result));
    return result;
  } catch (err) {
    await writeHeartbeat(routineId, "error", err instanceof Error ? err.message : String(err));
    throw err;
  }
}
