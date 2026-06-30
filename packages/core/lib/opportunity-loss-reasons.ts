/**
 * Shared loss-reason vocabulary for pre-transactional opportunities.
 *
 * Mirrored by CHECK constraints on listing_appointments, pipeline_deals,
 * and referral_opportunities. The DB enforces value validity; this file
 * is the source of truth for UI labels and ordering.
 */

export const OPPORTUNITY_LOSS_REASONS = [
  "chose_other_agent",
  "decided_not_to_transact",
  "price_disagreement",
  "timing_deferred",
  "out_of_area",
  "financing_fell_through",
  "lost_contact",
  "other",
] as const;

export type OpportunityLossReason = typeof OPPORTUNITY_LOSS_REASONS[number];

const LABELS: Record<OpportunityLossReason, string> = {
  chose_other_agent:      "Went with another agent",
  decided_not_to_transact:"Decided not to sell/buy",
  price_disagreement:     "Couldn't agree on price",
  timing_deferred:        "Timing pushed to later",
  out_of_area:            "Outside my service area",
  financing_fell_through: "Financing fell through",
  lost_contact:           "Lost contact",
  other:                  "Other",
};

export function isOpportunityLossReason(v: unknown): v is OpportunityLossReason {
  return typeof v === "string" && (OPPORTUNITY_LOSS_REASONS as readonly string[]).includes(v);
}

export function lossReasonLabel(reason: OpportunityLossReason): string {
  if (LABELS[reason]) return LABELS[reason];
  const s = String(reason).replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}
