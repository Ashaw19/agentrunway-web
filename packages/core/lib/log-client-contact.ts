/**
 * Log a contact activity for a client with the signed-in user's own client
 * (RLS-scoped): the web browser client, or the phone app's.
 *
 * Used by Flight Control's "Log contact", and by the Checklist's "Save to
 * their profile" on web and on the phone: the agent reached the client
 * another way and wants them off the list. The insert is what clears them —
 * the contact_activities trigger moves clients.last_contact_at, and Scan
 * suppresses anyone contacted in the last 14 days (apps/web/lib/crm/recently-contacted.ts).
 * Logging contact never changes the client's stage (00189): a check-in with
 * a past client is not a sign they're looking.
 *
 * Failures are reported and logged with their cause. Every activity insert
 * failed from 2026-04-12 to 2026-10-06 (00112) and the CRM's generic
 * "Failed to log activity" hid why for six months.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActivityType, ContactActivity } from "../types/database";

export interface LogContactInput {
  clientId:      string;
  type:          ActivityType;
  description:   string;
  /** ISO timestamp. Defaults to now. */
  activityDate?: string;
}

export interface LogContactResult {
  ok:        boolean;
  /** The saved row, so a screen can show it without a reload. */
  activity?: ContactActivity;
}

export async function logClientContact(
  supabase: SupabaseClient,
  input:    LogContactInput,
): Promise<LogContactResult> {
  const fail: LogContactResult = { ok: false };

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail;

  // Ownership check.
  const { data: owned } = await supabase
    .from("clients")
    .select("id")
    .eq("id", input.clientId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!owned) return fail;

  const { data: activity, error } = await supabase.from("contact_activities").insert({
    user_id:       user.id,
    client_id:     input.clientId,
    type:          input.type,
    description:   input.description,
    activity_date: input.activityDate ?? new Date().toISOString(),
  }).select().single();
  if (error) {
    console.error("[log-contact] contact_activities insert failed:", error.code ?? "", error.message);
    return fail;
  }

  return { ok: true, activity: activity as ContactActivity };
}
