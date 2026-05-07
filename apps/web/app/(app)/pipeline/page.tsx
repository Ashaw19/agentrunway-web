import { createClient } from "@/lib/supabase/server";
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
  const year = new Date().getFullYear();

  const [dealsResult, listingsResult, clientsResult, txResult] =
    await Promise.all([
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
      supabase
        .from("clients")
        .select("*")
        .eq("user_id", user.id)
        // Include "scheduled" buyers (future-intent stage from the 4-stage
        // redesign) — they're forecasted at a low probability so the
        // pipeline reflects pre-transactional capture too.
        .in("status", ["boarding", "scheduled", "in_flight"])
        .limit(10000),
      supabase
        .from("transactions")
        .select("id, sale_price, pipeline_deal_id")
        .eq("user_id", user.id)
        .eq("status", "closed")
        .gte("date", `${year}-01-01`)
        .not("pipeline_deal_id", "is", null)
        .limit(10000),
    ]);

  // Map clients to BuyerClient shape — only include those with buyer data
  const buyerClients: BuyerClient[] = (clientsResult.data ?? [])
    .filter(
      (c) =>
        (c.buyer_pre_approval_amount ?? 0) > 0 || (c.property_interest ?? 0) > 0,
    )
    .map((c) => ({
      id: c.id,
      name: c.name,
      status: c.status,
      budget: (c.buyer_pre_approval_amount ?? 0) || (c.property_interest ?? 0),
      preApproved: c.buyer_pre_approved ?? false,
      targetCloseDate: c.buyer_target_close_date ?? null,
      statusChangedAt: c.updated_at ?? null,
    }));

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
  };

  return <PipelineContent seed={seed} />;
}
