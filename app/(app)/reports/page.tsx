import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ReportsContent } from "./reports-content";
import type { CcaAsset } from "@/lib/types/database";

export default async function ReportsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const year = new Date().getFullYear();

  const [settingsResult, txResult, pipelineResult, expCatResult, expItemResult, historyResult, receiptTotalsResult, ccaAssetsResult] =
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
      // Current-year receipt totals per sub-category key
      supabase
        .from("receipt_expenses")
        .select("category_key, total_amount")
        .eq("user_id", user.id)
        .gte("expense_date", `${year}-01-01`),
      // CCA assets for the T2125 tab
      supabase
        .from("t2125_cca_assets")
        .select("*")
        .eq("user_id", user.id)
        .order("acquisition_date", { ascending: false }),
    ]);

  const categories = (expCatResult.data ?? []).map((cat) => ({
    ...cat,
    items: (expItemResult.data ?? []).filter((i) => i.category_id === cat.id),
  }));

  // Aggregate receipt totals per sub-category key for the current year
  const receiptTotalsByKey: Record<string, number> = {};
  for (const r of receiptTotalsResult.data ?? []) {
    if (r.category_key && r.total_amount != null) {
      receiptTotalsByKey[r.category_key] =
        (receiptTotalsByKey[r.category_key] ?? 0) + Number(r.total_amount);
    }
  }

  // Build expenseAmounts for T2125 tab: receipts YTD + projected recurring
  const now = new Date();
  const monthsElapsed   = now.getMonth() + (now.getDate() / 30);
  const monthsRemaining = Math.max(0, 12 - monthsElapsed);
  const expenseAmounts: Record<string, number> = { ...receiptTotalsByKey };
  for (const item of expItemResult.data ?? []) {
    if (item.monthly_recurring > 0) {
      expenseAmounts[item.key] =
        (expenseAmounts[item.key] ?? 0) + item.monthly_recurring * monthsRemaining;
    }
  }

  return (
    <ReportsContent
      settings={settingsResult.data}
      transactions={txResult.data ?? []}
      pipelineDeals={pipelineResult.data ?? []}
      expenseCategories={categories}
      subscriptionTier={settingsResult.data?.subscription_tier ?? "starter"}
      historyItems={historyResult.data ?? []}
      receiptTotalsByKey={receiptTotalsByKey}
      ccaAssets={(ccaAssetsResult.data ?? []) as CcaAsset[]}
      expenseAmounts={expenseAmounts}
      taxYear={year}
      userId={user.id}
    />
  );
}
