"use client";

/**
 * A single open-opportunity card for the Pipeline → Opportunities section.
 *
 * Type-driven action buttons:
 *  - listing_appointment / referral → [Promote] + [Lost]
 *  - buyer_prospect                 → [Advance Stage] + [Lost]
 *
 * Close odds are inline-editable (single-table UPDATE on blur, then
 * router.refresh()). Display default uses the engine's `effectiveOdds`.
 */

import { useState } from "react";
import { Home, Users, Share2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { fmtCurrency, fmtPct } from "@/lib/formatters";
import { effectiveOdds, type OpportunityRow } from "@/lib/engines/opportunity-conversion-engine";
import type { OpportunityV, OpportunityType } from "@/lib/types/database";

const TYPE_META: Record<
  OpportunityType,
  { icon: React.ReactNode; label: string; accent: string }
> = {
  listing_appointment: {
    icon: <Home className="h-4 w-4" />,
    label: "Listing Appt",
    // violet accent
    accent: "border-violet-200 bg-violet-50 text-violet-600 dark:border-violet-900/50 dark:bg-violet-950/30 dark:text-violet-300",
  },
  buyer_prospect: {
    icon: <Users className="h-4 w-4" />,
    label: "Buyer Prospect",
    // sky accent
    accent: "border-sky-200 bg-sky-50 text-sky-600 dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-300",
  },
  referral: {
    icon: <Share2 className="h-4 w-4" />,
    label: "Referral",
    // slate accent
    accent: "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-300",
  },
};

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

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso + (iso.length === 10 ? "T12:00:00" : ""));
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" });
}

export function OpportunityCard({
  opportunity,
  onPromote,
  onAdvance,
  onLost,
  onCloseOddsChange,
}: {
  opportunity: OpportunityV;
  onPromote: (o: OpportunityV) => void;
  onAdvance: (o: OpportunityV) => void;
  onLost: (o: OpportunityV) => void;
  /** Persists a single-table close-odds UPDATE (0..1). Resolves when written. */
  onCloseOddsChange: (o: OpportunityV, oddsFraction: number) => Promise<void>;
}) {
  const meta = TYPE_META[opportunity.opportunity_type];
  const estGci =
    (opportunity.estimated_price ?? 0) * (opportunity.estimated_commission_pct ?? 0);
  const odds = effectiveOdds(toRow(opportunity));
  const usesDefault = opportunity.close_odds_pct == null;

  // ── Inline close-odds editor ────────────────────────────────────────────
  const [editingOdds, setEditingOdds] = useState(false);
  const [oddsDraft, setOddsDraft] = useState<string>("");
  const [savingOdds, setSavingOdds] = useState(false);

  const beginEditOdds = () => {
    setOddsDraft(String(Math.round(odds * 100)));
    setEditingOdds(true);
  };

  const commitOdds = async () => {
    const pct = Number(oddsDraft);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      setEditingOdds(false);
      return;
    }
    const fraction = pct / 100;
    if (Math.abs(fraction - odds) < 1e-9 && !usesDefault) {
      setEditingOdds(false);
      return;
    }
    setSavingOdds(true);
    try {
      await onCloseOddsChange(opportunity, fraction);
    } finally {
      setSavingOdds(false);
      setEditingOdds(false);
    }
  };

  const isBuyer = opportunity.opportunity_type === "buyer_prospect";

  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <span
            className={cn(
              "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border",
              meta.accent,
            )}
            title={meta.label}
          >
            {meta.icon}
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">{opportunity.title}</p>
            <p className="text-xs text-muted-foreground">{meta.label}</p>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-semibold tabular-nums text-foreground">
            {fmtCurrency(opportunity.estimated_price ?? 0)}
          </p>
          <p className="text-xs text-muted-foreground tabular-nums">
            Est. GCI {fmtCurrency(estGci)}
          </p>
        </div>
      </div>

      {/* ── Meta row: close odds (inline-edit) · expected close ───────── */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Close odds</span>
          {editingOdds ? (
            <span className="inline-flex items-center gap-1">
              <Input
                autoFocus
                type="number"
                min={0}
                max={100}
                step={5}
                value={oddsDraft}
                onChange={(e) => setOddsDraft(e.target.value)}
                onBlur={commitOdds}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitOdds();
                  if (e.key === "Escape") setEditingOdds(false);
                }}
                disabled={savingOdds}
                className="h-6 w-16 px-1.5 py-0 text-xs tabular-nums"
                aria-label="Close odds percent"
              />
              <span className="text-muted-foreground">%</span>
              {savingOdds && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
            </span>
          ) : (
            <button
              type="button"
              onClick={beginEditOdds}
              className={cn(
                "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium tabular-nums hover:bg-muted",
                usesDefault ? "text-muted-foreground" : "text-foreground",
              )}
              title="Click to edit close odds"
            >
              {fmtPct(odds)}
              {usesDefault && (
                <span className="text-[10px] uppercase text-muted-foreground/70">default</span>
              )}
            </button>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Expected close</span>
          <span className="font-medium tabular-nums text-foreground">
            {formatDate(opportunity.expected_close_date)}
          </span>
        </div>
      </div>

      {/* ── Notes preview ─────────────────────────────────────────────── */}
      {opportunity.notes && opportunity.notes.trim() && (
        <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
          {opportunity.notes.trim()}
        </p>
      )}

      {/* ── Actions ───────────────────────────────────────────────────── */}
      <div className="mt-3 flex items-center gap-2">
        {isBuyer ? (
          <Button size="sm" onClick={() => onAdvance(opportunity)} className="gap-1.5">
            Advance Stage
          </Button>
        ) : (
          <Button size="sm" onClick={() => onPromote(opportunity)} className="gap-1.5">
            Promote
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onLost(opportunity)}
          className="text-muted-foreground hover:text-red-600"
        >
          Lost
        </Button>
      </div>
    </div>
  );
}
