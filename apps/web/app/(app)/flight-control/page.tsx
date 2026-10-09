import { createClient }   from "@/lib/supabase/server";
import { redirect }        from "next/navigation";
import { FlightControlContent } from "./flight-control-content";
import type { OutreachQueueItem, NewsletterQueue } from "@/lib/types/database";
import { lapsedPastClients, withCoBuyerDeals } from "@/lib/crm/outreach-consent";


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
    .in("status", ["draft", "ready"])
    .order("trigger_date", { ascending: true });

  // Count messages sent this month for the stats strip
  const now        = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

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
    supabase
      .from("client_records")
      .select("id, client_id, close_date, condition_status")
      .eq("user_id", user.id)
      .not("close_date", "is", null)
      .not("client_id", "is", null),
    supabase
      .from("client_record_co_parties")
      .select("client_record_id, co_client_id")
      .eq("user_id", user.id),
    // Clients already on the Checklist: their cards read "On checklist".
    supabase
      .from("contact_tasks")
      .select("client_id")
      .eq("user_id", user.id)
      .is("completed_at", null)
      .not("client_id", "is", null)
      .limit(1000),
  ]);
  if (checklistRes.error) {
    console.error("[flight-control] checklist fetch failed:", checklistRes.error.message);
  }

  if (closedDealsRes.error || coPartiesRes.error) {
    console.error(
      "[flight-control] deal fetch for the newsletter CASL note failed:",
      closedDealsRes.error?.message ?? coPartiesRes.error?.message,
    );
  }
  const lapsedIds = lapsedPastClients(withCoBuyerDeals(closedDealsRes.data ?? [], coPartiesRes.data ?? []));

  // Names for the note, archived clients excluded (they get no newsletter).
  const { data: lapsedClients, error: lapsedClientsError } = lapsedIds.length > 0
    ? await supabase
        .from("clients")
        .select("id, name")
        .eq("user_id", user.id)
        .in("id", lapsedIds)
        .is("archived_at", null)
    : { data: [], error: null };
  if (lapsedClientsError) {
    console.error("[flight-control] lapsed-client names fetch failed:", lapsedClientsError.message);
  }
  const lapsedPastClientNames = (lapsedClients ?? [])
    .map((c) => (c.name as string | null)?.trim() || "Unnamed client")
    .sort((a, b) => a.localeCompare(b));

  return (
    <FlightControlContent
      initialQueue={(queue ?? []) as (OutreachQueueItem & { clients: { name: string; city: string | null; province_region: string | null; email: string | null } | null })[]}
      sentThisMonth={sentCountRes.count ?? 0}
      initialSignature={(settingsRow?.email_signature as string) ?? ""}
      initialVoiceGuide={(settingsRow?.ai_voice_guide as string | null) ?? ""}
      initialNewsletters={(newslettersRes.data ?? []) as NewsletterQueue[]}
      lapsedPastClientNames={lapsedPastClientNames}
      checklistClientIds={[...new Set((checklistRes.data ?? []).map((r) => r.client_id as string))]}
    />
  );
}
