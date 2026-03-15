import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { DashboardContent } from "./dashboard-content";
import type { HistoryItem, ContactTask } from "@/lib/types/database";
import { CREA_BOARDS, fetchBoardData, type LocalMarketData } from "@/lib/crea-board";

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
  const [txResult, pipelineResult, settingsResult, expCatResult, expItemResult, historyResult, receiptTotalsResult, tasksResult, mileageResult, ccaResult, activeClientsResult, recentActivitiesResult] =
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
      // Mileage log for tax optimization engine
      supabase
        .from("mileage_log")
        .select("distance_km")
        .eq("user_id", user.id),
      // CCA assets count for tax optimization engine
      supabase
        .from("t2125_cca_assets")
        .select("id")
        .eq("user_id", user.id),
      // Active clients (boarding/taxiing/in_flight) — for CRM summary
      supabase
        .from("clients")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .in("status", ["boarding", "taxiing", "in_flight"]),
      // Distinct clients contacted in last 14 days — for stale lead detection
      supabase
        .from("contact_activities")
        .select("client_id")
        .eq("user_id", user.id)
        .gte("activity_date", new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10)),
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

  // Mileage + CCA data for tax optimization engine
  const mileageKmTotal = (mileageResult.data ?? []).reduce(
    (sum, r) => sum + Number(r.distance_km ?? 0),
    0,
  );
  const ccaAssetCount = (ccaResult.data ?? []).length;

  // CRM summary: stale leads = active clients NOT contacted in 14 days
  const activeClientCount = activeClientsResult.count ?? 0;
  const recentlyContactedIds = new Set(
    (recentActivitiesResult.data ?? []).map((a) => a.client_id)
  );
  const staleLeadCount = Math.max(0, activeClientCount - recentlyContactedIds.size);

  // Fetch live CREA board data if the user has selected a board
  let boardMarketData: LocalMarketData | null = null;
  const boardCode = settingsResult.data?.board_code ?? "";
  if (boardCode) {
    const board = CREA_BOARDS.find((b) => b.slug === boardCode);
    if (board) {
      try {
        boardMarketData = await fetchBoardData(board);
      } catch {
        // Board data is non-critical — continue without it
      }
    }
  }

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
      mileageKmTotal={mileageKmTotal}
      ccaAssetCount={ccaAssetCount}
      activeClientCount={activeClientCount}
      staleLeadCount={staleLeadCount}
      hasSeenTour={settingsResult.data?.has_seen_tour ?? true}
      boardMarketData={boardMarketData}
      boardSubregion={settingsResult.data?.board_subregion ?? ""}
    />
  );
}
