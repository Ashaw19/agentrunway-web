import { createClient }   from "@/lib/supabase/server";
import { redirect }        from "next/navigation";
import { FlightControlContent } from "./flight-control-content";
import type { OutreachQueueItem, NewsletterQueue } from "@/lib/types/database";
import { lapsedPastClients } from "@/lib/crm/outreach-consent";


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

  const [sentCountRes, newslettersRes, closedDealsRes] = await Promise.all([
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
    // Closed deals of non-archived clients, for the newsletter Recipients
    // note: past clients whose CASL implied consent from a purchase has lapsed.
    supabase
      .from("client_records")
      .select("client_id, close_date, condition_status, clients!inner(name, archived_at)")
      .eq("user_id", user.id)
      .not("close_date", "is", null)
      .not("client_id", "is", null)
      .is("clients.archived_at", null),
  ]);

  if (closedDealsRes.error) {
    console.error("[flight-control] closed-deals fetch for the newsletter CASL note failed:", closedDealsRes.error.message);
  }
  const closedDeals = closedDealsRes.data ?? [];
  // Many-to-one embeds come back as an object; the untyped client types them
  // as an array. Read either (same idiom as lib/ai/tools.ts searchActivities).
  const nameById = new Map(closedDeals.map((d) => {
    const c = Array.isArray(d.clients) ? d.clients[0] : d.clients;
    return [d.client_id as string, (c?.name as string | null)?.trim() || "Unnamed client"];
  }));
  const lapsedPastClientNames = lapsedPastClients(closedDeals)
    .map((id) => nameById.get(id) ?? "Unnamed client")
    .sort((a, b) => a.localeCompare(b));

  return (
    <FlightControlContent
      initialQueue={(queue ?? []) as (OutreachQueueItem & { clients: { name: string; city: string | null; province_region: string | null; email: string | null } | null })[]}
      sentThisMonth={sentCountRes.count ?? 0}
      initialSignature={(settingsRow?.email_signature as string) ?? ""}
      initialVoiceGuide={(settingsRow?.ai_voice_guide as string | null) ?? ""}
      initialNewsletters={(newslettersRes.data ?? []) as NewsletterQueue[]}
      lapsedPastClientNames={lapsedPastClientNames}
    />
  );
}
