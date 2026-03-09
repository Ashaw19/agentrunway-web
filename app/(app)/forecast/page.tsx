import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ForecastContent } from "./forecast-content";

export default async function ForecastPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [settingsResult, txResult, pipelineResult, expCatResult, expItemResult, historyResult] =
    await Promise.all([
      supabase
        .from("user_settings")
        .select("*")
        .eq("user_id", user.id)
        .single(),
      supabase
        .from("transactions")
        .select("*")
        .eq("user_id", user.id)
        .eq("status", "closed")
        .order("date", { ascending: false }),
      supabase
        .from("pipeline_deals")
        .select("*")
        .eq("user_id", user.id),
      supabase
        .from("expense_categories")
        .select("*")
        .eq("user_id", user.id)
        .order("sort_order"),
      supabase
        .from("expense_items")
        .select("*")
        .eq("user_id", user.id),
      supabase
        .from("history_items")
        .select("*")
        .eq("user_id", user.id)
        .order("year", { ascending: false }),
    ]);

  const expenseCategories = (expCatResult.data ?? []).map((cat) => ({
    ...cat,
    items: (expItemResult.data ?? []).filter((i) => i.category_id === cat.id),
  }));

  return (
    <ForecastContent
      settings={settingsResult.data}
      transactions={txResult.data ?? []}
      pipelineDeals={pipelineResult.data ?? []}
      expenseCategories={expenseCategories}
      historyItems={historyResult.data ?? []}
      subscriptionTier={settingsResult.data?.subscription_tier ?? "starter"}
    />
  );
}
