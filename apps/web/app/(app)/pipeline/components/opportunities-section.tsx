"use client";

/**
 * Opportunities section — the pre-transactional surface that mounts at the TOP
 * of the Pipeline tab (above the existing deals/listings/buyers sections).
 *
 * Owns:
 *  - the 4-KPI cockpit strip (engine-computed)
 *  - the list of open-opportunity cards (sorted expected_close ASC NULLS LAST,
 *    then opportunity_date DESC), rendering ONLY status='open' rows
 *  - the Add / Promote / Advance / Lost dialogs and their selected-row state
 *  - the inline close-odds UPDATE (single-table, by type — no RPC)
 *
 * Data flow follows the page's server-fetch + router.refresh() pattern: every
 * mutation resolves through a client write then router.refresh() re-runs the
 * server fetch. No useSWR, no separate hook (per the binding override).
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Briefcase } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { supabaseErrorMessage } from "@/lib/crm/opportunity-form";
import type { OpportunityV } from "@/lib/types/database";
import { OpportunityCockpitStrip } from "./opportunity-cockpit-strip";
import { OpportunityCard } from "./opportunity-card";
import { AddOpportunityDialog } from "./add-opportunity-dialog";
import { PromoteOpportunityDialog } from "./promote-opportunity-dialog";
import { AdvanceStageDialog } from "./advance-stage-dialog";
import { LostOpportunityDialog } from "./lost-opportunity-dialog";

export function OpportunitiesSection({
  opportunities,
}: {
  opportunities: OpportunityV[];
}) {
  const router = useRouter();

  // Section list shows ONLY open rows; the cockpit strip reads the full set
  // (it needs converted/lost rows for conversion + loss rates).
  const openOpps = useMemo(
    () =>
      opportunities
        .filter((o) => o.status === "open")
        .sort((a, b) => {
          // expected_close_date ASC NULLS LAST
          const ax = a.expected_close_date;
          const bx = b.expected_close_date;
          if (ax !== bx) {
            if (ax == null) return 1;
            if (bx == null) return -1;
            return ax < bx ? -1 : 1;
          }
          // then opportunity_date DESC
          if (a.opportunity_date === b.opportunity_date) return 0;
          return a.opportunity_date > b.opportunity_date ? -1 : 1;
        }),
    [opportunities],
  );

  const [addOpen, setAddOpen] = useState(false);
  const [promoteOpp, setPromoteOpp] = useState<OpportunityV | null>(null);
  const [advanceOpp, setAdvanceOpp] = useState<OpportunityV | null>(null);
  const [lostOpp, setLostOpp] = useState<OpportunityV | null>(null);

  // ── Inline close-odds UPDATE — single-table, by opportunity type ────────
  const handleCloseOddsChange = async (o: OpportunityV, oddsFraction: number) => {
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      let table: string;
      let column: string;
      switch (o.opportunity_type) {
        case "listing_appointment":
          table = "listing_appointments";
          column = "close_odds_pct";
          break;
        case "buyer_prospect":
          table = "pipeline_deals";
          column = "probability_override";
          break;
        case "referral":
          table = "referral_opportunities";
          column = "close_odds_pct";
          break;
      }

      const { error } = await supabase
        .from(table)
        .update({ [column]: oddsFraction })
        .eq("id", o.id)
        .eq("user_id", user.id);
      if (error) throw error;
      toast.success("Close odds updated.");
      router.refresh();
    } catch (err) {
      toast.error(supabaseErrorMessage(err, "Failed to update odds."));
      console.error(err);
    }
  };

  return (
    <section className="space-y-4">
      {/* ── KPI cockpit strip (reads the full opportunity set) ────────── */}
      <OpportunityCockpitStrip opportunities={opportunities} />

      {/* ── Section header ────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold tracking-tight text-foreground">
            Opportunities
          </h2>
          <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground tabular-nums">
            {openOpps.length}
          </span>
        </div>
        <Button size="sm" onClick={() => setAddOpen(true)} className="gap-1.5">
          <Plus className="h-4 w-4" />
          Add Opportunity
        </Button>
      </div>

      {/* ── Cards / empty state ───────────────────────────────────────── */}
      {openOpps.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/50 px-4 py-10 text-center">
          <Briefcase className="mb-3 h-8 w-8 text-muted-foreground/40" />
          <p className="max-w-md text-sm text-muted-foreground">
            No open opportunities. Log a listing appointment, buyer prospect
            call, or referral to start tracking your pre-pipeline activity.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {openOpps.map((o) => (
            <OpportunityCard
              key={`${o.opportunity_type}:${o.id}`}
              opportunity={o}
              onPromote={setPromoteOpp}
              onAdvance={setAdvanceOpp}
              onLost={setLostOpp}
              onCloseOddsChange={handleCloseOddsChange}
            />
          ))}
        </div>
      )}

      {/* ── Dialogs ───────────────────────────────────────────────────── */}
      <AddOpportunityDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onSaved={() => router.refresh()}
      />
      <PromoteOpportunityDialog
        opportunity={promoteOpp}
        open={promoteOpp !== null}
        onOpenChange={(o) => !o && setPromoteOpp(null)}
        onPromoted={() => {
          setPromoteOpp(null);
          router.refresh();
        }}
      />
      <AdvanceStageDialog
        opportunity={advanceOpp}
        open={advanceOpp !== null}
        onOpenChange={(o) => !o && setAdvanceOpp(null)}
        onAdvanced={() => {
          setAdvanceOpp(null);
          router.refresh();
        }}
      />
      <LostOpportunityDialog
        opportunity={lostOpp}
        open={lostOpp !== null}
        onOpenChange={(o) => !o && setLostOpp(null)}
        onLost={() => {
          setLostOpp(null);
          router.refresh();
        }}
      />
    </section>
  );
}
