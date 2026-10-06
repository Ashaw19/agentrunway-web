/**
 * Log a contact activity for a client from the browser (RLS-scoped client).
 *
 * Used by Flight Control's "Log contact": the agent reached the client
 * another way and wants them off the list. The insert is what clears them —
 * the contact_activities trigger moves clients.last_contact_at, and Scan
 * suppresses anyone contacted in the last 14 days (lib/crm/recently-contacted.ts).
 * The same trigger may auto-promote Cruising/Scheduled → Boarding (00105/00166).
 *
 * Failures are reported and logged with their cause. Every activity insert
 * failed from 2026-04-12 to 2026-10-06 (00112) and the CRM's generic
 * "Failed to log activity" hid why for six months.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActivityType } from "@agent-runway/core/types/database";

export interface LogContactInput {
  clientId:      string;
  type:          ActivityType;
  description:   string;
  /** ISO timestamp. Defaults to now. */
  activityDate?: string;
}

export interface LogContactResult {
  ok:          boolean;
  priorStatus: string | null;
  newStatus:   string | null;
}

export async function logClientContact(
  supabase: SupabaseClient,
  input:    LogContactInput,
): Promise<LogContactResult> {
  const fail: LogContactResult = { ok: false, priorStatus: null, newStatus: null };

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail;

  // Ownership check + prior status, so an auto-promotion can be reported.
  const { data: before } = await supabase
    .from("clients")
    .select("status")
    .eq("id", input.clientId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!before) return fail;
  const priorStatus = (before.status as string | null) ?? null;

  const { error } = await supabase.from("contact_activities").insert({
    user_id:       user.id,
    client_id:     input.clientId,
    type:          input.type,
    description:   input.description,
    activity_date: input.activityDate ?? new Date().toISOString(),
  });
  if (error) {
    console.error("[log-contact] contact_activities insert failed:", error.code ?? "", error.message);
    return { ...fail, priorStatus };
  }

  let newStatus = priorStatus;
  if (priorStatus === "cruising" || priorStatus === "scheduled") {
    const { data: after } = await supabase
      .from("clients")
      .select("status")
      .eq("id", input.clientId)
      .eq("user_id", user.id)
      .maybeSingle();
    newStatus = (after?.status as string | null) ?? priorStatus;
  }

  return { ok: true, priorStatus, newStatus };
}
