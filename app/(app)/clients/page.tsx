import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ClientsContent } from "./clients-content";
import type { ClientRecord } from "@/lib/types/database";

export default async function ClientsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: clients } = await supabase
    .from("client_records")
    .select("*")
    .eq("user_id", user.id)
    .order("year", { ascending: false })
    .order("name");

  return <ClientsContent clients={(clients ?? []) as ClientRecord[]} />;
}
