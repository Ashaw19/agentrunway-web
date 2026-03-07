import { SidebarNav } from "@/components/sidebar-nav";
import { MobileNav } from "@/components/mobile-nav";
import { AiChat } from "@/components/ai-chat";
import { createClient } from "@/lib/supabase/server";
import { computeGCI, computeWeightedGCI } from "@/lib/types/database";
import { fmtCurrency } from "@/lib/formatters";

const VALID_THEMES = new Set(["blue", "violet", "emerald", "orange", "rose"]);

async function buildFinancialContext(): Promise<string> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return "No user data available.";

    const [
      { data: settings },
      { data: transactions },
      { data: pipeline },
      { data: expenseCategories },
    ] = await Promise.all([
      supabase.from("user_settings").select("*").eq("user_id", user.id).single(),
      supabase
        .from("transactions")
        .select("*")
        .eq("user_id", user.id)
        .eq("status", "closed"),
      supabase.from("pipeline_deals").select("*").eq("user_id", user.id),
      supabase
        .from("expense_categories")
        .select("*, expense_items(*)")
        .eq("user_id", user.id),
    ]);

    if (!settings || !transactions) return "Business data not available.";

    const currentYear = new Date().getFullYear();
    const ytdTx = transactions.filter((tx) =>
      tx.date.startsWith(String(currentYear)),
    );
    const ytdGCI = ytdTx.reduce((sum: number, tx) => sum + computeGCI(tx), 0);
    const pipelineWeighted = (pipeline ?? []).reduce(
      (sum: number, d) => sum + computeWeightedGCI(d),
      0,
    );

    // Expenses
    const expensesYTD = (expenseCategories ?? []).reduce(
      (sum: number, cat: { items?: { ytd_amount?: number | string }[] }) =>
        sum +
        (cat.items ?? []).reduce(
          (s: number, i: { ytd_amount?: number | string }) =>
            s + Number(i.ytd_amount ?? 0),
          0,
        ),
      0,
    );
    const monthlyRecurring = (expenseCategories ?? []).reduce(
      (sum: number, cat: { items?: { monthly_recurring?: number | string }[] }) =>
        sum +
        (cat.items ?? []).reduce(
          (s: number, i: { monthly_recurring?: number | string }) =>
            s + Number(i.monthly_recurring ?? 0),
          0,
        ),
      0,
    );

    // Build split label
    const splitMatch = settings.split_preset?.match(/p(\d+)_(\d+)/);
    const splitLabel = splitMatch
      ? `${splitMatch[1]}% agent / ${splitMatch[2]}% brokerage`
      : settings.split_preset;

    const lines = [
      `Current Year: ${currentYear}`,
      `YTD GCI: ${fmtCurrency(ytdGCI)}`,
      `Closed Deals YTD: ${ytdTx.length}`,
      ytdTx.length > 0
        ? `Average Deal GCI: ${fmtCurrency(ytdGCI / ytdTx.length)}`
        : null,
      `Pipeline (Probability-Weighted GCI): ${fmtCurrency(pipelineWeighted)} across ${pipeline?.length ?? 0} active deals`,
      `Province: ${settings.province}`,
      `Commission Split: ${splitLabel}`,
      settings.monthly_brokerage_fee > 0
        ? `Monthly Brokerage Fee: ${fmtCurrency(settings.monthly_brokerage_fee)}`
        : null,
      settings.tx_fee_rate_pct > 0
        ? `Transaction Fee Rate: ${(settings.tx_fee_rate_pct * 100).toFixed(1)}%${settings.tx_fee_annual_cap > 0 ? ` (cap: ${fmtCurrency(settings.tx_fee_annual_cap)}/yr)` : ""}`
        : null,
      `Cash Reserve: ${fmtCurrency(settings.cash_reserve ?? 0)}`,
      settings.goal_gci > 0
        ? `Annual GCI Goal: ${fmtCurrency(settings.goal_gci)}`
        : "Annual GCI Goal: Not set",
      settings.experience_years != null
        ? `Years of Experience: ${settings.experience_years}`
        : null,
      expensesYTD > 0 ? `YTD Business Expenses: ${fmtCurrency(expensesYTD)}` : null,
      monthlyRecurring > 0
        ? `Monthly Recurring Expenses: ${fmtCurrency(monthlyRecurring)}`
        : null,
    ]
      .filter(Boolean)
      .join("\n");

    return lines;
  } catch {
    return "Business data temporarily unavailable.";
  }
}

async function getColorTheme(): Promise<string> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return "blue";
    const { data } = await supabase
      .from("user_settings")
      .select("color_theme")
      .eq("user_id", user.id)
      .single();
    const theme = data?.color_theme ?? "blue";
    return VALID_THEMES.has(theme) ? theme : "blue";
  } catch {
    return "blue";
  }
}

async function getSubscriptionTier(): Promise<string> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return "starter";
    const { data } = await supabase
      .from("user_settings")
      .select("subscription_tier")
      .eq("user_id", user.id)
      .single();
    return data?.subscription_tier ?? "starter";
  } catch {
    return "starter";
  }
}

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [financialContext, colorTheme, subscriptionTier] = await Promise.all([
    buildFinancialContext(),
    getColorTheme(),
    getSubscriptionTier(),
  ]);
  const isPro = subscriptionTier === "professional" || subscriptionTier === "team";

  return (
    <div
      className="flex h-screen overflow-hidden"
      data-color-theme={colorTheme}
    >
      <SidebarNav isPro={isPro} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <MobileNav isPro={isPro} />
        <main className="flex-1 overflow-y-auto bg-muted/30 p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-screen-xl">
            {children}
          </div>
        </main>
      </div>
      {isPro && <AiChat financialContext={financialContext} />}
    </div>
  );
}
