import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ForecastContent } from "./forecast-content";

export default async function ForecastPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const year = new Date().getFullYear();
  const [settingsResult, txResult, pipelineResult, expCatResult, expItemResult, historyResult, mileageResult, ccaResult, receiptTotalsResult] =
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
      // Mileage log for tax optimization engine
      supabase
        .from("mileage_logs")
        .select("km")
        .eq("user_id", user.id),
      // CCA assets count for tax optimization engine
      supabase
        .from("t2125_cca_assets")
        .select("id")
        .eq("user_id", user.id),
      // Current-year receipt totals for accurate YTD expense calculation
      supabase
        .from("receipt_expenses")
        .select("total_amount")
        .eq("user_id", user.id)
        .gte("expense_date", `${year}-01-01`),
    ]);

  const expenseCategories = (expCatResult.data ?? []).map((cat) => ({
    ...cat,
    items: (expItemResult.data ?? []).filter((i) => i.category_id === cat.id),
  }));

  // Sum current-year receipt totals for accurate expense YTD
  const receiptYTD = (receiptTotalsResult.data ?? []).reduce(
    (sum, r) => sum + Number(r.total_amount ?? 0),
    0,
  );

  // Sum mileage logs for tax optimization
  const mileageKmTotal = (mileageResult.data ?? []).reduce(
    (sum, r) => sum + Number(r.km ?? 0),
    0,
  );
  const ccaAssetCount = (ccaResult.data ?? []).length;

  return (
    <ForecastContent
      settings={settingsResult.data}
      transactions={txResult.data ?? []}
      pipelineDeals={pipelineResult.data ?? []}
      expenseCategories={expenseCategories}
      historyItems={historyResult.data ?? []}
      subscriptionTier={settingsResult.data?.subscription_tier ?? "starter"}
      receiptYTD={receiptYTD}
      mileageKmTotal={mileageKmTotal}
      ccaAssetCount={ccaAssetCount}
    />
  );
}
