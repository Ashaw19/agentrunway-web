import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { atlanticYear } from "@agent-runway/core/lib/local-date";
import { redirect } from "next/navigation";
import { PipelineContent } from "./pipeline-content";

import type {
  BuyerClient,
  ClosedTransaction,
} from "@/lib/engines/pipeline-forecast";

export interface PipelineSeedData {
  pipelineDeals: import("@/lib/types/database").PipelineDeal[];
  listingAppointments: import("@/lib/types/database").ListingAppointment[];
  buyerClients: BuyerClient[];
  closedTransactions: ClosedTransaction[];
  defaultCommissionPct: number;
  // ── Pre-transactional Opportunities (migrations 00153-00156) ──────────
  // `opportunities` is the unified read surface (opportunities_v) the new
  // Opportunities section + cockpit strip read from. `referralOpportunities`
  // is the raw referral table — it rolls into the unified Pipeline Weighted
  // total via the forecast engine (spec §2.2).
  opportunities: import("@/lib/types/database").OpportunityV[];
  referralOpportunities: import("@/lib/types/database").ReferralOpportunity[];
  /** Names of the clients linked to open deals and listings: the table names rows by client. */
  clientNamesById: Record<string, string>;
}

// ── Page ───────────────────────────────────────────────────────────────────

export default async function PipelinePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const settingsResult = await supabase
    .from("user_settings")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  const _rawSettings = settingsResult.data;

  // ── Live Supabase queries ───────────────────────────────────────────
  // Atlantic calendar, not the server's UTC clock (local-date.ts).
  const year = atlanticYear();

  const [
    dealsResult,
    listingsResult,
    clientsResult,
    txResult,
    opportunitiesResult,
    referralsResult,
  ] = await Promise.all([
      supabase
        .from("pipeline_deals")
        .select("*")
        .eq("user_id", user.id)
        .limit(10000),
      supabase
        .from("listing_appointments")
        .select("*")
        .eq("user_id", user.id)
        .limit(10000),
      // In pages: one request stops at 1,000 rows.
      fetchAllRows((from, to) =>
        supabase
          .from("clients")
          .select("*")
          .eq("user_id", user.id)
          // Include "scheduled" buyers (future-intent stage from the 4-stage
          // redesign) — they're forecasted at a low probability so the
          // pipeline reflects pre-transactional capture too.
          .in("status", ["boarding", "scheduled", "in_flight"])
          .order("id")
          .range(from, to)),
      supabase
        .from("transactions")
        .select("id, sale_price, pipeline_deal_id")
        .eq("user_id", user.id)
        .eq("status", "closed")
        .gte("date", `${year}-01-01`)
        .not("pipeline_deal_id", "is", null)
        .limit(10000),
      // Unified pre-transactional opportunities (opportunities_v). RLS
      // (security_invoker) scopes to the caller; user_id filter is belt-and-
      // suspenders for index use. KPIs need converted/lost rows too, so this
      // is NOT filtered to status='open' here — the section filters for display.
      supabase
        .from("opportunities_v")
        .select("*")
        .eq("user_id", user.id)
        .limit(10000),
      // Raw referral rows feed the unified Pipeline Weighted forecast total.
      supabase
        .from("referral_opportunities")
        .select("*")
        .eq("user_id", user.id)
        .limit(10000),
    ]);

  // Map clients to BuyerClient shape — only include those with buyer data
  const buyerClients: BuyerClient[] = (clientsResult.data ?? [])
    .filter(
      (c) =>
        // Only treat `property_interest` as a buyer budget when the client is a
        // buyer (`property_interest_type === "budget"`). When the type is
        // "listing", `property_interest` is a seller's LISTING price and must not
        // be counted as a buyer budget — that inflates the weighted-GCI forecast.
        // Mirrors the gate already applied in crm/tabs/insights-tab.tsx.
        (c.buyer_pre_approval_amount ?? 0) > 0 ||
        (c.property_interest_type === "budget" && (c.property_interest ?? 0) > 0),
    )
    .map((c) => ({
      id: c.id,
      name: c.name,
      status: c.status,
      budget:
        (c.buyer_pre_approval_amount ?? 0) ||
        (c.property_interest_type === "budget" ? (c.property_interest ?? 0) : 0),
      preApproved: c.buyer_pre_approved ?? false,
      targetCloseDate: c.buyer_target_close_date ?? null,
      statusChangedAt: c.updated_at ?? null,
    }));

  // The table names each deal and listing by its client (2026-11-26). Only the
  // clients those rows link, read in batches so a long id list stays short.
  const linkedIds = [
    ...new Set(
      [
        ...(dealsResult.data ?? []).filter((d) => d.stage !== "closed" && d.stage !== "lost").map((d) => d.client_id),
        ...(listingsResult.data ?? []).map((l) => l.client_id),
      ].filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  ];
  const clientNamesById: Record<string, string> = {};
  for (let i = 0; i < linkedIds.length; i += 200) {
    const { data, error } = await supabase
      .from("clients")
      .select("id, name")
      .eq("user_id", user.id)
      .in("id", linkedIds.slice(i, i + 200));
    if (error) {
      // Rows fall back to the name stored on the deal, or the address.
      console.error("[pipeline] client names read failed:", error.code ?? "", error.message);
      break;
    }
    for (const c of data ?? []) if (c.name) clientNamesById[c.id] = c.name;
  }

  // Map transactions to ClosedTransaction shape
  const closedTransactions: ClosedTransaction[] = (txResult.data ?? []).map(
    (t) => ({
      id: t.id,
      salePrice: t.sale_price,
      pipelineDealId: t.pipeline_deal_id ?? null,
    }),
  );

  const seed: PipelineSeedData = {
    pipelineDeals: dealsResult.data ?? [],
    listingAppointments: listingsResult.data ?? [],
    buyerClients,
    closedTransactions,
    defaultCommissionPct: 0.025,
    opportunities: opportunitiesResult.data ?? [],
    referralOpportunities: referralsResult.data ?? [],
    clientNamesById,
  };

  return <PipelineContent seed={seed} />;
}
