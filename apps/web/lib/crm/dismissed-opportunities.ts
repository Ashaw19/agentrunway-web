/**
 * Persisted Flight Control dismissals (flight_control_dismissals, 00168).
 *
 * Dismiss used to live in React state, so a refresh brought the card
 * straight back (Andrew, 2026-10-06; first flagged in the 07-19 QA). A
 * dismissal now covers one occurrence: (client, opportunity type, trigger
 * date), the key outreach_queue is unique on. Next month's idle check-in or
 * next year's anniversary is a new occurrence and can surface again.
 *
 * Applied before selection in both getTopOpportunities (Scan, so the slot
 * backfills) and detectAndDraftForUser (nightly drafts, so nothing gets
 * drafted for a card the agent dismissed). Shared so the two can't drift.
 *
 * dismissOpportunity / undismissOpportunity run in the browser with the
 * RLS-scoped client (00168 policies: own rows, own clients only).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface OpportunityKeyParts {
  client_id:        string;
  opportunity_type: string;
  trigger_date:     string;
}

export function opportunityKey(o: OpportunityKeyParts): string {
  return `${o.client_id}|${o.opportunity_type}|${o.trigger_date.slice(0, 10)}`;
}

export function withoutDismissed<T extends OpportunityKeyParts>(
  candidates: readonly T[],
  dismissals: readonly OpportunityKeyParts[],
): T[] {
  if (dismissals.length === 0) return [...candidates];
  const dismissed = new Set(dismissals.map(opportunityKey));
  return candidates.filter((c) => !dismissed.has(opportunityKey(c)));
}

const OCCURRENCE_CONFLICT = "user_id,client_id,opportunity_type,trigger_date";

/** Record a dismissal. Idempotent: dismissing twice is not an error. */
export async function dismissOpportunity(
  supabase: SupabaseClient,
  o:        OpportunityKeyParts,
): Promise<{ ok: boolean }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false };
  const { error } = await supabase.from("flight_control_dismissals").upsert(
    {
      user_id:          user.id,
      client_id:        o.client_id,
      opportunity_type: o.opportunity_type,
      trigger_date:     o.trigger_date.slice(0, 10),
    },
    { onConflict: OCCURRENCE_CONFLICT, ignoreDuplicates: true },
  );
  if (error) {
    console.error("[flight-control] dismissal save failed:", error.message);
    return { ok: false };
  }
  return { ok: true };
}

/** Undo a dismissal. */
export async function undismissOpportunity(
  supabase: SupabaseClient,
  o:        OpportunityKeyParts,
): Promise<{ ok: boolean }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false };
  const { error } = await supabase
    .from("flight_control_dismissals")
    .delete()
    .eq("user_id", user.id)
    .eq("client_id", o.client_id)
    .eq("opportunity_type", o.opportunity_type)
    .eq("trigger_date", o.trigger_date.slice(0, 10));
  if (error) {
    console.error("[flight-control] dismissal undo failed:", error.message);
    return { ok: false };
  }
  return { ok: true };
}
