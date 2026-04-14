import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ForecastContent } from "./forecast-content";

import { totalRecurringMonthly, totalRecurringYTD } from "@agent-runway/core/engines/recurring-expense-engine";
import type { RecurringExpense } from "@/lib/types/database";
import { computeIsPro } from "@/lib/compute-is-pro";

export default async function ForecastPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Fetch settings
  const settingsResult = await supabase
    .from("user_settings")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  const rawSettings = settingsResult.data;

  // ── Live Supabase queries ───────────────────────────────────────
  const year = new Date().getFullYear();
  const [txResult, pipelineResult, expCatResult, expItemResult, historyResult, mileageResult, ccaResult, receiptTotalsResult, listingApptResult, recurringExpResult] =
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
      supabase
        .from("recurring_expenses")
        .select("*")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .limit(10000),
    ]);

  const recurringExpenses = (recurringExpResult.data ?? []) as RecurringExpense[];
  const recurringExpMonthly = totalRecurringMonthly(recurringExpenses);
  const recurringExpYTD = totalRecurringYTD(recurringExpenses);

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
      isPro={await computeIsPro(supabase, user.id, rawSettings)}
      receiptYTD={receiptYTD}
      mileageKmTotal={mileageKmTotal}
      ccaAssetCount={ccaAssetCount}
      recurringExpMonthly={recurringExpMonthly}
      recurringExpYTD={recurringExpYTD}
    />
  );
}
