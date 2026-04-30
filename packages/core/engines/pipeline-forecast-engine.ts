/**
 * Pipeline Forecast Engine
 *
 * Pure-function engine that unifies three pipeline data sources
 * (deals, listing appointments, buyer clients) into a single
 * weighted-GCI forecast with accuracy tracking and funnel metrics.
 */

import type {
  PipelineDeal,
  PipelineStage,
  ListingAppointment,
  TransactionSide,
} from "../types/database";

import {
  computeProbability,
  computeEstimatedGCI,
  computeWeightedGCI,
  PIPELINE_STAGE_DEFAULTS,
} from "../types/database";

// ── Types ──────────────────────────────────────────────────────────────

export type UnifiedStage =
  | "pre_qualifying" // listings=scheduled, buyers=boarding, deals=lead
  | "active"         // listings=active, buyers=in_flight, deals=showing
  | "offer"          // deals=offer
  | "conditional"    // deals=conditional
  | "firm"           // deals=firm
  | "closed";        // deals=closed, listings=sold

export interface UnifiedPipelineItem {
  id: string;
  source: "deal" | "listing" | "buyer";
  name: string;              // address or client name
  stage: string;             // original stage from the source
  unifiedStage: UnifiedStage;
  side: "buy" | "sell" | "both";
  estimatedValue: number;    // estimated sale/purchase price
  commissionPct: number;     // commission rate
  estimatedGCI: number;      // value * commission
  probability: number;       // 0-1
  weightedGCI: number;       // estimatedGCI * probability
  expectedCloseDate: string | null;
  clientName: string | null;
  daysInStage: number | null;
  /**
   * True when the row's probability is set by a manual override on the
   * source record (only meaningful for source = "deal"). The UI uses
   * this to flag rows where the agent has bypassed stage-default
   * probabilities — important context when a 0% or 100% override
   * silently zeros or maxes a row in the weighted total.
   */
  manualOverride: boolean;
}

export interface AccuracyMetric {
  avgErrorPct: number;       // average absolute error as percentage (e.g. 0.08 = 8% off)
  medianErrorPct: number;
  sampleSize: number;
  overEstimateCount: number;
  underEstimateCount: number;
}

export interface ForecastAccuracyResult {
  listingAccuracy: AccuracyMetric | null;
  dealAccuracy: AccuracyMetric | null;
  overallScore: number | null; // weighted average, 0-100 (100 = perfect)
  sampleSize: number;
}

export interface FunnelStep {
  stage: string;
  count: number;
  conversionRate: number | null; // null for first stage
}

export interface ConversionFunnelResult {
  dealFunnel: FunnelStep[];
  listingFunnel: FunnelStep[];
  buyerFunnel: FunnelStep[];
}

export interface PipelineForecastResult {
  items: UnifiedPipelineItem[];
  totalWeightedGCI: number;
  dealWeightedGCI: number;
  listingWeightedGCI: number;
  buyerWeightedGCI: number;
  dealCount: number;
  listingCount: number;
  buyerCount: number;
  /** Deals with no expectedCloseDate or with a date >180 days in the past. */
  staleDealCount: number;
  /** WeightedGCI contribution of stale deals — flag for the UI to caveat the total. */
  staleWeightedGCI: number;
  accuracy: ForecastAccuracyResult;
  funnel: ConversionFunnelResult;
}

// ── Input types ────────────────────────────────────────────────────────

export interface BuyerClient {
  id: string;
  name: string;
  status: string;            // ClientStatus value
  budget: number;            // buyer_pre_approval_amount or property_interest
  preApproved: boolean;
  targetCloseDate: string | null;
  statusChangedAt: string | null; // for days-in-stage calc
}

export interface ClosedTransaction {
  id: string;
  salePrice: number;
  pipelineDealId: string | null;
  listingAppointmentId?: string | null;
}

export interface PipelineForecastInput {
  pipelineDeals: PipelineDeal[];
  listingAppointments: ListingAppointment[];
  /** Only clients in boarding/in_flight with buyer data (pre-filtered by caller) */
  buyerClients: BuyerClient[];
  /** For accuracy: closed transactions with pipeline_deal_id */
  closedTransactions: ClosedTransaction[];
  /** Default commission rate when listing doesn't have one */
  defaultCommissionPct: number; // e.g. 0.025
}

// ── Helpers ────────────────────────────────────────────────────────────

const DEAL_STAGE_TO_UNIFIED: Record<string, UnifiedStage> = {
  lead: "pre_qualifying",
  showing: "active",
  offer: "offer",
  conditional: "conditional",
  firm: "firm",
  closed: "closed",
};

const LISTING_STATUS_TO_UNIFIED: Record<string, UnifiedStage> = {
  scheduled: "pre_qualifying",
  active: "active",
  sold: "closed",
};

const BUYER_STATUS_TO_UNIFIED: Record<string, UnifiedStage> = {
  boarding:  "pre_qualifying",
  scheduled: "pre_qualifying", // future-intent buyer (4-stage redesign)
  in_flight: "active",
};

const LISTING_PROBABILITIES: Record<string, number> = {
  scheduled: 0.15,
  active: 0.40,
};

const BUYER_PROBABILITIES: Record<string, number> = {
  boarding:  0.10,
  scheduled: 0.05, // deferred intent — lower conversion probability than Boarding
  in_flight: 0.25,
};

function daysBetween(from: string | null, to: Date): number | null {
  if (!from) return null;
  const start = new Date(from);
  if (isNaN(start.getTime())) return null;
  const diffMs = to.getTime() - start.getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function normalizeSide(side: TransactionSide): "buy" | "sell" | "both" {
  if (side === "buyer") return "buy";
  if (side === "seller") return "sell";
  return "both";
}

// ── Main Engine ────────────────────────────────────────────────────────

export function computePipelineForecast(
  input: PipelineForecastInput,
): PipelineForecastResult {
  const now = new Date();
  const items: UnifiedPipelineItem[] = [];

  // ── 1. Map pipeline deals ──────────────────────────────────────────
  const activeDeals = input.pipelineDeals.filter((d) => d.stage !== "closed");
  for (const deal of activeDeals) {
    const prob = computeProbability(deal);
    const gci = computeEstimatedGCI(deal);
    items.push({
      id: deal.id,
      source: "deal",
      name: deal.address,
      stage: deal.stage,
      unifiedStage: DEAL_STAGE_TO_UNIFIED[deal.stage] ?? "pre_qualifying",
      side: normalizeSide(deal.side),
      estimatedValue: deal.estimated_price,
      commissionPct: deal.estimated_commission_pct,
      estimatedGCI: gci,
      probability: prob,
      weightedGCI: gci * prob,
      expectedCloseDate: deal.expected_close_date,
      clientName: deal.client_name || null,
      daysInStage: daysBetween(deal.updated_at, now),
      manualOverride: deal.probability_override != null,
    });
  }

  // ── 2. Map listing appointments ────────────────────────────────────
  const activeListings = input.listingAppointments.filter(
    (la) => la.status === "scheduled" || la.status === "active",
  );
  for (const listing of activeListings) {
    const value = listing.estimated_list_price ?? 0;
    const commPct =
      listing.estimated_commission_pct ?? input.defaultCommissionPct;
    const prob = LISTING_PROBABILITIES[listing.status] ?? 0.15;
    const gci = value * commPct;
    items.push({
      id: listing.id,
      source: "listing",
      name: listing.property_address ?? "Listing appointment",
      stage: listing.status,
      unifiedStage: LISTING_STATUS_TO_UNIFIED[listing.status] ?? "pre_qualifying",
      side: "sell",
      estimatedValue: value,
      commissionPct: commPct,
      estimatedGCI: gci,
      probability: prob,
      weightedGCI: gci * prob,
      expectedCloseDate: listing.expected_close_date ?? null,
      clientName: null,
      daysInStage: daysBetween(listing.updated_at, now),
      manualOverride: false,
    });
  }

  // ── 3. Map buyer clients ───────────────────────────────────────────
  for (const buyer of input.buyerClients) {
    const prob = BUYER_PROBABILITIES[buyer.status] ?? 0.10;
    const gci = buyer.budget * input.defaultCommissionPct;
    items.push({
      id: buyer.id,
      source: "buyer",
      name: buyer.name,
      stage: buyer.status,
      unifiedStage: BUYER_STATUS_TO_UNIFIED[buyer.status] ?? "pre_qualifying",
      side: "buy",
      estimatedValue: buyer.budget,
      commissionPct: input.defaultCommissionPct,
      estimatedGCI: gci,
      probability: prob,
      weightedGCI: gci * prob,
      expectedCloseDate: buyer.targetCloseDate,
      clientName: buyer.name,
      daysInStage: daysBetween(buyer.statusChangedAt, now),
      manualOverride: false,
    });
  }

  // ── 4. Compute accuracy ────────────────────────────────────────────
  const accuracy = computeAccuracy(input);

  // ── 5. Compute funnels ─────────────────────────────────────────────
  const funnel = computeFunnel(input);

  // ── 6. Aggregate ───────────────────────────────────────────────────
  const dealItems = items.filter((i) => i.source === "deal");
  const listingItems = items.filter((i) => i.source === "listing");
  const buyerItems = items.filter((i) => i.source === "buyer");

  const dealWeightedGCI = dealItems.reduce((s, i) => s + i.weightedGCI, 0);
  const listingWeightedGCI = listingItems.reduce((s, i) => s + i.weightedGCI, 0);
  const buyerWeightedGCI = buyerItems.reduce((s, i) => s + i.weightedGCI, 0);

  // Stale deals: deals with no expectedCloseDate or with a date >180 days
  // in the past (the "parked indefinitely" signal). Without this flag the
  // forecast aggregates these at full weight even though they may never
  // close — the UI can warn that part of the total is suspect.
  const STALE_DAYS = 180;
  const cutoff = now.getTime() - STALE_DAYS * 86_400_000;
  const staleItems = dealItems.filter((i) => {
    if (!i.expectedCloseDate) return true;
    const t = new Date(i.expectedCloseDate).getTime();
    return Number.isFinite(t) && t < cutoff;
  });
  const staleWeightedGCI = staleItems.reduce((s, i) => s + i.weightedGCI, 0);

  return {
    items,
    totalWeightedGCI: dealWeightedGCI + listingWeightedGCI + buyerWeightedGCI,
    dealWeightedGCI,
    listingWeightedGCI,
    buyerWeightedGCI,
    dealCount: dealItems.length,
    listingCount: listingItems.length,
    buyerCount: buyerItems.length,
    staleDealCount: staleItems.length,
    staleWeightedGCI,
    accuracy,
    funnel,
  };
}

// ── Accuracy ───────────────────────────────────────────────────────────

function computeAccuracy(input: PipelineForecastInput): ForecastAccuracyResult {
  // Listing accuracy: sold listings with both estimated and actual prices
  const listingAccuracy = computeListingAccuracy(input.listingAppointments);

  // Deal accuracy: closed transactions matched to pipeline deals
  const dealAccuracy = computeDealAccuracy(
    input.closedTransactions,
    input.pipelineDeals,
  );

  // Overall score: weighted average by sample size
  const listingSamples = listingAccuracy?.sampleSize ?? 0;
  const dealSamples = dealAccuracy?.sampleSize ?? 0;
  const totalSamples = listingSamples + dealSamples;

  let overallScore: number | null = null;
  if (totalSamples > 0) {
    const listingError = listingAccuracy?.avgErrorPct ?? 0;
    const dealError = dealAccuracy?.avgErrorPct ?? 0;
    const weightedError =
      (listingError * listingSamples + dealError * dealSamples) / totalSamples;
    overallScore = Math.max(0, Math.min(100, Math.round(100 * (1 - weightedError))));
  }

  return {
    listingAccuracy,
    dealAccuracy,
    overallScore,
    sampleSize: totalSamples,
  };
}

function computeListingAccuracy(
  listings: ListingAppointment[],
): AccuracyMetric | null {
  const errors: number[] = [];
  let over = 0;
  let under = 0;

  for (const la of listings) {
    if (
      la.status !== "sold" ||
      la.estimated_list_price == null ||
      la.actual_sale_price == null ||
      la.actual_sale_price <= 0
    ) {
      continue;
    }
    const errorPct =
      Math.abs(la.estimated_list_price - la.actual_sale_price) /
      la.actual_sale_price;
    errors.push(errorPct);
    if (la.estimated_list_price > la.actual_sale_price) over++;
    else if (la.estimated_list_price < la.actual_sale_price) under++;
  }

  if (errors.length === 0) return null;

  return {
    avgErrorPct: errors.reduce((s, e) => s + e, 0) / errors.length,
    medianErrorPct: median(errors),
    sampleSize: errors.length,
    overEstimateCount: over,
    underEstimateCount: under,
  };
}

function computeDealAccuracy(
  closedTransactions: ClosedTransaction[],
  pipelineDeals: PipelineDeal[],
): AccuracyMetric | null {
  const dealMap = new Map<string, PipelineDeal>();
  for (const deal of pipelineDeals) {
    dealMap.set(deal.id, deal);
  }

  const errors: number[] = [];
  let over = 0;
  let under = 0;

  for (const tx of closedTransactions) {
    if (!tx.pipelineDealId || tx.salePrice <= 0) continue;
    const deal = dealMap.get(tx.pipelineDealId);
    if (!deal || deal.original_estimated_price == null) continue;

    const errorPct =
      Math.abs(deal.original_estimated_price - tx.salePrice) / tx.salePrice;
    errors.push(errorPct);
    if (deal.original_estimated_price > tx.salePrice) over++;
    else if (deal.original_estimated_price < tx.salePrice) under++;
  }

  if (errors.length === 0) return null;

  return {
    avgErrorPct: errors.reduce((s, e) => s + e, 0) / errors.length,
    medianErrorPct: median(errors),
    sampleSize: errors.length,
    overEstimateCount: over,
    underEstimateCount: under,
  };
}

// ── Funnel ─────────────────────────────────────────────────────────────

function computeFunnel(input: PipelineForecastInput): ConversionFunnelResult {
  return {
    dealFunnel: computeDealFunnel(input.pipelineDeals),
    listingFunnel: computeListingFunnel(input.listingAppointments),
    buyerFunnel: computeBuyerFunnel(input.buyerClients),
  };
}

function buildFunnel(stages: string[], counts: Map<string, number>): FunnelStep[] {
  const steps: FunnelStep[] = [];
  for (let i = 0; i < stages.length; i++) {
    const stage = stages[i];
    const count = counts.get(stage) ?? 0;
    let conversionRate: number | null = null;
    if (i > 0) {
      const prevCount = steps[i - 1].count;
      conversionRate = prevCount > 0 ? count / prevCount : null;
    }
    steps.push({ stage, count, conversionRate });
  }
  return steps;
}

function computeDealFunnel(deals: PipelineDeal[]): FunnelStep[] {
  const stages: PipelineStage[] = [
    "lead",
    "showing",
    "offer",
    "conditional",
    "firm",
    "closed",
  ];
  const counts = new Map<string, number>();
  for (const s of stages) counts.set(s, 0);
  for (const deal of deals) {
    counts.set(deal.stage, (counts.get(deal.stage) ?? 0) + 1);
  }
  return buildFunnel(stages, counts);
}

function computeListingFunnel(listings: ListingAppointment[]): FunnelStep[] {
  const stages = ["scheduled", "active", "sold"];
  const counts = new Map<string, number>();
  for (const s of stages) counts.set(s, 0);
  for (const la of listings) {
    if (counts.has(la.status)) {
      counts.set(la.status, (counts.get(la.status) ?? 0) + 1);
    }
  }
  return buildFunnel(stages, counts);
}

function computeBuyerFunnel(buyers: BuyerClient[]): FunnelStep[] {
  const stages = ["scheduled", "boarding", "in_flight"];
  const counts = new Map<string, number>();
  for (const s of stages) counts.set(s, 0);
  for (const buyer of buyers) {
    if (counts.has(buyer.status)) {
      counts.set(buyer.status, (counts.get(buyer.status) ?? 0) + 1);
    }
  }
  return buildFunnel(stages, counts);
}

// ── Convenience helpers ────────────────────────────────────────────────

/** Sum of listing + buyer weighted GCI (pre-transactional pipeline value) */
export function computePreTransactionalWeightedGCI(
  result: PipelineForecastResult,
): number {
  return result.listingWeightedGCI + result.buyerWeightedGCI;
}
