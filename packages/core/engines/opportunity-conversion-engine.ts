/**
 * Opportunity Conversion Engine
 *
 * Pure-function engine reading from the opportunities_v unified view.
 * Computes pre-transactional KPIs: open count, weighted GCI, conversion %,
 * loss rate, top loss reasons.
 *
 * Inputs are plain rows (caller fetches from opportunities_v).
 */

import type { OpportunityLossReason } from "../lib/opportunity-loss-reasons";

export type OpportunityType = "listing_appointment" | "buyer_prospect" | "referral";
export type OpportunityStatus = "open" | "converted" | "lost";

export interface OpportunityRow {
  id: string;
  opportunity_type: OpportunityType;
  status: OpportunityStatus;
  estimated_price: number | null;
  estimated_commission_pct: number | null;
  close_odds_pct: number | null;
  expected_close_date: string | null;
  lost_reason: string | null;
  opportunity_date: string;     // YYYY-MM-DD
  updated_at: string;           // ISO timestamp
}

export const OPPORTUNITY_DEFAULT_ODDS: Record<OpportunityType, number> = {
  listing_appointment: 0.40,
  buyer_prospect:      0.25,
  referral:            0.20,
};

export function effectiveOdds(row: OpportunityRow): number {
  if (row.close_odds_pct !== null && row.close_odds_pct !== undefined) {
    return row.close_odds_pct;
  }
  return OPPORTUNITY_DEFAULT_ODDS[row.opportunity_type];
}
