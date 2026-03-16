import { createClient }   from "@/lib/supabase/server";
import { redirect }        from "next/navigation";
import { FlightControlContent } from "./flight-control-content";
import type { OutreachQueueItem } from "@/lib/types/database";

export const dynamic = "force-dynamic";

export default async function FlightControlPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

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
  const { count: sentThisMonth } = await supabase
    .from("outreach_queue")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("status", "sent")
    .gte("sent_at", monthStart);

  return (
    <FlightControlContent
      initialQueue={(queue ?? []) as (OutreachQueueItem & { clients: { name: string; city: string | null; province_region: string | null; email: string | null } | null })[]}
      sentThisMonth={sentThisMonth ?? 0}
    />
  );
}
