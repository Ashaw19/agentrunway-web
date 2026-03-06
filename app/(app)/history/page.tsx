import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { HistoryContent } from "./history-content";

export default async function HistoryPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [historyResult, txResult] = await Promise.all([
    supabase
      .from("history_items")
      .select("*")
      .eq("user_id", user.id)
      .order("year", { ascending: false }),
    supabase
      .from("transactions")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "closed")
      .order("date", { ascending: false }),
  ]);

  return (
    <HistoryContent
      historyItems={historyResult.data ?? []}
      transactions={txResult.data ?? []}
    />
  );
}
