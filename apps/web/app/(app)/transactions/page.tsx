import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { TransactionsContent } from "./transactions-content";
import { SPLIT_PRESET_AGENT_PCT, type SplitPreset, type SandboxDataset } from "@/lib/types/database";
import { isSandboxActive, getSandboxData, mergeSandboxSettings } from "@/lib/sandbox-resolver";

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Fetch settings first (needed to check sandbox mode)
  const { data: settingsRaw } = await supabase
    .from("user_settings")
    .select("*")
    .eq("user_id", user.id)
    .single();

  if (isSandboxActive(settingsRaw)) {
    const sb: SandboxDataset = getSandboxData(settingsRaw);
    const settings = mergeSandboxSettings(settingsRaw);

    const settingsSplit: number | null = settings?.split_preset
      ? (SPLIT_PRESET_AGENT_PCT[settings.split_preset as SplitPreset] ?? null)
      : null;

    return (
      <TransactionsContent
        initialTransactions={sb.transactions ?? []}
        initialPipelineDeals={sb.pipelineDeals ?? []}
        historyItems={sb.historyItems ?? []}
        settingsSplit={settingsSplit}
        settings={settings ?? null}
        initialTab={params?.tab ?? "deals"}
      />
    );
  }

  const [
    { data: transactions },
    { data: pipelineDeals },
    { data: historyItems },
  ] = await Promise.all([
    supabase
      .from("transactions")
      .select("*")
      .eq("user_id", user.id)
      .order("date", { ascending: false })
      .limit(10000),
    supabase
      .from("pipeline_deals")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(10000),
    supabase
      .from("history_items")
      .select("*")
      .eq("user_id", user.id)
      .order("year", { ascending: false })
      .limit(10000),
  ]);

  // Convert the user's saved split preset (e.g. "p75_25") to a decimal (0.75)
  const settingsSplit: number | null = settingsRaw?.split_preset
    ? (SPLIT_PRESET_AGENT_PCT[settingsRaw.split_preset as SplitPreset] ?? null)
    : null;

  return (
    <TransactionsContent
      initialTransactions={transactions ?? []}
      initialPipelineDeals={pipelineDeals ?? []}
      historyItems={historyItems ?? []}
      settingsSplit={settingsSplit}
      settings={settingsRaw ?? null}
      initialTab={params?.tab ?? "deals"}
    />
  );
}
