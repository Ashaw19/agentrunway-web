"use client";

/**
 * Lost dialog — marks any opportunity type lost via the Phase C RPC
 * fn_mark_opportunity_lost(p_id, p_source, p_lost_reason, p_notes).
 *
 * p_source is the SAME string as OpportunityV.opportunity_type
 * (listing_appointment | buyer_prospect | referral) — pass through directly.
 * Notes are required when reason='other' (submit disabled otherwise).
 */

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { supabaseErrorMessage } from "@/lib/crm/opportunity-form";
import {
  OPPORTUNITY_LOSS_REASONS,
  lossReasonLabel,
  type OpportunityLossReason,
} from "@/lib/opportunity-loss-reasons";
import type { OpportunityV } from "@/lib/types/database";

export function LostOpportunityDialog({
  opportunity,
  open,
  onOpenChange,
  onLost,
}: {
  opportunity: OpportunityV | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLost: () => void;
}) {
  const [reason, setReason] = useState<OpportunityLossReason>("chose_other_agent");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  if (!opportunity) return null;

  const notesRequired = reason === "other";
  const submitDisabled = saving || (notesRequired && notes.trim() === "");

  const handleConfirm = async () => {
    if (notesRequired && notes.trim() === "") {
      toast.error("Notes are required when the reason is Other.");
      return;
    }
    setSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.rpc("fn_mark_opportunity_lost", {
        p_id: opportunity.id,
        // p_source uses the SAME three strings as opportunity_type.
        p_source: opportunity.opportunity_type,
        p_lost_reason: reason,
        p_notes: notes.trim() || null,
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Opportunity marked lost.");
      setNotes("");
      setReason("chose_other_agent");
      onOpenChange(false);
      onLost();
    } catch (err) {
      toast.error(supabaseErrorMessage(err, "Failed to mark lost."));
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-md">
        <DialogHeader>
          <DialogTitle>Mark Opportunity Lost</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-1">
          <div className="rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-sm">
            <p className="font-medium text-foreground">{opportunity.title}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Lost is terminal — this opportunity stops contributing to the
              forecast.
            </p>
          </div>

          <div className="grid gap-1.5">
            <Label>Reason</Label>
            <Select
              value={reason}
              onValueChange={(v) => setReason(v as OpportunityLossReason)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OPPORTUNITY_LOSS_REASONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {lossReasonLabel(r)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label>
              Notes {notesRequired && <span className="text-red-500">*</span>}
            </Label>
            <Textarea
              rows={3}
              placeholder={
                notesRequired ? "Required when reason is Other…" : "Optional context…"
              }
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={submitDisabled}
          >
            {saving ? "Saving…" : "Mark Lost"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
