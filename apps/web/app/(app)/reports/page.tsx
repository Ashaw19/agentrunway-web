import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ReportsContent } from "./reports-content";
import type { CcaAsset, RecurringExpense, ListingAppointment } from "@/lib/types/database";
import { expenseTaxContext } from "@agent-runway/core/engines/expense-totals-engine";
import { ytdExpenseTotals } from "@agent-runway/core/engines/t2125-expenses-engine";
import { deductionTrackingFlags } from "@agent-runway/core/engines/tax-optimization-engine";
import { expenseCategoryRows } from "@/lib/expenses/category-lines";
import { computeIsPro } from "@/lib/compute-is-pro";
import { atlanticNoon } from "@agent-runway/core/lib/local-date";


export default async function ReportsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Atlantic calendar, not the server's UTC clock (local-date.ts).
  const today = atlanticNoon();
  const year = today.getFullYear();

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
        .select("category_key, total_amount, tax_amount")
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

  const categories = (expCatResult.data ?? []).map((cat) => ({
    ...cat,
    items: (expItemResult.data ?? []).filter((i) => i.category_id === cat.id),
  }));

  // One call (t2125-expenses-engine) gives this page its year-to-date
  // expenses, its monthly figure, the category rows and the T2125 inputs:
  // receipts, the per-item monthly figure and the Recurring Expenses list,
  // incurred to date (never a projected month), plus the Home Office bills in
  // full for line 9945. The Expenses page and the dashboard make the same
  // call, so the headline here, the T2125 tab and those screens agree. For a
  // GST/HST registrant every figure is net of the ITCs the GST34 claims.
  const expenseTotals = ytdExpenseTotals({
    receipts: receiptTotalsResult.data,
    recurring: (recurringExpResult.data ?? []) as RecurringExpense[],
    expenseItems: expItemResult.data,
    ctx: expenseTaxContext(settingsRaw),
    now: today,
  });
  const t2125Expenses = expenseTotals.tracked;
  // "Expenses by Category": the engine's lines under their categories, so the
  // rows add up to the totals beneath them (lib/expenses/category-lines).
  const expenseRows = expenseCategoryRows(t2125Expenses.lines, categories).map((row) => ({
    key: row.key,
    title: row.title,
    ytd: row.ytd,
    monthly: row.monthly,
  }));

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
      isPro={isPro}
      historyItems={historyResult.data ?? []}
      expensesYTD={expenseTotals.expensesYTD}
      monthlyRecurring={expenseTotals.monthlyRecurring}
      expenseRows={expenseRows}
      ccaAssets={(ccaAssetsResult.data ?? []) as CcaAsset[]}
      t2125Expenses={t2125Expenses.entries}
      homeOfficeCosts={t2125Expenses.homeOfficeCosts}
      deductionTracking={deductionTrackingFlags(t2125Expenses.lines, categories)}
      mileageLogs={(mileageResult.data ?? []).map((r) => ({
        km: Number(r.km),
        deduction: Number(r.deduction),
        trip_date: r.trip_date,
      }))}
      taxYear={year}
      userId={user.id}
      referralSummary={referralSummary}
      expensesRemaining={expenseTotals.expensesRemaining}
    />
  );
}
