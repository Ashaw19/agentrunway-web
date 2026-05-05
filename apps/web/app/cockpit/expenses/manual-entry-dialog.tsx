"use client";

/**
 * ManualEntryDialog (Deliverable 1 stub)
 *
 * Phase 0 Day 2 deliverable boundary: the trigger + dialog shell land here in
 * Deliverable 1 so the actions bar typechecks; the full form (vendor
 * autocomplete, account dropdown, sred toggle, pre_incorp toggle, payment
 * method, INSERT against corp_transactions) lands in Deliverable 2's commit.
 */

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type {
  CorpChartOfAccount,
  CorpVendor,
} from "@agent-runway/core/types/database";

interface Props {
  open:     boolean;
  onClose:  () => void;
  onSaved:  () => void;
  coa:      CorpChartOfAccount[];
  vendors:  CorpVendor[];
}

export function ManualEntryDialog({ open, onClose, coa, vendors }: Props) {
  // Reference the props so the unused-variable rules don't complain in the
  // stub stage.  Deliverable 2 wires everything below.
  void coa;
  void vendors;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add transaction</DialogTitle>
        </DialogHeader>
        <p className="text-muted-foreground py-4 text-sm">
          Manual entry form lands in the next commit.
        </p>
      </DialogContent>
    </Dialog>
  );
}
