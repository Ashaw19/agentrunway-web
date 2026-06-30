"use client";

/**
 * Promote dialog — for listing_appointment and referral opportunities only.
 * (buyer_prospect uses advance-stage-dialog instead.)
 *
 * Writes go through the Phase C Postgres RPCs (migration 00157), never a
 * direct multi-table write, so promote can't half-fail:
 *   - listing_appointment → fn_promote_listing_appointment(p_listing_id)
 *   - referral            → fn_promote_referral(p_referral_id, p_target, p_buyer_stage)
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
import { fmtCurrency } from "@/lib/formatters";
import { supabaseErrorMessage } from "@/lib/crm/opportunity-form";
import type { OpportunityV } from "@/lib/types/database";

type ReferralTarget = "buyer_prospect" | "listing_appointment";

export function PromoteOpportunityDialog({
  opportunity,
  open,
  onOpenChange,
  onPromoted,
}: {
  opportunity: OpportunityV | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPromoted: () => void;
}) {
  const [saving, setSaving] = useState(false);
  // Referral-only: which shape to convert into. Default buyer_prospect.
  const [target, setTarget] = useState<ReferralTarget>("buyer_prospect");

  if (!opportunity) return null;

  const isReferral = opportunity.opportunity_type === "referral";
  const estGci =
    (opportunity.estimated_price ?? 0) * (opportunity.estimated_commission_pct ?? 0);

  const handlePromote = async () => {
    setSaving(true);
    try {
      const supabase = createClient();
      if (isReferral) {
        // RPC maps the referral target to listing_appointment OR buyer_prospect.
        // Buyer-target prospects are created at stage 'lead' (RPC default).
        const { error } = await supabase.rpc("fn_promote_referral", {
          p_referral_id: opportunity.id,
          p_target: target,
          p_buyer_stage: "lead",
        });
        if (error) {
          toast.error(error.message);
          return;
        }
        toast.success(
          target === "listing_appointment"
            ? "Referral promoted to a listing appointment."
            : "Referral promoted to a buyer prospect.",
        );
      } else {
        const { error } = await supabase.rpc("fn_promote_listing_appointment", {
          p_listing_id: opportunity.id,
        });
        if (error) {
          toast.error(error.message);
          return;
        }
        toast.success("Listing appointment promoted to a pipeline deal.");
      }
      onOpenChange(false);
      onPromoted();
    } catch (err) {
      toast.error(supabaseErrorMessage(err, "Failed to promote."));
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isReferral ? "Promote Referral" : "Promote Listing Appointment"}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-1">
          <div className="rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-sm">
            <p className="font-medium text-foreground">{opportunity.title}</p>
            <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
              {fmtCurrency(opportunity.estimated_price ?? 0)} · Est. GCI{" "}
              {fmtCurrency(estGci)}
            </p>
          </div>

          {isReferral ? (
            <div className="grid gap-2">
              <p className="text-sm text-muted-foreground">Convert this referral to:</p>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    { v: "buyer_prospect", label: "Buyer Prospect" },
                    { v: "listing_appointment", label: "Listing Appointment" },
                  ] as Array<{ v: ReferralTarget; label: string }>
                ).map((opt) => (
                  <button
                    key={opt.v}
                    type="button"
                    onClick={() => setTarget(opt.v)}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                      target === opt.v
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border text-muted-foreground hover:bg-muted/50",
                    )}
                    aria-pressed={target === opt.v}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              This creates a seller-side pipeline deal and marks the appointment
              as active. The appointment stays the canonical record for this
              opportunity.
            </p>
          )}

          <Button onClick={handlePromote} disabled={saving}>
            {saving ? "Promoting…" : "Promote"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
