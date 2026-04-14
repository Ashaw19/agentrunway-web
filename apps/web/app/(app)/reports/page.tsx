import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ReportsContent } from "./reports-content";
import type { CcaAsset, RecurringExpense, ListingAppointment } from "@/lib/types/database";
import { totalRecurringMonthly, totalRecurringYTD } from "@agent-runway/core/engines/recurring-expense-engine";
import { computeIsPro } from "@/lib/compute-is-pro";


export default async function ReportsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const year = new Date().getFullYear();

  // Fetch settings
  const { data: settingsRaw } = await supabase
    .from("user_settings")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  // ── Live Supabase queries ───────────────────────────────────────────
  const [txResult, pipelineResult, expCatResult, expItemResult, historyResult, receiptTotalsResult, ccaAssetsResult, mileageResult, referralsResult, recurringExpResult, listingApptResult] =
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
      // Mileage logs for T2125 PDF Page 3
      supabase
        .from("mileage_logs")
        .select("km, deduction, trip_date")
        .eq("user_id", user.id)
        .order("trip_date", { ascending: false })
        .limit(10000),
      // Referrals for PDF Page 7
      supabase
        .from("referrals")
        .select("direction, actual_fee_paid, status")
        .eq("user_id", user.id),
      supabase
        .from("recurring_expenses")
        .select("*")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .limit(10000),
      // Listing appointments for projected GCI (matches Forecast page)
      supabase
        .from("listing_appointments")
        .select("*")
        .eq("user_id", user.id)
        .not("status", "in", "(sold,expired,withdrawn,lost)")
        .limit(10000),
    ]);

  const recurringExpenses = (recurringExpResult.data ?? []) as RecurringExpense[];
  const recurringExpMonthly = totalRecurringMonthly(recurringExpenses);
  const recurringExpYTD = totalRecurringYTD(recurringExpenses);

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

  // Build referral summary for PDF Page 7
  const referrals = referralsResult.data ?? [];
  const referralSummary = referrals.length > 0 ? {
    inboundCount: referrals.filter((r) => r.direction === "inbound").length,
    outboundCount: referrals.filter((r) => r.direction === "outbound").length,
    feesEarned: referrals
      .filter((r) => r.direction === "inbound" && r.status === "closed")
      .reduce((sum, r) => sum + Number(r.actual_fee_paid ?? 0), 0),
    feesPaid: referrals
      .filter((r) => r.direction === "outbound" && r.status === "closed")
      .reduce((sum, r) => sum + Number(r.actual_fee_paid ?? 0), 0),
  } : undefined;

  const isPro = await computeIsPro(supabase, user.id, settingsRaw);

  return (
    <ReportsContent
      settings={settingsRaw}
      transactions={txResult.data ?? []}
      pipelineDeals={pipelineResult.data ?? []}
      listingAppointments={(listingApptResult.data ?? []) as ListingAppointment[]}
      expenseCategories={categories}
      isPro={isPro}
      historyItems={historyResult.data ?? []}
      receiptTotalsByKey={receiptTotalsByKey}
      ccaAssets={(ccaAssetsResult.data ?? []) as CcaAsset[]}
      expenseAmounts={expenseAmounts}
      mileageLogs={(mileageResult.data ?? []).map((r) => ({
        km: Number(r.km),
        deduction: Number(r.deduction),
        trip_date: r.trip_date,
      }))}
      taxYear={year}
      userId={user.id}
      referralSummary={referralSummary}
      recurringExpMonthly={recurringExpMonthly}
      recurringExpYTD={recurringExpYTD}
    />
  );
}
