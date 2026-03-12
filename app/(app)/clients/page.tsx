import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ClientsContent } from "./clients-content";
import type { Client, ClientRecord, ContactActivity, ContactTask } from "@/lib/types/database";

export default async function ClientsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [clientsResult, recordsResult, activitiesResult, tasksResult] = await Promise.all([
    supabase
      .from("clients")
      .select("*")
      .eq("user_id", user.id)
      .order("name"),
    supabase
      .from("client_records")
      .select("*")
      .eq("user_id", user.id)
      .order("year", { ascending: false })
      .order("name"),
    // Last 200 activities across all clients (for the activity feed)
    supabase
      .from("contact_activities")
      .select("*")
      .eq("user_id", user.id)
      .order("activity_date", { ascending: false })
      .limit(200),
    // All open tasks (not completed) for task panel + dashboard
    supabase
      .from("contact_tasks")
      .select("*")
      .eq("user_id", user.id)
      .is("completed_at", null)
      .order("due_date", { ascending: true }),
  ]);

  return (
    <ClientsContent
      clients={(clientsResult.data ?? []) as Client[]}
      records={(recordsResult.data ?? []) as ClientRecord[]}
      activities={(activitiesResult.data ?? []) as ContactActivity[]}
      tasks={(tasksResult.data ?? []) as ContactTask[]}
    />
  );
}
