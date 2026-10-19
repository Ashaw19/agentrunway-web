/**
 * Persisted Flight Control dismissals (flight_control_dismissals, 00168, 00188).
 *
 * Dismiss used to live in React state, so a refresh brought the card
 * straight back (Andrew, 2026-10-06; first flagged in the 07-19 QA). A
 * dismissal now covers one occurrence: (client, opportunity type, trigger
 * date), the key outreach_queue is unique on. Next month's idle check-in or
 * next year's anniversary is a new occurrence and can surface again. Later
 * and Stop (00188) hold the client instead, whatever the reason.
 *
 * Applied before selection in both getTopOpportunities (Scan, so the slot
 * backfills) and detectAndDraftForUser (nightly drafts, so nothing gets
 * drafted for a card the agent dismissed). Shared so the two can't drift.
 *
 * The browser helpers below run with the RLS-scoped client (00168 policies:
 * own rows, own clients only). They find the signed-in user and call the
 * writers in core (lib/record-writers.ts), the same ones the phone and
 * Flight Crew use, so a skip made anywhere is the same row.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { atlanticISODate } from "@agent-runway/core/lib/local-date";
import {
  removeSuggestionSkipByKey,
  resumeSuggestions,
  writeSuggestionHold,
  writeSuggestionSkip,
  type HoldOutcome,
  type SuggestionHoldArgs,
  type WriteOutcome,
} from "@agent-runway/core/lib/record-writers";
import type { OpportunityKeyParts } from "@agent-runway/core/lib/suggestion-dismissals";

// The key and the skip filter live in core (suggestion-dismissals) so web,
// the phone, the nightly drafts and MCP share one rule.
export { opportunityKey, withoutDismissed } from "@agent-runway/core/lib/suggestion-dismissals";
export type { OpportunityKeyParts } from "@agent-runway/core/lib/suggestion-dismissals";

const SIGNED_OUT: WriteOutcome = { ok: false, message: "Sign in again to do that." };

async function signedInUserId(supabase: SupabaseClient): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

/** Record a dismissal. Idempotent: dismissing twice is not an error. */
export async function dismissOpportunity(
  supabase: SupabaseClient,
  o:        OpportunityKeyParts,
): Promise<{ ok: boolean }> {
  const userId = await signedInUserId(supabase);
  if (!userId) return { ok: false };
  const out = await writeSuggestionSkip(supabase, userId, o);
  if (!out.ok) console.error("[flight-control] dismissal save failed:", out.message);
  return { ok: out.ok };
}

/** Undo a dismissal. */
export async function undismissOpportunity(
  supabase: SupabaseClient,
  o:        OpportunityKeyParts,
): Promise<{ ok: boolean }> {
  const userId = await signedInUserId(supabase);
  if (!userId) return { ok: false };
  const out = await removeSuggestionSkipByKey(supabase, userId, o);
  if (!out.ok) console.error("[flight-control] dismissal undo failed:", out.message);
  return { ok: out.ok };
}

/**
 * Later or Stop: hold the client's suggestions until `args.until`.
 * `ok` with `alreadySaved` and `stoppedUntil` means nothing was written: a
 * Stop is still running, so show that and don't offer Undo (resumeSuggestion
 * would delete the Stop).
 */
export async function holdSuggestion(
  supabase: SupabaseClient,
  args:     SuggestionHoldArgs,
): Promise<HoldOutcome> {
  const userId = await signedInUserId(supabase);
  if (!userId) return SIGNED_OUT;
  const now = new Date();
  const out = await writeSuggestionHold(supabase, userId, args, atlanticISODate(now), now);
  if (!out.ok) console.error("[flight-control] hold save failed:", out.message);
  return out;
}

/** Undo a Later or Stop: the client can be suggested again. */
export async function resumeSuggestion(
  supabase: SupabaseClient,
  clientId: string,
): Promise<WriteOutcome> {
  const userId = await signedInUserId(supabase);
  if (!userId) return SIGNED_OUT;
  const out = await resumeSuggestions(supabase, userId, clientId);
  if (!out.ok) console.error("[flight-control] hold undo failed:", out.message);
  return out;
}
