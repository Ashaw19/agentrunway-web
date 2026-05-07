import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { DashboardContent } from "./dashboard-content";
import type { HistoryItem, ContactTask, Client, ContactActivity, ClientRecord, ListingAppointment } from "@/lib/types/database";
import { computeIntelligenceBriefing, type BriefingItem } from "@/lib/engines/crm-analytics-engine";
import { totalRecurringMonthly, totalRecurringYTD } from "@agent-runway/core/engines/recurring-expense-engine";
import type { RecurringExpense } from "@/lib/types/database";
import { computeIsPro } from "@/lib/compute-is-pro";


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

  const { data: settingsRow } = await supabase
    .from("user_settings")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  // ── Live Supabase queries ──────────────────────────────────────────────
  // Use Promise.allSettled so one failed query doesn't crash the entire dashboard
  const settledResults = await Promise.allSettled([
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
        .in("status", ["boarding", "in_flight"]),
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
      supabase
        .from("listing_appointments")
        .select("*")
        .eq("user_id", user.id)
        .in("status", ["scheduled", "active"])
        .limit(10000),
      supabase
        .from("recurring_expenses")
        .select("*")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .limit(10000),
    ]);

  // Extract results — failed queries return empty data instead of crashing the page
  const unwrap = <T,>(r: PromiseSettledResult<T>): T =>
    r.status === "fulfilled" ? r.value : ({ data: null, count: null, error: r.reason } as T);
  const [txResult, pipelineResult, expCatResult, expItemResult, historyResult, receiptTotalsResult, tasksResult, mileageResult, ccaResult, activeClientsResult, recentActivitiesResult, briefingClientsResult, briefingActivitiesResult, briefingRecordsResult, listingResult, recurringExpResult] = [
    unwrap(settledResults[0]), unwrap(settledResults[1]), unwrap(settledResults[2]),
    unwrap(settledResults[3]), unwrap(settledResults[4]), unwrap(settledResults[5]),
    unwrap(settledResults[6]), unwrap(settledResults[7]), unwrap(settledResults[8]),
    unwrap(settledResults[9]), unwrap(settledResults[10]), unwrap(settledResults[11]),
    unwrap(settledResults[12]), unwrap(settledResults[13]), unwrap(settledResults[14]),
    unwrap(settledResults[15]),
  ];

  const recurringExpenses = (recurringExpResult.data ?? []) as RecurringExpense[];
  const recurringExpMonthly = totalRecurringMonthly(recurringExpenses);
  const recurringExpYTD = totalRecurringYTD(recurringExpenses);

  const expenseCategories = (expCatResult.data ?? []).map((cat) => ({
    ...cat,
    items: (expItemResult.data ?? []).filter((i) => i.category_id === cat.id),
  }));

  const receiptYTD = Math.round(
    (receiptTotalsResult.data ?? []).reduce(
      (sum, r) => sum + Number(r.total_amount ?? 0),
      0,
    ) * 100,
  ) / 100;

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
        (listingResult.data ?? []) as ListingAppointment[],
      )
    : null;
  const topBriefingItems: BriefingItem[] = briefingResult
    ? [...briefingResult.items]
        .sort((a, b) => {
          const sev: Record<string, number> = { urgent: 0, attention: 1, upcoming: 2 };
          return (sev[a.severity] ?? 3) - (sev[b.severity] ?? 3);
        })
        .slice(0, 8)
    : [];

  // ── Upcoming condition dates (next 14 days, pending only) ──────────────
  const todayStr = new Date().toISOString().slice(0, 10);
  const twoWeeksStr = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);
  const clientRecordsAll = briefingRecordsResult.data ?? [];
  const clientsAll = briefingClientsResult.data ?? [];
  const clientNameMap = new Map(clientsAll.map((c: Client) => [c.id, c.name ?? "Unknown"]));
  const upcomingConditions = clientRecordsAll
    .filter((r: ClientRecord) =>
      r.condition_date && r.condition_status === "pending" &&
      r.condition_date >= todayStr && r.condition_date <= twoWeeksStr
    )
    .map((r: ClientRecord) => ({
      address: r.address ?? "Unknown address",
      condition_date: r.condition_date!,
      client_name: (r.client_id ? clientNameMap.get(r.client_id) : null) ?? "Unknown",
      days_until: Math.round((new Date(r.condition_date + "T12:00:00").getTime() - new Date(todayStr + "T12:00:00").getTime()) / 86_400_000),
    }))
    .sort((a: { days_until: number }, b: { days_until: number }) => a.days_until - b.days_until)
    .slice(0, 5);

  const activeClientCount = activeClientsResult.count ?? 0;
  // Only count recent activities for clients that are actually active (boarding/in_flight).
  // Without this filter, activities on cruising clients inflate recentlyContactedIds
  // and cause staleLeadCount to undercount (or go negative before Math.max).
  const activeClientIds = new Set(
    (briefingClientsResult.data ?? [])
      .filter((c) => c.status === "boarding" || c.status === "in_flight")
      .map((c) => c.id),
  );
  const recentlyContactedIds = new Set(
    (recentActivitiesResult.data ?? [])
      .map((a) => a.client_id)
      .filter((id) => activeClientIds.has(id)),
  );
  const staleLeadCount = Math.max(0, activeClientCount - recentlyContactedIds.size);

  // ── Team welcome detection ─────────────────────────────────────────────
  // Show welcome banner if user joined an org in the last 7 days and has no transactions yet
  let teamWelcome: { orgName: string } | null = null;
  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { data: recentMemberships } = await supabase
    .from("organization_members")
    .select("joined_at, organizations(name)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .gte("joined_at", sevenDaysAgo)
    .order("joined_at", { ascending: false })
    .limit(1);
  if (recentMemberships?.[0] && (txResult.data ?? []).length === 0) {
    const orgRow = recentMemberships[0].organizations as unknown as { name: string } | null;
    teamWelcome = { orgName: orgRow?.name ?? "your team" };
  }

  const isPro = await computeIsPro(supabase, user.id, settingsRow);

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
      isPro={isPro}
      showUpgradeBanner={showUpgradeBanner}
      userName={userName}
      openTasks={(tasksResult.data ?? []) as ContactTask[]}
      mileageKmTotal={mileageKmTotal}
      ccaAssetCount={ccaAssetCount}
      activeClientCount={activeClientCount}
      staleLeadCount={staleLeadCount}
      hasSeenTour={settingsRow?.has_seen_tour ?? true}
      briefingItems={topBriefingItems}
      upcomingConditions={upcomingConditions}
      runwayScoreSnapshot={(settingsRow?.runway_score_snapshot as { score: number; month: string } | null) ?? null}
      dashboardLayout={(settingsRow?.dashboard_layout as import("./card-registry").DashboardLayout | null) ?? null}
      communicationProfile={(settingsRow?.communication_profile as import("@/lib/types/database").CommunicationProfile | null) ?? null}
      businessIdentity={(settingsRow?.business_identity as import("@/lib/types/database").BusinessIdentity | null) ?? null}
      aiProfilePromptDismissedAt={settingsRow?.ai_profile_prompt_dismissed_at ?? null}
      activeListings={(listingResult.data ?? []) as ListingAppointment[]}
      teamWelcome={teamWelcome}
      recurringExpMonthly={recurringExpMonthly}
      recurringExpYTD={recurringExpYTD}
    />
  );
}
