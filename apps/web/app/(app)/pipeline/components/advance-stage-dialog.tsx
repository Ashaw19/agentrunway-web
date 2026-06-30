"use client";

/**
 * Advance Stage dialog — buyer_prospect opportunities only.
 *
 * A buyer prospect is already a pipeline_deals row (side='buyer', stage in
 * lead/showing). Advancing it past 'showing' reclassifies the row as
 * 'converted' in opportunities_v, which removes it from the Opportunities
 * section and surfaces it in the regular pipeline. Write goes through the
 * Phase C RPC fn_advance_buyer_stage(p_deal_id, p_stage).
 */

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { OpportunityV } from "@/lib/types/database";

type AdvanceStage = "offer" | "conditional" | "firm";

const STAGES: Array<{ v: AdvanceStage; label: string; hint: string }> = [
  { v: "offer", label: "Offer", hint: "Offer submitted" },
  { v: "conditional", label: "Conditional", hint: "Under conditions" },
  { v: "firm", label: "Firm", hint: "Conditions cleared" },
];

export function AdvanceStageDialog({
  opportunity,
  open,
  onOpenChange,
  onAdvanced,
}: {
  opportunity: OpportunityV | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdvanced: () => void;
}) {
  const [stage, setStage] = useState<AdvanceStage>("offer");
  const [saving, setSaving] = useState(false);

  if (!opportunity) return null;

  const handleAdvance = async () => {
    setSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.rpc("fn_advance_buyer_stage", {
        p_deal_id: opportunity.id,
        p_stage: stage,
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success(`Advanced to ${stage}.`);
      onOpenChange(false);
      onAdvanced();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to advance stage.");
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-md">
        <DialogHeader>
          <DialogTitle>Advance Buyer Prospect</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-1">
          <div className="rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-sm">
            <p className="font-medium text-foreground">{opportunity.title}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Advancing moves this into the active pipeline and out of
              Opportunities.
            </p>
          </div>

          <div className="grid gap-2" role="radiogroup" aria-label="Advance to stage">
            {STAGES.map((s) => (
              <button
                key={s.v}
                type="button"
                role="radio"
                aria-checked={stage === s.v}
                onClick={() => setStage(s.v)}
                className={cn(
                  "flex items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                  stage === s.v
                    ? "border-primary bg-primary/10"
                    : "border-border hover:bg-muted/50",
                )}
              >
                <span className="font-medium text-foreground">{s.label}</span>
                <span className="text-xs text-muted-foreground">{s.hint}</span>
              </button>
            ))}
          </div>

          <Button onClick={handleAdvance} disabled={saving}>
            {saving ? "Advancing…" : "Advance Stage"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
