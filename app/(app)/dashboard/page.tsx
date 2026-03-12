import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { DashboardContent } from "./dashboard-content";
import type { HistoryItem, ContactTask } from "@/lib/types/database";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ upgraded?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Check if user has completed onboarding (has settings row)
  const { data: settings } = await supabase
    .from("user_settings")
    .select("user_id, goal_gci, display_name, province, split_preset")
    .eq("user_id", user.id)
    .single();

  // Redirect to onboarding if user hasn't completed it yet.
  // We check goal_gci === 0 AND display_name is empty — belt-and-suspenders guard
  // so users who set their name but skipped goals (legacy accounts) are not bounced.
  if (settings && settings.goal_gci === 0 && settings.display_name === '') {
    redirect("/onboarding");
  }

  const dashYear = new Date().getFullYear();

  // Fetch dashboard data in parallel
  const [txResult, pipelineResult, settingsResult, expCatResult, expItemResult, historyResult, receiptTotalsResult, tasksResult] =
    await Promise.all([
      supabase
        .from("transactions")
        .select("*")
        .eq("user_id", user.id)
        .eq("status", "closed")
        .gte("date", `${dashYear}-01-01`)
        .order("date", { ascending: false }),
      supabase
        .from("pipeline_deals")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
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
        .from("history_items")
        .select("*")
        .eq("user_id", user.id)
        .order("year", { ascending: false }),
      // Current-year receipt totals for accurate YTD expense calculation
      supabase
        .from("receipt_expenses")
        .select("total_amount")
        .eq("user_id", user.id)
        .gte("expense_date", `${dashYear}-01-01`),
      // Open follow-up tasks (for dashboard widget)
      supabase
        .from("contact_tasks")
        .select("*")
        .eq("user_id", user.id)
        .is("completed_at", null)
        .order("due_date", { ascending: true })
        .limit(10),
    ]);

  const expenseCategories = (expCatResult.data ?? []).map((cat) => ({
    ...cat,
    items: (expItemResult.data ?? []).filter((i) => i.category_id === cat.id),
  }));

  // Sum all current-year receipt totals for the dashboard's expense YTD figure
  const receiptYTD = (receiptTotalsResult.data ?? []).reduce(
    (sum, r) => sum + Number(r.total_amount ?? 0),
    0,
  );

  const params = await searchParams;
  const isAdmin = settingsResult.data?.is_admin ?? false;
  const showUpgradeBanner = params.upgraded === "true" && !isAdmin;

  const userName = settingsResult.data?.display_name || user.email?.split("@")[0] || undefined;

  return (
    <DashboardContent
      transactions={txResult.data ?? []}
      pipelineDeals={pipelineResult.data ?? []}
      settings={settingsResult.data}
      expenseCategories={expenseCategories}
      receiptYTD={receiptYTD}
      historyItems={(historyResult.data ?? []) as HistoryItem[]}
      initialDashboardView={settingsResult.data?.dashboard_view ?? "standard"}
      subscriptionTier={settingsResult.data?.subscription_tier ?? "starter"}
      showUpgradeBanner={showUpgradeBanner}
      userName={userName}
      openTasks={(tasksResult.data ?? []) as ContactTask[]}
    />
  );
}
