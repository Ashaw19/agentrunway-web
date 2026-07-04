// ============================================================================
// Today's Actions Engine
// Pure-function engine: merges the three scored daily streams — Intelligence
// Briefing items, pre-transactional Opportunities, and pipeline deals — into
// one ranked "do these first" list for the CRM daily touchpoint.
//
// Deliberately deterministic and explainable: urgency comes from existing
// severities/stages/dates, dollar value from the existing weighted-GCI math.
// No new user-facing score is displayed — only an ordering.
// ============================================================================

import type { BriefingItem } from "./crm-analytics-engine";
import { effectiveOdds, type OpportunityRow } from "./opportunity-conversion-engine";
import { computeWeightedGCI, type PipelineDeal } from "../types/database";

// ── Input shapes ────────────────────────────────────────────────────────────

/** opportunities_v row slice needed for ranking (superset of OpportunityRow). */
export interface TodayOpportunityInput extends OpportunityRow {
  title: string;
  client_id: string | null;
}

export interface TodayDealInput {
  deal: PipelineDeal;
  /** Display label — address or client name, resolved by the caller. */
  title: string;
  clientId: string | null;
}

export interface TodaysActionsInput {
  briefingItems: BriefingItem[];
  opportunities: TodayOpportunityInput[];
  deals: TodayDealInput[];
  /** Trailing GCI per client (from client_records) — values briefing items. */
  clientGciById: Record<string, number>;
  asOf?: Date;
}

// ── Output shape ────────────────────────────────────────────────────────────

export type TodayActionSource = "briefing" | "opportunity" | "deal";

export interface TodayAction {
  /** Stable id: `${source}_${refId}` */
  id: string;
  source: TodayActionSource;
  refId: string;
  clientId: string | null;
  title: string;
  detail: string;
  /** Internal ranking urgency 0–100 — not for display. */
  urgency: number;
  /** Estimated dollars at stake (weighted GCI or trailing client GCI). */
  valueDollars: number;
  /** For briefing items: the original item (drives the Draft action). */
  briefingItem?: BriefingItem;
}

// ── Urgency heuristics (documented; tune here, nowhere else) ────────────────

const BRIEFING_URGENCY: Record<BriefingItem["severity"], number> = {
  urgent: 90,
  attention: 65,
  upcoming: 35,
};

const DEAL_STAGE_URGENCY: Record<string, number> = {
  offer: 75,
  conditional: 70,
  firm: 55,
  showing: 45,
  lead: 30,
};

const OPPORTUNITY_BASE_URGENCY = 50;
const CLOSE_SOON_DAYS = 14;
const CLOSE_SOON_BOOST = 20;
const STALE_OPPORTUNITY_DAYS = 21;
const STALE_OPPORTUNITY_BOOST = 15;

function daysUntil(dateStr: string | null, asOf: Date): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr.length === 10 ? dateStr + "T12:00:00" : dateStr);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((d.getTime() - asOf.getTime()) / 86_400_000);
}

// ── Main export ─────────────────────────────────────────────────────────────

export function computeTodaysActions(input: TodaysActionsInput): TodayAction[] {
  const asOf = input.asOf ?? new Date();
  const candidates: TodayAction[] = [];

  // 1. Briefing items — urgency from severity, value from trailing client GCI
  for (const item of input.briefingItems) {
    const overdueBoost = Math.min(10, Math.floor((item.daysValue ?? 0) / 3));
    candidates.push({
      id: `briefing_${item.id}`,
      source: "briefing",
      refId: item.id,
      clientId: item.clientId,
      title: item.title,
      detail: item.detail,
      urgency: Math.min(100, BRIEFING_URGENCY[item.severity] + overdueBoost),
      valueDollars: input.clientGciById[item.clientId] ?? 0,
      briefingItem: item,
    });
  }

  // 2. Open opportunities — value = single-row weighted GCI
  for (const opp of input.opportunities) {
    if (opp.status !== "open") continue;
    let urgency = OPPORTUNITY_BASE_URGENCY;
    const closeIn = daysUntil(opp.expected_close_date, asOf);
    if (closeIn !== null && closeIn >= 0 && closeIn <= CLOSE_SOON_DAYS) {
      urgency += CLOSE_SOON_BOOST;
    }
    const ageDays = daysUntil(opp.opportunity_date, asOf);
    if (ageDays !== null && ageDays <= -STALE_OPPORTUNITY_DAYS) {
      urgency += STALE_OPPORTUNITY_BOOST; // sitting untouched — needs a decision
    }
    const weighted =
      (opp.estimated_price ?? 0) *
      (opp.estimated_commission_pct ?? 0) *
      effectiveOdds(opp);
    const label =
      opp.opportunity_type === "listing_appointment"
        ? "Listing appointment"
        : opp.opportunity_type === "buyer_prospect"
          ? "Buyer prospect"
          : "Referral";
    candidates.push({
      id: `opportunity_${opp.id}`,
      source: "opportunity",
      refId: opp.id,
      clientId: opp.client_id,
      title: `${label}: ${opp.title}`,
      detail:
        closeIn !== null && closeIn >= 0
          ? `Expected to close in ${closeIn}d`
          : ageDays !== null && ageDays <= -STALE_OPPORTUNITY_DAYS
            ? `Open ${-ageDays}d without movement`
            : "Open opportunity",
      urgency: Math.min(100, urgency),
      valueDollars: Math.round(weighted),
    });
  }

  // 3. Pipeline deals — urgency from stage + close proximity
  for (const { deal, title, clientId } of input.deals) {
    let urgency = DEAL_STAGE_URGENCY[deal.stage] ?? 30;
    const closeIn = daysUntil(deal.expected_close_date ?? null, asOf);
    if (closeIn !== null && closeIn >= 0 && closeIn <= CLOSE_SOON_DAYS) {
      urgency += CLOSE_SOON_BOOST;
    }
    candidates.push({
      id: `deal_${deal.id}`,
      source: "deal",
      refId: deal.id,
      clientId,
      title: `${stageLabel(deal.stage)}: ${title}`,
      detail:
        closeIn !== null && closeIn >= 0
          ? `Closing in ${closeIn}d`
          : `In ${stageLabel(deal.stage).toLowerCase()}`,
      urgency: Math.min(100, urgency),
      valueDollars: Math.round(computeWeightedGCI(deal)),
    });
  }

  // ── Dedupe ────────────────────────────────────────────────────────────────
  // A buyer_prospect opportunity IS a pipeline_deals row (shared id, see
  // migration 00156) — keep whichever entry ranks higher.
  const byRef = new Map<string, TodayAction>();
  for (const c of candidates) {
    const existing = byRef.get(c.refId);
    if (!existing || rankKey(c) > rankKey(existing)) byRef.set(c.refId, c);
  }

  // ── Rank: urgency band first, then dollars, then raw urgency ─────────────
  const ranked = [...byRef.values()].sort((a, b) => rankKey(b) - rankKey(a));

  // Max one action per client so a single relationship can't fill the strip.
  const seenClients = new Set<string>();
  const out: TodayAction[] = [];
  for (const action of ranked) {
    if (action.clientId) {
      if (seenClients.has(action.clientId)) continue;
      seenClients.add(action.clientId);
    }
    out.push(action);
  }
  return out;
}

function urgencyBand(u: number): number {
  if (u >= 80) return 2;
  if (u >= 55) return 1;
  return 0;
}

/** Sortable composite: band (dominant) → value (log-damped) → urgency. */
function rankKey(a: TodayAction): number {
  return (
    urgencyBand(a.urgency) * 1_000_000 +
    Math.min(999_990, Math.round(Math.log10(1 + Math.max(0, a.valueDollars)) * 10_000)) +
    a.urgency
  );
}

function stageLabel(stage: string): string {
  const labels: Record<string, string> = {
    lead: "Lead",
    showing: "Showing",
    offer: "Offer out",
    conditional: "Conditional",
    firm: "Firm deal",
  };
  return labels[stage] ?? stage;
}
