import { createClient }   from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { redirect }        from "next/navigation";
import { FlightControlContent } from "./flight-control-content";
import type { OutreachQueueItem, NewsletterQueue } from "@/lib/types/database";
import { consentInputsFor, emailBlockedClients, fetchConsentLedger } from "@/lib/crm/outreach-consent";
import { consentBlockReasonNowAndOnSendDay } from "@/lib/crm/consent-gate";
import { atlanticDayStart, atlanticISODate } from "@agent-runway/core/lib/local-date";
import type { ConsentLedgerRow } from "@agent-runway/core/types/database";


export const dynamic = "force-dynamic";

export default async function FlightControlPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // ── 1. Fetch user_settings ──
  const { data: settingsRow } = await supabase
    .from("user_settings")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  // ── 2. Live queries ──

  // Load pending (draft / ready) queue items with joined client name + email
  const { data: queue } = await supabase
    .from("outreach_queue")
    .select("*, clients(name, city, province_region, email)")
    .eq("user_id", user.id)
    .eq("channel", "email") // texts (00179) are sent from the phone app
    .in("status", ["draft", "ready"])
    .order("trigger_date", { ascending: true });

  // Count messages sent this month for the stats strip
  // Atlantic month, not the server's UTC clock (local-date.ts). sent_at is a
  // timestamp, so the bound is the instant the month begins in Atlantic
  // time: a bare `2026-10-01` is read as 9 pm on Sep 30.
  const monthStart = atlanticDayStart(`${atlanticISODate().slice(0, 7)}-01`).toISOString();

  const [sentCountRes, newslettersRes, closedDealsRes, coPartiesRes, checklistRes] = await Promise.all([
    supabase
      .from("outreach_queue")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "sent")
      .gte("sent_at", monthStart),
    supabase
      .from("newsletter_queue")
      .select("*")
      .eq("user_id", user.id)
      .in("status", ["draft", "ready"])
      .order("created_at", { ascending: false })
      .limit(10000),
    // For the newsletter Recipients note: past clients (and co-buyers on a
    // couple's deal) whose CASL implied consent from a purchase has lapsed.
    // All deals, not just those of non-archived holders: a co-buyer's shared
    // deal still counts when the spouse holding it is archived.
    // In pages: one request stops at 1,000 rows.
    fetchAllRows<{ id: string; client_id: string | null; close_date: string | null; condition_status: string | null }>((from, to) =>
      supabase
        .from("client_records")
        .select("id, client_id, close_date, condition_status")
        .eq("user_id", user.id)
        .not("close_date", "is", null)
        .not("client_id", "is", null)
        .order("id")
        .range(from, to)),
    fetchAllRows<{ client_record_id: string; co_client_id: string }>((from, to) =>
      supabase
        .from("client_record_co_parties")
        .select("id, client_record_id, co_client_id")
        .eq("user_id", user.id)
        .order("id")
        .range(from, to)),
    // Clients already on the Checklist: their cards read "On checklist".
    fetchAllRows<{ client_id: string | null }>((from, to) =>
      supabase
        .from("contact_tasks")
        .select("id, client_id")
        .eq("user_id", user.id)
        .is("completed_at", null)
        .not("client_id", "is", null)
        .order("id")
        .range(from, to)),
  ]);
  if (checklistRes.error) {
    console.error("[flight-control] checklist fetch failed:", checklistRes.error.message);
  }

  if (closedDealsRes.error || coPartiesRes.error) {
    console.error(
      "[flight-control] deal fetch for the CASL consent check failed:",
      closedDealsRes.error?.message ?? coPartiesRes.error?.message,
    );
  }

  // ── CASL consent (core consentStatus) ──
  // The newsletter Recipients note lists who email consent doesn't cover
  // today (lapsed past clients, unsubscribed clients), and a queued draft
  // whose client it no longer covers can't be copied or marked sent.
  // Archived clients get no newsletter and aren't checked. Deals are all
  // deals: a co-buyer's shared deal still counts when the spouse holding it
  // is archived.
  const { data: activeClients, error: activeClientsError } = await fetchAllRows<{ id: string; name: string | null; email_opt_out_at: string | null; sms_opt_out_at: string | null }>((from, to) =>
    supabase
      .from("clients")
      .select("id, name, email_opt_out_at, sms_opt_out_at")
      .eq("user_id", user.id)
      .is("archived_at", null)
      .order("id")
      .range(from, to));
  if (activeClientsError) console.error("[flight-control] client consent fetch failed:", activeClientsError.message);
  let ledger: ConsentLedgerRow[] | null = null;
  try {
    ledger = await fetchConsentLedger(supabase, user.id);
  } catch (err) {
    console.error("[flight-control] consent ledger read failed:", err instanceof Error ? err.message : err);
  }
  const consentReadable = !activeClientsError && ledger !== null && !closedDealsRes.error && !coPartiesRes.error;
  const consentInputs = consentInputsFor(activeClients ?? [], closedDealsRes.data ?? [], coPartiesRes.data ?? [], ledger ?? []);
  const nameOf = new Map((activeClients ?? []).map((c) => [c.id, c.name?.trim() || "Unnamed client"]));
  const blocked = emailBlockedClients(consentInputs);
  const lapsedPastClientNames = blocked.lapsed.map((id) => nameOf.get(id) ?? "Unnamed client").sort((a, b) => a.localeCompare(b));
  const optedOutClientNames = blocked.optedOut.map((id) => nameOf.get(id) ?? "Unnamed client").sort((a, b) => a.localeCompare(b));

  // Fails closed: a draft whose client is archived (the Hangar, which is
  // where a do-not-contact client goes) or gone can't be copied or sent.
  const queueItems = (queue ?? []) as { id: string; client_id: string | null; trigger_date: string; clients?: { name?: string | null } | null }[];
  const consentBlockedQueue: Record<string, string> = {};
  for (const item of queueItems) {
    const name = item.clients?.name?.trim() || (item.client_id ? nameOf.get(item.client_id) : null) || "This client";
    if (!consentReadable) {
      consentBlockedQueue[item.id] = "Agent Runway couldn't read consent records just now. Reload before sending this.";
      continue;
    }
    const inputs = item.client_id ? consentInputs.get(item.client_id) : undefined;
    if (!inputs) {
      consentBlockedQueue[item.id] = item.clients
        ? `${name} is archived (in the Hangar), so this draft can't be sent. Restore them first if that's a mistake.`
        : "This client is no longer in your CRM, so this draft can't be sent.";
      continue;
    }
    // Today and on its send day: either refusing makes it not sendable.
    const reason = consentBlockReasonNowAndOnSendDay(inputs, "email", item.trigger_date, name);
    if (reason) consentBlockedQueue[item.id] = reason;
  }

  return (
    <FlightControlContent
      initialQueue={(queue ?? []) as (OutreachQueueItem & { clients: { name: string; city: string | null; province_region: string | null; email: string | null } | null })[]}
      sentThisMonth={sentCountRes.count ?? 0}
      initialSignature={(settingsRow?.email_signature as string) ?? ""}
      initialVoiceGuide={(settingsRow?.ai_voice_guide as string | null) ?? ""}
      initialNewsletters={(newslettersRes.data ?? []) as NewsletterQueue[]}
      lapsedPastClientNames={lapsedPastClientNames}
      optedOutClientNames={optedOutClientNames}
      consentBlockedQueue={consentBlockedQueue}
      initialMailingAddress={(settingsRow?.mailing_address as string | null) ?? ""}
      checklistClientIds={[...new Set((checklistRes.data ?? []).map((r) => r.client_id as string))]}
    />
  );
}
