import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { DashboardContent } from "./dashboard-content";
import type { HistoryItem, ContactTask, Client, ContactActivity, ClientRecord, UserSettings } from "@/lib/types/database";
import { CREA_BOARDS, fetchBoardData, type LocalMarketData } from "@/lib/crea-board";
import { computeIntelligenceBriefing, type BriefingItem } from "@/lib/engines/crm-analytics-engine";
import { isSandboxActive, getSandboxData, mergeSandboxSettings, getSandboxReceiptYTD, getSandboxMileageTotal } from "@/lib/sandbox-resolver";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ upgraded?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Onboarding guard now runs in the (app) layout — no need to check here.

  const dashYear = new Date().getFullYear();

  // ── Step 1: Fetch settings (full row) to check sandbox mode ─────────────
  const { data: settingsRow } = await supabase
    .from("user_settings")
    .select("*")
    .eq("user_id", user.id)
    .single();

  const sandboxActive = isSandboxActive(settingsRow as UserSettings | null);

  // ── Step 2: Resolve all data ────────────────────────────────────────────
  if (sandboxActive) {
    const sb = getSandboxData(settingsRow as UserSettings);
    const mergedSettings = mergeSandboxSettings(settingsRow as UserSettings);

    // Intelligence Briefing from sandbox clients
    const briefingResult = sb.clients.length > 0 && sb.contactActivities.length > 0
      ? computeIntelligenceBriefing(
          sb.clients as Client[],
          sb.contactActivities as ContactActivity[],
          sb.clientRecords as ClientRecord[],
        )
      : null;
    const topBriefingItems: BriefingItem[] = briefingResult
      ? [...briefingResult.items]
          .sort((a, b) => {
            const sev: Record<string, number> = { urgent: 0, attention: 1, upcoming: 2 };
            return (sev[a.severity] ?? 3) - (sev[b.severity] ?? 3);
          })
          .slice(0, 3)
      : [];

    // CRM summary from sandbox data
    const activeStatuses = new Set(["boarding", "taxiing", "approach", "in_flight"]);
    const sandboxActiveClients = sb.clients.filter(c => activeStatuses.has(c.status));
    const fourteenDaysAgo = new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10);
    const recentlyContactedIds = new Set(
      sb.contactActivities
        .filter(a => a.activity_date >= fourteenDaysAgo)
        .map(a => a.client_id)
    );
    const sandboxStaleCount = Math.max(0, sandboxActiveClients.length - recentlyContactedIds.size);

    // Open tasks from sandbox
    const sandboxTasks = sb.contactTasks
      .filter(t => t.completed_at === null)
      .slice(0, 10) as ContactTask[];

    // Fetch live CREA board data (always real — external market data)
    let boardMarketData: LocalMarketData | null = null;
    const boardCode = mergedSettings.board_code ?? "";
    if (boardCode) {
      const board = CREA_BOARDS.find((b) => b.slug === boardCode);
      if (board) {
        try { boardMarketData = await fetchBoardData(board); } catch { /* non-critical */ }
      }
    }

    const params = await searchParams;
    const isAdmin = mergedSettings.is_admin ?? false;
    const showUpgradeBanner = params.upgraded === "true" && !isAdmin;
    const userName = mergedSettings.display_name || user.email?.split("@")[0] || undefined;

    return (
      <DashboardContent
        transactions={sb.transactions}
        pipelineDeals={sb.pipelineDeals}
        settings={mergedSettings}
        expenseCategories={sb.expenseCategories}
        receiptYTD={getSandboxReceiptYTD(sb)}
        historyItems={sb.historyItems as HistoryItem[]}
        initialDashboardView={mergedSettings.dashboard_view ?? "standard"}
        subscriptionTier={mergedSettings.subscription_tier ?? "starter"}
        showUpgradeBanner={showUpgradeBanner}
        userName={userName}
        openTasks={sandboxTasks}
        mileageKmTotal={getSandboxMileageTotal(sb)}
        ccaAssetCount={sb.ccaAssets.length}
        activeClientCount={sandboxActiveClients.length}
        staleLeadCount={sandboxStaleCount}
        hasSeenTour={settingsRow?.has_seen_tour ?? true}
        boardMarketData={boardMarketData}
        boardSubregion={mergedSettings.board_subregion ?? ""}
        briefingItems={topBriefingItems}
        runwayScoreSnapshot={(settingsRow?.runway_score_snapshot as { score: number; month: string } | null) ?? null}
        dashboardLayout={(settingsRow?.dashboard_layout as import("./card-registry").DashboardLayout | null) ?? null}
        communicationProfile={(settingsRow?.communication_profile as import("@/lib/types/database").CommunicationProfile | null) ?? null}
        businessIdentity={(settingsRow?.business_identity as import("@/lib/types/database").BusinessIdentity | null) ?? null}
        aiProfilePromptDismissedAt={settingsRow?.ai_profile_prompt_dismissed_at ?? null}
      />
    );
  }

  // ── Step 3: Live Supabase queries (no sandbox) ──────────────────────────
  const [txResult, pipelineResult, expCatResult, expItemResult, historyResult, receiptTotalsResult, tasksResult, mileageResult, ccaResult, activeClientsResult, recentActivitiesResult, briefingClientsResult, briefingActivitiesResult, briefingRecordsResult] =
    await Promise.all([
      supabase
        .from("transactions")
        .select("*")
        .eq("user_id", user.id)
        .eq("status", "closed")
        .gte("date", `${dashYear}-01-01`)
        .order("date", { ascending: false })
        .limit(10000),
      supabase
        .from("pipeline_deals")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
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
      supabase
        .from("receipt_expenses")
        .select("total_amount")
        .eq("user_id", user.id)
        .gte("expense_date", `${dashYear}-01-01`)
        .limit(10000),
      supabase
        .from("contact_tasks")
        .select("*")
        .eq("user_id", user.id)
        .is("completed_at", null)
        .order("due_date", { ascending: true })
        .limit(10),
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
        .from("clients")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .in("status", ["boarding", "taxiing", "approach", "in_flight"]),
      supabase
        .from("contact_activities")
        .select("client_id")
        .eq("user_id", user.id)
        .gte("activity_date", new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10)),
      supabase.from("clients").select("*").eq("user_id", user.id).limit(10000),
      supabase
        .from("contact_activities")
        .select("*")
        .eq("user_id", user.id)
        .order("activity_date", { ascending: false })
        .limit(500),
      supabase
        .from("client_records")
        .select("*")
        .eq("user_id", user.id)
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

  const briefingResult = briefingClientsResult.data && briefingActivitiesResult.data && briefingRecordsResult.data
    ? computeIntelligenceBriefing(
        briefingClientsResult.data as Client[],
        briefingActivitiesResult.data as ContactActivity[],
        briefingRecordsResult.data as ClientRecord[],
      )
    : null;
  const topBriefingItems: BriefingItem[] = briefingResult
    ? [...briefingResult.items]
        .sort((a, b) => {
          const sev: Record<string, number> = { urgent: 0, attention: 1, upcoming: 2 };
          return (sev[a.severity] ?? 3) - (sev[b.severity] ?? 3);
        })
        .slice(0, 3)
    : [];

  const activeClientCount = activeClientsResult.count ?? 0;
  const recentlyContactedIds = new Set(
    (recentActivitiesResult.data ?? []).map((a) => a.client_id)
  );
  const staleLeadCount = Math.max(0, activeClientCount - recentlyContactedIds.size);

  let boardMarketData: LocalMarketData | null = null;
  const boardCode = settingsRow?.board_code ?? "";
  if (boardCode) {
    const board = CREA_BOARDS.find((b) => b.slug === boardCode);
    if (board) {
      try { boardMarketData = await fetchBoardData(board); } catch { /* non-critical */ }
    }
  }

  const params = await searchParams;
  const isAdmin = settingsRow?.is_admin ?? false;
  const showUpgradeBanner = params.upgraded === "true" && !isAdmin;
  const userName = settingsRow?.display_name || user.email?.split("@")[0] || undefined;

  return (
    <DashboardContent
      transactions={txResult.data ?? []}
      pipelineDeals={pipelineResult.data ?? []}
      settings={settingsRow}
      expenseCategories={expenseCategories}
      receiptYTD={receiptYTD}
      historyItems={(historyResult.data ?? []) as HistoryItem[]}
      initialDashboardView={settingsRow?.dashboard_view ?? "standard"}
      subscriptionTier={settingsRow?.subscription_tier ?? "starter"}
      showUpgradeBanner={showUpgradeBanner}
      userName={userName}
      openTasks={(tasksResult.data ?? []) as ContactTask[]}
      mileageKmTotal={mileageKmTotal}
      ccaAssetCount={ccaAssetCount}
      activeClientCount={activeClientCount}
      staleLeadCount={staleLeadCount}
      hasSeenTour={settingsRow?.has_seen_tour ?? true}
      boardMarketData={boardMarketData}
      boardSubregion={settingsRow?.board_subregion ?? ""}
      briefingItems={topBriefingItems}
      runwayScoreSnapshot={(settingsRow?.runway_score_snapshot as { score: number; month: string } | null) ?? null}
      dashboardLayout={(settingsRow?.dashboard_layout as import("./card-registry").DashboardLayout | null) ?? null}
      communicationProfile={(settingsRow?.communication_profile as import("@/lib/types/database").CommunicationProfile | null) ?? null}
      businessIdentity={(settingsRow?.business_identity as import("@/lib/types/database").BusinessIdentity | null) ?? null}
      aiProfilePromptDismissedAt={settingsRow?.ai_profile_prompt_dismissed_at ?? null}
    />
  );
}
