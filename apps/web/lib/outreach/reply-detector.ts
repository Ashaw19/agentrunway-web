/**
 * Reply Detector
 *
 * When an inbound email lands, we want to know:
 *   1. Which contact in our CRM sent it?
 *   2. Is it a reply to a specific outreach we sent recently?
 *
 * Today's heuristic (beta):
 *   - Primary: match inbound `from_address` → `clients.email` for this user
 *   - Secondary: if client matches, find the most recent `status='sent'` row
 *     in outreach_queue to that client within the last 60 days. That's the
 *     outreach we assume they're replying to.
 *
 * Future (when outreach_queue tracks provider Message-IDs):
 *   - Walk inbound `in_reply_to` + `references` headers and match directly
 *     against the Message-ID of the sent outreach.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ParsedInboundEmail } from "@/lib/email/inbound-types";

export interface ReplyMatch {
  /** The CRM client this email came from, if we found one. */
  clientId: string | null;
  /** The outreach_queue row this is a reply to, if any. */
  outreachId: string | null;
}

/** Lookback window for matching inbound replies to sent outreach. */
const OUTREACH_MATCH_LOOKBACK_DAYS = 60;

/**
 * Match an inbound email to a client + outreach thread for the given user.
 * Returns `{ clientId: null, outreachId: null }` if no match.
 */
export async function matchInboundToOutreach(
  supabase: SupabaseClient,
  userId: string,
  inbound: ParsedInboundEmail,
): Promise<ReplyMatch> {
  const fromEmail = inbound.fromAddress.toLowerCase().trim();
  if (!fromEmail) return { clientId: null, outreachId: null };

  // 1. Find the client by email (case-insensitive, exact match).
  //    If multiple clients share an email, pick the most recently updated.
  const { data: clientRow } = await supabase
    .from("clients")
    .select("id")
    .eq("user_id", userId)
    .ilike("email", fromEmail)
    .order("updated_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (!clientRow?.id) {
    return { clientId: null, outreachId: null };
  }

  const clientId = clientRow.id as string;

  // 2. Find the most recent sent outreach to this client within the lookback window.
  const lookbackDate = new Date(
    Date.now() - OUTREACH_MATCH_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { data: outreachRow } = await supabase
    .from("outreach_queue")
    .select("id")
    .eq("user_id", userId)
    .eq("client_id", clientId)
    .eq("status", "sent")
    .gte("sent_at", lookbackDate)
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    clientId,
    outreachId: outreachRow?.id ?? null,
  };
}

/**
 * Pause any active nurture sequences for a client — called when they reply
 * to a sent outreach so we don't keep drip-sending while they're engaged.
 *
 * Returns the number of sequences that were paused.
 */
export async function pauseActiveNurtureForClient(
  supabase: SupabaseClient,
  userId: string,
  clientId: string,
): Promise<number> {
  const { data, error } = await supabase
    .from("nurture_sequences")
    .update({
      status: "paused",
      paused_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("client_id", clientId)
    .eq("status", "active")
    .select("id");

  if (error) {
    console.error("[reply-detector] failed to pause nurture sequences", {
      userId,
      clientId,
      error: error.message,
    });
    return 0;
  }

  return data?.length ?? 0;
}

/**
 * Log the inbound reply as a contact activity — this is what feeds the
 * engagement engine (reply = +15 points, 30-day half-life) and updates
 * `clients.last_contact` via the existing trigger.
 */
export async function logReplyActivity(
  supabase: SupabaseClient,
  userId: string,
  clientId: string,
  subject: string | null,
): Promise<void> {
  const description = subject
    ? `Replied: ${subject.slice(0, 200)}`
    : "Inbound email reply";

  const { error } = await supabase.from("contact_activities").insert({
    user_id: userId,
    client_id: clientId,
    type: "reply",
    description,
    activity_date: new Date().toISOString(),
  });

  if (error) {
    console.error("[reply-detector] failed to log reply activity", {
      userId,
      clientId,
      error: error.message,
    });
  }
}
