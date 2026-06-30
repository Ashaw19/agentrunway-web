"use client";

/**
 * Opportunity cockpit strip — the 4-KPI instrument header for the
 * pre-transactional Opportunities section.
 *
 * All four numbers come from the canonical `opportunity-conversion-engine`
 * (CLAUDE.md #2 — call the engine, never recompute the math inline). This
 * component only maps `OpportunityV[]` rows into the engine input shape, asks
 * the engine for the 90d AND YTD windows, and renders.
 */

import { useMemo } from "react";
import { Briefcase, TrendingUp, Target, TrendingDown } from "lucide-react";
import { CockpitStrip, CockpitStat } from "@/components/cockpit-ui";
import {
  computeOpportunityKpis,
  effectiveOdds,
  type OpportunityRow,
} from "@/lib/engines/opportunity-conversion-engine";
import {
  lossReasonLabel,
  type OpportunityLossReason,
} from "@/lib/opportunity-loss-reasons";
import type { OpportunityV, OpportunityType } from "@/lib/types/database";
import { fmtCurrency, fmtPct } from "@/lib/formatters";

// The engine's OpportunityRow field names line up 1:1 with OpportunityV — this
// is a structural pass-through, not a remap (per the brief).
function toRow(o: OpportunityV): OpportunityRow {
  return {
    id: o.id,
    opportunity_type: o.opportunity_type,
    status: o.status,
    estimated_price: o.estimated_price,
    estimated_commission_pct: o.estimated_commission_pct,
    close_odds_pct: o.close_odds_pct,
    expected_close_date: o.expected_close_date,
    lost_reason: o.lost_reason,
    opportunity_date: o.opportunity_date,
    updated_at: o.updated_at,
  };
}

/** Days elapsed since Jan 1 of `now`'s year — the YTD conversion window. */
function ytdWindowDays(now: Date): number {
  const jan1 = new Date(now.getFullYear(), 0, 1);
  const ms = now.getTime() - jan1.getTime();
  return Math.max(1, Math.ceil(ms / 86_400_000));
}

export function OpportunityCockpitStrip({
  opportunities,
}: {
  opportunities: OpportunityV[];
}) {
  const {
    kpis90,
    kpisYtd,
    typeBreakdown,
    gciByType,
  } = useMemo(() => {
    const rows = opportunities.map(toRow);
    const now = new Date();
    const kpis90 = computeOpportunityKpis(rows, 90, now);
    const kpisYtd = computeOpportunityKpis(rows, ytdWindowDays(now), now);

    // Open-count breakdown by type (independent of window — open is current).
    const typeBreakdown: Record<OpportunityType, number> = {
      listing_appointment: 0,
      buyer_prospect: 0,
      referral: 0,
    };
    // Weighted-GCI breakdown by type (open-only, matching engine weightedGci).
    const gciByType: Record<OpportunityType, number> = {
      listing_appointment: 0,
      buyer_prospect: 0,
      referral: 0,
    };
    for (const r of rows) {
      if (r.status !== "open") continue;
      typeBreakdown[r.opportunity_type] += 1;
      const gci = (r.estimated_price ?? 0) * (r.estimated_commission_pct ?? 0);
      if (gci > 0) gciByType[r.opportunity_type] += gci * effectiveOdds(r);
    }

    return { kpis90, kpisYtd, typeBreakdown, gciByType };
  }, [opportunities]);

  // ── Top-2 loss reasons inline (90d window) ──────────────────────────────
  const topReasons = kpis90.topLossReasons.slice(0, 2);

  return (
    <CockpitStrip className="px-5 py-4" animate={false}>
      <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
        {/* Open Opportunities ───────────────────────────────────────── */}
        <CockpitStat
          label="Open Opportunities"
          value={kpis90.openCount}
          icon={<Briefcase className="h-3.5 w-3.5" />}
          sub={
            kpis90.openCount > 0 ? (
              <span>
                {typeBreakdown.listing_appointment} listing ·{" "}
                {typeBreakdown.buyer_prospect} buyer ·{" "}
                {typeBreakdown.referral} referral
              </span>
            ) : (
              <span>None yet</span>
            )
          }
        />

        {/* Weighted Pre-Contract GCI ─────────────────────────────────── */}
        <CockpitStat
          label="Weighted Pre-Contract GCI"
          value={fmtCurrency(kpis90.weightedGci)}
          color="#10B981"
          icon={<TrendingUp className="h-3.5 w-3.5" />}
          sub={
            <span>
              {fmtCurrency(gciByType.listing_appointment)} listing ·{" "}
              {fmtCurrency(gciByType.buyer_prospect)} buyer ·{" "}
              {fmtCurrency(gciByType.referral)} referral
            </span>
          }
        />

        {/* Appointment → Contract conversion ─────────────────────────── */}
        <CockpitStat
          label="Appt → Contract"
          value={
            kpis90.conversionRatePct == null
              ? "—"
              : fmtPct(kpis90.conversionRatePct)
          }
          color="#3B5EF6"
          icon={<Target className="h-3.5 w-3.5" />}
          sub={
            <span>
              trailing 90d · YTD{" "}
              {kpisYtd.conversionRatePct == null
                ? "—"
                : fmtPct(kpisYtd.conversionRatePct)}
            </span>
          }
        />

        {/* Loss Rate ─────────────────────────────────────────────────── */}
        <CockpitStat
          label="Loss Rate"
          value={
            kpis90.lossRatePct == null ? "—" : fmtPct(kpis90.lossRatePct)
          }
          color="#EF4444"
          icon={<TrendingDown className="h-3.5 w-3.5" />}
          sub={
            topReasons.length > 0 ? (
              <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                {topReasons.map((r) => (
                  <span
                    key={r.reason}
                    className="inline-flex items-center gap-1"
                  >
                    {/* Simple inline mini-bar — width ∝ share of losses. No
                        charting dep (brief: keep it SIMPLE). */}
                    <span
                      className="inline-block h-1.5 rounded-full bg-red-400/70"
                      style={{ width: `${Math.max(6, Math.round(r.pct * 28))}px` }}
                    />
                    {lossReasonLabel(r.reason as OpportunityLossReason)} ({r.count})
                  </span>
                ))}
              </span>
            ) : (
              <span>No losses in 90d</span>
            )
          }
        />
      </div>
    </CockpitStrip>
  );
}
