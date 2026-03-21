import { SidebarNav } from "@/components/sidebar-nav";
import { MobileNav } from "@/components/mobile-nav";
import { TopBar } from "@/components/top-bar";
import { AiChat } from "@/components/ai-chat";
import { QuickAddFab } from "@/components/quick-add-fab";
import { VoiceDraftProvider } from "@/lib/voice/voice-draft-context";
import { AiChatProvider } from "@/lib/ai-chat-context";
import { Toaster } from "sonner";
import { createClient } from "@/lib/supabase/server";
import { computeGCI, computeWeightedGCI } from "@/lib/types/database";
import { fmtCurrency } from "@/lib/formatters";
import type { OrgContext, Organization, OrganizationMember } from "@/lib/types/organizations";

const VALID_THEMES = new Set([
  "blue", "violet", "emerald", "orange", "rose",
  "gold", "sky", "teal", "mint", "indigo", "crimson", "amber", "fuchsia", "cyan", "forest",
]);

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Single auth call for the entire layout
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Defaults used when unauthenticated (middleware handles redirect, but be safe)
  let colorTheme = "blue";
  let isPro = false;
  let orgContext: OrgContext | null = null;
  let financialContext = "No user data available.";

  if (user) {
    // All data fetched in a single parallel round-trip
    const [
      { data: settings },
      { data: transactions },
      { data: pipeline },
      { data: expenseCategories },
      { data: memberships },
      { count: staleClientCount },
    ] = await Promise.all([
      supabase
        .from("user_settings")
        .select("*")
        .eq("user_id", user.id)
        .single(),
      supabase
        .from("transactions")
        .select("date, sale_price, commission_pct, team_split_pct, gci_override")
        .eq("user_id", user.id)
        .eq("status", "closed"),
      supabase
        .from("pipeline_deals")
        .select("estimated_price, estimated_commission_pct, probability_override, stage")
        .eq("user_id", user.id),
      supabase
        .from("expense_categories")
        .select("expense_items(ytd_amount, monthly_recurring)")
        .eq("user_id", user.id),
      supabase
        .from("organization_members")
        .select("*, organizations(*)")
        .eq("user_id", user.id)
        .in("status", ["active", "pending"])
        .order("created_at", { ascending: true }),
      supabase
        .from("clients")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .is("archived_at", null)
        .in("status", ["boarding", "taxiing", "approach", "in_flight"])
        .lt("last_contact_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
    ]);

    // ── Color theme ──────────────────────────────────────────────────────────
    const rawTheme = settings?.color_theme ?? "blue";
    colorTheme = VALID_THEMES.has(rawTheme) ? rawTheme : "blue";

    // ── Subscription tier ────────────────────────────────────────────────────
    const tier = settings?.subscription_tier ?? "starter";
    isPro = tier === "professional" || tier === "team";

    // ── Org context ──────────────────────────────────────────────────────────
    if (memberships && memberships.length > 0) {
      const brokerageMembership = memberships.find(
        (m: Record<string, unknown>) =>
          (m.organizations as Record<string, unknown>)?.type === "brokerage" &&
          m.status === "active",
      );
      const activeMembership =
        brokerageMembership ??
        memberships.find((m: Record<string, unknown>) => m.status === "active");

      if (activeMembership) {
        const org = activeMembership.organizations as unknown as Organization;
        const membership = {
          id: activeMembership.id,
          org_id: activeMembership.org_id,
          user_id: activeMembership.user_id,
          role: activeMembership.role,
          status: activeMembership.status,
          data_sharing_tier: activeMembership.data_sharing_tier,
          consent_granted_at: activeMembership.consent_granted_at,
          consent_version: activeMembership.consent_version,
          joined_at: activeMembership.joined_at,
          created_at: activeMembership.created_at,
          updated_at: activeMembership.updated_at,
        } as OrganizationMember;
        orgContext = {
          org,
          membership,
          isAdmin: membership.role === "owner" || membership.role === "admin",
          isOwner: membership.role === "owner",
        };
      }
    }

    // ── Financial context (AI chat) ──────────────────────────────────────────
    if (settings && transactions) {
      try {
        const currentYear = new Date().getFullYear();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ytdTx = transactions.filter((tx: any) =>
          tx.date.startsWith(String(currentYear)),
        );
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ytdGCI = ytdTx.reduce((sum: number, tx: any) => sum + computeGCI(tx), 0);
        const pipelineWeighted = (pipeline ?? []).reduce(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (sum: number, d: any) => sum + computeWeightedGCI(d),
          0,
        );

        const expensesYTD = (expenseCategories ?? []).reduce(
          (sum: number, cat: { expense_items?: { ytd_amount?: number | string }[] }) =>
            sum +
            (cat.expense_items ?? []).reduce(
              (s: number, i: { ytd_amount?: number | string }) =>
                s + Number(i.ytd_amount ?? 0),
              0,
            ),
          0,
        );
        const monthlyRecurring = (expenseCategories ?? []).reduce(
          (sum: number, cat: { expense_items?: { monthly_recurring?: number | string }[] }) =>
            sum +
            (cat.expense_items ?? []).reduce(
              (s: number, i: { monthly_recurring?: number | string }) =>
                s + Number(i.monthly_recurring ?? 0),
              0,
            ),
          0,
        );

        const splitMatch = settings.split_preset?.match(/p(\d+)_(\d+)/);
        const splitLabel = splitMatch
          ? `${splitMatch[1]}% agent / ${splitMatch[2]}% brokerage`
          : settings.split_preset;

        financialContext = [
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
          staleClientCount != null && staleClientCount > 0
            ? `Stale Active Clients (no contact 30+ days): ${staleClientCount}`
            : null,
        ]
          .filter(Boolean)
          .join("\n");
      } catch {
        financialContext = "Business data temporarily unavailable.";
      }
    }
  }

  return (
    <VoiceDraftProvider>
      <AiChatProvider>
        <div
          className="flex h-dvh overflow-hidden"
          data-color-theme={colorTheme}
        >
          <SidebarNav isPro={isPro} orgContext={orgContext} />
          <div className="flex flex-1 flex-col overflow-hidden">
            <MobileNav isPro={isPro} />
            <TopBar />
            <main className="flex-1 overflow-y-auto overscroll-y-contain bg-[#eef1f8] p-4 sm:p-6 lg:p-8">
              <div className="mx-auto max-w-screen-xl page-enter">
                {children}
              </div>
            </main>
          </div>
          {isPro && <AiChat financialContext={financialContext} />}
          <QuickAddFab hasAiChat={isPro} />
          <Toaster
            position="bottom-right"
            offset={isPro ? "88px" : "24px"}
            toastOptions={{
              style: {
                background: "oklch(0.18 0.05 265)",
                border: "1px solid oklch(0.28 0.05 265)",
                color: "oklch(0.93 0.013 255)",
              },
            }}
          />
        </div>
      </AiChatProvider>
    </VoiceDraftProvider>
  );
}
