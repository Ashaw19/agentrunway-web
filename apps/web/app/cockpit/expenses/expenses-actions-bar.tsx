"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { Plus, Upload } from "lucide-react";
import type {
  CorpChartOfAccount,
  CorpVendor,
} from "@agent-runway/core/types/database";
import { ManualEntryDialog } from "./manual-entry-dialog";

// Receipt dialog only matters once the user clicks Upload, so we lazy-load it
// to keep the cockpit shell light.  ssr:false matches the realtor-flow usage
// at apps/web/app/(app)/expenses/expenses-content.tsx.
const ReceiptCaptureDialog = dynamic(
  () =>
    import("@/components/receipt-capture-dialog").then(
      (m) => m.ReceiptCaptureDialog,
    ),
  { ssr: false },
);

interface Props {
  coa:     CorpChartOfAccount[];
  vendors: CorpVendor[];
}

export function ExpensesActionsBar({ coa, vendors }: Props) {
  const router = useRouter();
  const [manualOpen,  setManualOpen]  = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);

  // After either entry path saves, refresh the server component so the new
  // row appears at the top of the table without a hard reload.
  const handleSaved = () => {
    router.refresh();
  };

  return (
    <div className="flex flex-shrink-0 items-center gap-2">
      <Button
        size="sm"
        variant="outline"
        onClick={() => setCaptureOpen(true)}
        className="gap-1.5"
      >
        <Upload className="h-3.5 w-3.5" aria-hidden />
        Upload receipt
      </Button>
      <Button
        size="sm"
        onClick={() => setManualOpen(true)}
        className="gap-1.5"
      >
        <Plus className="h-3.5 w-3.5" aria-hidden />
        Add transaction
      </Button>

      <ManualEntryDialog
        open={manualOpen}
        onClose={() => setManualOpen(false)}
        onSaved={handleSaved}
        coa={coa}
        vendors={vendors}
      />

      <ReceiptCaptureDialog
        open={captureOpen}
        onClose={() => setCaptureOpen(false)}
        onSaved={handleSaved}
        context="corporate"
      />
    </div>
  );
}
