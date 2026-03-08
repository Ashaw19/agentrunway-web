import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ClientsContent } from "./clients-content";
import type { Client, ClientRecord } from "@/lib/types/database";

export default async function ClientsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Fetch master client identities + all deal records in parallel.
  // client_records with no client_id are pre-migration data — still shown,
  // grouped by name as a fallback in the component.
  const [clientsResult, recordsResult] = await Promise.all([
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
  ]);

  return (
    <ClientsContent
      clients={(clientsResult.data ?? []) as Client[]}
      records={(recordsResult.data ?? []) as ClientRecord[]}
    />
  );
}
