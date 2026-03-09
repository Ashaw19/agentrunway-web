import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { HistoryContent } from "./history-content";
import { SPLIT_PRESET_AGENT_PCT, type SplitPreset } from "@/lib/types/database";

export default async function HistoryPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [historyResult, txResult, settingsResult] = await Promise.all([
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
    supabase
      .from("user_settings")
      .select("*")
      .eq("user_id", user.id)
      .single(),
  ]);

  // Convert the user's saved split preset (e.g. "p75_25") to a decimal (0.75),
  // or null if not set — null means the split selectors will show "Select split…"
  const settingsSplit: number | null = settingsResult.data?.split_preset
    ? (SPLIT_PRESET_AGENT_PCT[settingsResult.data.split_preset as SplitPreset] ?? null)
    : null;

  return (
    <HistoryContent
      historyItems={historyResult.data ?? []}
      transactions={txResult.data ?? []}
      settingsSplit={settingsSplit}
      settings={settingsResult.data ?? null}
    />
  );
}
