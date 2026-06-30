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

export function computeOpportunityWeightedGci(rows: OpportunityRow[]): number {
  let total = 0;
  for (const r of rows) {
    if (r.status !== "open") continue;
    const price = r.estimated_price ?? 0;
    const pct = r.estimated_commission_pct ?? 0;
    const gci = price * pct;
    if (gci === 0) continue;
    total += gci * effectiveOdds(r);
  }
  return total;
}

export interface OpportunityKpis {
  openCount: number;
  weightedGci: number;
  conversionRatePct: number | null;
  lossRatePct: number | null;
  topLossReasons: Array<{ reason: string; count: number; pct: number }>;
}

export function computeOpportunityKpis(
  rows: OpportunityRow[],
  windowDays: number,
  now: Date = new Date(),
): OpportunityKpis {
  const cutoff = now.getTime() - windowDays * 86_400_000;

  let openCount = 0;
  let converted = 0;
  let lost = 0;
  const lossReasonCounts = new Map<string, number>();

  for (const r of rows) {
    if (r.status === "open") {
      openCount += 1;
      continue;
    }
    const t = Date.parse(r.updated_at);
    if (isNaN(t) || t < cutoff) continue;

    if (r.status === "converted") {
      converted += 1;
    } else if (r.status === "lost") {
      lost += 1;
      const key = r.lost_reason ?? "other";
      lossReasonCounts.set(key, (lossReasonCounts.get(key) ?? 0) + 1);
    }
  }

  const closedTotal = converted + lost;
  const conversionRatePct = closedTotal === 0 ? null : converted / closedTotal;
  const lossRatePct       = closedTotal === 0 ? null : lost / closedTotal;

  const topLossReasons = Array.from(lossReasonCounts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([reason, count]) => ({
      reason,
      count,
      pct: lost === 0 ? 0 : count / lost,
    }));

  return {
    openCount,
    weightedGci: computeOpportunityWeightedGci(rows),
    conversionRatePct,
    lossRatePct,
    topLossReasons,
  };
}
