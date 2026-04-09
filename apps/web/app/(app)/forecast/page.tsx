import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ForecastContent } from "./forecast-content";
import {
  isSandboxActive,
  getSandboxData,
  mergeSandboxSettings,
  getSandboxReceiptYTD,
  getSandboxMileageTotal,
} from "@/lib/sandbox-resolver";

export default async function ForecastPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Always fetch settings first to check sandbox mode
  const settingsResult = await supabase
    .from("user_settings")
    .select("*")
    .eq("user_id", user.id)
    .single();

  const rawSettings = settingsResult.data;

  if (isSandboxActive(rawSettings)) {
    // ── Sandbox path ──────────────────────────────────────────────
    const sb = getSandboxData(rawSettings);
    const settings = mergeSandboxSettings(rawSettings);

    const transactions = sb.transactions
      .filter((t) => t.status === "closed")
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const expenseCategories = sb.expenseCategories;
    const receiptYTD = getSandboxReceiptYTD(sb);
    const mileageKmTotal = getSandboxMileageTotal(sb);
    const ccaAssetCount = sb.ccaAssets.length;

    return (
      <ForecastContent
        settings={settings}
        transactions={transactions}
        pipelineDeals={sb.pipelineDeals}
        listingAppointments={sb.listingAppointments}
        expenseCategories={expenseCategories}
        historyItems={sb.historyItems}
        subscriptionTier={settings?.subscription_tier ?? "starter"}
        receiptYTD={receiptYTD}
        mileageKmTotal={mileageKmTotal}
        ccaAssetCount={ccaAssetCount}
      />
    );
  }

  // ── Normal path ───────────────────────────────────────────────
  const year = new Date().getFullYear();
  const [txResult, pipelineResult, expCatResult, expItemResult, historyResult, mileageResult, ccaResult, receiptTotalsResult, listingApptResult] =
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
      // Mileage log for tax optimization engine
      supabase
        .from("mileage_logs")
        .select("km")
        .eq("user_id", user.id)
        .limit(10000),
      // CCA assets count for tax optimization engine
      supabase
        .from("t2125_cca_assets")
        .select("id")
        .eq("user_id", user.id)
        .limit(10000),
      // Current-year receipt totals for accurate YTD expense calculation
      supabase
        .from("receipt_expenses")
        .select("total_amount")
        .eq("user_id", user.id)
        .gte("expense_date", `${year}-01-01`)
        .limit(10000),
      // Listing appointments for forecast weighted GCI
      supabase
        .from("listing_appointments")
        .select("*")
        .eq("user_id", user.id)
        .not("status", "in", "(sold,expired,withdrawn,lost)")
        .limit(10000),
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
      settings={rawSettings}
      transactions={txResult.data ?? []}
      pipelineDeals={pipelineResult.data ?? []}
      listingAppointments={listingApptResult.data ?? []}
      expenseCategories={expenseCategories}
      historyItems={historyResult.data ?? []}
      subscriptionTier={rawSettings?.subscription_tier ?? "starter"}
      receiptYTD={receiptYTD}
      mileageKmTotal={mileageKmTotal}
      ccaAssetCount={ccaAssetCount}
    />
  );
}
