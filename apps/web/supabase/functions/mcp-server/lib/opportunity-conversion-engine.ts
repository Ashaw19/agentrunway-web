// OpportunityConversion helpers — deliberate copy for mcp-server Edge Function.
//
// KEEP IN SYNC with packages/core/engines/opportunity-conversion-engine.ts
// If the canonical engine there changes, mirror the changes here in the same
// commit. Deno edge functions cannot import workspace packages directly, so
// this copy exists per Pattern P-2 (deliberate-duplicate guarded by review).
//
// WHY THIS EXISTS (2026-06-30 pipeline pre-transactional opportunities)
// ---------------------------------------------------------------------
// The Dispatcher's `list_opportunities` MCP tool needs the pre-transactional
// KPI summary (open count, weighted GCI, conversion %, loss rate, top loss
// reasons). Per CLAUDE.md checkpoint #2 the tool MUST call the canonical
// engine, not reimplement KPI math. Since Deno cannot import packages/core/*,
// this faithful copy is what the tool imports.
//
// The upstream engine imports `OpportunityLossReason` as a type from
// `../lib/opportunity-loss-reasons`. To avoid crossing the workspace boundary
// that type is INLINED below as a doc-only union (the engine itself only uses
// `lost_reason` as a free `string | null`; the type is informational).
//
// See:
//   - /Users/b/.claude/.../memory/feedback_data_consistency_protocol.md
//   - apps/web/supabase/functions/mcp-server/lib/README.md
//
// ESTIMATE ONLY — Not legal or tax advice.

// Inlined from packages/core/lib/opportunity-loss-reasons.ts (OPPORTUNITY_LOSS_REASONS).
// Doc-only: the engine treats lost_reason as an opaque string key.
export type OpportunityLossReason =
  | "chose_other_agent"
  | "decided_not_to_transact"
  | "price_disagreement"
  | "timing_deferred"
  | "out_of_area"
  | "financing_fell_through"
  | "lost_contact"
  | "other";

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
