import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ReportsContent } from "./reports-content";
import type { CcaAsset } from "@/lib/types/database";
import {
  isSandboxActive,
  getSandboxData,
  mergeSandboxSettings,
  getSandboxReceiptTotalsByKey,
} from "@/lib/sandbox-resolver";

export default async function ReportsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const year = new Date().getFullYear();

  // Always fetch settings first (needed to check sandbox mode)
  const { data: settingsRaw } = await supabase
    .from("user_settings")
    .select("*")
    .eq("user_id", user.id)
    .single();

  if (isSandboxActive(settingsRaw)) {
    // ── Sandbox branch ──────────────────────────────────────────────────
    const sb = getSandboxData(settingsRaw);
    const settings = mergeSandboxSettings(settingsRaw);

    const categories = sb.expenseCategories; // already have items mapped
    const receiptTotalsByKey = getSandboxReceiptTotalsByKey(sb);

    // Build expenseAmounts: receipts YTD + recurring for completed months
    const now = new Date();
    const completedMonths = now.getMonth();
    const expenseAmounts: Record<string, number> = { ...receiptTotalsByKey };
    const allItems = sb.expenseCategories.flatMap((cat) => cat.items);
    for (const item of allItems) {
      if (item.monthly_recurring > 0 && completedMonths > 0) {
        expenseAmounts[item.key] =
          (expenseAmounts[item.key] ?? 0) + item.monthly_recurring * completedMonths;
      }
    }

    return (
      <ReportsContent
        settings={settings}
        transactions={sb.transactions}
        pipelineDeals={sb.pipelineDeals}
        expenseCategories={categories}
        subscriptionTier={settings.subscription_tier ?? "starter"}
        historyItems={sb.historyItems}
        receiptTotalsByKey={receiptTotalsByKey}
        ccaAssets={(sb.ccaAssets ?? []) as CcaAsset[]}
        expenseAmounts={expenseAmounts}
        taxYear={year}
        userId={user.id}
      />
    );
  }

  // ── Normal branch ───────────────────────────────────────────────────
  const [txResult, pipelineResult, expCatResult, expItemResult, historyResult, receiptTotalsResult, ccaAssetsResult] =
    await Promise.all([
      supabase
        .from("transactions")
        .select("*")
        .eq("user_id", user.id)
        .eq("status", "closed")
        .order("date", { ascending: false })
        .limit(10000),
      supabase
        .from("pipeline_deals")
        .select("*")
        .eq("user_id", user.id)
        .limit(10000),
      supabase
        .from("expense_categories")
        .select("*")
        .eq("user_id", user.id)
        .order("sort_order")
        .limit(10000),
      supabase
        .from("expense_items")
        .select("*")
        .eq("user_id", user.id)
        .limit(10000),
      supabase
        .from("history_items")
        .select("*")
        .eq("user_id", user.id)
        .order("year", { ascending: false })
        .limit(10000),
      // Current-year receipt totals per sub-category key
      supabase
        .from("receipt_expenses")
        .select("category_key, total_amount")
        .eq("user_id", user.id)
        .gte("expense_date", `${year}-01-01`)
        .limit(10000),
      // CCA assets for the T2125 tab
      supabase
        .from("t2125_cca_assets")
        .select("*")
        .eq("user_id", user.id)
        .order("acquisition_date", { ascending: false })
        .limit(10000),
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

  // Build expenseAmounts for T2125 tab: receipts YTD + recurring for completed months only.
  // T2125 is a tax form — only include expenses actually incurred (not projected future months).
  // completedMonths = number of fully elapsed months before the current month (e.g. March → 2).
  const now = new Date();
  const completedMonths = now.getMonth(); // 0-based: Jan=0 → 0 completed, Mar=2 → 2 completed
  const expenseAmounts: Record<string, number> = { ...receiptTotalsByKey };
  for (const item of expItemResult.data ?? []) {
    if (item.monthly_recurring > 0 && completedMonths > 0) {
      expenseAmounts[item.key] =
        (expenseAmounts[item.key] ?? 0) + item.monthly_recurring * completedMonths;
    }
  }

  return (
    <ReportsContent
      settings={settingsRaw}
      transactions={txResult.data ?? []}
      pipelineDeals={pipelineResult.data ?? []}
      expenseCategories={categories}
      subscriptionTier={settingsRaw?.subscription_tier ?? "starter"}
      historyItems={historyResult.data ?? []}
      receiptTotalsByKey={receiptTotalsByKey}
      ccaAssets={(ccaAssetsResult.data ?? []) as CcaAsset[]}
      expenseAmounts={expenseAmounts}
      taxYear={year}
      userId={user.id}
    />
  );
}
