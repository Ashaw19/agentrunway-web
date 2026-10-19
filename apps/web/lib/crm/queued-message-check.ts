/**
 * Is a queued message still allowed to go out? Asked at the last moment:
 * the phone app asks before iOS Messages opens with a queued text
 * (/api/mobile/outreach/text-check), and the phone's email send asks before
 * sending. A draft written before the client unsubscribed, before their
 * implied consent lapsed, or before they were archived is refused with the
 * reason, and skipped so it leaves the queue (CASL consent ledger, 00183).
 *
 * Consent has to cover the message both today and on its send day (the
 * later of its trigger date and today). Fails closed: a consent record that
 * can't be read refuses the send.
 * Status: consentStatus() in packages/core, via lib/crm/consent-gate.ts.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { CONSENT_READ_FAILED, consentBlockReasonNowAndOnSendDay, readClientConsent } from "@/lib/crm/consent-gate";

export type QueuedMessageCheck =
  | { ok: true }
  | { ok: false; status: number; code: "NOT_FOUND" | "NOT_QUEUED" | "NO_CONSENT" | "CONSENT_UNREADABLE"; error: string };

export async function checkQueuedMessage(
  supabase:   SupabaseClient,
  userId:     string,
  outreachId: string,
  channel:    "email" | "sms",
): Promise<QueuedMessageCheck> {
  const { data: item, error } = await supabase
    .from("outreach_queue")
    .select("id, client_id, status, channel, trigger_date")
    .eq("id", outreachId)
    .eq("user_id", userId)
    .eq("channel", channel)
    .maybeSingle();
  if (error) {
    console.error("[queued-message-check] queue read failed:", error.message);
    return { ok: false, status: 503, code: "CONSENT_UNREADABLE", error: CONSENT_READ_FAILED };
  }
  if (!item) return { ok: false, status: 404, code: "NOT_FOUND", error: "This message isn't in your queue any more." };
  if (item.status !== "draft" && item.status !== "ready") {
    return { ok: false, status: 409, code: "NOT_QUEUED", error: item.status === "sent" ? "This was already sent." : "This was skipped." };
  }

  const skip = async () => {
    const { error: skipError } = await supabase
      .from("outreach_queue")
      .update({ status: "skipped" })
      .eq("id", item.id)
      .eq("user_id", userId)
      .in("status", ["draft", "ready"]);
    if (skipError) console.error("[queued-message-check] refused row not skipped:", skipError.message);
  };

  const { data: client, error: clientError } = item.client_id
    ? await supabase.from("clients").select("id, name, archived_at").eq("id", item.client_id).eq("user_id", userId).maybeSingle()
    : { data: null, error: null };
  if (clientError) {
    console.error("[queued-message-check] client read failed:", clientError.message);
    return { ok: false, status: 503, code: "CONSENT_UNREADABLE", error: CONSENT_READ_FAILED };
  }
  const name = ((client?.name as string | null) ?? "").trim() || "This client";
  if (!client) {
    await skip();
    return { ok: false, status: 403, code: "NO_CONSENT", error: "This client is no longer in your CRM, so the message can't go out." };
  }
  if (client.archived_at) {
    await skip();
    return { ok: false, status: 403, code: "NO_CONSENT", error: `${name} is archived (in the Hangar), so the message can't go out.` };
  }

  const consent = await readClientConsent(supabase, userId, client.id as string);
  if (!consent.ok) {
    return { ok: false, status: 503, code: "CONSENT_UNREADABLE", error: consent.reason };
  }
  // Refused if consent doesn't cover it today OR on its send day.
  const blocked = consentBlockReasonNowAndOnSendDay(consent.inputs, channel, item.trigger_date as string, name);
  if (blocked) {
    await skip();
    return { ok: false, status: 403, code: "NO_CONSENT", error: blocked };
  }
  return { ok: true };
}
