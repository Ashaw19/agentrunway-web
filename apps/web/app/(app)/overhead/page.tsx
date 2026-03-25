import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { OverheadContent } from "./overhead-content";
import type { HistoryItem } from "@/lib/types/database";
import {
  isSandboxActive,
  getSandboxData,
  mergeSandboxSettings,
  getSandboxReceiptYTD,
  getSandboxMileageTotal,
} from "@/lib/sandbox-resolver";

export default async function OverheadPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // ── Fetch settings first (needed to check sandbox mode) ──
  const { data: rawSettings } = await supabase
    .from("user_settings")
    .select("*")
    .eq("user_id", user.id)
    .single();

  // ── Sandbox path ──
  if (isSandboxActive(rawSettings)) {
    const sb = getSandboxData(rawSettings);
    const settings = mergeSandboxSettings(rawSettings);

    return (
      <OverheadContent
        transactions={sb.transactions}
        settings={settings}
        expenseCategories={sb.expenseCategories}
        receiptYTD={getSandboxReceiptYTD(sb)}
        mileageKmTotal={getSandboxMileageTotal(sb)}
        ccaAssetCount={sb.ccaAssets.length}
        historyItems={sb.historyItems as HistoryItem[]}
        pipelineDeals={sb.pipelineDeals}
        subscriptionTier={settings.subscription_tier ?? "starter"}
      />
    );
  }

  // ── Normal Supabase path ──
  const dashYear = new Date().getFullYear();

  const [
    txResult,
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
      .order("date", { ascending: false })
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
      .from("receipt_expenses")
      .select("total_amount")
      .eq("user_id", user.id)
      .gte("expense_date", `${dashYear}-01-01`)
      .limit(10000),
    supabase
      .from("mileage_logs")
      .select("km")
      .eq("user_id", user.id)
      .limit(10000),
    supabase
      .from("t2125_cca_assets")
      .select("id")
      .eq("user_id", user.id)
      .limit(10000),
    supabase
      .from("history_items")
      .select("*")
      .eq("user_id", user.id)
      .order("year", { ascending: false })
      .limit(10000),
    supabase
      .from("pipeline_deals")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(10000),
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
      settings={rawSettings}
      expenseCategories={expenseCategories}
      receiptYTD={receiptYTD}
      mileageKmTotal={mileageKmTotal}
      ccaAssetCount={ccaAssetCount}
      historyItems={(historyResult.data ?? []) as HistoryItem[]}
      pipelineDeals={pipelineResult.data ?? []}
      subscriptionTier={rawSettings?.subscription_tier ?? "starter"}
    />
  );
}
