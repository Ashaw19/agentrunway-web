import { createClient }   from "@/lib/supabase/server";
import { redirect }        from "next/navigation";
import { FlightControlContent } from "./flight-control-content";
import type { OutreachQueueItem, NewsletterQueue } from "@/lib/types/database";
import {
  isSandboxActive,
  getSandboxData,
  mergeSandboxSettings,
  getSandboxOutreachWithClients,
} from "@/lib/sandbox-resolver";

export const dynamic = "force-dynamic";

export default async function FlightControlPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // ── 1. Fetch user_settings first (needed for sandbox check) ──
  const { data: settingsRow } = await supabase
    .from("user_settings")
    .select("*")
    .eq("user_id", user.id)
    .single();

  // ── 2. Sandbox branch ──
  if (isSandboxActive(settingsRow)) {
    const sb      = getSandboxData(settingsRow);
    const merged  = mergeSandboxSettings(settingsRow);

    const initialQueue = getSandboxOutreachWithClients(sb).filter(
      (q) => q.status === "draft" || q.status === "ready",
    );
    const sentThisMonth    = 0; // sandbox has no sent items
    const initialSignature  = (merged.email_signature as string) ?? "";
    const initialVoiceGuide = (merged.ai_voice_guide as string | null) ?? "";
    const initialNewsletters = (sb.newsletterQueue ?? []) as NewsletterQueue[];
    const gmailConnected    = false; // sandbox doesn't connect to real gmail
    const gmailEmail        = null;

    return (
      <FlightControlContent
        initialQueue={initialQueue as (OutreachQueueItem & { clients: { name: string; city: string | null; province_region: string | null; email: string | null } | null })[]}
        sentThisMonth={sentThisMonth}
        initialSignature={initialSignature}
        initialVoiceGuide={initialVoiceGuide}
        initialNewsletters={initialNewsletters}
        gmailConnected={gmailConnected}
        gmailEmail={gmailEmail}
      />
    );
  }

  // ── 3. Normal (live) queries ──

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

  const [sentCountRes, newslettersRes, googleConnRes] = await Promise.all([
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
    supabase
      .from("google_connections")
      .select("id, email_address, gmail_send_enabled")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  const gmailConnected = !!(googleConnRes.data?.gmail_send_enabled);
  const gmailEmail     = googleConnRes.data?.email_address ?? null;

  return (
    <FlightControlContent
      initialQueue={(queue ?? []) as (OutreachQueueItem & { clients: { name: string; city: string | null; province_region: string | null; email: string | null } | null })[]}
      sentThisMonth={sentCountRes.count ?? 0}
      initialSignature={(settingsRow?.email_signature as string) ?? ""}
      initialVoiceGuide={(settingsRow?.ai_voice_guide as string | null) ?? ""}
      initialNewsletters={(newslettersRes.data ?? []) as NewsletterQueue[]}
      gmailConnected={gmailConnected}
      gmailEmail={gmailEmail}
    />
  );
}
