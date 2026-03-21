import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { OverheadContent } from "./overhead-content";
import type { HistoryItem } from "@/lib/types/database";

export default async function OverheadPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const dashYear = new Date().getFullYear();

  const [
    txResult,
    settingsResult,
    expCatResult,
    expItemResult,
    receiptTotalsResult,
    mileageResult,
    ccaResult,
    historyResult,
    pipelineResult,
  ] = await Promise.all([
    supabase
      .from("transactions")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "closed")
      .gte("date", `${dashYear}-01-01`)
      .order("date", { ascending: false }),
    supabase
      .from("user_settings")
      .select("*")
      .eq("user_id", user.id)
      .single(),
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
      .from("receipt_expenses")
      .select("total_amount")
      .eq("user_id", user.id)
      .gte("expense_date", `${dashYear}-01-01`),
    supabase
      .from("mileage_logs")
      .select("km")
      .eq("user_id", user.id),
    supabase
      .from("t2125_cca_assets")
      .select("id")
      .eq("user_id", user.id),
    supabase
      .from("history_items")
      .select("*")
      .eq("user_id", user.id)
      .order("year", { ascending: false }),
    supabase
      .from("pipeline_deals")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
  ]);

  const expenseCategories = (expCatResult.data ?? []).map((cat) => ({
    ...cat,
    items: (expItemResult.data ?? []).filter((i) => i.category_id === cat.id),
  }));

  const receiptYTD = (receiptTotalsResult.data ?? []).reduce(
    (sum, r) => sum + Number(r.total_amount ?? 0),
    0,
  );

  const mileageKmTotal = (mileageResult.data ?? []).reduce(
    (sum, r) => sum + Number(r.km ?? 0),
    0,
  );

  const ccaAssetCount = (ccaResult.data ?? []).length;

  return (
    <OverheadContent
      transactions={txResult.data ?? []}
      settings={settingsResult.data}
      expenseCategories={expenseCategories}
      receiptYTD={receiptYTD}
      mileageKmTotal={mileageKmTotal}
      ccaAssetCount={ccaAssetCount}
      historyItems={(historyResult.data ?? []) as HistoryItem[]}
      pipelineDeals={pipelineResult.data ?? []}
      subscriptionTier={settingsResult.data?.subscription_tier ?? "starter"}
    />
  );
}
