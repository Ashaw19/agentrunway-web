import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { PipelineContent } from "./pipeline-content";
import {
  isSandboxActive,
  getSandboxData,
  mergeSandboxSettings,
} from "@/lib/sandbox-resolver";
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

// ── Sandbox synthetic data ────────────────────────────────────────────────

function buildSandboxSeed(sb: ReturnType<typeof getSandboxData>): PipelineSeedData {
  const pipelineDeals = sb.pipelineDeals ?? [];
  const listingAppointments = sb.listingAppointments ?? [];

  // Map sandbox clients to BuyerClient shape
  const buyerClients: BuyerClient[] = (sb.clients ?? [])
    .filter(
      (c) =>
        (c.status === "boarding" || c.status === "in_flight") &&
        ((c.buyer_pre_approval_amount ?? 0) > 0 || (c.property_interest ?? 0) > 0),
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

  // Map sandbox transactions to ClosedTransaction shape
  const year = new Date().getFullYear();
  const closedTransactions: ClosedTransaction[] = (sb.transactions ?? [])
    .filter(
      (t) =>
        t.status === "closed" &&
        t.pipeline_deal_id != null &&
        new Date(t.date).getFullYear() === year,
    )
    .map((t) => ({
      id: t.id,
      salePrice: t.sale_price,
      pipelineDealId: t.pipeline_deal_id ?? null,
    }));

  return {
    pipelineDeals,
    listingAppointments,
    buyerClients,
    closedTransactions,
    defaultCommissionPct: 0.025,
  };
}

// ── Fallback synthetic data when sandbox has no relevant records ───────

function buildFallbackSandboxSeed(): PipelineSeedData {
  const now = new Date().toISOString();
  const uid = "sandbox";

  return {
    pipelineDeals: [
      {
        id: "sb-deal-1", user_id: uid, address: "123 Maple St", estimated_price: 650000,
        estimated_commission_pct: 0.025, side: "buyer" as const, stage: "lead" as const,
        expected_close_date: null, client_name: "Sarah Chen", notes: "",
        probability_override: null, client_id: null, original_estimated_price: 650000,
        created_at: now, updated_at: now,
      },
      {
        id: "sb-deal-2", user_id: uid, address: "456 Oak Ave", estimated_price: 820000,
        estimated_commission_pct: 0.025, side: "seller" as const, stage: "showing" as const,
        expected_close_date: "2026-06-15", client_name: "Mike Johnson", notes: "",
        probability_override: null, client_id: null, original_estimated_price: 820000,
        created_at: now, updated_at: now,
      },
      {
        id: "sb-deal-3", user_id: uid, address: "789 Pine Rd", estimated_price: 475000,
        estimated_commission_pct: 0.025, side: "buyer" as const, stage: "offer" as const,
        expected_close_date: "2026-05-01", client_name: "Lisa Park", notes: "",
        probability_override: null, client_id: null, original_estimated_price: 475000,
        created_at: now, updated_at: now,
      },
      {
        id: "sb-deal-4", user_id: uid, address: "321 Birch Lane", estimated_price: 590000,
        estimated_commission_pct: 0.03, side: "seller" as const, stage: "conditional" as const,
        expected_close_date: "2026-04-20", client_name: "Tom Wright", notes: "",
        probability_override: null, client_id: null, original_estimated_price: 590000,
        created_at: now, updated_at: now,
      },
      {
        id: "sb-deal-5", user_id: uid, address: "654 Cedar Ct", estimated_price: 1100000,
        estimated_commission_pct: 0.025, side: "buyer" as const, stage: "firm" as const,
        expected_close_date: "2026-04-10", client_name: "Anna Roberts", notes: "",
        probability_override: null, client_id: null, original_estimated_price: 1100000,
        created_at: now, updated_at: now,
      },
    ],
    listingAppointments: [
      {
        id: "sb-la-1", user_id: uid, client_id: null, appointment_date: "2026-04-05",
        property_address: "88 Elm Dr", estimated_list_price: 720000,
        actual_list_price: null, actual_sale_price: null, status: "scheduled",
        estimated_commission_pct: 0.025, expected_close_date: null,
        listing_agreement_date: null, notes: null, created_at: now, updated_at: now,
      },
      {
        id: "sb-la-2", user_id: uid, client_id: null, appointment_date: "2026-03-10",
        property_address: "42 Willow Way", estimated_list_price: 510000,
        actual_list_price: 499000, actual_sale_price: null, status: "active",
        estimated_commission_pct: 0.025, expected_close_date: "2026-06-01",
        listing_agreement_date: "2026-03-12", notes: null, created_at: now, updated_at: now,
      },
      {
        id: "sb-la-3", user_id: uid, client_id: null, appointment_date: "2026-01-15",
        property_address: "17 Spruce Blvd", estimated_list_price: 680000,
        actual_list_price: 670000, actual_sale_price: 665000, status: "sold",
        estimated_commission_pct: 0.025, expected_close_date: null,
        listing_agreement_date: "2026-01-20", notes: null, created_at: now, updated_at: now,
      },
    ],
    buyerClients: [
      { id: "sb-buyer-1", name: "James Miller", status: "boarding",  budget: 550000, preApproved: true,  targetCloseDate: "2026-07-01", statusChangedAt: now },
      { id: "sb-buyer-2", name: "Emily Davis",  status: "in_flight", budget: 425000, preApproved: true,  targetCloseDate: "2026-05-15", statusChangedAt: now },
      { id: "sb-buyer-3", name: "Robert Kim",   status: "boarding",  budget: 780000, preApproved: false, targetCloseDate: null,         statusChangedAt: now },
    ],
    closedTransactions: [
      { id: "sb-ctx-1", salePrice: 640000, pipelineDealId: null },
      { id: "sb-ctx-2", salePrice: 510000, pipelineDealId: null },
    ],
    defaultCommissionPct: 0.025,
  };
}

// ── Page ───────────────────────────────────────────────────────────────────

export default async function PipelinePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Always fetch settings first to check sandbox mode
  const settingsResult = await supabase
    .from("user_settings")
    .select("*")
    .eq("user_id", user.id)
    .single();

  const rawSettings = settingsResult.data;

  if (isSandboxActive(rawSettings)) {
    const sb = getSandboxData(rawSettings);
    const settings = mergeSandboxSettings(rawSettings);
    let seed = buildSandboxSeed(sb);

    // If sandbox has no pipeline-relevant data, use fallback synthetic
    if (
      seed.pipelineDeals.length === 0 &&
      seed.listingAppointments.length === 0 &&
      seed.buyerClients.length === 0
    ) {
      seed = buildFallbackSandboxSeed();
    }

    seed.defaultCommissionPct =
      (settings as Record<string, unknown>)["default_commission_pct"] != null
        ? Number((settings as Record<string, unknown>)["default_commission_pct"])
        : 0.025;

    return <PipelineContent seed={seed} />;
  }

  // ── Normal path ───────────────────────────────────────────────────────
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
        .in("status", ["boarding", "in_flight"])
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
