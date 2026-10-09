import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import type { ContactTask } from "@/lib/types/database";
import { ChecklistContent, type ChecklistClient } from "./checklist-content";

export const dynamic = "force-dynamic";

export default async function ChecklistPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // 8 days back covers "Done this week" from any day; the client trims to Monday.
  const since = new Date(Date.now() - 8 * 86_400_000).toISOString();

  const [openRes, doneRes, clientsRes] = await Promise.all([
    supabase
      .from("contact_tasks")
      .select("*")
      .eq("user_id", user.id)
      .is("completed_at", null)
      .order("due_date", { ascending: true })
      .limit(500),
    supabase
      .from("contact_tasks")
      .select("*")
      .eq("user_id", user.id)
      .not("completed_at", "is", null)
      .gte("completed_at", since)
      .order("completed_at", { ascending: false })
      .limit(200),
    supabase
      .from("clients")
      .select("id, name, archived_at")
      .eq("user_id", user.id)
      .order("name", { ascending: true })
      .limit(5000),
  ]);

  for (const [label, res] of [["open", openRes], ["done", doneRes], ["clients", clientsRes]] as const) {
    if (res.error) console.error(`[checklist] ${label} fetch failed:`, res.error.code ?? "", res.error.message);
  }

  return (
    <ChecklistContent
      initialItems={[...(openRes.data ?? []), ...(doneRes.data ?? [])] as ContactTask[]}
      clients={(clientsRes.data ?? []) as ChecklistClient[]}
      loadFailed={Boolean(openRes.error || doneRes.error)}
    />
  );
}
