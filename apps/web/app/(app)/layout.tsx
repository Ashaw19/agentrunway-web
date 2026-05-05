import { redirect } from "next/navigation";
import * as Sentry from "@sentry/nextjs";
import { SidebarNav } from "@/components/sidebar-nav";
import { MobileNav } from "@/components/mobile-nav";
import { TopBar } from "@/components/top-bar";
import { AiChat } from "@/components/ai-chat";
import { QuickAddFab } from "@/components/quick-add-fab";
import { VoiceDraftProvider } from "@/lib/voice/voice-draft-context";
import { AiChatProvider } from "@/lib/ai-chat-context";
import { Toaster } from "sonner";
import { createClient } from "@/lib/supabase/server";
import { ORG_PUBLIC_COLUMNS } from "@/lib/org-context";
import { computeGCI, computeWeightedGCI } from "@/lib/types/database";
import { fmtCurrency } from "@/lib/formatters";
import type { OrgContext, Organization, OrganizationMember } from "@/lib/types/organizations";
import { PolicyUpdateBanner } from "@/components/policy-update-banner";
import {
  POLICY_TYPES,
  policiesNeedingAcceptance,
  type PolicyType,
} from "@/lib/policy-versions";

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

  // Defense-in-depth: if a request slips past the middleware (edge cold-start
  // glitch, future PROTECTED_PREFIXES omission), redirect to /login here too —
  // mirrors the per-page guards in forecast/, pipeline/, org/.
  if (!user) {
    redirect("/login");
  }

  // Defaults used when unauthenticated (middleware handles redirect, but be safe)
  let colorTheme = "blue";
  let isPro = false;
  let orgContext: OrgContext | null = null;
  let financialContext = "No user data available.";
  let pendingPolicies: PolicyType[] = [];

  if (user) {
    // Attach the authenticated user to Sentry's request scope so server-side
    // errors and captured exceptions are tagged with `user.id`. Without this,
    // production errors in the (app) tree can't be traced back to a specific
    // agent, which makes triage nearly impossible. Only id + email are sent —
    // no names, no phone, no financial data.
    Sentry.setUser({ id: user.id, email: user.email ?? undefined });

    // All data fetched in a single parallel round-trip
    const [
      { data: settings },
      { data: transactions },
      { data: pipeline },
      { data: expenseCategories },
      { data: memberships },
      { count: staleClientCount },
      { data: policyAcceptances },
    ] = await Promise.all([
      supabase
        .from("user_settings")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle(),
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
        .select(`*, organizations(${ORG_PUBLIC_COLUMNS})`)
        .eq("user_id", user.id)
        .in("status", ["active", "pending"])
        .order("created_at", { ascending: true }),
      supabase
        .from("clients")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .is("archived_at", null)
        .in("status", ["boarding", "in_flight"])
        .lt("last_contact_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
      // The loop below only consumes the latest acceptance per policy_type,
      // so we cap at 50 rows. Per-user lifetime acceptance count is bounded
      // by POLICY_TYPES.length × policy version history (~5 types × ≤5
      // versions ≈ 25 rows in realistic data). 50 is generous headroom and
      // bounds this hot-path read instead of pulling unbounded history on
      // every authenticated nav.
      supabase
        .from("policy_acceptances")
        .select("policy_type, version, accepted_at")
        .eq("user_id", user.id)
        .order("accepted_at", { ascending: false })
        .limit(50),
    ]);

    // ── Onboarding guard — redirect if user hasn't completed setup ──────────
    if (!settings || (settings.goal_gci === 0 && settings.display_name === "")) {
      redirect("/onboarding");
    }

    // ── Policy acceptance state (drives PolicyUpdateBanner) ─────────────────
    // Reduce the audit log to the latest accepted version per policy_type, then
    // diff against POLICY_VERSIONS. If the user has never accepted a policy at
    // all (e.g. signup pre-dated the policy_acceptances table) the banner
    // will list every policy.
    const latestAcceptedByPolicy: Partial<Record<PolicyType, string>> = {};
    for (const row of (policyAcceptances ?? []) as Array<{ policy_type: string; version: string; accepted_at: string }>) {
      if (POLICY_TYPES.includes(row.policy_type as PolicyType) && !(row.policy_type in latestAcceptedByPolicy)) {
        latestAcceptedByPolicy[row.policy_type as PolicyType] = row.version;
      }
    }
    pendingPolicies = policiesNeedingAcceptance(latestAcceptedByPolicy);

    // ── Color theme ──────────────────────────────────────────────────────────
    const rawTheme = settings?.color_theme ?? "blue";
    colorTheme = VALID_THEMES.has(rawTheme) ? rawTheme : "blue";

    // ── Subscription tier ────────────────────────────────────────────────────
    const tier = settings?.subscription_tier ?? "starter";
    const subStatus = settings?.subscription_status ?? "";
    const hasIndividualPro =
      (tier === "professional" || tier === "team") &&
      (subStatus === "active" || subStatus === "trialing" || subStatus === "past_due" || !subStatus);

    // Check if user belongs to an active or beta org (grants pro access)
    const hasOrgAccess = (memberships ?? []).some((m: Record<string, unknown>) => {
      const org = m.organizations as Record<string, unknown> | null;
      return (
        org?.subscription_status === "active" ||
        org?.subscription_status === "trialing" ||
        org?.is_beta === true
      );
    });

    isPro = hasIndividualPro || hasOrgAccess;

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
        // The query projects only non-billing columns. Null out the Stripe
        // fields so the Organization type is satisfied without carrying
        // missing-property shapes downstream. Billing pages fetch these
        // fields separately via getOrgBillingFields().
        const orgRaw = activeMembership.organizations as Record<string, unknown>;
        const org = {
          ...orgRaw,
          stripe_customer_id: null,
          stripe_subscription_id: null,
          stripe_price_id: null,
          billing_email: null,
        } as unknown as Organization;
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
            <MobileNav isPro={isPro} orgContext={orgContext} />
            <TopBar />
            <PolicyUpdateBanner pendingPolicies={pendingPolicies} />
            <main className="flex-1 overflow-y-auto overscroll-y-contain bg-[oklch(0.965_0.012_261)] p-4 sm:p-6 lg:p-8">
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
