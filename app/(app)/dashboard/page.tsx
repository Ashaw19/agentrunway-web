import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { DashboardContent } from "./dashboard-content";

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
    .select("user_id, goal_gci, province, split_preset")
    .eq("user_id", user.id)
    .single();

  // If no goal set, redirect to onboarding
  if (settings && settings.goal_gci === 0) {
    redirect("/onboarding");
  }

  // Fetch dashboard data in parallel
  const [txResult, pipelineResult, settingsResult, expCatResult, expItemResult] =
    await Promise.all([
      supabase
        .from("transactions")
        .select("*")
        .eq("user_id", user.id)
        .eq("status", "closed")
        .gte("date", `${new Date().getFullYear()}-01-01`)
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
    ]);

  const expenseCategories = (expCatResult.data ?? []).map((cat) => ({
    ...cat,
    items: (expItemResult.data ?? []).filter((i) => i.category_id === cat.id),
  }));

  const params = await searchParams;
  const showUpgradeBanner = params.upgraded === "true";

  return (
    <DashboardContent
      transactions={txResult.data ?? []}
      pipelineDeals={pipelineResult.data ?? []}
      settings={settingsResult.data}
      expenseCategories={expenseCategories}
      initialDashboardView={settingsResult.data?.dashboard_view ?? "standard"}
      subscriptionTier={settingsResult.data?.subscription_tier ?? "starter"}
      showUpgradeBanner={showUpgradeBanner}
    />
  );
}
